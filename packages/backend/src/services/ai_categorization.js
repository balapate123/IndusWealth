/**
 * AI-Powered Transaction Categorization Service
 * Uses Gemini 2.0 Flash to intelligently categorize merchants
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { CATEGORY_PATTERNS } = require('./categorization');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Normalize merchant name for cache lookups
 * Removes store numbers, locations, and other suffixes
 *
 * Examples:
 * - "MCDONALD'S #1234 TORONTO" → "MCDONALD'S"
 * - "LYFT *RIDE 12345" → "LYFT"
 * - "SHOPPERS DRUG MART STORE 2345" → "SHOPPERS DRUG MART"
 */
function normalizeMerchant(rawName) {
    if (!rawName) return '';

    return rawName
        .toUpperCase()                          // Case-insensitive
        .replace(/[#*]\d+/g, '')                // Remove #1234, *5678
        .replace(/\s+\d{4,}/g, '')              // Remove long numbers (4+ digits)
        .replace(/\s+(STORE|LOCATION|BRANCH|STN|#)\s*/gi, '') // Remove common suffixes
        .replace(/\s+/g, ' ')                   // Normalize whitespace
        .trim()
        .substring(0, 100);                     // Limit length
}

/**
 * Batch categorize merchants using Gemini AI
 *
 * @param {Array<string>} merchantNames - Array of normalized merchant names
 * @returns {Promise<Array>} Array of categorization results
 */
async function batchCategorizeMerchants(merchantNames) {
    if (!merchantNames || merchantNames.length === 0) {
        return [];
    }

    const startTime = Date.now();

    try {
        // Build the prompt
        const prompt = buildCategorizationPrompt(merchantNames);

        // Call Gemini API
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            generationConfig: {
                temperature: 0.3,          // Lower = more consistent
                topK: 20,
                topP: 0.8,
                maxOutputTokens: 2048,     // Smaller than insights
                responseMimeType: 'application/json'
            }
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const response = result.response;
        const text = response.text();

        // Parse JSON response
        let categorizations;
        try {
            const parsed = JSON.parse(text);
            categorizations = parsed.categorizations || [];
        } catch (parseError) {
            console.error('Failed to parse AI categorization response:', text.substring(0, 500));
            console.error('Parse error:', parseError.message);
            return [];
        }

        // Validate and enrich results
        const validResults = categorizations
            .filter(cat => {
                // Ensure required fields
                if (!cat.merchant || !cat.category) return false;

                // Ensure confidence threshold
                if (cat.confidence < 0.7) {
                    console.warn(`Low confidence (${cat.confidence}) for ${cat.merchant}, skipping`);
                    return false;
                }

                // Ensure category exists in our patterns
                if (!CATEGORY_PATTERNS[cat.category]) {
                    console.warn(`Unknown category "${cat.category}" for ${cat.merchant}, skipping`);
                    return false;
                }

                return true;
            })
            .map(cat => ({
                merchant_normalized: cat.merchant,
                category: cat.category,
                category_icon: CATEGORY_PATTERNS[cat.category].icon,
                category_color: CATEGORY_PATTERNS[cat.category].color,
                confidence_score: cat.confidence,
                ai_model_used: 'gemini-2.0-flash-exp'
            }));

        const generationTimeMs = Date.now() - startTime;

        // Estimate token counts (rough approximation)
        const tokenCountInput = Math.ceil(prompt.length / 4);
        const tokenCountOutput = Math.ceil(text.length / 4);

        return {
            results: validResults,
            metadata: {
                merchant_count: merchantNames.length,
                token_count_input: tokenCountInput,
                token_count_output: tokenCountOutput,
                generation_time_ms: generationTimeMs,
                ai_model_used: 'gemini-2.0-flash-exp'
            }
        };

    } catch (error) {
        console.error('Error in AI categorization:', error);
        return {
            results: [],
            metadata: {
                merchant_count: merchantNames.length,
                error_message: error.message,
                generation_time_ms: Date.now() - startTime
            }
        };
    }
}

/**
 * Build the AI prompt for categorization
 */
function buildCategorizationPrompt(merchants) {
    const categories = Object.keys(CATEGORY_PATTERNS);

    const systemPrompt = `You are a transaction categorization expert for a Canadian personal finance app.

TASK: Categorize merchant names into predefined categories.

AVAILABLE CATEGORIES:
${categories.join(', ')}

CATEGORY DESCRIPTIONS:
- Gas & Fuel: Gas stations, fuel purchases
- Groceries: Supermarkets, grocery stores
- Restaurants: Restaurants, cafes, fast food
- Entertainment: Movies, concerts, events
- Subscriptions: Recurring services (Netflix, Spotify, etc.)
- Shopping: Retail stores, clothing, electronics
- Health & Pharmacy: Pharmacies, medical, wellness
- Fitness: Gyms, fitness centers
- Investments: Investment platforms (Wealthsimple, Questrade), TFSA, RRSP contributions
- Transfers: Money transfers, e-transfers
- ATM: ATM withdrawals and deposits
- Fees & Charges: Bank fees, interest charges
- Payments: Bill payments, loan payments
- Income: Salary, payroll, deposits
- Transportation: Rideshare (Lyft, Uber), taxi, transit
- Alcohol & Bars: LCBO, bars, pubs, liquor stores
- Software & Tech: Software, apps, tech purchases

IMPORTANT RULES:
1. Choose the BEST matching category (exactly as listed above)
2. Be CONSISTENT (same merchant = same category always)
3. Consider Canadian context:
   - Tim Hortons, McDonald's, Starbucks = "Restaurants"
   - LCBO, Beer Store = "Alcohol & Bars"
   - Shoppers Drug Mart = "Health & Pharmacy"
   - Wealthsimple, Questrade = "Investments" (NOT Subscriptions or Transfers!)
   - Lyft, Uber = "Transportation" (NOT Other!)
4. Default to "Shopping" if uncertain (NOT "Other")
5. Return confidence score (0.0-1.0):
   - 0.95-1.0: Very certain (known brand)
   - 0.80-0.94: Confident (clear category)
   - 0.70-0.79: Reasonable guess
   - <0.70: Don't categorize

OUTPUT FORMAT (strict JSON):
{
  "categorizations": [
    {
      "merchant": "SHOPPERS DRUG MART",
      "category": "Health & Pharmacy",
      "confidence": 0.95
    },
    {
      "merchant": "LYFT",
      "category": "Transportation",
      "confidence": 0.99
    },
    {
      "merchant": "WEALTHSIMPLE",
      "category": "Investments",
      "confidence": 0.99
    }
  ]
}

MERCHANTS TO CATEGORIZE:
${JSON.stringify(merchants, null, 2)}

Return ONLY valid JSON. No explanations or markdown.`;

    return systemPrompt;
}

module.exports = {
    normalizeMerchant,
    batchCategorizeMerchants,
    buildCategorizationPrompt
};
