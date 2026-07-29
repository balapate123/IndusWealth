/**
 * AI Insights API Routes
 * Endpoints for generating and managing personalized financial insights
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../services/db');
const { getUserFinancialSummary } = require('../services/insight_data');
const { generateInsights } = require('../services/ai_insights');
const {
    getArticleCatalog,
    formatCatalogForPrompt,
    getArticlesByIds,
    linkArticlesToInsightTypes,
} = require('../services/educational_content');
const { authenticateToken } = require('../middleware/auth');
const { calculateHealthScore, saveHealthScore } = require('../services/health_score');

/**
 * GET /api/insights
 * Get personalized financial insights (with caching)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const forceRefresh = req.query.force_refresh === 'true';
        const cacheHours = parseInt(process.env.INSIGHTS_CACHE_HOURS) || 6;

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cacheResult = await pool.query(
                `SELECT insights, summary, generated_at, cache_expires_at, ai_model_used,
                        health_score, health_score_breakdown, health_score_trend
                 FROM user_insights
                 WHERE user_id = $1 AND cache_expires_at > NOW()
                 ORDER BY generated_at DESC
                 LIMIT 1`,
                [userId]
            );

            if (cacheResult.rows.length > 0) {
                const cached = cacheResult.rows[0];
                // Reconstruct health score from cached columns
                let healthScore = null;
                if (cached.health_score !== null) {
                    const score = cached.health_score;
                    let grade, color;
                    if (score >= 90) { grade = 'A'; color = '#4CAF50'; }
                    else if (score >= 75) { grade = 'B'; color = '#8BC34A'; }
                    else if (score >= 60) { grade = 'C'; color = '#FFC107'; }
                    else if (score >= 40) { grade = 'D'; color = '#FF9800'; }
                    else { grade = 'F'; color = '#F44336'; }
                    healthScore = {
                        score,
                        grade,
                        color,
                        breakdown: cached.health_score_breakdown,
                        trend: cached.health_score_trend,
                        previous_score: null
                    };
                }
                return res.json({
                    success: true,
                    data: {
                        insights: cached.insights,
                        health_score: healthScore,
                        summary: cached.summary,
                        generated_at: cached.generated_at,
                        cache_expires_at: cached.cache_expires_at,
                        is_cached: true,
                        ai_model_used: cached.ai_model_used
                    }
                });
            }
        }

        // Cache miss or force refresh - generate new insights
        console.log(`Generating insights for user ${userId}...`);

        // Step 1: Aggregate user financial data
        const userData = await getUserFinancialSummary(userId, 90);

        // Step 2: Generate AI insights.
        // The catalog goes in so the model can only pick articles that exist —
        // it used to be asked for URLs, which it invented, which is why so many
        // insight links 404'd.
        let articleCatalog = [];
        try {
            articleCatalog = await getArticleCatalog();
        } catch (catalogError) {
            console.error('Error loading article catalog (continuing without it):', catalogError);
        }

        const result = await generateInsights(userData, {
            articleCatalogText: formatCatalogForPrompt(articleCatalog),
        });

        // Step 3: Resolve the ids the model chose back to real articles.
        // Nothing is written to educational_articles here: every article it can
        // name is already in the table.
        let savedArticles = [];
        if (result.recommendedArticleIds && result.recommendedArticleIds.length > 0) {
            try {
                savedArticles = await getArticlesByIds(result.recommendedArticleIds);
                const dropped = result.recommendedArticleIds.length - savedArticles.length;
                if (dropped > 0) {
                    console.warn(`Dropped ${dropped} AI-recommended article id(s) not in the catalog`);
                }
                await linkArticlesToInsightTypes(
                    savedArticles.map((a) => a.id),
                    [...new Set(result.insights.map((i) => i.type).filter(Boolean))]
                );
            } catch (articleError) {
                console.error('Error resolving AI-recommended articles:', articleError);
                // Don't fail the whole request if article resolution fails
            }
        }

        // Step 4: Calculate health score
        let healthScore = null;
        try {
            healthScore = await calculateHealthScore(userData, userId);
            await saveHealthScore(userId, healthScore);
        } catch (hsError) {
            console.error('Error calculating health score:', hsError);
        }

        // Step 5: Save insights to cache (with health score)
        const cacheExpiresAt = new Date();
        cacheExpiresAt.setHours(cacheExpiresAt.getHours() + cacheHours);

        await pool.query(
            `INSERT INTO user_insights
             (user_id, insights, summary, generated_at, cache_expires_at, generation_trigger,
              token_count_input, token_count_output, ai_model_used, generation_time_ms,
              health_score, health_score_breakdown, health_score_trend)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                userId,
                JSON.stringify(result.insights),
                result.summary,
                cacheExpiresAt,
                forceRefresh ? 'manual_refresh' : 'cache_miss',
                result.metadata.token_count_input,
                result.metadata.token_count_output,
                result.metadata.ai_model_used,
                result.metadata.generation_time_ms,
                healthScore?.score || null,
                healthScore ? JSON.stringify(healthScore.breakdown) : null,
                healthScore?.trend || null
            ]
        );

        res.json({
            success: true,
            data: {
                insights: result.insights,
                health_score: healthScore,
                summary: result.summary,
                generated_at: new Date().toISOString(),
                cache_expires_at: cacheExpiresAt.toISOString(),
                is_cached: false,
                ai_model_used: result.metadata.ai_model_used,
                generation_time_ms: result.metadata.generation_time_ms,
                recommended_articles_count: savedArticles.length
            }
        });
    } catch (error) {
        console.error('Error fetching insights:', error);

        // Try to return cached insights even if expired in case of AI service failure
        try {
            const fallbackResult = await pool.query(
                `SELECT insights, summary, generated_at
                 FROM user_insights
                 WHERE user_id = $1
                 ORDER BY generated_at DESC
                 LIMIT 1`,
                [req.user.id]
            );

            if (fallbackResult.rows.length > 0) {
                const cached = fallbackResult.rows[0];
                return res.status(200).json({
                    success: true,
                    data: {
                        insights: cached.insights,
                        summary: cached.summary,
                        generated_at: cached.generated_at,
                        is_cached: true,
                        is_stale: true,
                        message: 'Showing cached insights due to temporary service issue'
                    }
                });
            }
        } catch (fallbackError) {
            console.error('Fallback cache fetch failed:', fallbackError);
        }

        res.status(500).json({
            success: false,
            error: 'Unable to generate insights. Please try again later.',
            details: error.message
        });
    }
});

/**
 * POST /api/insights/dismiss
 * Dismiss a specific insight
 */
router.post('/dismiss', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { insight_id, insight_type, reason, remind_after_days } = req.body;

        if (!insight_id || !insight_type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: insight_id, insight_type'
            });
        }

        // Calculate remind_after timestamp if provided
        let remindAfter = null;
        if (remind_after_days) {
            remindAfter = new Date();
            remindAfter.setDate(remindAfter.getDate() + parseInt(remind_after_days));
        }

        // Create a fingerprint for this insight (simplified - could be more sophisticated)
        const fingerprint = insight_id;

        await pool.query(
            `INSERT INTO user_insight_dismissals
             (user_id, insight_type, insight_fingerprint, dismiss_reason, remind_after)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, insight_type, insight_fingerprint)
             DO UPDATE SET dismissed_at = NOW(), dismiss_reason = $4, remind_after = $5`,
            [userId, insight_type, fingerprint, reason || 'not_specified', remindAfter]
        );

        res.json({
            success: true,
            message: 'Insight dismissed successfully'
        });
    } catch (error) {
        console.error('Error dismissing insight:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to dismiss insight'
        });
    }
});

/**
 * POST /api/insights/action
 * Track when user takes action on an insight (analytics)
 */
router.post('/action', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { insight_id, insight_type, action_type } = req.body;

        if (!insight_id || !insight_type || !action_type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: insight_id, insight_type, action_type'
            });
        }

        await pool.query(
            `INSERT INTO insight_actions
             (user_id, insight_id, insight_type, action_type)
             VALUES ($1, $2, $3, $4)`,
            [userId, insight_id, insight_type, action_type]
        );

        res.json({
            success: true,
            message: 'Action tracked successfully'
        });
    } catch (error) {
        console.error('Error tracking insight action:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track action'
        });
    }
});

/**
 * GET /api/insights/preferences
 * Get user preferences for insight personalization
 */
router.get('/preferences', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT first_time_homebuyer, investment_risk_tolerance, interested_in_investing,
                    interested_in_crypto, preferred_savings_account_type,
                    email_insights_enabled, push_insights_enabled
             FROM user_preferences
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            // Return defaults if no preferences set
            return res.json({
                success: true,
                data: {
                    first_time_homebuyer: null,
                    investment_risk_tolerance: 'moderate',
                    interested_in_investing: true,
                    interested_in_crypto: false,
                    preferred_savings_account_type: 'tfsa',
                    email_insights_enabled: false,
                    push_insights_enabled: true
                }
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch preferences'
        });
    }
});

/**
 * PUT /api/insights/preferences
 * Update user preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            first_time_homebuyer,
            investment_risk_tolerance,
            interested_in_investing,
            interested_in_crypto,
            preferred_savings_account_type,
            email_insights_enabled,
            push_insights_enabled
        } = req.body;

        // Build dynamic update query
        const updates = [];
        const values = [userId];
        let valueIndex = 2;

        if (first_time_homebuyer !== undefined) {
            updates.push(`first_time_homebuyer = $${valueIndex++}`);
            values.push(first_time_homebuyer);
        }
        if (investment_risk_tolerance !== undefined) {
            updates.push(`investment_risk_tolerance = $${valueIndex++}`);
            values.push(investment_risk_tolerance);
        }
        if (interested_in_investing !== undefined) {
            updates.push(`interested_in_investing = $${valueIndex++}`);
            values.push(interested_in_investing);
        }
        if (interested_in_crypto !== undefined) {
            updates.push(`interested_in_crypto = $${valueIndex++}`);
            values.push(interested_in_crypto);
        }
        if (preferred_savings_account_type !== undefined) {
            updates.push(`preferred_savings_account_type = $${valueIndex++}`);
            values.push(preferred_savings_account_type);
        }
        if (email_insights_enabled !== undefined) {
            updates.push(`email_insights_enabled = $${valueIndex++}`);
            values.push(email_insights_enabled);
        }
        if (push_insights_enabled !== undefined) {
            updates.push(`push_insights_enabled = $${valueIndex++}`);
            values.push(push_insights_enabled);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No preferences provided to update'
            });
        }

        updates.push('updated_at = NOW()');

        await pool.query(
            `INSERT INTO user_preferences (user_id, ${updates.map((_, i) => updates[i].split(' = ')[0]).join(', ')})
             VALUES ($1, ${values.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
             ON CONFLICT (user_id)
             DO UPDATE SET ${updates.join(', ')}`,
            values
        );

        res.json({
            success: true,
            message: 'Preferences updated successfully'
        });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update preferences'
        });
    }
});

/**
 * GET /api/insights/health-score
 * Get just the financial health score (faster than full insights)
 */
router.get('/health-score', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Try to get cached score first
        const cacheResult = await pool.query(
            `SELECT health_score, health_score_breakdown, health_score_trend, generated_at
             FROM user_insights
             WHERE user_id = $1 AND health_score IS NOT NULL
             ORDER BY generated_at DESC
             LIMIT 1`,
            [userId]
        );

        if (cacheResult.rows.length > 0) {
            const cached = cacheResult.rows[0];
            const score = cached.health_score;
            let grade, color;
            if (score >= 90) { grade = 'A'; color = '#4CAF50'; }
            else if (score >= 75) { grade = 'B'; color = '#8BC34A'; }
            else if (score >= 60) { grade = 'C'; color = '#FFC107'; }
            else if (score >= 40) { grade = 'D'; color = '#FF9800'; }
            else { grade = 'F'; color = '#F44336'; }

            return res.json({
                success: true,
                data: {
                    score,
                    grade,
                    color,
                    breakdown: cached.health_score_breakdown,
                    trend: cached.health_score_trend,
                    previous_score: null,
                    generated_at: cached.generated_at
                }
            });
        }

        // No cached score - calculate fresh
        const userData = await getUserFinancialSummary(userId, 90);
        const healthScore = await calculateHealthScore(userData, userId);
        await saveHealthScore(userId, healthScore);

        res.json({
            success: true,
            data: healthScore
        });
    } catch (error) {
        console.error('Error fetching health score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate health score'
        });
    }
});

module.exports = router;
