/**
 * AI Insights API Routes
 * Endpoints for generating and managing personalized financial insights
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { pool } = db;
const { getUserFinancialSummary } = require('../services/insight_data');
const { generateInsights } = require('../services/ai_insights');
const insightPersistence = require('../services/insight_persistence');
const { normalizeType } = require('../services/insight_identity');
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
                        // Decorated on read, not at generation: the day count
                        // stays current and a dismissal takes effect now
                        // rather than whenever the cache happens to expire.
                        insights: await insightPersistence.presentInsights(userId, cached.insights),
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

        // What we have already told this user and they have not acted on. Goes
        // into the prompt so the model leads with what changed instead of
        // restating an unchanged condition in the same words every six hours.
        const outstandingText = await insightPersistence.buildOutstandingText(userId);

        const result = await generateInsights(userData, {
            articleCatalogText: formatCatalogForPrompt(articleCatalog),
            outstandingText,
        });

        // Record this generation against the ledger before anything is filtered
        // for display — the history is of what is true, not of what was shown.
        await insightPersistence.recordGeneration(userId, result.insights);

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
                insights: await insightPersistence.presentInsights(userId, result.insights),
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

        // The fingerprint is the stable "type:subject" identity. It used to be
        // the insight id, which the model reinvents every generation — so the
        // row never matched anything again and the dismissal, though written,
        // could never be honoured. Older builds do not send one; those requests
        // still succeed and behave exactly as they always did.
        const fingerprint = typeof req.body.fingerprint === 'string' && req.body.fingerprint.trim()
            ? req.body.fingerprint.trim()
            : insight_id;

        await db.dismissInsight(userId, {
            insightType: normalizeType(insight_type),
            fingerprint,
            reason: reason || 'not_specified',
            remindAfter,
        });

        res.json({
            success: true,
            message: 'Insight dismissed successfully',
            data: { fingerprint, remind_after: remindAfter }
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

        // Tapping the action stops the cost-of-inaction counter. We cannot see
        // whether they went on to move the money — only that they engaged — but
        // continuing to tell someone they have ignored something they visibly
        // acted on is the worse error of the two.
        const fingerprint = typeof req.body.fingerprint === 'string' ? req.body.fingerprint.trim() : '';
        if (fingerprint && action_type !== 'dismissed') {
            await db.markInsightActed(userId, fingerprint);
        }

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
 * GET /api/insights/spotlight
 *
 * The one insight worth interrupting for, or null.
 *
 * Reads the cache only. This is called on app open, so it must never trigger a
 * Gemini call — a pop-up that costs three seconds of cold start is a pop-up
 * that gets the app deleted. No cached insights means no pop-up, and the user
 * sees one on a later launch once the Insights tab has been visited.
 *
 * Does NOT mark the spotlight as shown; the client does that via
 * POST /spotlight/seen once it actually renders. Otherwise a dropped response
 * or a background fetch would burn the user's weekly interruption on a pop-up
 * they never saw.
 */
router.get('/spotlight', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        if (!(await db.isSpotlightDue(userId))) {
            return res.json({ success: true, data: { spotlight: null, reason: 'cooldown' } });
        }

        const candidate = await db.getSpotlightCandidate(userId);
        if (!candidate) {
            return res.json({ success: true, data: { spotlight: null, reason: 'no_candidate' } });
        }

        // Pull the full insight out of the cache so the pop-up shows the same
        // words as the card behind it. The ledger stores a title, not the body.
        const cacheResult = await pool.query(
            `SELECT insights FROM user_insights
             WHERE user_id = $1
             ORDER BY generated_at DESC
             LIMIT 1`,
            [userId]
        );

        const cachedInsights = cacheResult.rows[0]?.insights || [];
        const match = cachedInsights.find(
            (insight) => insightPersistence.fingerprintFor(insight) === candidate.fingerprint
        );

        if (!match) {
            // The condition is still tracked but has aged out of the newest
            // generation. Showing a stale body would be worse than staying quiet.
            return res.json({ success: true, data: { spotlight: null, reason: 'not_in_cache' } });
        }

        const [presented] = await insightPersistence.presentInsights(userId, [match]);
        if (!presented) {
            return res.json({ success: true, data: { spotlight: null, reason: 'dismissed' } });
        }

        res.json({ success: true, data: { spotlight: presented } });
    } catch (error) {
        console.error('Error building spotlight:', error);
        // A failed pop-up is not a failed app open. Answer "nothing to show".
        res.json({ success: true, data: { spotlight: null, reason: 'error' } });
    }
});

/**
 * POST /api/insights/spotlight/seen
 * Client confirms the pop-up was rendered; starts both cooldowns.
 */
router.post('/spotlight/seen', authenticateToken, async (req, res) => {
    try {
        const { fingerprint } = req.body;
        if (!fingerprint || typeof fingerprint !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required field: fingerprint' });
        }

        await db.markSpotlightShown(req.user.id, fingerprint.trim());
        res.json({ success: true });
    } catch (error) {
        console.error('Error recording spotlight impression:', error);
        res.status(500).json({ success: false, error: 'Failed to record spotlight' });
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
                    email_insights_enabled, push_insights_enabled, spotlight_enabled
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
                    push_insights_enabled: true,
                    spotlight_enabled: true
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
            push_insights_enabled,
            spotlight_enabled
        } = req.body;

        // Build the upsert from (column, value) pairs.
        //
        // This used to derive the INSERT column list from the same array that
        // carried the SET clauses, after 'updated_at = NOW()' had been pushed
        // into it — so the statement always named one more column than it had
        // expressions and Postgres rejected it at parse time. The endpoint
        // therefore 500'd on every call, for every preference, since it shipped.
        // updated_at is written literally now rather than being smuggled through
        // the parameter list.
        const candidates = {
            first_time_homebuyer,
            investment_risk_tolerance,
            interested_in_investing,
            interested_in_crypto,
            preferred_savings_account_type,
            email_insights_enabled,
            push_insights_enabled,
            spotlight_enabled,
        };

        const columns = Object.keys(candidates).filter((key) => candidates[key] !== undefined);

        if (columns.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No preferences provided to update'
            });
        }

        const values = [userId, ...columns.map((key) => candidates[key])];
        const placeholders = columns.map((_, i) => `$${i + 2}`);
        const assignments = columns.map((column, i) => `${column} = $${i + 2}`);

        await pool.query(
            `INSERT INTO user_preferences (user_id, ${columns.join(', ')}, updated_at)
             VALUES ($1, ${placeholders.join(', ')}, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET ${assignments.join(', ')}, updated_at = NOW()`,
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
