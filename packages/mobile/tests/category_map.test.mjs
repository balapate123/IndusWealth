/**
 * Run with:  npm test   (from packages/mobile)
 *
 * Node 22 detects the module syntax in src/utils, so these import the shipped
 * files directly rather than a copy.
 *
 * The parity block loads the *backend* module through createRequire and
 * deep-compares. CATEGORY_PATTERNS already lives in both packages and has
 * drifted before; the category map is the thing that decides whether two names
 * are one category, so a silent divergence would put the original bug back on
 * one side of the wire only — the hardest version to notice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
    CANONICAL_CATEGORIES,
    OTHER_CATEGORY,
    PLAID_CATEGORY_MAP,
    canonicalizeCategory,
} from '../src/utils/categoryMap.js';

import {
    CATEGORY_PATTERNS,
    categorizeTransaction,
    getCategoryMeta,
} from '../src/utils/categorization.js';

const require = createRequire(import.meta.url);
const backend = require('../../backend/src/services/category_map.js');

// ---------------------------------------------------------------------------
// Parity with the backend
// ---------------------------------------------------------------------------

test('the canonical vocabulary is identical on both sides of the wire', () => {
    assert.deepEqual(CANONICAL_CATEGORIES, backend.CANONICAL_CATEGORIES);
    assert.equal(OTHER_CATEGORY, backend.OTHER_CATEGORY);
});

test('the Plaid mapping table is identical on both sides of the wire', () => {
    // Regenerate with scripts/gen-mobile-category-map.js if this fails.
    assert.deepEqual(PLAID_CATEGORY_MAP, backend.PLAID_CATEGORY_MAP);
});

test('both implementations agree on every mapped path', () => {
    for (const path of Object.keys(PLAID_CATEGORY_MAP)) {
        const levels = path.split(' > ');
        assert.equal(
            canonicalizeCategory(levels),
            backend.canonicalizeCategory(levels),
            `disagreement on "${path}"`
        );
    }
});

test('the pattern tables cover the same categories', () => {
    // Icons and colours legitimately differ (Ionicons filled vs outline, ramp
    // index vs hex). The set of category names must not.
    const backendPatterns = require('../../backend/src/services/categorization.js').CATEGORY_PATTERNS;
    assert.deepEqual(
        Object.keys(CATEGORY_PATTERNS).sort(),
        Object.keys(backendPatterns).sort()
    );
});

test('the pattern tables carry the same keywords', () => {
    // Different keywords means a merchant categorized one way in the list and
    // another way in the analytics built from the same rows.
    const backendPatterns = require('../../backend/src/services/categorization.js').CATEGORY_PATTERNS;
    for (const [name, config] of Object.entries(CATEGORY_PATTERNS)) {
        assert.deepEqual(config.keywords, backendPatterns[name].keywords, `keywords differ for "${name}"`);
    }
});

// ---------------------------------------------------------------------------
// The reported bug, client side
// ---------------------------------------------------------------------------

test('a keyword hit and a Plaid fallthrough agree on one name', () => {
    const keywordHit = categorizeTransaction({
        name: 'MCDONALDS #4021',
        category: ['Food and Drink', 'Restaurants'],
    });
    const plaidOnly = categorizeTransaction({
        name: 'CHIPOTLE 2299',
        category: ['Food and Drink', 'Restaurants'],
    });

    assert.equal(keywordHit.category, 'Restaurants');
    assert.equal(plaidOnly.category, 'Restaurants');
});

test('Recreation and Entertainment are one category', () => {
    const plaid = categorizeTransaction({ name: 'SOME VENUE', category: ['Recreation'] });
    const keyword = categorizeTransaction({ name: 'CINEPLEX ODEON', category: [] });

    assert.equal(plaid.category, 'Entertainment');
    assert.equal(keyword.category, 'Entertainment');
});

test('no Plaid top-level name reaches the UI', () => {
    const plaidTopLevels = [
        'Bank Fees', 'Cash Advance', 'Community', 'Food and Drink', 'Healthcare',
        'Interest', 'Payment', 'Recreation', 'Service', 'Shops', 'Tax',
        'Transfer', 'Travel',
    ];

    for (const top of plaidTopLevels) {
        const { category } = categorizeTransaction({
            name: 'MERCHANT MATCHING NO KEYWORD',
            category: [top],
        });
        assert.ok(
            CANONICAL_CATEGORIES.includes(category) || category === OTHER_CATEGORY,
            `"${top}" reached the UI as "${category}"`
        );
    }
});

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

test('every canonical category resolves to a real icon and ramp slot', () => {
    for (const name of CANONICAL_CATEGORIES) {
        const meta = getCategoryMeta(name);
        assert.ok(meta.icon, `"${name}" has no icon`);
        assert.equal(meta.library, 'Ionicons');
        assert.ok(
            Number.isInteger(meta.colorIndex) && meta.colorIndex >= 0 && meta.colorIndex <= 6,
            `"${name}" has colorIndex ${meta.colorIndex}, outside the 7-hue ramp`
        );
    }
});

test('a stale cached raw Plaid name still renders as its real category', () => {
    // AsyncStorage holds a 24h page. Rows written before this change carry raw
    // Plaid names, and a gray wallet icon on them looks like a fresh bug.
    const meta = getCategoryMeta('Food and Drink');
    assert.deepEqual(meta, getCategoryMeta('Restaurants'));
});

test('an unknown name degrades to the neutral slot rather than throwing', () => {
    const meta = getCategoryMeta('Something Nobody Defined');
    assert.equal(meta.colorIndex, null);
    assert.ok(meta.icon);
});

// ---------------------------------------------------------------------------
// Keyword specificity
// ---------------------------------------------------------------------------

test('the longest keyword wins, so UBER EATS is not a commute', () => {
    assert.equal(categorizeTransaction({ name: 'UBER EATS TORONTO ON' }).category, 'Restaurants');
    assert.equal(categorizeTransaction({ name: 'UBER TRIP HELP.UBER.COM' }).category, 'Transportation');
});

test('a transaction with neither keyword nor category is Other', () => {
    assert.equal(categorizeTransaction({ name: 'ZZZ UNKNOWN 9981' }).category, 'Other');
});
