/**
 * Run with:  npm test   (from packages/mobile)
 *
 * The filter set behind the funnel button on both transaction lists.
 *
 * Two things here are load-bearing and the rest is arithmetic:
 *
 * 1. **`days` is dropped when a custom range is set.** The two clauses AND on
 *    the server, and `days` counts back from today, so leaving both on turns a
 *    window in March into an empty list with nothing on screen to explain it.
 * 2. **`describeFilters` never returns null while a filter is on.** The empty
 *    state reads it. Without it, "no transactions" under a forgotten amount
 *    filter reads as missing data, which in a finance app is a genuinely
 *    alarming thing to tell somebody who has done nothing wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DIRECTION,
    EMPTY_FILTERS,
    activeFilterCount,
    describeFilters,
    draftFromFilters,
    filterQueryParts,
    hasDateRange,
    isValidDateText,
    normalizeDraft,
    parseAmountText,
    presetRange,
} from '../src/utils/transactionFilters.js';

/** A fixed "now" so nothing here depends on the day it runs. */
const TODAY = new Date(2026, 8, 23); // 23 Sep 2026, local

// ---------------------------------------------------------------------------
// The query string
// ---------------------------------------------------------------------------

test('no filters contribute nothing', () => {
    assert.deepEqual(filterQueryParts(EMPTY_FILTERS), []);
    assert.deepEqual(filterQueryParts(null), []);
    assert.deepEqual(filterQueryParts(undefined), []);
});

test('a preset window is sent as days when no range is set', () => {
    assert.deepEqual(filterQueryParts(EMPTY_FILTERS, { days: 30 }), ['days=30']);
});

test('A CUSTOM RANGE DROPS days -- the rule this module exists for', () => {
    // days counts back from the server's CURRENT_DATE and ANDs with the range,
    // so sending both asks for "in March AND in the last 30 days" and gets an
    // empty list whose cause is invisible on screen.
    const parts = filterQueryParts(
        { ...EMPTY_FILTERS, startDate: '2026-03-01', endDate: '2026-03-31' },
        { days: 30 }
    );
    assert.ok(!parts.some((p) => p.startsWith('days=')), `days survived: ${parts.join('&')}`);
    assert.ok(parts.includes('start_date=2026-03-01'));
    assert.ok(parts.includes('end_date=2026-03-31'));
});

test('one open end is still a range, and still drops days', () => {
    // The half-open case is the one a naive "both dates set?" check misses.
    assert.ok(!filterQueryParts({ startDate: '2026-03-01' }, { days: 30 }).includes('days=30'));
    assert.ok(!filterQueryParts({ endDate: '2026-03-31' }, { days: 30 }).includes('days=30'));
});

test('amounts and direction are sent only when set', () => {
    assert.deepEqual(
        filterQueryParts({ ...EMPTY_FILTERS, minAmount: 25, maxAmount: 100, direction: DIRECTION.OUT }),
        ['min_amount=25', 'max_amount=100', 'direction=out']
    );
    assert.deepEqual(filterQueryParts({ ...EMPTY_FILTERS, direction: DIRECTION.ALL }), []);
});

test('a zero bound is a bound, not an absent one', () => {
    // `if (f.minAmount)` would drop this, and "under $0" is a real, if odd,
    // question -- while "$0 or more" is how somebody asks for everything.
    assert.deepEqual(filterQueryParts({ ...EMPTY_FILTERS, minAmount: 0 }), ['min_amount=0']);
});

// ---------------------------------------------------------------------------
// The badge
// ---------------------------------------------------------------------------

test('the badge counts decisions, not fields', () => {
    assert.equal(activeFilterCount(EMPTY_FILTERS), 0);
    assert.equal(activeFilterCount({ ...EMPTY_FILTERS, minAmount: 50 }), 1);
    // Both bounds are still one decision: "an amount range".
    assert.equal(activeFilterCount({ ...EMPTY_FILTERS, minAmount: 50, maxAmount: 90 }), 1);
    assert.equal(activeFilterCount({ ...EMPTY_FILTERS, startDate: '2026-03-01', endDate: '2026-03-31' }), 1);
    assert.equal(activeFilterCount({
        ...EMPTY_FILTERS, minAmount: 50, startDate: '2026-03-01', direction: DIRECTION.IN,
    }), 3);
});

test('hasDateRange is true for either end alone', () => {
    assert.equal(hasDateRange({ startDate: '2026-03-01' }), true);
    assert.equal(hasDateRange({ endDate: '2026-03-31' }), true);
    assert.equal(hasDateRange(EMPTY_FILTERS), false);
});

// ---------------------------------------------------------------------------
// Parsing what was typed
// ---------------------------------------------------------------------------

test('an amount parses, empty is no bound, junk is junk', () => {
    assert.equal(parseAmountText('100'), 100);
    assert.equal(parseAmountText('1,200.50'), 1200.5);
    assert.equal(parseAmountText(''), null);
    assert.equal(parseAmountText('   '), null);
    assert.ok(Number.isNaN(parseAmountText('abc')));
    assert.ok(Number.isNaN(parseAmountText('12abc')));
    assert.ok(Number.isNaN(parseAmountText('-5')));
});

test('empty and junk are different answers', () => {
    // Conflating them lets a typo silently remove the filter somebody thought
    // they had set, which is worse than refusing to apply it.
    assert.equal(parseAmountText(''), null);
    assert.notEqual(parseAmountText('abc'), null);
});

test('a date that does not exist is not a date', () => {
    assert.equal(isValidDateText('2026-03-01'), true);
    assert.equal(isValidDateText('2024-02-29'), true);
    assert.equal(isValidDateText('2026-02-29'), false);
    assert.equal(isValidDateText('2026-02-30'), false);
    assert.equal(isValidDateText('2026-13-01'), false);
    assert.equal(isValidDateText('2026-3-1'), false);
    assert.equal(isValidDateText(''), false);
});

// ---------------------------------------------------------------------------
// The draft the sheet edits
// ---------------------------------------------------------------------------

test('a clean draft applies', () => {
    const { ok, filters, errors } = normalizeDraft({
        minAmount: '50', maxAmount: '200',
        startDate: '2026-03-01', endDate: '2026-03-31',
        direction: DIRECTION.OUT,
    });
    assert.equal(ok, true);
    assert.deepEqual(errors, {});
    assert.deepEqual(filters, {
        minAmount: 50, maxAmount: 200,
        startDate: '2026-03-01', endDate: '2026-03-31',
        direction: 'out',
    });
});

test('an empty draft is valid and filters nothing', () => {
    const { ok, filters } = normalizeDraft({});
    assert.equal(ok, true);
    assert.deepEqual(filters, { ...EMPTY_FILTERS });
});

test('a minimum above the maximum is refused, never swapped', () => {
    // Swapping answers a different question than the one asked and does not
    // mention having done so.
    const { ok, errors, filters } = normalizeDraft({ minAmount: '500', maxAmount: '50' });
    assert.equal(ok, false);
    assert.match(errors.amountRange, /minimum/i);
    assert.equal(filters.minAmount, 500, 'the typed values survive so they can be corrected');
    assert.equal(filters.maxAmount, 50);
});

test('a start after an end is refused', () => {
    const { ok, errors } = normalizeDraft({ startDate: '2026-03-31', endDate: '2026-03-01' });
    assert.equal(ok, false);
    assert.match(errors.dateRange, /start date/i);
});

test('equal bounds are fine at both ends', () => {
    // A single day, and an exact amount. Neither is an error.
    assert.equal(normalizeDraft({ startDate: '2026-03-01', endDate: '2026-03-01' }).ok, true);
    assert.equal(normalizeDraft({ minAmount: '50', maxAmount: '50' }).ok, true);
});

test('each bad field reports under itself', () => {
    const { ok, errors } = normalizeDraft({ minAmount: 'abc', endDate: '2026-02-30' });
    assert.equal(ok, false);
    assert.ok(errors.minAmount);
    assert.ok(errors.endDate);
    assert.ok(!errors.maxAmount);
    assert.ok(!errors.startDate);
});

test('an unknown direction falls back to all rather than reaching the query', () => {
    assert.equal(normalizeDraft({ direction: 'sideways' }).filters.direction, DIRECTION.ALL);
});

test('a draft round-trips through the filters it produced', () => {
    // Reopening the sheet has to show what is currently on, or Apply silently
    // clears filters the user never touched.
    const filters = { minAmount: 50, maxAmount: null, startDate: '2026-03-01', endDate: null, direction: 'in' };
    const back = normalizeDraft(draftFromFilters(filters));
    assert.equal(back.ok, true);
    assert.deepEqual(back.filters, filters);
});

// ---------------------------------------------------------------------------
// The preset windows
// ---------------------------------------------------------------------------

test('this month runs from the 1st to today', () => {
    assert.deepEqual(presetRange('this_month', TODAY), {
        startDate: '2026-09-01', endDate: '2026-09-23',
    });
});

test('last month ends on its own last day, whatever that is', () => {
    assert.deepEqual(presetRange('last_month', TODAY), {
        startDate: '2026-08-01', endDate: '2026-08-31',
    });
    // February is the one that catches a hardcoded 30, and a leap February
    // catches a hardcoded 28.
    assert.deepEqual(presetRange('last_month', new Date(2026, 2, 15)), {
        startDate: '2026-02-01', endDate: '2026-02-28',
    });
    assert.deepEqual(presetRange('last_month', new Date(2024, 2, 15)), {
        startDate: '2024-02-01', endDate: '2024-02-29',
    });
});

test('last month crosses a year boundary backwards', () => {
    assert.deepEqual(presetRange('last_month', new Date(2026, 0, 10)), {
        startDate: '2025-12-01', endDate: '2025-12-31',
    });
});

test('three months and this year', () => {
    assert.deepEqual(presetRange('last_3_months', TODAY), {
        startDate: '2026-07-01', endDate: '2026-09-23',
    });
    assert.deepEqual(presetRange('this_year', TODAY), {
        startDate: '2026-01-01', endDate: '2026-09-23',
    });
});

test('an unknown preset clears rather than inventing a window', () => {
    assert.deepEqual(presetRange('nonsense', TODAY), { startDate: null, endDate: null });
});

// ---------------------------------------------------------------------------
// Saying what is filtered
// ---------------------------------------------------------------------------

test('nothing filtered says nothing', () => {
    assert.equal(describeFilters(EMPTY_FILTERS, { today: TODAY }), null);
    assert.equal(describeFilters(null, { today: TODAY }), null);
});

test('EVERY active filter produces a description', () => {
    // The empty state reads this. A filter that narrows the list without
    // appearing in the sentence turns "no transactions" into a claim that the
    // data is missing -- which, in an app about somebody's money, is a
    // genuinely frightening thing to say when it is not true.
    const cases = [
        { minAmount: 100 },
        { maxAmount: 20 },
        { minAmount: 10, maxAmount: 20 },
        { startDate: '2026-03-01' },
        { endDate: '2026-03-31' },
        { startDate: '2026-03-01', endDate: '2026-03-31' },
        { direction: DIRECTION.IN },
        { direction: DIRECTION.OUT },
    ];
    for (const partial of cases) {
        const filters = { ...EMPTY_FILTERS, ...partial };
        assert.ok(activeFilterCount(filters) > 0, 'test case filters nothing');
        const text = describeFilters(filters, { today: TODAY });
        assert.ok(text, `no description for ${JSON.stringify(partial)}`);
    }
});

test('the description reads the way the filter was asked for', () => {
    assert.equal(describeFilters({ minAmount: 100 }, { today: TODAY }), 'over $100');
    assert.equal(describeFilters({ maxAmount: 20 }, { today: TODAY }), 'under $20');
    assert.equal(describeFilters({ minAmount: 10, maxAmount: 20 }, { today: TODAY }), '$10–$20');
    assert.equal(describeFilters({ direction: DIRECTION.OUT }, { today: TODAY }), 'money out');
});

test('a date in another year says which', () => {
    // "Mar 1" with no year, eight months into the next one, is a date the
    // reader cannot place.
    assert.match(describeFilters({ startDate: '2026-03-01' }, { today: TODAY }), /since Mar 1$/);
    assert.match(describeFilters({ startDate: '2025-03-01' }, { today: TODAY }), /2025/);
});

test('the parts join in the order the sheet lists them', () => {
    const text = describeFilters({
        minAmount: 50, startDate: '2026-03-01', endDate: '2026-03-31', direction: DIRECTION.OUT,
    }, { today: TODAY });
    assert.equal(text, 'over $50 · Mar 1 – Mar 31 · money out');
});
