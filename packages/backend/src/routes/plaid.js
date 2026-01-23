const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { ValidationError, PlaidError } = require('../errors/AppError');
const { successResponse } = require('../utils/responseHelper');

const logger = createLogger('PLAID');

// POST /plaid/create_link_token
// Creates a Plaid Link token for the authenticated user
router.post('/create_link_token', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Creating Plaid link token', ctx);

    try {
        const userId = req.user.id;
        const data = await plaidService.createLinkToken(userId.toString());

        logger.info('Link token created successfully', ctx);

        res.json(data);
    } catch (error) {
        logger.error('Failed to create link token', { ...ctx, error });
        next(PlaidError.fromPlaidResponse(error));
    }
});

// POST /plaid/create_update_link_token
// Creates a Plaid Link token in UPDATE MODE for re-authentication
// Use this when ITEM_LOGIN_REQUIRED error occurs
router.post('/create_update_link_token', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Creating Plaid update link token', ctx);

    try {
        const userId = req.user.id;
        const accessToken = req.user.plaidAccessToken;

        if (!accessToken) {
            logger.warn('No Plaid access token found for user', ctx);
            throw new ValidationError('No bank connection found. Please link a bank account first.', {
                code: 'NO_CONNECTION'
            });
        }

        const data = await plaidService.createUpdateLinkToken(userId.toString(), accessToken);

        logger.info('Update link token created successfully', ctx);

        successResponse(res, data, { timestamp: new Date().toISOString() });
    } catch (error) {
        if (error instanceof ValidationError) {
            return next(error);
        }
        logger.error('Failed to create update link token', { ...ctx, error });
        next(PlaidError.fromPlaidResponse(error));
    }
});

// POST /plaid/exchange_public_token
// Exchanges Plaid public token for access token and saves to user
router.post('/exchange_public_token', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Exchanging Plaid public token', ctx);

    try {
        const { public_token } = req.body;
        const userId = req.user.id;

        if (!public_token) {
            throw new ValidationError('Public token is required', { field: 'public_token' });
        }

        const accessToken = await plaidService.exchangePublicToken(public_token);

        // Automatically save the connection for the user
        await db.updateUserPlaidToken(userId, accessToken, null);

        logger.info('Token exchanged and saved', ctx);

        successResponse(res, {
            message: 'Bank connected successfully'
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        if (error instanceof ValidationError) {
            return next(error);
        }
        logger.error('Failed to exchange public token', { ...ctx, error });
        next(PlaidError.fromPlaidResponse(error));
    }
});

// POST /plaid/save_connection
// Save the Plaid connection for a user (alternative endpoint)
router.post('/save_connection', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Saving Plaid connection', ctx);

    try {
        const userId = req.user.id;
        const { access_token, item_id } = req.body;

        if (!access_token) {
            throw new ValidationError('Access token is required', { field: 'access_token' });
        }

        await db.updateUserPlaidToken(userId, access_token, item_id);

        logger.info('Bank connection saved', ctx);

        successResponse(res, {
            message: 'Bank connection saved successfully'
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        if (error instanceof ValidationError) {
            return next(error);
        }
        logger.error('Failed to save bank connection', { ...ctx, error });
        next(error);
    }
});

// DELETE /plaid/disconnect
// Disconnect Plaid from user account and clear all data
router.delete('/disconnect', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Disconnecting bank', ctx);

    try {
        const userId = req.user.id;

        // Delete all transactions first (due to foreign key constraints)
        const deletedTx = await db.deleteUserTransactions(userId);
        logger.debug('Deleted transactions', { ...ctx, count: deletedTx });

        // Delete all accounts
        const deletedAccounts = await db.deleteUserAccounts(userId);
        logger.debug('Deleted accounts', { ...ctx, count: deletedAccounts });

        // Clear Plaid tokens
        await db.clearUserPlaidTokens(userId);

        logger.info('Bank fully disconnected', { ...ctx, deletedTransactions: deletedTx, deletedAccounts });

        successResponse(res, {
            message: 'Bank disconnected successfully',
            deleted: {
                transactions: deletedTx,
                accounts: deletedAccounts
            }
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Failed to disconnect bank', { ...ctx, error });
        next(error);
    }
});

// DELETE /plaid/account/:accountId
// Disconnect a single account and its transactions
router.delete('/account/:accountId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id, accountId: req.params.accountId };
    logger.info('Disconnecting single account', ctx);

    try {
        const userId = req.user.id;
        const { accountId } = req.params;

        if (!accountId) {
            throw new ValidationError('Account ID is required', { field: 'accountId' });
        }

        // Delete transactions for this specific account
        const deletedTx = await db.deleteAccountTransactions(userId, accountId);
        logger.debug('Deleted account transactions', { ...ctx, count: deletedTx });

        // Delete the account
        const deletedAccount = await db.deleteAccount(userId, accountId);
        logger.debug('Deleted account', { ...ctx, deleted: deletedAccount });

        logger.info('Account disconnected', { ...ctx, deletedTransactions: deletedTx });

        successResponse(res, {
            message: 'Account disconnected successfully',
            deleted: {
                transactions: deletedTx,
                account: deletedAccount
            }
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        if (error instanceof ValidationError) {
            return next(error);
        }
        logger.error('Failed to disconnect account', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
