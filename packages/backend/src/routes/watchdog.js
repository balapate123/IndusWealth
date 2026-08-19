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

// GET /watchdog/watches/outcomes
// Outcomes the user has not been shown yet: did the thing they cancelled
// actually stop, did the bill they negotiated actually drop.
//
// Read-only on purpose. The device confirms with POST /seen only what it managed
// to put on screen -- the goal-milestone protocol, where marking them notified
// inside the reporting loop meant one failed app-open consumed the event forever.
router.get('/watches/outcomes', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const outcomes = await watchdogService.getUnpresentedOutcomes(req.user.id);
        logger.info('Returning watch outcomes', { ...ctx, count: outcomes.length });

        successResponse(res, { outcomes }, {
            source: DATA_SOURCES.DATABASE,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to fetch watch outcomes', { ...ctx, error: error.message });
        next(error);
    }
});

// POST /watchdog/watches/:watchId/seen
// The outcome reached the screen. Sent when it renders, never when it is
// fetched, or a background request spends the one chance to tell them.
router.post('/watches/:watchId/seen', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const watchId = parseInt(req.params.watchId, 10);

    if (!Number.isInteger(watchId) || watchId < 1) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'watchId must be a positive integer', req.requestId);
    }

    try {
        const marked = await watchdogService.markWatchPresented(req.user.id, watchId);
        logger.info('Watch outcome marked presented', { ...ctx, watchId, marked });

        // Already presented is not an error -- two devices racing is the
        // expected case, and the second one has nothing left to do.
        res.json({ success: true, data: { marked }, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to mark watch presented', { ...ctx, error: error.message });
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
