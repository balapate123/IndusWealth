const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const watchdogService = require('../services/watchdog');
const db = require('../services/db');

// Default user ID for MVP (test user)
const DEFAULT_USER_ID = 1;

// GET /transactions
// Fetches transactions from cache or Plaid (if stale)
router.get('/', async (req, res) => {
    console.log('\n📥 [GET /transactions] Request received');

    try {
        const userId = parseInt(req.headers['x-user-id']) || DEFAULT_USER_ID;
        const forceRefresh = req.query.refresh === 'true';

        // Check if we need to sync from Plaid (conservative: 24 hours)
        const needsSync = forceRefresh || await db.shouldSync(userId, 'last_transaction_sync', 24);

        let transactions = [];
        let dataSource = 'DATABASE';

        if (needsSync) {
            console.log('   🔄 Cache stale or force refresh - syncing from Plaid...');

            // Get user's Plaid access token
            const user = await db.getUserById(userId);
            const accessToken = user?.plaid_access_token || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

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
                } catch (plaidError) {
                    console.warn(`   ⚠️ Plaid sync failed: ${plaidError.message}`);
                    console.log('   📦 Falling back to database cache');
                }
            } else {
                console.log('   🔒 No Plaid access token available');
            }
        } else {
            console.log('   ⏱️ Cache is fresh (<24h), serving from database');
        }

        // Get transactions from database
        transactions = await db.getTransactions(userId, 100);

        if (transactions.length === 0) {
            console.log('   📦 [DATA SOURCE: MOCK] No cached data, using mock transactions');
            dataSource = 'MOCK';
            transactions = getMockTransactions();
        }

        // Sort by date descending
        const sortedTransactions = transactions.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Run Watchdog Analysis
        const leakageAnalysis = watchdogService.analyze(sortedTransactions);

        console.log(`   📤 Responding with ${sortedTransactions.length} transactions (source: ${dataSource})\n`);

        res.json({
            success: true,
            count: sortedTransactions.length,
            data: sortedTransactions,
            analysis: leakageAnalysis,
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

// Mock transactions for when database is empty
function getMockTransactions() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    return [
        {
            transaction_id: 't1',
            name: 'Starbucks',
            amount: 5.45,
            date: today,
            category: ['Coffee & Snacks'],
            iso_currency_code: 'CAD'
        },
        {
            transaction_id: 't2',
            name: 'Payroll Deposit',
            amount: -2400.00,
            date: today,
            category: ['Income'],
            iso_currency_code: 'CAD'
        },
        {
            transaction_id: 't3',
            name: 'Uber Trip',
            amount: 14.20,
            date: today,
            category: ['Transportation'],
            iso_currency_code: 'CAD'
        },
        {
            transaction_id: 't4',
            name: 'Hydro One',
            amount: 85.00,
            date: yesterday,
            category: ['Utilities'],
            iso_currency_code: 'CAD'
        },
        {
            transaction_id: 't5',
            name: 'Loblaws',
            amount: 124.50,
            date: yesterday,
            category: ['Groceries'],
            iso_currency_code: 'CAD'
        },
    ];
}

module.exports = router;
