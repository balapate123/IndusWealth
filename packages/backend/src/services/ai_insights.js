/**
 * AI Insights Generation Service
 * Uses Gemini Flash 2.0 to generate personalized financial insights
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const etfKnowledge = require('./etf_knowledge');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration (env-configurable for easy switching)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-pro';

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
async function generateInsights(userData) {
    const startTime = Date.now();

    try {
        // Build the prompt
        const prompt = _buildPrompt(userData);

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
            },
        });

        const response = result.response;
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

        // Calculate priority scores and limit to top 7
        const prioritizedInsights = _prioritizeInsights(validatedInsights);

        // Extract recommended articles if present
        const recommendedArticles = _validateArticles(aiResponse.recommendedArticles || []);

        // Estimate token counts (approximate)
        const tokenCountInput = Math.ceil(prompt.length / 4);
        const tokenCountOutput = Math.ceil(text.length / 4);

        const generationTimeMs = Date.now() - startTime;

        return {
            insights: prioritizedInsights,
            recommendedArticles,
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
 */
function _buildPrompt(userData) {
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

TRUSTED EDUCATIONAL SOURCES (use these for article recommendations):
${TRUSTED_SOURCES.map(s => `- ${s.name} (${s.domain}): ${s.focus}`).join('\n')}

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
          "type": "web_link|navigate|external_action",
          "url": "https://..." OR "route": "ScreenName"
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
  "recommendedArticles": [
    {
      "url": "https://...",
      "title": "Article Title",
      "description": "Brief 1-2 sentence description of the article",
      "category": "budgeting|investing|debt|taxes|savings|general|etf_education|wealth_building",
      "source": "Source Name",
      "relatedInsightTypes": ["insight_type_1", "insight_type_2"],
      "read_time_minutes": 5
    }
  ]
}

ARTICLE RECOMMENDATION RULES:
1. Recommend 3-5 educational articles from the TRUSTED SOURCES above
2. Articles should be relevant to the user's financial situation and generated insights
3. Use REAL, valid URLs from these trusted sources (not made up URLs)
4. Each article should relate to at least one generated insight type
5. Prioritize Canadian financial content (MoneySense, Wealthsimple, Government of Canada)
6. Include a mix of categories based on user's situation

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
 * Validate article recommendations from AI response
 */
function _validateArticles(articles) {
    if (!Array.isArray(articles)) {
        return [];
    }

    const requiredFields = ['url', 'title', 'category'];
    const validCategories = ['budgeting', 'investing', 'debt', 'taxes', 'savings', 'general', 'etf_education', 'wealth_building', 'investing_basics', 'tax_planning', 'debt_management', 'canadian_finance_101'];

    return articles.filter(article => {
        // Check required fields
        for (const field of requiredFields) {
            if (!article[field]) {
                console.warn(`Article missing required field: ${field}`, article);
                return false;
            }
        }

        // Validate URL format
        try {
            new URL(article.url);
        } catch (e) {
            console.warn(`Invalid article URL: ${article.url}`);
            return false;
        }

        // Normalize category
        if (!validCategories.includes(article.category)) {
            article.category = 'general';
        }

        // Ensure relatedInsightTypes is an array
        if (!Array.isArray(article.relatedInsightTypes)) {
            article.relatedInsightTypes = [];
        }

        // Set default read time if missing
        if (!article.read_time_minutes) {
            article.read_time_minutes = 5;
        }

        return true;
    }).slice(0, 5); // Limit to 5 articles
}

module.exports = {
    generateInsights,
    TRUSTED_SOURCES
};
