/**
 * Turning a pace block into something a person reads.
 *
 * The arithmetic is the server's (`services/goal_pace.js`); this decides what to
 * say about it, and — more often — what not to say. Pure, no expo or RN
 * imports, so the copy rules are testable off-device like goalReminders.js and
 * cardDueReminders.js.
 *
 * Three rules hold everything here together:
 *
 *   1. **Never scold.** The insights prompt bans the model from shaming and our
 *      own copy holds the same line. "About $845 a month behind" is a fact
 *      somebody can act on; "you are falling behind" is a verdict on them.
 *   2. **Say nothing rather than something hollow.** Several states return
 *      null, because the card already says what needs saying and a second line
 *      repeating it in vaguer words is worse than a gap.
 *   3. **Round, and say "about".** A pace is an estimate. `$638.55 a month`
 *      claims a precision the underlying average does not have, and invites
 *      somebody to transfer exactly that.
 */

/** Mirrors PACE_STATE in packages/backend/src/services/goal_pace.js. */
export const PACE_STATE = {
    UNMEASURABLE: 'unmeasurable',
    ACHIEVED: 'achieved',
    OVERDUE: 'overdue',
    DUE_SOON: 'due_soon',
    NO_TARGET_DATE: 'no_target_date',
    TOO_EARLY: 'too_early',
    STALLED: 'stalled',
    BEHIND: 'behind',
    ON_TRACK: 'on_track',
    AHEAD: 'ahead',
};

/** Tones the screens map onto theme colours. */
export const PACE_TONE = {
    GOOD: 'good',
    NEUTRAL: 'neutral',
    ATTENTION: 'attention',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

/** Whole dollars with separators. No cents: see rule 3. */
export const roundedMoney = (value) => {
    const n = Math.round(Math.abs(Number(value) || 0));
    return `$${n.toLocaleString('en-US')}`;
};

/**
 * A projected date as a month, never a day.
 *
 * "You will get there on 16 May" is false precision — the estimate rests on an
 * average that a single missed transfer moves by a fortnight. The month is the
 * part that is actually informative.
 */
export const formatMonth = (dateString) => {
    if (!dateString) return '';
    const [y, m] = String(dateString).slice(0, 10).split('-').map(Number);
    if (!MONTHS[m - 1] || !Number.isFinite(y)) return '';
    return `${MONTHS[m - 1]} ${y}`;
};

const weeks = (days) => {
    const w = Math.round(days / 7);
    return w === 1 ? '1 week' : `${w} weeks`;
};

const dayCount = (days) => (days === 1 ? '1 day' : `${days} days`);

/**
 * Why a goal is stalled, in the user's terms.
 *
 * Three genuinely different situations that the single `stalled` state covers,
 * and telling somebody "nothing has gone in" when their balance has actually
 * fallen would be wrong.
 */
const stalledText = (pace) => {
    if (Number(pace.actualPerMonth) < 0) return 'Balance is lower than when you started';
    if (pace.daysSinceContribution !== null && pace.daysSinceContribution !== undefined) {
        return `Nothing added in ${weeks(pace.daysSinceContribution)}`;
    }
    return 'Nothing saved toward this yet';
};

/**
 * The single line under a goal card, or null for goals that say enough already.
 *
 * Null for achieved and disconnected goals: the card has its own treatment for
 * both, and a pace line under "Target reached" is noise.
 */
export function paceSummary(pace) {
    if (!pace) return null;

    switch (pace.state) {
        case PACE_STATE.UNMEASURABLE:
        case PACE_STATE.ACHIEVED:
            return null;

        case PACE_STATE.STALLED:
            return { tone: PACE_TONE.ATTENTION, text: stalledText(pace) };

        case PACE_STATE.DUE_SOON:
            // The countdown can arrive already spent. Goal payloads are cached
            // for 24 hours, so a goal that was two days out when it was cached
            // is a day past its target by the time the cached copy renders --
            // the state still says due_soon and the day count has gone
            // negative. "$3,000 to go in -1 days" is the visible form of that.
            return {
                tone: PACE_TONE.ATTENTION,
                text: pace.daysRemaining > 0
                    ? `${roundedMoney(pace.remaining)} to go in ${dayCount(pace.daysRemaining)}`
                    : `${roundedMoney(pace.remaining)} to go by today`,
            };

        case PACE_STATE.OVERDUE:
            // The card's deadline label already says how far past it is, so
            // this adds the only new thing: where the current rate lands.
            return pace.projectedDate
                ? { tone: PACE_TONE.NEUTRAL, text: `On pace for ${formatMonth(pace.projectedDate)}` }
                : null;

        case PACE_STATE.TOO_EARLY:
            return pace.requiredPerMonth
                ? { tone: PACE_TONE.NEUTRAL, text: `Aim for about ${roundedMoney(pace.requiredPerMonth)}/mo` }
                : null;

        case PACE_STATE.NO_TARGET_DATE:
            if (!pace.actualPerMonth) return null;
            return {
                tone: PACE_TONE.NEUTRAL,
                text: pace.projectedDate
                    ? `About ${roundedMoney(pace.actualPerMonth)}/mo — on pace for ${formatMonth(pace.projectedDate)}`
                    : `About ${roundedMoney(pace.actualPerMonth)}/mo`,
            };

        case PACE_STATE.AHEAD:
            return {
                tone: PACE_TONE.GOOD,
                text: pace.projectedDate
                    ? `Ahead of schedule — on pace for ${formatMonth(pace.projectedDate)}`
                    : 'Ahead of schedule',
            };

        case PACE_STATE.ON_TRACK:
            return { tone: PACE_TONE.GOOD, text: `On track at about ${roundedMoney(pace.actualPerMonth)}/mo` };

        case PACE_STATE.BEHIND:
            // The gap, not the judgement. This is the number the check-in nudge
            // and the spotlight can legitimately ask about, because it is
            // entirely derived from a target the user set themselves.
            return {
                tone: PACE_TONE.ATTENTION,
                text: `About ${roundedMoney(pace.deltaPerMonth)}/mo short of the pace`,
            };

        default:
            // A state the backend added and this file has not learned. Silence
            // is the right failure: constants/insights.js took the opposite bet
            // once and every card rendered a generic bulb with a raw enum
            // string above the title.
            return null;
    }
}

/**
 * The fuller block on the goal's own screen.
 *
 * Returns null when there is nothing worth a whole section — a disconnected
 * goal has its own reconnect prompt, and a finished one has a hero that says so.
 */
export function paceDetail(pace) {
    if (!pace) return null;
    if (pace.state === PACE_STATE.UNMEASURABLE || pace.state === PACE_STATE.ACHIEVED) return null;

    const summary = paceSummary(pace);

    return {
        headline: summary ? summary.text : null,
        tone: summary ? summary.tone : PACE_TONE.NEUTRAL,
        // Both tiles render regardless, with an em dash where we have no
        // number. A tile that vanishes reads as a layout bug; a tile showing
        // "—" reads as "we cannot tell you that yet", which is the truth.
        required: pace.requiredPerMonth ? `${roundedMoney(pace.requiredPerMonth)}/mo` : '—',
        actual: pace.actualPerMonth ? `${roundedMoney(pace.actualPerMonth)}/mo` : '—',
        requiredSub: pace.requiredPerMonth
            ? 'to hit your target date'
            : (pace.daysRemaining === null ? 'no target date set' : 'not enough time left to average'),
        actualSub: pace.actualPerMonth
            ? `over ${weeks(pace.observedDays)}`
            : 'needs a month of history',
        projection: pace.projectedDate
            ? `At this pace you reach it around ${formatMonth(pace.projectedDate)}.`
            : null,
    };
}
