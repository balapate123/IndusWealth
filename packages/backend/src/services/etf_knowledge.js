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

// getRecommendedETFs() lived here. It scored the catalogue against the user's
// stored risk tolerance and returned a personalized top five — a securities
// recommendation, which this app is not registered to make. Removed rather than
// softened: there is no wording that makes a ranked list of funds chosen for
// one person's risk profile into education.

// getETFDataForPrompt() lived here. It fed the whole ticker list, filtered by
// the user's risk profile and headed by a recommended equity/fixed-income
// split, straight into the insights prompt — which is how the model came to be
// naming funds at people. The model is no longer given securities to name.

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
    searchETFs,
    getLastUpdated,
    getDisclaimer,
};
