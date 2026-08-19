/**
 * Run with:  npm test   (from packages/backend)
 *
 * The detector's gates, as assertions. Every test here traces back to a line of
 * user-facing copy in docs/superpowers/specs/2026-08-19-watchdog-rebuild-copy.md
 * section 12 — the copy was written first precisely so these rules would have to
 * be stated in plain language before being encoded.
 *
 * Pure module: no database, no network, no Plaid. That is why the logic lives in
 * services/recurrence.js rather than inside services/watchdog.js, which opens a
 * pg pool on require.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    MIN_CHARGES,
    EXPENSE_CLASSES,
    sameAmountRatio,
    classifyFrequency,
    analyzeRecurrence,
    evidenceLine,
} = require('../src/services/recurrence');

// ---------------------------------------------------------------------------
// Fixtures — shapes as they arrive from services/db.js
// ---------------------------------------------------------------------------

const tx = (date, amount, category) => ({
    date,
    amount,
    category: category || null,
    pending: false,
});

/** The bug as reported: fill-ups every week or so, never the same amount. */
const GAS = [
    tx('2026-07-02', 61.40, ['Travel', 'Gas Stations']),
    tx('2026-07-09', 48.15, ['Travel', 'Gas Stations']),
    tx('2026-07-16', 72.90, ['Travel', 'Gas Stations']),
    tx('2026-07-21', 39.05, ['Travel', 'Gas Stations']),
];

/** The minimum case: any merchant visited twice inside ten days. */
const HARDWARE = [
    tx('2026-07-04', 23.11, ['Shops', 'Hardware Store']),
    tx('2026-07-10', 214.80, ['Shops', 'Hardware Store']),
];

/** A real subscription. Same amount, same day of month. */
const NETFLIX = [
    tx('2026-04-14', 16.49, ['Service', 'Subscription']),
    tx('2026-05-14', 16.49, ['Service', 'Subscription']),
    tx('2026-06-14', 16.49, ['Service', 'Subscription']),
    tx('2026-07-14', 16.49, ['Service', 'Subscription']),
];

// ---------------------------------------------------------------------------
// The reported bug
// ---------------------------------------------------------------------------

test('a gas station is not a subscription', () => {
    const r = analyzeRecurrence(GAS);
    assert.equal(r.isRecurring, false);
    assert.equal(r.reason, 'amount_varies');
});

test('two visits to a hardware store are not a subscription', () => {
    const r = analyzeRecurrence(HARDWARE);
    assert.equal(r.isRecurring, false);
    assert.equal(r.reason, 'too_few_charges');
});

test('Netflix still is one', () => {
    const r = analyzeRecurrence(NETFLIX, { merchantCategory: 'Streaming' });
    assert.equal(r.isRecurring, true);
    assert.equal(r.frequency, 'monthly');
    assert.equal(r.expenseClass, EXPENSE_CLASSES.SUBSCRIPTION);
    assert.equal(r.confidence, 'high');
});

// ---------------------------------------------------------------------------
// Gate 1 — "we wait until we've seen a payment at least three times"
// ---------------------------------------------------------------------------

test('two charges is never enough, however perfect the pair', () => {
    // Identical amount, exactly 30 days apart. Still one interval, and a single
    // interval has a standard deviation of zero by definition — which is what
    // made the old scorer rate the weakest possible evidence as 'high'.
    const r = analyzeRecurrence([
        tx('2026-06-14', 16.49),
        tx('2026-07-14', 16.49),
    ]);
    assert.equal(r.isRecurring, false);
    assert.equal(r.reason, 'too_few_charges');
});

test('the third identical charge is what makes it recurring', () => {
    const r = analyzeRecurrence([
        tx('2026-05-14', 16.49),
        tx('2026-06-14', 16.49),
        tx('2026-07-14', 16.49),
    ]);
    assert.equal(r.isRecurring, true);
    assert.equal(MIN_CHARGES, 3);
});

// ---------------------------------------------------------------------------
// Gate 2 — amount stability, and the price increase that must survive it
// ---------------------------------------------------------------------------

test('sameAmountRatio separates a subscription from a habit', () => {
    assert.equal(sameAmountRatio([16.49, 16.49, 16.49, 16.49]), 1);
    assert.equal(sameAmountRatio([61.40, 48.15, 72.90, 39.05]), 0);
});

test('a price increase does not disqualify a subscription', () => {
    // The single most important case for this gate: Netflix raised its price
    // mid-history. If stability were measured as "all amounts are close" this
    // row would vanish — and it is exactly the row we most want to show, since
    // the price-increase alert fires from it.
    const r = analyzeRecurrence([
        tx('2026-04-14', 13.99),
        tx('2026-05-14', 13.99),
        tx('2026-06-14', 16.49),
        tx('2026-07-14', 16.49),
    ], { merchantCategory: 'Streaming' });

    assert.equal(r.isRecurring, true);
    assert.equal(r.amount, 16.49, 'reports the current price, not the average');
});

test('a steady interval cannot rescue an unsteady amount', () => {
    // Every 30 days, wildly different amounts. Interval regularity alone used to
    // be enough; on its own it describes a habit, not a commitment.
    const r = analyzeRecurrence([
        tx('2026-04-03', 210.00),
        tx('2026-05-03', 38.75),
        tx('2026-06-03', 155.20),
        tx('2026-07-03', 92.10),
    ]);
    assert.equal(r.isRecurring, false);
    assert.equal(r.reason, 'amount_varies');
});

// ---------------------------------------------------------------------------
// Gate 3 — the calendar, not the interval. The deleted 'weekly' band.
// ---------------------------------------------------------------------------

test('nothing under ten days apart classifies as recurring any more', () => {
    // classifyFrequency previously returned 'weekly' for ANY average interval
    // between 0 and 10 days, which is the direct cause of the gas station.
    for (const gap of [1, 3, 5, 7, 9, 10]) {
        const dates = [0, 1, 2, 3].map((i) => {
            const d = new Date('2026-07-01T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + i * gap);
            return d.toISOString().slice(0, 10);
        });
        assert.equal(
            classifyFrequency(dates),
            'irregular',
            `${gap}-day spacing must not classify as recurring`
        );
    }
});

test('monthly is a day of the month, not a count of days', () => {
    // Intervals here are 30, 31, 30 — the old 25-35 band and the new rule agree.
    // What matters is that the new rule reaches the answer via the 14th.
    assert.equal(
        classifyFrequency(['2026-04-14', '2026-05-14', '2026-06-14', '2026-07-14']),
        'monthly'
    );
});

test('a bill that slides off a weekend is still monthly', () => {
    // 14th, 15th, 14th, 13th. Intervals 31/30/29. Real statements do this.
    assert.equal(
        classifyFrequency(['2026-04-14', '2026-05-15', '2026-06-14', '2026-07-13']),
        'monthly'
    );
});

test('the end of the month is monthly even though the day changes', () => {
    // 31st, 28th, 31st, 30th. February is not a missed payment.
    assert.equal(
        classifyFrequency(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']),
        'monthly'
    );
});

test('a roughly-monthly habit on scattered days is not monthly', () => {
    // The case the interval band alone cannot reject, and the reason monthly is
    // anchored to a day rather than a gap. Intervals here are 34, 26, 34 — median
    // 34, comfortably inside any 26-35 band — but the charges land on the 2nd,
    // 6th, 1st and 5th. A statement does not wander like that; a shopping trip
    // does.
    assert.equal(
        classifyFrequency(['2026-04-02', '2026-05-06', '2026-06-01', '2026-07-05']),
        'irregular'
    );
});

test('a month-end charge that posts early in February is still monthly', () => {
    // The 31st, the 31st, the 27th (February's 28th fell on a weekend), the
    // 31st. The day spread is 4, past the tolerance — only the month-end rule
    // recognises that the anchor never moved. Without it this reads as
    // irregular and a real commitment disappears from the list every February.
    assert.equal(
        classifyFrequency(['2026-12-31', '2027-01-31', '2027-02-27', '2027-03-31']),
        'monthly'
    );
});

test('bi-weekly survives, because loan and insurance payments use it', () => {
    assert.equal(
        classifyFrequency(['2026-06-05', '2026-06-19', '2026-07-03', '2026-07-17']),
        'bi-weekly'
    );
});

test('annual is recognised across a year gap', () => {
    assert.equal(
        classifyFrequency(['2024-03-08', '2025-03-09', '2026-03-08']),
        'annual'
    );
});

test('a wandering interval is irregular', () => {
    assert.equal(
        classifyFrequency(['2026-04-02', '2026-04-27', '2026-06-11', '2026-07-02']),
        'irregular'
    );
});

// ---------------------------------------------------------------------------
// Classes — "You can cancel these / lower these / plan around them"
// ---------------------------------------------------------------------------

test('a loan payment is a fixed payment, and gets no buttons', () => {
    const r = analyzeRecurrence([
        tx('2026-05-01', 842.00, ['Payment', 'Loan']),
        tx('2026-06-01', 842.00, ['Payment', 'Loan']),
        tx('2026-07-01', 842.00, ['Payment', 'Loan']),
    ]);
    assert.equal(r.isRecurring, true);
    assert.equal(r.expenseClass, EXPENSE_CLASSES.FIXED);
});

test('rent is a fixed payment', () => {
    const r = analyzeRecurrence([
        tx('2026-05-01', 2100.00, ['Payment', 'Rent']),
        tx('2026-06-01', 2100.00, ['Payment', 'Rent']),
        tx('2026-07-01', 2100.00, ['Payment', 'Rent']),
    ]);
    assert.equal(r.expenseClass, EXPENSE_CLASSES.FIXED);
});

test('loans and rent are no longer excluded outright', () => {
    // EXCLUDED_CATEGORIES in watchdog.js listed 'Payment' and 'Loan', which
    // filtered out exactly the commitments the feature was asked to show.
    const loan = analyzeRecurrence([
        tx('2026-05-01', 842.00, ['Payment', 'Loan']),
        tx('2026-06-01', 842.00, ['Payment', 'Loan']),
        tx('2026-07-01', 842.00, ['Payment', 'Loan']),
    ]);
    assert.equal(loan.isRecurring, true);
});

test('insurance is a bill', () => {
    const r = analyzeRecurrence([
        tx('2026-05-12', 138.50, ['Service', 'Insurance']),
        tx('2026-06-12', 138.50, ['Service', 'Insurance']),
        tx('2026-07-12', 138.50, ['Service', 'Insurance']),
    ], { merchantCategory: 'Insurance' });
    assert.equal(r.expenseClass, EXPENSE_CLASSES.BILL);
});

// ---------------------------------------------------------------------------
// The variable-amount exemption, and the hole it must not open
// ---------------------------------------------------------------------------

test('a utility may vary, because a hydro bill genuinely does', () => {
    const r = analyzeRecurrence([
        tx('2026-04-03', 88.12, ['Service', 'Utilities']),
        tx('2026-05-03', 142.06, ['Service', 'Utilities']),
        tx('2026-06-03', 96.44, ['Service', 'Utilities']),
        tx('2026-07-03', 111.90, ['Service', 'Utilities']),
    ], { merchantCategory: 'Utilities' });

    assert.equal(r.isRecurring, true);
    assert.equal(r.expenseClass, EXPENSE_CLASSES.BILL);
});

test('the exemption is merchant-driven, so an unknown merchant cannot use it', () => {
    // The same varying amounts on the same schedule, but nothing identifies the
    // merchant as a utility. If varying amounts alone could promote a row to
    // BILL, every gas station would come straight back in through that door.
    const r = analyzeRecurrence([
        tx('2026-04-03', 88.12),
        tx('2026-05-03', 142.06),
        tx('2026-06-03', 96.44),
        tx('2026-07-03', 111.90),
    ]);
    assert.equal(r.isRecurring, false);
    assert.equal(r.reason, 'amount_varies');
});

// ---------------------------------------------------------------------------
// Gate 4 — confidence has to actually filter
// ---------------------------------------------------------------------------

test('low confidence is never returned as recurring', () => {
    // The old code computed confidence, wrote it to the database, rendered it as
    // an unlabelled dot, and filtered on it nowhere.
    const samples = [GAS, HARDWARE, [tx('2026-06-14', 16.49), tx('2026-07-14', 16.49)]];
    for (const s of samples) {
        const r = analyzeRecurrence(s);
        if (r.isRecurring) {
            assert.notEqual(r.confidence, 'low', 'a low-confidence row reached the screen');
        }
    }
});

// ---------------------------------------------------------------------------
// The evidence line — the copy that replaces the confidence dots
// ---------------------------------------------------------------------------

test('a monthly subscription shows the day and the run length', () => {
    const r = analyzeRecurrence(NETFLIX, { merchantCategory: 'Streaming' });
    assert.equal(evidenceLine(r), 'Charged on the 14th · 4 months running');
});

test('a bill shows its range, because that is the honest thing to show', () => {
    const r = analyzeRecurrence([
        tx('2026-04-03', 88.12, ['Service', 'Utilities']),
        tx('2026-05-03', 142.06, ['Service', 'Utilities']),
        tx('2026-06-03', 96.44, ['Service', 'Utilities']),
        tx('2026-07-03', 111.90, ['Service', 'Utilities']),
    ], { merchantCategory: 'Utilities' });
    assert.equal(evidenceLine(r), 'Monthly, around the 3rd · $88.12–$142.06');
});

test('a subscription never shows a range, even after a price rise', () => {
    // Stated in the copy as a layout rule: a range under Subscriptions means the
    // amount gate leaked, so it must be impossible to render one.
    //
    // The fixture has to be the price-increase case. A subscription with four
    // identical charges cannot produce a range whatever the code does, so it
    // proves nothing — this one has a genuine $13.99-$16.49 spread and must
    // still report the 14th and the run length, because $16.49 is what the user
    // pays now and the spread is history.
    const raised = analyzeRecurrence([
        tx('2026-04-14', 13.99),
        tx('2026-05-14', 13.99),
        tx('2026-06-14', 16.49),
        tx('2026-07-14', 16.49),
    ], { merchantCategory: 'Streaming' });

    assert.equal(raised.expenseClass, EXPENSE_CLASSES.SUBSCRIPTION);
    assert.equal(raised.amountRange[0], 13.99, 'the spread is real');
    assert.equal(evidenceLine(raised), 'Charged on the 14th · 4 months running');
});

test('bi-weekly and annual read as themselves', () => {
    const biweekly = analyzeRecurrence([
        tx('2026-06-05', 61.00, ['Payment', 'Loan']),
        tx('2026-06-19', 61.00, ['Payment', 'Loan']),
        tx('2026-07-03', 61.00, ['Payment', 'Loan']),
        tx('2026-07-17', 61.00, ['Payment', 'Loan']),
    ]);
    assert.equal(evidenceLine(biweekly), 'Every 2 weeks · last 4 charges');

    const annual = analyzeRecurrence([
        tx('2024-03-08', 129.00),
        tx('2025-03-09', 129.00),
        tx('2026-03-08', 129.00),
    ], { merchantCategory: 'Software' });
    assert.equal(evidenceLine(annual), 'Once a year, each March');
});

// ---------------------------------------------------------------------------
// The watch loop depends on this being right
// ---------------------------------------------------------------------------

test('the next charge is predicted from the anchor day, not the last date plus 30', () => {
    // "We'll check your account around Aug 14" is a promise made in the cancel
    // sheet. Adding 30 days to Jul 14 gives Aug 13, and the watch would resolve
    // a day early — reporting a cancellation that has not happened yet.
    const r = analyzeRecurrence(NETFLIX, { merchantCategory: 'Streaming' });
    assert.equal(r.nextExpected, '2026-08-14');
});
