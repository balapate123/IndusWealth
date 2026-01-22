const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const debtCalculator = require('../services/debt_calculator');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

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
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Fetch Plaid Liabilities (gracefully handle errors)
        let plaidLiabilities = { credit: [], student: [], mortgage: [] };
        const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

        if (accessToken) {
            try {
                plaidLiabilities = await plaidService.getLiabilities(accessToken);
            } catch (plaidError) {
                console.warn('Could not fetch Plaid liabilities:', plaidError.message);
                // Continue with empty Plaid data
            }
        }

        // 2. Fetch APR overrides for Plaid accounts
        const overridesResult = await db.query(
            'SELECT plaid_account_id, apr FROM debt_apr_overrides WHERE user_id = $1',
            [userId]
        );
        const aprOverrides = {};
        overridesResult.rows.forEach(row => {
            aprOverrides[row.plaid_account_id] = parseFloat(row.apr);
        });

        // 3. Fetch custom debts from database
        const customDebtsResult = await db.query(
            'SELECT * FROM custom_debts WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        const customDebts = customDebtsResult.rows.map(d => ({
            id: `custom_${d.id}`,
            name: d.name,
            balance: parseFloat(d.balance),
            apr: parseFloat(d.apr),
            min_payment: parseFloat(d.min_payment) || 0,
            debt_type: d.debt_type,
            is_custom: true
        }));

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
        const analysis = debtCalculator.calculate(mergedLiabilities, 0, customDebts);

        res.json({
            success: true,
            analysis: analysis,
            raw_liabilities: mergedLiabilities,
            custom_debts: customDebts,
            default_aprs: DEFAULT_APRS
        });
    } catch (error) {
        console.error('Error fetching debt:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /debt/calculate
// Recalculates based on user input (Extra Payment)
router.post('/calculate', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { extra_payment, liabilities, custom_debts } = req.body;

        // Use provided liabilities or fetch fresh
        let debtsData = liabilities;
        if (!debtsData) {
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            if (accessToken) {
                try {
                    debtsData = await plaidService.getLiabilities(accessToken);
                } catch (err) {
                    debtsData = { credit: [], student: [], mortgage: [] };
                }
            } else {
                debtsData = { credit: [], student: [], mortgage: [] };
            }
        }

        // Fetch custom debts if not provided
        let customDebtsArray = custom_debts;
        if (!customDebtsArray) {
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
        }

        const analysis = debtCalculator.calculate(debtsData, extra_payment || 0, customDebtsArray);

        res.json({
            success: true,
            analysis: analysis
        });

    } catch (error) {
        console.error('Error calculating debt:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// ==================== CUSTOM DEBTS CRUD ====================

// POST /debt/custom - Create a new custom debt
router.post('/custom', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, balance, apr, min_payment, debt_type } = req.body;

        if (!name || balance === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Name and balance are required'
            });
        }

        // Use default APR if not provided
        const effectiveApr = apr ?? getDefaultApr(debt_type);

        const result = await db.query(
            `INSERT INTO custom_debts (user_id, name, balance, apr, min_payment, debt_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, name, balance, effectiveApr, min_payment || 0, debt_type || 'other']
        );

        res.json({
            success: true,
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        });
    } catch (error) {
        console.error('Error creating custom debt:', error);
        res.status(500).json({ success: false, message: 'Failed to create debt' });
    }
});

// PUT /debt/custom/:id - Update a custom debt
router.put('/custom/:id', authenticateToken, async (req, res) => {
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
            return res.status(404).json({ success: false, message: 'Debt not found' });
        }

        res.json({
            success: true,
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        });
    } catch (error) {
        console.error('Error updating custom debt:', error);
        res.status(500).json({ success: false, message: 'Failed to update debt' });
    }
});

// DELETE /debt/custom/:id - Delete a custom debt
router.delete('/custom/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const debtId = req.params.id;

        const result = await db.query(
            'DELETE FROM custom_debts WHERE id = $1 AND user_id = $2 RETURNING id',
            [debtId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Debt not found' });
        }

        res.json({ success: true, message: 'Debt deleted' });
    } catch (error) {
        console.error('Error deleting custom debt:', error);
        res.status(500).json({ success: false, message: 'Failed to delete debt' });
    }
});

// ==================== APR OVERRIDE ====================

// PUT /debt/apr-override - Save APR override for a Plaid account
router.put('/apr-override', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plaid_account_id, apr } = req.body;

        if (!plaid_account_id || apr === undefined) {
            return res.status(400).json({
                success: false,
                message: 'plaid_account_id and apr are required'
            });
        }

        await db.query(
            `INSERT INTO debt_apr_overrides (user_id, plaid_account_id, apr)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, plaid_account_id) 
             DO UPDATE SET apr = $3, updated_at = CURRENT_TIMESTAMP`,
            [userId, plaid_account_id, apr]
        );

        res.json({ success: true, message: 'APR override saved' });
    } catch (error) {
        console.error('Error saving APR override:', error);
        res.status(500).json({ success: false, message: 'Failed to save APR override' });
    }
});

module.exports = router;
