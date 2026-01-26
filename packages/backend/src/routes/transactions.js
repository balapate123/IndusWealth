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

        // Get transactions from database - filter by account if specified
        if (accountId && accountId !== 'all') {
            transactions = await db.getTransactionsByAccount(userId, accountId, 100);
            logger.debug('Filtered by account', { ...ctx, accountId, count: transactions.length });
        } else {
            transactions = await db.getTransactions(userId, 100);
        }

        // Sort by date descending
        const sortedTransactions = transactions.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

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
            categoryBreakdown,
            analysis: leakageAnalysis,
            plaid_status: plaidStatus
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch transactions', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
