/**
 * The canonical category vocabulary.
 *
 * There used to be two. Our keyword patterns produced "Restaurants" and
 * "Entertainment"; whenever no keyword matched we fell through to Plaid and
 * emitted its raw top-level string verbatim — "Food and Drink", "Recreation".
 * Since every aggregate groups by whatever string categorizeTransaction
 * returned, one real-world category showed up as two rows, split on the
 * accident of whether a merchant happened to be in a keyword list.
 *
 * Plaid's legacy taxonomy is the only external vocabulary that reaches us
 * (`/transactions/get` returns `category` as a 1–3 level array). This module
 * folds it into ours, and ours is the one the UI, the AI prompts and the
 * analytics all speak.
 *
 * Mirrored on mobile in `packages/mobile/src/utils/categoryMap.js` — the two
 * must agree. `tests/category_map.test.js` in each package asserts the shared
 * vocabulary, so a name added to one and not the other fails a test rather than
 * silently reintroducing a duplicate.
 */

// The closed set. Anything not in here is not a category we speak.
const CANONICAL_CATEGORIES = [
    'Gas & Fuel',
    'Transportation',
    'Travel',
    'Groceries',
    'Restaurants',
    'Coffee & Snacks',
    'Alcohol & Bars',
    'Entertainment',
    'Subscriptions',
    'Shopping',
    'Personal Care',
    'Health & Pharmacy',
    'Fitness',
    'Education',
    'Insurance',
    'Investments',
    'Transfers',
    'Taxes & Government',
    'ATM',
    'Fees & Charges',
    'Bank Fees',
    'Payments',
    'Income',
    'Software & Tech',
    'Utilities',
];

const OTHER_CATEGORY = 'Other';

/**
 * Plaid legacy category path -> our name.
 *
 * Keys are the category array joined with ' > ' and lowercased. Lookup walks
 * from the most specific level to the least, so `Food and Drink > Restaurants >
 * Coffee Shop` resolves to Coffee & Snacks while a bare `Food and Drink`
 * resolves to Restaurants.
 *
 * Every one of Plaid's 13 legacy top-level categories has an entry. That is
 * what makes the 'Other' fallback unreachable for real Plaid data — an
 * unmapped subcategory still resolves via its parent.
 */
const PLAID_CATEGORY_MAP = {
    // ---- Bank Fees -------------------------------------------------------
    'bank fees': 'Bank Fees',
    'bank fees > overdraft': 'Bank Fees',
    'bank fees > insufficient funds': 'Bank Fees',
    'bank fees > excess activity': 'Bank Fees',
    'bank fees > account management': 'Bank Fees',
    'bank fees > atm': 'Fees & Charges',
    'bank fees > late payment': 'Fees & Charges',
    'bank fees > foreign transaction': 'Fees & Charges',
    'bank fees > wire transfer': 'Fees & Charges',
    'bank fees > cash advance': 'Fees & Charges',

    // ---- Cash Advance ----------------------------------------------------
    'cash advance': 'ATM',

    // ---- Community -------------------------------------------------------
    'community': OTHER_CATEGORY,
    'community > education': 'Education',
    'community > day care and preschools': 'Education',
    'community > libraries': 'Education',
    'community > government departments and agencies': 'Taxes & Government',
    'community > courts': 'Taxes & Government',
    'community > law enforcement': 'Taxes & Government',
    'community > post offices': 'Taxes & Government',
    'community > military': 'Taxes & Government',
    'community > medical': 'Health & Pharmacy',
    'community > senior citizen services': 'Health & Pharmacy',
    'community > assisted living services': 'Health & Pharmacy',
    'community > drug and alcohol services': 'Health & Pharmacy',

    // ---- Food and Drink --------------------------------------------------
    'food and drink': 'Restaurants',
    'food and drink > restaurants': 'Restaurants',
    'food and drink > restaurants > fast food': 'Restaurants',
    'food and drink > restaurants > pizza': 'Restaurants',
    'food and drink > restaurants > sushi': 'Restaurants',
    'food and drink > restaurants > burgers': 'Restaurants',
    'food and drink > restaurants > coffee shop': 'Coffee & Snacks',
    'food and drink > restaurants > cafe': 'Coffee & Snacks',
    'food and drink > restaurants > donuts': 'Coffee & Snacks',
    'food and drink > restaurants > ice cream': 'Coffee & Snacks',
    'food and drink > internet cafe': 'Coffee & Snacks',
    'food and drink > bar': 'Alcohol & Bars',
    'food and drink > nightlife': 'Alcohol & Bars',
    'food and drink > breweries': 'Alcohol & Bars',
    'food and drink > restaurants > bar': 'Alcohol & Bars',
    'food and drink > restaurants > breweries': 'Alcohol & Bars',
    'food and drink > restaurants > distilleries': 'Alcohol & Bars',
    'food and drink > restaurants > winery': 'Alcohol & Bars',
    'food and drink > groceries': 'Groceries',

    // ---- Healthcare ------------------------------------------------------
    'healthcare': 'Health & Pharmacy',
    'healthcare > physicians': 'Health & Pharmacy',
    'healthcare > pharmacies': 'Health & Pharmacy',
    'healthcare > dentists': 'Health & Pharmacy',
    'healthcare > optometrists': 'Health & Pharmacy',
    'healthcare > hospitals': 'Health & Pharmacy',
    'healthcare > counseling and mental health': 'Health & Pharmacy',

    // ---- Interest --------------------------------------------------------
    // Plaid's top-level "Interest" is interest *earned*, not interest charged.
    // Interest charged arrives as a Bank Fees subcategory or matches our
    // 'PURCHASE INTEREST' keyword.
    'interest': 'Income',
    'interest > interest earned': 'Income',
    'interest > dividend': 'Income',
    'interest > interest charged': 'Fees & Charges',

    // ---- Payment ---------------------------------------------------------
    'payment': 'Payments',
    'payment > credit card': 'Payments',
    'payment > loan': 'Payments',
    'payment > rent': 'Payments',

    // ---- Recreation ------------------------------------------------------
    'recreation': 'Entertainment',
    'recreation > arts and entertainment': 'Entertainment',
    'recreation > movie theatres': 'Entertainment',
    'recreation > music and show venues': 'Entertainment',
    'recreation > casinos and gaming': 'Entertainment',
    'recreation > museums': 'Entertainment',
    'recreation > zoo': 'Entertainment',
    'recreation > gyms and fitness centers': 'Fitness',
    'recreation > sports clubs': 'Fitness',
    'recreation > athletic fields': 'Fitness',
    'recreation > golf': 'Fitness',
    'recreation > swimming pool': 'Fitness',
    'recreation > campgrounds and rv parks': 'Travel',

    // ---- Service ---------------------------------------------------------
    // Plaid's grab bag. Each subcategory is placed on its own; the bare
    // top-level is genuinely unclassifiable and is the one honest 'Other'.
    'service': OTHER_CATEGORY,
    'service > subscription': 'Subscriptions',
    'service > cable': 'Utilities',
    'service > internet services': 'Utilities',
    'service > telecommunication services': 'Utilities',
    'service > utilities': 'Utilities',
    'service > utilities > electric': 'Utilities',
    'service > utilities > gas': 'Utilities',
    'service > utilities > water': 'Utilities',
    'service > utilities > heating oil': 'Utilities',
    'service > utilities > sanitary and waste management': 'Utilities',
    'service > insurance': 'Insurance',
    'service > personal care': 'Personal Care',
    'service > personal care > hair salons and barbers': 'Personal Care',
    'service > personal care > spas': 'Personal Care',
    'service > education': 'Education',
    'service > automotive': 'Transportation',
    'service > automotive > car wash and detail': 'Transportation',
    'service > automotive > parking': 'Transportation',
    'service > automotive > towing': 'Transportation',
    'service > computers': 'Software & Tech',
    'service > software development': 'Software & Tech',
    'service > web design': 'Software & Tech',
    'service > financial': 'Fees & Charges',
    'service > financial > accounting and bookkeeping': 'Fees & Charges',
    'service > financial > banking and finance': 'Fees & Charges',
    'service > financial > collections': 'Fees & Charges',
    'service > financial > taxes': 'Taxes & Government',
    'service > legal': 'Fees & Charges',
    'service > entertainment': 'Entertainment',
    'service > food and beverage': 'Restaurants',
    'service > healthcare': 'Health & Pharmacy',
    'service > home improvement': 'Shopping',
    'service > household': 'Shopping',
    'service > laundry and garment services': 'Personal Care',
    'service > storage': 'Shopping',
    'service > shipping and freight': 'Shopping',
    'service > advertising and marketing': OTHER_CATEGORY,
    'service > business services': OTHER_CATEGORY,
    'service > employment agencies': 'Income',
    'service > real estate': 'Payments',
    'service > repair services': 'Shopping',

    // ---- Shops -----------------------------------------------------------
    'shops': 'Shopping',
    'shops > supermarkets and groceries': 'Groceries',
    'shops > food and beverage store': 'Groceries',
    'shops > convenience stores': 'Groceries',
    'shops > warehouses and wholesale stores': 'Groceries',
    'shops > beer, wine and spirits': 'Alcohol & Bars',
    'shops > pharmacies': 'Health & Pharmacy',
    'shops > gas stations': 'Gas & Fuel',
    'shops > automotive': 'Transportation',
    'shops > computers and electronics': 'Software & Tech',
    'shops > digital purchase': 'Software & Tech',
    'shops > electronics': 'Software & Tech',
    'shops > beauty products': 'Personal Care',
    'shops > cosmetics': 'Personal Care',
    'shops > sporting goods': 'Fitness',
    'shops > bookstores': 'Education',
    'shops > clothing and accessories': 'Shopping',
    'shops > department stores': 'Shopping',
    'shops > discount stores': 'Shopping',
    'shops > furniture and home decor': 'Shopping',
    'shops > hardware store': 'Shopping',

    // ---- Tax -------------------------------------------------------------
    'tax': 'Taxes & Government',
    'tax > income tax': 'Taxes & Government',
    'tax > property tax': 'Taxes & Government',

    // ---- Transfer --------------------------------------------------------
    'transfer': 'Transfers',
    'transfer > credit': 'Transfers',
    'transfer > debit': 'Transfers',
    'transfer > internal account transfer': 'Transfers',
    'transfer > third party': 'Transfers',
    'transfer > wire': 'Transfers',
    'transfer > check': 'Transfers',
    'transfer > billpay': 'Payments',
    'transfer > deposit': 'Income',
    'transfer > payroll': 'Income',
    'transfer > keep the change savings program': 'Investments',
    'transfer > save as you go': 'Investments',
    'transfer > investment': 'Investments',
    'transfer > withdrawal': 'ATM',
    'transfer > withdrawal > atm': 'ATM',
    'transfer > atm': 'ATM',

    // ---- Travel ----------------------------------------------------------
    // Plaid files ride-hailing and transit under Travel; a daily Uber is
    // commuting, not a holiday, so those land in Transportation.
    'travel': 'Travel',
    'travel > airlines and aviation services': 'Travel',
    'travel > lodging': 'Travel',
    'travel > hotels': 'Travel',
    'travel > car and truck rentals': 'Travel',
    'travel > cruises': 'Travel',
    'travel > travel agents and tour operators': 'Travel',
    'travel > taxi': 'Transportation',
    'travel > rideshare': 'Transportation',
    'travel > ride share': 'Transportation',
    'travel > public transportation services': 'Transportation',
    'travel > transportation centers': 'Transportation',
    'travel > parking': 'Transportation',
    'travel > tolls and fees': 'Transportation',
    'travel > gas stations': 'Gas & Fuel',
    'travel > boat': 'Travel',
};

// Case-insensitive lookup of an already-canonical name.
const CANONICAL_BY_LOWER = new Map(
    CANONICAL_CATEGORIES.map((name) => [name.toLowerCase(), name])
);

/**
 * Fold any category value into the canonical vocabulary.
 *
 * Accepts what the DB stores (Plaid's `text[]`), a single string, or a name we
 * assigned ourselves — analytics writes `[categoryInfo.category]` back onto the
 * transaction before re-reading it, so our own names must round-trip unchanged.
 *
 * @param {string[]|string|null|undefined} category
 * @returns {string} a member of CANONICAL_CATEGORIES, or 'Other'
 */
const canonicalizeCategory = (category) => {
    if (!category) return OTHER_CATEGORY;

    const levels = (Array.isArray(category) ? category : [category])
        .filter((level) => typeof level === 'string' && level.trim())
        .map((level) => level.trim());

    if (levels.length === 0) return OTHER_CATEGORY;

    // Most specific level first: 'a > b > c', then 'a > b', then 'a'.
    for (let depth = levels.length; depth > 0; depth--) {
        const path = levels.slice(0, depth).join(' > ').toLowerCase();
        const mapped = PLAID_CATEGORY_MAP[path];
        if (mapped) return mapped;
    }

    // Not a Plaid path — it may already be one of ours.
    const own = CANONICAL_BY_LOWER.get(levels[0].toLowerCase());
    if (own) return own;

    return OTHER_CATEGORY;
};

/**
 * Collapse rows grouped on a raw Plaid category path into canonical buckets.
 *
 * The merge has to happen here rather than in SQL because an `ORDER BY ...
 * LIMIT n` in the query slices the *raw* vocabulary: "Food and Drink" and
 * "Restaurants" could each rank 8th and both fall outside a top-6, even though
 * their sum belongs 2nd. Group without a limit, merge, then slice.
 *
 * @param {Array<Object>} rows      each carrying `pathKey` plus numeric fields
 * @param {Object}   options
 * @param {string}   options.pathKey    column holding the ' > '-joined path
 * @param {string[]} options.sumFields  numeric fields to add up
 * @returns {Array<Object>} `{ category, ...sums }`, descending by the first sum
 */
const mergeCanonicalRows = (rows, { pathKey = 'category_path', sumFields = [] } = {}) => {
    const buckets = new Map();

    for (const row of rows || []) {
        const path = row[pathKey];
        const category = canonicalizeCategory(
            typeof path === 'string' && path.includes(' > ') ? path.split(' > ') : path
        );

        let bucket = buckets.get(category);
        if (!bucket) {
            bucket = { category };
            for (const field of sumFields) bucket[field] = 0;
            buckets.set(category, bucket);
        }
        for (const field of sumFields) {
            bucket[field] += parseFloat(row[field]) || 0;
        }
    }

    const [primary] = sumFields;
    return Array.from(buckets.values()).sort((a, b) =>
        primary ? b[primary] - a[primary] : 0
    );
};

module.exports = {
    CANONICAL_CATEGORIES,
    OTHER_CATEGORY,
    PLAID_CATEGORY_MAP,
    canonicalizeCategory,
    mergeCanonicalRows,
};
