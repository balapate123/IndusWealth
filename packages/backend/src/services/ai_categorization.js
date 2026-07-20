/**
 * AI-Powered Transaction Categorization Service
 * Uses Gemini to intelligently categorize merchants
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// gemini-2.0-flash was retired 2026-06-01 (API returns 404); default to the
// current stable Flash model, overridable via env without a code change
const AI_CATEGORIZATION_MODEL = process.env.GEMINI_CATEGORIZATION_MODEL || 'gemini-3.5-flash';

// Lazy load to avoid circular dependency
let CATEGORY_PATTERNS = null;
function getCategoryPatterns() {
    if (!CATEGORY_PATTERNS) {
        try {
            const categorization = require('./categorization');
            CATEGORY_PATTERNS = categorization.CATEGORY_PATTERNS;
        } catch (error) {
            console.error('Failed to load CATEGORY_PATTERNS:', error.message);
            // Fallback minimal patterns
            CATEGORY_PATTERNS = {
                'Transportation': { keywords: ['LYFT', 'UBER'], icon: 'car-outline', color: '#FF9500' },
                'Investments': { keywords: ['WEALTHSIMPLE', 'QUESTRADE'], icon: 'trending-up-outline', color: '#32ADE6' },
                'Shopping': { keywords: [], icon: 'bag-outline', color: '#FF2D92' }
            };
        }
    }
    return CATEGORY_PATTERNS;
}

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
            model: AI_CATEGORIZATION_MODEL,
            generationConfig: {
                temperature: 0.3,          // Lower = more consistent
                topK: 20,
                topP: 0.8,
                maxOutputTokens: 2048,     // Smaller than insights
                responseMimeType: 'application/json',
                // Disable "thinking": its hidden reasoning tokens count against
                // maxOutputTokens and can truncate the categorization JSON (same
                // root cause as the insights truncation).
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const response = result.response;
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            console.warn('⚠️ [AI Categorization] Output hit MAX_TOKENS — response truncated; some merchants may be skipped.');
        }
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
        const patterns = getCategoryPatterns();
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
                if (!patterns[cat.category]) {
                    console.warn(`Unknown category "${cat.category}" for ${cat.merchant}, skipping`);
                    return false;
                }

                return true;
            })
            .map(cat => ({
                merchant_normalized: cat.merchant,
                category: cat.category,
                category_icon: patterns[cat.category].icon,
                category_color: patterns[cat.category].color,
                confidence_score: cat.confidence,
                ai_model_used: AI_CATEGORIZATION_MODEL
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
                ai_model_used: AI_CATEGORIZATION_MODEL
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
    const patterns = getCategoryPatterns();
    const categories = Object.keys(patterns);

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
- Taxes & Government: CRA payments, Receiver General, income/property tax payments and refunds, government fees

IMPORTANT RULES:
1. Choose the BEST matching category (exactly as listed above)
2. Be CONSISTENT (same merchant = same category always)
3. Consider Canadian context:
   - Tim Hortons, McDonald's, Starbucks = "Restaurants"
   - LCBO, Beer Store = "Alcohol & Bars"
   - Shoppers Drug Mart = "Health & Pharmacy"
   - Wealthsimple, Questrade = "Investments" (NOT Subscriptions or Transfers!)
   - Lyft, Uber = "Transportation" (NOT Other!)
   - CANADA TXD, RECEIVER GENERAL, CRA, REVENUE CANADA = "Taxes & Government" (NOT Transportation! "TXD" means tax deduction, not taxi)
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
