/**
 * AI Insights Generation Service
 * Uses Gemini to generate personalized financial insights
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const etfKnowledge = require('./etf_knowledge');
const linkRegistry = require('./link_registry');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration (env-configurable for easy switching).
// Previous default 'gemini-2.0-pro' was never a valid GA model id, and the
// 2.0 family was retired 2026-06-01 — default to the current stable model.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

// Trusted sources for educational article recommendations
const TRUSTED_SOURCES = [
    { domain: 'nerdwallet.com', name: 'NerdWallet', focus: 'Personal finance, credit cards, loans' },
    { domain: 'investopedia.com', name: 'Investopedia', focus: 'Investing, trading, financial terms' },
    { domain: 'moneysense.ca', name: 'MoneySense', focus: 'Canadian personal finance, investing' },
    { domain: 'wealthsimple.com/en-ca/learn', name: 'Wealthsimple', focus: 'Investing basics, Canadian finance' },
    { domain: 'canada.ca', name: 'Government of Canada', focus: 'TFSA, RRSP, FHSA, tax info' },
    { domain: 'getsmarteraboutmoney.ca', name: 'GetSmarterAboutMoney', focus: 'Financial literacy, Ontario Securities Commission' },
    { domain: 'ratehub.ca', name: 'RateHub', focus: 'Mortgages, credit cards, banking rates' },
    { domain: 'fool.ca', name: 'Motley Fool Canada', focus: 'Stock investing, market analysis' }
];

/**
 * Generate financial insights for a user
 * @param {Object} userData - Aggregated financial data from insight_data.js
 * @returns {Object} Generated insights with metadata
 */
async function generateInsights(userData, { articleCatalogText } = {}) {
    const startTime = Date.now();

    try {
        // Build the prompt
        const prompt = _buildPrompt(userData, articleCatalogText);

        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
                // gemini-3.5-flash is a "thinking" model: reasoning tokens count
                // against maxOutputTokens but are never returned, so with thinking
                // on the visible JSON was silently truncated (finishReason
                // MAX_TOKENS) and failed to parse. Disable thinking — this is a
                // prescriptive schema-fill task, so it stays high quality while
                // being faster, cheaper, and returning complete JSON.
                thinkingConfig: { thinkingBudget: 0 },
            },
        });

        const response = result.response;
        // Surface truncation loudly instead of letting it masquerade as a JSON
        // syntax error (this bug hid for weeks behind "Unterminated string").
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            console.warn('⚠️ [AI Insights] Output hit MAX_TOKENS — response truncated. Raise maxOutputTokens or shorten the prompt.');
        }
        const text = response.text();

        // Parse JSON response
        let aiResponse;
        try {
            aiResponse = JSON.parse(text);
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', text.substring(0, 500));
            console.error('Parse error:', parseError.message);
            throw new Error(`AI returned invalid JSON format: ${parseError.message}`);
        }

        // Validate and process insights
        const validatedInsights = _validateInsights(aiResponse);

        // Resolve every action link through the registry. Anything the model
        // invented is stripped here, before it can reach a device.
        const linkedInsights = _resolveActions(validatedInsights);

        // Calculate priority scores and limit to top 7
        const prioritizedInsights = _prioritizeInsights(linkedInsights);

        // Article ids only — the model no longer authors URLs, so the caller
        // maps these against the catalog it supplied.
        const recommendedArticleIds = _extractArticleIds(aiResponse.recommendedArticleIds);

        // Estimate token counts (approximate)
        const tokenCountInput = Math.ceil(prompt.length / 4);
        const tokenCountOutput = Math.ceil(text.length / 4);

        const generationTimeMs = Date.now() - startTime;

        return {
            insights: prioritizedInsights,
            recommendedArticleIds,
            summary: `${prioritizedInsights.length} insights generated from your last ${userData.user_profile.analysis_period_days} days of activity`,
            metadata: {
                token_count_input: tokenCountInput,
                token_count_output: tokenCountOutput,
                ai_model_used: GEMINI_MODEL,
                generation_time_ms: generationTimeMs
            }
        };
    } catch (error) {
        console.error('Error generating insights:', error);
        throw error;
    }
}

/**
 * Build the AI prompt with user data
 * @param {Object} userData
 * @param {string} articleCatalogText - the catalog rendered as "[id] Title — …" lines
 */
function _buildPrompt(userData, articleCatalogText = '(no articles available)') {
    // Get user risk tolerance for ETF filtering
    const riskLevel = userData.user_preferences?.investment_risk_tolerance || 'moderate';
    const etfPromptData = etfKnowledge.getETFDataForPrompt(riskLevel);

    const systemPrompt = `You are an expert Canadian personal finance advisor and AI financial co-pilot analyzing a user's financial data. Your goal is to generate 6-8 actionable, personalized, numbers-driven insights that help the user optimize their finances. Be SPECIFIC with dollar amounts, percentages, and timelines.

CONTEXT:
- User location: Canada (Ontario)
- Financial products: TFSA, FHSA, RRSP, GIC, ETFs
- Tax considerations: Canadian tax brackets and deductions
- Currency: CAD
- Current date: ${new Date().toISOString().split('T')[0]}

USER PREFERENCES:
- Risk tolerance: ${userData.user_preferences?.investment_risk_tolerance || 'moderate'}
- First-time homebuyer: ${userData.user_preferences?.first_time_homebuyer ?? 'unknown'}
- Interested in investing: ${userData.user_preferences?.interested_in_investing ?? true}
- Preferred account type: ${userData.user_preferences?.preferred_savings_account_type || 'tfsa'}
- Investment experience: ${userData.user_preferences?.investment_experience || 'none'}

SEASONAL CONTEXT:
- Current month: ${userData.seasonal_context?.current_month || new Date().toLocaleString('en-CA', { month: 'long' })}
- Current quarter: ${userData.seasonal_context?.current_quarter || 'Q' + (Math.floor(new Date().getMonth() / 3) + 1)}
- Tax season: ${userData.seasonal_context?.is_tax_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_tax_deadline + ' days (April 30)' : 'No'}
- RRSP season: ${userData.seasonal_context?.is_rrsp_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_rrsp_deadline + ' days (March 1)' : 'No'}
- Days until TFSA reset (Jan 1): ${userData.seasonal_context?.days_until_tfsa_reset || 'N/A'}

CANADIAN ETF REFERENCE DATA (for investment recommendations):
${etfPromptData}

CANADIAN HOUSEHOLD SPENDING AVERAGES (2024 StatCan, approximate):
- Food (groceries): $1,060/month ($12,720/year)
- Shelter (rent/mortgage): $1,800/month ($21,600/year)
- Transportation: $860/month ($10,320/year)
- Dining out: $335/month ($4,020/year)
- Entertainment: $240/month ($2,880/year)
- Clothing: $200/month ($2,400/year)
- Personal care: $100/month ($1,200/year)

ONTARIO TAX BRACKETS (individual, combined federal+provincial marginal rates):
- $0-$55,867: ~20% marginal
- $55,867-$111,733: ~30% marginal
- $111,733-$154,906: ~37% marginal
- $154,906-$220,000: ~41% marginal
- $220,000+: ~46% marginal

HISA RATES (approximate):
- EQ Bank: 4.00%
- Tangerine: 4.50% (promo)
- Wealthsimple Cash: 3.75%
- HISA ETFs (CASH, PSA): 4.5-5.0%

INSIGHT CATEGORIES (generate across relevant categories, aim for 6-8 total):
EXISTING:
1. Tax-Advantaged Account Opportunities (TFSA, FHSA, RRSP)
2. Spending Optimization (subscriptions, dining, groceries)
3. Debt Payoff Acceleration (avalanche, balance transfer, consolidation)
4. Savings Acceleration (emergency fund, found money, automation)
5. Cash Flow Optimization (credit utilization, bill timing, budgeting)
6. Investment Readiness (when user is ready to start investing)
7. Milestone Celebrations (debt payoff, net worth goals)

NEW:
8. ETF/Investment Recommendations - ONLY when financial_readiness.ready_to_invest is true OR monthly surplus > $500. Name SPECIFIC tickers from the ETF reference data, include MER, approximate historical returns. Always add disclaimer about past performance.
9. Tax Optimization - ONLY during tax season (Jan-Apr) or RRSP season. Calculate specific tax savings using user's estimated income and Ontario tax brackets.
10. Wealth Building Strategies - When positive cash flow exists. Dollar-cost averaging plans, TFSA vs RRSP optimization at user's income level.
11. Comparative Analysis - Compare user's spending to Canadian averages above. Be specific: "You spend $X on dining out, Y% above the Canadian average of $335."
12. Opportunity Cost Insights - When large balances sit in chequing. Calculate: "Moving $X from chequing (0.01%) to HISA ETF (4.8%) = $Y/year more."
13. Seasonal/Timely Insights - ONLY generate if seasonally relevant per SEASONAL CONTEXT above. Tax deadline reminders, RRSP deadline, TFSA room reset, etc.

RULES:
1. Be specific with dollar amounts and calculations - no vague advice
2. Show clear ROI or savings potential for each insight
3. Prioritize high-impact insights (>$500/year savings or major financial health improvement)
4. Use encouraging but realistic tone
5. Every insight must have a clear action the user can take
6. Calculate benefits conservatively (use realistic interest rates, returns)
7. Consider user's actual financial situation (don't recommend investing if they have high-interest debt)
8. If user has negative cash flow, prioritize spending reduction insights
9. If user has positive cash flow + emergency fund, prioritize growth insights
10. CRITICAL: NEVER suggest canceling investment transactions (Wealthsimple, Questrade, TFSA, RRSP contributions)
11. CRITICAL: Distinguish between subscriptions (Netflix, Spotify) and investments (even if they recur weekly/monthly)
12. CRITICAL: TRUE SUBSCRIPTIONS are digital services (Netflix, Spotify, Apple Music, gym memberships, software, cloud storage)
13. CRITICAL: NOT SUBSCRIPTIONS are restaurants, gas stations, groceries, coffee shops, transportation, pharmacies, retail stores
14. CRITICAL: If subscriptions data includes restaurants, gas, or transportation merchants, IGNORE them
15. Look at category field to identify investments - do not treat them as subscriptions to cancel
16. For ETF recommendations: ALWAYS name specific tickers from the reference data, include MER, mention approximate historical returns, and link to a brokerage. Add disclaimer about past performance.
17. For tax insights: Use the user's estimated income to calculate approximate tax bracket and savings. Be specific with dollar amounts.
18. For comparative analysis: Compare user spending to Canadian averages and be specific about the difference in dollars and percentage.
19. For opportunity cost: Calculate the actual dollar difference between current and optimal allocation.
20. For seasonal insights: Only generate if seasonally relevant (check SEASONAL CONTEXT above).
21. Generate 6-8 insights total across the expanded categories.
22. At least 1 insight must be from the new categories (8-13) if the user data supports it.
23. NEVER recommend specific stocks (individual companies). Only recommend broad-market ETFs from the provided reference data.
24. All projected returns must use the word "approximately" or "estimated" and include a disclaimer.

SUBSCRIPTION IDENTIFICATION EXAMPLES:
- ACTUAL SUBSCRIPTIONS: Netflix, Disney+, Spotify, Apple Music, Microsoft 365, Adobe, gym memberships, cloud storage
- NOT SUBSCRIPTIONS: Tim Hortons, Starbucks, McDonald's, Petro-Canada, Shell, Uber, Lyft, Loblaws, Sobeys, Costco, Shoppers Drug Mart, Wealthsimple, Questrade

CANADIAN FINANCIAL CONSTANTS:
- TFSA contribution limit 2026: $7,000/year
- FHSA annual limit: $8,000/year, lifetime $40,000
- Average HISA rate: 4-5%
- Average credit card APR: 19.99%
- Average investment return (moderate risk): 6-7% annually
- Recommended credit utilization: < 30%
- Recommended emergency fund: 3-6 months of expenses

LINK DESTINATIONS (the ONLY external links that exist; reference them by key):
${linkRegistry.getDestinationsForPrompt()}

IN-APP SCREENS (for actions that stay inside the app):
${linkRegistry.getRoutesForPrompt()}

ARTICLE CATALOG (pick by id — these are the only articles that exist):
${articleCatalogText}

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no extra text) matching this schema:

{
  "insights": [
    {
      "id": "unique_id",
      "type": "insight_category",
      "priority": "high|medium|low",
      "title": "Short compelling title (< 60 chars)",
      "description": "2-3 sentence explanation with specific numbers",
      "reasoning": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
      "data_points": {
        "key_metric_1": value,
        "key_metric_2": value
      },
      "action": {
        "primary": {
          "label": "Action button text",
          "type": "web_link|navigate",
          "destination": "key_from_LINK_DESTINATIONS"  // when type is web_link
          "route": "NameFromINAPPSCREENS"              // when type is navigate
        }
      },
      "potential_benefit": {
        "monthly_savings": 0,
        "annual_savings": 0,
        "annual_growth_estimate": 0,
        "calculation": "Explanation of how savings/growth were calculated"
      },
      "dismissible": true,
      "generated_at": "${new Date().toISOString()}"
    }
  ],
  "recommendedArticleIds": [12, 7, 31]
}

LINK RULES (CRITICAL — read twice):
1. NEVER write a URL. Not in a description, not in an action, not anywhere. You
   do not know any URLs. Any URL you produce will be discarded and the button
   with it, leaving the user with a worse insight.
2. For an external link, set "type": "web_link" and "destination" to a key from
   LINK DESTINATIONS exactly as spelled. Do not invent keys.
3. For an in-app action, set "type": "navigate" and "route" to a name from
   IN-APP SCREENS exactly as spelled.
4. If no destination or screen fits the insight, prefer "navigate" to the closest
   screen. A generic in-app action beats a wrong external link.

ARTICLE RECOMMENDATION RULES:
1. Return 3-5 ids in "recommendedArticleIds", chosen from the ARTICLE CATALOG above
2. Use the numeric id only — no titles, no URLs, no objects
3. Pick articles relevant to the insights you generated and this user's situation
4. Ids not in the catalog are discarded, so do not guess
5. Order them most-relevant first
6. If fewer than 3 catalog articles are relevant, return only the relevant ones

PRIORITY SCORING:
- high: Potential savings/benefit > $1,000/year OR urgent financial health issue
- medium: Potential savings $300-1,000/year OR important optimization
- low: Potential savings < $300/year OR celebratory/educational insights

Now, analyze the following user data and generate 6-8 personalized insights with 3-5 relevant educational article recommendations:`;

    const userDataJson = JSON.stringify(userData, null, 2);

    return `${systemPrompt}\n\nUSER FINANCIAL DATA:\n${userDataJson}`;
}

/**
 * Validate insight structure
 */
function _validateInsights(data) {
    if (!data || !data.insights || !Array.isArray(data.insights)) {
        throw new Error('Invalid insights format: missing insights array');
    }

    const requiredFields = ['id', 'type', 'priority', 'title', 'description', 'action', 'potential_benefit'];

    const validInsights = data.insights.filter(insight => {
        // Check required fields
        for (const field of requiredFields) {
            if (!insight[field]) {
                console.warn(`Insight missing required field: ${field}`, insight);
                return false;
            }
        }

        // Validate priority
        if (!['high', 'medium', 'low'].includes(insight.priority)) {
            console.warn(`Invalid priority: ${insight.priority}`);
            return false;
        }

        // Validate title length
        if (insight.title.length > 70) {
            insight.title = insight.title.substring(0, 67) + '...';
        }

        // Ensure action has primary
        if (!insight.action.primary) {
            console.warn('Insight missing primary action', insight);
            return false;
        }

        // Add generated_at if missing
        if (!insight.generated_at) {
            insight.generated_at = new Date().toISOString();
        }

        // Ensure dismissible is set
        if (insight.dismissible === undefined) {
            insight.dismissible = true;
        }

        return true;
    });

    if (validInsights.length === 0) {
        throw new Error('No valid insights generated');
    }

    return validInsights;
}

/**
 * Prioritize and limit insights to top 5
 */
function _prioritizeInsights(insights) {
    // Sort by priority (high > medium > low) and potential savings
    const priorityWeight = { high: 3, medium: 2, low: 1 };

    insights.sort((a, b) => {
        const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // If same priority, sort by potential annual savings
        const aSavings = a.potential_benefit?.annual_savings || 0;
        const bSavings = b.potential_benefit?.annual_savings || 0;
        return bSavings - aSavings;
    });

    // Return top 7
    return insights.slice(0, 7);
}

/**
 * Extract article ids from the AI response.
 *
 * The model used to return whole article objects including a URL it had made
 * up. Now it returns ids and nothing else, so there is nothing to validate
 * beyond "is this a positive integer" — the catalog lookup does the rest.
 */
function _extractArticleIds(raw) {
    if (!Array.isArray(raw)) {
        if (raw !== undefined) console.warn('AI returned recommendedArticleIds that was not an array:', typeof raw);
        return [];
    }

    const ids = [];
    for (const value of raw) {
        // Tolerate "12" and { id: 12 }; reject everything else.
        const candidate = typeof value === 'object' && value !== null ? value.id : value;
        const id = Number.parseInt(candidate, 10);
        if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, 5);
}

// Where an insight lands when its action cannot be resolved. Keyed on substrings
// because insight `type` is model-authored and never quite matches an enum.
const FALLBACK_ROUTES = [
    { match: /debt|loan|credit_card|payoff|balance_transfer/, route: 'Wealth' },
    { match: /etf|invest|portfolio|wealth_building/, route: 'ETFList' },
    { match: /subscription|recurring|watchdog/, route: 'Watchdog' },
    { match: /saving|emergency|cash_flow|opportunity_cost/, route: 'AllAccounts' },
    { match: /tax|tfsa|rrsp|fhsa/, route: 'WealthAcademy' },
];
const DEFAULT_FALLBACK_ROUTE = 'AnalyticsTab';

function _fallbackRouteFor(insightType) {
    const type = String(insightType || '').toLowerCase();
    const hit = FALLBACK_ROUTES.find((entry) => entry.match.test(type));
    return hit ? hit.route : DEFAULT_FALLBACK_ROUTE;
}

/**
 * Turn one model-authored action into something safe to render.
 *
 * A web_link is valid ONLY through a registry destination key. There is no
 * escape hatch for a raw URL, not even one whose host is on the allowlist:
 * `moneysense.ca/save/anything-i-imagine/` passes a host check and still 404s,
 * and permitting it would reinstate exactly the bug this file exists to fix.
 * If a link is missing, the answer is to add it to link_registry.js, where
 * scripts/verify-links.js will prove it resolves.
 *
 * Anything unresolvable degrades to an in-app route rather than disappearing,
 * so every card keeps a button that does something.
 */
function _resolveAction(action, insightType) {
    // Tolerate null, a string, anything — the model improvises and a crash here
    // would take down an otherwise good set of insights.
    const raw = action && typeof action === 'object' ? action : {};

    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null;
    const fallback = () => ({
        label: label || 'View details',
        type: 'navigate',
        route: _fallbackRouteFor(insightType),
    });

    if (raw.type === 'web_link') {
        const destination = linkRegistry.resolveDestination(raw.destination);
        if (destination) {
            return {
                label: label || destination.label,
                type: 'web_link',
                destination: destination.key,
                url: destination.url,
            };
        }
        console.warn(
            `Discarded unresolvable insight link — destination="${raw.destination}" url="${raw.url}"`
        );
        return fallback();
    }

    if (raw.type === 'navigate' || raw.route) {
        const route = linkRegistry.resolveRoute(raw.route);
        if (route) {
            return { label: label || 'Open', type: 'navigate', route, params: raw.params || undefined };
        }
        console.warn(`Discarded unknown insight route: "${raw.route}"`);
        return fallback();
    }

    // 'external_action' and anything else the model improvises.
    return fallback();
}

/**
 * Resolve every action on every insight.
 */
function _resolveActions(insights) {
    const URL_IN_PROSE = /https?:\/\//i;

    return insights.map((insight) => {
        const resolved = { ...insight, action: { ...insight.action } };

        resolved.action.primary = _resolveAction(insight.action?.primary, insight.type);
        if (insight.action?.secondary) {
            resolved.action.secondary = _resolveAction(insight.action.secondary, insight.type);
        }

        // Not sanitised — prose is rendered as plain text, so a stray URL is
        // ugly rather than dangerous. Logged because it means the model is
        // drifting from the link rules and the prompt may need tightening.
        if (URL_IN_PROSE.test(insight.description || '')) {
            console.warn(`Insight "${insight.id}" has a URL in its description — link rules are being ignored`);
        }

        return resolved;
    });
}

// ============ CATEGORY ANALYTICS INSIGHTS (Advanced Analytics screen) ============

// Fast model for short category insights; override via env if needed
const CATEGORY_INSIGHT_MODEL = process.env.GEMINI_CATEGORY_INSIGHTS_MODEL || 'gemini-3.5-flash';

// The AI only returns type/title/description — icon and color are mapped
// server-side so an invalid icon name can never reach the mobile app
const CATEGORY_INSIGHT_TYPES = {
    spending_alert: { icon: 'trending-up', color: '#FF6B6B' },
    saving_win: { icon: 'trending-down', color: '#4CAF50' },
    trend: { icon: 'analytics', color: '#32ADE6' },
    habit: { icon: 'repeat', color: '#5856D6' },
    merchant: { icon: 'storefront', color: '#FF9500' },
    timing: { icon: 'calendar', color: '#AF52DE' },
    optimization: { icon: 'bulb', color: '#C9A227' },
    positive: { icon: 'checkmark-circle', color: '#30D158' },
};

/**
 * Generate short AI insights for the Advanced Analytics screen.
 * Receives the aggregated payload from computeCategoryAnalytics — transaction
 * lists are stripped before sending; only category/merchant aggregates go to
 * Gemini (same no-PII posture as generateInsights).
 * @param {Object} analytics - payload from /analytics/categories
 * @returns {Object} { insights: [{type, icon, color, title, description}], metadata }
 */
async function generateCategoryInsights(analytics) {
    const startTime = Date.now();

    const promptData = {
        period_days: analytics.period,
        summary: analytics.summary,
        categories: analytics.categories.map(c => ({
            name: c.name,
            total: c.total,
            count: c.count,
            percentage: c.percentage,
            avgTransaction: c.avgTransaction,
            prevTotal: c.prevTotal,
            changePercent: c.changePercent,
            weekdayTotal: c.weekdayTotal,
            weekendTotal: c.weekendTotal,
            topMerchants: (c.topMerchants || []).slice(0, 3).map(m => ({
                name: m.name, total: m.total, count: m.count
            })),
        })),
        day_of_week: analytics.dayOfWeek,
        size_buckets: analytics.sizeBuckets,
        monthly_trend: analytics.monthlyTrend,
    };

    const prompt = `You are a sharp, numbers-driven personal finance analyst for a Canadian budgeting app (currency: CAD).

TASK: Analyze the aggregated spending data below and generate 3-5 short, high-signal insights the user can act on.

RULES:
1. Every insight MUST cite specific numbers from the data (dollar amounts, percentages, counts).
2. Be concrete and actionable — "cut X", "you saved Y", "Z is trending up" — never vague advice.
3. Only state what the data supports. Never invent numbers.
4. Vary the insight types — do not repeat the same type twice.
5. "type" must be exactly one of: ${Object.keys(CATEGORY_INSIGHT_TYPES).join(', ')}
6. "title" under 50 characters, punchy. "description" under 200 characters, 1-2 sentences.
7. If spending dropped or a habit improved, celebrate it (saving_win or positive).
8. Consider the change vs the previous period (prevTotal, changePercent) — that comparison is the most valuable signal.

OUTPUT (strict JSON, no markdown):
{"insights":[{"type":"spending_alert","title":"...","description":"..."}]}

DATA:
${JSON.stringify(promptData)}`;

    try {
        const model = genAI.getGenerativeModel({
            model: CATEGORY_INSIGHT_MODEL,
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
                // Disable "thinking" — its hidden reasoning tokens were eating the
                // whole budget and truncating this short JSON (see generateInsights).
                thinkingConfig: { thinkingBudget: 0 },
            },
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        if (result.response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            console.warn('⚠️ [Category Insights] Output hit MAX_TOKENS — response truncated.');
        }
        const text = result.response.text();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseError) {
            console.error('Failed to parse category insights response:', text.substring(0, 300));
            return { insights: [], metadata: { ai_model_used: CATEGORY_INSIGHT_MODEL, error_message: parseError.message, generation_time_ms: Date.now() - startTime } };
        }

        const insights = (parsed.insights || [])
            .filter(i => i && i.title && i.description && CATEGORY_INSIGHT_TYPES[i.type])
            .slice(0, 5)
            .map(i => ({
                type: i.type,
                icon: CATEGORY_INSIGHT_TYPES[i.type].icon,
                color: CATEGORY_INSIGHT_TYPES[i.type].color,
                title: String(i.title).substring(0, 60),
                description: String(i.description).substring(0, 240),
            }));

        return {
            insights,
            metadata: {
                ai_model_used: CATEGORY_INSIGHT_MODEL,
                token_count_input: Math.ceil(prompt.length / 4),
                token_count_output: Math.ceil(text.length / 4),
                generation_time_ms: Date.now() - startTime,
            },
        };
    } catch (error) {
        console.error('Error generating category insights:', error.message);
        return { insights: [], metadata: { ai_model_used: CATEGORY_INSIGHT_MODEL, error_message: error.message, generation_time_ms: Date.now() - startTime } };
    }
}

module.exports = {
    generateInsights,
    generateCategoryInsights,
    TRUSTED_SOURCES,
    // Exported for tests: these are the guards that decide whether a link ever
    // reaches a device, so they need to be exercisable without a Gemini call.
    _resolveActions,
    _extractArticleIds,
};
