const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const watchdogService = require('../services/watchdog');
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown, batchCategorizeWithAI } = require('../services/categorization');
const { createLogger } = require('../services/logger');
const { PlaidError } = require('../errors/AppError');
const { DATA_SOURCES, PLAID_STATUS, createMeta, successResponse, getPlaidStatusFromError } = require('../utils/responseHelper');

const logger = createLogger('TRANSACTIONS');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;   // one page; scroll further with offset
const MAX_DAYS = 365;

/** Parse a query param as a bounded integer, falling back when absent or junk. */
const clampInt = (value, fallback, min, max) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

// GET /transactions
// Fetches transactions from cache or Plaid (if stale)
// Requires authentication
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching transactions', ctx);

    try {
        const userId = req.user.id;
        const forceRefresh = req.query.refresh === 'true';
        const accountId = req.query.account_id;

        // Paging and filtering. `limit` was previously accepted and ignored — the
        // row count was hardcoded to 100 — so callers asking for ?limit=500 were
        // quietly getting 100 and analysing a fifth of the data they thought.
        const limit = clampInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        const days = clampInt(req.query.days, null, 1, MAX_DAYS);
        const search = (req.query.search || '').trim() || null;

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

            if (accessToken) {
                try {
                    // Fetch from Plaid
                    const plaidTransactions = await plaidService.getTransactions(accessToken, forceRefresh);

                    // Also fetch accounts for the account_id mapping
                    try {
                        const plaidAccounts = await plaidService.getAccounts(accessToken);
                        await db.upsertAccounts(userId, plaidAccounts);
                        logger.debug('Synced accounts from Plaid', { ...ctx, accountCount: plaidAccounts.length });
                    } catch (accErr) {
                        logger.warn('Could not fetch accounts', { ...ctx, error: accErr });
                    }

                    // Store in database
                    await db.upsertTransactions(userId, plaidTransactions);

                    // Update sync time
                    await db.updateSyncTime(userId, 'last_transaction_sync');

                    // Invalidate watchdog cache so next GET /watchdog re-analyzes
                    await watchdogService.invalidateCache(userId);

                    // Stamp the last manual refresh time for cooldown enforcement
                    if (forceRefresh) {
                        await db.updateSyncTime(userId, 'last_plaid_refresh');
                    }

                    logger.info('Synced transactions from Plaid', {
                        ...ctx,
                        count: plaidTransactions.length,
                        dataSource: DATA_SOURCES.PLAID_API
                    });
                    dataSource = DATA_SOURCES.PLAID_API;
                    plaidStatus = PLAID_STATUS.SUCCESS;
                } catch (plaidError) {
                    // Determine Plaid error status
                    plaidStatus = getPlaidStatusFromError(plaidError);
                    const errorCode = plaidError.response?.data?.error_code;

                    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
                        logger.warn('User needs to re-authenticate via Plaid Link update mode', { ...ctx, errorCode });
                    } else {
                        logger.warn('Plaid sync failed, falling back to database cache', {
                            ...ctx,
                            errorCode,
                            error: plaidError
                        });
                    }
                }
            } else {
                logger.info('No Plaid access token available', ctx);
                plaidStatus = PLAID_STATUS.NO_TOKEN;
            }
        } else {
            logger.debug('Cache is fresh, serving from database', ctx);
            plaidStatus = PLAID_STATUS.CACHED;
        }

        // One page of the filtered set, plus the total behind it so the client
        // knows whether to keep scrolling. Both run through the same filter, so
        // they cannot disagree about what matches.
        const filter = { accountId, days, search };
        const [page, total] = await Promise.all([
            db.getTransactionsPage(userId, { ...filter, limit, offset }),
            db.countTransactions(userId, filter),
        ]);
        transactions = page;

        logger.debug('Transaction page', { ...ctx, accountId, days, search: !!search, limit, offset, count: transactions.length, total });

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
                categorySource: categoryInfo.source
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
                days,
            },
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
