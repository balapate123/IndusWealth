/**
 * Transaction Categorization Utility (Frontend Port)
 * 
 * Provides pattern-based categorization to match backend logic.
 * Priority: Plaid category > Pattern matching > 'Other'
 */

// Category definitions with keywords and patterns
export const CATEGORY_PATTERNS = {
    // Transportation
    'Gas & Fuel': {
        keywords: ['PETRO-CANADA', 'PIONEER STN', 'SHELL', 'ESSO', 'HUSKY', 'ULTRAMAR', 'FUEL', 'GAS STATION', 'CIRCLE K'],
        icon: 'car',
        library: 'Ionicons',
        color: '#FF9500'
    },
    'Transportation': {
        keywords: ['UBER', 'LYFT', 'TAXI', 'TTC', 'GO TRANSIT', 'TRANSIT', 'PARKING', 'PRESTO'],
        icon: 'bus',
        library: 'Ionicons',
        color: '#5C6BC0'
    },

    // Food & Drink
    'Groceries': {
        keywords: ['SUBZI MANDI', 'LOBLAWS', 'METRO', 'SOBEYS', 'FRESHCO', 'NOFRILLS', 'COSTCO', 'WALMART', 'FOOD BASICS', 'HOLLAND DAZE'],
        icon: 'cart-outline',
        library: 'Ionicons',
        color: '#34C759'
    },
    'Restaurants': {
        keywords: ['CHAIIWALA', 'GWALIA SWEETS', 'RESTAURANT', 'CAFE', 'PIZZA', 'SUSHI', 'BURGER', 'MCDONALD', 'TIM HORTONS', 'STARBUCKS', 'DOORDASH', 'UBER EATS', 'SKIP DISHES', 'GRILLIES', 'MINERVA'],
        icon: 'restaurant',
        library: 'Ionicons',
        color: '#FF6B6B'
    },
    'Coffee & Snacks': {
        keywords: ['COFFEE', 'TIM HORTONS', 'STARBUCKS', 'SECOND CUP', 'DUNKIN'],
        icon: 'cafe',
        library: 'Ionicons',
        color: '#A0522D'
    },

    // Entertainment
    'Entertainment': {
        keywords: ['CINEPLEX', 'FAMOUS PLAYER', 'RESIDENT ADVISOR', 'THEATRE', 'CONCERT', 'TICKETMASTER', 'MOVIES'],
        icon: 'film',
        library: 'Ionicons',
        color: '#AF52DE'
    },
    'Subscriptions': {
        keywords: ['NETFLIX', 'SPOTIFY', 'AUDIBLE', 'DISNEY+', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE', 'CRAVE', 'XBOX GAME', 'MICROSOFT*XBOX', 'CLAUDE', 'ANTH'],
        icon: 'play-circle',
        library: 'Ionicons',
        color: '#5856D6'
    },

    // Shopping
    'Shopping': {
        keywords: ['SEPHORA', 'ZARA', 'LOCCITANE', 'WINNERS', 'H&M', 'GAP', 'UNIQLO', 'NIKE', 'ADIDAS', 'CANADIAN TIRE', 'BEST BUY', 'TIMEX', 'SP TIMEX', 'SERVICES'],
        icon: 'bag',
        library: 'Ionicons',
        color: '#FF2D92'
    },
    'Health & Pharmacy': {
        keywords: ['REXALL', 'SHOPPERS DRUG', 'PHARMACY', 'WELLNESS', 'MEDICAL', 'DOCTOR', 'CLINIC', 'HOSPITAL'],
        icon: 'medical',
        library: 'Ionicons',
        color: '#00C7BE'
    },
    'Fitness': {
        keywords: ['FIT4LESS', 'GOODLIFE', 'GYM', 'FITNESS', 'PLANET FITNESS', 'EQUINOX', 'YOGA'],
        icon: 'barbell',
        library: 'Ionicons',
        color: '#30D158'
    },

    // Financial
    'Investments': {
        keywords: ['WEALTHSIMPLE', 'QUESTRADE', 'INVESTMENT', 'TFSA', 'RRSP', 'MUTUAL FUND'],
        icon: 'trending-up',
        library: 'Ionicons',
        color: '#32ADE6'
    },
    'Transfers': {
        keywords: ['E-TRANSFER', 'INTERNET TRANSFER', 'WIRE', 'FULFILL REQUEST', 'REMITLY', 'WESTERN UNION', 'MONEYGRAM'],
        icon: 'swap-horizontal-outline',
        library: 'Ionicons',
        color: '#007AFF'
    },
    'ATM': {
        keywords: ['ATM WITHDRAWAL', 'ATM DEPOSIT', 'CASH WITHDRAWAL'],
        icon: 'cash-outline',
        library: 'Ionicons',
        color: '#34C759'
    },
    'Fees & Charges': {
        keywords: ['SERVICE CHARGE', 'NSF FEE', 'PURCHASE INTEREST', 'NETWORK TRANSACTION FEE', 'PAYMENT PROTECTOR', 'INTEREST'],
        icon: 'receipt-outline',
        library: 'Ionicons',
        color: '#FF3B30'
    },
    'Payments': {
        keywords: ['PAYMENT THANK YOU', 'PREAUTHORIZED DEBIT BR', 'LOANS SYSTEM', 'CREDIT'],
        icon: 'card',
        library: 'Ionicons',
        color: '#64D2FF'
    },
    'Income': {
        keywords: ['PAYROLL', 'DEPOSIT', 'SALARY', 'BONUS INTEREST', 'REBATE'],
        icon: 'cash',
        library: 'Ionicons',
        color: '#4CAF50'
    },

    // Alcohol & Tobacco
    'Alcohol & Bars': {
        keywords: ['LCBO', 'BEER STORE', 'WINE', 'BAR', 'PUB', 'LIQUOR'],
        icon: 'beer',
        library: 'Ionicons',
        color: '#BF5AF2'
    },

    // Tech & Software
    'Software & Tech': {
        keywords: ['MICROSOFT*STORE', 'APPLE', 'GOOGLE', 'AMAZON', 'ADOBE', 'SOFTWARE'],
        icon: 'phone-portrait',
        library: 'Ionicons',
        color: '#5AC8FA'
    },

    // Utilities
    'Utilities': {
        keywords: ['HYDRO', 'ELECTRIC', 'WATER', 'GAS', 'UTILITY', 'ENBRIDGE', 'TORONTO HYDRO'],
        icon: 'flash',
        library: 'Ionicons',
        color: '#FFC107'
    },

    // Bank Fees
    'Bank Fees': {
        keywords: ['BANK FEE', 'MONTHLY FEE', 'OVERDRAFT', 'ACCOUNT FEE'],
        icon: 'pricetag',
        library: 'Ionicons',
        color: '#F44336'
    }
};

/**
 * Categorize a transaction based on Plaid category or pattern matching
 * @param {Object} transaction - Transaction object
 * @returns {Object} - { category: string, icon: string, library: string, color: string }
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
                    color: config.color
                };
            }
        }
    }

    // Priority 2: Use Plaid category if available
    if (transaction.category && transaction.category.length > 0 && transaction.category[0]) {
        const plaidCategory = transaction.category[0];
        // Map Plaid categories AND our custom categories to icons/colors
        const plaidMapping = {
            // Plaid categories
            'Food and Drink': { icon: 'fast-food', library: 'Ionicons', color: '#FF6B6B' },
            'Travel': { icon: 'airplane', library: 'Ionicons', color: '#FF9500' },
            'Shops': { icon: 'bag', library: 'Ionicons', color: '#FF2D92' },
            'Transfer': { icon: 'swap-horizontal-outline', library: 'Ionicons', color: '#007AFF' },
            'Payment': { icon: 'card', library: 'Ionicons', color: '#64D2FF' },
            'Recreation': { icon: 'game-controller', library: 'Ionicons', color: '#AF52DE' },
            'Service': { icon: 'pricetag', library: 'Ionicons', color: '#FF3B30' },
            'Bank Fees': { icon: 'pricetag', library: 'Ionicons', color: '#F44336' },
            // Our custom categories (for when backend sends these)
            'Groceries': { icon: 'cart-outline', library: 'Ionicons', color: '#34C759' },
            'Transfers': { icon: 'swap-horizontal-outline', library: 'Ionicons', color: '#007AFF' },
            'Restaurants': { icon: 'restaurant', library: 'Ionicons', color: '#FF6B6B' },
            'Transportation': { icon: 'bus', library: 'Ionicons', color: '#5C6BC0' },
            'Gas & Fuel': { icon: 'car', library: 'Ionicons', color: '#FF9500' },
            'Shopping': { icon: 'bag', library: 'Ionicons', color: '#FF2D92' },
            'Subscriptions': { icon: 'play-circle', library: 'Ionicons', color: '#5856D6' },
            'Entertainment': { icon: 'film', library: 'Ionicons', color: '#AF52DE' },
            'Health & Pharmacy': { icon: 'medical', library: 'Ionicons', color: '#00C7BE' },
            'Investments': { icon: 'trending-up', library: 'Ionicons', color: '#32ADE6' },
            'Alcohol & Bars': { icon: 'beer', library: 'Ionicons', color: '#BF5AF2' },
            'ATM': { icon: 'cash-outline', library: 'Ionicons', color: '#34C759' },
            'Income': { icon: 'cash', library: 'Ionicons', color: '#4CAF50' },
            'Fees & Charges': { icon: 'receipt-outline', library: 'Ionicons', color: '#FF3B30' },
            'Payments': { icon: 'card', library: 'Ionicons', color: '#64D2FF' },
        };

        // If it's a known Plaid category, return it with mapping or default
        return {
            category: plaidCategory,
            icon: plaidMapping[plaidCategory]?.icon || 'wallet',
            library: plaidMapping[plaidCategory]?.library || 'Ionicons',
            color: plaidMapping[plaidCategory]?.color || '#8E8E93'
        };
    }

    // Priority 3: Default to 'Other'
    return {
        category: 'Other',
        icon: 'wallet',
        library: 'Ionicons',
        color: '#8E8E93'
    };
};
