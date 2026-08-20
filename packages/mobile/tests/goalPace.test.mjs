/**
 * Run with:  npm test   (from packages/mobile)
 *
 * Imports the shipped module, not a copy — Node 22 detects the ESM syntax in
 * src/utils, which is why these live there and take no expo import.
 *
 * The server decides what is true about a goal's pace; this file is about what
 * we say. Three rules, and most of the tests below defend one of them:
 *
 *   * never scold — the gap, not a verdict on the person;
 *   * say nothing rather than something hollow;
 *   * round, and hedge, because a pace is an estimate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
    PACE_STATE,
    PACE_TONE,
    roundedMoney,
    formatMonth,
    paceSummary,
    paceDetail,
} from '../src/utils/goalPace.js';

const pace = (over = {}) => ({
    state: PACE_STATE.ON_TRACK,
    remaining: 3000,
    daysRemaining: 143,
    observedDays: 90,
    daysSinceContribution: 4,
    requiredPerMonth: 638.55,
    actualPerMonth: 676.39,
    deltaPerMonth: 37.84,
    projectedDate: '2026-05-16',
    ...over,
});

// ---------------------------------------------------------------------------
// The enum has to match the one the server sends
// ---------------------------------------------------------------------------

test('the state enum mirrors the backend exactly', () => {
    // constants/insights.js drifted from its backend enum once and every card
    // fell back to a generic bulb with a raw type string printed above the
    // title. Asserting the list here is what makes that a failing test rather
    // than a screen nobody looks at closely.
    const require = createRequire(import.meta.url);
    const backend = require('../../backend/src/services/goal_pace.js');

    assert.deepEqual(PACE_STATE, backend.PACE_STATE);
});

test('an unknown state renders nothing rather than leaking the enum', () => {
    assert.equal(paceSummary(pace({ state: 'something_new' })), null);
    assert.equal(paceSummary(null), null);
    assert.equal(paceSummary(undefined), null);
});

// ---------------------------------------------------------------------------
// Rule 1: never scold
// ---------------------------------------------------------------------------

test('being behind states the gap, and passes no judgement', () => {
    const { text, tone } = paceSummary(pace({
        state: PACE_STATE.BEHIND,
        requiredPerMonth: 1521.88,
        deltaPerMonth: -845.49,
    }));

    assert.equal(text, 'About $845/mo short of the pace');
    assert.equal(tone, PACE_TONE.ATTENTION);
});

test('no copy anywhere blames the reader', () => {
    // Cheap to hold and it is the rule most easily lost in a later edit. The
    // equivalent assertion on the insights side is test_insight_identity.cjs.
    const banned = [
        'you should', 'you failed', 'you have not', 'you never', "you're not",
        'falling behind', 'poor', 'bad', 'worse', 'disappointing', 'only saved',
    ];

    const everyState = Object.values(PACE_STATE).flatMap((state) => [
        paceSummary(pace({ state })),
        paceSummary(pace({ state, projectedDate: null })),
        paceSummary(pace({ state, actualPerMonth: -20, daysSinceContribution: null })),
        paceSummary(pace({ state, actualPerMonth: 0, daysSinceContribution: null })),
    ]);

    for (const line of everyState) {
        if (!line) continue;
        const lower = line.text.toLowerCase();
        for (const word of banned) {
            assert.ok(!lower.includes(word), `"${line.text}" contains "${word}"`);
        }
    }
});

// ---------------------------------------------------------------------------
// Rule 2: silence beats filler
// ---------------------------------------------------------------------------

test('a finished goal and a disconnected one get no pace line at all', () => {
    // The card already renders "Target reached" and a reconnect warning
    // respectively. A second line underneath, saying the same thing less
    // clearly, is worse than a gap.
    assert.equal(paceSummary(pace({ state: PACE_STATE.ACHIEVED })), null);
    assert.equal(paceSummary(pace({ state: PACE_STATE.UNMEASURABLE })), null);
    assert.equal(paceDetail(pace({ state: PACE_STATE.ACHIEVED })), null);
    assert.equal(paceDetail(pace({ state: PACE_STATE.UNMEASURABLE })), null);
});

test('a goal with no rate yet and no requirement says nothing', () => {
    assert.equal(
        paceSummary(pace({ state: PACE_STATE.TOO_EARLY, requiredPerMonth: null })),
        null
    );
    assert.equal(
        paceSummary(pace({ state: PACE_STATE.NO_TARGET_DATE, actualPerMonth: null })),
        null
    );
});

test('an overdue goal adds only what the deadline label does not already say', () => {
    // The card prints "18 days past target" from its own date arithmetic.
    // Repeating that is filler; where the current rate lands is not.
    const withRate = paceSummary(pace({ state: PACE_STATE.OVERDUE }));
    assert.equal(withRate.text, 'On pace for May 2026');

    const without = paceSummary(pace({ state: PACE_STATE.OVERDUE, projectedDate: null }));
    assert.equal(without, null);
});

// ---------------------------------------------------------------------------
// Rule 3: it is an estimate, and reads like one
// ---------------------------------------------------------------------------

test('pace figures are whole dollars, never cents', () => {
    // $638.55/mo claims a precision a lifetime average does not have, and
    // invites somebody to transfer exactly that.
    assert.equal(roundedMoney(638.55), '$639');
    assert.equal(roundedMoney(1521.875), '$1,522');
    assert.equal(roundedMoney(0), '$0');

    const on = paceSummary(pace());
    assert.ok(!on.text.includes('.'), on.text);
});

test('a projection is a month, never a day', () => {
    // The estimate moves by a fortnight on one missed transfer. Naming a day
    // invites somebody to hold us to it.
    assert.equal(formatMonth('2026-05-16'), 'May 2026');
    assert.equal(formatMonth('2026-01-01'), 'January 2026');
    assert.equal(formatMonth(null), '');
    assert.equal(formatMonth('nonsense'), '');

    assert.ok(!paceSummary(pace()).text.includes('16'));
});

test('rates are hedged, because they are averages', () => {
    assert.match(paceSummary(pace()).text, /about/i);
    assert.match(paceSummary(pace({ state: PACE_STATE.TOO_EARLY })).text, /about/i);
});

// ---------------------------------------------------------------------------
// The three ways a goal stalls are three different sentences
// ---------------------------------------------------------------------------

test('a manual goal nobody has fed says how long it has been', () => {
    const { text } = paceSummary(pace({
        state: PACE_STATE.STALLED,
        daysSinceContribution: 61,
        actualPerMonth: 676.39,
    }));
    assert.equal(text, 'Nothing added in 9 weeks');
});

test('a balance that has fallen is not described as nothing going in', () => {
    // An account-tracked goal below its baseline has had activity -- the wrong
    // way. Telling somebody "nothing added" while their balance dropped would
    // be visibly untrue to the one person who can check.
    const { text } = paceSummary(pace({
        state: PACE_STATE.STALLED,
        actualPerMonth: -40,
        daysSinceContribution: null,
    }));
    assert.equal(text, 'Balance is lower than when you started');
});

test('a goal that has never had anything in it says exactly that', () => {
    const { text } = paceSummary(pace({
        state: PACE_STATE.STALLED,
        actualPerMonth: 0,
        daysSinceContribution: null,
    }));
    assert.equal(text, 'Nothing saved toward this yet');
});

test('one week is not "1 weeks"', () => {
    const { text } = paceSummary(pace({
        state: PACE_STATE.STALLED,
        daysSinceContribution: 8,
        actualPerMonth: 100,
    }));
    assert.equal(text, 'Nothing added in 1 week');
});

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

test('inside the last month it is an amount and a countdown', () => {
    const { text, tone } = paceSummary(pace({
        state: PACE_STATE.DUE_SOON,
        daysRemaining: 12,
        requiredPerMonth: null,
    }));
    assert.equal(text, '$3,000 to go in 12 days');
    assert.equal(tone, PACE_TONE.ATTENTION);
});

test('one day is not "1 days"', () => {
    const { text } = paceSummary(pace({ state: PACE_STATE.DUE_SOON, daysRemaining: 1 }));
    assert.equal(text, '$3,000 to go in 1 day');
});

test('the day the target arrives is named, not counted', () => {
    const { text } = paceSummary(pace({ state: PACE_STATE.DUE_SOON, daysRemaining: 0 }));
    assert.equal(text, '$3,000 to go by today');
});

test('a countdown that has already run out does not go negative', () => {
    // Goal payloads are cached for 24 hours, so a due_soon block can outlive
    // its own target date: the state is a day stale and the day count has gone
    // below zero. Nothing on the server can produce this -- only the cache can,
    // which is exactly why the client has to hold the floor.
    const { text } = paceSummary(pace({ state: PACE_STATE.DUE_SOON, daysRemaining: -2 }));
    assert.equal(text, '$3,000 to go by today');
    assert.ok(!text.includes('-'), text);
});

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

test('good news is toned as good and problems as attention, nothing as an error', () => {
    // There is no failure state here. Missing a savings target is not an error
    // condition and colouring it like one would be the visual form of scolding.
    assert.equal(paceSummary(pace({ state: PACE_STATE.AHEAD })).tone, PACE_TONE.GOOD);
    assert.equal(paceSummary(pace({ state: PACE_STATE.ON_TRACK })).tone, PACE_TONE.GOOD);
    assert.equal(paceSummary(pace({ state: PACE_STATE.BEHIND })).tone, PACE_TONE.ATTENTION);
    assert.equal(paceSummary(pace({ state: PACE_STATE.STALLED })).tone, PACE_TONE.ATTENTION);
    assert.equal(paceSummary(pace({ state: PACE_STATE.TOO_EARLY })).tone, PACE_TONE.NEUTRAL);

    const tones = new Set(Object.values(PACE_STATE)
        .map((state) => paceSummary(pace({ state })))
        .filter(Boolean)
        .map((s) => s.tone));
    assert.ok([...tones].every((t) => Object.values(PACE_TONE).includes(t)));
});

// ---------------------------------------------------------------------------
// The detail block
// ---------------------------------------------------------------------------

test('both tiles always render, with an em dash where there is no number', () => {
    // A tile that disappears reads as a layout bug. A tile showing an em dash
    // reads as "we cannot tell you that yet", which is what is true.
    const early = paceDetail(pace({ state: PACE_STATE.TOO_EARLY, actualPerMonth: null }));
    assert.equal(early.required, '$639/mo');
    assert.equal(early.actual, '—');
    assert.match(early.actualSub, /history/);

    const noDate = paceDetail(pace({ state: PACE_STATE.NO_TARGET_DATE, requiredPerMonth: null, daysRemaining: null }));
    assert.equal(noDate.required, '—');
    assert.match(noDate.requiredSub, /no target date/);
    assert.equal(noDate.actual, '$676/mo');
});

test('the detail block says how long the pace was measured over', () => {
    // Without it, "$676/mo" over three weeks and over three years look the
    // same, and one of them is worth acting on.
    const d = paceDetail(pace());
    assert.equal(d.actualSub, 'over 13 weeks');
});

test('the projection sentence appears only when there is a date', () => {
    assert.match(paceDetail(pace()).projection, /around May 2026/);
    assert.equal(paceDetail(pace({ projectedDate: null })).projection, null);
});

test('the detail headline is the same sentence as the card, not a second draft', () => {
    // Two hand-written variants of one message drift. The card is the short
    // form and the detail block reuses it verbatim.
    const p = pace({ state: PACE_STATE.BEHIND, deltaPerMonth: -845.49 });
    assert.equal(paceDetail(p).headline, paceSummary(p).text);
    assert.equal(paceDetail(p).tone, paceSummary(p).tone);
});
