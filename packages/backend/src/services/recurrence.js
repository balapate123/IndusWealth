/**
 * Recurrence detection — pure.
 *
 * Split out of services/watchdog.js, which opens a pg pool on require and so
 * cannot be exercised without a database. Everything here is a function of its
 * arguments, which is what lets tests/recurrence.test.js assert the rules
 * directly. Same reasoning as services/nudges.js and utils/treemap.js.
 *
 * The question this module asks is "is this a fixed obligation?", not "does this
 * merchant recur?". The second question describes a habit as well as it
 * describes a commitment, which is why a gas station and a hardware store used
 * to appear on the Watchdog screen as subscriptions.
 *
 * Every rule below is stated as user-facing copy in
 * docs/superpowers/specs/2026-08-19-watchdog-rebuild-copy.md section 12. If a
 * rule changes, that sentence changes with it.
 */

/**
 * Minimum charges before we will call something recurring.
 *
 * Two charges give one interval, and a single interval has a standard deviation
 * of zero by definition — so the old scorer rated the weakest possible evidence
 * as maximally consistent. The copy says it plainly: twice could be a
 * coincidence.
 */
const MIN_CHARGES = 3;

const EXPENSE_CLASSES = {
    SUBSCRIPTION: 'subscription',
    BILL: 'bill',
    FIXED: 'fixed',
};

/**
 * Classes exempt from the amount-stability gate.
 *
 * Both require *positive* identification — a known merchant category or a Plaid
 * category that names the commitment. Nothing reaches them by having unstable
 * amounts, or every gas station would walk back in through the exemption.
 */
const VARIABLE_AMOUNT_CLASSES = new Set([EXPENSE_CLASSES.BILL, EXPENSE_CLASSES.FIXED]);

/** Merchant categories (from merchant_categories.json) that bill as utilities. */
const BILL_MERCHANT_CATEGORIES = new Set(['Telecom', 'Utilities', 'Insurance']);

/** Fraction of adjacent charges that must match for a subscription to qualify. */
const SAME_AMOUNT_THRESHOLD = 0.5;

/** How far the day of the month may wander before the schedule is not monthly. */
const DAY_OF_MONTH_TOLERANCE = 3;

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Date helpers — UTC throughout, because 'YYYY-MM-DD' parsed as local time
// shifts a day either side of midnight depending on where the server runs.
// ---------------------------------------------------------------------------

function parseDate(value) {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
    return Math.round(Math.abs(parseDate(b) - parseDate(a)) / 86400000);
}

function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add months, clamping the day so the 31st does not roll into March. */
function addMonths(date, count, anchorDay) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + count;
    const target = new Date(Date.UTC(year, month, 1));
    const day = Math.min(
        anchorDay || date.getUTCDate(),
        daysInMonth(target.getUTCFullYear(), target.getUTCMonth())
    );
    return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ordinal(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}

// ---------------------------------------------------------------------------
// Gate 2 — amount stability
// ---------------------------------------------------------------------------

/**
 * Fraction of adjacent charges that bill the same amount, 0..1.
 *
 * Deliberately *not* "are all the amounts close together". A subscription that
 * raises its price steps from one stable run to another — Netflix at $13.99,
 * $13.99, $16.49, $16.49 — and a spread-based test would throw that row away.
 * It is the row we most want, because the price-increase alert fires from it.
 *
 * Adjacent-pair equality captures the shape that actually matters: a commitment
 * bills the same number repeatedly. A habit never bills the same number twice.
 */
function sameAmountRatio(amounts) {
    const values = amounts.map(Number).filter((n) => Number.isFinite(n));
    if (values.length < 2) return 1;

    let equal = 0;
    for (let i = 1; i < values.length; i++) {
        const a = values[i - 1];
        const b = values[i];
        const tolerance = Math.max(0.01, Math.abs(a) * 0.005);
        if (Math.abs(a - b) <= tolerance) equal++;
    }
    return equal / (values.length - 1);
}

// ---------------------------------------------------------------------------
// Gate 3 — the calendar, not the interval
// ---------------------------------------------------------------------------

/**
 * Does this land on the same day of the month each time?
 *
 * The old code asked whether the average gap fell between 25 and 35 days, which
 * treats February as noise and treats "every 7 days" as a strong signal when it
 * is the weakest one available.
 */
function dayOfMonthConsistent(dates) {
    const days = dates.map((d) => parseDate(d).getUTCDate());

    // Month-end anchoring: a payment on the 31st bills on the 28th in February.
    // The day changes, the anchor does not.
    if (days.every((d) => d >= 27)) return true;

    return Math.max(...days) - Math.min(...days) <= DAY_OF_MONTH_TOLERANCE;
}

/** The day of the month a monthly charge is anchored to. */
function anchorDay(dates) {
    return Math.round(median(dates.map((d) => parseDate(d).getUTCDate())));
}

/**
 * Classify a schedule from its dates.
 *
 * There is no 'weekly'. The old band returned 'weekly' for any average interval
 * from 0 to 10 days, which is the direct cause of the reported bug — any
 * merchant visited twice inside a week and a half became a subscription. True
 * weekly consumer subscriptions are rare enough that the false-positive cost is
 * not worth paying; a weekly charge simply will not be detected, which is the
 * honest failure of the two.
 */
function classifyFrequency(dates) {
    if (!Array.isArray(dates) || dates.length < MIN_CHARGES) return 'irregular';

    const sorted = [...dates].sort();
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
        intervals.push(daysBetween(sorted[i - 1], sorted[i]));
    }

    const typical = median(intervals);

    if (typical >= 12 && typical <= 16) return 'bi-weekly';
    if (typical >= 26 && typical <= 35 && dayOfMonthConsistent(sorted)) return 'monthly';
    if (typical >= 85 && typical <= 95 && dayOfMonthConsistent(sorted)) return 'quarterly';
    if (typical >= 175 && typical <= 190) return 'semi-annual';
    if (typical >= 350 && typical <= 380) return 'annual';

    return 'irregular';
}

// ---------------------------------------------------------------------------
// Classes — "You can cancel these / lower these / plan around them"
// ---------------------------------------------------------------------------

/**
 * Which of the three sections this belongs in.
 *
 * Plaid's category is authoritative for fixed commitments. watchdog.js used to
 * list 'Payment' and 'Loan' in EXCLUDED_CATEGORIES, which filtered out exactly
 * the obligations the feature was asked to surface.
 */
function classifyExpense(plaidCategory, merchantCategory) {
    const path = (Array.isArray(plaidCategory) ? plaidCategory : [])
        .filter(Boolean)
        .map((part) => String(part).toLowerCase());
    const joined = path.join(' > ');

    const isFixed = path.includes('loan')
        || path.includes('rent')
        || path.includes('mortgage')
        || joined.includes('loan')
        || joined.includes('mortgage');
    if (isFixed) return EXPENSE_CLASSES.FIXED;

    if (BILL_MERCHANT_CATEGORIES.has(merchantCategory)) return EXPENSE_CLASSES.BILL;
    if (path.includes('insurance') || path.includes('utilities')) return EXPENSE_CLASSES.BILL;

    return EXPENSE_CLASSES.SUBSCRIPTION;
}

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------

/**
 * Decide whether a merchant's charges are a recurring obligation.
 *
 * Gates run in this order, and the order is deliberate: `reason` is what the
 * "why isn't X in my list" article explains, so the first failure reported
 * should be the most informative one. Amount instability is checked before the
 * schedule because it is the property that actually distinguishes a commitment.
 */
function analyzeRecurrence(transactions, options = {}) {
    const { merchantCategory = null } = options;

    const sorted = [...(transactions || [])]
        .filter((t) => t && t.date)
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));

    if (sorted.length < MIN_CHARGES) {
        return { isRecurring: false, reason: 'too_few_charges', occurrences: sorted.length };
    }

    const dates = sorted.map((t) => String(t.date).slice(0, 10));
    const amounts = sorted.map((t) => Number(t.amount));

    // The class decides which gates apply, so it is settled first.
    const plaidCategory = sorted[sorted.length - 1].category;
    const expenseClass = classifyExpense(plaidCategory, merchantCategory);

    const ratio = sameAmountRatio(amounts);
    const amountExempt = VARIABLE_AMOUNT_CLASSES.has(expenseClass);
    if (!amountExempt && ratio < SAME_AMOUNT_THRESHOLD) {
        return { isRecurring: false, reason: 'amount_varies', occurrences: sorted.length };
    }

    const frequency = classifyFrequency(dates);
    if (frequency === 'irregular') {
        return { isRecurring: false, reason: 'irregular_schedule', occurrences: sorted.length };
    }

    const day = anchorDay(dates);
    const daySpread = Math.max(...dates.map((d) => parseDate(d).getUTCDate()))
        - Math.min(...dates.map((d) => parseDate(d).getUTCDate()));

    // Confidence still exists, but it now gates rather than decorates: 'low'
    // never reaches this point, because anything that would earn it has already
    // been rejected by a gate above.
    const wellEvidenced = sorted.length >= 4 && daySpread <= 2;
    const confidence = wellEvidenced && (amountExempt || ratio >= 0.75) ? 'high' : 'medium';

    const lastDate = parseDate(dates[dates.length - 1]);

    return {
        isRecurring: true,
        reason: null,
        frequency,
        expenseClass,
        confidence,
        // The current price, not the average — what the user will be charged next.
        amount: amounts[amounts.length - 1],
        amountRange: [Math.min(...amounts), Math.max(...amounts)],
        amountHistory: amounts.slice(-6),
        sameAmountRatio: ratio,
        occurrences: sorted.length,
        dayOfMonth: day,
        firstSeen: dates[0],
        lastSeen: dates[dates.length - 1],
        nextExpected: formatDate(nextChargeDate(lastDate, frequency, day)),
    };
}

/**
 * When the next charge is due.
 *
 * Anchored to the day of the month, not last-date-plus-thirty. "We'll check your
 * account around Aug 14" is a promise the cancel sheet makes; adding 30 days to
 * Jul 14 gives Aug 13, and the watch would resolve a day early and report a
 * cancellation that has not happened yet.
 */
function nextChargeDate(lastDate, frequency, day) {
    switch (frequency) {
        case 'bi-weekly':
            return new Date(lastDate.getTime() + 14 * 86400000);
        case 'monthly':
            return addMonths(lastDate, 1, day);
        case 'quarterly':
            return addMonths(lastDate, 3, day);
        case 'semi-annual':
            return addMonths(lastDate, 6, day);
        case 'annual':
            return addMonths(lastDate, 12, day);
        default:
            return addMonths(lastDate, 1, day);
    }
}

// ---------------------------------------------------------------------------
// The evidence line — what replaces the unlabelled confidence dots
// ---------------------------------------------------------------------------

/**
 * One line of plain evidence for why this row is on the screen.
 *
 * An amount range renders only for bills. The copy states that as a layout
 * rule: a range under Subscriptions means the amount gate leaked, so the bug is
 * visible on screen rather than hidden inside a confidence score.
 */
function evidenceLine(analysis) {
    if (!analysis || !analysis.isRecurring) return '';

    const { frequency, expenseClass, occurrences, dayOfMonth, amountRange, firstSeen } = analysis;
    const [low, high] = amountRange || [];
    const varies = Number.isFinite(low) && Number.isFinite(high) && high - low > 0.01;

    switch (frequency) {
        case 'monthly':
            if (expenseClass === EXPENSE_CLASSES.BILL && varies) {
                return `Monthly, around the ${ordinal(dayOfMonth)} · $${low.toFixed(2)}–$${high.toFixed(2)}`;
            }
            return `Charged on the ${ordinal(dayOfMonth)} · ${occurrences} months running`;

        case 'bi-weekly':
            return `Every 2 weeks · last ${occurrences} charges`;

        case 'quarterly':
            return `Every 3 months · since ${MONTH_NAMES[parseDate(firstSeen).getUTCMonth()]}`;

        case 'semi-annual':
            return `Twice a year · last ${occurrences} charges`;

        case 'annual':
            return `Once a year, each ${MONTH_NAMES[parseDate(analysis.lastSeen).getUTCMonth()]}`;

        default:
            return '';
    }
}

module.exports = {
    MIN_CHARGES,
    EXPENSE_CLASSES,
    VARIABLE_AMOUNT_CLASSES,
    BILL_MERCHANT_CATEGORIES,
    SAME_AMOUNT_THRESHOLD,
    sameAmountRatio,
    dayOfMonthConsistent,
    classifyFrequency,
    classifyExpense,
    analyzeRecurrence,
    evidenceLine,
};
