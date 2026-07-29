/**
 * Pure reminder logic — no expo, no react-native, no device.
 *
 * Split out from services/notifications.js so it can be exercised in plain
 * Node. The weekday conversion below is an off-by-one that would deliver every
 * weekly reminder on the wrong day and stay invisible until a user happened to
 * mention it, which is not a thing to leave untested.
 */

/**
 * Mirrors expo-notifications' `SchedulableTriggerInputTypes`.
 *
 * Duplicated as plain strings so this module stays importable without the
 * native package. `assertTriggerTypesMatch` compares the two at startup, so a
 * rename in the library surfaces as a loud warning rather than as reminders
 * that quietly never fire.
 */
export const TRIGGER_TYPES = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
};

export const CADENCES = ['daily', 'weekly', 'monthly'];

/** Sunday-first, matching the 0-6 the API stores. */
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function clampInt(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

/** Whole dollars read better in a notification than "$2.00". */
export function formatAmount(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '$0';
    return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * Turn a goal's reminder settings into an expo trigger.
 *
 * @returns {object|null} null when the goal has no reminder
 */
export function buildTrigger(goal) {
    const hour = clampInt(goal?.reminder_hour, 0, 23, 9);
    const minute = 0;

    switch (goal?.reminder_cadence) {
        case 'daily':
            return { type: TRIGGER_TYPES.DAILY, hour, minute };

        case 'weekly': {
            // The API stores 0-6 with Sunday = 0 (JS Date.getDay convention).
            // expo and iOS want 1-7 with Sunday = 1. Off by one, one direction.
            const day = clampInt(goal.reminder_day, 0, 6, 1);
            return { type: TRIGGER_TYPES.WEEKLY, weekday: day + 1, hour, minute };
        }

        case 'monthly':
            return {
                type: TRIGGER_TYPES.MONTHLY,
                // Capped at 28 server-side so a reminder cannot skip February.
                day: clampInt(goal.reminder_day, 1, 28, 1),
                hour,
                minute,
            };

        default:
            return null;
    }
}

/**
 * Reminder copy.
 *
 * Evergreen on purpose: a local notification's content is frozen when it is
 * scheduled, not when it fires, so "you're $4 away" would be weeks stale by
 * delivery. Progress-dependent copy belongs to milestones, which are presented
 * when the app opens.
 */
export function buildContent(goal) {
    const amount = Number(goal?.reminder_amount);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const name = goal?.name || 'your goal';

    return {
        title: goal?.name || 'Your goal',
        body: hasAmount
            ? `Move ${formatAmount(amount)} toward ${name}.`
            : `A small step toward ${name} today.`,
        data: { kind: 'goal_reminder', goalId: goal?.id },
    };
}

/** Human description of a cadence, for the goal editor and detail screen. */
export function describeReminder(goal) {
    if (!goal?.reminder_cadence) return 'No reminder';

    const hour = clampInt(goal.reminder_hour, 0, 23, 9);
    const suffix = hour < 12 ? 'am' : 'pm';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    const at = `${display}${suffix}`;
    const amount = Number(goal.reminder_amount);
    const prefix = Number.isFinite(amount) && amount > 0 ? `${formatAmount(amount)} ` : '';

    switch (goal.reminder_cadence) {
        case 'daily':
            return `${prefix}every day at ${at}`.trim();
        case 'weekly':
            return `${prefix}every ${WEEKDAY_LABELS[clampInt(goal.reminder_day, 0, 6, 1)]} at ${at}`.trim();
        case 'monthly': {
            const day = clampInt(goal.reminder_day, 1, 28, 1);
            return `${prefix}on the ${day}${ordinal(day)} at ${at}`.trim();
        }
        default:
            return 'No reminder';
    }
}

function ordinal(n) {
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}

/**
 * Compare our copied trigger strings against the library's enum.
 * Returns the names that no longer match, so the caller can shout.
 */
export function assertTriggerTypesMatch(libraryEnum) {
    if (!libraryEnum) return Object.keys(TRIGGER_TYPES);
    return Object.entries(TRIGGER_TYPES)
        .filter(([key, value]) => libraryEnum[key] !== value)
        .map(([key]) => key);
}
