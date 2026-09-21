/**
 * Selecting transactions, and what the selection adds up to.
 *
 * Pure — no expo or RN imports — so the arithmetic and the copy are testable
 * off-device, like goalPace.js and treemap.js.
 *
 * **The count and the total always describe the same rows.** `summarizeSelection`
 * walks the visible list and only counts a row it is also adding up, so the
 * footer can never read "5 selected · $240" with the $240 covering four of them.
 * That is the same discipline as server-side totals on the transaction list and
 * a null rather than a zero on a disconnected goal: no figure without visible
 * working.
 *
 * Summing on the device is a deliberate exception to "totals come from
 * db.sumTransactions". That rule exists because the device holds one page and
 * cannot see the rest — but a selection *is* a set of rows somebody ticked in
 * the list, so every one of them is in memory by construction.
 * FlagTransactionPickerScreen already does this, for the same reason.
 */

/**
 * The most that can be selected at once.
 *
 * Matches MAX_BULK_TRANSACTIONS in the backend's category_corrections.js — a
 * screen that lets somebody select more than the endpoint accepts is a button
 * that fails at the end of the job. A test loads the server's value and
 * compares; asserting the number on this side alone would prove nothing.
 */
export const MAX_SELECTION = 200;

/** Cents, exactly. Guards the 0.1 + 0.2 case. */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Add or remove one id, as a new Set.
 *
 * New rather than mutated: React state has to change identity to re-render, and
 * mutating in place is the version of this bug where the total is right and the
 * screen never updates.
 */
export const toggleSelection = (selected, id) => {
    const next = new Set(selected || []);
    if (id === null || id === undefined) return next;
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
};

/**
 * What the selection comes to.
 *
 * `net` follows the app's sign convention — positive is money out — so a
 * selection holding a purchase and its refund reports what was actually spent.
 * That is also exactly what the flag's own screen will show for the same rows
 * if the selection becomes one, which matters because "Group" is one tap away.
 *
 * @param {{id: number, amount: number|string}[]} transactions  the visible list
 * @param {Set<number>} selected
 */
export const summarizeSelection = (transactions, selected) => {
    const empty = { count: 0, net: 0, hasInflow: false };
    if (!Array.isArray(transactions) || !selected || selected.size === 0) return empty;

    let count = 0;
    let net = 0;
    let hasInflow = false;

    for (const transaction of transactions) {
        if (!selected.has(transaction.id)) continue;
        // Amounts arrive as strings from the API and can be either shape in a
        // cached page. Number() here or "61.40" + "48.15" becomes "61.448.15".
        const amount = Number(transaction.amount) || 0;
        count += 1;
        net += amount;
        if (amount < 0) hasInflow = true;
    }

    return { count, net: round2(net), hasInflow };
};

/**
 * The total, as money.
 *
 * Cents kept, unlike a savings pace: this is an exact sum of real transactions
 * sitting directly above the rows it came from, and rounding would stop it
 * matching them.
 *
 * A negative net is money that came back, so it reads as a credit rather than
 * as minus money — "-$20.00" next to a list of purchases reads like an error.
 */
export const formatSelectionTotal = (net) => {
    const value = Number(net) || 0;
    const money = `$${Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
    return value < 0 ? `+${money}` : money;
};
