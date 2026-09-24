/**
 * Turning a query string into the filter `buildTransactionFilter` understands.
 *
 * **Pure** — no pool, no request object — so every parsing rule below is an
 * assertion rather than something you have to send an HTTP request to find out.
 * The route used to do this inline, which meant the only way to ask "what does
 * `min_amount=abc` do?" was to run the server and look.
 *
 * ## The rule the whole module follows
 *
 * **Junk is `null`, and `null` means "do not filter on this".** Never a throw,
 * and — more importantly — never a default that *narrows* the query. A caller
 * who typos a date should see everything, not an empty list they then blame on
 * missing data. Every parser here returns null on anything it does not fully
 * recognise.
 *
 * The corollary is that nothing here is lenient. `Number.parseFloat('12abc')`
 * is 12, and a filter of "over $12" produced by a typo is a wrong answer with
 * no visible seam — the defect class this codebase keeps finding. So the
 * numeric and date parsers match a full pattern or give up.
 *
 * ## Why arrays are rejected explicitly
 *
 * Express turns a repeated parameter into an array: `?min_amount=1&min_amount=2`
 * arrives as `['1','2']`. `String(['1','2'])` is `'1,2'`, and stripping the
 * thousands separator turns that into `12`. Every parser therefore checks the
 * type before it looks at the value.
 */

/** Matches the history Plaid is asked for at link time. */
const MAX_DAYS = 730;

/**
 * A sanity ceiling on an amount bound, not a claim about anybody's balance.
 * It exists so a pasted account number cannot become a bind parameter that
 * overflows the column's numeric range.
 */
const MAX_AMOUNT = 1e9;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

const DIRECTIONS = new Set(['in', 'out']);

/**
 * Parse a query param as a bounded integer, falling back when absent or junk.
 *
 * Shared with the route, which uses it for `limit` and `offset` — paging rather
 * than filtering, but the same "junk must not become a number" rule.
 */
const clampInt = (value, fallback, min, max) => {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    if (value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

/**
 * A money bound, as a non-negative number.
 *
 * Compared against `ABS(t.amount)` downstream, so a negative bound is
 * meaningless rather than merely unusual — it is rejected rather than clamped
 * to zero, because "at least -5" is not a question anybody asked.
 */
const parseAmount = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim().replace(/,/g, '');
    if (!AMOUNT_PATTERN.test(text)) return null;
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(parsed, MAX_AMOUNT);
};

/**
 * A calendar date as `YYYY-MM-DD`, or null.
 *
 * The round-trip through UTC is the point. `new Date('2026-02-30')` does not
 * throw — it lands on March 2nd, so a fat-fingered day would silently widen the
 * window by two days and there would be nothing on screen to notice. Building
 * the date and checking the components come back unchanged is what makes an
 * impossible date an impossible date.
 *
 * UTC rather than local: this is compared to a DATE column, which has no
 * timezone, and `new Date(y, m, d)` in local time is the shape that made every
 * goal report "too early to tell" forever.
 */
const parseDate = (value) => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!DATE_PATTERN.test(text)) return null;

    const [year, month, day] = text.split('-').map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year) return null;
    if (probe.getUTCMonth() !== month - 1) return null;
    if (probe.getUTCDate() !== day) return null;

    return text;
};

/** 'in' (money arriving) or 'out' (money leaving), or null for both. */
const parseDirection = (value) => (
    typeof value === 'string' && DIRECTIONS.has(value) ? value : null
);

/**
 * Everything `buildTransactionFilter` takes, read off `req.query`.
 *
 * `limit` and `offset` are deliberately absent: they are paging, and mixing
 * them in here would let a future caller pass this object somewhere that counts
 * rows and quietly get a page instead of a total.
 *
 * @param {object} query  req.query
 */
const parseTransactionFilters = (query = {}) => ({
    accountId: typeof query.account_id === 'string' ? query.account_id : undefined,
    days: clampInt(query.days, null, 1, MAX_DAYS),
    search: (typeof query.search === 'string' ? query.search.trim() : '') || null,
    // 'none' is the untagged set — "what have I not sorted yet" — and is the
    // one non-numeric value the flag filter accepts.
    flagId: query.flag_id === 'none'
        ? 'none'
        : clampInt(query.flag_id, null, 1, Number.MAX_SAFE_INTEGER),
    minAmount: parseAmount(query.min_amount),
    maxAmount: parseAmount(query.max_amount),
    startDate: parseDate(query.start_date),
    endDate: parseDate(query.end_date),
    direction: parseDirection(query.direction),
});

module.exports = {
    parseTransactionFilters,
    clampInt,
    parseAmount,
    parseDate,
    parseDirection,
    MAX_DAYS,
    MAX_AMOUNT,
};
