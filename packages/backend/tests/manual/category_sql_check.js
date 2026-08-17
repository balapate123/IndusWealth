/**
 * Proves the category SQL against real Postgres (PGlite, in-process — no Docker,
 * no server). The unit tests cover the JS mapping; this covers the thing they
 * cannot: that `array_to_string(category, ' > ')` over a text[] actually runs
 * and produces the paths the merge expects.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/category_sql_check.js
 *
 * Not part of `npm test` — the glob is tests/*.test.js and this needs an
 * optional dependency.
 */

const { PGlite } = require('@electric-sql/pglite');
const { mergeCanonicalRows, canonicalizeCategory } = require('../../src/services/category_map');

let passed = 0;
let failed = 0;

const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log(`  ok   ${label}`);
    } else {
        failed++;
        console.log(`  FAIL ${label}`);
        console.log(`       expected ${JSON.stringify(expected)}`);
        console.log(`       actual   ${JSON.stringify(actual)}`);
    }
};

(async () => {
    const db = new PGlite();

    await db.exec(`
        CREATE TABLE transactions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            name TEXT,
            merchant_name TEXT,
            amount NUMERIC NOT NULL,
            date DATE NOT NULL,
            category TEXT[]
        );
    `);

    // The reported bug, as data. Every row below is a restaurant meal; Plaid
    // labelled them at three different depths, and two rows have no category
    // at all. Before the fix these produced separate "Food and Drink" and
    // "Restaurants" rows in the same list.
    await db.exec(`
        INSERT INTO transactions (user_id, name, amount, date, category) VALUES
            (1, 'MCDONALDS #4021',  12.00, CURRENT_DATE - 3, ARRAY['Food and Drink','Restaurants']),
            (1, 'CHIPOTLE 2299',    18.00, CURRENT_DATE - 4, ARRAY['Food and Drink']),
            (1, 'SOME BISTRO',      40.00, CURRENT_DATE - 5, ARRAY['Food and Drink','Restaurants','Fast Food']),
            (1, 'LOCAL DINER',      25.00, CURRENT_DATE - 6, NULL),
            (1, 'CORNER GRILL',     30.00, CURRENT_DATE - 7, ARRAY[]::TEXT[]),
            (1, 'CINEPLEX ODEON',   22.00, CURRENT_DATE - 8, ARRAY['Recreation']),
            (1, 'TICKETMASTER',     55.00, CURRENT_DATE - 9, ARRAY['Recreation','Arts and Entertainment']),
            (1, 'STARBUCKS 118',     6.00, CURRENT_DATE - 2, ARRAY['Food and Drink','Restaurants','Coffee Shop']),
            (1, 'LOBLAWS 1042',    140.00, CURRENT_DATE - 2, ARRAY['Shops','Supermarkets and Groceries']),
            (2, 'OTHER USER MEAL',  99.00, CURRENT_DATE - 2, ARRAY['Food and Drink']);
    `);

    console.log('\n1. The path expression the queries depend on');

    const paths = await db.query(`
        SELECT COALESCE(NULLIF(array_to_string(category, ' > '), ''), 'Other') AS category_path,
               COUNT(*)::int AS n
        FROM transactions WHERE user_id = 1 GROUP BY 1 ORDER BY 1
    `);

    const pathList = paths.rows.map(r => r.category_path).sort();
    check('NULL and empty arrays both become the literal Other', true,
        pathList.includes('Other') && paths.rows.find(r => r.category_path === 'Other').n === 2);
    check('a 3-level array joins to a full path', true,
        pathList.includes('Food and Drink > Restaurants > Coffee Shop'));
    // The bug, counted: nine restaurant/cinema/grocery rows arrive as eight
    // separate raw groups. Section 2 collapses them to five real categories.
    check('raw Plaid splits these rows into 8 groups', paths.rows.length, 8);

    console.log('\n2. getFlagAnalytics — the categories breakdown');

    // Exact shape of the query in db.js getFlagAnalytics.
    const flagRows = await db.query(`
        SELECT COALESCE(NULLIF(array_to_string(t.category, ' > '), ''), 'Other') AS category_path,
               SUM(t.amount)::float AS amount, COUNT(*)::int AS count
        FROM transactions t
        WHERE t.user_id = 1 AND t.amount > 0
        GROUP BY 1
    `);

    const merged = mergeCanonicalRows(flagRows.rows, {
        pathKey: 'category_path',
        sumFields: ['amount', 'count'],
    });

    const byName = Object.fromEntries(merged.map(r => [r.category, r]));

    check('Food and Drink and Restaurants are now one bucket',
        byName.Restaurants.amount, 70);          // 12 + 18 + 40
    check('...with the transaction count summed too',
        byName.Restaurants.count, 3);
    check('the coffee shop kept its own category',
        byName['Coffee & Snacks'].amount, 6);
    check('Recreation folded into Entertainment',
        byName.Entertainment.amount, 77);        // 22 + 55
    check('Shops > Supermarkets became Groceries',
        byName.Groceries.amount, 140);
    check('uncategorized rows land in Other',
        byName.Other.amount, 55);                // 25 + 30
    check('no Plaid vocabulary survives the merge',
        merged.map(r => r.category).filter(n => ['Food and Drink','Recreation','Shops'].includes(n)),
        []);
    check('the merge preserves the grand total',
        merged.reduce((s, r) => s + r.amount, 0), 348);
    check('the other user is not included',
        merged.reduce((s, r) => s + r.count, 0), 9);
    check('rows come back ordered by amount',
        merged.map(r => r.amount), [...merged.map(r => r.amount)].sort((a, b) => b - a));

    console.log('\n3. insight_data — the summary handed to the model');

    const insightRows = await db.query(`
        SELECT COALESCE(NULLIF(array_to_string(category, ' > '), ''), 'Other') as category_path,
               SUM(amount) as total,
               COUNT(*) as count
        FROM transactions
        WHERE user_id = $1
          AND amount > 0
          AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
        GROUP BY 1
    `, [1, 90]);

    const by_category = {};
    let total_spending = 0;
    mergeCanonicalRows(insightRows.rows, {
        pathKey: 'category_path',
        sumFields: ['total', 'count'],
    }).forEach(row => {
        by_category[row.category.toLowerCase().replace(/ /g, '_')] = Math.round(row.total);
        total_spending += row.total;
    });

    check('the model is handed one restaurants line, not two',
        by_category.food_and_drink === undefined && by_category.restaurants === 70, true);
    check('the parameterised date filter still binds, and 8 groups became 5',
        Object.keys(by_category).length, 5);
    check('total spending is unchanged by the merge',
        Math.round(total_spending), 348);

    console.log('\n4. Round trip through canonicalizeCategory');

    const roundTrip = await db.query(`SELECT category FROM transactions WHERE user_id = 1`);
    const names = new Set(roundTrip.rows.map(r => canonicalizeCategory(r.category)));
    check('pg returns text[] as a JS array the mapper accepts',
        [...names].every(n => typeof n === 'string' && n.length > 0), true);

    await db.close();

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
    console.error('\nharness error:', err);
    process.exit(1);
});
