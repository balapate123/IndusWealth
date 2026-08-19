/**
 * Run with:  npm test   (from packages/backend)
 *
 * The watch loop: after a user says they cancelled or negotiated something, did
 * it actually work? This is the only part of Watchdog that no competitor does
 * well, and it is the reason the buttons are worth pressing at all.
 *
 * Pure, like recurrence.js — `today` is injected so the outcomes are assertions
 * rather than something that changes depending on when the suite runs.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    WATCH_STATUS,
    GRACE_DAYS,
    MAX_NEGOTIATE_CYCLES,
    resolveWatch,
    confirmedMonthlySavings,
    firstExpectedAfter,
} = require('../src/services/watch');

const charge = (date, amount) => ({ date, amount });

/** A user who cancelled Netflix on Jul 15, expecting the next charge Aug 14. */
const stopWatch = (over = {}) => ({
    action: 'stop',
    status: WATCH_STATUS.WATCHING,
    startedAt: '2026-07-15',
    expectedChargeDate: '2026-08-14',
    baselineAmount: 16.49,
    cyclesObserved: 0,
    ...over,
});

/** A user who called Rogers on Jul 15, next bill Aug 8, currently $95. */
const negotiateWatch = (over = {}) => ({
    action: 'negotiate',
    status: WATCH_STATUS.WATCHING,
    startedAt: '2026-07-15',
    expectedChargeDate: '2026-08-08',
    baselineAmount: 95.00,
    cyclesObserved: 0,
    ...over,
});

// ---------------------------------------------------------------------------
// Cancelling — the two outcomes that matter
// ---------------------------------------------------------------------------

test('no charge once the grace period is up means it stopped', () => {
    const r = resolveWatch({ watch: stopWatch(), charges: [], today: '2026-08-17' });
    assert.equal(r.status, WATCH_STATUS.STOPPED);
    assert.equal(r.savedMonthly, 16.49);
});

test('a charge after the cancellation means it did not', () => {
    const r = resolveWatch({
        watch: stopWatch(),
        charges: [charge('2026-08-14', 16.49)],
        today: '2026-08-17',
    });
    assert.equal(r.status, WATCH_STATUS.CHARGED_AGAIN);
    assert.equal(r.resolvedAmount, 16.49);
    assert.equal(r.savedMonthly, 0, 'nothing was saved');
});

test('we wait out the grace period before declaring success', () => {
    // The whole point of the grace days. Charges post late; resolving on the
    // expected date would report a cancellation that has not happened yet, and
    // a false all-clear is worse than saying nothing.
    const r = resolveWatch({ watch: stopWatch(), charges: [], today: '2026-08-14' });
    assert.equal(r.status, WATCH_STATUS.WATCHING);
    assert.equal(GRACE_DAYS, 3);
});

test('the last day of grace is still too early; the day after is not', () => {
    const before = resolveWatch({ watch: stopWatch(), charges: [], today: '2026-08-16' });
    assert.equal(before.status, WATCH_STATUS.WATCHING);

    const after = resolveWatch({ watch: stopWatch(), charges: [], today: '2026-08-17' });
    assert.equal(after.status, WATCH_STATUS.STOPPED);
});

test('a watch opened after the charge was already due does not resolve instantly', () => {
    // Someone opens the app on the 19th and cancels something that was due on
    // the 1st. The expected date is already eighteen days past, so the naive
    // deadline has been and gone and the very next analysis would report a
    // confirmed cancellation — having observed nothing at all.
    //
    // Found by the PGlite harness rather than by reasoning: a fixture whose
    // predicted charge date sat in the past resolved on the first pass, which
    // then freed the partial unique index and let a second watch open on the
    // same expense.
    const r = resolveWatch({
        watch: stopWatch({ startedAt: '2026-08-19', expectedChargeDate: '2026-08-01' }),
        charges: [],
        today: '2026-08-20',
    });
    assert.equal(r.status, WATCH_STATUS.WATCHING);
});

test('the observation window is measured from whichever came later', () => {
    const watch = stopWatch({ startedAt: '2026-08-19', expectedChargeDate: '2026-08-01' });
    assert.equal(resolveWatch({ watch, charges: [], today: '2026-08-21' }).status, WATCH_STATUS.WATCHING);
    assert.equal(resolveWatch({ watch, charges: [], today: '2026-08-22' }).status, WATCH_STATUS.STOPPED);
});

test('a due date already past rolls forward to the next real cycle', () => {
    // What the user is told to expect has to be a date that has not happened.
    assert.equal(firstExpectedAfter('2026-08-01', 30, '2026-08-19'), '2026-08-31');
    assert.equal(firstExpectedAfter('2026-08-01', 30, '2026-10-05'), '2026-10-30');
    // Already in the future: left alone.
    assert.equal(firstExpectedAfter('2026-09-14', 30, '2026-08-19'), '2026-09-14');
    // Today is not "after" today.
    assert.equal(firstExpectedAfter('2026-08-19', 30, '2026-08-19'), '2026-09-18');
});

test('the charge that prompted the cancellation is not a charge after it', () => {
    // Someone sees the Jul 14 bill land and cancels on Jul 15. That charge is
    // the reason they acted, not evidence the cancellation failed.
    const r = resolveWatch({
        watch: stopWatch(),
        charges: [charge('2026-07-14', 16.49)],
        today: '2026-08-17',
    });
    assert.equal(r.status, WATCH_STATUS.STOPPED);
});

test('a charge on the day they acted is not counted against them either', () => {
    const r = resolveWatch({
        watch: stopWatch(),
        charges: [charge('2026-07-15', 16.49)],
        today: '2026-08-17',
    });
    assert.equal(r.status, WATCH_STATUS.STOPPED);
});

test('a charge inside the grace window still counts as charged again', () => {
    // Resolving early would have called this one stopped.
    const r = resolveWatch({
        watch: stopWatch(),
        charges: [charge('2026-08-16', 16.49)],
        today: '2026-08-17',
    });
    assert.equal(r.status, WATCH_STATUS.CHARGED_AGAIN);
});

// ---------------------------------------------------------------------------
// Negotiating
// ---------------------------------------------------------------------------

test('a smaller bill is a win, and the saving is the difference', () => {
    const r = resolveWatch({
        watch: negotiateWatch(),
        charges: [charge('2026-08-08', 83.00)],
        today: '2026-08-11',
    });
    assert.equal(r.status, WATCH_STATUS.REDUCED);
    assert.equal(r.resolvedAmount, 83.00);
    assert.equal(r.savedMonthly, 12.00);
});

test('an unchanged bill buys one more cycle before we call it', () => {
    // "Retention offers sometimes land on the following cycle." Declaring
    // failure after one bill would be wrong often enough to matter.
    const first = resolveWatch({
        watch: negotiateWatch(),
        charges: [charge('2026-08-08', 95.00)],
        today: '2026-08-11',
    });
    assert.equal(first.status, WATCH_STATUS.WATCHING);
    assert.equal(first.cyclesObserved, 1);
    assert.notEqual(first.expectedChargeDate, '2026-08-08', 'the watch moves to the next bill');

    const second = resolveWatch({
        watch: negotiateWatch({ cyclesObserved: 1, expectedChargeDate: '2026-09-08' }),
        charges: [charge('2026-09-08', 95.00)],
        today: '2026-09-11',
    });
    assert.equal(second.status, WATCH_STATUS.UNCHANGED);
    assert.equal(second.savedMonthly, 0);
    assert.equal(MAX_NEGOTIATE_CYCLES, 2);
});

test('a bill that went up is unchanged, never a negative saving', () => {
    const r = resolveWatch({
        watch: negotiateWatch({ cyclesObserved: 1 }),
        charges: [charge('2026-08-08', 99.00)],
        today: '2026-08-11',
    });
    assert.equal(r.status, WATCH_STATUS.UNCHANGED);
    assert.equal(r.savedMonthly, 0, 'a rise is not a negative saving, it is no saving');
});

test('a bill that dipped by loose change has not moved', () => {
    // The fixture has to be *lower* than the baseline, or the tolerance is
    // never consulted — anything not below it takes the unchanged path anyway.
    // 40 cents off a $95 phone bill is tax rounding, not a negotiated discount,
    // and reporting it as a win spends the number's credibility.
    const r = resolveWatch({
        watch: negotiateWatch({ cyclesObserved: 1 }),
        charges: [charge('2026-08-08', 94.60)],
        today: '2026-08-11',
    });
    assert.equal(r.status, WATCH_STATUS.UNCHANGED);
    assert.equal(r.savedMonthly, 0);
});

test('the first charge after the action decides, not the latest one', () => {
    // Two bills have landed. The August one is unchanged and the September one
    // is lower. Reading the latest would credit the call for a drop that came a
    // cycle later and skip the cycle counting entirely.
    const r = resolveWatch({
        watch: negotiateWatch(),
        charges: [charge('2026-09-08', 83.00), charge('2026-08-08', 95.00)],
        today: '2026-09-11',
    });
    assert.equal(r.status, WATCH_STATUS.WATCHING);
    assert.equal(r.cyclesObserved, 1);
});

test('and for a cancellation it is the first charge that is reported', () => {
    const r = resolveWatch({
        watch: stopWatch(),
        charges: [charge('2026-09-14', 18.99), charge('2026-08-14', 16.49)],
        today: '2026-09-20',
    });
    assert.equal(r.status, WATCH_STATUS.CHARGED_AGAIN);
    assert.equal(r.resolvedAmount, 16.49, 'the charge that broke the promise, not the newest one');
});

test('no bill yet means keep waiting, however long it takes', () => {
    // A cancelled service stops charging; a bill that has not arrived is not
    // evidence of anything, so a negotiate watch never resolves on silence.
    const r = resolveWatch({ watch: negotiateWatch(), charges: [], today: '2026-10-01' });
    assert.equal(r.status, WATCH_STATUS.WATCHING);
});

// ---------------------------------------------------------------------------
// Resolution is final
// ---------------------------------------------------------------------------

test('a resolved watch is never re-resolved', () => {
    // Otherwise a merchant the user re-subscribes to months later reopens a
    // closed case, and the confirmed savings figure moves under them.
    for (const status of [WATCH_STATUS.STOPPED, WATCH_STATUS.CHARGED_AGAIN, WATCH_STATUS.UNCHANGED]) {
        const r = resolveWatch({
            watch: stopWatch({ status }),
            charges: [charge('2026-09-14', 16.49)],
            today: '2026-09-20',
        });
        assert.equal(r.status, status, `${status} was reopened`);
    }
});

// ---------------------------------------------------------------------------
// The number that replaces the counterfactual
// ---------------------------------------------------------------------------

test('confirmed savings counts only what actually stopped or shrank', () => {
    // The old hero number summed the amounts of everything a user had marked
    // for cancellation, plus a discount percentage parsed out of a prose
    // string. It was money nobody had saved.
    const watches = [
        { status: WATCH_STATUS.STOPPED, baselineAmount: 16.49, resolvedAmount: null },
        { status: WATCH_STATUS.REDUCED, baselineAmount: 95.00, resolvedAmount: 83.00 },
        { status: WATCH_STATUS.CHARGED_AGAIN, baselineAmount: 27.11, resolvedAmount: 27.11 },
        { status: WATCH_STATUS.UNCHANGED, baselineAmount: 40.00, resolvedAmount: 40.00 },
        { status: WATCH_STATUS.WATCHING, baselineAmount: 12.00, resolvedAmount: null },
    ];
    assert.equal(confirmedMonthlySavings(watches), 28.49);
});

test('confirmed savings is zero when nothing has resolved', () => {
    assert.equal(confirmedMonthlySavings([]), 0);
    assert.equal(
        confirmedMonthlySavings([{ status: WATCH_STATUS.WATCHING, baselineAmount: 99, resolvedAmount: null }]),
        0
    );
});
