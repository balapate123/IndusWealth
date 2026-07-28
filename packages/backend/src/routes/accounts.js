const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, createMeta, successResponse } = require('../utils/responseHelper');

const logger = createLogger('ACCOUNTS');

/** Number, or null — so "no data" survives to the client instead of becoming 0. */
const num = (value) => (value === null || value === undefined ? null : parseFloat(value));

/**
 * Accounts where the balance is money owed against a limit rather than money
 * held. Plaid files revolving credit under two different types: credit cards are
 * `credit`, while a line of credit is `loan`/`line of credit`.
 */
const isRevolvingCredit = (account) =>
    account.type === 'credit' || account.subtype === 'line of credit';

/**
 * Accounts whose balance is a liability. Wider than revolving credit — a
 * mortgage or student loan is debt too, it just has no "available credit" to
 * show.
 *
 * Plaid reports these as a POSITIVE current_balance meaning money owed, so they
 * must never be added into an asset total. A negative balance means the lender
 * owes the user (an overpaid card), which is why nothing here takes an absolute
 * value: summed raw, an overpaid card correctly reduces total debt.
 */
const isDebtAccount = (account) =>
    account.type === 'credit' || account.type === 'loan';

const sumBalances = (accounts) =>
    accounts.reduce((sum, acc) => sum + (num(acc.current_balance) ?? 0), 0);

/**
 * Shape one account for the app, including the three balances Plaid reports.
 *
 * `available_balance` used to be dropped here and the credit limit was never
 * stored at all, so a credit card could only ever show what was owed — never
 * how much room was left on it.
 */
const formatAccount = (acc) => {
    const current = num(acc.current_balance) ?? 0;
    const available = num(acc.available_balance);
    const limit = num(acc.credit_limit);
    const credit = isRevolvingCredit(acc);

    // Prefer limit − available for the used figure: it is what the bank itself
    // is asserting, and it stays right when a card is overpaid and `current`
    // goes negative.
    const used = credit
        ? (limit != null && available != null ? limit - available : current)
        : null;

    return {
        id: acc.plaid_account_id,
        name: acc.name,
        alias: acc.alias,
        officialName: acc.official_name,
        type: acc.type,
        subtype: acc.subtype,
        mask: acc.mask,
        balance: current,
        available,
        limit,
        currency: acc.iso_currency_code || 'CAD',
        isCredit: credit,
        used,
        // 0–1, only when the bank told us a limit. Left null rather than
        // guessed: a made-up utilisation is worse than none.
        utilization: credit && limit > 0 && used != null ? used / limit : null,
        bank: acc.name.split(' ')[0], // Extract bank name from account name
    };
};

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
                total_debt: 0,
                net_worth: 0,
                liquid_cash: 0,
                change_percent: 0,
                needs_bank_connection: true
            }, meta);
        }

        logger.info('Returning cached accounts', { ...ctx, count: accounts.length, dataSource: DATA_SOURCES.DATABASE });

        // Assets only. This used to sum every account, and because Plaid reports
        // a card's balance as a positive number meaning money owed, a $1,350
        // card balance was added to the figure the app labels "Total assets" —
        // so the more you owed, the wealthier the app said you were.
        const totalBalance = sumBalances(accounts.filter(acc => !isDebtAccount(acc)));
        const totalDebt = sumBalances(accounts.filter(isDebtAccount));
        const netWorth = totalBalance - totalDebt;

        // Calculate liquid cash (only checking, savings, and depository accounts)
        const liquidAccountTypes = ['checking', 'savings', 'depository'];
        const liquidCash = sumBalances(accounts.filter(
            acc => liquidAccountTypes.includes(acc.type) || liquidAccountTypes.includes(acc.subtype)
        ));

        // Calculate monthly savings (income - expenses for current month)
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const monthlyTransactions = await db.pool.query(
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

        // Calculate balance change percentage (compare current balance to 30 days ago)
        let changePercent = 0;
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const last30DaysTransactions = await db.pool.query(
            `SELECT amount FROM transactions
             WHERE user_id = $1
             AND date > $2
             AND account_id IN (
                 SELECT id FROM accounts
                 WHERE user_id = $1
                 AND (type = ANY($3) OR subtype = ANY($3))
             )`,
            [userId, thirtyDaysAgo, liquidAccountTypes]
        );

        // Sum of all transactions in last 30 days (Plaid format: positive = expense, negative = income)
        const transactionSum = last30DaysTransactions.rows.reduce((sum, tx) => {
            return sum + parseFloat(tx.amount || 0);
        }, 0);

        // Calculate balance 30 days ago
        // current_balance = previous_balance - transaction_sum (Plaid format)
        // So: previous_balance = current_balance + transaction_sum
        const previousBalance = liquidCash + transactionSum;

        // Calculate percentage change
        if (previousBalance !== 0) {
            changePercent = ((liquidCash - previousBalance) / Math.abs(previousBalance)) * 100;
            // Round to 1 decimal place
            changePercent = Math.round(changePercent * 10) / 10;
        }

        // Format accounts for frontend
        const formattedAccounts = [
            { id: 'all', name: 'All Accounts', type: 'aggregate', balance: liquidCash },
            ...accounts.map(formatAccount)
        ];

        const meta = await createMeta(userId, DATA_SOURCES.DATABASE, {
            syncType: 'last_account_sync',
            count: formattedAccounts.length
        });

        successResponse(res, {
            accounts: formattedAccounts,
            // Assets only — see the comment where it is computed.
            total_balance: totalBalance,
            total_debt: totalDebt,
            net_worth: netWorth,
            liquid_cash: liquidCash,
            change_percent: changePercent,
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
        const result = await db.pool.query(
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
