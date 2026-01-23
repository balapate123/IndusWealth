const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, successResponse } = require('../utils/responseHelper');

const logger = createLogger('WATCHDOG');

// GET /watchdog
// Returns recurring expense analysis for WatchdogScreen
// Requires authentication
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching recurring expense analysis', ctx);

    try {
        // TODO: In production, analyze user's transaction history to detect recurring patterns
        // For now, return empty array until real pattern detection is implemented
        const recurringExpenses = [];

        logger.debug('Recurring expense detection pending implementation', ctx);

        // Calculate potential savings (items that can be stopped or negotiated)
        const potentialSavings = recurringExpenses
            .filter(e => e.action === 'stop' || e.action === 'negotiate')
            .reduce((sum, e) => sum + e.amount, 0);

        const flagsFound = recurringExpenses.filter(e => e.action !== 'active').length;

        logger.info('Returning watchdog analysis', {
            ...ctx,
            expenseCount: recurringExpenses.length,
            potentialSavings,
            flagsFound
        });

        successResponse(res, {
            expenses: recurringExpenses,
            analysis: {
                potential_savings: potentialSavings,
                flags_found: flagsFound,
                total_monthly: recurringExpenses.reduce((sum, e) => sum + e.amount, 0),
            },
            categories: ['All', 'Streaming', 'Utilities', 'Health', 'Other'],
            needs_transaction_history: true
        }, {
            source: DATA_SOURCES.COMPUTED,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to analyze recurring expenses', { ...ctx, error });
        next(error);
    }
});

// POST /watchdog/action
// Handle actions like negotiate, stop, etc.
// Requires authentication
router.post('/action', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const { expenseId, action } = req.body;
    logger.info('Processing watchdog action', { ...ctx, expenseId, action });

    try {
        // In production, this would update the expense status in the database
        logger.info('Watchdog action registered', { ...ctx, expenseId, action });

        res.json({
            success: true,
            message: `Action '${action}' registered for expense ${expenseId}`,
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Failed to process watchdog action', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
