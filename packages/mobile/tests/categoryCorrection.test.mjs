/**
 * Run with:  npm test   (from packages/mobile)
 *
 * The device derives its own category rather than rendering the server's — the
 * same layers in the same order, implemented twice. That is a deliberate
 * design (it keeps the list responsive with a cached page and no network), and
 * it is also exactly the arrangement that gave this app two category
 * vocabularies once already.
 *
 * So the correction layer has to agree on both sides, and agreeing is what
 * these tests assert against the real backend module rather than against a
 * number written down twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { categorizeTransaction, correctedCategoryOf } from '../src/utils/categorization.js';
import { CANONICAL_CATEGORIES } from '../src/utils/categoryMap.js';

const require = createRequire(import.meta.url);
const backend = require('../../backend/src/services/category_map.js');

// A merchant whose keyword pass lands somewhere specific, so a correction that
// fails to win is visible rather than coincidentally the same answer.
const UBER_EATS = {
    name: 'UBER EATS',
    merchant_name: 'UBER EATS',
    category: ['Food and Drink', 'Restaurants'],
};

test('the correction beats the keyword pass, as it does on the server', () => {
    // Priority 0 exists for this case. UBER EATS matches a keyword, so if the
    // correction were applied anywhere below it the edit would silently do
    // nothing on the one screen the user is looking at.
    assert.equal(categorizeTransaction(UBER_EATS).category, 'Restaurants');
    assert.equal(
        categorizeTransaction({ ...UBER_EATS, user_category: 'Transportation' }).category,
        'Transportation'
    );
});

test('both sides agree for every category a user can pick', () => {
    // Two implementations of one rule, so the rule is asserted across the wire
    // rather than written down twice. This is the check that fails if the
    // generated categoryMap drifts, or if one side gains a normalisation step
    // the other does not.
    for (const name of CANONICAL_CATEGORIES) {
        const onDevice = categorizeTransaction({ ...UBER_EATS, user_category: name }).category;
        const onServer = backend.effectiveCategory({ ...UBER_EATS, user_category: name });
        assert.equal(onDevice, onServer, `disagreed on "${name}"`);
    }
});

test('both sides ignore a correction that is no longer a category', () => {
    // A renamed category must not render: it would group alone and draw the
    // default wallet. Falling back to the derivation is the better failure, and
    // both sides have to choose the same one.
    for (const bogus of ['Petrol', 'Streaming', 'Other', '', '   ']) {
        const onDevice = categorizeTransaction({ ...UBER_EATS, user_category: bogus }).category;
        const onServer = backend.effectiveCategory({ ...UBER_EATS, user_category: bogus });

        // The device runs its keyword pass and the server does not, so the two
        // legitimately differ on the *fallback*. What has to match is that
        // neither treats the value as a correction.
        assert.equal(correctedCategoryOf({ user_category: bogus }), null, bogus);
        assert.notEqual(onDevice, bogus, `device rendered "${bogus}" as a category`);
        assert.notEqual(onServer, bogus, `server rendered "${bogus}" as a category`);
    }
});

test('"Other" is not pickable, so it is not a correction on either side', () => {
    assert.ok(!CANONICAL_CATEGORIES.includes('Other'));
    assert.equal(correctedCategoryOf({ user_category: 'Other' }), null);
});

test('casing does not decide the answer on the device either', () => {
    assert.equal(
        categorizeTransaction({ ...UBER_EATS, user_category: '  groceries ' }).category,
        'Groceries'
    );
});

test('a row with no correction is untouched', () => {
    assert.equal(correctedCategoryOf({}), null);
    assert.equal(correctedCategoryOf(null), null);
    assert.equal(correctedCategoryOf({ user_category: null }), null);
    assert.equal(categorizeTransaction(UBER_EATS).category, 'Restaurants');
});

test('a corrected row still gets an icon and a ramp slot', () => {
    // Without these the row renders a blank tile, which reads as a broken card
    // rather than as a corrected one.
    const result = categorizeTransaction({ ...UBER_EATS, user_category: 'Groceries' });
    assert.ok(result.icon, 'no icon');
    assert.equal(typeof result.colorIndex, 'number');
});
