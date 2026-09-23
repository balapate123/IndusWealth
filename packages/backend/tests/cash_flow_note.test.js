/**
 * Run with:  npm test   (from packages/backend)
 *
 * This replaced a card that said "Move $840 to your HISA for an extra $31/mo
 * interest" under a button labelled "Execute Now", off a 4.5% rate hardcoded
 * in the route. Recommending where somebody's surplus should go, on the
 * strength of their own balances, is the shape that got the app rejected from
 * Google Play under the Financial Services policy.
 *
 * A prompt rule is a request and a code review is a memory. The last two tests
 * here are the enforcement: whatever anybody writes in this module later, it
 * cannot name a product, quote a rate, or tell the reader to move money,
 * because the test reads the strings back. Same idea as
 * `_rejectSecurityMentions` in ai_insights.js, and the nudge tests that assert
 * no nudge invents a destination.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildCashFlowNote, EVEN_THRESHOLD } = require('../src/services/cash_flow_note');

const note = (income, expenses, periodDays = 30) =>
    buildCashFlowNote({ totalIncome: income, totalExpenses: expenses, periodDays });

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

test('money left over is stated as a fact, with no instruction', () => {
    const result = note(4000, 3160);
    assert.equal(result.state, 'surplus');
    assert.equal(result.message, '$840 more came in than went out over the last 30 days.');
    assert.equal(result.surplus, 840);
});

test('a shortfall is stated the same way, and never scolds', () => {
    // "You overspent" is a verdict. Missing is not a fault condition, and the
    // reader may have had a reason the data cannot see -- tuition, a move, a
    // car repair. Same line the nudge copy holds.
    const result = note(3000, 3320);
    assert.equal(result.state, 'shortfall');
    assert.equal(result.message, '$320 more went out than came in over the last 30 days.');
});

test('a shortfall offers no surplus to spend', () => {
    // The button is rendered off this, so a non-zero here would offer to put
    // money the user does not have toward a goal.
    assert.equal(note(3000, 3320).surplus, 0);
    assert.equal(note(0, 500).surplus, 0);
});

test('about even says so rather than reporting a rounding artefact', () => {
    assert.equal(note(3000, 3000).state, 'even');
    assert.equal(note(3000, 3000.5).state, 'even');
    assert.equal(note(3000, 3000 - EVEN_THRESHOLD).state, 'even');
    assert.match(note(3000, 3000).message, /about even/);
});

test('one dollar past the threshold is no longer even', () => {
    // The band has to be load-bearing in both directions, or "even" quietly
    // swallows a real surplus.
    assert.equal(note(3000, 3000 - EVEN_THRESHOLD - 0.01).state, 'surplus');
    assert.equal(note(3000, 3000 + EVEN_THRESHOLD + 0.01).state, 'shortfall');
});

test('nothing measured is null, not a zero sentence', () => {
    // A period with no transactions has not broken even -- it has told us
    // nothing. The same distinction goal_pace.js draws between a stalled goal
    // and an unmeasurable one, and the card is hidden rather than lying.
    assert.equal(note(0, 0), null);
    assert.equal(buildCashFlowNote(), null);
    assert.equal(buildCashFlowNote({}), null);
});

test('the range in the copy matches the range the screen asked for', () => {
    // A figure over 7 days described as 30 is a wrong number with no visible
    // seam -- the exact defect class this codebase keeps finding.
    assert.match(note(4000, 3160, 7).message, /the last 7 days/);
    assert.match(note(4000, 3160, 90).message, /the last 90 days/);
    assert.match(note(4000, 3160, 365).message, /the last year/);
    assert.match(note(4000, 3160, 1).message, /today/);
});

test('amounts read as whole dollars, rounded to nearest rather than truncated', () => {
    // 10000 - 1234.49 is 8765.51, which is $8,766 and not $8,765. Neither
    // income nor expenses is printed on this screen, so nothing here is
    // cross-checkable to the cent -- which is what makes whole dollars safe,
    // the same call goal_pace.js makes for the same reason.
    assert.match(note(4000, 3159.6).message, /\$840\b/);
    assert.match(note(10000, 1234.49).message, /\$8,766\b/);
    assert.equal(note(10000, 1234.49).surplus, 8765.51);
});

test('string inputs still add up', () => {
    // DECIMAL columns arrive through JSON as strings, which is how the
    // price-increase comparison silently failed.
    const result = buildCashFlowNote({ totalIncome: '4000', totalExpenses: '3160', periodDays: 30 });
    assert.equal(result.surplus, 840);
});

// ---------------------------------------------------------------------------
// The compliance boundary, as assertions
// ---------------------------------------------------------------------------

const EVERY_MESSAGE = [
    note(4000, 3160), note(3000, 3320), note(3000, 3000),
    note(4000, 3160, 7), note(4000, 3160, 365), note(4000, 3160, 1),
    note(1000000, 1), note(1, 1000000),
].map((r) => r.message);

test('no note names a product, an institution or an account type', () => {
    // Account types are legal to mention -- they are tax structures, not
    // products -- but this card is not the place: it is derived from the
    // user's own balances, which is what turns naming a destination into
    // personalized advice.
    const banned = [
        'HISA', 'TFSA', 'RRSP', 'FHSA', 'ETF', 'GIC', 'savings account',
        'invest', 'portfolio', 'fund', 'broker', 'bank account',
    ];
    for (const message of EVERY_MESSAGE) {
        for (const word of banned) {
            assert.ok(!message.toLowerCase().includes(word.toLowerCase()),
                `"${message}" names ${word}`);
        }
    }
});

test('no note quotes a rate, a yield or a projected return', () => {
    // The card it replaced invented 4.5% in the route and presented the
    // arithmetic as a forecast.
    for (const message of EVERY_MESSAGE) {
        assert.ok(!/%/.test(message), `"${message}" quotes a percentage`);
        for (const word of ['interest', 'return', 'yield', 'earn', 'rate']) {
            assert.ok(!message.toLowerCase().includes(word),
                `"${message}" promises ${word}`);
        }
    }
});

test('no note tells the reader to do anything', () => {
    // Where the money goes is the reader's decision. The only destination the
    // screen offers is a goal they created, and that lives on a button, not in
    // a sentence asserting what they ought to do.
    for (const message of EVERY_MESSAGE) {
        for (const imperative of ['move ', 'you should', 'consider ', 'execute', 'transfer ']) {
            assert.ok(!message.toLowerCase().includes(imperative),
                `"${message}" instructs: ${imperative.trim()}`);
        }
    }
});

test('and none of them scolds', () => {
    for (const message of EVERY_MESSAGE) {
        for (const scold of ['overspent', 'too much', 'you spent', "you're spending", 'alert']) {
            assert.ok(!message.toLowerCase().includes(scold),
                `"${message}" scolds: ${scold}`);
        }
    }
});
