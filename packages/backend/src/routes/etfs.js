/**
 * ETF API Routes
 * Endpoints for browsing and getting recommended Canadian ETFs
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../services/db');
const etfKnowledge = require('../services/etf_knowledge');

const ETF_DISCLAIMER = 'The ETF information is for educational purposes only. Data is approximate and updated quarterly. IndusWealth does not sell, recommend, or endorse any specific investment product. Past performance does not guarantee future results.';

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
 * GET /api/etfs/recommended
 * Get ETFs recommended for the user based on their risk profile
 */
router.get('/recommended', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user preferences
        const prefResult = await pool.query(
            `SELECT investment_risk_tolerance, interested_in_investing,
                    preferred_savings_account_type
             FROM user_preferences WHERE user_id = $1`,
            [userId]
        );

        const preferences = prefResult.rows[0] || {
            investment_risk_tolerance: 'moderate',
            interested_in_investing: true,
            preferred_savings_account_type: 'tfsa'
        };

        const recommended = etfKnowledge.getRecommendedETFs(preferences);

        res.json({
            success: true,
            data: {
                etfs: recommended,
                risk_profile: preferences.investment_risk_tolerance,
                last_updated: etfKnowledge.getLastUpdated(),
                disclaimer: ETF_DISCLAIMER
            }
        });
    } catch (error) {
        console.error('Error fetching recommended ETFs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recommended ETFs'
        });
    }
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
