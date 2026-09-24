const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const db = require('../services/db');
const { syncTransactions } = require('../services/transactionSync');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown, batchCategorizeWithAI } = require('../services/categorization');
const corrections = require('../services/category_corrections');
const { CANONICAL_CATEGORIES } = require('../services/category_map');
const { merchantLabelFor } = require('../services/merchant_identity');
const { createLogger } = require('../services/logger');
const { parseTransactionFilters, clampInt } = require('../services/transaction_filters');
const { DATA_SOURCES, PLAID_STATUS, createMeta, successResponse } = require('../utils/responseHelper');

const logger = createLogger('TRANSACTIONS');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;   // one page; scroll further with offset

// GET /transactions
// Fetches transactions from cache or Plaid (if stale)
// Requires authentication
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching transactions', ctx);

    try {
        const userId = req.user.id;
        const forceRefresh = req.query.refresh === 'true';

        // Every filter the list understands, parsed in one pure place so the
        // rules are assertions rather than something you send a request to
        // discover. Anything unrecognised comes back null and filters nothing —
        // a typo must never narrow the query, or an empty list reads as
        // missing data.
        const filter = parseTransactionFilters(req.query);
        const accountId = filter.accountId;

        // Paging. `limit` was previously accepted and ignored — the row count
        // was hardcoded to 100 — so callers asking for ?limit=500 were quietly
        // getting 100 and analysing a fifth of the data they thought.
        const limit = clampInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

        // Enforce 10-minute cooldown on manual Plaid refresh to limit Transactions Refresh API cost ($0.12/call)
        if (forceRefresh) {
            const lastRefresh = await db.getLastSyncTime(userId, 'last_plaid_refresh');
            if (lastRefresh) {
                const secondsSinceRefresh = (Date.now() - new Date(lastRefresh).getTime()) / 1000;
                const COOLDOWN_SECONDS = 10 * 60; // 10 minutes
                if (secondsSinceRefresh < COOLDOWN_SECONDS) {
                    const secondsRemaining = Math.ceil(COOLDOWN_SECONDS - secondsSinceRefresh);
                    logger.info('Force refresh blocked by cooldown', { ...ctx, secondsRemaining });
                    return res.status(429).json({
                        success: false,
                        code: 'REFRESH_COOLDOWN',
                        message: `Please wait before refreshing again.`,
                        retryAfterSeconds: secondsRemaining
                    });
                }
            }
        }

        // Check if we need to sync from Plaid (conservative: 24 hours)
        const needsSync = forceRefresh || await db.shouldSync(userId, 'last_transaction_sync', 24);

        let transactions = [];
        let dataSource = DATA_SOURCES.DATABASE;
        let plaidStatus = PLAID_STATUS.UNKNOWN;

        if (needsSync) {
            logger.info('Cache stale or force refresh - syncing from Plaid', { ...ctx, forceRefresh });

            // Get user's Plaid access token from the authenticated user
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

            // Shared with the Plaid webhook, which syncs the same way when Plaid
            // reports new data. Never throws — a Plaid failure comes back as a
            // status and we carry on serving what is already stored.
            const result = await syncTransactions(userId, accessToken, {
                forceRefresh,
                itemId: req.user.plaidItemId,
                ctx,
            });
            plaidStatus = result.plaidStatus;
            if (result.ok) dataSource = DATA_SOURCES.PLAID_API;
        } else {
            logger.debug('Cache is fresh, serving from database', ctx);
            plaidStatus = PLAID_STATUS.CACHED;
        }

        // One page of the filtered set, plus the total behind it so the client
        // knows whether to keep scrolling. Both run through the same filter, so
        // they cannot disagree about what matches.
        // Totals run through the same filter as the page, over every matching
        // row rather than the hundred on screen — summing the page on the device
        // would quietly report a fraction of what the user filtered to.
        const [page, total, totals] = await Promise.all([
            db.getTransactionsPage(userId, { ...filter, limit, offset }),
            db.countTransactions(userId, filter),
            db.sumTransactions(userId, filter),
        ]);
        transactions = page;

        logger.debug('Transaction page', {
            ...ctx,
            accountId,
            days: filter.days,
            flagId: filter.flagId,
            search: !!filter.search,
            minAmount: filter.minAmount,
            maxAmount: filter.maxAmount,
            startDate: filter.startDate,
            endDate: filter.endDate,
            direction: filter.direction,
            limit,
            offset,
            count: transactions.length,
            total,
        });

        // Already ordered by date DESC, id DESC in SQL — re-sorting here would
        // only shuffle same-day rows out of the order the paging relies on.
        const sortedTransactions = transactions;

        // Apply categorization to each transaction (now async)
        const categorizedTransactions = [];
        const transactionsNeedingAI = [];

        for (const tx of sortedTransactions) {
            const categoryInfo = await categorizeTransaction(tx);

            const categorized = {
                ...tx,
                // If Plaid category is empty, use our pattern-based category
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color,
                categorySource: categoryInfo.source,
                // The merchant behind this row, as a person reads it. Sent
                // rather than derived on the device: normalizeMerchantName is
                // backend logic, and a third implementation of it is how this
                // project ended up with two category vocabularies. It is what
                // the picker puts in "Also apply to all Pioneer".
                merchantLabel: merchantLabelFor(tx),
            };

            categorizedTransactions.push(categorized);

            // Collect transactions that need AI categorization
            if (categoryInfo.needsAI) {
                transactionsNeedingAI.push(tx);
            }
        }

        // Trigger background AI categorization (non-blocking)
        if (transactionsNeedingAI.length > 0) {
            logger.info('Triggering background AI categorization', {
                ...ctx,
                count: transactionsNeedingAI.length
            });

            // Run in background (don't await)
            batchCategorizeWithAI(transactionsNeedingAI)
                .then(() => {
                    logger.info('Background AI categorization completed', { ...ctx });
                })
                .catch(err => {
                    logger.error('Background AI categorization failed', { ...ctx, error: err });
                });
        }

        // Get category breakdown for analytics
        const categoryBreakdown = await getCategoryBreakdown(categorizedTransactions);

        // Run Watchdog Analysis
        const leakageAnalysis = watchdogService.analyze(categorizedTransactions);

        // Build response metadata
        const meta = await createMeta(userId, dataSource, {
            syncType: 'last_transaction_sync',
            plaidStatus,
            count: categorizedTransactions.length
        });

        logger.info('Returning transactions', {
            ...ctx,
            count: categorizedTransactions.length,
            dataSource,
            plaidStatus
        });

        successResponse(res, {
            count: categorizedTransactions.length,
            data: categorizedTransactions,
            // categoryBreakdown and analysis describe the returned page, not the
            // whole window. Nothing consumes them from here — Analytics reads
            // /analytics and Watchdog reads /watchdog — so they are kept for
            // compatibility rather than relied on.
            categoryBreakdown,
            analysis: leakageAnalysis,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + categorizedTransactions.length < total,
                days: filter.days,
                flagId: filter.flagId,
            },
            // Money across the whole filtered set, not this page. `net` is spent
            // minus refunded, which is the number a shared-expense flag is for.
            totals,
            plaid_status: plaidStatus
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch transactions', { ...ctx, error });
        next(error);
    }
});

// PATCH /transactions/:transactionId
// Update transaction notes
// Requires authentication
// ---------------------------------------------------------------------------
// Category corrections
//
// The category anybody sees is derived on read, not stored, so a correction
// needs its own column and every consumer has to consult it. `effectiveCategory`
// in category_map.js is that single place; these three routes are the only
// things that write to it.
//
// Declared BEFORE the PATCH /:transactionId notes route would be reached, so a
// literal path segment can never be captured as a transaction id.
// ---------------------------------------------------------------------------

/**
 * The categories a correction may use.
 *
 * Served rather than hardcoded on the device for the same reason the goal
 * editor reads its options from the API: a picker offering something the
 * server will reject is a button that does nothing.
 */
router.get('/categories/options', authenticateToken, (req, res) => {
    res.json({ success: true, data: CANONICAL_CATEGORIES, requestId: req.requestId });
});

const badCategory = (req, res) => res.status(400).json({
    success: false,
    code: 'UNKNOWN_CATEGORY',
    message: 'That is not a category this app uses.',
    requestId: req.requestId,
});

/**
 * The Plaid transaction id, which is what the device holds.
 *
 * NOT the numeric primary key: `GET /transactions` aliases that away as
 * `transaction_id`, and every other write the app makes to a transaction --
 * notes, flags -- is addressed the same way. Parsing this as an integer would
 * have matched nothing and returned a cheerful 404.
 */
const parseTransactionId = (req, res) => {
    const id = typeof req.params.transactionId === 'string' ? req.params.transactionId.trim() : '';
    if (!id || id.length > 255) {
        res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Invalid transaction id',
            requestId: req.requestId,
        });
        return null;
    }
    return id;
};

/**
 * POST /transactions/category  { transactionIds, category }
 *
 * Bulk, for the selection on All transactions.
 *
 * Deliberately never creates a merchant rule: a selection spans merchants, so
 * inferring one from it would be guessing at intent and would rewrite history
 * for merchants the user did not name.
 */
router.post('/category', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const { transactionIds, category } = req.body || {};
        const result = await corrections.correctTransactions(req.user.id, transactionIds, category);

        if (!result.ok) {
            if (result.reason === 'unknown_category') return badCategory(req, res);
            if (result.reason === 'too_many') {
                return res.status(400).json({
                    success: false,
                    code: 'TOO_MANY_TRANSACTIONS',
                    message: `You can change up to ${corrections.MAX_BULK_TRANSACTIONS} at a time.`,
                    requestId: req.requestId,
                });
            }
            return res.status(400).json({
                success: false,
                code: 'VALIDATION_ERROR',
                message: 'Select at least one transaction.',
                requestId: req.requestId,
            });
        }

        logger.info('Bulk category correction', { ...ctx, changed: result.changed, category });
        res.json({ success: true, changed: result.changed, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to apply a bulk category correction', { ...ctx, error });
        next(error);
    }
});

/**
 * PATCH /transactions/:transactionId/category  { category, applyToMerchant }
 *
 * One transaction, or every transaction from its merchant.
 */
router.patch('/:transactionId/category', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const transactionId = parseTransactionId(req, res);
        if (transactionId === null) return;

        const { category, applyToMerchant = false } = req.body || {};
        const result = await corrections.correctTransaction(req.user.id, transactionId, category, {
            applyToMerchant: applyToMerchant === true,
        });

        if (!result.ok) {
            if (result.reason === 'unknown_category') return badCategory(req, res);
            return res.status(404).json({
                success: false,
                code: 'NOT_FOUND',
                message: 'Transaction not found',
                requestId: req.requestId,
            });
        }

        logger.info('Category corrected', {
            ...ctx, transactionId, category, rule: Boolean(result.rule), alsoChanged: result.alsoChanged,
        });

        res.json({
            success: true,
            // The screen says "and 23 other Pioneer transactions" from this, so
            // it is the count of rows that actually moved -- not the count
            // matched, which would include rows already in that category.
            alsoChanged: result.alsoChanged,
            rule: result.rule
                ? { merchantLabel: result.rule.merchant_label, category: result.rule.category }
                : null,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to correct a category', { ...ctx, error });
        next(error);
    }
});

/**
 * DELETE /transactions/:transactionId/category
 *
 * Back to the derived category. When a merchant rule covers this transaction
 * the rule goes too, along with the correction on every row it had written --
 * otherwise the rule keeps re-applying to a merchant the user has just told us
 * to stop correcting, and the undo reads as broken.
 *
 * This is also the only way to remove a rule. A rules screen is out of scope;
 * without this route, a rule created by mistake would have no way out.
 */
router.delete('/:transactionId/category', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const transactionId = parseTransactionId(req, res);
        if (transactionId === null) return;

        const result = await corrections.revertTransaction(req.user.id, transactionId);
        if (!result.ok) {
            return res.status(404).json({
                success: false,
                code: 'NOT_FOUND',
                message: 'Transaction not found',
                requestId: req.requestId,
            });
        }

        logger.info('Category correction reverted', {
            ...ctx, transactionId, removedRule: Boolean(result.removedRule),
        });

        res.json({
            success: true,
            alsoChanged: result.alsoChanged,
            removedRule: result.removedRule,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to revert a category correction', { ...ctx, error });
        next(error);
    }
});

router.patch('/:transactionId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Updating transaction notes', ctx);

    try {
        const userId = req.user.id;
        const { transactionId } = req.params;
        const { notes } = req.body;

        // Validate notes
        if (notes !== null && notes !== undefined && typeof notes !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Notes must be a string'
            });
        }

        // Validate notes length (max 500 characters)
        if (notes && notes.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Notes cannot exceed 500 characters'
            });
        }

        // Update transaction notes
        const updatedTransaction = await db.updateTransactionNotes(userId, transactionId, notes || null);

        if (!updatedTransaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        logger.info('Transaction notes updated', { ...ctx, transactionId });

        res.json({
            success: true,
            data: updatedTransaction
        });
    } catch (error) {
        logger.error('Failed to update transaction notes', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
