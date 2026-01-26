/**
 * Transaction Categorization Utility
 *
 * Hybrid 4-layer categorization system:
 * Layer 1: Plaid category (from API)
 * Layer 2: Pattern matching (keyword-based)
 * Layer 3: AI cache lookup (merchant normalization)
 * Layer 4: Fresh AI categorization (background async)
 */

// Lazy load AI features to prevent crashes if GEMINI_API_KEY is missing
let aiCategorization = null;
let dbHelpers = null;

function getAICategorization() {
    if (!aiCategorization) {
        try {
            aiCategorization = require('./ai_categorization');
        } catch (error) {
            console.warn('AI categorization service not available:', error.message);
            aiCategorization = {
                normalizeMerchant: () => null,
                batchCategorizeMerchants: async () => ({ results: [], metadata: { error_message: 'Service unavailable' } })
            };
        }
    }
    return aiCategorization;
}

function getDBHelpers() {
    if (!dbHelpers) {
        try {
            dbHelpers = require('./db');
        } catch (error) {
            console.warn('DB helpers not available:', error.message);
            dbHelpers = {
                getMerchantCategory: async () => null,
                storeMerchantCategories: async () => { },
                incrementCacheUsage: async () => { },
                logAICategorization: async () => { }
            };
        }
    }
    return dbHelpers;
}

// Category definitions with keywords and patterns
const CATEGORY_PATTERNS = {
    // Transportation
    'Gas & Fuel': {
        keywords: ['PETRO-CANADA', 'PIONEER STN', 'SHELL', 'ESSO', 'HUSKY', 'ULTRAMAR', 'FUEL', 'GAS STATION', 'CIRCLE K'],
        icon: 'car-outline',
        color: '#FF9500'
    },

    // Food & Drink
    'Groceries': {
        keywords: ['SUBZI MANDI', 'LOBLAWS', 'METRO', 'SOBEYS', 'FRESHCO', 'NOFRILLS', 'COSTCO', 'WALMART SUPER', 'FOOD BASICS', 'HOLLAND DAZE'],
        icon: 'cart-outline',
        color: '#34C759'
    },
    'Restaurants': {
        keywords: ['CHAIIWALA', 'GWALIA SWEETS', 'RESTAURANT', 'CAFE', 'PIZZA', 'SUSHI', 'BURGER', 'MCDONALD', 'TIM HORTONS', 'STARBUCKS'],
        icon: 'restaurant-outline',
        color: '#FF6B6B'
    },

    // Entertainment
    'Entertainment': {
        keywords: ['CINEPLEX', 'FAMOUS PLAYER', 'RESIDENT ADVISOR', 'THEATRE', 'CONCERT', 'TICKETMASTER', 'MOVIES', 'LCBO', 'WINE', 'BAR', 'PUB', 'LIQUOR', 'GAMING', 'GAMING'],
        icon: 'film-outline',
        color: '#AF52DE'
    },
    'Subscriptions': {
        keywords: ['NETFLIX', 'SPOTIFY', 'AUDIBLE', 'DISNEY+', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE', 'CRAVE', 'XBOX GAME', 'MICROSOFT*XBOX', 'HBO MAX', 'HULU', 'PEACE', 'CLAUDE'],
        icon: 'play-circle-outline',
        color: '#5856D6'
    },

    // Shopping
    'Shopping': {
        keywords: ['SEPHORA', 'ZARA', 'LOCCITANE', 'WINNERS', 'H&M', 'GAP', 'UNIQLO', 'NIKE', 'ADIDAS', 'CANADIAN TIRE', 'BEST BUY', 'TIMEX', 'SP TIMEX'],
        icon: 'bag-outline',
        color: '#FF2D92'
    },
    'Health & Pharmacy': {
        keywords: ['REXALL', 'SHOPPERS DRUG', 'PHARMACY', 'WELLNESS', 'MEDICAL', 'DOCTOR', 'CLINIC', 'HOSPITAL'],
        icon: 'medical-outline',
        color: '#00C7BE'
    },
    'Fitness': {
        keywords: ['FIT4LESS', 'GOODLIFE', 'GYM', 'FITNESS', 'PLANET FITNESS', 'EQUINOX', 'YOGA'],
        icon: 'barbell-outline',
        color: '#30D158'
    },

    // Financial
    'Investments': {
        keywords: ['WEALTHSIMPLE', 'QUESTRADE', 'INVESTMENT', 'TFSA', 'RRSP', 'MUTUAL FUND'],
        icon: 'trending-up-outline',
        color: '#32ADE6'
    },
    'Transfers': {
        keywords: ['E-TRANSFER', 'INTERNET TRANSFER', 'WIRE', 'FULFILL REQUEST'],
        icon: 'swap-horizontal-outline',
        color: '#007AFF'
    },
    'ATM': {
        keywords: ['ATM WITHDRAWAL', 'ATM DEPOSIT', 'CASH WITHDRAWAL'],
        icon: 'cash-outline',
        color: '#8E8E93'
    },
    'Fees & Charges': {
        keywords: ['SERVICE CHARGE', 'NSF FEE', 'PURCHASE INTEREST', 'NETWORK TRANSACTION FEE', 'PAYMENT PROTECTOR', 'INTEREST'],
        icon: 'alert-circle-outline',
        color: '#FF3B30'
    },
    'Payments': {
        keywords: ['PAYMENT THANK YOU', 'PREAUTHORIZED DEBIT BR', 'LOANS SYSTEM', 'CREDIT'],
        icon: 'card-outline',
        color: '#64D2FF'
    },
    'Income': {
        keywords: ['PAYROLL', 'DEPOSIT', 'SALARY', 'BONUS INTEREST', 'REBATE'],
        icon: 'wallet-outline',
        color: '#30D158'
    },
    'Transportation': {
        keywords: ['Lyft', 'Uber', 'Taxi', 'Bus', 'Train', 'Subway', 'Tuk Tuk', 'Auto', 'Car', 'Bike', 'Motorcycle'],
        icon: 'car-outline',
        color: '#FF9500'
    },

    // Alcohol & Tobacco
    'Alcohol & Bars': {
        keywords: ['LCBO', 'BEER STORE', 'WINE', 'BAR', 'PUB', 'LIQUOR'],
        icon: 'wine-outline',
        color: '#BF5AF2'
    },

    // Tech & Software
    'Software & Tech': {
        keywords: ['MICROSOFT*STORE', 'APPLE', 'GOOGLE', 'AMAZON', 'ADOBE', 'SOFTWARE'],
        icon: 'laptop-outline',
        color: '#5AC8FA'
    }
};

/**
 * Categorize a transaction using 4-layer hybrid approach
 * @param {Object} transaction - Transaction object with name, category fields
 * @returns {Promise<Object>} - { category, icon, color, source, needsAI }
 */
const categorizeTransaction = async (transaction) => {
    // Layer 1: Use Plaid category if available
    if (transaction.category && transaction.category.length > 0 && transaction.category[0]) {
        const plaidCategory = transaction.category[0];
        // Map common Plaid categories to our icons/colors
        const plaidMapping = {
            'Food and Drink': { icon: 'restaurant-outline', color: '#FF6B6B' },
            'Travel': { icon: 'airplane-outline', color: '#FF9500' },
            'Shops': { icon: 'bag-outline', color: '#FF2D92' },
            'Transfer': { icon: 'swap-horizontal-outline', color: '#007AFF' },
            'Payment': { icon: 'card-outline', color: '#64D2FF' },
            'Recreation': { icon: 'game-controller-outline', color: '#AF52DE' },
            'Service': { icon: 'construct-outline', color: '#8E8E93' },
        };

        return {
            category: plaidCategory,
            icon: plaidMapping[plaidCategory]?.icon || 'ellipse-outline',
            color: plaidMapping[plaidCategory]?.color || '#8E8E93',
            source: 'plaid',
            needsAI: false
        };
    }

    // Layer 2: Pattern matching on transaction name
    const name = (transaction.name || '').toUpperCase();
    const merchantName = (transaction.merchant_name || '').toUpperCase();
    const searchText = `${name} ${merchantName}`;

    for (const [categoryName, config] of Object.entries(CATEGORY_PATTERNS)) {
        for (const keyword of config.keywords) {
            if (searchText.includes(keyword.toUpperCase())) {
                return {
                    category: categoryName,
                    icon: config.icon,
                    color: config.color,
                    source: 'pattern',
                    needsAI: false
                };
            }
        }
    }

    // Layer 3: AI cache lookup (only if feature is enabled and working)
    const aiCategorizeEnabled = process.env.AI_CATEGORIZATION_ENABLED === 'true';
    if (aiCategorizeEnabled) {
        try {
            const { normalizeMerchant } = getAICategorization();
            const { getMerchantCategory, incrementCacheUsage } = getDBHelpers();

            const merchantNorm = normalizeMerchant(transaction.name);
            if (merchantNorm) {
                const cached = await getMerchantCategory(merchantNorm);
                if (cached) {
                    // Cache hit! Increment usage counter (async, don't wait)
                    incrementCacheUsage(merchantNorm).catch(err =>
                        console.warn('Error incrementing cache usage:', err.message)
                    );

                    return {
                        category: cached.category,
                        icon: cached.category_icon,
                        color: cached.category_color,
                        source: 'ai_cache',
                        needsAI: false
                    };
                }
            }
        } catch (error) {
            console.warn('AI cache lookup failed, falling back to pattern matching:', error.message);
            // Fall through to default - don't crash the request!
        }
    }

    // Layer 4: Mark as needing AI categorization
    return {
        category: 'Other',
        icon: 'ellipse-outline',
        color: '#8E8E93',
        source: 'default',
        needsAI: aiCategorizeEnabled // Only trigger AI if feature is enabled
    };
};

/**
 * Batch categorize transactions with AI (background process)
 * @param {Array} transactions - Transactions needing AI categorization
 * @returns {Promise<void>}
 */
const batchCategorizeWithAI = async (transactions) => {
    if (!transactions || transactions.length === 0) return;

    try {
        const { normalizeMerchant, batchCategorizeMerchants } = getAICategorization();
        const { storeMerchantCategories, logAICategorization } = getDBHelpers();

        // Extract unique normalized merchant names
        const merchantMap = new Map();
        transactions.forEach(tx => {
            const normalized = normalizeMerchant(tx.name);
            if (normalized && !merchantMap.has(normalized)) {
                merchantMap.set(normalized, tx);
            }
        });

        const merchantNames = Array.from(merchantMap.keys());
        console.log(`→ AI categorization needed for ${merchantNames.length} unique merchants`);

        // Call AI service (batches up to 20 merchants per call)
        const batchSize = parseInt(process.env.AI_CATEGORIZATION_BATCH_SIZE || '20');
        const batches = [];

        for (let i = 0; i < merchantNames.length; i += batchSize) {
            const batch = merchantNames.slice(i, i + batchSize);
            batches.push(batch);
        }

        for (const batch of batches) {
            const result = await batchCategorizeMerchants(batch);

            // Store results in cache
            if (result.results && result.results.length > 0) {
                await storeMerchantCategories(result.results);
            }

            // Log AI call
            await logAICategorization(result.metadata);

            console.log(`✓ AI categorized ${result.results?.length || 0}/${batch.length} merchants`);
        }

        console.log(`✓ Completed AI categorization for ${merchantNames.length} merchants`);
    } catch (error) {
        console.error('Error in batch AI categorization:', error);
        // Log the error (gracefully handle if logging fails)
        try {
            const { logAICategorization } = getDBHelpers();
            await logAICategorization({
                merchant_count: transactions.length,
                error_message: error.message
            });
        } catch (logError) {
            console.warn('Failed to log AI error (tables may not exist yet):', logError.message);
        }
    }
};

/**
 * Get category spending breakdown
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<Object>} - Category spending summary
 */
const getCategoryBreakdown = async (transactions) => {
    const breakdown = {};

    // Categorize all transactions (now async)
    for (const tx of transactions) {
        // Only count expenses (positive amounts after Plaid inversion)
        const amount = Math.abs(parseFloat(tx.amount));
        if (tx.amount <= 0) continue; // Skip income

        const { category, icon, color } = await categorizeTransaction(tx);

        if (!breakdown[category]) {
            breakdown[category] = {
                total: 0,
                count: 0,
                icon,
                color
            };
        }

        breakdown[category].total += amount;
        breakdown[category].count++;
    }

    // Convert to array and sort by total
    return Object.entries(breakdown)
        .map(([name, data]) => ({
            name,
            total: data.total,
            count: data.count,
            icon: data.icon,
            color: data.color
        }))
        .sort((a, b) => b.total - a.total);
};

module.exports = {
    CATEGORY_PATTERNS,
    categorizeTransaction,
    getCategoryBreakdown,
    batchCategorizeWithAI,
    // Export lazy-loaded function
    normalizeMerchant: (name) => {
        const { normalizeMerchant } = getAICategorization();
        return normalizeMerchant(name);
    }
};
