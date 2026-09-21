/**
 * Correcting a category, and remembering the correction.
 *
 * Two scopes. One transaction — a grocery run that happened to be at a gas
 * station — and one merchant, past and future, which is what people actually
 * want when a whole merchant is filed wrong.
 *
 * A merchant rule is **materialised**: creating one writes `user_category` onto
 * every matching row now, and `upsertTransactions` applies it to new rows as
 * they arrive. That is what lets the SQL aggregates read one column with no
 * join — see `effectiveCategory` in category_map.js, which is the only place a
 * category is decided.
 *
 * `matchingTransactionIds` is pure and is where the risk lives: getting it
 * wrong is silent in both directions. Too narrow and a correction quietly
 * misses half the fill-ups; too wide and it rewrites a merchant the user never
 * touched.
 */

const db = require('./db');
const { merchantKeyFor, merchantLabelFor } = require('./merchant_identity');
const { isCanonicalCategory } = require('./category_map');

/**
 * Cap on a single bulk correction.
 *
 * The ids come from the device, so this bounds what one request can rewrite.
 * Well above any selection somebody can make by tapping, well below "the whole
 * account by accident".
 */
const MAX_BULK_TRANSACTIONS = 200;

/**
 * Which of these transactions belong to one merchant.
 *
 * Keys are compared **whole**, after normalisation. Substring matching is the
 * tempting shortcut and it is wrong in a way nobody would notice for months:
 * correcting `BELL` would drag in `BELL MEDIA`, `CAMPBELLS` and `TACO BELL`.
 *
 * Pure. The caller supplies the rows.
 *
 * @param {{id: number, name?: string, merchant_name?: string}[]} rows
 * @param {string|null} merchantKey  from merchantKeyFor
 * @returns {number[]}
 */
function matchingTransactionIds(rows, merchantKey) {
    if (!Array.isArray(rows) || !merchantKey) return [];

    const target = String(merchantKey).trim().toUpperCase();
    if (!target) return [];

    const ids = [];
    for (const row of rows) {
        // Null never matches null here: merchantKeyFor returns null for a row
        // with no usable name, and one correction sweeping up every nameless
        // transaction at once is not a thing anybody asked for.
        const key = merchantKeyFor(row);
        if (key && key === target) ids.push(row.id);
    }
    return ids;
}

// ---------------------------------------------------------------------------
// Orchestration. Everything below touches the database.
// ---------------------------------------------------------------------------

/**
 * Correct one transaction, optionally every transaction from its merchant.
 *
 * Returns what happened, including how many *other* rows moved, so the screen
 * can say "and 23 other Pioneer transactions" rather than claiming a number it
 * does not have.
 */
async function correctTransaction(userId, transactionId, category, { applyToMerchant = false } = {}) {
    if (!isCanonicalCategory(category)) return { ok: false, reason: 'unknown_category' };

    const transaction = await db.getTransactionForCategory(userId, transactionId);
    // Scoped to the user by the query, so a foreign id is simply not found.
    if (!transaction) return { ok: false, reason: 'not_found' };

    if (!applyToMerchant) {
        const changed = await db.setTransactionCategory(userId, transactionId, category);
        return { ok: changed, alsoChanged: 0, rule: null };
    }

    const merchantKey = merchantKeyFor(transaction);
    const merchantLabel = merchantLabelFor(transaction);
    if (!merchantKey) {
        // Nothing to key a rule on. Correct the one row rather than failing:
        // the user asked for this transaction to change and it still can.
        const changed = await db.setTransactionCategory(userId, transactionId, category);
        return { ok: changed, alsoChanged: 0, rule: null, reason: 'no_merchant' };
    }

    const rule = await db.upsertMerchantCategoryRule(userId, { merchantKey, merchantLabel, category });

    const rows = await db.getMerchantIdentityRows(userId);
    const ids = matchingTransactionIds(rows, merchantKey);
    // The opened transaction is in `ids` by construction, so this one statement
    // covers it too -- no separate write that could succeed while the bulk one
    // failed and leave the screen disagreeing with the rest of the app.
    const changed = await db.applyCategoryToIds(userId, ids, category);

    return {
        ok: true,
        // What moved *besides* the one they were looking at. Reported as the
        // count of rows actually written, not the count matched: a row already
        // carrying this category did not move, and saying it did would be a
        // number we cannot show our working for.
        alsoChanged: Math.max(0, changed - 1),
        matched: ids.length,
        rule,
    };
}

/** Correct a selection. Never creates a rule — see the route for why. */
async function correctTransactions(userId, transactionIds, category) {
    if (!isCanonicalCategory(category)) return { ok: false, reason: 'unknown_category' };

    const ids = [...new Set((transactionIds || []).map(Number).filter(Number.isInteger))];
    if (ids.length === 0) return { ok: false, reason: 'no_transactions' };
    if (ids.length > MAX_BULK_TRANSACTIONS) return { ok: false, reason: 'too_many' };

    const changed = await db.setTransactionCategories(userId, ids, category);
    return { ok: true, changed };
}

/**
 * Put a transaction back to its derived category.
 *
 * When a merchant rule covers it, the rule goes too — and with it the
 * correction on every row the rule had written. Anything less would leave a
 * rule that keeps re-applying to a merchant the user has just told us to stop
 * correcting, which reads as the undo not having worked.
 */
async function revertTransaction(userId, transactionId) {
    const transaction = await db.getTransactionForCategory(userId, transactionId);
    if (!transaction) return { ok: false, reason: 'not_found' };

    const merchantKey = merchantKeyFor(transaction);
    const rules = merchantKey ? await db.getMerchantCategoryRules(userId) : [];
    const rule = rules.find((r) => r.merchant_key === merchantKey) || null;

    if (!rule) {
        const changed = await db.clearTransactionCategory(userId, transactionId);
        return { ok: changed, alsoChanged: 0, removedRule: null };
    }

    await db.deleteMerchantCategoryRule(userId, merchantKey);
    const rows = await db.getMerchantIdentityRows(userId);
    const ids = matchingTransactionIds(rows, merchantKey);
    const changed = await db.clearCategoryForIds(userId, ids);

    return {
        ok: true,
        alsoChanged: Math.max(0, changed - 1),
        removedRule: { merchantLabel: rule.merchant_label, category: rule.category },
    };
}

module.exports = {
    MAX_BULK_TRANSACTIONS,
    matchingTransactionIds,
    correctTransaction,
    correctTransactions,
    revertTransaction,
};
