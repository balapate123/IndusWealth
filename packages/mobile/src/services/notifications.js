import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    buildTrigger,
    buildContent,
    formatAmount,
    assertTriggerTypesMatch,
} from '../utils/goalReminders';
import { buildCardReminders, CARD_DUE_KIND } from '../utils/cardDueReminders';
import { selectWatchReminders, WATCH_KIND } from '../utils/watchReminders';
import { createSyncQueue } from '../utils/syncQueue';

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
const CARD_CHANNEL_ID = 'card-payments';
const CHECKIN_KIND = 'checkin';
const WATCH_CHANNEL_ID = 'watchdog-outcomes';

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

        // Its own channel, so someone can silence savings nudges without also
        // silencing the one notification that costs money to miss. Payments do
        // get to vibrate, for the same reason.
        await Notifications.setNotificationChannelAsync(CARD_CHANNEL_ID, {
            name: 'Card payment due dates',
            importance: Notifications.AndroidImportance.HIGH,
            enableVibrate: true,
        });

        // Its own channel at HIGH for the same reason as card payments: being
        // charged for something you believed you had cancelled costs real
        // money, and silencing savings nudges must not silence this.
        await Notifications.setNotificationChannelAsync(WATCH_CHANNEL_ID, {
            name: 'Cancellation results',
            importance: Notifications.AndroidImportance.HIGH,
            enableVibrate: true,
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

/** Only the reminders this app scheduled, of one kind — never anything else. */
async function scheduledOfKind(kind) {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.filter((n) => n?.content?.data?.kind === kind);
}

async function cancelKind(kind) {
    const ours = await scheduledOfKind(kind);
    await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    return ours.length;
}

export async function cancelAllGoalReminders() {
    return cancelKind(GOAL_REMINDER_KIND);
}

export async function cancelAllCardReminders() {
    return cancelKind(CARD_DUE_KIND);
}

export async function cancelCheckinReminder() {
    return cancelKind(CHECKIN_KIND);
}

export async function cancelAllWatchReminders() {
    return cancelKind(WATCH_KIND);
}

/**
 * Serialises every reminder sync. See utils/syncQueue.js for why it must be.
 *
 * Goal and card syncs share one queue even though they cancel disjoint sets:
 * both read the full pending list via getAllScheduledNotificationsAsync, and
 * over-serialising two short operations costs nothing next to the class of bug
 * it rules out.
 */
const enqueue = createSyncQueue();

export function syncGoalReminders(goals = []) {
    return enqueue(() => _syncGoalReminders(goals));
}

export function syncCardDueReminders(cards = []) {
    return enqueue(() => _syncCardDueReminders(cards));
}

export function syncCheckinReminder(options = {}) {
    return enqueue(() => _syncCheckinReminder(options));
}

export function syncWatchReminders(watches = []) {
    return enqueue(() => _syncWatchReminders(watches));
}

/**
 * One weekly notification that opens the app to whatever is worth saying.
 *
 * The copy is evergreen and says nothing specific, which is not laziness: local
 * content freezes when it is SCHEDULED, so anything concrete here would be a
 * week stale by delivery and could name a goal the user has since deleted. The
 * specific ask is fetched live on open — the same split as goal milestones.
 *
 * One notification total, whatever the user has set up.
 */
async function _syncCheckinReminder({ enabled = true, weekday = 1, hour = 10 } = {}) {
    const { granted } = await getNotificationPermission();
    const cancelled = await cancelKind(CHECKIN_KIND);

    if (!granted || !enabled) {
        return { scheduled: 0, cancelled, permitted: granted };
    }

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Your weekly check-in',
                body: 'One small thing you could do this week.',
                data: { kind: CHECKIN_KIND },
            },
            trigger: {
                type: 'weekly',
                // 0-6 Sunday-first on our side, 1-7 Sunday-first for expo. The
                // same off-by-one as goal reminders, so it converts the same way.
                weekday: Math.min(Math.max(weekday, 0), 6) + 1,
                hour: Math.min(Math.max(hour, 0), 23),
                minute: 0,
                ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
            },
        });
        return { scheduled: 1, cancelled, permitted: true };
    } catch (err) {
        console.warn('Could not schedule the weekly check-in:', err?.message || err);
        return { scheduled: 0, cancelled, permitted: true };
    }
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
 * Make the device's scheduled card reminders match the server's due dates.
 *
 * Same shape as the goal sync — rebuild from server state rather than diff — and
 * on the same queue. Call through syncCardDueReminders, never directly.
 *
 * A card whose account was disconnected keeps its reminder: the due date has
 * not changed just because the connection dropped, and dropping it silently
 * would be the worst possible failure for a payment reminder.
 *
 * @returns {{scheduled: number, cancelled: number, permitted: boolean}}
 */
async function _syncCardDueReminders(cards = []) {
    const { granted } = await getNotificationPermission();

    if (!granted) {
        const cancelled = await cancelAllCardReminders();
        return { scheduled: 0, cancelled, permitted: false };
    }

    const cancelled = await cancelAllCardReminders();
    let scheduled = 0;

    for (const card of cards) {
        for (const reminder of buildCardReminders(card)) {
            try {
                await Notifications.scheduleNotificationAsync({
                    content: reminder.content,
                    trigger: Platform.OS === 'android'
                        ? { ...reminder.trigger, channelId: CARD_CHANNEL_ID }
                        : reminder.trigger,
                });
                scheduled++;
            } catch (err) {
                // One bad card must not stop the rest from being scheduled.
                console.warn(`Could not schedule a due-date reminder for card ${card?.id}:`, err?.message || err);
            }
        }
    }

    return { scheduled, cancelled, permitted: true };
}

/**
 * One dated reminder per open watch, asking what happened.
 *
 * Cancel-then-reschedule from server state, like the others, so a watch the user
 * withdrew or that has already resolved loses its reminder rather than firing
 * and sending them to a screen with nothing on it.
 *
 * Unlike goal and card reminders these are one-shot date triggers: the question
 * is only worth asking once. They still hold a slot until they fire, which is
 * what the cap in selectWatchReminders is for.
 *
 * @returns {{scheduled: number, cancelled: number, permitted: boolean}}
 */
async function _syncWatchReminders(watches = []) {
    const { granted } = await getNotificationPermission();

    // Deliberately does not request permission. iOS grants one prompt and it is
    // spent when the user switches a reminder on, not as a side effect of
    // tapping Cancel on a subscription. Without permission the outcome still
    // reaches them -- it is waiting on the screen when they next open the app.
    if (!granted) {
        const cancelled = await cancelAllWatchReminders();
        return { scheduled: 0, cancelled, permitted: false };
    }

    const cancelled = await cancelAllWatchReminders();
    let scheduled = 0;

    for (const reminder of selectWatchReminders(watches)) {
        try {
            await Notifications.scheduleNotificationAsync({
                content: reminder.content,
                trigger: Platform.OS === 'android'
                    ? { ...reminder.trigger, channelId: WATCH_CHANNEL_ID }
                    : reminder.trigger,
            });
            scheduled++;
        } catch (err) {
            // One bad date must not stop the rest from being scheduled.
            console.warn(`Could not schedule a watch reminder for ${reminder.key}:`, err?.message || err);
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
    CARD_DUE: CARD_DUE_KIND,
    CHECKIN: CHECKIN_KIND,
    WATCH_OUTCOME: WATCH_KIND,
};
