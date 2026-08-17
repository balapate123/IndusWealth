/**
 * Transaction Categorization Utility
 *
 * Hybrid 4-layer categorization system:
 * Layer 1: Plaid category (from API)
 * Layer 2: Pattern matching (keyword-based)
 * Layer 3: AI cache lookup (merchant normalization)
 * Layer 4: Fresh AI categorization (background async)
 */

const { canonicalizeCategory } = require('./category_map');

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
// Category definitions with keywords and patterns
const CATEGORY_PATTERNS = {
    // Transportation
    'Gas & Fuel': {
        keywords: ['PETRO-CANADA', 'PIONEER STN', 'SHELL', 'ESSO', 'HUSKY', 'ULTRAMAR', 'FUEL', 'GAS STATION', 'CIRCLE K'],
        icon: 'car-outline',
        color: '#FF9500'
    },
    'Transportation': {
        keywords: ['UBER', 'LYFT', 'TAXI', 'TTC', 'GO TRANSIT', 'TRANSIT', 'PARKING', 'PRESTO'],
        icon: 'bus-outline',
        color: '#5C6BC0'
    },
    'Travel': {
        keywords: ['AIR CANADA', 'WESTJET', 'FLAIR AIRLINES', 'PORTER AIRLINES', 'EXPEDIA', 'BOOKING.COM', 'AIRBNB', 'VRBO', 'MARRIOTT', 'HILTON', 'HOTEL', 'HOSTEL', 'AIRLINE', 'AIRPORT'],
        icon: 'airplane-outline',
        color: '#FF9500'
    },

    // Food & Drink
    'Groceries': {
        keywords: ['SUBZI MANDI', 'LOBLAWS', 'METRO', 'SOBEYS', 'FRESHCO', 'NOFRILLS', 'COSTCO', 'WALMART', 'FOOD BASICS', 'HOLLAND DAZE'],
        icon: 'cart-outline',
        color: '#34C759'
    },
    'Restaurants': {
        keywords: ['CHAIIWALA', 'GWALIA SWEETS', 'RESTAURANT', 'CAFE', 'PIZZA', 'SUSHI', 'BURGER', 'MCDONALD', 'TIM HORTONS', 'STARBUCKS', 'DOORDASH', 'UBER EATS', 'SKIP DISHES', 'GRILLIES', 'MINERVA'],
        icon: 'restaurant-outline',
        color: '#FF6B6B'
    },
    'Coffee & Snacks': {
        keywords: ['COFFEE', 'TIM HORTONS', 'STARBUCKS', 'SECOND CUP', 'DUNKIN'],
        icon: 'cafe-outline',
        color: '#A0522D'
    },

    // Entertainment
    // LCBO / WINE / BAR / PUB / LIQUOR are deliberately NOT here — they belong
    // to 'Alcohol & Bars' and listing them in both put the same purchase in two
    // categories depending on which package resolved it: this table is declared
    // before Alcohol & Bars, so the backend said Entertainment while mobile
    // (which never had the duplicates) said Alcohol & Bars.
    'Entertainment': {
        keywords: ['CINEPLEX', 'FAMOUS PLAYER', 'RESIDENT ADVISOR', 'THEATRE', 'CONCERT', 'TICKETMASTER', 'MOVIES', 'GAMING'],
        icon: 'film-outline',
        color: '#AF52DE'
    },
    'Subscriptions': {
        // 'PEACOCK', not 'PEACE' — the truncated form matched any merchant
        // containing the substring, e.g. PEACE BRIDGE DUTY FREE.
        keywords: ['NETFLIX', 'SPOTIFY', 'AUDIBLE', 'DISNEY+', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE', 'CRAVE', 'XBOX GAME', 'MICROSOFT*XBOX', 'HBO MAX', 'HULU', 'PEACOCK', 'CLAUDE', 'ANTH'],
        icon: 'play-circle-outline',
        color: '#5856D6'
    },

    // Shopping
    'Shopping': {
        keywords: ['SEPHORA', 'ZARA', 'LOCCITANE', 'WINNERS', 'H&M', 'GAP', 'UNIQLO', 'NIKE', 'ADIDAS', 'CANADIAN TIRE', 'BEST BUY', 'TIMEX', 'SP TIMEX', 'SERVICES'],
        icon: 'bag-outline',
        color: '#FF2D92'
    },
    'Personal Care': {
        keywords: ['SALON', 'BARBER', 'GREAT CLIPS', 'SPORT CLIPS', 'NAIL BAR', 'NAILS', 'HAIRCUT', 'DRY CLEAN', 'LAUNDROMAT'],
        icon: 'cut-outline',
        color: '#FF66C4'
    },
    'Health & Pharmacy': {
        keywords: ['REXALL', 'SHOPPERS DRUG', 'PHARMACY', 'WELLNESS', 'MEDICAL', 'DOCTOR', 'CLINIC', 'HOSPITAL', 'DENTAL', 'DENTIST', 'OPTOMETRIST'],
        icon: 'medical-outline',
        color: '#00C7BE'
    },
    'Fitness': {
        keywords: ['FIT4LESS', 'GOODLIFE', 'GYM', 'FITNESS', 'PLANET FITNESS', 'EQUINOX', 'YOGA'],
        icon: 'barbell-outline',
        color: '#30D158'
    },
    'Education': {
        keywords: ['TUITION', 'UNIVERSITY', 'COLLEGE', 'SCHOOL', 'COURSERA', 'UDEMY', 'TEXTBOOK', 'STUDENT LOAN'],
        icon: 'school-outline',
        color: '#0A84FF'
    },
    'Insurance': {
        keywords: ['INSURANCE', 'BELAIRDIRECT', 'INTACT INS', 'AVIVA', 'ALLSTATE', 'DESJARDINS INS', 'TD INSURANCE'],
        icon: 'shield-checkmark-outline',
        color: '#7C8B3F'
    },

    // Financial
    'Investments': {
        keywords: ['WEALTHSIMPLE', 'QUESTRADE', 'INVESTMENT', 'TFSA', 'RRSP', 'MUTUAL FUND'],
        icon: 'trending-up-outline',
        color: '#32ADE6'
    },
    'Transfers': {
        keywords: ['E-TRANSFER', 'INTERNET TRANSFER', 'WIRE', 'FULFILL REQUEST', 'REMITLY', 'WESTERN UNION', 'MONEYGRAM'],
        icon: 'swap-horizontal-outline',
        color: '#007AFF'
    },
    // NOTE: no bare 'TAX' or 'CRA' keywords — they'd substring-match TAXI / CRAVE / CRAFT
    'Taxes & Government': {
        keywords: ['CANADA TXD', 'TXD/TAX', 'RECEIVER GENERAL', 'REVENUE CANADA', 'CRA ', 'CANADA RIT', 'CANADA FPT', 'CANADA PRO', 'CANADA FED', 'GST/HST', 'TAX PAYMENT', 'TAX REFUND', 'PROPERTY TAX', 'INCOME TAX', 'SERVICE ONTARIO'],
        icon: 'library-outline',
        color: '#8B5CF6'
    },
    'ATM': {
        keywords: ['ATM WITHDRAWAL', 'ATM DEPOSIT', 'CASH WITHDRAWAL'],
        icon: 'cash-outline',
        color: '#8E8E93'
    },
    'Fees & Charges': {
        keywords: ['SERVICE CHARGE', 'NSF FEE', 'PURCHASE INTEREST', 'NETWORK TRANSACTION FEE', 'PAYMENT PROTECTOR', 'INTEREST'],
        icon: 'pricetag-outline',
        color: '#FF3B30'
    },
    'Payments': {
        keywords: ['PAYMENT THANK YOU', 'PREAUTHORIZED DEBIT BR', 'LOANS SYSTEM', 'CREDIT'],
        icon: 'card-outline',
        color: '#64D2FF'
    },
    'Income': {
        keywords: ['PAYROLL', 'DEPOSIT', 'SALARY', 'BONUS INTEREST', 'REBATE'],
        icon: 'cash-outline',
        color: '#4CAF50'
    },

    // Alcohol & Tobacco
    'Alcohol & Bars': {
        keywords: ['LCBO', 'BEER STORE', 'WINE', 'BAR', 'PUB', 'LIQUOR'],
        icon: 'beer-outline',
        color: '#BF5AF2'
    },

    // Tech & Software
    'Software & Tech': {
        keywords: ['MICROSOFT*STORE', 'APPLE', 'GOOGLE', 'AMAZON', 'ADOBE', 'SOFTWARE'],
        icon: 'phone-portrait-outline',
        color: '#5AC8FA'
    },

    // Utilities
    'Utilities': {
        keywords: ['HYDRO', 'ELECTRIC', 'WATER', 'GAS', 'UTILITY', 'ENBRIDGE', 'TORONTO HYDRO'],
        icon: 'flash-outline',
        color: '#FFC107'
    },

    // Bank Fees
    'Bank Fees': {
        keywords: ['BANK FEE', 'MONTHLY FEE', 'OVERDRAFT', 'ACCOUNT FEE'],
        icon: 'pricetag-outline',
        color: '#F44336'
    }
};

/**
 * Every keyword flattened and sorted longest-first, so the most specific match
 * wins regardless of which category declared it.
 *
 * Scanning category-by-category made the result depend on object key order:
 * 'Transportation' is declared before 'Restaurants', so "UBER EATS" matched the
 * 4-character 'UBER' and a food delivery was filed as a commute. Ties keep
 * declaration order, so an overlap like TIM HORTONS (Restaurants and Coffee &
 * Snacks both claim it) still resolves the way it always has.
 */
const KEYWORD_INDEX = Object.entries(CATEGORY_PATTERNS)
    .flatMap(([categoryName, config]) =>
        config.keywords.map((keyword) => ({ keyword: keyword.toUpperCase(), categoryName, config }))
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);

const DEFAULT_META = { icon: 'wallet-outline', color: '#8E8E93' };

/**
 * Categorize a transaction using 4-layer hybrid approach
 * @param {Object} transaction - Transaction object with name, category fields
 * @returns {Promise<Object>} - { category, icon, color, source, needsAI }
 */
const categorizeTransaction = async (transaction) => {
    // Layer 1: Pattern matching on transaction name (moved to top priority)
    const name = (transaction.name || '').toUpperCase();
    const merchantName = (transaction.merchant_name || '').toUpperCase();
    const searchText = `${name} ${merchantName}`;

    for (const { keyword, categoryName, config } of KEYWORD_INDEX) {
        if (searchText.includes(keyword)) {
            return {
                category: categoryName,
                icon: config.icon,
                color: config.color,
                source: 'pattern',
                needsAI: false
            };
        }
    }

    // Layer 2: Fold Plaid's taxonomy into ours.
    //
    // This used to return Plaid's top-level string verbatim, which is what put
    // two vocabularies into one list: a keyword hit produced "Restaurants" and
    // a miss produced "Food and Drink", so the same category appeared twice.
    // canonicalizeCategory reads the full array, so a coffee shop resolves to
    // Coffee & Snacks rather than collapsing to its parent.
    if (transaction.category && transaction.category.length > 0 && transaction.category[0]) {
        const canonical = canonicalizeCategory(transaction.category);
        const meta = CATEGORY_PATTERNS[canonical] || DEFAULT_META;

        return {
            category: canonical,
            icon: meta.icon,
            color: meta.color,
            source: 'plaid',
            needsAI: false
        };
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
        icon: 'wallet-outline',
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
