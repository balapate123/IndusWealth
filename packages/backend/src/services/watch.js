/**
 * The watch loop — pure.
 *
 * After a user says they cancelled or negotiated something, did it actually
 * work? Instructions for cancelling Netflix are a commodity; being the only
 * thing that checks whether the charge stopped is not. It is also what lets the
 * savings figure be measured instead of imagined: the old hero number summed the
 * amounts of everything a user had *marked* for cancellation plus a discount
 * percentage parsed out of a prose string, which is money nobody had saved.
 *
 * `today` is injected so outcomes are assertions rather than something that
 * changes depending on when the suite runs. Same reasoning as recurrence.js: no
 * pool, no clock, no network.
 */

const WATCH_STATUS = {
    WATCHING: 'watching',
    STOPPED: 'confirmed_stopped',
    CHARGED_AGAIN: 'charged_again',
    REDUCED: 'reduced',
    UNCHANGED: 'unchanged',
};

/**
 * Days to wait past the expected charge before declaring a cancellation worked.
 *
 * Charges post late. Resolving on the expected date itself would report a
 * cancellation that has not happened yet, and a false all-clear is worse than
 * silence — the user stops checking. Matches the notification, which fires on
 * the same day this can first resolve.
 */
const GRACE_DAYS = 3;

/**
 * Billing cycles to watch before calling a negotiation a failure.
 *
 * Retention credits often land on the following bill rather than the current
 * one, so declaring failure after a single unchanged cycle would be wrong often
 * enough to matter.
 */
const MAX_NEGOTIATE_CYCLES = 2;

/** Assumed cycle length when the caller does not supply one. */
const DEFAULT_CYCLE_DAYS = 30;

// ---------------------------------------------------------------------------

function parseDate(value) {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
    return formatDate(new Date(parseDate(dateString).getTime() + days * 86400000));
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

/** Two amounts are the same bill if they differ by less than a cent or 0.5%. */
function sameAmount(a, b) {
    return Math.abs(a - b) <= Math.max(0.01, Math.abs(a) * 0.005);
}

// ---------------------------------------------------------------------------

/**
 * Decide what happened to one watch.
 *
 * Returns the watch's next state. Callers persist it; nothing here writes.
 *
 * @param {object}   watch    { action, status, startedAt, expectedChargeDate,
 *                              baselineAmount, cyclesObserved, cycleDays }
 * @param {object[]} charges  every charge from this merchant, {date, amount}
 * @param {string}   today    'YYYY-MM-DD'
 */
function resolveWatch({ watch, charges = [], today }) {
    const unchangedResult = {
        status: watch.status,
        resolvedAmount: watch.resolvedAmount ?? null,
        savedMonthly: watch.savedMonthly ?? 0,
        cyclesObserved: watch.cyclesObserved || 0,
        expectedChargeDate: watch.expectedChargeDate,
    };

    // A resolved watch stays resolved. Re-opening one would let a merchant the
    // user re-subscribes to months later reverse a closed case, and move the
    // confirmed savings figure under them.
    if (watch.status !== WATCH_STATUS.WATCHING) return unchangedResult;

    // Charges on the day they acted do not count against them: someone who sees
    // a bill land and cancels that same day was reacting to it, not failing.
    const since = charges
        .filter((c) => String(c.date).slice(0, 10) > String(watch.startedAt).slice(0, 10))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (watch.action === 'stop') {
        if (since.length > 0) {
            return {
                status: WATCH_STATUS.CHARGED_AGAIN,
                resolvedAmount: round2(Number(since[0].amount)),
                savedMonthly: 0,
                cyclesObserved: watch.cyclesObserved || 0,
                expectedChargeDate: watch.expectedChargeDate,
            };
        }

        // Measured from whichever came later. A user who cancels something on
        // the 19th that was due on the 1st has given us no observation window
        // at all, and the naive deadline is already in the past -- the very
        // next analysis would report a confirmed cancellation having watched
        // nothing. Found by the PGlite harness, not by reasoning about it.
        const from = watch.expectedChargeDate > watch.startedAt
            ? watch.expectedChargeDate
            : watch.startedAt;
        const deadline = addDays(from, GRACE_DAYS);
        if (String(today).slice(0, 10) >= deadline) {
            return {
                status: WATCH_STATUS.STOPPED,
                resolvedAmount: null,
                savedMonthly: round2(Number(watch.baselineAmount)),
                cyclesObserved: watch.cyclesObserved || 0,
                expectedChargeDate: watch.expectedChargeDate,
            };
        }

        return unchangedResult;
    }

    // Negotiating. Silence proves nothing here -- a bill that has not arrived is
    // not evidence the call worked -- so this only ever resolves on a charge.
    if (since.length === 0) return unchangedResult;

    const observed = round2(Number(since[0].amount));
    const baseline = Number(watch.baselineAmount);

    if (observed < baseline && !sameAmount(baseline, observed)) {
        return {
            status: WATCH_STATUS.REDUCED,
            resolvedAmount: observed,
            savedMonthly: round2(baseline - observed),
            cyclesObserved: (watch.cyclesObserved || 0) + 1,
            expectedChargeDate: watch.expectedChargeDate,
        };
    }

    const cyclesObserved = (watch.cyclesObserved || 0) + 1;
    if (cyclesObserved >= MAX_NEGOTIATE_CYCLES) {
        return {
            status: WATCH_STATUS.UNCHANGED,
            resolvedAmount: observed,
            // A bill that went up is not a negative saving. It is no saving.
            savedMonthly: 0,
            cyclesObserved,
            expectedChargeDate: watch.expectedChargeDate,
        };
    }

    return {
        status: WATCH_STATUS.WATCHING,
        resolvedAmount: null,
        savedMonthly: 0,
        cyclesObserved,
        expectedChargeDate: addDays(
            String(since[0].date).slice(0, 10),
            watch.cycleDays || DEFAULT_CYCLE_DAYS
        ),
    };
}

/**
 * The first cycle date strictly after today.
 *
 * The detector predicts the next charge from the last one it saw, which may
 * already be in the past by the time somebody acts — a stale sync, or simply a
 * user opening the app on the 19th to cancel something billed on the 1st. What
 * we tell them to expect has to be a date that has not happened yet.
 */
function firstExpectedAfter(expectedChargeDate, cycleDays, today) {
    const step = Math.max(1, Number(cycleDays) || DEFAULT_CYCLE_DAYS);
    const cutoff = String(today).slice(0, 10);
    let date = String(expectedChargeDate).slice(0, 10);

    // Bounded: even an annual cycle against a decade-old date terminates well
    // inside this, and an unbounded loop on bad data is worse than a wrong date.
    for (let i = 0; i < 400 && date <= cutoff; i++) {
        date = addDays(date, step);
    }
    return date;
}

/**
 * Monthly savings we can actually show our working for.
 *
 * Only stopped and reduced count. A watch still running has saved nothing yet,
 * and one that was charged again has saved nothing at all.
 */
function confirmedMonthlySavings(watches = []) {
    const total = watches.reduce((sum, w) => {
        if (w.status === WATCH_STATUS.STOPPED) return sum + Number(w.baselineAmount || 0);
        if (w.status === WATCH_STATUS.REDUCED) {
            return sum + Math.max(0, Number(w.baselineAmount || 0) - Number(w.resolvedAmount || 0));
        }
        return sum;
    }, 0);
    return round2(total);
}

/** Statuses that have an outcome worth telling the user about. */
const RESOLVED_STATUSES = [
    WATCH_STATUS.STOPPED,
    WATCH_STATUS.CHARGED_AGAIN,
    WATCH_STATUS.REDUCED,
    WATCH_STATUS.UNCHANGED,
];

module.exports = {
    WATCH_STATUS,
    RESOLVED_STATUSES,
    GRACE_DAYS,
    MAX_NEGOTIATE_CYCLES,
    DEFAULT_CYCLE_DAYS,
    resolveWatch,
    confirmedMonthlySavings,
    firstExpectedAfter,
};
