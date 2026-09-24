/**
 * What "filtered" means on a transaction list, as data rather than as state
 * scattered across two screens.
 *
 * Pure — no expo or RN imports — so it is tested off-device like `goalPace.js`
 * and `transactionSelection.js`, and `today` is injected wherever a date
 * decision depends on it.
 *
 * ## The one rule that is not obvious
 *
 * **A custom date range suppresses `days`.** `days` is measured from the
 * server's CURRENT_DATE and the two clauses AND together, so "last 30 days"
 * plus a window in March is an empty list with no cause visible anywhere on
 * screen. `filterQueryParts` is the only place that decides this, and it has a
 * test, because the alternative is two screens each remembering to drop a
 * parameter.
 *
 * ## Why the draft is separate from the filters
 *
 * The sheet edits strings; the screen holds values. `normalizeDraft` is the
 * crossing, and it refuses rather than repairs: a minimum above the maximum is
 * not silently swapped, because swapping answers a different question than the
 * one that was asked and says nothing about having done so.
 */

export const DIRECTION = {
    ALL: 'all',
    OUT: 'out',
    IN: 'in',
};

/** No filter at all. The shape every screen starts from. */
export const EMPTY_FILTERS = Object.freeze({
    minAmount: null,
    maxAmount: null,
    startDate: null,
    endDate: null,
    direction: DIRECTION.ALL,
});

/** The sheet's own state: every field a string, because every field is typed. */
export const EMPTY_DRAFT = Object.freeze({
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: '',
    direction: DIRECTION.ALL,
});

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n) => String(n).padStart(2, '0');

/** A local Date rendered as YYYY-MM-DD, with no timezone round trip to lose a day. */
const isoDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * Is this a real calendar date, spelled exactly YYYY-MM-DD?
 *
 * Strict on both counts. `new Date('2026-02-30')` does not throw, it lands on
 * March 2nd — so a mistyped day would widen the window and there would be
 * nothing to notice. Mirrors `parseDate` in the backend's transaction_filters.
 */
export const isValidDateText = (text) => {
    if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
    const [year, month, day] = text.split('-').map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    return probe.getUTCFullYear() === year
        && probe.getUTCMonth() === month - 1
        && probe.getUTCDate() === day;
};

/**
 * Typed money → a number, `null` for empty, `NaN` for junk.
 *
 * Three outcomes rather than two: empty is "no bound", junk is "you typed
 * something I could not read", and conflating them would let a typo quietly
 * remove the filter the user thought they had set.
 */
export const parseAmountText = (text) => {
    const raw = String(text ?? '').trim().replace(/,/g, '');
    if (raw === '') return null;
    if (!AMOUNT_PATTERN.test(raw)) return NaN;
    return Number.parseFloat(raw);
};

/** Does this filter set pin down a window of dates? */
export const hasDateRange = (filters) => !!(filters?.startDate || filters?.endDate);

/**
 * How many filters are on, for the badge on the button.
 *
 * Amount counts once whether one bound is set or both, and so do the dates.
 * "2" over the funnel should mean two things were decided, not four fields
 * were filled — the badge is a reminder that the list is narrowed, not an
 * inventory.
 */
export const activeFilterCount = (filters) => {
    const f = { ...EMPTY_FILTERS, ...(filters || {}) };
    let count = 0;
    if (f.minAmount !== null || f.maxAmount !== null) count += 1;
    if (f.startDate || f.endDate) count += 1;
    if (f.direction && f.direction !== DIRECTION.ALL) count += 1;
    return count;
};

/**
 * The query-string fragments this filter contributes.
 *
 * `days` is passed in rather than stored, because it belongs to the screen's
 * preset control and only one screen has one. It is dropped whenever a custom
 * range is set — see the note at the top of the file.
 */
export const filterQueryParts = (filters, { days = null } = {}) => {
    const f = { ...EMPTY_FILTERS, ...(filters || {}) };
    const parts = [];

    if (days && !hasDateRange(f)) parts.push(`days=${days}`);
    if (f.startDate) parts.push(`start_date=${encodeURIComponent(f.startDate)}`);
    if (f.endDate) parts.push(`end_date=${encodeURIComponent(f.endDate)}`);
    if (f.minAmount !== null && f.minAmount !== undefined) parts.push(`min_amount=${f.minAmount}`);
    if (f.maxAmount !== null && f.maxAmount !== undefined) parts.push(`max_amount=${f.maxAmount}`);
    if (f.direction && f.direction !== DIRECTION.ALL) parts.push(`direction=${f.direction}`);

    return parts;
};

/**
 * Raw sheet text → the filters it means, plus what is wrong with it.
 *
 * `ok` gates the Apply button. The errors are per-field so the message sits
 * under the field that caused it, rather than as one summary that leaves the
 * reader hunting.
 */
export const normalizeDraft = (draft) => {
    const d = { ...EMPTY_DRAFT, ...(draft || {}) };
    const errors = {};

    const minAmount = parseAmountText(d.minAmount);
    const maxAmount = parseAmountText(d.maxAmount);
    if (Number.isNaN(minAmount)) errors.minAmount = 'Numbers only.';
    if (Number.isNaN(maxAmount)) errors.maxAmount = 'Numbers only.';

    if (!errors.minAmount && !errors.maxAmount
        && minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
        // Not swapped. Swapping answers a question nobody asked and does not
        // mention that it did.
        errors.amountRange = 'The minimum is above the maximum.';
    }

    const startText = String(d.startDate ?? '').trim();
    const endText = String(d.endDate ?? '').trim();
    const startDate = startText === '' ? null : (isValidDateText(startText) ? startText : NaN);
    const endDate = endText === '' ? null : (isValidDateText(endText) ? endText : NaN);
    if (Number.isNaN(startDate)) errors.startDate = 'Use YYYY-MM-DD.';
    if (Number.isNaN(endDate)) errors.endDate = 'Use YYYY-MM-DD.';

    if (!errors.startDate && !errors.endDate && startDate && endDate && startDate > endDate) {
        // String comparison is correct here and only here: ISO dates sort
        // lexically the same way they sort chronologically, which is the reason
        // the format is used at all.
        errors.dateRange = 'The start date is after the end date.';
    }

    const direction = Object.values(DIRECTION).includes(d.direction) ? d.direction : DIRECTION.ALL;

    return {
        ok: Object.keys(errors).length === 0,
        errors,
        filters: {
            minAmount: Number.isNaN(minAmount) ? null : minAmount,
            maxAmount: Number.isNaN(maxAmount) ? null : maxAmount,
            startDate: Number.isNaN(startDate) ? null : startDate,
            endDate: Number.isNaN(endDate) ? null : endDate,
            direction,
        },
    };
};

/** Filters → the draft that edits them, so reopening the sheet shows what is on. */
export const draftFromFilters = (filters) => {
    const f = { ...EMPTY_FILTERS, ...(filters || {}) };
    return {
        minAmount: f.minAmount === null || f.minAmount === undefined ? '' : String(f.minAmount),
        maxAmount: f.maxAmount === null || f.maxAmount === undefined ? '' : String(f.maxAmount),
        startDate: f.startDate || '',
        endDate: f.endDate || '',
        direction: f.direction || DIRECTION.ALL,
    };
};

/** The shortcuts, so nobody has to type a date for the common windows. */
export const PRESET_RANGES = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'last_3_months', label: 'Last 3 months' },
    { key: 'this_year', label: 'This year' },
];

/**
 * A named window as two ISO dates, on the user's own calendar.
 *
 * Built from local components rather than from UTC: "this month" means the
 * month it is where the reader is standing, and a UTC construction puts
 * somebody in Toronto into the previous month for five hours every evening.
 */
export const presetRange = (key, today = new Date()) => {
    const year = today.getFullYear();
    const month = today.getMonth();

    switch (key) {
        case 'this_month':
            return { startDate: isoDate(new Date(year, month, 1)), endDate: isoDate(today) };
        case 'last_month':
            return {
                startDate: isoDate(new Date(year, month - 1, 1)),
                // Day 0 of this month is the last day of the previous one, which
                // is also how it stays right in February.
                endDate: isoDate(new Date(year, month, 0)),
            };
        case 'last_3_months':
            return { startDate: isoDate(new Date(year, month - 2, 1)), endDate: isoDate(today) };
        case 'this_year':
            return { startDate: isoDate(new Date(year, 0, 1)), endDate: isoDate(today) };
        default:
            return { startDate: null, endDate: null };
    }
};

const money = (value) => `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})}`;

/** "Mar 1", or "Mar 1, 2025" once the year stops being the obvious one. */
const shortDate = (iso, today) => {
    // Noon, because UTC midnight renders as the previous day west of Greenwich —
    // the same guard every date on these screens already carries.
    const date = new Date(`${iso}T12:00:00`);
    const sameYear = date.getFullYear() === today.getFullYear();
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
};

/**
 * The filter as a sentence, or null when nothing is filtered.
 *
 * This carries more weight than it looks. An empty list under an amount filter
 * has to say *why* it is empty: a filter left on three days ago, with no
 * explanation on screen, reads as "my transactions are missing" — and this app
 * is one where that conclusion costs the reader real worry.
 */
export const describeFilters = (filters, { today = new Date() } = {}) => {
    const f = { ...EMPTY_FILTERS, ...(filters || {}) };
    const parts = [];

    if (f.minAmount !== null && f.maxAmount !== null) {
        parts.push(`${money(f.minAmount)}–${money(f.maxAmount)}`);
    } else if (f.minAmount !== null) {
        parts.push(`over ${money(f.minAmount)}`);
    } else if (f.maxAmount !== null) {
        parts.push(`under ${money(f.maxAmount)}`);
    }

    if (f.startDate && f.endDate) {
        parts.push(`${shortDate(f.startDate, today)} – ${shortDate(f.endDate, today)}`);
    } else if (f.startDate) {
        parts.push(`since ${shortDate(f.startDate, today)}`);
    } else if (f.endDate) {
        parts.push(`up to ${shortDate(f.endDate, today)}`);
    }

    if (f.direction === DIRECTION.OUT) parts.push('money out');
    else if (f.direction === DIRECTION.IN) parts.push('money in');

    return parts.length ? parts.join(' · ') : null;
};
