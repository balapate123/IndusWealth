/**
 * Constants for savings goals.
 *
 * Same contract as flags.js: the icon allowlist and ramp size are what the API
 * accepts and what the mobile picker offers. An arbitrary icon string would
 * pass validation and then render as a missing glyph on the device.
 *
 * Mirrored in packages/mobile/src/constants/goals.js.
 */

/** Number of hues in the theme's validated categorical ramp (tokens.js). */
const GOAL_RAMP_SIZE = 7;

/** Ionicons names offered by the goal picker; chosen to read at 16px. */
const GOAL_ICONS = [
    'flag',
    'shield-checkmark',
    'umbrella',
    'home',
    'car',
    'airplane',
    'school',
    'gift',
    'heart',
    'medkit',
    'trending-up',
    'wallet',
    'business',
    'boat',
    'diamond',
    'star',
];

/**
 * Goal types. Presentational — they steer default icon and copy, not maths.
 * Debt payoff is absent on purpose: it counts downward, the Wealth tab already
 * models it properly, and mixing directions here would put a sign flip in
 * every progress calculation.
 */
const GOAL_TYPES = ['savings', 'emergency_fund', 'purchase', 'investment'];

const TRACKING_MODES = ['account', 'manual'];

const REMINDER_CADENCES = ['daily', 'weekly', 'monthly'];

/**
 * Percentages that earn a notification, checked when the app opens.
 *
 * 100 is included so completion is announced; `milestones_notified` keeps each
 * one to a single firing even though progress is recomputed on every read.
 */
const MILESTONES = [25, 50, 75, 100];

/**
 * Starter goal offered to a user with none. Not seeded into the database —
 * unlike flags, an unwanted goal is clutter with a number attached, so the app
 * suggests it and the user decides.
 */
const SUGGESTED_GOAL = {
    name: 'Emergency Fund',
    goalType: 'emergency_fund',
    icon: 'shield-checkmark',
    colorIndex: 3,
};

/**
 * Which milestones a goal has newly crossed.
 *
 * Pure so it can be tested without a database, and used by both the API and
 * the device. Anything already in `notified` is skipped, so a goal that dips
 * back below 50% and climbs again does not re-announce.
 */
function newMilestones(progressPercent, notified = []) {
    const already = new Set((notified || []).map(Number));
    return MILESTONES.filter((m) => progressPercent >= m && !already.has(m));
}

module.exports = {
    GOAL_RAMP_SIZE,
    GOAL_ICONS,
    GOAL_TYPES,
    TRACKING_MODES,
    REMINDER_CADENCES,
    MILESTONES,
    SUGGESTED_GOAL,
    newMilestones,
};
