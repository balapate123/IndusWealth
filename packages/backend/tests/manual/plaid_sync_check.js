/**
 * Verifies the two failure modes behind "linked the bank but no transactions":
 *   1. plaid_item_id never stored -> every webhook dropped
 *   2. an empty pull stamping last_transaction_sync -> 24h lockout
 *
 * Runs the SHIPPED db.js / transactionSync.js against real SQL — the whole
 * migration list is applied to an in-process Postgres (PGlite, no Docker) and
 * pg.Pool is shimmed onto it, so the query text executed here is the query text
 * that runs in production. Only the Plaid HTTP calls are stubbed.
 *
 * NOT part of `npm test`: PGlite is a ~30MB WASM dependency and the suite is
 * deliberately dependency-free. The glob is tests/*.test.js, so this is excluded
 * both by folder and by filename. To run it:
 *
 *   cd packages/backend
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/plaid_sync_check.js
 *
 * Section 1 reproduces the original bug; it must keep passing, because it is the
 * proof that the webhook drop was real and not a guess.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-local-verification-only';
process.env.LINK_HEALTH_CHECK_ENABLED = 'false';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const BACKEND = path.resolve(__dirname, '..', '..');
const DB_DIR = path.join(BACKEND, 'db');
const MIGRATIONS = require(path.join(DB_DIR, 'migrations.js'));

const pglite = new PGlite();
const exec = async (text, params) => {
    const res = await pglite.query(text, params || []);
    return { rows: res.rows, rowCount: Math.max(res.affectedRows || 0, res.rows.length) };
};
const pg = require(require.resolve('pg', { paths: [BACKEND] }));
pg.Pool.prototype.query = (t, p) => exec(t, p);
pg.Pool.prototype.connect = async () => ({ query: exec, release() {} });
pg.Pool.prototype.on = () => {};

const results = [];
const check = (ok, label, detail = '') => {
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const itemIdOf = async (userId) =>
    (await pglite.query(`SELECT plaid_item_id FROM users WHERE id = $1`, [userId])).rows[0].plaid_item_id;
const syncStampOf = async (userId) =>
    (await pglite.query(`SELECT last_transaction_sync FROM sync_log WHERE user_id = $1`, [userId])).rows[0]
        ?.last_transaction_sync ?? null;

(async () => {
    for (const f of MIGRATIONS) await pglite.exec(fs.readFileSync(path.join(DB_DIR, f), 'utf8'));

    const db = require(path.join(BACKEND, 'src/services/db.js'));
    const plaidService = require(path.join(BACKEND, 'src/services/plaid.js'));
    const { syncTransactions, syncByItemId } = require(path.join(BACKEND, 'src/services/transactionSync.js'));

    const u = await pglite.query(
        `INSERT INTO users (email, password_hash, name, email_verified)
         VALUES ('plaid@test.com','x','P',TRUE) RETURNING id`
    );
    const userId = u.rows[0].id;
    await pglite.query(`INSERT INTO sync_log (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);

    // Stub Plaid. module.exports is a singleton instance, so own properties
    // shadow the prototype methods the shipped code calls.
    let pulled = [];
    plaidService.getTransactions = async () => pulled;
    plaidService.getAccounts = async () => [];
    plaidService.getItemId = async () => 'item-recovered';

    console.log('\n1. Reproduce: the old exchange stored a null item id');
    await db.updateUserPlaidToken(userId, 'access-sandbox-1', null);
    check((await itemIdOf(userId)) === null, 'plaid_item_id is NULL after a null-item exchange');
    check(
        (await db.getUserByPlaidItemId('item-abc')) === undefined,
        'webhook lookup by item id finds nobody'
    );
    check((await syncByItemId('item-abc')) === null, 'syncByItemId drops the webhook (no matching user)');

    console.log('\n2. The fix: the exchange now stores the item id');
    await db.updateUserPlaidToken(userId, 'access-sandbox-1', 'item-abc');
    const found = await db.getUserByPlaidItemId('item-abc');
    check(found?.id === userId, 'webhook lookup now finds the user');
    check(found?.plaid_access_token === 'access-sandbox-1', 'access token round-trips through encryption');

    console.log('\n3. setPlaidItemIdIfMissing repairs a NULL and never overwrites');
    await pglite.query(`UPDATE users SET plaid_item_id = NULL WHERE id = $1`, [userId]);
    check(await db.setPlaidItemIdIfMissing(userId, 'item-xyz'), 'fills a NULL (returns true)');
    check((await itemIdOf(userId)) === 'item-xyz', 'column now holds item-xyz');
    check(!(await db.setPlaidItemIdIfMissing(userId, 'item-other')), 'refuses to overwrite (returns false)');
    check((await itemIdOf(userId)) === 'item-xyz', 'existing value untouched');

    console.log('\n4. An empty pull must not start the 24-hour clock');
    pulled = [];
    check((await syncStampOf(userId)) === null, 'precondition: never synced');
    const empty = await syncTransactions(userId, 'access-sandbox-1', { itemId: 'item-xyz' });
    check(empty.ok === true && empty.count === 0, 'sync reports ok with 0 transactions');
    check((await syncStampOf(userId)) === null, 'last_transaction_sync still NULL -> next request retries');
    check(await db.shouldSync(userId, 'last_transaction_sync', 24), 'shouldSync stays true');

    console.log('\n5. A real pull does stamp it');
    pulled = [{
        transaction_id: 'tx-1', account_id: 'acct-1', name: 'Coffee', amount: 4.5,
        date: '2026-08-01', category: ['Food and Drink'], pending: false, iso_currency_code: 'CAD',
    }];
    const real = await syncTransactions(userId, 'access-sandbox-1', { itemId: 'item-xyz' });
    check(real.ok === true && real.count === 1, 'sync reports 1 transaction');
    check((await syncStampOf(userId)) !== null, 'last_transaction_sync stamped');
    check(!(await db.shouldSync(userId, 'last_transaction_sync', 24)), 'shouldSync now false');

    console.log('\n6. Backfill repairs a connection linked before the fix');
    await pglite.query(`UPDATE users SET plaid_item_id = NULL WHERE id = $1`, [userId]);
    await syncTransactions(userId, 'access-sandbox-1', { itemId: null });
    check((await itemIdOf(userId)) === 'item-recovered', 'missing item id recovered via itemGet');

    console.log('\n7. And the recovered id makes the webhook path live');
    const viaWebhook = await syncByItemId('item-recovered');
    check(viaWebhook?.ok === true, 'syncByItemId now syncs instead of dropping');

    const failed = results.filter((r) => !r).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
