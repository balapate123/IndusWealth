/**
 * Run with:  npm test  (from packages/backend)
 *
 * The compliance tests here are the important ones. A nudge that names a
 * product, or invents a destination for the user's money, is the exact shape
 * that got the app rejected under Google Play's Financial Services policy.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildNudgeCandidates,
    selectNudge,
    suggestedContribution,
    NUDGE_COOLDOWN_DAYS,
    USER_COOLDOWN_DAYS,
    STALLED_DAYS,
} = require('../src/services/nudges');

const NOW = new Date('2026-08-12T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const goal = (over = {}) => ({
    id: 1,
    name: 'Emergency Fund',
    status: 'active',
    target_amount: 5000,
    saved_amount: 1200,
    progress_percent: 24,
    reminder_amount: null,
    needs_relink: false,
    created_at: daysAgo(60),
    last_contribution_at: daysAgo(5),
    ...over,
});

const debt = (over = {}) => ({
    id: 10,
    name: 'Store card',
    balance: 2000,
    apr: 24,
    is_custom: true,
    ...over,
});

const textOf = (items) => JSON.stringify(items).toLowerCase();

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

test('no nudge names a security, a ticker, or a product', () => {
    const items = buildNudgeCandidates({
        goals: [goal(), goal({ id: 2, name: 'House', progress_percent: 95, saved_amount: 4800 })],
        debts: [debt()],
        now: NOW,
    });
    const text = textOf(items);

    for (const banned of [
        'etf', 'ticker', 'vfv', 'xeqt', 'veqt', 'stock', 'index fund',
        'wealthsimple', 'questrade', 'portfolio', 'brokerage', 'invest in',
    ]) {
        assert.ok(!text.includes(banned), `a nudge mentions "${banned}": ${text}`);
    }
});

test('every nudge points at something the user created, never a new destination', () => {
    const items = buildNudgeCandidates({ goals: [goal()], debts: [debt()], now: NOW });
    assert.ok(items.length > 0);

    for (const item of items) {
        assert.ok(
            item.action.type === 'goal' || item.action.type === 'debt',
            `nudge action is neither a goal nor a debt: ${JSON.stringify(item.action)}`
        );
        const id = item.action.goalId ?? item.action.debtId;
        assert.ok(id != null, `nudge action names no existing target: ${JSON.stringify(item.action)}`);
    }
});

test('a user with no goals and no debts gets nothing to say', () => {
    assert.deepEqual(buildNudgeCandidates({ goals: [], debts: [], now: NOW }), []);
    assert.equal(selectNudge([], { lastShownAt: null, seen: {} }, NOW), null);
});

test('Plaid-derived debts are not used — their balances move on their own', () => {
    const items = buildNudgeCandidates({
        goals: [],
        debts: [debt({ is_custom: false })],
        now: NOW,
    });
    assert.deepEqual(items, []);
});

test('nudges do not scold', () => {
    const text = textOf(buildNudgeCandidates({
        goals: [goal({ last_contribution_at: daysAgo(45) })],
        debts: [debt()],
        now: NOW,
    }));

    for (const word of [
        'should have', 'failed', 'you never', 'behind again', 'still not',
        'disappointing', 'bad habit', 'waste',
    ]) {
        assert.ok(!text.includes(word), `a nudge scolds with "${word}"`);
    }
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test('a goal that cannot be measured asks for a reconnect, not a contribution', () => {
    // "Move $25 toward" a number we cannot see is worse than saying nothing.
    const items = buildNudgeCandidates({
        goals: [goal({ needs_relink: true, saved_amount: null, progress_percent: null })],
        now: NOW,
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'goal_relink');
    assert.ok(!/\$\d/.test(items[0].body), `it quotes a figure it cannot know: ${items[0].body}`);
});

test('a nearly-finished goal outranks a stalled one, which outranks a routine step', () => {
    const items = buildNudgeCandidates({
        goals: [
            goal({ id: 1, name: 'Routine' }),
            goal({ id: 2, name: 'Stalled', last_contribution_at: daysAgo(STALLED_DAYS + 5) }),
            goal({ id: 3, name: 'Nearly', saved_amount: 4800, progress_percent: 96 }),
        ],
        now: NOW,
    });

    assert.deepEqual(items.map((i) => i.kind), ['goal_finish', 'goal_stalled', 'goal_step']);
});

test('a goal is only stalled after the threshold, not before', () => {
    const justUnder = buildNudgeCandidates({
        goals: [goal({ last_contribution_at: daysAgo(STALLED_DAYS - 1) })], now: NOW,
    });
    assert.equal(justUnder[0].kind, 'goal_step');

    const justOver = buildNudgeCandidates({
        goals: [goal({ last_contribution_at: daysAgo(STALLED_DAYS) })], now: NOW,
    });
    assert.equal(justOver[0].kind, 'goal_stalled');
});

test('a brand-new goal with no contributions is judged from when it was created', () => {
    const fresh = buildNudgeCandidates({
        goals: [goal({ created_at: daysAgo(2), last_contribution_at: null })], now: NOW,
    });
    assert.equal(fresh[0].kind, 'goal_step', 'a two-day-old goal is not stalled');

    const old = buildNudgeCandidates({
        goals: [goal({ created_at: daysAgo(90), last_contribution_at: null })], now: NOW,
    });
    assert.equal(old[0].kind, 'goal_stalled');
});

test('an achieved or archived goal is left alone', () => {
    assert.deepEqual(buildNudgeCandidates({ goals: [goal({ status: 'achieved' })], now: NOW }), []);
    assert.deepEqual(buildNudgeCandidates({ goals: [goal({ status: 'archived' })], now: NOW }), []);
});

test('a completed goal produces nothing to contribute to', () => {
    const items = buildNudgeCandidates({
        goals: [goal({ saved_amount: 5000, progress_percent: 100 })], now: NOW,
    });
    assert.deepEqual(items, []);
});

// ---------------------------------------------------------------------------
// The suggested amount
// ---------------------------------------------------------------------------

test('the suggested amount never overshoots what is left', () => {
    assert.equal(suggestedContribution(goal({ target_amount: 100, saved_amount: 97 })), 3);
    assert.equal(
        suggestedContribution(goal({ target_amount: 100, saved_amount: 97, reminder_amount: 50 })),
        3,
        "the user's own amount is still capped by what remains"
    );
});

test("the user's own reminder amount wins — they said what a step looks like", () => {
    assert.equal(suggestedContribution(goal({ reminder_amount: 25 })), 25);
});

test('a goal already at or past its target suggests nothing', () => {
    assert.equal(suggestedContribution(goal({ saved_amount: 5000 })), null);
    // Below the baseline: real, and still not a reason to invent a number.
    assert.equal(suggestedContribution(goal({ target_amount: 100, saved_amount: 150 })), null);
});

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

test('one nudge per user per week, however many are eligible', () => {
    const items = buildNudgeCandidates({ goals: [goal(), goal({ id: 2 })], debts: [debt()], now: NOW });

    const tooSoon = selectNudge(items, { lastShownAt: daysAgo(USER_COOLDOWN_DAYS - 1), seen: {} }, NOW);
    assert.equal(tooSoon, null, 'a second nudge inside the week');

    const dueAgain = selectNudge(items, { lastShownAt: daysAgo(USER_COOLDOWN_DAYS), seen: {} }, NOW);
    assert.ok(dueAgain, 'nothing after the cooldown elapsed');
});

test('the same nudge is not repeated inside its own cooldown', () => {
    const items = buildNudgeCandidates({
        goals: [goal({ id: 1, name: 'First' }), goal({ id: 2, name: 'Second' })],
        now: NOW,
    });

    const first = selectNudge(items, { lastShownAt: null, seen: {} }, NOW);
    const next = selectNudge(
        items,
        { lastShownAt: daysAgo(USER_COOLDOWN_DAYS), seen: { [first.key]: daysAgo(NUDGE_COOLDOWN_DAYS - 1) } },
        NOW
    );

    assert.ok(next, 'it should fall through to another nudge, not go silent');
    assert.notEqual(next.key, first.key);
});

test('a nudge becomes eligible again once its own cooldown passes', () => {
    const items = buildNudgeCandidates({ goals: [goal()], now: NOW });
    const key = items[0].key;

    assert.equal(
        selectNudge(items, { lastShownAt: daysAgo(30), seen: { [key]: daysAgo(NUDGE_COOLDOWN_DAYS - 1) } }, NOW),
        null
    );
    assert.ok(
        selectNudge(items, { lastShownAt: daysAgo(30), seen: { [key]: daysAgo(NUDGE_COOLDOWN_DAYS) } }, NOW)
    );
});

test('turning check-ins off silences them entirely', () => {
    const items = buildNudgeCandidates({ goals: [goal()], now: NOW });
    assert.equal(selectNudge(items, { lastShownAt: null, seen: {}, enabled: false }, NOW), null);
});

test('a nudge key is stable across runs, so the cooldown can be recorded against it', () => {
    const a = buildNudgeCandidates({ goals: [goal()], now: NOW })[0].key;
    const b = buildNudgeCandidates({ goals: [goal()], now: new Date(NOW.getTime() + 1000) })[0].key;
    assert.equal(a, b);
    assert.match(a, /^[a-z_]+:\d+$/, `key is not kind:id — ${a}`);
});
