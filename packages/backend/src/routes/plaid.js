const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');

// POST /plaid/create_link_token
// Creates a Plaid Link token for the authenticated user
router.post('/create_link_token', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const data = await plaidService.createLinkToken(userId.toString());
        res.json(data);
    } catch (error) {
        console.error('Error creating link token:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /plaid/exchange_public_token
// Exchanges Plaid public token for access token and saves to user
router.post('/exchange_public_token', authenticateToken, async (req, res) => {
    try {
        const { public_token } = req.body;
        const userId = req.user.id;

        if (!public_token) {
            return res.status(400).json({ error: 'Public token is required' });
        }

        const accessToken = await plaidService.exchangePublicToken(public_token);

        // Automatically save the connection for the user
        await db.updateUserPlaidToken(userId, accessToken, null);

        console.log(`🔗 [POST /plaid/exchange_public_token] Token exchanged and saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Bank connected successfully'
        });
    } catch (error) {
        console.error('Error exchanging public token:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /plaid/save_connection
// Save the Plaid connection for a user (alternative endpoint)
router.post('/save_connection', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { access_token, item_id } = req.body;

        if (!access_token) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        await db.updateUserPlaidToken(userId, access_token, item_id);

        console.log(`🔗 [POST /plaid/save_connection] Bank linked for user ${userId}`);

        res.json({ success: true, message: 'Bank connection saved successfully' });
    } catch (error) {
        console.error('Error saving bank connection:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /plaid/disconnect
// Disconnect Plaid from user account and clear all data
router.delete('/disconnect', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete all transactions first (due to foreign key constraints)
        const deletedTx = await db.deleteUserTransactions(userId);
        console.log(`🗑️ Deleted ${deletedTx} transactions for user ${userId}`);

        // Delete all accounts
        const deletedAccounts = await db.deleteUserAccounts(userId);
        console.log(`🗑️ Deleted ${deletedAccounts} accounts for user ${userId}`);

        // Clear Plaid tokens
        await db.clearUserPlaidTokens(userId);

        console.log(`🔓 [DELETE /plaid/disconnect] Bank fully disconnected for user ${userId}`);

        res.json({
            success: true,
            message: 'Bank disconnected successfully',
            deleted: {
                transactions: deletedTx,
                accounts: deletedAccounts
            }
        });
    } catch (error) {
        console.error('Error disconnecting bank:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /plaid/account/:accountId
// Disconnect a single account and its transactions
router.delete('/account/:accountId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountId } = req.params;

        if (!accountId) {
            return res.status(400).json({ error: 'Account ID is required' });
        }

        // Delete transactions for this specific account
        const deletedTx = await db.deleteAccountTransactions(userId, accountId);
        console.log(`🗑️ Deleted ${deletedTx} transactions for account ${accountId}`);

        // Delete the account
        const deletedAccount = await db.deleteAccount(userId, accountId);
        console.log(`🗑️ Deleted account ${accountId} for user ${userId}`);

        res.json({
            success: true,
            message: 'Account disconnected successfully',
            deleted: {
                transactions: deletedTx,
                account: deletedAccount
            }
        });
    } catch (error) {
        console.error('Error disconnecting account:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
