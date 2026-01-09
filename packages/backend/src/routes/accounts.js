const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');

// GET /accounts
// Returns linked accounts with balances from database cache
// Requires authentication
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /accounts] Request received');

    try {
        const userId = req.user.id;

        // Get accounts from database cache
        const accounts = await db.getAccounts(userId);

        if (accounts.length === 0) {
            console.log('   🔒 No cached accounts, returning mock data');
            console.log('   📦 [DATA SOURCE: MOCK] Using mock account data\n');

            // Return mock accounts for development
            return res.json({
                success: true,
                accounts: [
                    { id: 'all', name: 'All Accounts', type: 'aggregate', balance: 24592.45 },
                    { id: 'td', name: 'TD Checking', bank: 'TD', type: 'checking', balance: 15234.50 },
                    { id: 'rbc', name: 'RBC Savings', bank: 'RBC', type: 'savings', balance: 9357.95 },
                ],
                total_balance: 24592.45,
                change_percent: 2.4,
                _meta: { source: 'MOCK' }
            });
        }

        console.log(`   📦 [DATA SOURCE: DATABASE] Returning ${accounts.length} cached accounts\n`);

        // Calculate total balance
        const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

        // Format accounts for frontend
        const formattedAccounts = [
            { id: 'all', name: 'All Accounts', type: 'aggregate', balance: totalBalance },
            ...accounts.map(acc => ({
                id: acc.plaid_account_id,
                name: acc.name,
                officialName: acc.official_name,
                type: acc.type,
                subtype: acc.subtype,
                mask: acc.mask,
                balance: parseFloat(acc.current_balance || 0),
                bank: acc.name.split(' ')[0], // Extract bank name from account name
            }))
        ];

        res.json({
            success: true,
            accounts: formattedAccounts,
            total_balance: totalBalance,
            change_percent: 2.4, // TODO: Calculate from historical data
            _meta: { source: 'DATABASE' }
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
