/**
 * ETF API Routes
 *
 * A reference library, not a recommendation engine. The user browses and
 * searches; nothing here reads their finances or their risk tolerance to decide
 * what to show them.
 *
 * `GET /recommended` used to filter this list by the user's stored risk profile
 * and surface the result as "Investment Corner" — a personalized securities
 * recommendation from a developer who is not a registered adviser, sitting
 * directly beneath a disclaimer saying the app does not recommend products.
 * It is gone.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const etfKnowledge = require('../services/etf_knowledge');

const ETF_DISCLAIMER = 'This is a reference list of widely held Canadian ETFs, provided for education only. Data is approximate and updated quarterly. IndusWealth does not sell, recommend, or endorse any investment product, and nothing here is investment advice. Past performance does not guarantee future results. Speak to a registered advisor before investing.';

/**
 * GET /api/etfs
 * Get all ETFs with optional filtering
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { risk_level, category, search } = req.query;

        let etfs;
        if (search) {
            etfs = etfKnowledge.searchETFs(search);
        } else if (risk_level) {
            etfs = etfKnowledge.getETFsByRiskProfile(risk_level);
        } else if (category) {
            etfs = etfKnowledge.getETFsByCategory(category);
        } else {
            etfs = etfKnowledge.getAllETFs();
        }

        res.json({
            success: true,
            data: {
                etfs,
                last_updated: etfKnowledge.getLastUpdated(),
                disclaimer: ETF_DISCLAIMER,
                count: etfs.length
            }
        });
    } catch (error) {
        console.error('Error fetching ETFs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ETF data'
        });
    }
});

/**
 * GET /api/etfs/recommended  (REMOVED)
 *
 * Kept as an explicit 410 rather than a 404 so an older installed build gets a
 * clear answer instead of looking like a broken endpoint. There is no OTA, so
 * old builds will keep calling this for a while.
 */
router.get('/recommended', authenticateToken, (req, res) => {
    res.status(410).json({
        success: false,
        code: 'ENDPOINT_REMOVED',
        message: 'IndusWealth no longer recommends investments. Browse the ETF reference list instead.',
    });
});

/**
 * GET /api/etfs/:ticker
 * Get a single ETF by ticker symbol
 */
router.get('/:ticker', authenticateToken, async (req, res) => {
    try {
        const { ticker } = req.params;
        const etf = etfKnowledge.getETFByTicker(ticker);

        if (!etf) {
            return res.status(404).json({
                success: false,
                error: `ETF with ticker "${ticker}" not found`
            });
        }

        res.json({
            success: true,
            data: {
                etf,
                disclaimer: ETF_DISCLAIMER
            }
        });
    } catch (error) {
        console.error('Error fetching ETF:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ETF data'
        });
    }
});

/**
 * POST /api/etfs/interaction
 * Track user interaction with ETF content (for analytics)
 */
router.post('/interaction', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { etf_ticker, interaction_type, source } = req.body;

        if (!etf_ticker || !interaction_type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: etf_ticker, interaction_type'
            });
        }

        const validTypes = ['viewed', 'clicked_buy_link', 'bookmarked'];
        if (!validTypes.includes(interaction_type)) {
            return res.status(400).json({
                success: false,
                error: `interaction_type must be one of: ${validTypes.join(', ')}`
            });
        }

        await pool.query(
            `INSERT INTO etf_interactions (user_id, etf_ticker, interaction_type, source)
             VALUES ($1, $2, $3, $4)`,
            [userId, etf_ticker.toUpperCase(), interaction_type, source || 'unknown']
        );

        res.json({ success: true, message: 'Interaction tracked' });
    } catch (error) {
        console.error('Error tracking ETF interaction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track interaction'
        });
    }
});

module.exports = router;
