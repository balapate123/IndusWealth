/**
 * Transaction Categorization Utility
 * 
 * Provides pattern-based categorization when Plaid doesn't return categories.
 * Priority: Plaid category > Pattern matching > 'Other'
 */

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
        keywords: ['CINEPLEX', 'FAMOUS PLAYER', 'RESIDENT ADVISOR', 'THEATRE', 'CONCERT', 'TICKETMASTER', 'MOVIES'],
        icon: 'film-outline',
        color: '#AF52DE'
    },
    'Subscriptions': {
        keywords: ['NETFLIX', 'SPOTIFY', 'AUDIBLE', 'DISNEY+', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE', 'CRAVE', 'XBOX GAME', 'MICROSOFT*XBOX'],
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
 * Categorize a transaction based on Plaid category or pattern matching
 * @param {Object} transaction - Transaction object with name, category fields
 * @returns {Object} - { category: string, icon: string, color: string }
 */
const categorizeTransaction = (transaction) => {
    // Priority 1: Use Plaid category if available
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
            color: plaidMapping[plaidCategory]?.color || '#8E8E93'
        };
    }

    // Priority 2: Pattern matching on transaction name
    const name = (transaction.name || '').toUpperCase();
    const merchantName = (transaction.merchant_name || '').toUpperCase();
    const searchText = `${name} ${merchantName}`;

    for (const [categoryName, config] of Object.entries(CATEGORY_PATTERNS)) {
        for (const keyword of config.keywords) {
            if (searchText.includes(keyword.toUpperCase())) {
                return {
                    category: categoryName,
                    icon: config.icon,
                    color: config.color
                };
            }
        }
    }

    // Priority 3: Default to 'Other'
    return {
        category: 'Other',
        icon: 'ellipse-outline',
        color: '#8E8E93'
    };
};

/**
 * Get category spending breakdown
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} - Category spending summary
 */
const getCategoryBreakdown = (transactions) => {
    const breakdown = {};

    transactions.forEach(tx => {
        // Only count expenses (positive amounts after Plaid inversion)
        const amount = Math.abs(parseFloat(tx.amount));
        if (tx.amount <= 0) return; // Skip income

        const { category, icon, color } = categorizeTransaction(tx);

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
    });

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
    getCategoryBreakdown
};
