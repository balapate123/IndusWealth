/**
 * Proves the Watchdog write and read paths against real Postgres (PGlite,
 * in-process — no Docker, no server), running the *shipped* service rather than
 * a copy: `pool.query` is redirected at PGlite and `analyzeForUser` is then
 * called for real.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/watchdog_sql_check.js
 *
 * The unit tests cover the detection rules. This covers what they cannot: that
 * the upsert's column list matches its value list, that the new columns are
 * actually written, and that a user's answer survives a re-analysis. Every
 * silent bug this project has shipped — the PUT /insights/preferences column
 * mismatch, the table-qualified ON CONFLICT in recordNudgeShown, the unexported
 * _resolveOwnedAccount — was a write path that no unit test could reach.
 *
 * Not part of `npm test`: the glob is tests/*.test.js and this needs an optional
 * dependency.
 */

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const db = require('../../src/services/db');
const watchdog = require('../../src/services/watchdog');

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

const ok = (label, condition, detail = '') => {
    if (condition) {
        passed++;
        console.log(`  ok   ${label}`);
    } else {
        failed++;
        console.log(`  FAIL ${label} ${detail}`);
    }
};

const USER_ID = 1;

/** Charges for one merchant. */
const charges = (name, category, entries) =>
    entries.map(([date, amount], i) => ({
        plaid_transaction_id: `${name}-${i}`,
        name,
        merchant_name: name,
        amount,
        date,
        category,
        pending: false,
    }));

const GAS = ['Travel', 'Gas Stations'];
const SUB = ['Service', 'Subscription'];
const TEL = ['Service', 'Telecommunication Services'];
const UTL = ['Service', 'Utilities'];
const LOAN = ['Payment', 'Loan'];

const TRANSACTIONS = [
    // The reported bug: fill-ups roughly weekly, never the same amount.
    ...charges('PIONEER #0421', GAS, [
        ['2026-07-02', 61.40], ['2026-07-09', 48.15],
        ['2026-07-16', 72.90], ['2026-07-21', 39.05],
    ]),
    // A real subscription.
    ...charges('NETFLIX.COM', SUB, [
        ['2026-04-14', 16.49], ['2026-05-14', 16.49],
        ['2026-06-14', 16.49], ['2026-07-14', 16.49],
    ]),
    // The name that never found its guide: ROGERS *MOBILE -> ROGERS.
    ...charges('ROGERS *MOBILE', TEL, [
        ['2026-04-08', 95.00], ['2026-05-08', 95.00],
        ['2026-06-08', 95.00], ['2026-07-08', 95.00],
    ]),
    // A bill that legitimately varies.
    ...charges('ENBRIDGE GAS', UTL, [
        ['2026-04-03', 88.12], ['2026-05-03', 142.06],
        ['2026-06-03', 96.44], ['2026-07-03', 111.90],
    ]),
    // Excluded outright until now.
    ...charges('TD AUTO FINANCE', LOAN, [
        ['2026-05-01', 842.00], ['2026-06-01', 842.00], ['2026-07-01', 842.00],
    ]),
];

(async () => {
    const pg = new PGlite();

    // Run the shipped service against real SQL.
    db.pool.query = (text, params) => pg.query(text, params);

    await pg.exec(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
        CREATE TABLE transactions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            plaid_transaction_id TEXT,
            name TEXT,
            merchant_name TEXT,
            amount DECIMAL(15,2),
            date DATE,
            category TEXT[],
            pending BOOLEAN DEFAULT false,
            iso_currency_code TEXT DEFAULT 'CAD'
        );
        INSERT INTO users (id, email) VALUES (1, 'demo@induswealth.com');
    `);

    // The real migrations, in the real order.
    for (const file of ['add_watchdog_tables.sql', 'add_watchdog_classes.sql']) {
        const sql = fs.readFileSync(path.join(__dirname, '../../db', file), 'utf8');
        await pg.exec(sql);
    }
    console.log('\nmigrations applied\n');

    for (const t of TRANSACTIONS) {
        await pg.query(
            `INSERT INTO transactions
                (user_id, plaid_transaction_id, name, merchant_name, amount, date, category, pending)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [USER_ID, t.plaid_transaction_id, t.name, t.merchant_name, t.amount, t.date, t.category, t.pending]
        );
    }

    // ---------------------------------------------------------------------
    console.log('analyzeForUser — the whole write path');
    const result = await watchdog.analyzeForUser(USER_ID, true);
    const byName = Object.fromEntries(result.expenses.map((e) => [e.name, e]));
    const names = Object.keys(byName).sort();

    check('the gas station is gone, everything real is present',
        // 'Enbridge Gas' is the guide's own displayName for the 'Enbridge' key;
        // 'Rogers' is the guide casing for the stored 'ROGERS'; and
        // 'TD AUTO FINANCE' is untouched because we hold no guide for it and
        // inventing title case would render it 'Td Auto Finance'.
        names, ['Enbridge Gas', 'Netflix', 'Rogers', 'TD AUTO FINANCE']);

    // ---------------------------------------------------------------------
    console.log('\nclasses — the three sections');
    check('Netflix is a subscription', byName.Netflix?.expenseClass, 'subscription');
    check('Rogers is a bill', byName.Rogers?.expenseClass, 'bill');
    check('Enbridge is a bill', byName['Enbridge Gas']?.expenseClass, 'bill');
    check('the car loan is a fixed payment', byName['TD AUTO FINANCE']?.expenseClass, 'fixed');

    console.log('\ncategories — one vocabulary');
    check('Netflix is Subscriptions, not Streaming', byName.Netflix?.category, 'Subscriptions');
    check('Rogers is Utilities, not Telecom or Other', byName.Rogers?.category, 'Utilities');
    check('Enbridge is Utilities', byName['Enbridge Gas']?.category, 'Utilities');

    const { CANONICAL_CATEGORIES } = require('../../src/services/category_map');
    ok('every category shown is in the canonical vocabulary',
        result.expenses.every((e) => CANONICAL_CATEGORIES.includes(e.category)),
        JSON.stringify(result.expenses.map((e) => e.category)));

    console.log('\nevidence — what replaces the confidence dots');
    check('Netflix evidence line', byName.Netflix?.evidence, 'Charged on the 14th · 4 months running');
    check('Enbridge shows its range', byName['Enbridge Gas']?.evidence,
        'Monthly, around the 3rd · $88.12–$142.06');
    ok('a subscription never renders a range', !byName.Netflix?.evidence.includes('–'));

    console.log('\nthe guide key that never resolved');
    check('ROGERS *MOBILE stored the Rogers guide key', byName.Rogers?.guideKey, 'Rogers');
    check('and its negotiation script is reachable', byName.Rogers?.hasNegotiation, true);
    check('Netflix has no retention line, so no Negotiate button',
        byName.Netflix?.hasNegotiation, false);

    console.log('\nthe new columns actually landed');
    const cols = await pg.query(
        `SELECT merchant_name, expense_class, guide_key, evidence, day_of_month, next_expected
         FROM recurring_expenses ORDER BY merchant_name`
    );
    ok('every row has a class', cols.rows.every((r) => r.expense_class), '');
    ok('every row has an evidence line', cols.rows.every((r) => r.evidence), '');
    ok('every row has an anchor day', cols.rows.every((r) => r.day_of_month > 0), '');
    const netflixRow = cols.rows.find((r) => r.merchant_name === 'Netflix');
    check('next charge is anchored to the 14th, not last date + 30',
        new Date(netflixRow.next_expected).toISOString().slice(0, 10), '2026-08-14');

    // ---------------------------------------------------------------------
    console.log('\nrecordAction — a guide is never null');
    // Keyed on the display name, matching what the device sees. The stored
    // merchant_name is the upsert key and is still 'ROGERS'.
    const expenseIds = Object.fromEntries(result.expenses.map((e) => [e.name, e.id]));

    const loanAction = await watchdog.recordAction(USER_ID, expenseIds['TD AUTO FINANCE'], 'stop');
    ok('an unguided merchant still gets a guide', Boolean(loanAction.guide));
    ok('with usable steps', (loanAction.guide?.steps || []).length > 0);

    const rogersAction = await watchdog.recordAction(USER_ID, expenseIds.Rogers, 'negotiate');
    ok('Rogers negotiation resolves end to end', Boolean(rogersAction.guide?.negotiationScript));

    // ---------------------------------------------------------------------
    console.log('\nkeep has to stick');
    await watchdog.recordAction(USER_ID, expenseIds.Netflix, 'keep');
    const afterKeep = await pg.query(
        'SELECT action FROM recurring_expenses WHERE id = $1', [expenseIds.Netflix]
    );
    check('keep is stored as keep, not active', afterKeep.rows[0].action, 'keep');

    await watchdog.analyzeForUser(USER_ID, true);
    const afterReanalysis = await pg.query(
        'SELECT action FROM recurring_expenses WHERE id = $1', [expenseIds.Netflix]
    );
    check('and survives a re-analysis', afterReanalysis.rows[0].action, 'keep');

    const reloaded = await watchdog.analyzeForUser(USER_ID, true);
    const netflix = reloaded.expenses.find((e) => e.name === 'Netflix');
    check('but reaches the device as active, for the shipped build', netflix.action, 'active');
    check('with the answer flagged separately', netflix.answered, true);

    // ---------------------------------------------------------------------
    console.log('\nthe contract WatchdogScreen reads');
    // Every field the screen touches, listed so a rename on either side fails
    // loudly here instead of rendering 'undefined' beside a dollar amount.
    const SCREEN_FIELDS = [
        'id', 'name', 'amount', 'category', 'expenseClass', 'evidence',
        'frequency', 'hasNegotiation', 'answered', 'status', 'dueDate',
    ];
    for (const field of SCREEN_FIELDS) {
        ok(`every expense has ${field}`,
            reloaded.expenses.every((e) => e[field] !== undefined));
    }
    ok('every class has a section on the screen',
        reloaded.expenses.every((e) => ['subscription', 'bill', 'fixed'].includes(e.expenseClass)));
    ok('the filter chips start with All', reloaded.categories[0] === 'All');
    ok('and every other chip is canonical',
        reloaded.categories.slice(1).every((c) => CANONICAL_CATEGORIES.includes(c)),
        JSON.stringify(reloaded.categories));

    // The screen renders Negotiate off hasNegotiation alone. A true here with no
    // script behind it is a dead button all over again.
    const { buildGuide } = require('../../src/services/merchant_guides');
    for (const e of reloaded.expenses.filter((x) => x.hasNegotiation)) {
        const row = (await pg.query(
            'SELECT merchant_name, category FROM recurring_expenses WHERE id = $1', [e.id]
        )).rows[0];
        ok(`${e.name}: hasNegotiation implies a real script`, Boolean(buildGuide({
            merchantName: row.merchant_name, action: 'negotiate', category: row.category,
        })));
    }

    console.log('\ncache invalidation');
    const cache = await pg.query('SELECT analysis_version FROM watchdog_analysis_cache');
    check('analysis_version is 2, so old caches re-run', cache.rows[0].analysis_version, 2);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error('\nharness error:', err);
    process.exit(1);
});
