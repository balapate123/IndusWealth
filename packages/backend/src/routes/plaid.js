const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaid');

// POST /plaid/create_link_token
router.post('/create_link_token', async (req, res) => {
    try {
        const data = await plaidService.createLinkToken();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /plaid/exchange_public_token
router.post('/exchange_public_token', async (req, res) => {
    try {
        const { public_token } = req.body;
        const accessToken = await plaidService.exchangePublicToken(public_token);
        res.json({ access_token: accessToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
