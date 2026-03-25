const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { ValidationError } = require('../errors/AppError');
const { successResponse } = require('../utils/responseHelper');

const logger = createLogger('FEEDBACK');

const VALID_CATEGORIES = ['bug', 'feature', 'general', 'ui_ux', 'performance', 'other'];

// POST /feedback - Submit feedback
router.post('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Feedback submission', ctx);

    try {
        const { category, rating, message } = req.body;

        if (!category || !VALID_CATEGORIES.includes(category)) {
            throw new ValidationError('Invalid category', {
                fields: ['category'],
                validValues: VALID_CATEGORIES
            });
        }

        if (!message || message.trim().length < 10) {
            throw new ValidationError('Message must be at least 10 characters', {
                fields: ['message']
            });
        }

        if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
            throw new ValidationError('Rating must be between 1 and 5', {
                fields: ['rating']
            });
        }

        // Get user info for context
        const userResult = await db.query('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
        const user = userResult.rows[0];

        const result = await db.query(
            `INSERT INTO feedback (user_id, category, rating, message, user_email, user_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, category, rating, message, created_at`,
            [req.user.id, category, rating || null, message.trim(), user?.email, user?.name]
        );

        logger.info('Feedback submitted successfully', { ...ctx, feedbackId: result.rows[0].id });

        return successResponse(res, {
            feedback: result.rows[0]
        }, 'Thank you for your feedback!');
    } catch (error) {
        next(error);
    }
});

// GET /feedback - Get user's own feedback history
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    try {
        const result = await db.query(
            `SELECT id, category, rating, message, created_at
             FROM feedback
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.id]
        );

        return successResponse(res, {
            feedback: result.rows
        });
    } catch (error) {
        next(error);
    }
});

// GET /feedback/admin - Admin view of ALL feedback (protected by ADMIN_SECRET)
// Usage: GET /feedback/admin?secret=YOUR_ADMIN_SECRET&category=bug&page=1
router.get('/admin', async (req, res, next) => {
    try {
        const adminSecret = process.env.ADMIN_SECRET;
        if (!adminSecret || req.query.secret !== adminSecret) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { category, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClause = '';
        const params = [];

        if (category && VALID_CATEGORIES.includes(category)) {
            params.push(category);
            whereClause = `WHERE category = $${params.length}`;
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM feedback ${whereClause}`,
            params
        );

        // Get feedback with pagination
        const feedbackParams = [...params, parseInt(limit), offset];
        const result = await db.query(
            `SELECT id, user_id, user_email, user_name, category, rating, message, created_at
             FROM feedback
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${feedbackParams.length - 1} OFFSET $${feedbackParams.length}`,
            feedbackParams
        );

        // Get summary stats
        const statsResult = await db.query(
            `SELECT
                COUNT(*) as total,
                ROUND(AVG(rating), 1) as avg_rating,
                COUNT(CASE WHEN category = 'bug' THEN 1 END) as bugs,
                COUNT(CASE WHEN category = 'feature' THEN 1 END) as feature_requests,
                COUNT(CASE WHEN category = 'general' THEN 1 END) as general,
                COUNT(CASE WHEN category = 'ui_ux' THEN 1 END) as ui_ux,
                COUNT(CASE WHEN category = 'performance' THEN 1 END) as performance,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
             FROM feedback`
        );

        return successResponse(res, {
            stats: statsResult.rows[0],
            feedback: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit)),
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
