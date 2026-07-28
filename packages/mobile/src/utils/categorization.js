/**
 * Transaction Categorization Utility (Frontend Port)
 *
 * Provides pattern-based categorization to match backend logic.
 * Priority: Plaid category > Pattern matching > 'Other'
 *
 * COLOUR: every category carries a `colorIndex` into the active theme's
 * validated 7-hue ramp — resolve it with `categoryColor(theme, colorIndex)` from
 * constants/tokens. An index rather than a hex is what lets dark and light each
 * use their own ramp; the dark one is illegible on white.
 *
 * Related categories deliberately share a hue (all transport is blue, all
 * obligations olive). The category's icon is the secondary encoding that keeps
 * them apart, which is also what makes the palette colour-blind safe.
 *
 * The legacy `color` hex is retained for screens that have not moved onto the
 * theme yet; it is removed at the end of Phase 4.
 */

// Ramp slots: 0 teal · 1 amber · 2 blue · 3 olive · 4 purple · 5 green · 6 pink

// Category definitions with keywords and patterns
export const CATEGORY_PATTERNS = {
    // Transportation
    'Gas & Fuel': {
        keywords: ['PETRO-CANADA', 'PIONEER STN', 'SHELL', 'ESSO', 'HUSKY', 'ULTRAMAR', 'FUEL', 'GAS STATION', 'CIRCLE K'],
        icon: 'car',
        library: 'Ionicons',
        colorIndex: 2,
        color: '#FF9500'
    },
    'Transportation': {
        keywords: ['UBER', 'LYFT', 'TAXI', 'TTC', 'GO TRANSIT', 'TRANSIT', 'PARKING', 'PRESTO'],
        icon: 'bus',
        library: 'Ionicons',
        colorIndex: 2,
        color: '#5C6BC0'
    },

    // Food & Drink
    'Groceries': {
        keywords: ['SUBZI MANDI', 'LOBLAWS', 'METRO', 'SOBEYS', 'FRESHCO', 'NOFRILLS', 'COSTCO', 'WALMART', 'FOOD BASICS', 'HOLLAND DAZE'],
        icon: 'cart-outline',
        library: 'Ionicons',
        colorIndex: 5,
        color: '#34C759'
    },
    'Restaurants': {
        keywords: ['CHAIIWALA', 'GWALIA SWEETS', 'RESTAURANT', 'CAFE', 'PIZZA', 'SUSHI', 'BURGER', 'MCDONALD', 'TIM HORTONS', 'STARBUCKS', 'DOORDASH', 'UBER EATS', 'SKIP DISHES', 'GRILLIES', 'MINERVA'],
        icon: 'restaurant',
        library: 'Ionicons',
        colorIndex: 1,
        color: '#FF6B6B'
    },
    'Coffee & Snacks': {
        keywords: ['COFFEE', 'TIM HORTONS', 'STARBUCKS', 'SECOND CUP', 'DUNKIN'],
        icon: 'cafe',
        library: 'Ionicons',
        colorIndex: 1,
        color: '#A0522D'
    },

    // Entertainment
    'Entertainment': {
        keywords: ['CINEPLEX', 'FAMOUS PLAYER', 'RESIDENT ADVISOR', 'THEATRE', 'CONCERT', 'TICKETMASTER', 'MOVIES'],
        icon: 'film',
        library: 'Ionicons',
        colorIndex: 4,
        color: '#AF52DE'
    },
    'Subscriptions': {
        keywords: ['NETFLIX', 'SPOTIFY', 'AUDIBLE', 'DISNEY+', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE', 'CRAVE', 'XBOX GAME', 'MICROSOFT*XBOX', 'CLAUDE', 'ANTH'],
        icon: 'play-circle',
        library: 'Ionicons',
        colorIndex: 4,
        color: '#5856D6'
    },

    // Shopping
    'Shopping': {
        keywords: ['SEPHORA', 'ZARA', 'LOCCITANE', 'WINNERS', 'H&M', 'GAP', 'UNIQLO', 'NIKE', 'ADIDAS', 'CANADIAN TIRE', 'BEST BUY', 'TIMEX', 'SP TIMEX', 'SERVICES'],
        icon: 'bag',
        library: 'Ionicons',
        colorIndex: 6,
        color: '#FF2D92'
    },
    'Health & Pharmacy': {
        keywords: ['REXALL', 'SHOPPERS DRUG', 'PHARMACY', 'WELLNESS', 'MEDICAL', 'DOCTOR', 'CLINIC', 'HOSPITAL'],
        icon: 'medical',
        library: 'Ionicons',
        colorIndex: 0,
        color: '#00C7BE'
    },
    'Fitness': {
        keywords: ['FIT4LESS', 'GOODLIFE', 'GYM', 'FITNESS', 'PLANET FITNESS', 'EQUINOX', 'YOGA'],
        icon: 'barbell',
        library: 'Ionicons',
        colorIndex: 0,
        color: '#30D158'
    },

    // Financial
    'Investments': {
        keywords: ['WEALTHSIMPLE', 'QUESTRADE', 'INVESTMENT', 'TFSA', 'RRSP', 'MUTUAL FUND'],
        icon: 'trending-up',
        library: 'Ionicons',
        colorIndex: 5,
        color: '#32ADE6'
    },
    'Transfers': {
        keywords: ['E-TRANSFER', 'INTERNET TRANSFER', 'WIRE', 'FULFILL REQUEST', 'REMITLY', 'WESTERN UNION', 'MONEYGRAM'],
        icon: 'swap-horizontal-outline',
        library: 'Ionicons',
        colorIndex: 2,
        color: '#007AFF'
    },
    // NOTE: no bare 'TAX' or 'CRA' keywords — they'd substring-match TAXI / CRAVE / CRAFT
    'Taxes & Government': {
        keywords: ['CANADA TXD', 'TXD/TAX', 'RECEIVER GENERAL', 'REVENUE CANADA', 'CRA ', 'CANADA RIT', 'CANADA FPT', 'CANADA PRO', 'CANADA FED', 'GST/HST', 'TAX PAYMENT', 'TAX REFUND', 'PROPERTY TAX', 'INCOME TAX', 'SERVICE ONTARIO'],
        icon: 'library',
        library: 'Ionicons',
        colorIndex: 3,
        color: '#8B5CF6'
    },
    'ATM': {
        keywords: ['ATM WITHDRAWAL', 'ATM DEPOSIT', 'CASH WITHDRAWAL'],
        icon: 'cash-outline',
        library: 'Ionicons',
        colorIndex: 0,
        color: '#34C759'
    },
    'Fees & Charges': {
        keywords: ['SERVICE CHARGE', 'NSF FEE', 'PURCHASE INTEREST', 'NETWORK TRANSACTION FEE', 'PAYMENT PROTECTOR', 'INTEREST'],
        icon: 'receipt-outline',
        library: 'Ionicons',
        colorIndex: 3,
        color: '#FF3B30'
    },
    'Payments': {
        keywords: ['PAYMENT THANK YOU', 'PREAUTHORIZED DEBIT BR', 'LOANS SYSTEM', 'CREDIT'],
        icon: 'card',
        library: 'Ionicons',
        colorIndex: 2,
        color: '#64D2FF'
    },
    'Income': {
        keywords: ['PAYROLL', 'DEPOSIT', 'SALARY', 'BONUS INTEREST', 'REBATE'],
        icon: 'cash',
        library: 'Ionicons',
        colorIndex: 5,
        color: '#4CAF50'
    },

    // Alcohol & Tobacco
    'Alcohol & Bars': {
        keywords: ['LCBO', 'BEER STORE', 'WINE', 'BAR', 'PUB', 'LIQUOR'],
        icon: 'beer',
        library: 'Ionicons',
        colorIndex: 4,
        color: '#BF5AF2'
    },

    // Tech & Software
    'Software & Tech': {
        keywords: ['MICROSOFT*STORE', 'APPLE', 'GOOGLE', 'AMAZON', 'ADOBE', 'SOFTWARE'],
        icon: 'phone-portrait',
        library: 'Ionicons',
        colorIndex: 4,
        color: '#5AC8FA'
    },

    // Utilities
    'Utilities': {
        keywords: ['HYDRO', 'ELECTRIC', 'WATER', 'GAS', 'UTILITY', 'ENBRIDGE', 'TORONTO HYDRO'],
        icon: 'flash',
        library: 'Ionicons',
        colorIndex: 3,
        color: '#FFC107'
    },

    // Bank Fees
    'Bank Fees': {
        keywords: ['BANK FEE', 'MONTHLY FEE', 'OVERDRAFT', 'ACCOUNT FEE'],
        icon: 'pricetag',
        library: 'Ionicons',
        colorIndex: 3,
        color: '#F44336'
    }
};

// Plaid top-level categories that don't exist in CATEGORY_PATTERNS
const PLAID_CATEGORY_META = {
    'Food and Drink': { icon: 'fast-food', library: 'Ionicons', colorIndex: 1, color: '#FF6B6B' },
    'Travel': { icon: 'airplane', library: 'Ionicons', colorIndex: 2, color: '#FF9500' },
    'Shops': { icon: 'bag', library: 'Ionicons', colorIndex: 6, color: '#FF2D92' },
    'Transfer': { icon: 'swap-horizontal-outline', library: 'Ionicons', colorIndex: 2, color: '#007AFF' },
    'Payment': { icon: 'card', library: 'Ionicons', colorIndex: 2, color: '#64D2FF' },
    'Recreation': { icon: 'game-controller', library: 'Ionicons', colorIndex: 4, color: '#AF52DE' },
    'Service': { icon: 'pricetag', library: 'Ionicons', colorIndex: 3, color: '#FF3B30' },
    'Community': { icon: 'people', library: 'Ionicons', colorIndex: 0, color: '#96CEB4' },
    'Healthcare': { icon: 'medical', library: 'Ionicons', colorIndex: 0, color: '#00C7BE' },
    'Interest': { icon: 'trending-up', library: 'Ionicons', colorIndex: 5, color: '#32ADE6' },
    'Tax': { icon: 'document-text', library: 'Ionicons', colorIndex: 3, color: '#FF3B30' },
};

// colorIndex null resolves to the theme's neutral CATEGORY_OTHER.
const DEFAULT_CATEGORY_META = { icon: 'wallet', library: 'Ionicons', colorIndex: null, color: '#8E8E93' };

/**
 * Get display metadata (icon, library, colorIndex, color) for any category name.
 * Covers every custom category in CATEGORY_PATTERNS plus known Plaid
 * top-level categories, so AI/backend-assigned categories render with
 * their proper icon and colour instead of the gray wallet fallback.
 * @param {string} categoryName
 * @returns {Object} - { icon, library, colorIndex, color }
 */
export const getCategoryMeta = (categoryName) => {
    if (!categoryName) return DEFAULT_CATEGORY_META;

    const pattern = CATEGORY_PATTERNS[categoryName];
    if (pattern) {
        return {
            icon: pattern.icon,
            library: pattern.library,
            colorIndex: pattern.colorIndex,
            color: pattern.color,
        };
    }

    return PLAID_CATEGORY_META[categoryName] || DEFAULT_CATEGORY_META;
};

/**
 * Categorize a transaction based on Plaid category or pattern matching
 * @param {Object} transaction - Transaction object
 * @returns {Object} - { category, icon, library, colorIndex, color }
 */
export const categorizeTransaction = (transaction) => {
    // Priority 1: Pattern matching on transaction name (Preferred for specific icons)
    const name = (transaction.name || '').toUpperCase();
    const merchantName = (transaction.merchant_name || '').toUpperCase();
    const searchText = `${name} ${merchantName}`;

    for (const [categoryName, config] of Object.entries(CATEGORY_PATTERNS)) {
        for (const keyword of config.keywords) {
            if (searchText.includes(keyword.toUpperCase())) {
                return {
                    category: categoryName,
                    icon: config.icon,
                    library: config.library,
                    colorIndex: config.colorIndex,
                    color: config.color
                };
            }
        }
    }

    // Priority 2: Use Plaid/backend-assigned category if available
    if (transaction.category && transaction.category.length > 0 && transaction.category[0]) {
        const assignedCategory = transaction.category[0];
        const meta = getCategoryMeta(assignedCategory);
        return {
            category: assignedCategory,
            icon: meta.icon,
            library: meta.library,
            colorIndex: meta.colorIndex,
            color: meta.color
        };
    }

    // Priority 3: Default to 'Other'
    return {
        category: 'Other',
        ...DEFAULT_CATEGORY_META
    };
};
