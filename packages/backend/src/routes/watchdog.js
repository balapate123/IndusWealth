const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const { authenticateToken } = require('../middleware/auth');
const { validateWatchdogAction } = require('../middleware/validators');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, successResponse, errorResponse } = require('../utils/responseHelper');

const logger = createLogger('WATCHDOG');

// GET /watchdog
// Returns recurring expense analysis for WatchdogScreen
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const forceRefresh = req.query.force_refresh === 'true';

    logger.info('Fetching recurring expense analysis', { ...ctx, forceRefresh });

    try {
        const result = await watchdogService.analyzeForUser(req.user.id, forceRefresh);

        logger.info('Returning watchdog analysis', {
            ...ctx,
            expenseCount: result.expenses.length,
            cached: result.meta?.cached,
        });

        // Format response to match mobile UI contract
        // The mobile UI reads data.expenses, data.analysis, data.categories from the response
        // successResponse spreads data into the response, so expenses/analysis/categories are top-level
        successResponse(res, {
            expenses: result.expenses,
            analysis: result.analysis,
            alerts: result.alerts,
            categories: result.categories,
            needs_transaction_history: result.needs_transaction_history,
        }, {
            source: result.meta?.cached ? DATA_SOURCES.DATABASE : DATA_SOURCES.COMPUTED,
            cached: result.meta?.cached || false,
            lastAnalyzedAt: result.meta?.lastAnalyzedAt,
            transactionsAnalyzed: result.meta?.transactionsAnalyzed,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to analyze recurring expenses', { ...ctx, error: error.message });
        next(error);
    }
});

// POST /watchdog/action
// Handle user actions (negotiate, stop, keep, snooze, undo)
router.post('/action', authenticateToken, validateWatchdogAction, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const { expenseId, action, notes, snoozeUntil } = req.body;

    logger.info('Processing watchdog action', { ...ctx, expenseId, action });

    try {
        const result = await watchdogService.recordAction(
            req.user.id,
            parseInt(expenseId, 10),
            action,
            notes || null,
            snoozeUntil || null
        );

        if (!result) {
            return errorResponse(res, 404, 'NOT_FOUND', 'Expense not found', req.requestId);
        }

        logger.info('Watchdog action processed', { ...ctx, expenseId, action, newStatus: result.newStatus });

        res.json({
            success: true,
            data: result,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to process watchdog action', { ...ctx, error: error.message });
        next(error);
    }
});

// GET /watchdog/summary
// Quick stats for dashboard widget
router.get('/summary', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    logger.info('Fetching watchdog summary', ctx);

    try {
        const summary = await watchdogService.getSummary(req.user.id);

        successResponse(res, { ...summary }, {
            source: DATA_SOURCES.DATABASE,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to fetch watchdog summary', { ...ctx, error: error.message });
        next(error);
    }
});

module.exports = router;
