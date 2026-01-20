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
            console.log('   📦 No accounts linked for this user\n');

            // Return empty accounts - user needs to connect a bank
            return res.json({
                success: true,
                accounts: [],
                total_balance: 0,
                liquid_cash: 0,
                change_percent: 0,
                needs_bank_connection: true,
                _meta: { source: 'EMPTY' }
            });
        }

        console.log(`   📦 [DATA SOURCE: DATABASE] Returning ${accounts.length} cached accounts\n`);

        // Calculate total balance (all accounts)
        const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

        // Calculate liquid cash (only checking, savings, and depository accounts)
        const liquidAccountTypes = ['checking', 'savings', 'depository'];
        const liquidCash = accounts
            .filter(acc => liquidAccountTypes.includes(acc.type) || liquidAccountTypes.includes(acc.subtype))
            .reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

        // Format accounts for frontend
        const formattedAccounts = [
            { id: 'all', name: 'All Accounts', type: 'aggregate', balance: liquidCash },
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
            liquid_cash: liquidCash,
            change_percent: 2.4, // TODO: Calculate from historical data
            _meta: { source: 'DATABASE' }
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
