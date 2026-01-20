const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const { authenticateToken } = require('../middleware/auth');

// GET /watchdog
// Returns recurring expense analysis for WatchdogScreen
// Requires authentication
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /watchdog] Request received');

    try {
        // TODO: In production, analyze user's transaction history to detect recurring patterns
        // For now, return empty array until real pattern detection is implemented
        const recurringExpenses = [];

        console.log('   📦 Recurring expense detection pending implementation\n');

        // Calculate potential savings (items that can be stopped or negotiated)
        const potentialSavings = recurringExpenses
            .filter(e => e.action === 'stop' || e.action === 'negotiate')
            .reduce((sum, e) => sum + e.amount, 0);

        const flagsFound = recurringExpenses.filter(e => e.action !== 'active').length;

        res.json({
            success: true,
            expenses: recurringExpenses,
            analysis: {
                potential_savings: potentialSavings,
                flags_found: flagsFound,
                total_monthly: recurringExpenses.reduce((sum, e) => sum + e.amount, 0),
            },
            categories: ['All', 'Streaming', 'Utilities', 'Health', 'Other'],
            needs_transaction_history: true
        });
    } catch (error) {
        console.error('Error analyzing recurring expenses:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /watchdog/action
// Handle actions like negotiate, stop, etc.
// Requires authentication
router.post('/action', authenticateToken, async (req, res) => {
    try {
        const { expenseId, action } = req.body;
        const userId = req.user.id;

        console.log(`📝 [POST /watchdog/action] User ${userId}: ${action} on expense ${expenseId}`);

        // In production, this would update the expense status in the database
        res.json({
            success: true,
            message: `Action '${action}' registered for expense ${expenseId}`,
        });
    } catch (error) {
        console.error('Error processing action:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
