const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const { authenticateToken } = require('../middleware/auth');

// GET /watchdog
// Returns recurring expense analysis for WatchdogScreen
// Requires authentication
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /watchdog] Request received');
    console.log('   📦 [DATA SOURCE: MOCK] Using mock recurring expenses\n');

    try {
        // Category-based recurring expenses detection
        // In production, this would analyze transaction history patterns for this user
        const recurringExpenses = [
            {
                id: 1,
                name: 'Rogers',
                fullName: 'Rogers Communications',
                amount: 85.00,
                dueDate: 'Oct 15',
                category: 'Mobile & Internet',
                logoColor: '#D32F2F',
                action: 'negotiate',
                isRecurring: true,
            },
            {
                id: 2,
                name: 'Netflix Premium',
                fullName: 'Netflix Premium',
                amount: 16.99,
                dueDate: 'Oct 12',
                category: 'Streaming',
                logoColor: '#E50914',
                action: 'stop',
                isRecurring: true,
            },
            {
                id: 3,
                name: 'GoodLife Fitness',
                fullName: 'GoodLife Fitness',
                amount: 29.99,
                dueDate: 'Oct 20',
                category: 'Health',
                logoColor: '#4CAF50',
                action: 'stop',
                isRecurring: true,
            },
            {
                id: 4,
                name: 'Spotify Duo',
                fullName: 'Spotify Duo',
                amount: 10.99,
                dueDate: 'Oct 28',
                category: 'Music',
                logoColor: '#1DB954',
                action: 'active',
                isRecurring: true,
            },
        ];

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
            categories: ['All', 'Streaming', 'Utilities', 'Health', 'Other']
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
