/**
 * Run with:  npm test   (from packages/backend)
 *
 * The parser between a query string and a SQL WHERE clause.
 *
 * One rule runs through all of it, and it is the only rule worth remembering:
 * **anything not fully recognised filters nothing.** A typo in an amount or a
 * date must show the user everything, never an empty list — an empty list under
 * a filter they did not intend reads as missing data, and the money is what
 * they came to look at.
 *
 * So most of these tests are about junk, and about the shapes of junk that a
 * lenient parser would turn into a real filter without complaining.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseTransactionFilters,
    clampInt,
    parseAmount,
    parseDate,
    parseDirection,
    MAX_DAYS,
    MAX_AMOUNT,
} = require('../src/services/transaction_filters');

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

test('a plain amount parses', () => {
    assert.equal(parseAmount('100'), 100);
    assert.equal(parseAmount('42.50'), 42.5);
    assert.equal(parseAmount('0'), 0);
    assert.equal(parseAmount(250), 250);
});

test('thousands separators are tolerated, because keyboards produce them', () => {
    assert.equal(parseAmount('1,200'), 1200);
    assert.equal(parseAmount('1,200.50'), 1200.5);
});

test('a trailing-garbage amount is refused, not silently truncated', () => {
    // Number.parseFloat('12abc') is 12. A filter of "over $12" invented from a
    // typo is a wrong answer with nothing on screen to notice, which is the
    // whole defect class this module is shaped around.
    assert.equal(parseAmount('12abc'), null);
    assert.equal(parseAmount('$100'), null);
    assert.equal(parseAmount('100 '), 100);   // surrounding space is not garbage
    assert.equal(parseAmount('abc'), null);
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount(undefined), null);
    assert.equal(parseAmount(null), null);
});

test('a negative bound is refused rather than clamped to zero', () => {
    // "at least -5" is not a question anybody asked, and the comparison is
    // against ABS(amount) downstream, so clamping would answer a different one.
    assert.equal(parseAmount('-5'), null);
    assert.equal(parseAmount(-5), null);
});

test('an absurd amount is capped rather than reaching the column', () => {
    assert.equal(parseAmount('999999999999999'), MAX_AMOUNT);
});

test('a repeated parameter cannot be concatenated into a number', () => {
    // Express gives an array for ?min_amount=1&min_amount=2. String(['1','2'])
    // is '1,2', and stripping the separator would make that 12 -- a filter
    // nobody asked for, assembled out of two they did.
    assert.equal(parseAmount(['1', '2']), null);
    assert.equal(parseAmount({}), null);
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('an ISO date parses and is returned unchanged', () => {
    assert.equal(parseDate('2026-03-01'), '2026-03-01');
    assert.equal(parseDate('2026-12-31'), '2026-12-31');
    assert.equal(parseDate(' 2026-03-01 '), '2026-03-01');
});

test('a date that does not exist is refused, not rolled forward', () => {
    // THE test in this file. new Date('2026-02-30') does not throw -- it lands
    // on March 2nd. A fat-fingered day would widen the window by two days with
    // no seam anywhere, so the parser builds the date and checks it came back
    // the same. Same family as the goal-pace Date bug and the DECIMAL[]
    // string comparison: the language cooperates and the answer is wrong.
    assert.equal(parseDate('2026-02-30'), null);
    assert.equal(parseDate('2026-13-01'), null);
    assert.equal(parseDate('2026-00-10'), null);
    assert.equal(parseDate('2026-04-31'), null);
});

test('leap days are real when the year has one, and not when it does not', () => {
    assert.equal(parseDate('2024-02-29'), '2024-02-29');
    assert.equal(parseDate('2026-02-29'), null);
});

test('anything not exactly YYYY-MM-DD is refused', () => {
    assert.equal(parseDate('2026-3-1'), null);
    assert.equal(parseDate('03/01/2026'), null);
    assert.equal(parseDate('2026-03-01T00:00:00Z'), null);
    assert.equal(parseDate('yesterday'), null);
    assert.equal(parseDate(''), null);
    assert.equal(parseDate(undefined), null);
    assert.equal(parseDate(['2026-03-01']), null);
});

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

test('direction is a closed set', () => {
    assert.equal(parseDirection('in'), 'in');
    assert.equal(parseDirection('out'), 'out');
    assert.equal(parseDirection('all'), null);
    assert.equal(parseDirection('IN'), null);
    assert.equal(parseDirection(''), null);
    assert.equal(parseDirection(undefined), null);
});

// ---------------------------------------------------------------------------
// clampInt
// ---------------------------------------------------------------------------

test('clampInt bounds rather than trusting', () => {
    assert.equal(clampInt('30', null, 1, MAX_DAYS), 30);
    assert.equal(clampInt('99999', null, 1, MAX_DAYS), MAX_DAYS);
    assert.equal(clampInt('0', null, 1, MAX_DAYS), 1);
    assert.equal(clampInt('abc', null, 1, MAX_DAYS), null);
    assert.equal(clampInt('', 7, 1, MAX_DAYS), 7);
    assert.equal(clampInt(undefined, 7, 1, MAX_DAYS), 7);
});

test('clampInt refuses an array rather than reading its first element', () => {
    assert.equal(clampInt(['5', '6'], null, 1, 100), null);
});

// ---------------------------------------------------------------------------
// The whole query
// ---------------------------------------------------------------------------

test('an empty query filters on nothing', () => {
    const filter = parseTransactionFilters({});
    assert.equal(filter.days, null);
    assert.equal(filter.search, null);
    assert.equal(filter.flagId, null);
    assert.equal(filter.minAmount, null);
    assert.equal(filter.maxAmount, null);
    assert.equal(filter.startDate, null);
    assert.equal(filter.endDate, null);
    assert.equal(filter.direction, null);
});

test('no argument at all is the same as an empty query', () => {
    // The route always passes req.query, but a default that threw here would
    // be a 500 on a path that has no user-visible cause.
    assert.deepEqual(parseTransactionFilters(), parseTransactionFilters({}));
});

test('a full query parses every part', () => {
    const filter = parseTransactionFilters({
        account_id: 'acct-1',
        days: '90',
        search: '  coffee  ',
        flag_id: '4',
        min_amount: '25',
        max_amount: '1,000',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        direction: 'out',
    });

    assert.equal(filter.accountId, 'acct-1');
    assert.equal(filter.days, 90);
    assert.equal(filter.search, 'coffee');
    assert.equal(filter.flagId, 4);
    assert.equal(filter.minAmount, 25);
    assert.equal(filter.maxAmount, 1000);
    assert.equal(filter.startDate, '2026-03-01');
    assert.equal(filter.endDate, '2026-03-31');
    assert.equal(filter.direction, 'out');
});

test("the untagged set is the flag filter's one non-numeric value", () => {
    assert.equal(parseTransactionFilters({ flag_id: 'none' }).flagId, 'none');
    assert.equal(parseTransactionFilters({ flag_id: 'nonsense' }).flagId, null);
});

test('a whitespace-only search is no search', () => {
    // '   ' would become a LIKE of '%   %' and match almost nothing.
    assert.equal(parseTransactionFilters({ search: '   ' }).search, null);
});

test('one bad filter does not discard the good ones beside it', () => {
    // The failure mode worth avoiding is an all-or-nothing parse: a typo in the
    // maximum silently dropping the range the user actually set.
    const filter = parseTransactionFilters({
        min_amount: '50',
        max_amount: 'oops',
        start_date: '2026-03-01',
        end_date: '2026-02-30',
    });

    assert.equal(filter.minAmount, 50);
    assert.equal(filter.maxAmount, null);
    assert.equal(filter.startDate, '2026-03-01');
    assert.equal(filter.endDate, null);
});

test('paging is deliberately not part of the filter', () => {
    // limit and offset describe a page. An object carrying both could be handed
    // to something that counts rows and quietly return a page instead of a
    // total -- the count-and-total invariant, broken by a shared shape.
    const filter = parseTransactionFilters({ limit: '500', offset: '100' });
    assert.ok(!('limit' in filter), 'limit leaked into the filter');
    assert.ok(!('offset' in filter), 'offset leaked into the filter');
});
