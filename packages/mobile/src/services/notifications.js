import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    buildTrigger,
    buildContent,
    formatAmount,
    assertTriggerTypesMatch,
} from '../utils/goalReminders';

/**
 * Local goal reminders.
 *
 * Local, not push: these are scheduled on the device and delivered by the OS,
 * so there is no APNs certificate, no FCM key and no server scheduler, and they
 * fire with the app closed and offline. iOS still treats them as notifications
 * for permission purposes, so we do have to ask.
 *
 * Two iOS constraints shape everything here:
 *
 *   1. A pending-notification cap of 64. A repeating trigger counts as one, so
 *      one reminder per goal (capped at 25 server-side) sits well under it —
 *      but only because we reschedule repeating triggers rather than enqueuing
 *      dated instances.
 *   2. Content is frozen when a notification is scheduled, not when it fires.
 *      Reminder copy is therefore evergreen and never quotes progress. Anything
 *      that must reflect current progress — milestones — is presented when the
 *      app opens instead.
 *
 * The pure parts live in utils/goalReminders.js so they can be tested without
 * a device.
 */

const GOAL_REMINDER_KIND = 'goal_reminder';
const GOAL_MILESTONE_KIND = 'goal_milestone';
const ANDROID_CHANNEL_ID = 'goal-reminders';

/**
 * Install the foreground handler and the Android channel.
 *
 * Without a handler nothing appears while the app is open, which reads as a
 * broken feature to anyone testing it.
 */
export async function configureNotifications() {
    // Our trigger strings are copied rather than imported, so that the pure
    // module stays loadable off-device. If expo renames them, say so here
    // instead of silently scheduling nothing.
    const drifted = assertTriggerTypesMatch(Notifications.SchedulableTriggerInputTypes);
    if (drifted.length > 0) {
        console.warn(`expo-notifications trigger types changed: ${drifted.join(', ')} — goal reminders will not schedule`);
    }

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
            name: 'Goal reminders',
            importance: Notifications.AndroidImportance.DEFAULT,
            // A savings nudge does not deserve to buzz someone's pocket.
            enableVibrate: false,
        });
    }
}

/**
 * Ask for permission, requesting only if we do not already have it.
 *
 * Call this when a reminder is switched on, never at launch: iOS grants exactly
 * one prompt, and spending it on a cold start is how an app ends up permanently
 * unable to notify anyone.
 */
export async function ensureNotificationPermission() {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return { granted: true, canAskAgain: existing.canAskAgain };

    // A denied iOS permission cannot be re-prompted — asking again is a no-op,
    // so the caller should send the user to Settings rather than retry.
    if (!existing.canAskAgain) return { granted: false, canAskAgain: false };

    const requested = await Notifications.requestPermissionsAsync();
    return { granted: Boolean(requested.granted), canAskAgain: Boolean(requested.canAskAgain) };
}

export async function getNotificationPermission() {
    const status = await Notifications.getPermissionsAsync();
    return { granted: Boolean(status.granted), canAskAgain: Boolean(status.canAskAgain) };
}

/** Only the reminders this app scheduled — never anything it did not. */
async function scheduledGoalReminders() {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.filter((n) => n?.content?.data?.kind === GOAL_REMINDER_KIND);
}

export async function cancelAllGoalReminders() {
    const ours = await scheduledGoalReminders();
    await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    return ours.length;
}

/**
 * Serialises syncGoalReminders. Never reset — the chain is the lock.
 *
 * Cancel-then-reschedule is not safe to run concurrently: two overlapping runs
 * interleave as cancel, cancel, schedule, schedule and leave every reminder on
 * the device twice. That is reachable in normal use — deleting a goal triggers a
 * reload, and navigating straight back to Home triggers another before the first
 * has finished. Chaining is sufficient here: the work is short and idempotent,
 * and the last caller's list is the one that ends up scheduled.
 */
let reminderSyncQueue = Promise.resolve();

export function syncGoalReminders(goals = []) {
    // Both handlers run the sync, so one failed run cannot wedge the queue.
    const run = reminderSyncQueue.then(
        () => _syncGoalReminders(goals),
        () => _syncGoalReminders(goals)
    );
    reminderSyncQueue = run.catch(() => {});
    return run;
}

/**
 * Make the device's scheduled reminders match the server's goals.
 *
 * Cancel-then-reschedule rather than diffing: the set is at most 25 entries, a
 * diff would have to reason about renames, cadence changes and time changes
 * separately, and a leftover reminder for a deleted goal is a genuinely bad
 * bug. Rebuilding from server state cannot drift.
 *
 * Call through syncGoalReminders, never directly — see the queue above.
 *
 * @returns {{scheduled: number, cancelled: number, permitted: boolean}}
 */
async function _syncGoalReminders(goals = []) {
    const { granted } = await getNotificationPermission();

    if (!granted) {
        // Clear anything left from when permission was granted, so revoking it
        // does not leave reminders firing.
        const cancelled = await cancelAllGoalReminders();
        return { scheduled: 0, cancelled, permitted: false };
    }

    const cancelled = await cancelAllGoalReminders();
    const wanted = goals.filter((g) => g?.status === 'active' && g?.reminder_cadence);
    let scheduled = 0;

    for (const goal of wanted) {
        const trigger = buildTrigger(goal);
        if (!trigger) continue;

        try {
            await Notifications.scheduleNotificationAsync({
                content: buildContent(goal),
                trigger: Platform.OS === 'android'
                    ? { ...trigger, channelId: ANDROID_CHANNEL_ID }
                    : trigger,
            });
            scheduled++;
        } catch (err) {
            // One bad goal must not stop the rest from being scheduled.
            console.warn(`Could not schedule a reminder for goal ${goal?.id}:`, err?.message || err);
        }
    }

    return { scheduled, cancelled, permitted: true };
}

/**
 * Show milestone notifications immediately.
 *
 * These cannot be scheduled ahead: crossing 50% depends on a balance the device
 * does not know until it asks the server. So the app checks on open and
 * presents what it is handed — a null trigger means "now".
 */
export async function presentMilestones(crossings = []) {
    if (crossings.length === 0) return [];

    // Deliberately does NOT request permission: iOS grants one prompt and it is
    // spent when a reminder is switched on, not at app open. So an un-permitted
    // milestone is not an error — it stays pending server-side and announces
    // itself whenever notifications are turned on. It is logged because
    // "nothing happened" is otherwise indistinguishable from a broken feature.
    const { granted } = await getNotificationPermission();
    if (!granted) {
        console.warn(
            `[notifications] permission not granted — ${crossings.length} goal milestone(s) left pending, not consumed`
        );
        return [];
    }

    // Returns the crossings actually scheduled, so the caller confirms only
    // those. Anything that threw stays unconfirmed and will be retried.
    const shown = [];
    for (const crossing of crossings) {
        const highest = Math.max(...(crossing.milestones || []).map(Number));
        if (!Number.isFinite(highest)) continue;
        const done = highest >= 100;

        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: done ? `${crossing.name} — done` : `${highest}% of ${crossing.name}`,
                    body: done
                        ? `You hit your ${formatAmount(crossing.target_amount)} target.`
                        : `${formatAmount(crossing.saved_amount)} of ${formatAmount(crossing.target_amount)} saved.`,
                    data: { kind: GOAL_MILESTONE_KIND, goalId: crossing.goal_id },
                },
                trigger: null,
            });
            shown.push(crossing);
        } catch (err) {
            console.warn('Could not present a milestone notification:', err?.message || err);
        }
    }
    return shown;
}

export const NOTIFICATION_KINDS = {
    GOAL_REMINDER: GOAL_REMINDER_KIND,
    GOAL_MILESTONE: GOAL_MILESTONE_KIND,
};
