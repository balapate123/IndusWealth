/**
 * Goal pace — pure.
 *
 * `target_date` has been stored, sorted on and displayed since goals shipped,
 * and nothing ever computed a rate from it. Every goal answered *how much have
 * I saved* and none answered **am I going to make it**, which is the only
 * question a deadline implies.
 *
 * Two rates and a date:
 *   required  what is left, over the time left
 *   actual    what has gone in, over how long we have been watching
 *   projected where the actual rate lands, if nothing changes
 *
 * The measurement window is deliberately the same one the progress bar uses —
 * everything since `baseline_at` — rather than a rolling 90 days. A rolling
 * window would need dated inflows for account-tracked goals, and we do not have
 * them: `accounts.current_balance` is a single point in time with no history
 * behind it. Reading transactions on the linked account would be a second,
 * differently-derived answer sitting next to the first, and the two would
 * disagree. One window means the projected date always lands exactly where the
 * progress bar implies it should.
 *
 * The cost of that choice is a lifetime average, which flatters a goal somebody
 * fed hard in October and abandoned in November. `lastContributionAt` is what
 * catches it — see STALE_CONTRIBUTION_DAYS.
 *
 * `today` is injected, so "you are $40 a month behind" is an assertion rather
 * than something that drifts with the calendar. Same reasoning as recurrence.js
 * and watch.js: no pool, no clock, no network.
 */

/**
 * 365.25 / 12.
 *
 * Used on both sides of the comparison. A 30-day month on one side and calendar
 * months on the other puts a 1.5% bias into every delta — small, permanent, and
 * always pointing the same way.
 */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * How long a goal must have been measured before we quote its pace.
 *
 * Ten days and one $500 contribution extrapolates to $1,522 a month. That is
 * arithmetic, not evidence. A month covers a full pay cycle, so a monthly saver
 * is inside the window with one contribution to their name.
 *
 * The same gate, for the same reason, as the two-sightings rule on insight
 * persistence: a true number that is ridiculous on day one spends the
 * credibility of every later one.
 */
const MIN_OBSERVATION_DAYS = 30;

/**
 * Inside this many days of the target, quote the amount rather than a rate.
 *
 * "$3,000 a month" to somebody with twelve days left is a unit they cannot act
 * in. The lump sum and the date are the actionable pair.
 */
const DUE_SOON_DAYS = 30;

/**
 * How long a manual goal can go unfed before its average stops meaning anything.
 *
 * Longer than a month on purpose: somebody who contributes on the 1st is 31
 * days stale on the 1st, and a 30-day cutoff would call every monthly saver
 * stalled, once a month, forever.
 */
const STALE_CONTRIBUTION_DAYS = 45;

/**
 * Bands around the required pace.
 *
 * Narrow below and generous above. A goal a few percent short of its required
 * pace is not worth telling somebody they are failing at; one comfortably ahead
 * has earned being told. The asymmetry is the never-scold rule the insights
 * prompt enforces, applied to our own copy.
 */
const ON_TRACK_RATIO = 0.95;
const AHEAD_RATIO = 1.15;

/**
 * Beyond ten years, report no date at all.
 *
 * $1 a quarter against $3,000 remaining projects to the year 2766. It is
 * technically the answer and it makes the whole screen look broken.
 */
const MAX_PROJECTION_DAYS = 3650;

/**
 * The verdict. Closed, like every other enum in this codebase — a state nothing
 * produces is a branch nothing tests, and the reachability test at the bottom
 * of goal_pace.test.js asserts each one is a real answer to a real goal.
 */
const PACE_STATE = {
    /** No usable target, or a goal whose account is gone. No figures at all. */
    UNMEASURABLE: 'unmeasurable',
    /** Already there. */
    ACHIEVED: 'achieved',
    /** The target date has passed and the goal has not. */
    OVERDUE: 'overdue',
    /** Under a month left: the amount, not a rate. */
    DUE_SOON: 'due_soon',
    /** No deadline to be measured against, but the pace is still worth knowing. */
    NO_TARGET_DATE: 'no_target_date',
    /** Not watched long enough to have a rate. */
    TOO_EARLY: 'too_early',
    /** Nothing is going in, or the average has gone stale. */
    STALLED: 'stalled',
    BEHIND: 'behind',
    ON_TRACK: 'on_track',
    AHEAD: 'ahead',
};

// ---------------------------------------------------------------------------

/**
 * The calendar day a value refers to, as UTC midnight. Null when it is not a
 * day at all.
 *
 * Accepts a Date as well as a string because that is what actually arrives:
 * node-postgres parses DATE and TIMESTAMPTZ columns into Date objects, so
 * `baseline_at`, `target_date` and `last_contribution_at` are never the strings
 * they look like in the schema. String(date) yields "Wed Aug 20 2026 ...",
 * whose first ten characters split on "-" into nothing — every goal read from
 * the database would report no observation window and fall back to "too early
 * to tell", permanently and without erroring.
 *
 * Local components on purpose. pg builds a DATE as local midnight, so its UTC
 * components are the previous day anywhere east of Greenwich.
 */
function parseDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }

    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------

/**
 * Where a goal stands, and where it is heading.
 *
 * Everything it needs is already on the goal row: `saved_amount` and
 * `progress_percent` are computed in SQL, `baseline_at` is when measurement
 * started, and `last_contribution_at` was added for the check-in nudge.
 *
 * @param {number}      targetAmount
 * @param {number|null} savedAmount        null when the linked account is gone
 * @param {string|null} targetDate
 * @param {string|null} measuringSince     goals.baseline_at
 * @param {string|null} lastContributionAt manual goals only
 * @param {string}      trackingMode       'account' | 'manual'
 * @param {string}      today              'YYYY-MM-DD'
 */
function computeGoalPace({
    targetAmount,
    savedAmount,
    targetDate = null,
    measuringSince = null,
    lastContributionAt = null,
    trackingMode = 'manual',
    today,
}) {
    const now = parseDate(today);
    const target = Number(targetAmount);

    const nothing = {
        state: PACE_STATE.UNMEASURABLE,
        remaining: null,
        daysRemaining: null,
        observedDays: null,
        daysSinceContribution: null,
        requiredPerMonth: null,
        actualPerMonth: null,
        deltaPerMonth: null,
        projectedDate: null,
    };

    if (!now || !Number.isFinite(target) || target <= 0) return nothing;

    // Distinct from zero. An account-tracked goal whose account was
    // disconnected has an unknown pace, not a stalled one, and reporting "$0 a
    // month, you are behind" would be a confident measurement of something we
    // cannot see. Same failure as inferring tracking_mode from a null FK.
    if (savedAmount === null || savedAmount === undefined) return nothing;

    const saved = Number(savedAmount);
    if (!Number.isFinite(saved)) return nothing;

    // How long we have been watching. Null when we never started, zero when the
    // start is somehow in the future — either way, not a divisor.
    const since = parseDate(measuringSince);
    const observedDays = since ? Math.max(0, daysBetween(since, now)) : null;

    const actualPerMonth = observedDays !== null && observedDays >= MIN_OBSERVATION_DAYS
        ? round2((saved * DAYS_PER_MONTH) / observedDays)
        : null;

    const remaining = round2(Math.max(target - saved, 0));

    const targetOn = parseDate(targetDate);
    const daysRemaining = targetOn ? daysBetween(now, targetOn) : null;

    // ---- what is left to do ------------------------------------------------

    if (remaining <= 0) {
        return {
            ...nothing,
            state: PACE_STATE.ACHIEVED,
            remaining,
            daysRemaining,
            observedDays,
            actualPerMonth,
        };
    }

    // ---- is the rate real ---------------------------------------------------

    // goal_contributions is only consulted for manual goals, so an
    // account-tracked goal always has a null last contribution. Applying
    // staleness to it would mark every one of them stalled.
    const lastAt = trackingMode === 'manual' ? parseDate(lastContributionAt) : null;
    // Surfaced so the copy can be specific. "No contributions in 8 weeks" is a
    // fact the user can act on; "this goal has stalled" is a verdict on them.
    const daysSinceContribution = lastAt ? daysBetween(lastAt, now) : null;
    const stale = daysSinceContribution !== null && daysSinceContribution > STALE_CONTRIBUTION_DAYS;
    const stopped = actualPerMonth !== null && actualPerMonth <= 0;
    const stalled = stale || stopped;

    // Projected from the raw figures rather than the rounded rate, so the date
    // does not drift by a day on large targets. remaining / actual * a month
    // reduces to remaining / saved * observedDays.
    let projectedDate = null;
    if (!stalled && actualPerMonth !== null && saved > 0) {
        const days = Math.ceil((remaining / saved) * observedDays);
        if (days <= MAX_PROJECTION_DAYS) {
            projectedDate = formatDate(new Date(now.getTime() + days * 86400000));
        }
    }

    const result = {
        state: PACE_STATE.NO_TARGET_DATE,
        remaining,
        daysRemaining,
        observedDays,
        daysSinceContribution,
        requiredPerMonth: null,
        actualPerMonth,
        deltaPerMonth: null,
        projectedDate,
    };

    // ---- measured against what --------------------------------------------

    if (daysRemaining === null) {
        if (stalled) result.state = PACE_STATE.STALLED;
        else if (actualPerMonth === null) result.state = PACE_STATE.TOO_EARLY;
        return result;
    }

    // Dividing by a negative number of days yields a negative monthly
    // requirement, which renders as a cheerful "-$420/mo".
    if (daysRemaining < 0) {
        result.state = PACE_STATE.OVERDUE;
        return result;
    }

    if (daysRemaining < DUE_SOON_DAYS) {
        result.state = PACE_STATE.DUE_SOON;
        return result;
    }

    result.requiredPerMonth = round2((remaining * DAYS_PER_MONTH) / daysRemaining);

    if (stalled) {
        result.state = PACE_STATE.STALLED;
        return result;
    }
    if (actualPerMonth === null) {
        result.state = PACE_STATE.TOO_EARLY;
        return result;
    }

    // From the rounded figures, so the delta the user reads is exactly the
    // difference between the two numbers shown beside it.
    result.deltaPerMonth = round2(actualPerMonth - result.requiredPerMonth);

    const ratio = actualPerMonth / result.requiredPerMonth;
    if (ratio >= AHEAD_RATIO) result.state = PACE_STATE.AHEAD;
    else if (ratio >= ON_TRACK_RATIO) result.state = PACE_STATE.ON_TRACK;
    else result.state = PACE_STATE.BEHIND;

    return result;
}

module.exports = {
    PACE_STATE,
    DAYS_PER_MONTH,
    MIN_OBSERVATION_DAYS,
    DUE_SOON_DAYS,
    STALE_CONTRIBUTION_DAYS,
    ON_TRACK_RATIO,
    AHEAD_RATIO,
    MAX_PROJECTION_DAYS,
    computeGoalPace,
};
