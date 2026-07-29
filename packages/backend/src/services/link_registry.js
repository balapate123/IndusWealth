/**
 * Link Registry
 *
 * Every outbound URL the app can hand a user comes from here.
 *
 * Why this exists: the insights prompt used to ask Gemini for "REAL, valid URLs",
 * which is the one thing a language model cannot do — it knows `canada.ca` exists
 * and invents the path. Validation was `new URL(str)`, which only proves the
 * string parses, and mobile called `Linking.canOpenURL`, which returns true for
 * any https:// on Android. A hallucinated 404 passed all three checks.
 *
 * So the model never writes a URL. It picks a `destination` key from the list
 * below, and the server resolves it. An invented key resolves to null and the
 * action is dropped — the failure mode is a missing button, not a dead link.
 */

// Landing and section pages, not deep article paths: a deep path is exactly what
// rots. Anything added here should be a URL a publisher would be embarrassed to
// break, and it must pass `verifyDestinations()` in scripts/verify-links.js.
const DESTINATIONS = {
    // --- Government of Canada / CRA ---
    cra_tfsa: {
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html',
        label: 'TFSA rules (CRA)',
        description: 'Official TFSA contribution room, rules and limits',
    },
    cra_rrsp: {
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-savings-plan-rrsp.html',
        label: 'RRSP rules (CRA)',
        description: 'Official RRSP deduction limits, deadlines and rules',
    },
    cra_fhsa: {
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html',
        label: 'FHSA rules (CRA)',
        description: 'Official First Home Savings Account limits and eligibility',
    },
    cra_my_account: {
        url: 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/account-individuals.html',
        label: 'CRA My Account',
        description: 'Sign in to check contribution room, notices of assessment and benefits',
    },
    cra_tax_rates: {
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
        label: 'Canadian tax rates',
        description: 'Current federal and provincial marginal income tax rates',
    },

    // --- Financial Consumer Agency of Canada (independent, no product bias) ---
    fcac_budget: {
        url: 'https://www.canada.ca/en/financial-consumer-agency/services/make-budget.html',
        label: 'Build a budget (FCAC)',
        description: 'Government budgeting guide and free budget planner tool',
    },
    fcac_credit_report: {
        url: 'https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score.html',
        label: 'Credit reports & scores (FCAC)',
        description: 'How credit scores work and how to get your report free',
    },
    fcac_debt: {
        url: 'https://www.canada.ca/en/financial-consumer-agency/services/debt.html',
        label: 'Managing debt (FCAC)',
        description: 'Government guidance on paying down and consolidating debt',
    },

    // --- Investor education (Ontario Securities Commission) ---
    gsam_investing: {
        url: 'https://www.getsmarteraboutmoney.ca/learning-path/getting-started/',
        label: 'Investing basics (OSC)',
        description: 'Ontario Securities Commission plain-language investing course',
    },

    // --- Rate comparison ---
    ratehub_savings: {
        url: 'https://www.ratehub.ca/savings-accounts',
        label: 'Compare savings rates',
        description: 'Current Canadian high-interest savings account rates',
    },
    ratehub_credit_cards: {
        url: 'https://www.ratehub.ca/credit-cards',
        label: 'Compare credit cards',
        description: 'Canadian credit card comparison including balance transfer offers',
    },

    // --- Education ---
    //
    // No brokerage or bank product pages live here. wealthsimple_invest,
    // questrade_home, eq_bank_savings and tangerine_savings were removed: an
    // insight generated from someone's own balances, ending in a button that
    // opens a provider's signup page, is product steering by an app that is not
    // a registered adviser. Rate comparison (ratehub_savings) stays, because a
    // comparison table is not a recommendation of any one provider.
    wealthsimple_learn: {
        url: 'https://www.wealthsimple.com/en-ca/learn',
        label: 'Wealthsimple Learn',
        description: 'Canadian personal finance and investing explainers',
    },
};

// Second net. Even a URL that never came from DESTINATIONS — a legacy cached
// article, a hand-written action — has to live on one of these domains.
// Matching is host === domain or host ends with "." + domain, so a lookalike
// like "canada.ca.evil.example" cannot pass.
const ALLOWED_HOSTS = [
    'canada.ca',
    'ratehub.ca',
    'wealthsimple.com',
    'equifax.ca',
    'transunion.ca',
    'moneysense.ca',
    'investopedia.com',
    'getsmarteraboutmoney.ca',
    'nerdwallet.com',
    'fool.ca',
];

/**
 * In-app routes an insight is allowed to send someone to.
 *
 * Deliberately limited to screens that need no params: an insight cannot know a
 * flag id or an account id, and `navigate('FlagDetail')` with no params crashes
 * the screen. Insights render on the Insights tab, so both sibling tab names and
 * root-stack names resolve from there.
 */
const APP_ROUTES = {
    Home: 'Dashboard',
    Wealth: 'Debt payoff planner',
    AnalyticsTab: 'Advanced category analytics',
    Profile: 'Profile and settings',
    AllTransactions: 'Full transaction list',
    AllAccounts: 'All connected accounts',
    Analytics: 'Spending analytics',
    AdvancedAnalytics: 'Advanced category analytics',
    WealthAcademy: 'Educational articles',
    ETFList: 'Canadian ETF list',
    Watchdog: 'Recurring expense watchdog',
    Flags: 'User-defined transaction flags',
    Goals: 'Savings goals and their progress',
    ConnectBank: 'Connect a bank account',
};

/**
 * Is this a URL we are willing to open on a user's device?
 * https only, no embedded credentials, host on the allowlist.
 */
function isAllowedUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'https:') return false;
    // "https://canada.ca@evil.example/" parses with host evil.example — reject
    // anything carrying userinfo rather than relying on readers to spot it.
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Resolve a destination key to its entry.
 * @returns {{key: string, url: string, label: string, description: string}|null}
 */
function resolveDestination(key) {
    if (typeof key !== 'string') return null;
    const entry = DESTINATIONS[key.trim().toLowerCase()];
    if (!entry) return null;
    return { key: key.trim().toLowerCase(), ...entry };
}

/**
 * The destination list as prompt text. Keys only — the model never sees a URL,
 * so it has nothing to copy, mangle or extrapolate from.
 */
function getDestinationsForPrompt() {
    return Object.entries(DESTINATIONS)
        .map(([key, entry]) => `- ${key}: ${entry.description}`)
        .join('\n');
}

function listDestinationKeys() {
    return Object.keys(DESTINATIONS);
}

/**
 * Resolve an in-app route name. Case-sensitive on purpose — these are React
 * Navigation route names and "allTransactions" is not a screen.
 */
function resolveRoute(route) {
    if (typeof route !== 'string') return null;
    const name = route.trim();
    return Object.prototype.hasOwnProperty.call(APP_ROUTES, name) ? name : null;
}

function getRoutesForPrompt() {
    return Object.entries(APP_ROUTES)
        .map(([name, description]) => `- ${name}: ${description}`)
        .join('\n');
}

module.exports = {
    DESTINATIONS,
    ALLOWED_HOSTS,
    APP_ROUTES,
    isAllowedUrl,
    resolveDestination,
    resolveRoute,
    getDestinationsForPrompt,
    getRoutesForPrompt,
    listDestinationKeys,
};
