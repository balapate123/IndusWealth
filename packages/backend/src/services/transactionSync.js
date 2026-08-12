const plaidService = require('./plaid');
const watchdogService = require('./watchdog');
const db = require('./db');
const { createLogger } = require('./logger');
const { PLAID_STATUS, getPlaidStatusFromError } = require('../utils/responseHelper');

const logger = createLogger('TX_SYNC');

/**
 * Pull transactions from Plaid into our database.
 *
 * Shared by two callers that must not drift apart: GET /transactions, which
 * syncs when its cache is stale, and the Plaid webhook, which syncs when Plaid
 * says new data has landed. Before this existed only the route could sync, so a
 * freshly linked account showed whatever the first pull happened to catch —
 * about 30 days — until the 24-hour cache expired.
 *
 * Never throws: a Plaid failure is reported as a status so the caller can carry
 * on serving whatever is already in the database.
 *
 * @returns {{ok: boolean, plaidStatus: string, count: number, errorCode?: string}}
 */
const syncTransactions = async (userId, accessToken, { forceRefresh = false, itemId = null, ctx = {} } = {}) => {
    if (!accessToken) {
        logger.info('No Plaid access token available', { ...ctx, userId });
        return { ok: false, plaidStatus: PLAID_STATUS.NO_TOKEN, count: 0 };
    }

    // Repair a connection linked before the exchange stored its item id.
    // Without one the webhook cannot find this user, so the account is stuck
    // waiting on the 24-hour cache for every update. One extra Plaid call, once
    // per connection ever — the UPDATE is guarded on the column being NULL.
    if (!itemId) {
        try {
            const recoveredItemId = await plaidService.getItemId(accessToken);
            if (await db.setPlaidItemIdIfMissing(userId, recoveredItemId)) {
                logger.info('Backfilled missing Plaid item id', { ...ctx, userId });
            }
        } catch (itemError) {
            // Not fatal: the sync below is what the caller actually wants.
            logger.warn('Could not recover Plaid item id', { ...ctx, userId, error: itemError.message });
        }
    }

    try {
        const transactions = await plaidService.getTransactions(accessToken, forceRefresh);

        // Accounts are refreshed alongside so balances stay in step with the
        // transactions, and so a newly opened account has a row to map onto.
        // A failure here is not fatal: the transactions still belong to accounts
        // we already know about.
        try {
            const accounts = await plaidService.getAccounts(accessToken);
            await db.upsertAccounts(userId, accounts);
            await db.updateSyncTime(userId, 'last_account_sync');
            logger.debug('Synced accounts from Plaid', { ...ctx, userId, accountCount: accounts.length });
        } catch (accountError) {
            logger.warn('Could not fetch accounts', { ...ctx, userId, error: accountError });
        }

        await db.upsertTransactions(userId, transactions);

        // A pull that returned nothing is not evidence the cache is fresh, so
        // it must not start the 24-hour clock. Plaid has the Item ready before
        // the backfill has landed, and stamping here left a just-linked account
        // showing an empty list for a day. Only affects a linked account with
        // no transactions yet — a narrow, self-correcting state, and
        // /transactions/get is not billed per call.
        if (transactions.length > 0) {
            await db.updateSyncTime(userId, 'last_transaction_sync');
        } else {
            logger.info('Plaid returned no transactions — leaving cache stale so the next request retries', { ...ctx, userId });
        }
        await watchdogService.invalidateCache(userId);

        if (forceRefresh) {
            await db.updateSyncTime(userId, 'last_plaid_refresh');
        }

        logger.info('Synced transactions from Plaid', { ...ctx, userId, count: transactions.length });
        return { ok: true, plaidStatus: PLAID_STATUS.SUCCESS, count: transactions.length };
    } catch (error) {
        const errorCode = error.response?.data?.error_code;

        if (errorCode === 'ITEM_LOGIN_REQUIRED') {
            logger.warn('User needs to re-authenticate via Plaid Link update mode', { ...ctx, userId, errorCode });
        } else {
            logger.warn('Plaid sync failed, falling back to database cache', { ...ctx, userId, errorCode, error });
        }

        return { ok: false, plaidStatus: getPlaidStatusFromError(error), count: 0, errorCode };
    }
};

/**
 * Items with a sync in flight. INITIAL_UPDATE and HISTORICAL_UPDATE arrive
 * seconds apart, and a 2-year pull takes long enough that the second would
 * otherwise start while the first is still paging through Plaid — doubling the
 * API calls to write the same rows.
 *
 * Per-process, so it does not coordinate across Render instances. That is
 * acceptable: the upserts are idempotent, so the worst case is duplicated work,
 * never duplicated data.
 */
const inFlight = new Set();

/**
 * Sync on behalf of an inbound webhook, which knows the Plaid Item rather than
 * the user. Returns null when the Item belongs to nobody — an Item we no longer
 * hold a token for still sends webhooks for a while after being disconnected.
 */
const syncByItemId = async (itemId, ctx = {}) => {
    if (!itemId) return null;

    if (inFlight.has(itemId)) {
        logger.info('Sync already running for this item — skipping', { ...ctx, itemId });
        return null;
    }

    // Claim the item before the first await. Checking and then awaiting the user
    // lookup would let two simultaneous webhooks both pass the check and both
    // start a pull — which is precisely what INITIAL_UPDATE and HISTORICAL_UPDATE
    // do, seconds apart.
    inFlight.add(itemId);
    try {
        const user = await db.getUserByPlaidItemId(itemId);
        if (!user) {
            logger.info('Webhook for an item with no matching user — ignoring', { ...ctx, itemId });
            return null;
        }

        // The item id is how we found this user, so it is known to be stored —
        // pass it so the backfill above is skipped.
        return await syncTransactions(user.id, user.plaid_access_token, { itemId, ctx });
    } finally {
        inFlight.delete(itemId);
    }
};

module.exports = { syncTransactions, syncByItemId };
