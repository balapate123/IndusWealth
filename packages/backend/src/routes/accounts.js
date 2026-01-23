const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, createMeta, successResponse } = require('../utils/responseHelper');

const logger = createLogger('ACCOUNTS');

// GET /accounts
// Returns linked accounts with balances from database cache
// Requires authentication
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching accounts', ctx);

    try {
        const userId = req.user.id;

        // Get accounts from database cache
        const accounts = await db.getAccounts(userId);

        if (accounts.length === 0) {
            logger.info('No accounts linked for this user', ctx);

            const meta = await createMeta(userId, DATA_SOURCES.EMPTY, {
                syncType: 'last_account_sync'
            });

            return successResponse(res, {
                accounts: [],
                total_balance: 0,
                liquid_cash: 0,
                change_percent: 0,
                needs_bank_connection: true
            }, meta);
        }

        logger.info('Returning cached accounts', { ...ctx, count: accounts.length, dataSource: DATA_SOURCES.DATABASE });

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

        const meta = await createMeta(userId, DATA_SOURCES.DATABASE, {
            syncType: 'last_account_sync',
            count: formattedAccounts.length
        });

        successResponse(res, {
            accounts: formattedAccounts,
            total_balance: totalBalance,
            liquid_cash: liquidCash,
            change_percent: 2.4 // TODO: Calculate from historical data
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch accounts', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
