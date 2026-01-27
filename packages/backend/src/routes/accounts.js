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

        // Calculate monthly savings (income - expenses for current month)
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const monthlyTransactions = await db.query(
            `SELECT amount FROM transactions
             WHERE user_id = $1
             AND date >= $2
             AND date <= $3`,
            [userId, firstDayOfMonth, lastDayOfMonth]
        );

        // Calculate net savings (positive amount = income, negative = expense in Plaid's format)
        // We want income - expenses, so sum of positive amounts minus sum of negative amounts
        const monthlySavings = monthlyTransactions.rows.reduce((sum, tx) => {
            const amount = parseFloat(tx.amount || 0);
            // Plaid uses positive for expenses, negative for income
            // So we flip the sign: negative amount (income) becomes positive, positive (expense) becomes negative
            return sum - amount;
        }, 0);

        // Format accounts for frontend
        const formattedAccounts = [
            { id: 'all', name: 'All Accounts', type: 'aggregate', balance: liquidCash },
            ...accounts.map(acc => ({
                id: acc.plaid_account_id,
                name: acc.name,
                alias: acc.alias,
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
            change_percent: 2.4, // TODO: Calculate from historical data
            monthly_savings: monthlySavings
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch accounts', { ...ctx, error });
        next(error);
    }
});

// PUT /accounts/:plaidAccountId/alias
// Updates the alias for a specific account
// Requires authentication
router.put('/:plaidAccountId/alias', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const { plaidAccountId } = req.params;
    const { alias } = req.body;

    logger.info('Updating account alias', { ...ctx, plaidAccountId, alias });

    try {
        const userId = req.user.id;

        // Validate alias (optional field, can be null/empty to clear)
        if (alias !== null && alias !== undefined && typeof alias !== 'string') {
            return res.status(400).json({
                success: false,
                code: 'VALIDATION_ERROR',
                message: 'Alias must be a string',
            });
        }

        // Trim and limit alias length
        const trimmedAlias = alias ? alias.trim().substring(0, 255) : null;

        // Update the alias
        const result = await db.query(
            `UPDATE accounts
             SET alias = $1, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2 AND plaid_account_id = $3
             RETURNING *`,
            [trimmedAlias, userId, plaidAccountId]
        );

        if (result.rows.length === 0) {
            logger.warn('Account not found', { ...ctx, plaidAccountId });
            return res.status(404).json({
                success: false,
                code: 'NOT_FOUND',
                message: 'Account not found',
            });
        }

        logger.info('Account alias updated successfully', { ...ctx, plaidAccountId });

        successResponse(res, {
            account: {
                id: result.rows[0].plaid_account_id,
                name: result.rows[0].name,
                alias: result.rows[0].alias,
            }
        });
    } catch (error) {
        logger.error('Failed to update account alias', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
