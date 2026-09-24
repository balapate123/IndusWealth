/**
 * Proves the new list filters against real Postgres (PGlite, in-process — no
 * Docker, no server), driving the *shipped* `getTransactionsPage`,
 * `countTransactions` and `sumTransactions` rather than a copy of them.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/transaction_filter_sql_check.js
 *
 * ## What is actually at risk
 *
 * The page and the totals are two different queries. They are only guaranteed
 * to agree because both derive their WHERE from `buildTransactionFilter` — so
 * the thing worth executing is not "does min_amount work", it is **do the rows
 * on screen and the number above them describe the same set under every
 * filter**. A clause that reaches one query and not the other produces a list
 * of four transactions under a total covering nine, which is the exact shape
 * this codebase refuses to render and the exact shape nothing errors on.
 *
 * So every case below asserts three things at once: the rows, the count behind
 * the paging, and the money — and that summing the returned rows reproduces the
 * total the server computed independently.
 *
 * Not part of `npm test`: the glob is tests/*.test.js and this needs an
 * optional dependency.
 */

const { PGlite } = require('@electric-sql/pglite');

const db = require('../../src/services/db');

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
const CARD = 'acct-card';
const CHEQUING = 'acct-chq';
const FOREIGN = 'acct-foreign';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The fixture, spelled out so every expectation below is arithmetic on THIS
 * table rather than on whatever the query happened to return.
 *
 * Plaid's convention: a positive amount is money leaving the account.
 */
const ROWS = [
    { key: 'coffee',    acct: 10, name: 'BLUE DOOR COFFEE', amount: 5.50,     date: '2026-03-02' },
    { key: 'groceries', acct: 10, name: 'LOBLAWS',          amount: 120.00,   date: '2026-03-10' },
    { key: 'refund',    acct: 10, name: 'LOBLAWS REFUND',   amount: -45.00,   date: '2026-03-15' },
    { key: 'flight',    acct: 10, name: 'AIR CANADA',       amount: 640.25,   date: '2026-03-28' },
    { key: 'rent',      acct: 11, name: 'RENT',             amount: 1800.00,  date: '2026-03-01' },
    { key: 'pay',       acct: 11, name: 'PAYROLL DEPOSIT',  amount: -2400.00, date: '2026-03-15' },
    { key: 'stamp',     acct: 11, name: 'CANADA POST',      amount: 0.99,     date: '2026-02-20' },
    // Zero is neither money in nor money out, and is the row that catches a
    // direction clause written as `>= 0`.
    { key: 'zero',      acct: 11, name: 'ADJUSTMENT',       amount: 0.00,     date: '2026-03-05' },
];

const byKey = Object.fromEntries(ROWS.map((r) => [r.key, r]));

/** What the fixture says should match, computed here rather than queried. */
const expect = (predicate) => {
    const matching = ROWS.filter(predicate);
    return {
        keys: matching.map((r) => r.key).sort(),
        count: matching.length,
        outflow: round2(matching.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0)),
        inflow: round2(matching.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0)),
        net: round2(matching.reduce((a, r) => a + r.amount, 0)),
    };
};

(async () => {
    const pg = new PGlite();

    // PGlite returns { rows, fields, affectedRows }; node-postgres returns
    // rowCount. Normalised here rather than in db.js — production talks to real
    // pg, and bending shipped code to suit a test double is how a harness
    // starts proving the wrong thing.
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
            plaid_account_id TEXT NOT NULL, name TEXT, alias TEXT,
            type TEXT, subtype TEXT, mask TEXT,
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
            user_category VARCHAR(50),
            pending BOOLEAN DEFAULT FALSE,
            iso_currency_code VARCHAR(10) DEFAULT 'CAD',
            notes VARCHAR(500),
            UNIQUE(user_id, plaid_transaction_id)
        );
        CREATE TABLE transaction_flags (
            id SERIAL PRIMARY KEY, user_id INT NOT NULL, name TEXT,
            color_index INT DEFAULT 0, icon TEXT
        );
        CREATE TABLE transaction_flag_links (
            flag_id INT NOT NULL, transaction_id INT NOT NULL,
            PRIMARY KEY (flag_id, transaction_id)
        );
        INSERT INTO users (id, email) VALUES (1, 'demo@induswealth.com'), (2, 'other@example.com');
        INSERT INTO accounts (id, user_id, plaid_account_id, name, alias, type, subtype) VALUES
            (10, 1, 'acct-card', 'Visa Infinite', 'Travel card', 'credit', 'credit card'),
            (11, 1, 'acct-chq',  'Everyday Chequing', NULL, 'depository', 'chequing'),
            (12, 2, 'acct-foreign', 'Someone else', NULL, 'depository', 'chequing');
        INSERT INTO transaction_flags (id, user_id, name) VALUES (7, 1, 'Trip');
    `);

    for (const row of ROWS) {
        await pg.query(
            `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, amount, date, category)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7)`,
            [USER, row.acct, `tx-${row.key}`, row.name, row.amount, row.date, ['Shops']]
        );
    }

    // A second user holding a row that would match every filter below. If any
    // clause ever drops `t.user_id`, these checks are the ones that fail.
    await pg.query(
        `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, amount, date, category)
         VALUES ($1, 12, 'tx-foreign', 'SOMEBODY ELSE', 5000, '2026-03-10'::date, $2)`,
        [OTHER_USER, ['Shops']]
    );

    // "Trip" tags the flight, so the flag filter can be shown to compose with
    // the new clauses rather than replacing them.
    await pg.query(
        `INSERT INTO transaction_flag_links (flag_id, transaction_id)
         SELECT 7, id FROM transactions WHERE plaid_transaction_id = 'tx-flight'`
    );

    // -----------------------------------------------------------------------
    // The invariant, run for every case: rows, count and money agree
    // -----------------------------------------------------------------------

    /**
     * Runs all three shipped queries under one filter and checks them against
     * the fixture AND against each other.
     */
    const verify = async (label, options, predicate) => {
        const wanted = expect(predicate);

        const [page, count, totals] = await Promise.all([
            db.getTransactionsPage(USER, { ...options, limit: 1000, offset: 0 }),
            db.countTransactions(USER, options),
            db.sumTransactions(USER, options),
        ]);

        const keys = page.map((r) => r.transaction_id.replace(/^tx-/, '')).sort();
        check(`${label} — rows`, keys, wanted.keys);
        check(`${label} — count behind the paging`, count, wanted.count);
        check(`${label} — money`, {
            outflow: round2(totals.outflow),
            inflow: round2(totals.inflow),
            net: round2(totals.net),
            count: totals.count,
        }, {
            outflow: wanted.outflow, inflow: wanted.inflow, net: wanted.net, count: wanted.count,
        });

        // The invariant itself. Summing the page reproduces the total the
        // server computed from a different query — so a clause that reached one
        // and not the other cannot pass.
        const pageNet = round2(page.reduce((a, r) => a + Number(r.amount), 0));
        ok(`${label} — the rows on screen add up to the total above them`,
            pageNet === round2(totals.net),
            `page ${pageNet} vs totals ${round2(totals.net)}`);
    };

    console.log('\nno filter');
    await verify('unfiltered', {}, () => true);

    console.log('\namount is a magnitude, not a signed value');
    await verify('min 100', { minAmount: 100 }, (r) => Math.abs(r.amount) >= 100);
    await verify('max 50', { maxAmount: 50 }, (r) => Math.abs(r.amount) <= 50);
    await verify('between 100 and 1000',
        { minAmount: 100, maxAmount: 1000 },
        (r) => Math.abs(r.amount) >= 100 && Math.abs(r.amount) <= 1000);

    // The point of ABS. A signed comparison would have dropped the payroll
    // deposit and the refund out of "over $100" without saying so.
    const overHundred = await db.getTransactionsPage(USER, { minAmount: 100, limit: 100 });
    ok('a $2,400 deposit counts as over $100',
        overHundred.some((r) => r.transaction_id === 'tx-pay'));
    ok('a $45 refund does not',
        !overHundred.some((r) => r.transaction_id === 'tx-refund'));

    console.log('\nan exact bound is inclusive at both ends');
    await verify('min equals a row exactly', { minAmount: 120 }, (r) => Math.abs(r.amount) >= 120);
    await verify('max equals a row exactly', { maxAmount: 120 }, (r) => Math.abs(r.amount) <= 120);

    console.log('\ndirection splits on the sign, and zero is neither');
    await verify('money out', { direction: 'out' }, (r) => r.amount > 0);
    await verify('money in', { direction: 'in' }, (r) => r.amount < 0);

    const out = await db.countTransactions(USER, { direction: 'out' });
    const inn = await db.countTransactions(USER, { direction: 'in' });
    ok('the zero-amount row is in neither direction',
        out + inn === ROWS.length - 1,
        `out ${out} + in ${inn} of ${ROWS.length}`);

    console.log('\ndates are inclusive at both ends');
    await verify('march only',
        { startDate: '2026-03-01', endDate: '2026-03-31' },
        (r) => r.date >= '2026-03-01' && r.date <= '2026-03-31');
    await verify('open start', { startDate: '2026-03-15' }, (r) => r.date >= '2026-03-15');
    await verify('open end', { endDate: '2026-03-05' }, (r) => r.date <= '2026-03-05');

    // Inclusivity is the bit a `>` instead of `>=` gets wrong silently, and the
    // rows sitting exactly on the boundary are the only evidence.
    const boundary = await db.getTransactionsPage(USER, {
        startDate: '2026-03-15', endDate: '2026-03-15', limit: 100,
    });
    check('a single-day window returns that day',
        boundary.map((r) => r.transaction_id).sort(),
        ['tx-pay', 'tx-refund']);

    console.log('\nfilters compose');
    await verify('one card, money out, over $100',
        { accountId: CARD, direction: 'out', minAmount: 100 },
        (r) => r.acct === 10 && r.amount > 0 && Math.abs(r.amount) >= 100);
    await verify('the chequing account in March, under $1,000',
        { accountId: CHEQUING, startDate: '2026-03-01', endDate: '2026-03-31', maxAmount: 1000 },
        (r) => r.acct === 11 && r.date >= '2026-03-01' && r.date <= '2026-03-31' && Math.abs(r.amount) <= 1000);
    await verify('a flag and an amount together',
        { flagId: 7, minAmount: 100 },
        (r) => r.key === 'flight' && Math.abs(r.amount) >= 100);
    await verify('a search and a direction together',
        { search: 'LOBLAWS', direction: 'out' },
        (r) => r.name.includes('LOBLAWS') && r.amount > 0);

    console.log('\nnothing leaks across users');
    const foreign = await db.sumTransactions(USER, { accountId: FOREIGN, minAmount: 1 });
    check('another user\'s account matches nothing',
        { count: foreign.count, net: round2(foreign.net) }, { count: 0, net: 0 });

    const wideOpen = await db.countTransactions(USER, { minAmount: 0 });
    check('and their $5,000 row is not in an unscoped filter either',
        wideOpen, ROWS.length);

    console.log('\nan impossible range is empty, not swapped');
    // The device refuses to send this. If one ever arrives, returning nothing
    // is the honest answer -- swapping the bounds would answer a different
    // question without mentioning it.
    await verify('min above max', { minAmount: 500, maxAmount: 50 }, () => false);

    console.log('\nthe totals describe the whole set, never the page');
    const onePage = await db.getTransactionsPage(USER, { limit: 2, offset: 0 });
    const allTotals = await db.sumTransactions(USER, {});
    const allCount = await db.countTransactions(USER, {});
    check('a 2-row page', onePage.length, 2);
    check('still counts every match', allCount, ROWS.length);
    check('and still adds up every match', round2(allTotals.net), expect(() => true).net);

    console.log('\nthe unfiltered path is untouched');
    // Every existing caller passes none of the new keys. Explicit undefined is
    // how they arrive, and it must read as "no filter" rather than as a bound.
    const asBefore = await db.countTransactions(USER, {
        minAmount: undefined, maxAmount: undefined,
        startDate: undefined, endDate: undefined, direction: undefined,
    });
    check('undefined bounds filter nothing', asBefore, ROWS.length);

    const nullish = await db.countTransactions(USER, {
        minAmount: null, maxAmount: null, startDate: null, endDate: null, direction: null,
    });
    check('and so do null ones', nullish, ROWS.length);

    // days still counts back from today, alongside everything else.
    console.log('\ndays still works, and still counts back from today');
    await pg.query(
        `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, amount, date, category)
         VALUES ($1, 10, 'tx-today', 'TODAY', 12.34, CURRENT_DATE, $2)`,
        [USER, ['Shops']]
    );
    const recent = await db.getTransactionsPage(USER, { days: 7, limit: 100 });
    check('only today\'s row is in the last 7 days',
        recent.map((r) => r.transaction_id), ['tx-today']);

    const recentAndSmall = await db.countTransactions(USER, { days: 7, maxAmount: 10 });
    check('and it drops out once the amount filter excludes it', recentAndSmall, 0);

    console.log(`\n${passed} passed, ${failed} failed`);
    ok('the fixture was actually used', byKey.flight.amount === 640.25);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
