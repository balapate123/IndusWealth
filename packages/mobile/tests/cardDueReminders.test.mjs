/**
 * Run with:  npm test  (from packages/mobile)
 *
 * The wraparound is the reason this file exists. Everything else here is
 * cheap insurance around it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    leadDay,
    ordinalDay,
    cardLabel,
    buildCardReminders,
    describeCardDueDate,
    MAX_DUE_DAY,
    CARD_DUE_KIND,
} from '../src/utils/cardDueReminders.js';

const card = (over = {}) => ({
    id: 1,
    card_name: 'Visa Infinite',
    account_mask: '4321',
    due_day: 15,
    lead_days: 3,
    reminder_hour: 9,
    enabled: true,
    ...over,
});

test('THE BUG: subtracting the lead naively goes negative and never fires', () => {
    // What a naive implementation produces, and why it is not caught by a cap:
    //   due 2, lead 3  ->  2 - 3 = -1
    // A monthly trigger on day -1 is not "too large", so clamping to 1..28 does
    // not flag it; iOS accepts the schedule and simply never delivers it.
    for (const [due, lead] of [[1, 3], [2, 3], [3, 3], [1, 1], [5, 14]]) {
        const naive = due - lead;
        assert.ok(naive <= 0, `expected ${due}-${lead} to be the broken case`);

        const day = leadDay(due, lead);
        assert.ok(
            Number.isInteger(day) && day >= 1 && day <= MAX_DUE_DAY,
            `leadDay(${due}, ${lead}) = ${day}, outside 1..${MAX_DUE_DAY}`
        );
    }
});

test('a wrapped lead really is `lead` days before the due day', () => {
    // Counting forward in the same 28-day cycle the scheduler uses.
    for (let due = 1; due <= MAX_DUE_DAY; due++) {
        for (let lead = 0; lead <= 14; lead++) {
            const day = leadDay(due, lead);
            const forward = ((day - 1 + lead) % MAX_DUE_DAY) + 1;
            assert.equal(
                forward, due,
                `leadDay(${due}, ${lead}) = ${day}; ${lead} days later is ${forward}, not ${due}`
            );
        }
    }
});

test('the ordinary case does not wrap', () => {
    assert.equal(leadDay(15, 3), 12);
    assert.equal(leadDay(28, 14), 14);
    assert.equal(leadDay(10, 0), 10);
});

test('the wrapped cases land where they should', () => {
    assert.equal(leadDay(2, 3), 27);   // 27 -> 28 -> 1 -> 2
    assert.equal(leadDay(1, 1), 28);
    assert.equal(leadDay(3, 3), 28);
    assert.equal(leadDay(1, 14), 15);
});

test('every day of the month produces a schedulable day', () => {
    for (let due = 1; due <= MAX_DUE_DAY; due++) {
        for (let lead = 0; lead <= 14; lead++) {
            const day = leadDay(due, lead);
            assert.ok(day >= 1 && day <= 28, `due ${due} lead ${lead} -> ${day}`);
        }
    }
});

test('out-of-range input is clamped rather than propagated', () => {
    // The API and the CHECK constraint both refuse these; this is the last line.
    assert.equal(leadDay(31, 3), leadDay(28, 3));
    assert.equal(leadDay(0, 3), leadDay(1, 3));
    assert.equal(leadDay(15, 99), leadDay(15, 14));
    assert.equal(leadDay(15, -5), 15);
    assert.equal(leadDay(null, null), 1);
});

test('a card schedules a lead warning and a due-day reminder', () => {
    const reminders = buildCardReminders(card());
    assert.equal(reminders.length, 2);

    const [lead, due] = reminders;
    assert.equal(lead.trigger.day, 12);
    assert.equal(due.trigger.day, 15);
    assert.equal(lead.trigger.type, 'monthly');
    assert.equal(lead.trigger.hour, 9);
    assert.equal(lead.trigger.minute, 0);
    assert.equal(lead.content.data.kind, CARD_DUE_KIND);
    assert.equal(lead.content.data.phase, 'lead');
    assert.equal(due.content.data.phase, 'due');
});

test('a zero-day lead schedules one reminder, not the same one twice', () => {
    const reminders = buildCardReminders(card({ lead_days: 0 }));
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].trigger.day, 15);
});

test('a disabled card schedules nothing', () => {
    assert.deepEqual(buildCardReminders(card({ enabled: false })), []);
});

test('a card with no due day schedules nothing rather than defaulting to the 1st', () => {
    assert.deepEqual(buildCardReminders(card({ due_day: null })), []);
    assert.deepEqual(buildCardReminders(card({ due_day: undefined })), []);
    assert.deepEqual(buildCardReminders(null), []);
});

test('copy names the date and never quotes a balance', () => {
    // Local notification content freezes when scheduled, not when it fires, so
    // any figure in here would be a month stale on delivery.
    const reminders = buildCardReminders(card({ due_day: 2, lead_days: 3 }));
    const text = JSON.stringify(reminders);

    assert.ok(text.includes('2nd'), 'the due date should be named');
    assert.ok(!/\$|balance|minimum|owe/i.test(text), `copy quotes a figure: ${text}`);
    // "due in 3 days" would be a lie on a wrapped warning — the 27th is up to
    // six days before the 2nd depending on the month's length.
    assert.ok(!/in \d+ days/i.test(text), `copy counts down: ${text}`);
});

test('copy does not scold', () => {
    const text = JSON.stringify(buildCardReminders(card())).toLowerCase();
    for (const word of ['late', 'overdue', 'missed', 'failed', 'penalty', "haven't", 'still']) {
        assert.ok(!text.includes(word), `copy scolds with "${word}"`);
    }
});

test('a card is labelled with its mask when it has one', () => {
    assert.equal(cardLabel(card()), 'Visa Infinite ••4321');
    assert.equal(cardLabel(card({ account_mask: null })), 'Visa Infinite');
    assert.equal(cardLabel({}), 'Your card');
});

test('ordinals read correctly, including the teens', () => {
    assert.equal(ordinalDay(1), '1st');
    assert.equal(ordinalDay(2), '2nd');
    assert.equal(ordinalDay(3), '3rd');
    assert.equal(ordinalDay(4), '4th');
    assert.equal(ordinalDay(11), '11th');
    assert.equal(ordinalDay(12), '12th');
    assert.equal(ordinalDay(13), '13th');
    assert.equal(ordinalDay(21), '21st');
    assert.equal(ordinalDay(22), '22nd');
    assert.equal(ordinalDay(23), '23rd');
    assert.equal(ordinalDay(28), '28th');
});

test('the row description covers set, off, and unset', () => {
    assert.equal(describeCardDueDate(card()), 'Due the 15th · 3 days notice');
    assert.equal(describeCardDueDate(card({ lead_days: 1 })), 'Due the 15th · 1 day notice');
    assert.equal(describeCardDueDate(card({ lead_days: 0 })), 'Due the 15th · on the day');
    assert.equal(describeCardDueDate(card({ enabled: false })), 'Due the 15th · reminders off');
    assert.equal(describeCardDueDate({}), 'No due date set');
});
