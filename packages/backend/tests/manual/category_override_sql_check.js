/**
 * Proves the category-correction write and read paths against real Postgres
 * (PGlite, in-process — no Docker, no server), running the *shipped* services
 * rather than copies: `pool.query` is redirected at PGlite and db.js,
 * category_corrections.js and categorization.js are then called for real.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/category_override_sql_check.js
 *
 * The unit tests cover which transactions belong to a merchant and which
 * category wins. This covers what they cannot:
 *
 *   * that the migration applies to a table that already has rows, and twice;
 *   * that a merchant rule is MATERIALISED -- the whole design rests on the
 *     aggregates reading one column with no join, which is only true if the
 *     rows were actually written;
 *   * that a sync applies rules to new transactions and does NOT overwrite a
 *     per-transaction correction;
 *   * that the transaction list and the category breakdown agree. That is the
 *     entire point of the feature and the one thing no unit test can show,
 *     because they reach the category by different routes.
 *
 * Not part of `npm test`: the glob is tests/*.test.js and this needs an
 * optional dependency.
 */

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const db = require('../../src/services/db');
const corrections = require('../../src/services/category_corrections');
const { categorizeTransaction } = require('../../src/services/categorization');

let passed = 0;
let failed = 0;

const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log(`  ok   ${label}`); }
    else {
        failed++;
        console.log(`  FAIL ${label}`);
        console.log(`       expected ${JSON.stringify(expected)}`);
        console.log(`       actual   ${JSON.stringify(actual)}`);
    }
};

const ok = (label, condition, detail = '') => {
    if (condition) { passed++; console.log(`  ok   ${label}`); }
    else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};

const USER = 1;
const OTHER_USER = 2;

const GAS = ['Travel', 'Gas Stations'];
const GROCERIES = ['Shops', 'Supermarkets and Groceries'];

/** Plaid-shaped, as upsertTransactions expects. */
const plaidTx = (id, name, amount, date, category, merchant = null) => ({
    transaction_id: id,
    account_id: 'acct-1',
    name,
    merchant_name: merchant,
    amount,
    date,
    category,
    pending: false,
    iso_currency_code: 'CAD',
});

(async () => {
    const pg = new PGlite();

    // PGlite returns { rows, fields, affectedRows }; node-postgres returns
    // rowCount. Every UPDATE in db.js reports through rowCount, so without this
    // the harness reads undefined and a check on "how many rows moved" passes
    // vacuously against any number at all. Normalised here rather than in db.js
    // -- production is talking to real pg, and bending shipped code to suit a
    // test double is how a harness starts proving the wrong thing.
    db.pool.query = async (text, params) => {
        const result = await pg.query(text, params);
        return {
            ...result,
            rowCount: result.rowCount ?? result.affectedRows ?? result.rows?.length ?? 0,
        };
    };

    await pg.exec(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
        CREATE TABLE accounts (
            id SERIAL PRIMARY KEY, user_id INT NOT NULL,
            plaid_account_id TEXT NOT NULL, name TEXT, mask TEXT,
            current_balance DECIMAL(15,2)
        );
        CREATE TABLE transactions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            account_id INT,
            plaid_transaction_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            merchant_name VARCHAR(255),
            amount DECIMAL(15,2) NOT NULL,
            date DATE NOT NULL,
            category VARCHAR(255)[],
            pending BOOLEAN DEFAULT FALSE,
            iso_currency_code VARCHAR(10) DEFAULT 'CAD',
            notes VARCHAR(500),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, plaid_transaction_id)
        );
        INSERT INTO users (id, email) VALUES (1, 'demo@induswealth.com'), (2, 'other@example.com');
        INSERT INTO accounts (user_id, plaid_account_id, name) VALUES (1, 'acct-1', 'Chequing');
    `);

    // Rows that predate the column, which is every existing user at deploy time.
    await pg.query(
        `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, merchant_name, amount, date, category)
         VALUES (1, 1, 'legacy-1', 'PIONEER #0421', 'PIONEER #0421', 61.40, CURRENT_DATE - 5, $1)`,
        [GAS]
    );

    const migrate = async (file) => {
        const sql = fs.readFileSync(path.join(__dirname, '../../db', file), 'utf8');
        await pg.exec(sql);
    };

    await migrate('add_transaction_flags.sql');
    await migrate('add_transaction_category_override.sql');
    console.log('\nmigrations applied\n');

    // -----------------------------------------------------------------------
    console.log('--- the migration ---\n');

    const col = await pg.query(
        `SELECT is_nullable, data_type FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'user_category'`
    );
    ok('user_category exists and is optional', col.rows[0]?.is_nullable === 'YES', JSON.stringify(col.rows));

    const legacy = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'legacy-1'`);
    check('existing rows start uncorrected', legacy.rows[0].user_category, null);

    // Migrations re-run on every boot.
    await migrate('add_transaction_category_override.sql');
    ok('the migration is idempotent', true);

    const idx = await pg.query(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'transactions' AND indexname = 'idx_transactions_user_category'`
    );
    ok('the index is partial, not a copy of the table',
        /WHERE .*user_category IS NOT NULL/i.test(idx.rows[0]?.indexdef || ''), idx.rows[0]?.indexdef);

    // -----------------------------------------------------------------------
    console.log('\n--- one transaction ---\n');

    const legacyId = (await pg.query(`SELECT id FROM transactions WHERE plaid_transaction_id = 'legacy-1'`)).rows[0].id;

    const single = await corrections.correctTransaction(USER, legacyId, 'Groceries');
    check('a correction applies', single.ok, true);
    check('and creates no rule when it was not asked to', single.rule, null);
    check('and moves nothing else', single.alsoChanged, 0);

    const corrected = await db.getTransactionForCategory(USER, legacyId);
    check('the column holds the correction', corrected.user_category, 'Groceries');
    check('Plaid original is untouched, so this is reversible', corrected.category, GAS);

    const categorized = await categorizeTransaction(corrected);
    check('the shipped resolver returns the correction', categorized.category, 'Groceries');
    check('and says where it came from', categorized.source, 'user');

    check('an unknown category is refused',
        (await corrections.correctTransaction(USER, legacyId, 'Petrol')).reason, 'unknown_category');
    check('and another user cannot reach this row',
        (await corrections.correctTransaction(OTHER_USER, legacyId, 'Groceries')).reason, 'not_found');

    // -----------------------------------------------------------------------
    console.log('\n--- a merchant rule ---\n');

    // Two Pioneer branches, one Esso. Only the Pioneers should move.
    await db.upsertTransactions(USER, [
        plaidTx('p-1', 'PIONEER #0421', 61.40, '2026-09-01', GAS, 'PIONEER #0421'),
        plaidTx('p-2', 'PIONEER #0388', 48.15, '2026-09-05', GAS, 'PIONEER #0388'),
        plaidTx('e-1', 'ESSO', 55.00, '2026-09-06', GAS, 'ESSO'),
    ]);

    const p1 = (await pg.query(`SELECT id FROM transactions WHERE plaid_transaction_id = 'p-1'`)).rows[0].id;
    const ruleResult = await corrections.correctTransaction(USER, p1, 'Gas & Fuel', { applyToMerchant: true });

    check('the rule applies', ruleResult.ok, true);
    check('and is stored under the normalised merchant', ruleResult.rule.merchant_key, 'PIONEER');
    check('with a label a person can read', ruleResult.rule.merchant_label, 'PIONEER');

    const moved = await pg.query(
        `SELECT plaid_transaction_id, user_category FROM transactions
          WHERE user_id = 1 AND user_category = 'Gas & Fuel' ORDER BY plaid_transaction_id`
    );
    // legacy-1 is a PIONEER too, and it already carried a one-off correction to
    // Groceries. The rule overwrites it, which is the right way round: the user
    // has just said "all of them", and honouring an older narrower answer over
    // the newer wider one would look like the rule had not worked. The sync
    // path is the opposite and deliberately so -- there the correction is
    // automatic, so it only fills in rows that have none.
    check('every branch of the merchant moved, the one-off correction included',
        moved.rows.map((r) => r.plaid_transaction_id), ['legacy-1', 'p-1', 'p-2']);
    ok('and the count reported excludes the one they were looking at',
        ruleResult.alsoChanged === 2, `alsoChanged=${ruleResult.alsoChanged}`);

    const esso = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'e-1'`);
    check('a different merchant is left alone', esso.rows[0].user_category, null);

    // -----------------------------------------------------------------------
    console.log('\n--- the rule at sync ---\n');

    await db.upsertTransactions(USER, [
        plaidTx('p-3', 'PIONEER #0421', 70.00, '2026-09-12', GROCERIES, 'PIONEER #0421'),
    ]);
    const p3 = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'p-3'`);
    check('a charge that arrives later gets the rule', p3.rows[0].user_category, 'Gas & Fuel');

    // A per-transaction correction on a merchant that also has a rule.
    const p3Id = (await pg.query(`SELECT id FROM transactions WHERE plaid_transaction_id = 'p-3'`)).rows[0].id;
    await corrections.correctTransaction(USER, p3Id, 'Groceries');
    await db.upsertTransactions(USER, [
        plaidTx('p-3', 'PIONEER #0421', 70.00, '2026-09-12', GROCERIES, 'PIONEER #0421'),
    ]);
    const p3After = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'p-3'`);
    check('a later sync does not undo a per-transaction correction',
        p3After.rows[0].user_category, 'Groceries');

    // -----------------------------------------------------------------------
    console.log('\n--- the list and the chart agree ---\n');

    // This is the whole feature. The breakdown reaches a category through SQL
    // and mergeCanonicalRows; the list reaches it through categorizeTransaction.
    // If those two disagree, the bug is back.
    const flag = await pg.query(
        `INSERT INTO transaction_flags (user_id, name, color_index, icon)
         VALUES (1, 'Fuel', 0, 'flame') RETURNING id`
    );
    await pg.query(
        `INSERT INTO transaction_flag_links (flag_id, transaction_id)
         SELECT $1, id FROM transactions WHERE user_id = 1 AND plaid_transaction_id IN ('p-1','p-2','e-1')`,
        [flag.rows[0].id]
    );

    const analytics = await db.getFlagAnalytics(USER, { flagId: flag.rows[0].id });
    const byCategory = Object.fromEntries(analytics.categories.map((c) => [c.category, c.amount]));

    // 61.40 + 48.15 corrected, plus Esso's 55.00 which derives to the same
    // category on its own. A corrected row and a derived one landing in one
    // bucket is exactly what mergeCanonicalRows has to do.
    check('corrected and derived rows share a bucket',
        Math.round(byCategory['Gas & Fuel'] * 100) / 100, 164.55);
    check('and nothing is double counted', Object.keys(byCategory).length, 1);

    // Now move one of them somewhere else and watch the chart follow.
    const p2Id = (await pg.query(`SELECT id FROM transactions WHERE plaid_transaction_id = 'p-2'`)).rows[0].id;
    await corrections.correctTransaction(USER, p2Id, 'Groceries');

    const after = await db.getFlagAnalytics(USER, { flagId: flag.rows[0].id });
    const afterByCategory = Object.fromEntries(after.categories.map((c) => [c.category, c.amount]));
    check('a correction moves money into its new category',
        Math.round(afterByCategory.Groceries * 100) / 100, 48.15);
    // The old bucket has to shrink by exactly that much, or the same dollars
    // are counted twice and the totals stop adding up.
    check('and exactly that much out of the old one',
        Math.round(afterByCategory['Gas & Fuel'] * 100) / 100, 116.40);

    // -----------------------------------------------------------------------
    console.log('\n--- bulk ---\n');

    const ids = (await pg.query(
        `SELECT id FROM transactions WHERE user_id = 1 AND plaid_transaction_id IN ('p-1','e-1') ORDER BY id`
    )).rows.map((r) => r.id);

    const bulk = await corrections.correctTransactions(USER, ids, 'Transportation');
    check('a selection moves together', bulk.changed, 2);
    check('an unknown category is refused in bulk too',
        (await corrections.correctTransactions(USER, ids, 'Petrol')).reason, 'unknown_category');
    check('an empty selection is refused',
        (await corrections.correctTransactions(USER, [], 'Groceries')).reason, 'no_transactions');
    check('an oversized selection is refused',
        (await corrections.correctTransactions(USER, Array.from({ length: 201 }, (_, i) => i + 1), 'Groceries')).reason,
        'too_many');

    const foreign = await corrections.correctTransactions(OTHER_USER, ids, 'Groceries');
    check('another user changes nothing, and is told so honestly', foreign.changed, 0);

    // -----------------------------------------------------------------------
    console.log('\n--- undo ---\n');

    const revert = await corrections.revertTransaction(USER, p1);
    check('reverting works', revert.ok, true);
    check('and reports the rule it removed', revert.removedRule.merchantLabel, 'PIONEER');

    const rules = await db.getMerchantCategoryRules(USER);
    check('the rule is gone, so it cannot re-apply', rules.length, 0);

    const pioneers = await pg.query(
        `SELECT plaid_transaction_id, user_category FROM transactions
          WHERE user_id = 1 AND plaid_transaction_id LIKE 'p-%' ORDER BY plaid_transaction_id`
    );
    // Including p-2, which the user had separately corrected to Groceries after
    // the rule existed. Provenance is not stored, so "written by the rule" and
    // "corrected by hand afterwards" are indistinguishable here and the wider
    // answer wins. The confirmation on the device says how many rows will be
    // restored, so the cost is visible before it is paid -- but it is a real
    // limitation, recorded in the spec rather than discovered later.
    check('every row the rule had written is cleared',
        pioneers.rows.map((r) => [r.plaid_transaction_id, r.user_category]),
        [['p-1', null], ['p-2', null], ['p-3', null]]);

    const essoAfter = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'e-1'`);
    check('a row the rule never touched keeps its own correction',
        essoAfter.rows[0].user_category, 'Transportation');

    const later = await db.upsertTransactions(USER, [
        plaidTx('p-4', 'PIONEER #0421', 65.00, '2026-09-20', GAS, 'PIONEER #0421'),
    ]) || true;
    const p4 = await pg.query(`SELECT user_category FROM transactions WHERE plaid_transaction_id = 'p-4'`);
    check('and a charge after the undo is not corrected', p4.rows[0].user_category, null);
    ok('sync still completes with no rules at all', later === true);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error('\nharness crashed:', err);
    process.exit(1);
});
