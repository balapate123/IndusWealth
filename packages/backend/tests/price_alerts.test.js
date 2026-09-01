/**
 * Run with:  npm test   (from packages/backend)
 *
 * "Rogers went up $8 a month" is the most concrete thing this app knows about
 * anybody's money. It was computed inside generateAlerts, written to a table,
 * and rendered only on the Watchdog screen — behind a tab that lost its slot in
 * the navigator. Nobody saw it.
 *
 * This module is the rule on its own, pure, so it can feed both the Watchdog
 * alert and the insights pipeline without the two disagreeing about what counts
 * as a price increase.
 *
 * The gates matter more than the arithmetic. A price increase insight competes
 * for the spotlight — one interruption per user per week — so a rise of forty
 * cents on a dead subscription must not win it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    PRICE_INCREASE_MIN_PCT,
    PRICE_INCREASE_MIN_DELTA,
    MAX_PRICE_INSIGHTS,
    STALE_CHARGE_DAYS,
    PERIODS_PER_YEAR,
    detectPriceIncrease,
    priceIncreaseInsights,
} = require('../src/services/price_alerts');

const TODAY = '2026-08-20';

const expense = (over = {}) => ({
    merchant_name: 'ROGERS',
    amount_history: [95, 95, 103],
    frequency: 'monthly',
    last_seen: '2026-08-08',
    status: 'active',
    category: 'Utilities',
    ...over,
});

const insightsFor = (expenses, today = TODAY) =>
    priceIncreaseInsights(Array.isArray(expenses) ? expenses : [expenses], { today });

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test('a rise between the last two charges is a price increase', () => {
    const found = detectPriceIncrease([95, 95, 103]);
    assert.equal(found.previous, 95);
    assert.equal(found.current, 103);
    assert.equal(found.delta, 8);
    assert.equal(Math.round(found.pctIncrease), 8);
});

test('only the last two charges count, so a rise that came back down is not one', () => {
    // A bill that spiked in June and returned to normal in July has not gone
    // up. Comparing against the minimum, or the first value, would announce a
    // permanent increase that has already reversed.
    assert.equal(detectPriceIncrease([95, 130, 95]), null);

    // And the first value must not be the baseline. A subscription that was
    // $50 two years ago and has been $95 for a year has gone up $8 this
    // month, not $53 -- an introductory price that ended long ago is not a
    // price increase. The case above cannot show this on its own: its first
    // and second-to-last values happen to be equal.
    const found = detectPriceIncrease([50, 95, 103]);
    assert.equal(found.previous, 95);
    assert.equal(found.delta, 8);
});

test('a fall is not an increase', () => {
    assert.equal(detectPriceIncrease([103, 95]), null);
});

test('an unchanged price is not an increase', () => {
    assert.equal(detectPriceIncrease([95, 95]), null);
});

test('one charge cannot show a change', () => {
    assert.equal(detectPriceIncrease([95]), null);
    assert.equal(detectPriceIncrease([]), null);
    assert.equal(detectPriceIncrease(null), null);
    assert.equal(detectPriceIncrease(undefined), null);
});

test('a rise under the percentage floor is rounding, not a price change', () => {
    // Utility bills wander by a few percent every month. Announcing that as a
    // price increase would make the alert meaningless within two billing cycles.
    assert.equal(PRICE_INCREASE_MIN_PCT, 5);
    assert.equal(detectPriceIncrease([100, 104]), null);
    assert.ok(detectPriceIncrease([100, 105]));
});

test('a rise under the dollar floor is not worth anybody’s attention', () => {
    // 25% of a $2 subscription is fifty cents. True, and six dollars a year.
    assert.equal(PRICE_INCREASE_MIN_DELTA, 1);
    assert.equal(detectPriceIncrease([2, 2.5]), null);
    assert.ok(detectPriceIncrease([10, 11]));
});

test('strings from the database are handled, since DECIMAL comes back as one', () => {
    // node-postgres returns DECIMAL as a string to avoid float precision loss.
    // Comparing "103" > "95" lexically is false, so the increase disappears.
    const found = detectPriceIncrease(['95.00', '103.00']);
    assert.ok(found, 'a decimal array from pg produced no increase');
    assert.equal(found.delta, 8);
});

test('nonsense in the history does not produce a nonsense increase', () => {
    assert.equal(detectPriceIncrease([null, 103]), null);
    assert.equal(detectPriceIncrease([95, undefined]), null);
    assert.equal(detectPriceIncrease([0, 103]), null, 'dividing by zero gave an infinite increase');
});

// ---------------------------------------------------------------------------
// Which ones are worth an insight
// ---------------------------------------------------------------------------

test('a live increase becomes one insight', () => {
    const items = insightsFor(expense());
    assert.equal(items.length, 1);
    assert.equal(items[0].subject, 'price_rogers');
});

test('the subject is a slug, and prefixed so it cannot collide with a model insight', () => {
    // Same discipline as merchant_guides: a merchant key is a slug, never a
    // display name. The prefix keeps our measured figure and whatever the model
    // separately says about Rogers spending on two different ledger rows,
    // rather than one silently overwriting the other.
    const [item] = insightsFor(expense({ merchant_name: 'ROGERS *MOBILE' }));
    assert.equal(item.subject, 'price_rogers_mobile');
    assert.ok(!item.subject.includes('*'));
    assert.ok(item.subject.startsWith('price_'));
});

test('a merchant whose last charge is old is not announced', () => {
    // The alert row is updated in place and never deleted, so a subscription
    // that was cancelled months ago keeps its old price-increase alert forever.
    // Freshness has to come from the charge, not from the alert.
    assert.equal(STALE_CHARGE_DAYS, 45);
    assert.equal(insightsFor(expense({ last_seen: '2026-05-01' })).length, 0);
    assert.equal(insightsFor(expense({ last_seen: '2026-07-20' })).length, 1);
});

test('a merchant with no last-seen date is not announced', () => {
    assert.equal(insightsFor(expense({ last_seen: null })).length, 0);
});

test('an expense the user has already dealt with is not announced', () => {
    // Somebody who cancelled Rogers does not need to hear that Rogers costs
    // more than it used to.
    for (const status of ['cancelled', 'cancelling', 'snoozed', 'ignored']) {
        assert.equal(insightsFor(expense({ status })).length, 0, status);
    }
    assert.equal(insightsFor(expense({ status: 'keep' })).length, 1, 'keep');
});

test('no more than two reach the list, biggest first', () => {
    // They are prepended ahead of the model's insights, so an unbounded number
    // would push everything else off the screen.
    assert.equal(MAX_PRICE_INSIGHTS, 2);

    const items = insightsFor([
        expense({ merchant_name: 'SMALL', amount_history: [100, 108] }),
        expense({ merchant_name: 'HUGE', amount_history: [100, 160] }),
        expense({ merchant_name: 'MID', amount_history: [100, 130] }),
    ]);

    assert.deepEqual(items.map((i) => i.subject), ['price_huge', 'price_mid']);
});

test('two alerts for one merchant collapse to one', () => {
    // Duplicate merchant rows are possible after a rename; two cards about one
    // bill is the shape the batch dedupe exists to prevent.
    const items = insightsFor([
        expense({ merchant_name: 'ROGERS', amount_history: [100, 130] }),
        expense({ merchant_name: 'Rogers', amount_history: [100, 120] }),
    ]);
    assert.equal(items.length, 1);
});

test('nothing at all is a normal answer', () => {
    assert.deepEqual(priceIncreaseInsights([], { today: TODAY }), []);
    assert.deepEqual(priceIncreaseInsights(null, { today: TODAY }), []);
});

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

test('the yearly figure follows the billing cadence, not a bare twelve', () => {
    assert.equal(PERIODS_PER_YEAR['bi-weekly'], 26);
    assert.equal(PERIODS_PER_YEAR.monthly, 12);
    assert.equal(PERIODS_PER_YEAR.quarterly, 4);
    assert.equal(PERIODS_PER_YEAR.annual, 1);

    const monthly = insightsFor(expense({ frequency: 'monthly' }))[0];
    const quarterly = insightsFor(expense({ frequency: 'quarterly' }))[0];

    assert.equal(monthly.potential_benefit.annual_savings, 96);
    assert.equal(quarterly.potential_benefit.annual_savings, 32);
});

test('an unknown cadence is treated as monthly rather than dropped', () => {
    const [item] = insightsFor(expense({ frequency: 'irregular' }));
    assert.equal(item.potential_benefit.annual_savings, 96);
});

test('the benefit is the increase, not the whole bill', () => {
    // Claiming the entire $103 assumes they cancel. What actually changed, and
    // what a call to retentions could recover, is the $8.
    const [item] = insightsFor(expense());
    assert.equal(item.potential_benefit.monthly_savings, 8);
    assert.ok(item.potential_benefit.annual_savings < 103 * 12);
});

test('a monthly figure is derived, so a quarterly rise is not quoted as monthly', () => {
    const [item] = insightsFor(expense({ frequency: 'quarterly' }));
    assert.equal(item.potential_benefit.monthly_savings, Math.round((8 * 4) / 12 * 100) / 100);
});

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

test('the title names the merchant and the increase', () => {
    const [item] = insightsFor(expense());
    assert.equal(item.title, 'Rogers went up $8 a month');
});

test('a merchant we hold no guide for keeps the name off the statement', () => {
    // displayNameFor only recases merchants we have a guide for. Title-casing
    // the rest turns TD AUTO FINANCE into Td Auto Finance, which is worse.
    const [item] = insightsFor(expense({ merchant_name: 'TD AUTO FINANCE' }));
    assert.match(item.title, /^TD AUTO FINANCE went up/, item.title);
});

test('a charge that is not monthly says per charge, because it is not per month', () => {
    const [item] = insightsFor(expense({ frequency: 'quarterly' }));
    assert.match(item.title, /per charge/, item.title);
    assert.ok(!item.title.includes('a month'));
});

test('the description carries both prices and the yearly figure', () => {
    const [item] = insightsFor(expense());
    assert.match(item.description, /\$95/);
    assert.match(item.description, /\$103/);
    assert.match(item.description, /\$96/);
});

test('it does not scold, because the user did not do this', () => {
    const [item] = insightsFor(expense());
    const text = JSON.stringify(item).toLowerCase();
    for (const word of [
        'you should', 'you failed', 'wasting', 'waste', 'careless',
        'overpaying', 'you are paying too much', 'bad',
    ]) {
        assert.ok(!text.includes(word), `price insight scolds with "${word}": ${text}`);
    }
});

test('it names no security and no product', () => {
    // Same sweep the nudges carry. This copy is ours, not the model's, but it
    // reaches the same screen through the same pipeline.
    const text = JSON.stringify(insightsFor(expense())).toLowerCase();
    for (const banned of [
        'etf', 'ticker', 'stock', 'index fund', 'portfolio', 'brokerage',
        'wealthsimple', 'questrade', 'switch to', 'we recommend',
    ]) {
        assert.ok(!text.includes(banned), `price insight mentions "${banned}"`);
    }
});

// ---------------------------------------------------------------------------
// Shape — it has to survive the pipeline it is injected into
// ---------------------------------------------------------------------------

test('the action is an in-app route, never a URL', () => {
    // The model never writes a URL and neither do we. Watchdog is the screen
    // that holds the cancellation and negotiation steps for this charge.
    const [item] = insightsFor(expense());
    assert.equal(item.action.primary.type, 'navigate');
    assert.equal(item.action.primary.route, 'Watchdog');
    assert.ok(!JSON.stringify(item).includes('http'));
});

test('the route it points at is one the registry knows', () => {
    // The same gate the model has to pass. resolveRoute returns null for a
    // screen that does not exist, and a button that navigates nowhere is this
    // project's most repeated bug -- Watchdog shipped with two of them.
    const { resolveRoute } = require('../src/services/link_registry');
    const [item] = insightsFor(expense());
    assert.equal(resolveRoute(item.action.primary.route), 'Watchdog');
});

test('the type comes from the closed enum', () => {
    const { INSIGHT_TYPES } = require('../src/services/insight_identity');
    const [item] = insightsFor(expense());
    assert.ok(Object.values(INSIGHT_TYPES).includes(item.type));
});

test('the fingerprint the ledger will compute is stable across runs', () => {
    // The whole persistence layer keys on type:subject. A subject that changed
    // between generations would reset the streak every six hours, which is the
    // bug insight_identity exists to prevent.
    const { fingerprintOf } = require('../src/services/insight_identity');
    const a = fingerprintOf(insightsFor(expense())[0]);
    const b = fingerprintOf(insightsFor(expense({ amount_history: [95, 95, 104] }))[0]);
    assert.equal(a, b, 'a different amount produced a different identity');
});

test('a bigger jump is ranked higher', () => {
    assert.equal(insightsFor(expense({ amount_history: [100, 125] }))[0].priority, 'high');
    assert.equal(insightsFor(expense({ amount_history: [100, 110] }))[0].priority, 'medium');
});

test('every insight carries the fields the pipeline reads', () => {
    const [item] = insightsFor(expense());
    for (const key of ['id', 'type', 'subject', 'priority', 'title', 'description',
        'reasoning', 'data_points', 'action', 'potential_benefit']) {
        assert.ok(item[key] !== undefined, `missing ${key}`);
    }
    assert.ok(Array.isArray(item.reasoning) && item.reasoning.length > 0);
});
