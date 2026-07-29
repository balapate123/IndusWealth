const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const {
    validateGoalCreate,
    validateGoalUpdate,
    validateGoalContribution,
    validateGoalMilestones,
} = require('../middleware/validators');
const {
    GOAL_ICONS,
    GOAL_RAMP_SIZE,
    GOAL_TYPES,
    REMINDER_CADENCES,
    MILESTONES,
    SUGGESTED_GOAL,
    newMilestones,
} = require('../services/goals');

const logger = createLogger('GOALS');

/** Postgres unique-violation: the (user_id, LOWER(name)) index rejected a duplicate. */
const UNIQUE_VIOLATION = '23505';

/** Cap on how many goals one account can hold. */
const MAX_GOALS = 25;

const parseGoalId = (req, res) => {
    const goalId = Number.parseInt(req.params.goalId, 10);
    if (Number.isNaN(goalId) || goalId < 1) {
        res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Invalid goal id',
            requestId: req.requestId,
        });
        return null;
    }
    return goalId;
};

const notFound = (req, res) => res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: 'Goal not found',
    requestId: req.requestId,
});

const nameTaken = (req, res) => res.status(409).json({
    success: false,
    code: 'GOAL_NAME_TAKEN',
    message: 'You already have a goal with that name.',
    requestId: req.requestId,
});

const accountNotFound = (req, res) => res.status(404).json({
    success: false,
    code: 'ACCOUNT_NOT_FOUND',
    message: 'That account is not connected to your profile.',
    requestId: req.requestId,
});

/**
 * The options block the mobile editor builds itself from, rather than keeping a
 * hardcoded copy that would drift from what the API will accept.
 */
const options = {
    icons: GOAL_ICONS,
    rampSize: GOAL_RAMP_SIZE,
    types: GOAL_TYPES,
    cadences: REMINDER_CADENCES,
    milestones: MILESTONES,
    suggested: SUGGESTED_GOAL,
};

// GET /goals?status=active|all|archived
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const status = req.query.status || 'active';
        const goals = await db.getGoals(req.user.id, { status });

        res.json({
            success: true,
            count: goals.length,
            data: goals,
            options,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to fetch goals', { ...ctx, error });
        next(error);
    }
});

// POST /goals/milestones/check
//
// Called when the app opens. Local notifications freeze their content at
// schedule time, so a milestone cannot be scheduled in advance — the device
// asks which ones have been newly crossed and presents them itself.
//
// READ-ONLY. It used to call markGoalMilestones here, which meant the milestone
// was consumed by the act of asking: if the device then could not show it —
// notification permission not granted is the common case, and presentMilestones
// returns silently in that case — the milestone was already recorded as
// announced and newMilestones() would filter it out forever. One missed
// notification, permanently. The device now confirms via
// POST /goals/:goalId/milestones once it has actually scheduled something, so
// an unshowable milestone stays pending and fires whenever notifications are
// turned on. Two devices still cannot both claim one: whichever confirms first
// records it, and the loser's next check no longer sees it.
//
// Declared above the /:goalId routes so a literal path can never be captured
// by the parameter.
router.post('/milestones/check', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goals = await db.getGoals(req.user.id, { status: 'active' });
        const crossed = [];

        for (const goal of goals) {
            if (goal.progress_percent === null) continue;   // account disconnected
            const reached = newMilestones(goal.progress_percent, goal.milestones_notified);
            if (reached.length === 0) continue;

            crossed.push({
                goal_id: goal.id,
                name: goal.name,
                milestones: reached,
                progress_percent: goal.progress_percent,
                target_amount: goal.target_amount,
                saved_amount: goal.saved_amount,
                achieved: reached.includes(100),
            });
        }

        if (crossed.length) logger.info('Milestones crossed', { ...ctx, count: crossed.length });
        res.json({ success: true, count: crossed.length, data: crossed, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to check milestones', { ...ctx, error });
        next(error);
    }
});

// GET /goals/:goalId — one goal plus its manual contributions
router.get('/:goalId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const goal = await db.getGoalById(req.user.id, goalId);
        if (!goal) return notFound(req, res);

        // Only meaningful for manual goals; an account-tracked goal reads its
        // balance, so the list is empty rather than misleading.
        const contributions = goal.tracking_mode === 'manual'
            ? await db.getGoalContributions(req.user.id, goalId)
            : [];

        res.json({ success: true, data: goal, contributions, options, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to fetch goal', { ...ctx, error });
        next(error);
    }
});

// POST /goals
router.post('/', authenticateToken, validateGoalCreate, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const existing = await db.getGoals(req.user.id, { status: 'all' });
        if (existing.length >= MAX_GOALS) {
            return res.status(409).json({
                success: false,
                code: 'GOAL_LIMIT_REACHED',
                message: `You can have up to ${MAX_GOALS} goals. Archive one to make room.`,
                requestId: req.requestId,
            });
        }

        const goal = await db.createGoal(req.user.id, req.body);
        // createGoal returns null only when the account id was not this
        // user's — the ownership check lives in the query, not here.
        if (!goal) return accountNotFound(req, res);

        logger.info('Goal created', { ...ctx, goalId: goal.id, trackingMode: goal.tracking_mode });
        res.status(201).json({ success: true, data: goal, requestId: req.requestId });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) return nameTaken(req, res);
        logger.error('Failed to create goal', { ...ctx, error });
        next(error);
    }
});

// PATCH /goals/:goalId
router.patch('/:goalId', authenticateToken, validateGoalUpdate, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const before = await db.getGoalById(req.user.id, goalId);
        if (!before) return notFound(req, res);

        const goal = await db.updateGoal(req.user.id, goalId, req.body);
        if (!goal) return accountNotFound(req, res);

        logger.info('Goal updated', { ...ctx, goalId });
        res.json({ success: true, data: goal, requestId: req.requestId });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) return nameTaken(req, res);
        logger.error('Failed to update goal', { ...ctx, error });
        next(error);
    }
});

// DELETE /goals/:goalId — contributions cascade
router.delete('/:goalId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const deleted = await db.deleteGoal(req.user.id, goalId);
        if (!deleted) return notFound(req, res);

        logger.info('Goal deleted', { ...ctx, goalId });
        res.json({ success: true, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to delete goal', { ...ctx, error });
        next(error);
    }
});

// POST /goals/:goalId/contributions — manual goals only
router.post('/:goalId/contributions', authenticateToken, validateGoalContribution, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const goal = await db.getGoalById(req.user.id, goalId);
        if (!goal) return notFound(req, res);

        // Accepting one here would record a number that never appears in the
        // total, since an account-tracked goal reads its balance instead.
        if (goal.tracking_mode !== 'manual') {
            return res.status(409).json({
                success: false,
                code: 'GOAL_IS_ACCOUNT_TRACKED',
                message: 'This goal follows a bank account, so contributions are counted automatically.',
                requestId: req.requestId,
            });
        }

        const { amount, note = null, occurredOn = null } = req.body;
        const contribution = await db.addGoalContribution(req.user.id, goalId, { amount, note, occurredOn });
        if (!contribution) return notFound(req, res);

        const updated = await db.getGoalById(req.user.id, goalId);

        logger.info('Goal contribution added', { ...ctx, goalId, amount });
        res.status(201).json({ success: true, data: contribution, goal: updated, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to add goal contribution', { ...ctx, error });
        next(error);
    }
});

// DELETE /goals/:goalId/contributions/:contributionId
router.delete('/:goalId/contributions/:contributionId', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const contributionId = Number.parseInt(req.params.contributionId, 10);
        if (Number.isNaN(contributionId) || contributionId < 1) {
            return res.status(400).json({
                success: false,
                code: 'VALIDATION_ERROR',
                message: 'Invalid contribution id',
                requestId: req.requestId,
            });
        }

        const deleted = await db.deleteGoalContribution(req.user.id, goalId, contributionId);
        if (!deleted) return notFound(req, res);

        const updated = await db.getGoalById(req.user.id, goalId);
        res.json({ success: true, goal: updated, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to delete goal contribution', { ...ctx, error });
        next(error);
    }
});

// POST /goals/:goalId/milestones — record specific milestones as announced
router.post('/:goalId/milestones', authenticateToken, validateGoalMilestones, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const goalId = parseGoalId(req, res);
        if (goalId === null) return;

        const milestones = req.body.milestones.map(Number);
        const goal = await db.markGoalMilestones(req.user.id, goalId, milestones);
        if (!goal) return notFound(req, res);

        res.json({ success: true, data: goal, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to record milestones', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
