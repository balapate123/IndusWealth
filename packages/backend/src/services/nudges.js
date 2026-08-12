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
 * Pure and dependency-free so the selection, the cooldowns and the copy can be
 * exercised without a database. The route supplies the rows and the clock.
 */

/** A nudge is not shown again for this long, even if it is still the best one. */
const NUDGE_COOLDOWN_DAYS = 21;

/** And no more than one nudge of any kind per user per week. */
const USER_COOLDOWN_DAYS = 7;

/** A goal is "stalled" once nothing has gone into it for this long. */
const STALLED_DAYS = 21;

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

        candidates.push({
            key: `goal_step:${goal.id}`,
            kind: 'goal_step',
            priority: 4,
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
            priority: 5,
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
    NUDGE_COOLDOWN_DAYS,
    USER_COOLDOWN_DAYS,
    STALLED_DAYS,
    buildNudgeCandidates,
    selectNudge,
    suggestedContribution,
    money,
};
