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
    MIN_PACE_GAP,
    NUDGE_KINDS,
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

/**
 * A pace block as db.js attaches it. Absent from the fixtures above on purpose:
 * a goal from an older payload has no pace and must still produce a nudge.
 */
const pace = (over = {}) => ({
    state: 'behind',
    remaining: 3800,
    daysRemaining: 143,
    observedDays: 90,
    daysSinceContribution: 5,
    requiredPerMonth: 808.44,
    actualPerMonth: 405.83,
    deltaPerMonth: -402.61,
    projectedDate: '2026-11-16',
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
        goals: [
            goal(),
            goal({ id: 2, name: 'House', progress_percent: 95, saved_amount: 4800 }),
            goal({ id: 3, name: 'Car', target_date: '2026-12-31', pace: pace() }),
            goal({ id: 4, name: 'Gone', needs_relink: true, saved_amount: null }),
        ],
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
    const items = buildNudgeCandidates({
        goals: [goal(), goal({ id: 3, name: 'Car', target_date: '2026-12-31', pace: pace() })],
        debts: [debt()],
        now: NOW,
    });
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

test('every kind the builder emits is in the declared list', () => {
    // The device keys an icon off this string, so a kind invented in a branch
    // and never declared renders as a generic sparkle for everybody. Asserting
    // both directions: nothing undeclared is emitted, and nothing declared is
    // unreachable.
    const emitted = new Set(buildNudgeCandidates({
        goals: [
            goal({ id: 1, name: 'Routine' }),
            goal({ id: 2, name: 'Behind', target_date: '2026-12-31', pace: pace() }),
            goal({ id: 3, name: 'Stalled', last_contribution_at: daysAgo(STALLED_DAYS + 5) }),
            goal({ id: 4, name: 'Gone', needs_relink: true, saved_amount: null }),
            goal({ id: 5, name: 'Nearly', saved_amount: 4800, progress_percent: 96 }),
        ],
        debts: [debt()],
        now: NOW,
    }).map((i) => i.kind));

    assert.deepEqual([...emitted].sort(), [...NUDGE_KINDS].sort());
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
        goals: [
            goal({ last_contribution_at: daysAgo(45) }),
            goal({ id: 3, name: 'Car', target_date: '2026-12-31', pace: pace() }),
        ],
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

// ---------------------------------------------------------------------------
// Behind the pace — money is going in, just not fast enough
// ---------------------------------------------------------------------------

test('a goal behind its own pace gets the shortfall, not a generic step', () => {
    // Until this branch existed, a goal being fed steadily but too slowly for
    // its deadline produced the same "Move $190 toward X" as a goal with no
    // deadline at all -- the one case where we could say something specific and
    // did not.
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace() })],
        now: NOW,
    });

    assert.equal(item.kind, 'goal_behind');
    assert.equal(item.key, 'goal_behind:1');
    assert.equal(item.body, 'Adding about $403 a month would put this back on pace for December 2026.');
});

test('it names a month, never a day', () => {
    // The pace behind it is an average; naming 31 December invites somebody to
    // hold us to it. Same rule as the projection on the goal screen.
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace() })],
        now: NOW,
    });
    assert.ok(!item.body.includes('31'), item.body);
});

test('a target date that arrives as a Date object still reads', () => {
    // node-postgres parses DATE columns into Date objects, which is what broke
    // every pace calculation until parseDate learned to take both.
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: new Date(2026, 11, 31), pace: pace() })],
        now: NOW,
    });
    assert.match(item.body, /December 2026/, item.body);
});

test('the shortfall outranks a routine step and is outranked by a stall', () => {
    const items = buildNudgeCandidates({
        goals: [
            goal({ id: 1, name: 'Routine' }),
            goal({ id: 2, name: 'Behind', target_date: '2026-12-31', pace: pace() }),
            goal({ id: 3, name: 'Stalled', last_contribution_at: daysAgo(STALLED_DAYS + 5) }),
            goal({ id: 4, name: 'Gone', needs_relink: true, saved_amount: null }),
            goal({ id: 5, name: 'Nearly', saved_amount: 4800, progress_percent: 96 }),
        ],
        debts: [debt()],
        now: NOW,
    });

    assert.deepEqual(items.map((i) => i.kind), [
        'goal_finish', 'goal_relink', 'goal_stalled', 'goal_behind', 'goal_step', 'debt_interest',
    ]);
});

test('a goal that is both stalled and behind asks for the stall', () => {
    // "Nothing added in 40 days" is a clearer ask than a monthly rate: it needs
    // any action at all, not a bigger one. Two nudges about one goal would also
    // let a single goal occupy the weekly slot twice running.
    const items = buildNudgeCandidates({
        goals: [goal({
            target_date: '2026-12-31',
            last_contribution_at: daysAgo(STALLED_DAYS + 19),
            pace: pace(),
        })],
        now: NOW,
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'goal_stalled');
});

test('a goal with no pace block still produces a nudge', () => {
    // Payloads from an older build, and any goal not read through
    // getGoals/getGoalById, carry no pace. Falling through to the routine step
    // is correct; throwing on a missing key would take the whole check-in down.
    const items = buildNudgeCandidates({ goals: [goal({ pace: undefined })], now: NOW });
    assert.equal(items[0].kind, 'goal_step');

    assert.equal(buildNudgeCandidates({ goals: [goal({ pace: null })], now: NOW })[0].kind, 'goal_step');
});

test('only behind earns a shortfall nudge', () => {
    for (const state of ['on_track', 'ahead', 'too_early', 'unmeasurable', 'no_target_date', 'overdue']) {
        const items = buildNudgeCandidates({
            goals: [goal({ target_date: '2026-12-31', pace: pace({ state }) })],
            now: NOW,
        });
        assert.notEqual(items[0].kind, 'goal_behind', `state "${state}" produced a shortfall nudge`);
    }
});

test('a goal inside its last month gets no shortfall nudge', () => {
    // There is no monthly rate left to offer, and the only remaining thing to
    // say is that a date the user set is about to pass -- which changes nothing
    // they can act on. A due-soon goal that IS within reach is already caught
    // by goal_finish at 90%.
    const items = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-08-24', pace: pace({ state: 'due_soon', daysRemaining: 12 }) })],
        now: NOW,
    });
    assert.equal(items[0].kind, 'goal_step');
});

test('a shortfall of a couple of dollars is not worth an interruption', () => {
    // The on-track band is 5% wide, so a small goal can be "behind" by very
    // little. One nudge a week is a scarce resource.
    const items = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace({ deltaPerMonth: -(MIN_PACE_GAP - 1) }) })],
        now: NOW,
    });
    assert.equal(items[0].kind, 'goal_step');

    const worth = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace({ deltaPerMonth: -MIN_PACE_GAP }) })],
        now: NOW,
    });
    assert.equal(worth[0].kind, 'goal_behind');
});

test('the ask never exceeds what is left to save', () => {
    // A goal nearly done but nearly out of time has a monthly requirement well
    // above its own remaining balance. Asking for more than the target reads as
    // a machine not paying attention.
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace({ remaining: 60, deltaPerMonth: -900 }) })],
        now: NOW,
    });
    assert.match(item.body, /\$60 a month/, item.body);
});

test('a shortfall reported as a positive number is still a shortfall', () => {
    // deltaPerMonth is actual minus required, so behind is negative. Taking the
    // absolute value means a sign convention change upstream cannot turn the
    // ask into "adding about $-403 a month".
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: '2026-12-31', pace: pace({ deltaPerMonth: 402.61 }) })],
        now: NOW,
    });
    assert.ok(!item.body.includes('-'), item.body);
});

test('a behind pace with no target date still reads', () => {
    // Not reachable from the server -- behind requires a future target date --
    // but a cached payload can pair a stale state with a cleared date, and
    // "back on pace for null" is the visible form of that.
    const [item] = buildNudgeCandidates({
        goals: [goal({ target_date: null, pace: pace() })],
        now: NOW,
    });
    assert.equal(item.body, 'Adding about $403 a month would put this back on pace.');
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
