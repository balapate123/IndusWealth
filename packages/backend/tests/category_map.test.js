/**
 * Run with:  npm test   (from packages/backend)
 *
 * These import the shipped modules, not a copy. No DB and no network: the AI
 * layer in categorization.js is lazy and gated on AI_CATEGORIZATION_ENABLED,
 * so categorizeTransaction resolves from the pattern table and the map alone.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    CANONICAL_CATEGORIES,
    OTHER_CATEGORY,
    PLAID_CATEGORY_MAP,
    canonicalizeCategory,
    mergeCanonicalRows,
} = require('../src/services/category_map');

const { CATEGORY_PATTERNS, categorizeTransaction } = require('../src/services/categorization');

// Plaid's legacy taxonomy has exactly these top levels. Every one needs an
// entry, because that is what makes the 'Other' fallback unreachable for real
// Plaid data — an unmapped subcategory still resolves through its parent.
const PLAID_TOP_LEVELS = [
    'Bank Fees', 'Cash Advance', 'Community', 'Food and Drink', 'Healthcare',
    'Interest', 'Payment', 'Recreation', 'Service', 'Shops', 'Tax', 'Transfer',
    'Travel',
];

// ---------------------------------------------------------------------------
// The reported bug
// ---------------------------------------------------------------------------

test('the reported duplicates collapse: Food and Drink is Restaurants', () => {
    assert.equal(canonicalizeCategory(['Food and Drink']), 'Restaurants');
    assert.equal(canonicalizeCategory(['Food and Drink', 'Restaurants']), 'Restaurants');
});

test('the reported duplicates collapse: Recreation is Entertainment', () => {
    assert.equal(canonicalizeCategory(['Recreation']), 'Entertainment');
    assert.equal(canonicalizeCategory(['Recreation', 'Arts and Entertainment']), 'Entertainment');
});

test('a keyword hit and a Plaid fallthrough agree on one name', async () => {
    // The bug in one assertion. Both are dinner. Before the fix the first
    // returned "Restaurants" (keyword) and the second "Food and Drink" (raw
    // Plaid), so one category occupied two rows of the same list.
    const keywordHit = await categorizeTransaction({
        name: 'MCDONALDS #4021',
        category: ['Food and Drink', 'Restaurants'],
    });
    const plaidOnly = await categorizeTransaction({
        name: 'CHIPOTLE 2299',
        category: ['Food and Drink', 'Restaurants'],
    });

    assert.equal(keywordHit.category, 'Restaurants');
    assert.equal(plaidOnly.category, 'Restaurants');
    assert.equal(keywordHit.category, plaidOnly.category);
});

test('no Plaid top-level name survives categorization', async () => {
    // Any of these appearing as a result means a raw vocabulary leaked back in.
    for (const top of PLAID_TOP_LEVELS) {
        const result = await categorizeTransaction({
            name: 'SOME MERCHANT THAT MATCHES NOTHING',
            category: [top],
        });
        assert.ok(
            CANONICAL_CATEGORIES.includes(result.category) || result.category === OTHER_CATEGORY,
            `"${top}" resolved to "${result.category}", which is not in our vocabulary`
        );
    }
});

// ---------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------

test('every mapping target is a category we speak', () => {
    for (const [path, target] of Object.entries(PLAID_CATEGORY_MAP)) {
        assert.ok(
            CANONICAL_CATEGORIES.includes(target) || target === OTHER_CATEGORY,
            `"${path}" maps to "${target}", which is not canonical`
        );
    }
});

test('every canonical category has display metadata', () => {
    // A name with no CATEGORY_PATTERNS entry renders as the gray wallet
    // fallback, which looks like a bug to the user.
    for (const name of CANONICAL_CATEGORIES) {
        assert.ok(CATEGORY_PATTERNS[name], `"${name}" has no pattern/icon entry`);
    }
});

test('every Plaid top-level is mapped, so Other is unreachable for Plaid data', () => {
    for (const top of PLAID_TOP_LEVELS) {
        assert.ok(
            PLAID_CATEGORY_MAP[top.toLowerCase()],
            `no entry for top-level "${top}" — its subcategories would fall to Other`
        );
    }
});

test('map keys are lowercase, or lookup silently misses them', () => {
    for (const path of Object.keys(PLAID_CATEGORY_MAP)) {
        assert.equal(path, path.toLowerCase(), `"${path}" is not lowercased`);
    }
});

// ---------------------------------------------------------------------------
// Lookup semantics
// ---------------------------------------------------------------------------

test('the most specific level wins over its parent', () => {
    // Collapsing to the parent would file every coffee as a restaurant, which
    // is the same information loss the bug caused, one level down.
    assert.equal(
        canonicalizeCategory(['Food and Drink', 'Restaurants', 'Coffee Shop']),
        'Coffee & Snacks'
    );
    assert.equal(canonicalizeCategory(['Food and Drink', 'Restaurants']), 'Restaurants');

    assert.equal(canonicalizeCategory(['Recreation', 'Gyms and Fitness Centers']), 'Fitness');
    assert.equal(canonicalizeCategory(['Travel', 'Taxi']), 'Transportation');
    assert.equal(canonicalizeCategory(['Travel', 'Lodging']), 'Travel');
    assert.equal(canonicalizeCategory(['Shops', 'Supermarkets and Groceries']), 'Groceries');
});

test('an unmapped subcategory falls back to its parent, not to Other', () => {
    assert.equal(canonicalizeCategory(['Food and Drink', 'Something Plaid Added In 2027']), 'Restaurants');
    assert.equal(canonicalizeCategory(['Shops', 'Brand New Subcategory']), 'Shopping');
});

test('our own names round-trip unchanged', () => {
    // analytics.js writes [categoryInfo.category] back onto the transaction and
    // re-reads it, so a canonical name must survive a second pass.
    for (const name of CANONICAL_CATEGORIES) {
        assert.equal(canonicalizeCategory([name]), name, `"${name}" did not round-trip`);
    }
});

test('empty and malformed input resolves to Other rather than throwing', () => {
    assert.equal(canonicalizeCategory(null), OTHER_CATEGORY);
    assert.equal(canonicalizeCategory(undefined), OTHER_CATEGORY);
    assert.equal(canonicalizeCategory([]), OTHER_CATEGORY);
    assert.equal(canonicalizeCategory(['']), OTHER_CATEGORY);
    assert.equal(canonicalizeCategory([null, undefined]), OTHER_CATEGORY);
    assert.equal(canonicalizeCategory('Food and Drink'), 'Restaurants');
});

test('lookup is case and whitespace tolerant', () => {
    assert.equal(canonicalizeCategory(['FOOD AND DRINK']), 'Restaurants');
    assert.equal(canonicalizeCategory(['  Recreation  ']), 'Entertainment');
});

// ---------------------------------------------------------------------------
// Keyword specificity
// ---------------------------------------------------------------------------

test('the longest keyword wins, so UBER EATS is not a commute', async () => {
    // 'UBER' (Transportation) is declared before 'UBER EATS' (Restaurants), so
    // scanning in declaration order filed food delivery as transport.
    const eats = await categorizeTransaction({ name: 'UBER EATS TORONTO ON', category: [] });
    assert.equal(eats.category, 'Restaurants');

    const ride = await categorizeTransaction({ name: 'UBER TRIP HELP.UBER.COM', category: [] });
    assert.equal(ride.category, 'Transportation');
});

test('specificity does not disturb an existing overlap', async () => {
    // TIM HORTONS is claimed by both Restaurants and Coffee & Snacks at equal
    // length. Ties keep declaration order, so this stays where it always was.
    const tims = await categorizeTransaction({ name: 'TIM HORTONS #2201', category: [] });
    assert.equal(tims.category, 'Restaurants');
});

test('GAS STATION beats the bare GAS in Utilities', async () => {
    const fuel = await categorizeTransaction({ name: 'PIONEER GAS STATION', category: [] });
    assert.equal(fuel.category, 'Gas & Fuel');
});

// ---------------------------------------------------------------------------
// Row merging
// ---------------------------------------------------------------------------

test('merge folds raw rows into canonical buckets and sums them', () => {
    const merged = mergeCanonicalRows(
        [
            { category_path: 'Food and Drink > Restaurants', amount: 100, count: 4 },
            { category_path: 'Food and Drink', amount: 50, count: 2 },
            { category_path: 'Recreation', amount: 30, count: 1 },
        ],
        { pathKey: 'category_path', sumFields: ['amount', 'count'] }
    );

    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], { category: 'Restaurants', amount: 150, count: 6 });
    assert.deepEqual(merged[1], { category: 'Entertainment', amount: 30, count: 1 });
});

test('merging before slicing is what keeps a split category in the top N', () => {
    // The reason the merge is in JS and not an ORDER BY ... LIMIT in SQL.
    // Restaurants arrives as two raw rows of 60 that would rank 4th and 5th;
    // together they are 120 and belong first.
    const rows = [
        { category_path: 'Food and Drink > Restaurants', amount: 60, count: 3 },
        { category_path: 'Food and Drink', amount: 60, count: 3 },
        { category_path: 'Shops', amount: 90, count: 2 },
        { category_path: 'Travel > Lodging', amount: 70, count: 1 },
    ];

    const top = mergeCanonicalRows(rows, {
        pathKey: 'category_path',
        sumFields: ['amount', 'count'],
    }).slice(0, 2);

    assert.deepEqual(top.map(r => r.category), ['Restaurants', 'Shopping']);
    assert.equal(top[0].amount, 120);
});

test('merge totals are preserved and numeric strings are handled', () => {
    // pg returns SUM() as a string for numeric columns.
    const rows = [
        { category_path: 'Shops', amount: '10.50', count: '1' },
        { category_path: 'Shops > Pharmacies', amount: '4.50', count: '1' },
        { category_path: 'Other', amount: '5.00', count: '1' },
    ];
    const merged = mergeCanonicalRows(rows, {
        pathKey: 'category_path',
        sumFields: ['amount', 'count'],
    });

    const total = merged.reduce((s, r) => s + r.amount, 0);
    assert.equal(total, 20);
    assert.equal(merged.every(r => typeof r.amount === 'number'), true);
});

test('merge handles an empty result set', () => {
    assert.deepEqual(mergeCanonicalRows([], { sumFields: ['amount'] }), []);
    assert.deepEqual(mergeCanonicalRows(null, { sumFields: ['amount'] }), []);
});
