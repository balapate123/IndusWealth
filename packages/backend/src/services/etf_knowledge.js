/**
 * ETF Knowledge Service
 * Loads and manages the Canadian ETF knowledge base for AI prompt injection
 * and the mobile Investment Corner feature.
 */

const path = require('path');
const fs = require('fs');

let etfData = null;

/**
 * Load ETF data from JSON file (cached in memory after first load)
 */
function _loadETFData() {
    if (etfData) return etfData;

    const filePath = process.env.ETF_DATA_PATH
        ? path.resolve(process.env.ETF_DATA_PATH)
        : path.join(__dirname, '..', 'data', 'canadian_etfs.json');

    const raw = fs.readFileSync(filePath, 'utf8');
    etfData = JSON.parse(raw);
    console.log(`Loaded ${etfData.etfs.length} Canadian ETFs (last updated: ${etfData.last_updated})`);
    return etfData;
}

/**
 * Get all ETFs
 */
function getAllETFs() {
    const data = _loadETFData();
    return data.etfs;
}

/**
 * Get a single ETF by ticker symbol
 * @param {string} ticker - e.g. "XEQT"
 * @returns {Object|null} ETF object or null
 */
function getETFByTicker(ticker) {
    const data = _loadETFData();
    return data.etfs.find(e => e.ticker.toUpperCase() === ticker.toUpperCase()) || null;
}

/**
 * Get ETFs matching a risk profile
 * @param {string} riskLevel - "conservative", "moderate", or "aggressive"
 * @returns {Object[]} Matching ETFs
 */
function getETFsByRiskProfile(riskLevel) {
    const data = _loadETFData();
    const profile = data.risk_profiles[riskLevel];
    if (!profile) return data.etfs;

    return data.etfs.filter(etf =>
        profile.suitable_categories.includes(etf.category)
    );
}

/**
 * Get ETFs by category
 * @param {string} category - e.g. "all_equity", "balanced", "fixed_income"
 * @returns {Object[]} Matching ETFs
 */
function getETFsByCategory(category) {
    const data = _loadETFData();
    return data.etfs.filter(etf => etf.category === category);
}

/**
 * Get recommended ETFs for a user based on their preferences
 * @param {Object} userPreferences - { investment_risk_tolerance, interested_in_investing, preferred_savings_account_type }
 * @returns {Object[]} 3-5 recommended ETFs
 */
function getRecommendedETFs(userPreferences) {
    const riskLevel = userPreferences?.investment_risk_tolerance || 'moderate';
    const matchingETFs = getETFsByRiskProfile(riskLevel);

    // Score and sort: prefer lower MER, higher 1yr return, matching risk tolerance
    const scored = matchingETFs.map(etf => {
        let score = 0;
        // Direct risk tolerance match
        if (etf.risk_tolerance_match.includes(riskLevel)) score += 10;
        // Favor low MER
        if (etf.mer_percent <= 0.25) score += 5;
        // Favor diversification (higher holdings count)
        if (etf.holdings_count > 1000) score += 3;
        // Favor all-in-one for simplicity
        if (etf.category === 'all_equity' || etf.category === 'balanced') score += 4;
        // Decent 1yr return
        if (etf.historical_returns.one_year_percent > 8) score += 2;
        return { ...etf, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);

    // Return top 5, removing internal score
    return scored.slice(0, 5).map(({ _score, ...etf }) => etf);
}

/**
 * Format ETF data for injection into the AI prompt
 * Produces a compact text representation filtered by risk level
 * @param {string} riskLevel - "conservative", "moderate", or "aggressive"
 * @returns {string} Formatted text for prompt injection
 */
function getETFDataForPrompt(riskLevel) {
    const data = _loadETFData();
    const profile = data.risk_profiles[riskLevel || 'moderate'];
    const relevantETFs = profile
        ? data.etfs.filter(etf => profile.suitable_categories.includes(etf.category) || etf.risk_tolerance_match.includes(riskLevel))
        : data.etfs;

    let output = `DATA DISCLAIMER: ${data.data_disclaimer}\n`;
    output += `Last updated: ${data.last_updated}\n\n`;

    if (profile) {
        output += `RISK PROFILE: ${riskLevel}\n`;
        output += `Recommended allocation: ${profile.recommended_allocation.equity}% equity / ${profile.recommended_allocation.fixed_income}% fixed income\n\n`;
    }

    output += 'RELEVANT CANADIAN ETFs:\n';
    relevantETFs.forEach(etf => {
        output += `- ${etf.ticker} (${etf.name}): MER ${etf.mer_percent}%, `;
        output += `Category: ${etf.category}, Risk: ${etf.risk_level}, `;
        output += `1yr: ${etf.historical_returns.one_year_percent}%, `;
        output += `5yr annualized: ${etf.historical_returns.five_year_annualized_percent}%, `;
        output += `Yield: ${etf.distribution_yield_percent}%, `;
        output += `${etf.description}\n`;
    });

    output += '\nCATEGORIES:\n';
    Object.entries(data.categories).forEach(([key, desc]) => {
        output += `- ${key}: ${desc}\n`;
    });

    return output;
}

/**
 * Search ETFs by text query (ticker or name)
 * @param {string} query - Search term
 * @returns {Object[]} Matching ETFs
 */
function searchETFs(query) {
    const data = _loadETFData();
    const q = query.toLowerCase();
    return data.etfs.filter(etf =>
        etf.ticker.toLowerCase().includes(q) ||
        etf.name.toLowerCase().includes(q) ||
        etf.category.toLowerCase().includes(q) ||
        etf.provider.toLowerCase().includes(q)
    );
}

/**
 * Get the last_updated date of the ETF data
 * @returns {string} ISO date string
 */
function getLastUpdated() {
    const data = _loadETFData();
    return data.last_updated;
}

/**
 * Get the data disclaimer text
 * @returns {string}
 */
function getDisclaimer() {
    const data = _loadETFData();
    return data.data_disclaimer;
}

module.exports = {
    getAllETFs,
    getETFByTicker,
    getETFsByRiskProfile,
    getETFsByCategory,
    getRecommendedETFs,
    getETFDataForPrompt,
    searchETFs,
    getLastUpdated,
    getDisclaimer,
};
