/**
 * Price increases — pure.
 *
 * "Rogers went up $8 a month" is the most concrete thing this app knows about
 * anybody's money: measured from their own transactions, no model involved, no
 * estimate. It was computed inside `generateAlerts`, written to
 * `subscription_alerts`, and rendered only on the Watchdog screen — a tab that
 * lost its slot in the navigator. In practice nobody saw it.
 *
 * Two jobs here. `detectPriceIncrease` is the rule, now shared with
 * `generateAlerts` so the alert and the insight cannot disagree about what
 * counts. `priceIncreaseInsights` turns the live recurring expenses into
 * insight objects that go through the ordinary pipeline — identity,
 * persistence, dismissals, the spotlight's two cooldowns — rather than being a
 * second, parallel way of interrupting somebody.
 *
 * `today` is injected. No pool, no clock, same as recurrence.js and watch.js.
 *
 * Freshness comes from the expense row, not from the alert row.
 * `persistAlerts` updates an existing undismissed alert in place and never
 * deletes one, so a subscription cancelled in March still carries its old
 * price-increase alert today. `last_seen` — the date of the most recent
 * charge — goes stale honestly, so a dead merchant stops qualifying.
 */

const { merchantSlug, displayNameFor } = require('./merchant_guides');
const { INSIGHT_TYPES } = require('./insight_identity');

/**
 * Below this, a rise is noise. Utility bills wander by a few percent every
 * month; announcing that as a price change makes the alert meaningless within
 * two billing cycles.
 */
const PRICE_INCREASE_MIN_PCT = 5;

/**
 * And below this it is not worth anybody's attention whatever the percentage.
 * 25% of a $2 subscription is fifty cents.
 */
const PRICE_INCREASE_MIN_DELTA = 1;

/**
 * How many reach the insights list.
 *
 * They are prepended ahead of the model's, because a measured figure from the
 * user's own statement beats a generated one. That is exactly why the number
 * has to be small.
 */
const MAX_PRICE_INSIGHTS = 2;

/**
 * A merchant not charged within this long is not news.
 *
 * Matches the goal-pace staleness window for the same reason: long enough that
 * a monthly biller is never wrongly considered dead.
 */
const STALE_CHARGE_DAYS = 45;

/** Charges a year, by the frequency vocabulary recurrence.js emits. */
const PERIODS_PER_YEAR = {
    'bi-weekly': 26,
    monthly: 12,
    quarterly: 4,
    annual: 1,
};

const DEFAULT_PERIODS = PERIODS_PER_YEAR.monthly;

/**
 * Statuses that mean the user has already dealt with this one.
 *
 * The vocabulary watchdog.js actually writes is active, keep, cancelling,
 * cancelled and snoozed. `ignored` and `stopped` are not among them and are
 * listed only so a future rename fails closed — an unknown status keeps the
 * insight, which is the safer direction.
 */
const HANDLED_STATUSES = new Set(['cancelled', 'cancelling', 'snoozed', 'ignored', 'stopped']);

// ---------------------------------------------------------------------------

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Whole dollars where the amount is whole, cents where it is not. */
function money(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------------------

/**
 * Whether the last two charges show a real price increase.
 *
 * Only the last two. A bill that spiked in June and came back down in July has
 * not gone up, and comparing against the minimum or the first value would
 * announce a permanent rise that has already reversed.
 *
 * Values arrive as strings: node-postgres returns DECIMAL as text to avoid
 * losing precision, and `"103" > "95"` is false lexically — the increase
 * vanishes with no error anywhere.
 */
function detectPriceIncrease(amountHistory) {
    if (!Array.isArray(amountHistory) || amountHistory.length < 2) return null;

    const previous = Number(amountHistory[amountHistory.length - 2]);
    const current = Number(amountHistory[amountHistory.length - 1]);

    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    if (previous <= 0) return null;              // an infinite percentage is not a fact

    // Belt and braces, and knowingly so: a flat or falling price yields a delta
    // at or below zero, which the floor below rejects anyway. Kept because the
    // rule this module encodes is "the price went up", and a reader should not
    // have to derive that from a minimum-magnitude check. A mutation that
    // loosens this line alone survives the suite for exactly that reason.
    if (current <= previous) return null;

    const delta = round2(current - previous);
    if (delta < PRICE_INCREASE_MIN_DELTA) return null;

    const pctIncrease = ((current - previous) / previous) * 100;
    if (pctIncrease < PRICE_INCREASE_MIN_PCT) return null;

    return { previous: round2(previous), current: round2(current), delta, pctIncrease };
}

// ---------------------------------------------------------------------------

/**
 * Live price increases, as insights.
 *
 * @param {object[]} expenses rows from recurring_expenses
 * @param {string|Date} today
 */
function priceIncreaseInsights(expenses, { today } = {}) {
    if (!Array.isArray(expenses) || expenses.length === 0) return [];

    const now = parseDate(today);
    if (!now) return [];

    const bySubject = new Map();

    for (const expense of expenses) {
        if (HANDLED_STATUSES.has(String(expense?.status || '').toLowerCase())) continue;

        const lastCharge = parseDate(expense?.last_seen);
        if (!lastCharge) continue;
        const daysSince = Math.round((now.getTime() - lastCharge.getTime()) / 86400000);
        if (daysSince > STALE_CHARGE_DAYS) continue;

        const rise = detectPriceIncrease(expense.amount_history);
        if (!rise) continue;

        const slug = merchantSlug(expense.merchant_name);
        if (!slug) continue;

        // Prefixed so our measured figure and anything the model separately
        // says about this merchant's spending occupy two ledger rows rather
        // than one silently overwriting the other.
        const subject = `price_${slug}`;

        // A rename can leave two rows for one merchant. Two cards about one
        // bill is the shape the batch dedupe exists to prevent, so the larger
        // rise wins.
        const existing = bySubject.get(subject);
        if (existing && existing.rise.delta >= rise.delta) continue;
        bySubject.set(subject, { expense, rise, subject });
    }

    return [...bySubject.values()]
        .sort((a, b) => b.rise.delta - a.rise.delta)
        .slice(0, MAX_PRICE_INSIGHTS)
        .map(({ expense, rise, subject }) => buildInsight(expense, rise, subject));
}

function buildInsight(expense, rise, subject) {
    const name = displayNameFor(expense.merchant_name);
    const periods = PERIODS_PER_YEAR[expense.frequency] || DEFAULT_PERIODS;
    const annual = round2(rise.delta * periods);
    const monthly = round2(annual / 12);
    const isMonthly = periods === DEFAULT_PERIODS;
    const pct = Math.round(rise.pctIncrease);

    return {
        id: `price_increase_${subject}`,
        type: INSIGHT_TYPES.SPENDING_OPTIMIZATION,
        subject,
        priority: pct >= 20 ? 'high' : 'medium',
        // States what the merchant did. The user did not do this, so there is
        // nothing here to be told off about.
        title: isMonthly
            ? `${name} went up ${money(rise.delta)} a month`
            : `${name} went up ${money(rise.delta)} per charge`,
        description: `Your last ${name} charge was ${money(rise.current)}, up from `
            + `${money(rise.previous)}. That is about ${money(Math.round(annual))} more over a year `
            + `if it stays there.`,
        reasoning: [
            `Was ${money(rise.previous)}, now ${money(rise.current)} — ${pct}% more.`,
            `About ${money(Math.round(annual))} more over a year at this rate.`,
            'Measured from your own transactions, not an estimate.',
        ],
        data_points: {
            previous_amount: rise.previous,
            current_amount: rise.current,
            increase: rise.delta,
            percent_increase: pct,
            frequency: expense.frequency || 'monthly',
        },
        // An app route, never a URL — the same rule the model follows. Watchdog
        // is where the cancellation and negotiation steps for this charge live.
        action: {
            primary: { label: 'Open Watchdog', type: 'navigate', route: 'Watchdog' },
        },
        // The increase, not the whole bill. Claiming the entire charge assumes
        // they cancel; what actually changed, and what a call to retentions
        // could recover, is the difference.
        potential_benefit: {
            monthly_savings: monthly,
            annual_savings: annual,
        },
    };
}

module.exports = {
    PRICE_INCREASE_MIN_PCT,
    PRICE_INCREASE_MIN_DELTA,
    MAX_PRICE_INSIGHTS,
    STALE_CHARGE_DAYS,
    PERIODS_PER_YEAR,
    HANDLED_STATUSES,
    detectPriceIncrease,
    priceIncreaseInsights,
};
