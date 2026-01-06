const express = require('express');
const router = express.Router();
const flinksService = require('../services/flinks');

// GET /transactions
// Fetches unified transaction history
router.get('/', async (req, res) => {
    try {
        const transactions = await flinksService.getTransactions();

        // Sort by date descending
        const sortedTransactions = transactions.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        res.json({
            success: true,
            count: sortedTransactions.length,
            data: sortedTransactions
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
