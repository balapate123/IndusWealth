/**
 * Run with:  npm test   (from packages/backend)
 *
 * Every goal already answers *how much have I saved*. None answers **am I going
 * to make it**, which is the only question a target date implies.
 *
 * Pure, like recurrence.js and watch.js — `today` is injected, so "you are $40
 * a month behind" is an assertion rather than something that drifts with the
 * calendar.
 *
 * The rule the whole module exists to protect: **a rate we cannot measure is
 * not reported as zero.** A goal whose account was disconnected has an unknown
 * pace, not a stalled one, and a goal created last Tuesday has no pace at all.
 * Both were the shape of the `tracking_mode` bug — an inferred value that reads
 * as a real measurement of nothing.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    PACE_STATE,
    DAYS_PER_MONTH,
    MIN_OBSERVATION_DAYS,
    DUE_SOON_DAYS,
    STALE_CONTRIBUTION_DAYS,
    computeGoalPace,
} = require('../src/services/goal_pace');

const TODAY = '2026-01-01';

/**
 * $5,000 target, $2,000 saved over the 90 days since 2025-10-03.
 *
 * 2000 x 30.4375 / 90 = $676.39 a month, which is the actual pace every case
 * below is measured against unless it overrides it.
 */
const goal = (over = {}) => ({
    targetAmount: 5000,
    savedAmount: 2000,
    targetDate: '2026-05-24',
    measuringSince: '2025-10-03',
    trackingMode: 'manual',
    lastContributionAt: '2025-12-28',
    ...over,
});

const pace = (over = {}) => computeGoalPace({ ...goal(over), today: TODAY });

// ---------------------------------------------------------------------------
// What we refuse to say
// ---------------------------------------------------------------------------

test('a goal whose account is gone has no pace, not a pace of zero', () => {
    // saved_amount comes back NULL for an account-tracked goal whose account was
    // disconnected. Reporting "$0/mo, you are behind" would be a confident
    // measurement of something we cannot see -- the same failure as inferring
    // tracking_mode from account_id being null.
    const p = pace({ savedAmount: null });

    assert.equal(p.state, PACE_STATE.UNMEASURABLE);
    assert.equal(p.requiredPerMonth, null);
    assert.equal(p.actualPerMonth, null);
    assert.equal(p.deltaPerMonth, null);
    assert.equal(p.projectedDate, null);
});

test('a goal younger than the observation window quotes no actual pace', () => {
    // Ten days and one $500 contribution extrapolates to $1,522 a month, which
    // is arithmetic, not evidence. Same gate, and the same reason, as the
    // 2-sightings rule on insight persistence: a true number that is ridiculous
    // on day one spends the credibility of every later one.
    const p = pace({ measuringSince: '2025-12-22', savedAmount: 500 });

    assert.equal(p.state, PACE_STATE.TOO_EARLY);
    assert.equal(p.actualPerMonth, null);
    assert.equal(p.projectedDate, null);
});

test('but it still says what the goal requires, because that needs no history', () => {
    // The required pace is a property of the target and the deadline. It is
    // knowable on the day the goal is created and withholding it would be
    // withholding the more useful half.
    const p = pace({ measuringSince: '2025-12-22', savedAmount: 500 });
    assert.ok(p.requiredPerMonth > 0, 'required pace was suppressed with the actual one');
});

test('the observation floor is a month, so a full pay cycle is inside it', () => {
    assert.equal(MIN_OBSERVATION_DAYS, 30);

    const justUnder = pace({ measuringSince: '2025-12-03' }); // 29 days
    const justOver = pace({ measuringSince: '2025-12-02' }); // 30 days
    assert.equal(justUnder.actualPerMonth, null);
    assert.ok(justOver.actualPerMonth > 0);
});

// ---------------------------------------------------------------------------
// The two rates
// ---------------------------------------------------------------------------

test('required pace is what is left divided by the time left', () => {
    // $3,000 left, 143 days to 2026-05-24.
    // 3000 x 30.4375 / 143 = 638.55
    const p = pace();
    assert.equal(p.remaining, 3000);
    assert.equal(p.daysRemaining, 143);
    assert.equal(p.requiredPerMonth, 638.55);
});

test('actual pace is what went in divided by how long we have watched', () => {
    // 2000 x 30.4375 / 90 = 676.39
    const p = pace();
    assert.equal(p.observedDays, 90);
    assert.equal(p.actualPerMonth, 676.39);
});

test('a month is 30.4375 days on both sides, so the comparison is like for like', () => {
    // 365.25 / 12. Using calendar months on one side and a 30-day month on the
    // other would put a 1.5% bias into every delta -- small, permanent, and
    // pointing the same way every time.
    assert.equal(DAYS_PER_MONTH, 365.25 / 12);
});

test('the delta is actual minus required, so behind reads negative', () => {
    const p = pace();
    assert.equal(p.deltaPerMonth, Math.round((676.39 - 638.55) * 100) / 100);
    assert.ok(p.deltaPerMonth > 0, 'saving faster than required should read positive');
});

test('there is no delta when either side is unknown', () => {
    assert.equal(pace({ targetDate: null }).deltaPerMonth, null);
    assert.equal(pace({ measuringSince: '2025-12-22' }).deltaPerMonth, null);
});

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

test('saving faster than required is on track', () => {
    // 676.39 against 638.55 -- 5.9% ahead, inside the band.
    assert.equal(pace().state, PACE_STATE.ON_TRACK);
});

test('comfortably faster is ahead, and says so', () => {
    // 2026-07-01 is 181 days out: 3000 x 30.4375 / 181 = 504.49, and 676.39 is
    // 34% above that.
    const p = pace({ targetDate: '2026-07-01' });
    assert.equal(p.state, PACE_STATE.AHEAD);
    assert.ok(p.deltaPerMonth > 0);
});

test('slower than required is behind, by a number the user can act on', () => {
    // 2026-03-02 is 60 days out: 3000 x 30.4375 / 60 = 1521.88 against 676.39.
    const p = pace({ targetDate: '2026-03-02' });
    assert.equal(p.state, PACE_STATE.BEHIND);
    assert.equal(p.requiredPerMonth, 1521.88);
    assert.equal(p.deltaPerMonth, Math.round((676.39 - 1521.88) * 100) / 100);
});

test('the band around on-track is narrow below and generous above', () => {
    // A goal a few percent short of its required pace is not worth telling
    // somebody they are failing at; one comfortably ahead has earned being
    // told. Asymmetric on purpose -- the never-scold rule the insights prompt
    // enforces applies to our own copy too.
    //
    // Both sides of the lower edge, or the band is not load-bearing: with only
    // the inside case, widening the tolerance to 50% still passes.
    const inside = pace({ targetDate: '2026-05-10' });  // required 707.85, ratio 0.956
    const outside = pace({ targetDate: '2026-05-08' }); // required 718.99, ratio 0.941

    assert.equal(inside.state, PACE_STATE.ON_TRACK);
    assert.equal(outside.state, PACE_STATE.BEHIND);
});

test('a goal already at its target is achieved, and asks for nothing', () => {
    const p = pace({ savedAmount: 5000 });
    assert.equal(p.state, PACE_STATE.ACHIEVED);
    assert.equal(p.remaining, 0);
    assert.equal(p.requiredPerMonth, null);
});

test('overshooting does not produce a negative requirement', () => {
    const p = pace({ savedAmount: 6200 });
    assert.equal(p.state, PACE_STATE.ACHIEVED);
    assert.equal(p.remaining, 0);
});

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

test('inside the last month we quote the amount, not a monthly rate', () => {
    // "$3,000 a month" to somebody with twelve days left is a unit nobody can
    // act in. The lump sum and the date are the actionable pair.
    const p = pace({ targetDate: '2026-01-13' });
    assert.equal(p.state, PACE_STATE.DUE_SOON);
    assert.equal(p.requiredPerMonth, null);
    assert.equal(p.remaining, 3000);
    assert.equal(p.daysRemaining, 12);
});

test('the cutoff for that is a month', () => {
    assert.equal(DUE_SOON_DAYS, 30);
    assert.equal(pace({ targetDate: '2026-01-30' }).state, PACE_STATE.DUE_SOON); // 29 days
    assert.notEqual(pace({ targetDate: '2026-01-31' }).state, PACE_STATE.DUE_SOON); // 30
});

test('the target date being today is due soon, not overdue', () => {
    const p = pace({ targetDate: TODAY });
    assert.equal(p.state, PACE_STATE.DUE_SOON);
    assert.equal(p.daysRemaining, 0);
});

test('a passed target date is overdue and stops quoting a required rate', () => {
    // Dividing by a negative number of days remaining yields a negative monthly
    // requirement, which renders as a cheerful "-$420/mo".
    const p = pace({ targetDate: '2025-11-15' });
    assert.equal(p.state, PACE_STATE.OVERDUE);
    assert.equal(p.requiredPerMonth, null);
    assert.ok(p.daysRemaining < 0);
});

test('a goal with no target date still reports pace and a projection', () => {
    // Most goals are created without a date. "You are putting away $676 a month
    // and will get there in May" is the entire feature for them.
    const p = pace({ targetDate: null });
    assert.equal(p.state, PACE_STATE.NO_TARGET_DATE);
    assert.equal(p.requiredPerMonth, null);
    assert.equal(p.actualPerMonth, 676.39);
    assert.equal(p.daysRemaining, null);
    assert.ok(p.projectedDate);
});

// ---------------------------------------------------------------------------
// Stalling — the failure a lifetime average hides
// ---------------------------------------------------------------------------

test('a manual goal nobody has fed in weeks is stalled, however good the average', () => {
    // The average is measured since the goal began, so a burst of saving in
    // October still reads as $676/mo in January. last_contribution_at is
    // already in the goal query -- the check-in nudge uses it -- and it is what
    // separates "saving steadily" from "saved once, then stopped".
    const p = pace({ lastContributionAt: '2025-11-01' });
    assert.equal(p.state, PACE_STATE.STALLED);
    assert.equal(p.projectedDate, null, 'projected from a rate that stopped');
});

test('how long it has been is reported, so the copy can be specific', () => {
    // "No contributions in 8 weeks" is a fact somebody can act on. "This goal
    // has stalled" is a verdict on them, and the never-scold rule applies to
    // our copy as much as to the model's.
    assert.equal(pace({ lastContributionAt: '2025-11-01' }).daysSinceContribution, 61);
    assert.equal(pace({ lastContributionAt: '2025-12-28' }).daysSinceContribution, 4);
});

test('an account-tracked goal reports no contribution age, because it has none', () => {
    // Reporting the age of a contribution row that is no longer how the goal is
    // measured would put "last topped up 8 weeks ago" under a balance that has
    // been climbing all along.
    assert.equal(
        pace({ trackingMode: 'account', lastContributionAt: '2025-06-01' }).daysSinceContribution,
        null
    );
});

test('the staleness cutoff is longer than a month, so monthly savers survive it', () => {
    // Somebody contributing on the 1st is 31 days stale on the 1st. A 30-day
    // cutoff would call every monthly saver stalled, once a month, forever.
    assert.ok(STALE_CONTRIBUTION_DAYS > 31);
    assert.equal(pace({ lastContributionAt: '2025-11-25' }).state, PACE_STATE.ON_TRACK); // 37 days
});

test('an account-tracked goal is not stalled by its old manual contributions', () => {
    // goal_contributions rows survive a switch to account tracking -- nothing
    // deletes them, and the goal query computes last_contribution_at with an
    // unconditional lateral -- so an account-tracked goal that used to be
    // manual carries a real, ancient contribution date. Applying staleness to
    // it would mark every converted goal stalled on evidence that stopped
    // being how the goal is measured.
    //
    // Passing null here instead would prove nothing: null is not stale under
    // either version of the rule.
    const converted = pace({ trackingMode: 'account', lastContributionAt: '2025-06-01' });
    assert.equal(converted.state, PACE_STATE.ON_TRACK);

    const neverManual = pace({ trackingMode: 'account', lastContributionAt: null });
    assert.equal(neverManual.state, PACE_STATE.ON_TRACK);
});

test('an account that has lost ground is stalled, and the loss is not hidden', () => {
    // saved_amount is deliberately not floored at zero upstream. A balance
    // below its baseline really has gone backwards.
    const p = pace({ trackingMode: 'account', lastContributionAt: null, savedAmount: -150 });
    assert.equal(p.state, PACE_STATE.STALLED);
    assert.ok(p.actualPerMonth < 0);
    assert.equal(p.projectedDate, null);
});

test('nothing saved at all is stalled rather than infinitely behind', () => {
    const p = pace({ savedAmount: 0, lastContributionAt: null });
    assert.equal(p.state, PACE_STATE.STALLED);
    assert.equal(p.projectedDate, null);
});

// ---------------------------------------------------------------------------
// The projection — the number people actually want
// ---------------------------------------------------------------------------

test('at this pace, you get there on this date', () => {
    // $3,000 left at the rate that produced $2,000 in 90 days is another 135
    // days: 2026-01-01 + 135 = 2026-05-16.
    assert.equal(pace().projectedDate, '2026-05-16');
});

test('the projection is silent when there is no rate to project from', () => {
    assert.equal(pace({ savedAmount: 0, lastContributionAt: null }).projectedDate, null);
    assert.equal(pace({ measuringSince: '2025-12-22' }).projectedDate, null);
    assert.equal(pace({ savedAmount: null }).projectedDate, null);
});

test('a rate too slow to mean anything projects nothing rather than a date in 2071', () => {
    // $1 in 90 days against $3,000 remaining is a date 740 years out. It is
    // technically the answer and it makes the whole screen look broken.
    const p = pace({ savedAmount: 1, measuringSince: '2025-10-03', lastContributionAt: '2025-12-28' });
    assert.equal(p.projectedDate, null);
});

test('the projection agrees with the verdict rather than contradicting it', () => {
    // Ahead of the required pace must never project a date after the target,
    // and behind must never project one before it. They are two views of one
    // number and a user who spots them disagreeing stops trusting both.
    const ahead = pace({ targetDate: '2026-07-01' });
    assert.equal(ahead.state, PACE_STATE.AHEAD);
    assert.ok(ahead.projectedDate < '2026-07-01', ahead.projectedDate);

    const behind = pace({ targetDate: '2026-03-02' });
    assert.equal(behind.state, PACE_STATE.BEHIND);
    assert.ok(behind.projectedDate > '2026-03-02', behind.projectedDate);
});

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

test('a missing measurement start falls back to no pace, not to today', () => {
    // measuringSince is baseline_at, which is backfilled from created_at, so it
    // is never null in practice. If it ever is, dividing by zero days observed
    // yields Infinity and every goal reads as wildly ahead.
    const p = pace({ measuringSince: null });
    assert.equal(p.actualPerMonth, null);
    assert.notEqual(p.state, PACE_STATE.AHEAD);
});

test('a measurement start in the future observes nothing', () => {
    const p = pace({ measuringSince: '2026-03-01' });
    assert.equal(p.actualPerMonth, null);
    assert.equal(p.observedDays, 0);
});

test('an unparseable target date is treated as no target date', () => {
    const p = pace({ targetDate: 'someday' });
    assert.equal(p.state, PACE_STATE.NO_TARGET_DATE);
    assert.equal(p.daysRemaining, null);
});

test('dates arrive from the database as Date objects, not strings', () => {
    // node-postgres parses DATE and TIMESTAMPTZ columns into Date objects, so
    // baseline_at, target_date and last_contribution_at are never the strings
    // the schema makes them look like. String(aDate) is "Wed Aug 20 2026 ...",
    // whose first ten characters split on "-" into nothing -- so every goal
    // read from the database reported no observation window and sat on "too
    // early to tell" forever, without erroring once. Found by the PGlite
    // harness; no amount of string fixtures would have shown it.
    //
    // Local-component constructors on purpose: that is exactly what pg builds
    // from a DATE, and reading its UTC components instead lands a day early
    // anywhere east of Greenwich.
    const p = computeGoalPace({
        targetAmount: 5000,
        savedAmount: 2000,
        targetDate: new Date(2026, 4, 24),
        measuringSince: new Date(2025, 9, 3),
        lastContributionAt: new Date(2025, 11, 28),
        trackingMode: 'manual',
        today: new Date(2026, 0, 1),
    });

    assert.equal(p.observedDays, 90);
    assert.equal(p.actualPerMonth, 676.39);
    assert.equal(p.requiredPerMonth, 638.55);
    assert.equal(p.state, PACE_STATE.ON_TRACK);
});

test('a timestamp counts as the local day it falls in, whatever the offset', () => {
    // baseline_at is a timestamptz, so it carries a time of day. Reading its
    // UTC components instead of its local ones shifts the calendar day by one
    // for half of every day -- late evening in the Americas, early morning in
    // Europe -- which silently moves the observation window and every figure
    // derived from it.
    //
    // Asserting both ends of the day is what makes this independent of where
    // the suite runs: a negative UTC offset only shows the fault in the
    // evening, a positive one only in the morning, and on a UTC host (Render)
    // neither does. One of the two always discriminates off-UTC.
    const observed = (hour) => computeGoalPace({
        targetAmount: 5000,
        savedAmount: 2000,
        measuringSince: new Date(2025, 9, 3, hour, 30),
        today: new Date(2026, 0, 1, 12, 0),
    }).observedDays;

    assert.equal(observed(1), 90, 'an early-morning timestamp slipped to the previous day');
    assert.equal(observed(23), 90, 'a late-evening timestamp slipped to the next day');
});

test('an invalid Date is refused rather than producing NaN figures', () => {
    const p = computeGoalPace({
        targetAmount: 5000,
        savedAmount: 2000,
        measuringSince: new Date('nonsense'),
        today: '2026-01-01',
    });
    assert.equal(p.actualPerMonth, null);
});

test('timestamps are accepted wherever dates are, since the column is one', () => {
    // baseline_at is a timestamptz and last_contribution_at comes back as a
    // date; both arrive as strings and neither should need the caller to trim.
    const p = pace({ measuringSince: '2025-10-03T14:22:09.481Z' });
    assert.equal(p.observedDays, 90);
    assert.equal(p.actualPerMonth, 676.39);
});

test('a goal with no target amount cannot be paced', () => {
    const p = pace({ targetAmount: 0 });
    assert.equal(p.state, PACE_STATE.UNMEASURABLE);
});

test('every state in the enum is reachable from a plausible goal', () => {
    // A state nothing produces is a branch nothing tests. Reached above:
    const reached = new Set([
        pace({ savedAmount: null }).state,
        pace({ savedAmount: 5000 }).state,
        pace({ targetDate: '2025-11-15' }).state,
        pace({ targetDate: '2026-01-13' }).state,
        pace({ targetDate: null }).state,
        pace({ measuringSince: '2025-12-22' }).state,
        pace({ savedAmount: 0, lastContributionAt: null }).state,
        pace({ targetDate: '2026-03-02' }).state,
        pace().state,
        pace({ targetDate: '2026-07-01' }).state,
    ]);
    assert.deepEqual(
        [...reached].sort(),
        Object.values(PACE_STATE).sort()
    );
});
