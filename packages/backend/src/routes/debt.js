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
    console.log('📥 [GET /debt] Request received');
    console.log('   👤 User ID:', req.user.id);

    try {
        const userId = req.user.id;

        // 1. Fetch Plaid Liabilities (gracefully handle errors)
        let plaidLiabilities = { credit: [], student: [], mortgage: [] };
        let plaidStatus = 'no_token';
        const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

        if (accessToken) {
            console.log('   🔑 Access token available, fetching Plaid liabilities...');
            try {
                plaidLiabilities = await plaidService.getLiabilities(accessToken);
                plaidStatus = 'success';
                console.log('   ✅ Plaid liabilities fetched:', {
                    credit_count: plaidLiabilities.credit?.length || 0,
                    student_count: plaidLiabilities.student?.length || 0,
                    mortgage_count: plaidLiabilities.mortgage?.length || 0
                });
            } catch (plaidError) {
                const errorDetails = plaidError.response?.data || plaidError.message;
                console.warn('   ⚠️ Plaid liabilities error:', errorDetails);

                // Check for specific Plaid error codes
                if (errorDetails?.error_code === 'ITEM_LOGIN_REQUIRED') {
                    plaidStatus = 'login_required';
                    console.warn('   🔒 User needs to re-authenticate via Plaid Link update mode');
                } else if (errorDetails?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
                    plaidStatus = 'not_supported';
                    console.warn('   ℹ️ Liabilities product not supported for this institution');
                } else {
                    plaidStatus = 'error';
                }
            }
        } else {
            console.log('   🔒 No Plaid access token available');
        }

        // 2. Fetch APR overrides for Plaid accounts
        let aprOverrides = {};
        try {
            console.log('   📊 Fetching APR overrides...');
            const overridesResult = await db.query(
                'SELECT plaid_account_id, apr FROM debt_apr_overrides WHERE user_id = $1',
                [userId]
            );
            overridesResult.rows.forEach(row => {
                aprOverrides[row.plaid_account_id] = parseFloat(row.apr);
            });
            console.log('   ✅ Found', overridesResult.rows.length, 'APR overrides');
        } catch (err) {
            console.warn('   ⚠️ Could not fetch APR overrides (table might be missing):', err.message);
        }

        // 3. Fetch custom debts from database
        let customDebts = [];
        try {
            console.log('   📋 Fetching custom debts...');
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
            console.log('   ✅ Found', customDebts.length, 'custom debts');
        } catch (err) {
            console.warn('   ⚠️ Could not fetch custom debts (table might be missing):', err.message);
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
        console.log('   🧮 Running debt calculator...');
        const analysis = debtCalculator.calculate(mergedLiabilities, 0, customDebts);
        console.log('   ✅ Calculation complete:', {
            total_debt: analysis.total_debt,
            debt_count: analysis.debt_count
        });

        console.log('   📤 [GET /debt] Response sent successfully');
        res.json({
            success: true,
            plaid_status: plaidStatus,
            analysis: analysis,
            raw_liabilities: mergedLiabilities,
            custom_debts: customDebts,
            default_aprs: DEFAULT_APRS
        });
    } catch (error) {
        console.error('❌ [GET /debt] Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /debt/calculate
// Recalculates based on user input (Extra Payment)
router.post('/calculate', authenticateToken, async (req, res) => {
    console.log('📥 [POST /debt/calculate] Request received');
    console.log('   👤 User ID:', req.user.id);
    console.log('   💰 Extra payment:', req.body.extra_payment);

    try {
        const userId = req.user.id;
        const { extra_payment, liabilities, custom_debts } = req.body;

        // Use provided liabilities or fetch fresh
        let debtsData = liabilities;
        if (!debtsData) {
            console.log('   🔄 No liabilities provided, fetching from Plaid...');
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            if (accessToken) {
                try {
                    debtsData = await plaidService.getLiabilities(accessToken);
                    console.log('   ✅ Fetched liabilities from Plaid');
                } catch (err) {
                    console.warn('   ⚠️ Plaid fetch failed:', err.message);
                    debtsData = { credit: [], student: [], mortgage: [] };
                }
            } else {
                console.log('   🔒 No access token, using empty liabilities');
                debtsData = { credit: [], student: [], mortgage: [] };
            }
        } else {
            console.log('   📦 Using provided liabilities');
        }

        // Fetch custom debts if not provided
        let customDebtsArray = custom_debts;
        if (!customDebtsArray) {
            console.log('   📋 No custom debts provided, fetching from database...');
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
                console.log('   ✅ Found', customDebtsArray.length, 'custom debts');
            } catch (err) {
                console.warn('   ⚠️ Could not fetch custom debts:', err.message);
                customDebtsArray = [];
            }
        } else {
            console.log('   📦 Using provided custom debts:', customDebtsArray.length);
        }

        console.log('   🧮 Running debt calculator with extra payment:', extra_payment);
        const analysis = debtCalculator.calculate(debtsData, extra_payment || 0, customDebtsArray);

        console.log('   📤 [POST /debt/calculate] Response sent');
        res.json({
            success: true,
            analysis: analysis
        });

    } catch (error) {
        console.error('❌ [POST /debt/calculate] Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// ==================== CUSTOM DEBTS CRUD ====================

// POST /debt/custom - Create a new custom debt
router.post('/custom', authenticateToken, async (req, res) => {
    console.log('📥 [POST /debt/custom] Request received');
    console.log('   👤 User ID:', req.user.id);
    console.log('   📝 Debt data:', req.body);

    try {
        const userId = req.user.id;
        const { name, balance, apr, min_payment, debt_type } = req.body;

        if (!name || balance === undefined) {
            console.warn('   ⚠️ Validation failed: name and balance required');
            return res.status(400).json({
                success: false,
                message: 'Name and balance are required'
            });
        }

        // Use default APR if not provided
        const effectiveApr = apr ?? getDefaultApr(debt_type);
        console.log('   💹 Using APR:', effectiveApr, '(type:', debt_type || 'other', ')');

        const result = await db.query(
            `INSERT INTO custom_debts (user_id, name, balance, apr, min_payment, debt_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, name, balance, effectiveApr, min_payment || 0, debt_type || 'other']
        );

        console.log('   ✅ Custom debt created with ID:', result.rows[0].id);
        res.json({
            success: true,
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        });
    } catch (error) {
        console.error('❌ [POST /debt/custom] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create debt' });
    }
});

// PUT /debt/custom/:id - Update a custom debt
router.put('/custom/:id', authenticateToken, async (req, res) => {
    console.log('📥 [PUT /debt/custom/:id] Request received');
    console.log('   👤 User ID:', req.user.id);
    console.log('   🔢 Debt ID:', req.params.id);
    console.log('   📝 Update data:', req.body);

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
            console.warn('   ⚠️ Debt not found or unauthorized');
            return res.status(404).json({ success: false, message: 'Debt not found' });
        }

        console.log('   ✅ Custom debt updated');
        res.json({
            success: true,
            debt: {
                id: `custom_${result.rows[0].id}`,
                ...result.rows[0],
                is_custom: true
            }
        });
    } catch (error) {
        console.error('❌ [PUT /debt/custom/:id] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update debt' });
    }
});

// DELETE /debt/custom/:id - Delete a custom debt
router.delete('/custom/:id', authenticateToken, async (req, res) => {
    console.log('📥 [DELETE /debt/custom/:id] Request received');
    console.log('   👤 User ID:', req.user.id);
    console.log('   🔢 Debt ID:', req.params.id);

    try {
        const userId = req.user.id;
        const debtId = req.params.id;

        const result = await db.query(
            'DELETE FROM custom_debts WHERE id = $1 AND user_id = $2 RETURNING id',
            [debtId, userId]
        );

        if (result.rows.length === 0) {
            console.warn('   ⚠️ Debt not found or unauthorized');
            return res.status(404).json({ success: false, message: 'Debt not found' });
        }

        console.log('   ✅ Custom debt deleted');
        res.json({ success: true, message: 'Debt deleted' });
    } catch (error) {
        console.error('❌ [DELETE /debt/custom/:id] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete debt' });
    }
});

// ==================== APR OVERRIDE ====================

// PUT /debt/apr-override - Save APR override for a Plaid account
router.put('/apr-override', authenticateToken, async (req, res) => {
    console.log('📥 [PUT /debt/apr-override] Request received');
    console.log('   👤 User ID:', req.user.id);
    console.log('   📝 Override data:', req.body);

    try {
        const userId = req.user.id;
        const { plaid_account_id, apr } = req.body;

        if (!plaid_account_id || apr === undefined) {
            console.warn('   ⚠️ Validation failed: plaid_account_id and apr required');
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

        console.log('   ✅ APR override saved');
        res.json({ success: true, message: 'APR override saved' });
    } catch (error) {
        console.error('❌ [PUT /debt/apr-override] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save APR override' });
    }
});

module.exports = router;
