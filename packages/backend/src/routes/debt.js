const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');
const debtCalculator = require('../services/debt_calculator');

// GET /debt
// Fetches liabilities and runs default calculation (Zero Extra Payment)
router.get('/', async (req, res) => {
    try {
        const accessToken = req.headers['plaid-access-token'] || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

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
router.post('/calculate', async (req, res) => {
    try {
        const { extra_payment, liabilities } = req.body;

        // If frontend passes cached liabilities, use them. Otherwise fetch fresh? 
        // For efficiency, frontend should pass the liabilities it already has.
        // Or if we stick to state-less, we fetch again (slower). 
        // Let's assume frontend passes 'raw_liabilities' back to us.

        let debtsData = liabilities;

        // Fallback: fetch if not provided
        if (!debtsData) {
            const accessToken = req.headers['plaid-access-token'] || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
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
