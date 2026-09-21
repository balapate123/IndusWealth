/**
 * Who a transaction is actually with.
 *
 * Banks decorate a merchant in half a dozen ways — `POS PIONEER #0421`,
 * `SPOTIFY *FAMILY`, `NETFLIX.COM`, `SOMEPLACE LTD` — and every one of those is
 * the same merchant as the plain form. Watchdog has needed this since it
 * shipped, in order to group charges, but the logic lived as a **method on the
 * WatchdogService class**, where nothing else could reach it and no test could
 * exercise it directly.
 *
 * Extracting it is what makes "apply this correction to every Pioneer
 * transaction" possible at all: that feature is only worth anything if
 * `PIONEER #0421` and `PIONEER #0388` resolve to the same merchant. Writing a
 * third merchant normaliser instead would repeat the mistake that put the same
 * keyword in two categories and gave one purchase two names.
 *
 * Pure. No pool, no clock.
 */

const merchantAliases = require('../data/merchant_aliases.json');

/**
 * The merchant behind a decorated statement string.
 *
 * Behaviour is unchanged from the Watchdog method this replaces, deliberately —
 * `recurring_expenses.merchant_name` is an upsert key, so a change here would
 * orphan every stored row.
 *
 * Note the return is **not** always uppercase: an aliased merchant comes back in
 * the alias table's own casing (`Netflix`), while an unaliased one keeps what the
 * bank sent (`TD AUTO FINANCE`). Deliberately not title-cased — `TD AUTO
 * FINANCE` becoming `Td Auto Finance` is worse, and no general rule gets
 * acronyms right. Use `merchantKeyFor` when you need something case-stable.
 */
function normalizeMerchantName(rawName) {
    if (!rawName) return null;

    let name = String(rawName).toUpperCase().trim();

    // Strip common suffixes
    name = name.replace(/(\.COM|\.CA|INC\.?|LLC|LTD|CORP|CO\.)$/g, '');

    // Strip transaction prefixes
    name = name.replace(/^(POS |PREAUTHORIZED |PAD |EFT |RECURRING |MONTHLY |ANNUAL )/g, '');

    // Strip trailing reference numbers. Four digits or more: three is as likely
    // to be part of the name as a branch code, and the safe direction of being
    // wrong is two merchants staying separate rather than a correction reaching
    // somewhere the user did not intend.
    name = name.replace(/\s*#?\d{4,}$/, '');

    // Strip trailing asterisks and codes (e.g., "SPOTIFY *FAMILY")
    name = name.replace(/\s*\*.*$/, '');

    name = name.trim();
    if (!name) return null;

    // Apply known merchant aliases
    return merchantAliases[name] || name;
}

/** The merchant string a transaction should be identified by, before cleaning. */
function rawMerchantOf(transaction) {
    if (!transaction) return null;
    // merchant_name is Plaid's cleaned field and is the better source when
    // present; name is the raw statement line and is all we have when it is not.
    return transaction.merchant_name || transaction.name || null;
}

/**
 * The stable key a merchant rule is stored under.
 *
 * Uppercased on top of normalisation, because `normalizeMerchantName` returns
 * the alias table's casing for aliased merchants and the bank's for everything
 * else. Storing that mixture would make `Netflix` and `NETFLIX` two different
 * rules depending on which row the user happened to correct.
 *
 * Null when there is no usable name — a rule keyed on null would match every
 * nameless transaction at once.
 */
function merchantKeyFor(transaction) {
    const normalized = normalizeMerchantName(rawMerchantOf(transaction));
    return normalized ? normalized.toUpperCase() : null;
}

/**
 * The merchant as a person should read it.
 *
 * `NETFLIX` is a key; `Netflix` is what belongs in "Also apply to all Netflix".
 * Stored alongside the rule rather than derived from the key on read, because
 * the key has already thrown away the casing and spacing worth showing.
 */
function merchantLabelFor(transaction) {
    return normalizeMerchantName(rawMerchantOf(transaction));
}

module.exports = {
    normalizeMerchantName,
    merchantKeyFor,
    merchantLabelFor,
    rawMerchantOf,
};
