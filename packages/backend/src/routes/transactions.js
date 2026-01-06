const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const watchdogService = require('../services/watchdog');

// GET /transactions
// Fetches unified transaction history & Watchdog analysis
router.get('/', async (req, res) => {
    try {
        // In a real app, accessToken comes from DB associated with the authenticated user
        // For MVP, we might expect it in header or use a hardcoded Test Token if in Sandbox
        const accessToken = req.headers['plaid-access-token'] || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

        // 1. Fetch Transactions
        const transactions = await plaidService.getTransactions(accessToken);

        // Sort by date descending
        const sortedTransactions = transactions.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // 2. Run Watchdog Analysis
        const leakageAnalysis = watchdogService.analyze(sortedTransactions);

        res.json({
            success: true,
            count: sortedTransactions.length,
            data: sortedTransactions,
            analysis: leakageAnalysis
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
