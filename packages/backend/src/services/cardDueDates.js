/**
 * Constants for credit card payment due dates.
 *
 * Same contract as flags.js and goals.js: what the API accepts is what the
 * mobile picker offers, published on GET /card-due-dates so the device never
 * keeps a hardcoded copy that can drift.
 *
 * Mirrored in packages/mobile/src/constants/cardDueDates.js.
 */

const TARGET_TYPES = ['plaid_account', 'custom_debt'];

/**
 * Highest day of month a reminder may sit on.
 *
 * 29, 30 and 31 do not exist in every month, and a monthly repeating trigger on
 * a day the month lacks does not error — it simply never fires. Same cap as
 * goal reminders, for the same reason.
 */
const MAX_DUE_DAY = 28;

/**
 * How far ahead a warning may be scheduled.
 *
 * Bounded at half a cycle: a warning further out than that lands before the
 * previous month's payment was even due, so the user cannot tell which cycle it
 * refers to.
 */
const MAX_LEAD_DAYS = 14;
const DEFAULT_LEAD_DAYS = 3;

/**
 * Cap on tracked cards per user.
 *
 * Each card costs two of iOS's 64 pending local notifications (a lead-time
 * warning and one on the day). With goals capped at 25 and one weekly check-in,
 * ten cards puts the ceiling at 46 — headroom, and well past the number of
 * cards anyone actually carries.
 */
const MAX_CARDS = 10;

/**
 * Account subtypes that can carry a payment due date.
 *
 * Depository accounts are excluded: a chequing account has no due date, and
 * offering one would produce a reminder for a bill that does not exist.
 */
const DUE_DATE_ACCOUNT_TYPES = ['credit', 'loan'];

module.exports = {
    TARGET_TYPES,
    MAX_DUE_DAY,
    MAX_LEAD_DAYS,
    DEFAULT_LEAD_DAYS,
    MAX_CARDS,
    DUE_DATE_ACCOUNT_TYPES,
};
