const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { buildNudgeCandidates, selectNudge } = require('../services/nudges');

const logger = createLogger('NUDGES');

/**
 * The weekly check-in.
 *
 * The device schedules a local notification with evergreen copy — local content
 * freezes when it is scheduled, not when it fires, so it cannot name a figure
 * that will still be true a week later. Opening the app calls this, which reads
 * live goals and debts and returns the one thing worth saying now.
 *
 * Scope is deliberately narrow: goals and debts the user set up, and nothing
 * else. See services/nudges.js for why that is a compliance boundary rather
 * than a product preference.
 */

// GET /nudges/checkin
router.get('/checkin', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const [goals, customDebts, state] = await Promise.all([
            db.getGoals(req.user.id, { status: 'active' }),
            db.getCustomDebts(req.user.id),
            db.getNudgeState(req.user.id),
        ]);

        const debts = (customDebts || []).map((d) => ({ ...d, is_custom: true }));
        const candidates = buildNudgeCandidates({ goals, debts, now: new Date() });
        const nudge = selectNudge(candidates, state, new Date());

        // A null nudge is a normal, frequent answer — nothing is due, or the
        // cooldown has not elapsed. It is not an error and not an empty state.
        res.json({
            success: true,
            data: nudge,
            eligible: candidates.length,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to build a check-in nudge', { ...ctx, error });
        next(error);
    }
});

// POST /nudges/checkin/seen  { key }
router.post('/checkin/seen', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const key = typeof req.body?.key === 'string' ? req.body.key.slice(0, 120) : null;

    if (!key) {
        return res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'key is required',
            requestId: req.requestId,
        });
    }

    try {
        // Sent when the sheet renders, never when it is fetched — a background
        // request nobody saw must not spend the user's one interruption a week.
        await db.recordNudgeShown(req.user.id, key);
        res.json({ success: true, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to record a shown nudge', { ...ctx, error, key });
        next(error);
    }
});

// PUT /nudges/checkin/enabled  { enabled }
router.put('/checkin/enabled', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    if (typeof req.body?.enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'enabled must be a boolean',
            requestId: req.requestId,
        });
    }

    try {
        await db.setCheckinEnabled(req.user.id, req.body.enabled);
        res.json({ success: true, enabled: req.body.enabled, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to set check-in preference', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
