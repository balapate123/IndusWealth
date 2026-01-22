const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const watchdogService = require('../services/watchdog');
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown } = require('../services/categorization');

// GET /transactions
// Fetches transactions from cache or Plaid (if stale)
// Requires authentication
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /transactions] Request received');

    try {
        const userId = req.user.id;
        const forceRefresh = req.query.refresh === 'true';

        // Check if we need to sync from Plaid (conservative: 24 hours)
        const needsSync = forceRefresh || await db.shouldSync(userId, 'last_transaction_sync', 24);

        let transactions = [];
        let dataSource = 'DATABASE';
        let plaidStatus = 'unknown'; // Track Plaid connection status

        if (needsSync) {
            console.log('   🔄 Cache stale or force refresh - syncing from Plaid...');

            // Get user's Plaid access token from the authenticated user
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

            if (accessToken) {
                try {
                    // Fetch from Plaid
                    const plaidTransactions = await plaidService.getTransactions(accessToken);

                    // Also fetch accounts for the account_id mapping
                    try {
                        const plaidAccounts = await plaidService.getAccounts(accessToken);
                        await db.upsertAccounts(userId, plaidAccounts);
                    } catch (accErr) {
                        console.warn('   ⚠️ Could not fetch accounts:', accErr.message);
                    }

                    // Store in database
                    await db.upsertTransactions(userId, plaidTransactions);

                    // Update sync time
                    await db.updateSyncTime(userId, 'last_transaction_sync');

                    console.log(`   ✅ [DATA SOURCE: PLAID API] Synced ${plaidTransactions.length} transactions`);
                    dataSource = 'PLAID_API';
                    plaidStatus = 'success';
                } catch (plaidError) {
                    // Check for specific Plaid error codes
                    const errorCode = plaidError.response?.data?.error_code;
                    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
                        plaidStatus = 'login_required';
                        console.warn('   🔒 User needs to re-authenticate via Plaid Link update mode');
                    } else {
                        plaidStatus = 'error';
                    }
                    console.warn(`   ⚠️ Plaid sync failed: ${plaidError.message}`);
                    console.log('   📦 Falling back to database cache');
                }
            } else {
                console.log('   🔒 No Plaid access token available');
                plaidStatus = 'no_token';
            }
        } else {
            console.log('   ⏱️ Cache is fresh (<24h), serving from database');
            plaidStatus = 'cached';
        }

        // Get transactions from database
        // Support filtering by account_id
        const accountId = req.query.account_id;
        if (accountId && accountId !== 'all') {
            transactions = await db.getTransactionsByAccount(userId, accountId, 100);
            console.log(`   🔍 Filtering by account: ${accountId}`);
        } else {
            transactions = await db.getTransactions(userId, 100);
        }

        if (transactions.length === 0 && !accountId) {
            console.log('   📦 No transactions found for this user');
        }

        // Sort by date descending
        const sortedTransactions = transactions.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Apply categorization to each transaction
        const categorizedTransactions = sortedTransactions.map(tx => {
            const categoryInfo = categorizeTransaction(tx);
            return {
                ...tx,
                // If Plaid category is empty, use our pattern-based category
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color
            };
        });

        // Get category breakdown for analytics
        const categoryBreakdown = getCategoryBreakdown(categorizedTransactions);

        // Run Watchdog Analysis
        const leakageAnalysis = watchdogService.analyze(categorizedTransactions);

        console.log(`   📤 Responding with ${categorizedTransactions.length} transactions (source: ${dataSource})\n`);

        res.json({
            success: true,
            count: categorizedTransactions.length,
            data: categorizedTransactions,
            categoryBreakdown,
            analysis: leakageAnalysis,
            plaid_status: plaidStatus,
            _meta: {
                source: dataSource,
                cached: dataSource === 'DATABASE',
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
