const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const debtCalculator = require('../services/debt_calculator');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const { createLogger } = require('../services/logger');
const { ValidationError, NotFoundError } = require('../errors/AppError');
const { DATA_SOURCES, PLAID_STATUS, createMeta, successResponse, getPlaidStatusFromError } = require('../utils/responseHelper');

const logger = createLogger('DEBT');

// Default APR by account/debt type
const DEFAULT_APRS = {
    'credit_card': 22.00,
    'line_of_credit': 11.00,
    'personal_loan': 10.00,
    'student_loan': 6.00,
    'other': 15.00
};

// Helper to get default APR based on type
const getDefaultApr = (type) => {
    const normalizedType = (type || 'other').toLowerCase().replace(/\s+/g, '_');
    return DEFAULT_APRS[normalizedType] || DEFAULT_APRS['other'];
};

// GET /debt
// Fetches liabilities from Plaid + custom debts, runs calculation
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching debt overview', ctx);

    try {
        const userId = req.user.id;

        // 1. Fetch Plaid Liabilities (gracefully handle errors)
        let plaidLiabilities = { credit: [], student: [], mortgage: [] };
        let plaidStatus = PLAID_STATUS.NO_TOKEN;
        let dataSource = DATA_SOURCES.DATABASE;
        const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

        if (accessToken) {
            logger.debug('Access token available, fetching Plaid liabilities', ctx);
            try {
                plaidLiabilities = await plaidService.getLiabilities(accessToken);
                plaidStatus = PLAID_STATUS.SUCCESS;
                dataSource = DATA_SOURCES.PLAID_API;
                logger.info('Plaid liabilities fetched', {
                    ...ctx,
                    creditCount: plaidLiabilities.credit?.length || 0,
                    studentCount: plaidLiabilities.student?.length || 0,
                    mortgageCount: plaidLiabilities.mortgage?.length || 0,
                    dataSource: DATA_SOURCES.PLAID_API
                });
            } catch (plaidError) {
                plaidStatus = getPlaidStatusFromError(plaidError);
                const errorCode = plaidError.response?.data?.error_code;

                if (errorCode === 'ITEM_LOGIN_REQUIRED') {
                    logger.warn('User needs to re-authenticate via Plaid Link update mode', { ...ctx, errorCode });
                } else if (errorCode === 'PRODUCTS_NOT_SUPPORTED') {
                    logger.info('Liabilities product not supported for this institution', { ...ctx, errorCode });
                } else {
                    logger.warn('Plaid liabilities error', { ...ctx, errorCode, error: plaidError });
                }
            }
        } else {
            logger.debug('No Plaid access token available', ctx);
        }

        // 2. Fetch APR overrides for Plaid accounts
        let aprOverrides = {};
        try {
            const overridesResult = await db.query(
                'SELECT plaid_account_id, apr FROM debt_apr_overrides WHERE user_id = $1',
                [userId]
            );
            overridesResult.rows.forEach(row => {
                aprOverrides[row.plaid_account_id] = parseFloat(row.apr);
            });
            logger.debug('Fetched APR overrides', { ...ctx, count: overridesResult.rows.length });
        } catch (err) {
            logger.debug('Could not fetch APR overrides (table might be missing)', { ...ctx, error: err.message });
        }

        // 3. Fetch custom debts from database
        let customDebts = [];
        try {
            const customDebtsResult = await db.query(
                'SELECT * FROM custom_debts WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );
            customDebts = customDebtsResult.rows.map(d => ({
                id: `custom_${d.id}`,
                name: d.name,
                balance: parseFloat(d.balance),
                apr: parseFloat(d.apr),
                min_payment: parseFloat(d.min_payment) || 0,
                debt_type: d.debt_type,
                is_custom: true
            }));
            logger.debug('Fetched custom debts', { ...ctx, count: customDebts.length });
        } catch (err) {
            logger.debug('Could not fetch custom debts (table might be missing)', { ...ctx, error: err.message });
        }

        // 4. Merge Plaid liabilities with APR overrides and defaults
        const mergedLiabilities = {
            ...plaidLiabilities,
            credit: (plaidLiabilities.credit || []).map(card => {
                const plaidApr = card.aprs?.find(a => a.apr_type === 'purchase_apr')?.apr_percentage;
                const overrideApr = aprOverrides[card.account_id];
                return {
                    ...card,
                    effective_apr: overrideApr ?? plaidApr ?? getDefaultApr('credit_card'),
                    apr_source: overrideApr ? 'user_override' : (plaidApr ? 'plaid' : 'default')
                };
            })
        };

        // 5. Run Calculator (Status Quo - zero extra payment)
        logger.debug('Running debt calculator', ctx);
        const analysis = debtCalculator.calculate(mergedLiabilities, 0, customDebts);

        const meta = await createMeta(userId, dataSource, {
            plaidStatus,
            count: analysis.debt_count
        });

        logger.info('Returning debt analysis', {
            ...ctx,
            totalDebt: analysis.total_debt,
            debtCount: analysis.debt_count,
            dataSource,
            plaidStatus
        });

        successResponse(res, {
            plaid_status: plaidStatus,
            analysis: analysis,
            raw_liabilities: mergedLiabilities,
            custom_debts: customDebts,
            default_aprs: DEFAULT_APRS
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch debt overview', { ...ctx, error });
        next(error);
    }
});

// POST /debt/calculate
// Recalculates based on user input (Extra Payment)
router.post('/calculate', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const extraPayment = req.body.extra_payment;
    logger.info('Calculating debt payoff', { ...ctx, extraPayment });

    try {
        const userId = req.user.id;
        const { extra_payment, liabilities, custom_debts } = req.body;

        // Use provided liabilities or fetch fresh
        let debtsData = liabilities;
        if (!debtsData) {
            logger.debug('No liabilities provided, fetching from Plaid', ctx);
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            if (accessToken) {
                try {
                    debtsData = await plaidService.getLiabilities(accessToken);
                    logger.debug('Fetched liabilities from Plaid', ctx);
                } catch (err) {
                    logger.warn('Plaid fetch failed, using empty liabilities', { ...ctx, error: err });
                    debtsData = { credit: [], student: [], mortgage: [] };
                }
            } else {
                logger.debug('No access token, using empty liabilities', ctx);
                debtsData = { credit: [], student: [], mortgage: [] };
            }
        }

        // Fetch custom debts if not provided
        let customDebtsArray = custom_debts;
        if (!customDebtsArray) {
            logger.debug('No custom debts provided, fetching from database', ctx);
            try {
                const result = await db.query(
                    'SELECT * FROM custom_debts WHERE user_id = $1',
                    [userId]
                );
                customDebtsArray = result.rows.map(d => ({
                    id: `custom_${d.id}`,
                    name: d.name,
                    balance: parseFloat(d.balance),
                    apr: parseFloat(d.apr),
                    min_payment: parseFloat(d.min_payment) || 0,
                    debt_type: d.debt_type,
                    is_custom: true
                }));
                logger.debug('Fetched custom debts', { ...ctx, count: customDebtsArray.length });
            } catch (err) {
                logger.warn('Could not fetch custom debts', { ...ctx, error: err });
                customDebtsArray = [];
            }
        }

        const analysis = debtCalculator.calculate(debtsData, extra_payment || 0, customDebtsArray);

        logger.info('Debt calculation complete', {
            ...ctx,
            extraPayment: extra_payment,
            totalDebt: analysis.total_debt
        });

        successResponse(res, { analysis }, {
            source: DATA_SOURCES.COMPUTED,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to calculate debt payoff', { ...ctx, error });
        next(error);
    }
});

// ==================== CUSTOM DEBTS CRUD ====================

// POST /debt/custom - Create a new custom debt
router.post('/custom', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Creating custom debt', { ...ctx, debtName: req.body.name });

    try {
        const userId = req.user.id;
        const { name, balance, apr, min_payment, debt_type } = req.body;

        if (!name || balance === undefined) {
            throw new ValidationError('Name and balance are required', { fields: ['name', 'balance'] });
        }

        // Use default APR if not provided
        const effectiveApr = apr ?? getDefaultApr(debt_type);

        const result = await db.query(
            `INSERT INTO custom_debts (user_id, name, balance, apr, min_payment, debt_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, name, balance, effectiveApr, min_payment || 0, debt_type || 'other']
        );

        logger.info('Custom debt created', { ...ctx, debtId: result.rows[0].id });

        successResponse(res, {
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        }, { source: DATA_SOURCES.DATABASE, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Failed to create custom debt', { ...ctx, error });
        next(error);
    }
});

// PUT /debt/custom/:id - Update a custom debt
router.put('/custom/:id', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id, debtId: req.params.id };
    logger.info('Updating custom debt', ctx);

    try {
        const userId = req.user.id;
        const debtId = req.params.id;
        const { name, balance, apr, min_payment, debt_type } = req.body;

        const result = await db.query(
            `UPDATE custom_debts
             SET name = COALESCE($1, name),
                 balance = COALESCE($2, balance),
                 apr = COALESCE($3, apr),
                 min_payment = COALESCE($4, min_payment),
                 debt_type = COALESCE($5, debt_type),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 AND user_id = $7
             RETURNING *`,
            [name, balance, apr, min_payment, debt_type, debtId, userId]
        );

        if (result.rows.length === 0) {
            throw new NotFoundError('Debt');
        }

        logger.info('Custom debt updated', ctx);

        successResponse(res, {
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        }, { source: DATA_SOURCES.DATABASE, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Failed to update custom debt', { ...ctx, error });
        next(error);
    }
});

// DELETE /debt/custom/:id - Delete a custom debt
router.delete('/custom/:id', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id, debtId: req.params.id };
    logger.info('Deleting custom debt', ctx);

    try {
        const userId = req.user.id;
        const debtId = req.params.id;

        const result = await db.query(
            'DELETE FROM custom_debts WHERE id = $1 AND user_id = $2 RETURNING id',
            [debtId, userId]
        );

        if (result.rows.length === 0) {
            throw new NotFoundError('Debt');
        }

        logger.info('Custom debt deleted', ctx);

        res.json({ success: true, message: 'Debt deleted', requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to delete custom debt', { ...ctx, error });
        next(error);
    }
});

// ==================== APR OVERRIDE ====================

// PUT /debt/apr-override - Save APR override for a Plaid account
router.put('/apr-override', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Saving APR override', { ...ctx, accountId: req.body.plaid_account_id, apr: req.body.apr });

    try {
        const userId = req.user.id;
        const { plaid_account_id, apr } = req.body;

        if (!plaid_account_id || apr === undefined) {
            throw new ValidationError('plaid_account_id and apr are required', {
                fields: ['plaid_account_id', 'apr']
            });
        }

        await db.query(
            `INSERT INTO debt_apr_overrides (user_id, plaid_account_id, apr)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, plaid_account_id)
             DO UPDATE SET apr = $3, updated_at = CURRENT_TIMESTAMP`,
            [userId, plaid_account_id, apr]
        );

        logger.info('APR override saved', ctx);

        res.json({ success: true, message: 'APR override saved', requestId: req.requestId });
    } catch (error) {
        logger.error('Failed to save APR override', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
