const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const debtCalculator = require('../services/debt_calculator');
const { authenticateToken } = require('../middleware/auth');

// GET /debt
// Fetches liabilities and runs default calculation (Zero Extra Payment)
// Requires authentication
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Use user's Plaid access token or fallback to override
        const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

        // 1. Fetch Liabilities
        const liabilities = await plaidService.getLiabilities(accessToken);

        // 2. Run Calculator (Status Quo)
        const analysis = debtCalculator.calculate(liabilities, 0);

        res.json({
            success: true,
            analysis: analysis,
            raw_liabilities: liabilities
        });
    } catch (error) {
        console.error('Error fetching debt:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /debt/calculate
// Recalculates based on user slide input (Extra Payment)
// Requires authentication
router.post('/calculate', authenticateToken, async (req, res) => {
    try {
        const { extra_payment, liabilities } = req.body;

        // If frontend passes cached liabilities, use them. Otherwise fetch fresh
        let debtsData = liabilities;

        // Fallback: fetch if not provided
        if (!debtsData) {
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            debtsData = await plaidService.getLiabilities(accessToken);
        }

        const analysis = debtCalculator.calculate(debtsData, extra_payment || 0);

        res.json({
            success: true,
            analysis: analysis
        });

    } catch (error) {
        console.error('Error calculating debt:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
