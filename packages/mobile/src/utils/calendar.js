/**
 * Month-grid arithmetic for the date picker.
 *
 * Pure — no RN imports — because the one thing a calendar can do wrong is be
 * off by one, and an off-by-one in a date grid does not throw. It renders a
 * perfectly plausible month with every day on the wrong weekday, and the only
 * way to notice is to already know what day the 1st was. Same reason the
 * weekday conversion in `goalReminders.js` is isolated and tested.
 *
 * ## The convention, stated once
 *
 * **`monthIndex` is 0-based, exactly like `Date.prototype.getMonth()`.** ISO
 * strings are 1-based, so every crossing between the two is a place to get this
 * wrong; `toISO` and `parseISO` are the only two crossings, and both are tested
 * at January and December where an error changes the year as well.
 *
 * Weeks start on Sunday, which is the Canadian convention and the one
 * `Date.getDay()` already uses, so no remapping is needed anywhere.
 */

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * How many days the month has.
 *
 * Day 0 of the *next* month is the last day of this one, which is what makes
 * February right in a leap year without a rule about leap years.
 */
export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

/** Which weekday the 1st falls on, 0 = Sunday. */
export const firstWeekday = (year, monthIndex) => new Date(year, monthIndex, 1).getDay();

/**
 * The month as weeks of seven cells, `null` where the grid is empty.
 *
 * Always whole weeks, so every row renders the same width and the grid does not
 * reflow as you page through months.
 */
export const monthGrid = (year, monthIndex) => {
    const total = daysInMonth(year, monthIndex);
    const lead = firstWeekday(year, monthIndex);

    const cells = [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length: total }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
};

/** "September 2026". */
export const monthTitle = (year, monthIndex) => `${MONTH_NAMES[monthIndex]} ${year}`;

/**
 * Move by whole months, carrying the year.
 *
 * Built through Date rather than by hand so December + 1 and January - 1 are
 * the language's problem rather than ours.
 */
export const stepMonth = ({ year, monthIndex }, delta) => {
    const moved = new Date(year, monthIndex + delta, 1);
    return { year: moved.getFullYear(), monthIndex: moved.getMonth() };
};

/** (2026, 8, 23) → "2026-09-23". The 0→1 crossing, in one place. */
export const toISO = (year, monthIndex, day) => `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

/**
 * "2026-09-23" → { year: 2026, monthIndex: 8, day: 23 }, or null.
 *
 * Refuses a date that does not exist rather than letting `new Date` roll it
 * forward — the same check `isValidDateText` makes, because a picker seeded
 * from a bad stored value should open on today, not on some other month.
 */
export const parseISO = (iso) => {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month - 1)) return null;
    return { year, monthIndex: month - 1, day };
};

/** The month a picker should open on: the value's, else today's. */
export const openingMonth = (iso, today = new Date()) => {
    const parsed = parseISO(iso);
    if (parsed) return { year: parsed.year, monthIndex: parsed.monthIndex };
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
};

/**
 * Is `iso` strictly inside the range?
 *
 * ISO dates sort lexically the way they sort chronologically, which is the
 * reason the format is used — no parsing needed, and no timezone to lose a day
 * to. Exclusive at both ends: the endpoints render as endpoints, not as fill.
 */
export const isBetween = (iso, startISO, endISO) => {
    if (!iso || !startISO || !endISO) return false;
    return iso > startISO && iso < endISO;
};
