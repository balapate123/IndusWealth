/**
 * Run with:  npm test   (from packages/mobile)
 *
 * Imports the shipped module, not a copy — Node 22 detects the ESM syntax in
 * src/utils, which is why these live there and take no expo import.
 *
 * The rule this file exists to protect: a local notification's content freezes
 * when it is SCHEDULED. On the day the user taps "I've cancelled this" nobody
 * knows what happens on the 14th, so the body can never carry the outcome. It
 * points inward and the answer is fetched on open — the same split as goal
 * milestones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    WATCH_KIND,
    WATCH_GRACE_DAYS,
    MAX_WATCH_REMINDERS,
    REMINDER_HOUR,
    formatShortDate,
    buildWatchReminder,
    selectWatchReminders,
} from '../src/utils/watchReminders.js';

const watch = (over = {}) => ({
    id: 7,
    merchantName: 'Netflix',
    action: 'stop',
    expectedChargeDate: '2026-08-14',
    ...over,
});

const NOW = new Date(2026, 6, 15, 9, 0, 0); // 15 Jul 2026, local

// ---------------------------------------------------------------------------
// When it fires
// ---------------------------------------------------------------------------

test('it fires three days after the charge was due, not on the day', () => {
    // Charges post late. Asking "did it stop?" on the 14th invites the user to
    // conclude it worked before the charge has had a chance to land, and a
    // false all-clear is worse than silence.
    const { trigger } = buildWatchReminder(watch(), NOW);
    assert.equal(trigger.date.getFullYear(), 2026);
    assert.equal(trigger.date.getMonth(), 7, 'August');
    assert.equal(trigger.date.getDate(), 17);
    assert.equal(trigger.date.getHours(), REMINDER_HOUR);
});

test('the grace period matches the one the server resolves on', () => {
    // If these drift, the notification arrives before the outcome exists and
    // the user opens the app to a watch that is still running.
    assert.equal(WATCH_GRACE_DAYS, 3);
});

test('it is a one-shot date trigger, never a repeating one', () => {
    // A repeating trigger would ask the same question every month forever, and
    // would hold its slot against the 64-notification ceiling for good.
    const { trigger } = buildWatchReminder(watch(), NOW);
    assert.equal(trigger.type, 'date');
    assert.ok(trigger.date instanceof Date);
});

test('a date that has already passed is not scheduled', () => {
    const late = buildWatchReminder(watch({ expectedChargeDate: '2026-06-01' }), NOW);
    assert.equal(late, null);
});

test('a watch with no expected date is not scheduled', () => {
    assert.equal(buildWatchReminder(watch({ expectedChargeDate: null }), NOW), null);
    assert.equal(buildWatchReminder(null, NOW), null);
});

// ---------------------------------------------------------------------------
// What it says — the constraint the whole design turns on
// ---------------------------------------------------------------------------

test('the body never claims an outcome, because it cannot know one', () => {
    // Stricter than the literal rule on purpose: an interrogative like "whether
    // it stopped" asserts nothing, but notification text is skimmed and the
    // gist a glance leaves behind is the verb. Banning the vocabulary outright
    // is cheaper to hold than a judgement call about phrasing.
    const { content } = buildWatchReminder(watch(), NOW);
    const text = `${content.title} ${content.body}`.toLowerCase();

    for (const forbidden of ['stopped', 'saved', 'worked', 'success', 'charged you again']) {
        assert.ok(!text.includes(forbidden), `notification pre-announced "${forbidden}"`);
    }
});

test('the body never carries a dollar amount', () => {
    // Frozen at schedule time, so any figure is a month stale on arrival and
    // may describe a subscription whose price has since changed.
    const { content } = buildWatchReminder(watch(), NOW);
    assert.ok(!`${content.title} ${content.body}`.includes('$'));
});

test('it names the merchant and the date, and points inward', () => {
    const { content } = buildWatchReminder(watch(), NOW);
    assert.ok(content.title.includes('Netflix'));
    assert.ok(content.title.includes('Aug 14'), content.title);
    assert.match(content.body, /tap/i);
});

test('a negotiated bill asks about the bill, not about cancelling', () => {
    const { content } = buildWatchReminder(watch({ action: 'negotiate', merchantName: 'Rogers' }), NOW);
    const text = `${content.title} ${content.body}`.toLowerCase();
    assert.ok(text.includes('bill'), text);
    assert.ok(!text.includes('cancel'), text);
});

test('every reminder is tagged so cancelling ours touches nothing else', () => {
    const { content } = buildWatchReminder(watch(), NOW);
    assert.equal(content.data.kind, WATCH_KIND);
    assert.equal(content.data.watchId, 7);
    assert.notEqual(WATCH_KIND, 'goal_reminder');
    assert.notEqual(WATCH_KIND, 'card_due');
});

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

test('no more than eight are ever scheduled', () => {
    // iOS allows 64 pending. 25 goals x2 + 10 cards x2 + 1 check-in = 46, so
    // eight here takes the ceiling to 54 and leaves headroom.
    const many = Array.from({ length: 20 }, (_, i) => watch({
        id: i,
        expectedChargeDate: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const selected = selectWatchReminders(many, NOW);
    assert.equal(selected.length, MAX_WATCH_REMINDERS);
    assert.equal(MAX_WATCH_REMINDERS, 8);
});

test('the soonest are the ones that get a slot', () => {
    const selected = selectWatchReminders([
        watch({ id: 1, expectedChargeDate: '2026-12-01' }),
        watch({ id: 2, expectedChargeDate: '2026-08-20' }),
        watch({ id: 3, expectedChargeDate: '2026-10-05' }),
    ], NOW);
    assert.deepEqual(selected.map((r) => r.content.data.watchId), [2, 3, 1]);
});

test('unschedulable watches are dropped rather than counted against the cap', () => {
    const selected = selectWatchReminders([
        watch({ id: 1, expectedChargeDate: '2026-01-01' }), // past
        watch({ id: 2, expectedChargeDate: null }),
        watch({ id: 3, expectedChargeDate: '2026-08-20' }),
    ], NOW);
    assert.deepEqual(selected.map((r) => r.content.data.watchId), [3]);
});

test('stale watches do not eat slots that would have fired', () => {
    // Three watches whose dates have passed, followed by ten that have not. If
    // the cap were applied before the unschedulable ones were dropped, the
    // stale three would consume three of the eight slots and the user would get
    // five reminders instead of eight. Needs more than MAX schedulable entries
    // to discriminate, which is why the smaller case above cannot.
    const stale = [1, 2, 3].map((id) => watch({ id, expectedChargeDate: '2026-01-01' }));
    const future = Array.from({ length: 10 }, (_, i) => watch({
        id: 100 + i,
        expectedChargeDate: `2026-09-${String(i + 1).padStart(2, '0')}`,
    }));

    const selected = selectWatchReminders([...stale, ...future], NOW);
    assert.equal(selected.length, MAX_WATCH_REMINDERS);
    assert.ok(
        selected.every((r) => r.content.data.watchId >= 100),
        'a stale watch was scheduled'
    );
});

test('an empty list schedules nothing and does not throw', () => {
    assert.deepEqual(selectWatchReminders([], NOW), []);
    assert.deepEqual(selectWatchReminders(null, NOW), []);
});

// ---------------------------------------------------------------------------

test('dates read the way a person writes them', () => {
    assert.equal(formatShortDate('2026-08-14'), 'Aug 14');
    assert.equal(formatShortDate('2026-01-01'), 'Jan 1');
    assert.equal(formatShortDate(null), '');
});
