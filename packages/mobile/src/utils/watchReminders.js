/**
 * Reminders that ask whether a cancellation actually worked — pure.
 *
 * No expo import, so the rules are testable off-device. Same arrangement as
 * goalReminders.js and cardDueReminders.js.
 *
 * The constraint the whole design turns on: **a local notification's content
 * freezes when it is scheduled.** On the day somebody taps "I've cancelled
 * this", nobody knows what happens on the 14th — so the body cannot carry the
 * outcome, cannot carry a figure, and must point inward. The answer is fetched
 * when the app opens, which is the same split goal milestones already use.
 */

import { TRIGGER_TYPES, clampInt } from './goalReminders.js';

/** Tags our notifications so cancelling them touches nothing else. */
export const WATCH_KIND = 'watch_outcome';

/**
 * Days after the expected charge before we ask.
 *
 * Must match GRACE_DAYS in the backend's services/watch.js. If this fires first,
 * the user opens the app to a watch that is still running and learns nothing.
 */
export const WATCH_GRACE_DAYS = 3;

/**
 * Concurrent watch reminders.
 *
 * iOS allows 64 pending notifications. The existing ceiling is 25 goals x2 plus
 * 10 cards x2 plus one check-in = 46; eight here takes it to 54 and leaves room.
 * Eight is generous — people do not cancel eight things at once.
 */
export const MAX_WATCH_REMINDERS = 8;

/** Late enough that a morning-posted charge has already landed. */
export const REMINDER_HOUR = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-08-14' -> 'Aug 14'. */
export function formatShortDate(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    if (!Number.isInteger(y) || !MONTHS[m - 1]) return '';
    return `${MONTHS[m - 1]} ${d}`;
}

/**
 * When to ask, as a local Date.
 *
 * Built from components rather than by adding milliseconds to a parsed UTC
 * instant, so a daylight-saving boundary between now and then cannot shift the
 * hour — the same class of bug as the goal-reminder weekday conversion, which
 * delivered on the wrong day without ever erroring.
 */
export function watchFireDate(expectedChargeDate, graceDays = WATCH_GRACE_DAYS) {
    if (!expectedChargeDate) return null;
    const [y, m, d] = String(expectedChargeDate).slice(0, 10).split('-').map(Number);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;

    // Day-of-month arithmetic rolls over months and years on its own.
    return new Date(y, m - 1, d + clampInt(graceDays, 0, 30, WATCH_GRACE_DAYS), REMINDER_HOUR, 0, 0);
}

/**
 * One reminder for one open watch, or null if it cannot be scheduled.
 *
 * Null for a date already past: expo would fire it immediately, which asks the
 * user about something they acted on weeks ago.
 */
export function buildWatchReminder(watch, now = new Date()) {
    if (!watch || !watch.expectedChargeDate) return null;

    const fireAt = watchFireDate(watch.expectedChargeDate);
    if (!fireAt || fireAt.getTime() <= now.getTime()) return null;

    const merchant = watch.merchantName || 'A subscription';
    const due = formatShortDate(watch.expectedChargeDate);
    const negotiated = watch.action === 'negotiate';

    return {
        key: `watch:${watch.id}`,
        content: {
            // Names the merchant and the date and stops there. Everything about
            // what happened is unknowable at this moment.
            title: negotiated
                ? `${merchant} — your next bill was due ${due}`
                : `${merchant} — your next charge was due ${due}`,
            // Deliberately blunter than it needs to be. "Tap to see whether it
            // stopped" asserts nothing, but notification text is skimmed and
            // the gist a glance leaves behind is "it stopped". The one thing
            // this notification must never do is imply an answer it does not
            // have.
            body: 'Tap to see what happened.',
            data: { kind: WATCH_KIND, watchId: watch.id },
        },
        trigger: { type: TRIGGER_TYPES.DATE, date: fireAt },
    };
}

/**
 * The reminders worth scheduling, soonest first, capped.
 *
 * Unschedulable watches are dropped before the cap is applied, so a handful of
 * stale ones cannot crowd out the reminders that would actually fire.
 */
export function selectWatchReminders(watches, now = new Date()) {
    if (!Array.isArray(watches)) return [];

    return watches
        .map((w) => buildWatchReminder(w, now))
        .filter(Boolean)
        .sort((a, b) => a.trigger.date - b.trigger.date)
        .slice(0, MAX_WATCH_REMINDERS);
}
