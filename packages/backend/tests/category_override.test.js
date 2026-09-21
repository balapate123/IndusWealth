/**
 * Run with:  npm test   (from packages/backend)
 *
 * The category a user sees is not stored. It is derived on every read, by five
 * modules, and they do not all take the same route: two go through
 * `categorizeTransaction` in JS, two are SQL aggregates over Plaid's raw array,
 * and Watchdog has its own resolver.
 *
 * So a correction that only reaches the JS path makes the transaction list say
 * `Gas & Fuel` while the treemap still says `Other`. That is the two-vocabularies
 * bug this project already spent a release removing, arriving through a
 * different door.
 *
 * `effectiveCategory` is the one place a category is decided. The last test in
 * this file is the one that keeps it that way.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    CANONICAL_CATEGORIES,
    OTHER_CATEGORY,
    effectiveCategory,
    mergeCanonicalRows,
} = require('../src/services/category_map');

const GAS = ['Travel', 'Gas Stations'];

// ---------------------------------------------------------------------------
// What wins
// ---------------------------------------------------------------------------

test('with no correction, the category is derived exactly as before', () => {
    assert.equal(effectiveCategory({ category: GAS }), 'Gas & Fuel');
    assert.equal(effectiveCategory({ category: GAS, user_category: null }), 'Gas & Fuel');
    assert.equal(effectiveCategory({ category: GAS, user_category: '' }), 'Gas & Fuel');
    assert.equal(effectiveCategory({ category: GAS, user_category: '   ' }), 'Gas & Fuel');
});

test('a correction beats the derivation', () => {
    // The entire feature in one assertion.
    assert.equal(
        effectiveCategory({ category: ['Shops', 'Supermarkets and Groceries'], user_category: 'Gas & Fuel' }),
        'Gas & Fuel'
    );
});

test('a correction stands on its own when Plaid gave us nothing', () => {
    assert.equal(effectiveCategory({ category: null, user_category: 'Groceries' }), 'Groceries');
    assert.equal(effectiveCategory({ category: [], user_category: 'Groceries' }), 'Groceries');
});

test('casing in the stored value does not create a second category', () => {
    // The column is free text as far as Postgres is concerned. A correction
    // written as "gas & fuel" must bucket with "Gas & Fuel" or one category
    // occupies two rows in every chart -- the exact defect canonicalization
    // exists to prevent.
    assert.equal(effectiveCategory({ category: GAS, user_category: 'groceries' }), 'Groceries');
    assert.equal(effectiveCategory({ category: GAS, user_category: '  GROCERIES  ' }), 'Groceries');
});

test('a correction that is no longer in the vocabulary falls back to the derivation', () => {
    // If a canonical name is ever renamed, corrections written under the old
    // name stop resolving. Falling back to what Plaid says is better than
    // rendering a category that no longer exists -- it would group alone, draw
    // the default grey wallet, and match nothing.
    assert.equal(effectiveCategory({ category: GAS, user_category: 'Petrol' }), 'Gas & Fuel');
    assert.equal(effectiveCategory({ category: GAS, user_category: 'Streaming' }), 'Gas & Fuel');
});

test('"Other" is not a correction anybody can store', () => {
    // It is the fallback, not a choice. Setting it would be indistinguishable
    // from having no correction, so the way back to Other is removing the
    // correction, which is what DELETE .../category does.
    assert.ok(!CANONICAL_CATEGORIES.includes(OTHER_CATEGORY));
    assert.equal(effectiveCategory({ category: GAS, user_category: 'Other' }), 'Gas & Fuel');
});

test('nothing at all is Other, not a crash', () => {
    assert.equal(effectiveCategory({}), OTHER_CATEGORY);
    assert.equal(effectiveCategory(null), OTHER_CATEGORY);
    assert.equal(effectiveCategory(undefined), OTHER_CATEGORY);
});

test('every canonical category is storable as a correction', () => {
    // A category the picker offers but the resolver rejects would be a
    // correction that silently does nothing.
    for (const name of CANONICAL_CATEGORIES) {
        assert.equal(effectiveCategory({ category: GAS, user_category: name }), name);
    }
});

// ---------------------------------------------------------------------------
// The SQL aggregates
// ---------------------------------------------------------------------------

const rows = (...entries) => entries.map(([category_path, amount, user_category]) => ({
    category_path,
    amount,
    ...(user_category === undefined ? {} : { user_category }),
}));

test('without an override key, merging behaves exactly as it did', () => {
    // Back-compat matters: every existing caller passes no override key until
    // it is updated, and none of them may change behaviour in the meantime.
    const merged = mergeCanonicalRows(
        rows(['Travel > Gas Stations', 100], ['Food and Drink > Restaurants', 40]),
        { pathKey: 'category_path', sumFields: ['amount'] }
    );
    assert.deepEqual(merged.map((r) => r.category), ['Gas & Fuel', 'Restaurants']);
    assert.equal(merged[0].amount, 100);
});

test('a corrected row buckets under the correction', () => {
    const merged = mergeCanonicalRows(
        rows(['Shops > Supermarkets and Groceries', 60, 'Gas & Fuel']),
        { pathKey: 'category_path', sumFields: ['amount'], overrideKey: 'user_category' }
    );
    assert.deepEqual(merged, [{ category: 'Gas & Fuel', amount: 60 }]);
});

test('corrected and derived rows for one category add up together', () => {
    // The point of doing this in the merge rather than in SQL: two groups that
    // arrive under different paths are one category once the correction is
    // applied, and their sum is what belongs in the chart.
    const merged = mergeCanonicalRows(
        rows(
            ['Travel > Gas Stations', 100],
            ['Shops > Supermarkets and Groceries', 60, 'Gas & Fuel'],
            ['Food and Drink > Restaurants', 25]
        ),
        { pathKey: 'category_path', sumFields: ['amount'], overrideKey: 'user_category' }
    );
    assert.deepEqual(merged, [
        { category: 'Gas & Fuel', amount: 160 },
        { category: 'Restaurants', amount: 25 },
    ]);
});

test('a correction moves money out of the category it came from', () => {
    // Not just "the correction appears" -- the old bucket has to shrink, or the
    // same dollars are counted in two categories and the totals stop adding up.
    const merged = mergeCanonicalRows(
        rows(['Food and Drink > Restaurants', 90], ['Food and Drink > Restaurants', 10, 'Groceries']),
        { pathKey: 'category_path', sumFields: ['amount'], overrideKey: 'user_category' }
    );
    const byName = Object.fromEntries(merged.map((r) => [r.category, r.amount]));
    assert.equal(byName.Restaurants, 90);
    assert.equal(byName.Groceries, 10);
});

test('an unusable correction in a row falls back to that row path', () => {
    const merged = mergeCanonicalRows(
        rows(['Travel > Gas Stations', 100, 'Petrol'], ['Travel > Gas Stations', 50, null]),
        { pathKey: 'category_path', sumFields: ['amount'], overrideKey: 'user_category' }
    );
    assert.deepEqual(merged, [{ category: 'Gas & Fuel', amount: 150 }]);
});

test('ordering is still by the first summed field', () => {
    const merged = mergeCanonicalRows(
        rows(['Travel > Gas Stations', 10], ['Food and Drink > Restaurants', 99, 'Groceries']),
        { pathKey: 'category_path', sumFields: ['amount'], overrideKey: 'user_category' }
    );
    assert.equal(merged[0].category, 'Groceries');
});

// ---------------------------------------------------------------------------
// The test that keeps the choke point a choke point
// ---------------------------------------------------------------------------

test('every module that derives a category is override-aware', () => {
    // `effectiveCategory` is only correct if everything goes through it. This
    // is a heuristic and says so: any file that canonicalises a category or
    // merges canonical rows must also mention the override, meaning somebody
    // thought about it there.
    //
    // It is coarse on purpose. A precise check would need to know which
    // arguments are transaction rows, and a check nobody can maintain gets
    // deleted the first time it is inconvenient. This one fails at the moment a
    // new consumer copies the old pattern, which is the moment that matters --
    // the alternative is noticing in a chart nobody cross-references.
    const root = path.join(__dirname, '..', 'src');

    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
    });

    // category_map.js defines both, so it is the one file exempt.
    const offenders = [];
    for (const file of walk(root)) {
        if (path.basename(file) === 'category_map.js') continue;

        const source = fs.readFileSync(file, 'utf8');
        const derives = /canonicalizeCategory\s*\(|mergeCanonicalRows\s*\(/.test(source);
        if (!derives) continue;

        const aware = /effectiveCategory|user_category/.test(source);
        if (!aware) offenders.push(path.relative(root, file));
    }

    assert.deepEqual(offenders, [],
        `these derive a category without consulting the correction: ${offenders.join(', ')}`);
});
