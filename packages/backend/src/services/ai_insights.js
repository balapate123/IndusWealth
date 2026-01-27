/**
 * AI Insights Generation Service
 * Uses Gemini Flash 2.0 to generate personalized financial insights
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
            },
        });

        const response = result.response;
        const text = response.text();

        // Parse JSON response
        let insights;
        try {
            insights = JSON.parse(text);
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', text.substring(0, 500));
            console.error('Parse error:', parseError.message);
            throw new Error(`AI returned invalid JSON format: ${parseError.message}`);
        }

        // Validate and process insights
        const validatedInsights = _validateInsights(insights);

        // Calculate priority scores and limit to top 7
        const prioritizedInsights = _prioritizeInsights(validatedInsights);

        // Estimate token counts (approximate)
        const tokenCountInput = Math.ceil(prompt.length / 4);
        const tokenCountOutput = Math.ceil(text.length / 4);

        const generationTimeMs = Date.now() - startTime;

        return {
            insights: prioritizedInsights,
            summary: `${prioritizedInsights.length} insights generated from your last ${userData.user_profile.analysis_period_days} days of activity`,
            metadata: {
                token_count_input: tokenCountInput,
                token_count_output: tokenCountOutput,
                ai_model_used: 'gemini-2.0-flash-exp',
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
    const systemPrompt = `You are an expert Canadian personal finance advisor analyzing a user's financial data. Your goal is to generate 4-5 actionable, personalized insights that help the user optimize their finances.

CONTEXT:
- User location: Canada
- Financial products: TFSA, FHSA, RRSP, GIC, ETFs
- Tax considerations: Canadian tax brackets and deductions
- Currency: CAD

INSIGHT CATEGORIES (generate 1-2 from each relevant category):
1. Tax-Advantaged Account Opportunities (TFSA, FHSA, RRSP)
2. Spending Optimization (subscriptions, dining, groceries)
3. Debt Payoff Acceleration (avalanche, balance transfer, consolidation)
4. Savings Acceleration (emergency fund, found money, automation)
5. Cash Flow Optimization (credit utilization, bill timing, budgeting)
6. Investment Readiness (when user is ready to start investing)
7. Milestone Celebrations (debt payoff, net worth goals)

RULES:
1. Be specific with dollar amounts and calculations
2. Show clear ROI or savings potential for each insight
3. Prioritize high-impact insights (>$500/year savings or major financial health improvement)
4. Use encouraging but realistic tone
5. Every insight must have a clear action the user can take
6. Calculate benefits conservatively (use realistic interest rates, returns)
7. Consider user's actual financial situation (don't recommend investing if they have high-interest debt)
8. If user has negative cash flow, prioritize spending reduction insights
9. If user has positive cash flow + emergency fund, prioritize growth insights (investing, tax-advantaged accounts)
10. CRITICAL: NEVER suggest canceling investment transactions (Wealthsimple, Questrade, TFSA, RRSP contributions)
11. CRITICAL: Distinguish between subscriptions (Netflix, Spotify) and investments (even if they recur weekly/monthly)
12. CRITICAL: TRUE SUBSCRIPTIONS are digital services (Netflix, Spotify, Apple Music, gym memberships, software, cloud storage)
13. CRITICAL: NOT SUBSCRIPTIONS are restaurants, gas stations, groceries, coffee shops, transportation (Uber, Lyft), pharmacies, retail stores
14. CRITICAL: If subscriptions data includes restaurants, gas, or transportation merchants, IGNORE them completely - they are NOT subscriptions
15. Look at category field to identify investments - do not treat them as subscriptions to cancel

SUBSCRIPTION IDENTIFICATION EXAMPLES:
✅ ACTUAL SUBSCRIPTIONS (can suggest reviewing/canceling):
- Netflix, Disney+, Spotify, Apple Music (streaming services)
- Microsoft 365, Adobe Creative Cloud (software)
- Gym memberships (Goodlife, Planet Fitness)
- Cloud storage (iCloud, Dropbox)
- Audible, Kindle Unlimited (digital content)

❌ NOT SUBSCRIPTIONS (NEVER suggest canceling these):
- Tim Hortons, Starbucks, McDonald's (restaurants/coffee shops)
- Petro-Canada, Shell, Esso (gas stations)
- Uber, Lyft (transportation)
- Loblaws, Sobeys, Costco (groceries)
- Shoppers Drug Mart, Rexall (pharmacies)
- Any restaurant, cafe, or food establishment
- Wealthsimple, Questrade (investments)

CANADIAN FINANCIAL CONSTANTS (use these in calculations):
- TFSA contribution limit 2026: $7,000/year
- FHSA annual limit: $8,000/year, lifetime $40,000
- Average HISA rate: 4-5%
- Average credit card APR: 19.99%
- Average investment return (moderate risk): 6-7% annually
- Recommended credit utilization: < 30%
- Recommended emergency fund: 3-6 months of expenses

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
        "calculation": "Explanation of how savings were calculated"
      },
      "dismissible": true,
      "generated_at": "${new Date().toISOString()}"
    }
  ]
}

PRIORITY SCORING:
- high: Potential savings/benefit > $1,000/year OR urgent financial health issue
- medium: Potential savings $300-1,000/year OR important optimization
- low: Potential savings < $300/year OR celebratory/educational insights

Now, analyze the following user data and generate 5-7 personalized insights:`;

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

    // Return top 5
    return insights.slice(0, 5);
}

module.exports = {
    generateInsights
};
