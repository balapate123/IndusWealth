/**
 * Goal editor constants — a port of packages/backend/src/services/goals.js, the
 * same way constants/flags.js ports the backend flag constants.
 *
 * The server is authoritative: GET /goals publishes the icon allowlist, ramp
 * size, types and cadences it will accept, and the editor prefers those. This
 * list is the fallback for the first paint, before that response lands.
 */

/** Hues in the theme's validated categorical ramp (constants/tokens.js). */
export const GOAL_RAMP_SIZE = 7;

export const GOAL_ICONS = [
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
 * Goal types, with the copy the editor shows. Presentational only — they steer
 * the default icon and the label, never the maths.
 *
 * Debt payoff is deliberately absent: it counts downward, and the Wealth tab
 * already models debt with APRs and payoff ordering.
 */
export const GOAL_TYPES = [
    { value: 'savings', label: 'Savings', icon: 'wallet' },
    { value: 'emergency_fund', label: 'Emergency fund', icon: 'shield-checkmark' },
    { value: 'purchase', label: 'Big purchase', icon: 'gift' },
    { value: 'investment', label: 'Investing', icon: 'trending-up' },
];

export const CADENCE_OPTIONS = [
    { value: null, label: 'Off' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

/** Sunday-first, matching the 0-6 the API stores. */
export const WEEKDAYS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

/** What a brand-new goal starts as, matching the server's defaults. */
export const NEW_GOAL = {
    name: '',
    goalType: 'savings',
    targetAmount: '',
    targetDate: null,
    trackingMode: 'manual',
    accountId: null,
    countExistingBalance: false,
    colorIndex: 0,
    icon: 'flag',
    reminderCadence: null,
    reminderDay: 1,
    reminderHour: 9,
    reminderAmount: '',
};
