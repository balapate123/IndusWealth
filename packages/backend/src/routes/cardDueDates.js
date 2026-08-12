const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { validateCardDueDate } = require('../middleware/validators');
const {
    TARGET_TYPES,
    MAX_DUE_DAY,
    MAX_LEAD_DAYS,
    DEFAULT_LEAD_DAYS,
    MAX_CARDS,
    DUE_DATE_ACCOUNT_TYPES,
} = require('../services/cardDueDates');

const logger = createLogger('CARD_DUE_DATES');

/**
 * Credit card payment due dates.
 *
 * User-entered, because there is nowhere to read them from: Plaid's
 * `liabilities` product carries next_payment_due_date and is not enabled on our
 * account (services/plaid.js requests `transactions` only). See the header of
 * db/add_card_due_dates.sql for the full reasoning and the upgrade path.
 *
 * The reminders themselves are scheduled on the device — this endpoint only
 * stores the schedule. Nothing here sends a notification.
 */

const parseId = (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
        res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Invalid reminder id',
            requestId: req.requestId,
        });
        return null;
    }
    return id;
};

/**
 * What the mobile editor builds itself from, so its picker cannot offer a value
 * the API will reject.
 */
const options = {
    targetTypes: TARGET_TYPES,
    maxDueDay: MAX_DUE_DAY,
    maxLeadDays: MAX_LEAD_DAYS,
    defaultLeadDays: DEFAULT_LEAD_DAYS,
    maxCards: MAX_CARDS,
    accountTypes: DUE_DATE_ACCOUNT_TYPES,
};

// GET /card-due-dates
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const dueDates = await db.getCardDueDates(req.user.id);

        res.json({
            success: true,
            count: dueDates.length,
            data: dueDates,
            options,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to fetch card due dates', { ...ctx, error });
        next(error);
    }
});

// PUT /card-due-dates — create or update the reminder for one card
router.put('/', authenticateToken, validateCardDueDate, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const {
            targetType, accountId, customDebtId,
            dueDay, leadDays, reminderHour, enabled,
        } = req.body;

        // Ownership. Resolving against user_id is the authorisation: an id
        // belonging to someone else simply does not resolve.
        if (targetType === 'plaid_account') {
            const account = await db._resolveOwnedAccount(req.user.id, accountId);
            if (!account) {
                return res.status(404).json({
                    success: false,
                    code: 'ACCOUNT_NOT_FOUND',
                    message: 'That account is not connected to your profile.',
                    requestId: req.requestId,
                });
            }
        } else {
            const debt = await db._resolveOwnedCustomDebt(req.user.id, customDebtId);
            if (!debt) {
                return res.status(404).json({
                    success: false,
                    code: 'DEBT_NOT_FOUND',
                    message: 'That debt is not on your profile.',
                    requestId: req.requestId,
                });
            }
        }

        // Checked only when this would be a new row — the cap must never block
        // editing a card the user is already tracking.
        const existing = await db.getCardDueDates(req.user.id);
        const isNew = !existing.some((row) => (
            targetType === 'plaid_account'
                ? row.plaid_account_id === String(accountId)
                : row.custom_debt_id === customDebtId
        ));

        if (isNew && existing.length >= MAX_CARDS) {
            return res.status(409).json({
                success: false,
                code: 'CARD_LIMIT_REACHED',
                message: `You can track due dates for up to ${MAX_CARDS} cards.`,
                requestId: req.requestId,
            });
        }

        const saved = await db.upsertCardDueDate(req.user.id, {
            targetType,
            plaidAccountId: accountId,
            customDebtId,
            dueDay,
            leadDays: leadDays ?? DEFAULT_LEAD_DAYS,
            reminderHour: reminderHour ?? 9,
            enabled: enabled ?? true,
        });

        logger.info('Card due date saved', { ...ctx, targetType, dueDay });
        res.json({ success: true, data: saved, options, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to save card due date', { ...ctx, error });
        next(error);
    }
});

// DELETE /card-due-dates/:id
router.delete('/:id', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const id = parseId(req, res);
    if (id === null) return;

    try {
        const removed = await db.deleteCardDueDate(req.user.id, id);
        if (!removed) {
            return res.status(404).json({
                success: false,
                code: 'NOT_FOUND',
                message: 'Reminder not found',
                requestId: req.requestId,
            });
        }

        logger.info('Card due date removed', { ...ctx, id });
        res.json({ success: true, requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to delete card due date', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
