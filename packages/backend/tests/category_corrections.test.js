/**
 * Run with:  npm test   (from packages/backend)
 *
 * The part of "apply this to every Pioneer transaction" that decides which
 * transactions are Pioneer. Pure, because getting it wrong is silent in both
 * directions: too narrow and the correction quietly misses half the fill-ups,
 * too wide and it rewrites a merchant the user never touched.
 *
 * The orchestration around it (upsert the rule, write the rows, clear them
 * again) needs a database and is covered by the PGlite harness instead.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    matchingTransactionIds,
    MAX_BULK_TRANSACTIONS,
} = require('../src/services/category_corrections');

const row = (id, merchant_name, name = null) => ({ id, merchant_name, name });

// ---------------------------------------------------------------------------

test('every branch of one merchant matches', () => {
    // The reason the feature exists. A statement holds PIONEER #0421 one week
    // and PIONEER #0388 the next, and both are Pioneer.
    const ids = matchingTransactionIds([
        row(1, 'PIONEER #0421'),
        row(2, 'PIONEER #0388'),
        row(3, 'PIONEER'),
    ], 'PIONEER');

    assert.deepEqual(ids, [1, 2, 3]);
});

test('a different merchant does not', () => {
    const ids = matchingTransactionIds([
        row(1, 'PIONEER #0421'),
        row(2, 'PETRO-CANADA'),
        row(3, 'ESSO'),
    ], 'PIONEER');

    assert.deepEqual(ids, [1]);
});

test('a merchant that merely contains the key does not match', () => {
    // Substring matching is the tempting shortcut and it is wrong: correcting
    // BELL would drag in BELL MEDIA, CAMPBELL and TACO BELL. Keys are compared
    // whole, after normalisation.
    const ids = matchingTransactionIds([
        row(1, 'BELL CANADA'),
        row(2, 'TACO BELL'),
        row(3, 'CAMPBELLS'),
    ], 'BELL');

    assert.deepEqual(ids, [1]);
});

test('aliases match through to the same merchant', () => {
    // ROGERS WIRELESS and ROGERS CABLE both alias to Rogers, and ROGERS *MOBILE
    // reduces to the same thing once the card-network suffix goes. One
    // correction covers all three -- which is the whole reason the key is the
    // normalised form rather than the string on the statement, and the exact
    // case that made five of twelve cancellation guides unreachable until the
    // Watchdog rebuild.
    const ids = matchingTransactionIds([
        row(1, 'ROGERS WIRELESS'),
        row(2, 'ROGERS CABLE'),
        row(3, 'ROGERS *MOBILE'),
        row(4, 'BELL MOBILITY'),
    ], 'ROGERS');

    assert.deepEqual(ids, [1, 2, 3]);
});

test('an aliased merchant is found under the alias, not the raw name', () => {
    // DISNEYPLUS normalises to Disney+, so the key is DISNEY+ and the raw name
    // does not contain it. Any prefilter based on the text containing the key
    // would miss this one silently -- which is why there is no prefilter.
    const ids = matchingTransactionIds([
        row(1, 'DISNEYPLUS'),
        row(2, 'DISNEY PLUS'),
        row(3, 'NETFLIX.COM'),
    ], 'DISNEY+');

    assert.deepEqual(ids, [1, 2]);
});

test('the raw description is used when there is no merchant name', () => {
    // Plaid leaves merchant_name null often enough that ignoring `name` would
    // make the rule miss a large share of a real statement.
    const ids = matchingTransactionIds([
        row(1, null, 'POS PIONEER #0421 KITCHENER ON'),
        row(2, null, 'PIONEER'),
    ], 'PIONEER');

    // The first keeps its trailing location text, so it is a different merchant
    // once normalised. Being wrong in this direction is the safe one: a
    // correction that misses a row is recoverable, one that reaches a merchant
    // the user never named is not.
    assert.deepEqual(ids, [2]);
});

test('a row with no usable name matches nothing', () => {
    // A null key must never collide with another null key, or one correction
    // would sweep up every nameless transaction at once.
    assert.deepEqual(matchingTransactionIds([row(1, null, null), row(2, '', '')], 'PIONEER'), []);
    assert.deepEqual(matchingTransactionIds([row(1, null, null)], null), []);
    assert.deepEqual(matchingTransactionIds([row(1, null, null)], ''), []);
});

test('casing on either side does not decide the answer', () => {
    assert.deepEqual(matchingTransactionIds([row(1, 'pioneer #0421')], 'PIONEER'), [1]);
    assert.deepEqual(matchingTransactionIds([row(1, 'PIONEER #0421')], 'pioneer'), [1]);
});

test('nothing in, nothing out', () => {
    assert.deepEqual(matchingTransactionIds([], 'PIONEER'), []);
    assert.deepEqual(matchingTransactionIds(null, 'PIONEER'), []);
    assert.deepEqual(matchingTransactionIds(undefined, 'PIONEER'), []);
});

// ---------------------------------------------------------------------------

test('a bulk correction is capped', () => {
    // The endpoint takes ids from the device, so the cap is a bound on what a
    // single request can rewrite. 200 is well above any selection somebody can
    // make by tapping, and well below "the whole account by accident".
    assert.equal(MAX_BULK_TRANSACTIONS, 200);
});
