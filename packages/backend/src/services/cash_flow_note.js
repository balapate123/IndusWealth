/**
 * One sentence about the money that moved, and nothing else.
 *
 * **Pure** — no pool, no clock beyond what it is handed — so the copy rules
 * below are assertions rather than intentions, the same as `nudges.js` and
 * `goal_pace.js`.
 *
 * ## What this replaced, and why it had to go
 *
 * `generateAiTip` sat on the Analytics screen and said:
 *
 *     Move $840 to your HISA for an extra $31/mo interest.   [Execute Now]
 *
 * Four separate problems in one card:
 *
 *   1. **"Put your surplus into X" is the shape that got the app rejected**
 *      from Google Play under the Financial Services policy. The noun does not
 *      rescue it — swapping HISA for TFSA keeps the structure, which is
 *      recommending a destination for money based on the user's own finances.
 *      See "No Investment Advice" in CLAUDE.md.
 *   2. The 4.5% was **hardcoded in the route**. Nobody was quoting a real rate
 *      at a real institution; the interest figure was invented arithmetic
 *      presented as a forecast.
 *   3. **"Execute Now"** reads as a button that moves money. It navigated to
 *      the accounts list.
 *   4. A third branch said **"Consider the TTC for work commutes"** to every
 *      user in the country, under a heading that called it an AI insight. It
 *      was a three-branch `if`.
 *
 * ## The rule this follows instead
 *
 * The same one `services/nudges.js` is built on: **state what happened, and
 * point only at something the user made themselves.** A goal they created is a
 * destination they chose. Anything else is us choosing for them, which is the
 * line between a budgeting app and an unregistered adviser.
 *
 * So: no rate, no product, no institution, no imperative. A number and a date
 * range. What to do about it is the reader's business — and if they want a
 * destination, their own goals are one tap away.
 */

/** Money in and money out within this much of each other reads as "even". */
const EVEN_THRESHOLD = 1;

const round2 = (n) => Math.round(n * 100) / 100;

/** "30 days" / "7 days" — matches how the screen labels its own range. */
const rangeLabel = (periodDays) => {
    const days = Math.max(1, Math.round(Number(periodDays) || 0));
    if (days === 1) return 'today';
    if (days === 365) return 'the last year';
    return `the last ${days} days`;
};

const money = (value) => `$${Math.abs(round2(value)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
})}`;

/**
 * The note, or null when there is nothing measured to say.
 *
 * Null rather than a zero sentence: a period with no transactions has not
 * broken even, it has told us nothing — the same distinction `goal_pace.js`
 * draws between a stalled goal and an unmeasurable one.
 *
 * @param {{ totalIncome: number, totalExpenses: number, periodDays: number }} input
 * @returns {{ state: string, message: string, surplus: number }|null}
 */
const buildCashFlowNote = ({ totalIncome, totalExpenses, periodDays } = {}) => {
    const income = Number(totalIncome) || 0;
    const expenses = Number(totalExpenses) || 0;

    if (income === 0 && expenses === 0) return null;

    const net = round2(income - expenses);
    const range = rangeLabel(periodDays);

    if (net > EVEN_THRESHOLD) {
        return {
            state: 'surplus',
            // No verdict and no instruction. "More came in than went out" is
            // the whole claim, and it is checkable against the two figures
            // printed directly above it on the same screen.
            message: `${money(net)} more came in than went out over ${range}.`,
            surplus: net,
        };
    }

    if (net < -EVEN_THRESHOLD) {
        return {
            state: 'shortfall',
            // Never "you overspent". Missing is not a fault condition, and the
            // reader may have had a reason the data cannot see -- a tuition
            // payment, a move, a car repair. Same line the nudge copy holds.
            message: `${money(net)} more went out than came in over ${range}.`,
            surplus: 0,
        };
    }

    return {
        state: 'even',
        message: `Money in and money out were about even over ${range}.`,
        surplus: 0,
    };
};

module.exports = {
    buildCashFlowNote,
    EVEN_THRESHOLD,
};
