/**
 * The weekly check-in nudge: one concrete thing to do, drawn only from what the
 * user has already set up.
 *
 * SCOPE IS A COMPLIANCE BOUNDARY, NOT A PREFERENCE. A nudge may reference a
 * savings goal or a debt the user created, and nothing else. It must never
 * originate a destination — "put your surplus into X" is the shape that got the
 * app rejected under Google Play's Financial Services policy in July 2026 (see
 * the No Investment Advice section of CLAUDE.md). Every candidate below names a
 * target the user chose themselves; there is no branch that invents one.
 *
 * Pure so the selection, the cooldowns and the copy can be exercised without a
 * database. The route supplies the rows and the clock. The one import is
 * goal_pace.js, itself pure — the enum is imported rather than string-matched
 * so the two cannot drift silently.
 */

const { PACE_STATE } = require('./goal_pace');

/** A nudge is not shown again for this long, even if it is still the best one. */
const NUDGE_COOLDOWN_DAYS = 21;

/** And no more than one nudge of any kind per user per week. */
const USER_COOLDOWN_DAYS = 7;

/**
 * Every kind of nudge this module can emit.
 *
 * Closed, and asserted against what buildNudgeCandidates actually produces, for
 * the same reason PACE_STATE and the insight type enum are: the device keys an
 * icon off this string. constants/insights.js drifted from its backend enum
 * once and every card fell back to a generic bulb. A kind added here without a
 * matching icon is drift; a test on the mobile side fails on it rather than
 * quietly rendering a sparkle.
 */
const NUDGE_KINDS = Object.freeze([
    'goal_finish',
    'goal_relink',
    'goal_stalled',
    'goal_behind',
    'goal_step',
    'debt_interest',
]);

/** A goal is "stalled" once nothing has gone into it for this long. */
const STALLED_DAYS = 21;

/**
 * Below this, being behind the pace is not worth an interruption.
 *
 * The on-track band is 5% wide, so a small goal can be "behind" by a couple of
 * dollars a month. Spending the user's one nudge a week on "adding about $2 a
 * month would help" is worse than saying nothing; those goals fall through to
 * the routine step instead.
 */
const MIN_PACE_GAP = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (a, b) => Math.floor((a.getTime() - new Date(b).getTime()) / DAY_MS);

/** Whole dollars read better in a nudge than "$25.00". */
function money(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '$0';
    return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * What a goal is short by, rounded to something a person would actually
 * transfer. Never larger than what is left to save — a nudge that overshoots
 * the target reads as a machine that is not paying attention.
 */
function suggestedContribution(goal) {
    const target = Number(goal.target_amount) || 0;
    const saved = Number(goal.saved_amount) || 0;
    const remaining = target - saved;
    if (!(remaining > 0)) return null;

    // The user's own per-goal reminder amount wins — they already told us what
    // a comfortable step looks like.
    const declared = Number(goal.reminder_amount);
    if (Number.isFinite(declared) && declared > 0) return Math.min(declared, remaining);

    const rounded = Math.max(5, Math.round(remaining / 20 / 5) * 5);
    return Math.min(rounded, remaining);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A target date as a month.
 *
 * Never a day, for the same reason the projection on the goal screen is not:
 * the pace behind it is an average, and naming a day invites somebody to hold
 * us to it. Accepts a Date because node-postgres parses DATE columns into one.
 */
function targetMonth(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * What a goal is short by each month, or null if that is not worth saying.
 *
 * Only `behind` qualifies, and the distinction from `stalled` is the whole
 * point: money IS going into a behind goal, just not fast enough. Until this
 * existed, such a goal produced the same generic "Move $25 toward X" as one
 * with no deadline at all.
 *
 * `due_soon` deliberately does not qualify. Inside the last month there is no
 * monthly rate to offer, and the only thing left to say is that a date the user
 * set is about to pass — which changes nothing they can act on. A due-soon goal
 * that IS within reach is already caught by goal_finish at 90%.
 */
function paceShortfall(goal) {
    // Absent on a payload from an older build, and on any goal read from
    // somewhere other than getGoals/getGoalById. Falling through is correct:
    // the routine step still applies.
    const pace = goal?.pace;
    if (!pace || pace.state !== PACE_STATE.BEHIND) return null;

    const gap = Math.abs(Number(pace.deltaPerMonth));
    if (!Number.isFinite(gap) || gap < MIN_PACE_GAP) return null;

    // Never ask for more than is left. A monthly gap can exceed the remaining
    // balance on a goal that is nearly done but nearly out of time, and asking
    // for more than the target reads as a machine not paying attention — the
    // same rule suggestedContribution follows.
    const remaining = Number(pace.remaining);
    const ask = Number.isFinite(remaining) && remaining > 0 ? Math.min(gap, remaining) : gap;

    return { perMonth: Math.round(ask), by: targetMonth(goal.target_date) };
}

/**
 * Every nudge this user could be shown right now, best first.
 *
 * Ranked by how actionable it is, not by size: a stalled goal is a clearer ask
 * than a general "keep going", and a goal close to done is the easiest win
 * available.
 *
 * @param {object[]} goals   rows from db.getGoals (active only)
 * @param {object[]} debts   normalised debts (only is_custom ones are used)
 * @param {Date} now
 * @returns {{key: string, kind: string, title: string, body: string, action: object}[]}
 */
function buildNudgeCandidates({ goals = [], debts = [], now = new Date() } = {}) {
    const candidates = [];

    for (const goal of goals) {
        if (goal.status !== 'active') continue;

        // A goal whose account was disconnected has no measurement behind it.
        // Asking someone to "move $25 toward" a number we cannot see is worse
        // than staying quiet.
        if (goal.needs_relink || goal.saved_amount == null) {
            candidates.push({
                key: `goal_relink:${goal.id}`,
                kind: 'goal_relink',
                priority: 2,
                title: goal.name,
                body: 'Reconnect the account behind this goal to track progress again.',
                action: { type: 'goal', goalId: goal.id, label: 'Reconnect' },
            });
            continue;
        }

        const amount = suggestedContribution(goal);
        if (amount == null) continue;

        const progress = Number(goal.progress_percent) || 0;

        if (progress >= 90) {
            candidates.push({
                key: `goal_finish:${goal.id}`,
                kind: 'goal_finish',
                priority: 1,
                title: goal.name,
                body: `${money(amount)} away from your ${money(goal.target_amount)} target.`,
                action: { type: 'goal', goalId: goal.id, label: 'Add to goal' },
            });
            continue;
        }

        const idle = goal.last_contribution_at
            ? daysBetween(now, goal.last_contribution_at)
            : daysBetween(now, goal.created_at);

        if (idle >= STALLED_DAYS) {
            candidates.push({
                key: `goal_stalled:${goal.id}`,
                kind: 'goal_stalled',
                priority: 3,
                title: goal.name,
                // States the gap, does not judge it. See the no-scolding rule.
                body: `Nothing added in ${idle} days. ${money(amount)} would move it along.`,
                action: { type: 'goal', goalId: goal.id, label: 'Add to goal' },
            });
            continue;
        }

        // Ranked below a stall and above a routine step. A stalled goal is
        // still the clearer ask -- do anything -- but a measured shortfall
        // against the user's own deadline beats "move $25 toward this".
        const shortfall = paceShortfall(goal);
        if (shortfall) {
            candidates.push({
                key: `goal_behind:${goal.id}`,
                kind: 'goal_behind',
                priority: 4,
                title: goal.name,
                // Framed as the step that closes the gap, not as the gap. Both
                // are true; only one of them is something to do.
                body: shortfall.by
                    ? `Adding about ${money(shortfall.perMonth)} a month would put this back on pace for ${shortfall.by}.`
                    : `Adding about ${money(shortfall.perMonth)} a month would put this back on pace.`,
                action: { type: 'goal', goalId: goal.id, label: 'Add to goal' },
            });
            continue;
        }

        candidates.push({
            key: `goal_step:${goal.id}`,
            kind: 'goal_step',
            priority: 5,
            title: goal.name,
            body: `Move ${money(amount)} toward ${goal.name}.`,
            action: { type: 'goal', goalId: goal.id, label: 'Add to goal' },
        });
    }

    // Debts the user entered themselves. Plaid-derived debts are excluded: their
    // balances move on their own, so a nudge about one can be stale by the time
    // it is read.
    for (const debt of debts) {
        if (!debt.is_custom) continue;

        const balance = Number(debt.balance) || 0;
        const apr = Number(debt.apr) || 0;
        if (balance <= 0 || apr <= 0) continue;

        // Interest accruing this month at the current balance. Their own
        // numbers, arithmetic only — no product and no recommendation.
        const monthlyInterest = (balance * (apr / 100)) / 12;
        if (monthlyInterest < 1) continue;

        candidates.push({
            key: `debt_interest:${debt.id}`,
            kind: 'debt_interest',
            priority: 6,
            title: debt.name,
            body: `At ${apr}% this is costing about ${money(Math.round(monthlyInterest))} a month in interest.`,
            action: { type: 'debt', debtId: debt.id, label: 'Open Debt Attack' },
        });
    }

    return candidates.sort((a, b) => a.priority - b.priority);
}

/**
 * The single nudge to show, or null.
 *
 * @param {object[]} candidates      from buildNudgeCandidates
 * @param {object} state
 * @param {Date|string|null} state.lastShownAt   when this user last saw any nudge
 * @param {Record<string, string>} state.seen    nudge key -> when it was last shown
 * @param {boolean} state.enabled
 * @param {Date} now
 */
function selectNudge(candidates = [], { lastShownAt = null, seen = {}, enabled = true } = {}, now = new Date()) {
    if (!enabled) return null;

    // One interruption a week, at most. Checked before per-nudge cooldowns so a
    // user with many eligible nudges is not shown a different one every day.
    if (lastShownAt && daysBetween(now, lastShownAt) < USER_COOLDOWN_DAYS) return null;

    for (const candidate of candidates) {
        const last = seen?.[candidate.key];
        if (last && daysBetween(now, last) < NUDGE_COOLDOWN_DAYS) continue;
        return candidate;
    }

    return null;
}

module.exports = {
    NUDGE_KINDS,
    NUDGE_COOLDOWN_DAYS,
    USER_COOLDOWN_DAYS,
    STALLED_DAYS,
    MIN_PACE_GAP,
    paceShortfall,
    buildNudgeCandidates,
    selectNudge,
    suggestedContribution,
    money,
};
