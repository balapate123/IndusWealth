const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const {
    validateFlagCreate,
    validateFlagUpdate,
    validateFlagAssignment,
} = require('../middleware/validators');
const { DEFAULT_FLAGS, FLAG_ICONS, FLAG_RAMP_SIZE } = require('../services/flags');

const logger = createLogger('FLAGS');

/** Postgres unique-violation: the (user_id, LOWER(name)) index rejected a duplicate. */
const UNIQUE_VIOLATION = '23505';

const MAX_DAYS = 3650;

/** Parse ?days= into a bounded integer. Absent or junk means all time. */
const parseDays = (value) => {
    if (value === undefined || value === null || value === '' || value === 'all') return null;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) return null;
    return Math.min(parsed, MAX_DAYS);
};

/**
 * Resolve :flagId to an integer, or answer 400 rather than letting a string
 * reach Postgres and come back as a type error the client cannot act on.
 */
const parseFlagId = (req, res) => {
    const flagId = Number.parseInt(req.params.flagId, 10);
    if (Number.isNaN(flagId) || flagId < 1) {
        res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Invalid flag id',
            requestId: req.requestId,
        });
        return null;
    }
    return flagId;
};

const notFound = (req, res) => res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: 'Flag not found',
    requestId: req.requestId,
});

const nameTaken = (req, res) => res.status(409).json({
    success: false,
    code: 'FLAG_NAME_TAKEN',
    message: 'You already have a flag with that name.',
    requestId: req.requestId,
});

// GET /flags
// Every flag with its transaction count and money totals.
// Seeds the starter set the first time a user asks.
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const userId = req.user.id;

        const seeded = await db.seedDefaultFlags(userId, DEFAULT_FLAGS);
        if (seeded) logger.info('Seeded default flags', { ...ctx, count: DEFAULT_FLAGS.length });

        const flags = await db.getFlags(userId);

        res.json({
            success: true,
            count: flags.length,
            data: flags,
            // The picker builds itself from these rather than hardcoding a copy
            // that would drift from what the API will accept.
            options: { icons: FLAG_ICONS, rampSize: FLAG_RAMP_SIZE },
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to fetch flags', { ...ctx, error });
        next(error);
    }
});

// POST /flags
router.post('/', authenticateToken, validateFlagCreate, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const { name, colorIndex = 0, icon = 'pricetag' } = req.body;
        const flag = await db.createFlag(req.user.id, { name, colorIndex, icon });

        logger.info('Flag created', { ...ctx, flagId: flag.id });
        res.status(201).json({ success: true, data: flag, requestId: req.requestId });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) return nameTaken(req, res);
        logger.error('Failed to create flag', { ...ctx, error });
        next(error);
    }
});

// PATCH /flags/:flagId
router.patch('/:flagId', authenticateToken, validateFlagUpdate, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const flagId = parseFlagId(req, res);
        if (flagId === null) return;

        const { name, colorIndex, icon } = req.body;
        const flag = await db.updateFlag(req.user.id, flagId, { name, colorIndex, icon });
        if (!flag) return notFound(req, res);

        logger.info('Flag updated', { ...ctx, flagId });
        res.json({ success: true, data: flag, requestId: req.requestId });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) return nameTaken(req, res);
        logger.error('Failed to update flag', { ...ctx, error });
        next(error);
    }
});

// DELETE /flags/:flagId
// Assignments cascade; the transactions themselves are untouched.
router.delete('/:flagId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const flagId = parseFlagId(req, res);
        if (flagId === null) return;

        const deleted = await db.deleteFlag(req.user.id, flagId);
        if (!deleted) return notFound(req, res);

        logger.info('Flag deleted', { ...ctx, flagId });
        res.json({ success: true, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to delete flag', { ...ctx, error });
        next(error);
    }
});

// POST /flags/:flagId/transactions
// Bulk attach/detach in one round trip: { add: [plaidTxId], remove: [plaidTxId] }.
// The multi-select picker sends a whole diff, which as individual requests would
// be one round trip per checkbox.
router.post('/:flagId/transactions', authenticateToken, validateFlagAssignment, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const flagId = parseFlagId(req, res);
        if (flagId === null) return;

        const { add = [], remove = [] } = req.body;
        const result = await db.setFlagAssignments(req.user.id, flagId, { add, remove });
        if (!result) return notFound(req, res);

        // Fresh count and totals so the caller does not have to re-list to know
        // where the flag landed.
        const flags = await db.getFlags(req.user.id);
        const flag = flags.find((f) => f.id === flagId) || null;

        logger.info('Flag assignments updated', { ...ctx, flagId, ...result });
        res.json({ success: true, data: flag, ...result, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to update flag assignments', { ...ctx, error });
        next(error);
    }
});

// GET /flags/:flagId/analytics?days=
// Totals and breakdowns over everything carrying the flag. Computed here rather
// than on the device, which only ever holds one page of transactions.
router.get('/:flagId/analytics', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const flagId = parseFlagId(req, res);
        if (flagId === null) return;

        const flag = await db.getFlagById(req.user.id, flagId);
        if (!flag) return notFound(req, res);

        const days = parseDays(req.query.days);
        const analytics = await db.getFlagAnalytics(req.user.id, { flagId, days });

        logger.debug('Flag analytics', { ...ctx, flagId, days, count: analytics.totals.count });
        res.json({ success: true, flag, days, ...analytics, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to fetch flag analytics', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
