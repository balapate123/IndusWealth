/**
 * Pure scheduling logic for credit card due-date reminders.
 *
 * No expo, no react-native, no device — same split as goalReminders.js, and for
 * the same reason: the arithmetic below is an off-by-one waiting to happen, and
 * getting it wrong schedules a reminder on a day that does not exist, which
 * iOS accepts without complaint and then never fires.
 */

// Explicit extension: Metro resolves either form, but Node's ESM loader — which
// is what runs the tests against this file — requires it.
import { TRIGGER_TYPES, clampInt } from './goalReminders.js';

/** Matches card_due_dates.due_day's CHECK — see db/add_card_due_dates.sql. */
export const MAX_DUE_DAY = 28;
export const MAX_LEAD_DAYS = 14;

export const CARD_DUE_KIND = 'card_due';

/**
 * The day of month a lead-time warning falls on.
 *
 * THE BUG THIS EXISTS TO PREVENT: a card due on the 2nd with three days' lead
 * wants the 30th of the *previous* month. Subtracting naively gives -1, and
 * capping at 28 does not help — the value is not too large, it is negative.
 * A monthly repeating trigger built from it silently never fires.
 *
 * Months are modelled as 28 days here. That is deliberate: reminders are
 * repeating triggers rather than dated instances, because dated instances would
 * blow through iOS's 64-notification cap. The cost is that a wrapped warning
 * can land up to three days earlier than asked in a 31-day month — a card due
 * on the 2nd warns on the 27th, which is 6 days ahead, not 3. Early is
 * harmless; the failure we care about is a warning that never arrives. Only
 * due days 1..leadDays wrap at all, so with the default lead of 3 this touches
 * the 1st, 2nd and 3rd and nothing else.
 *
 * @returns {number} a day in 1..28
 */
export function leadDay(dueDay, leadDays) {
    const due = clampInt(dueDay, 1, MAX_DUE_DAY, 1);
    const lead = clampInt(leadDays, 0, MAX_LEAD_DAYS, 0);

    // JS % keeps the sign of the dividend, so a negative needs the extra turn.
    const zeroBased = (((due - lead - 1) % MAX_DUE_DAY) + MAX_DUE_DAY) % MAX_DUE_DAY;
    return zeroBased + 1;
}

/** "the 3rd", "the 22nd" — used in reminder copy and on the card row. */
export function ordinalDay(day) {
    const n = clampInt(day, 1, MAX_DUE_DAY, 1);
    const suffix = (n % 100 >= 11 && n % 100 <= 13)
        ? 'th'
        : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
    return `${n}${suffix}`;
}

/** How a card is named in a notification: "Visa ••4321", or just its name. */
export function cardLabel(card) {
    const name = card?.card_name || 'Your card';
    return card?.account_mask ? `${name} ••${card.account_mask}` : name;
}

/**
 * The reminders for one card: a lead-time warning and one on the day.
 *
 * Copy names the due date rather than counting down to it. "Due in 3 days"
 * would be wrong for a wrapped warning, and content is frozen when a local
 * notification is scheduled rather than when it fires, so nothing here may
 * quote a balance or a minimum payment either.
 *
 * @returns {{key: string, content: object, trigger: object}[]} empty if disabled
 */
export function buildCardReminders(card) {
    if (!card || card.enabled === false) return [];

    const due = clampInt(card.due_day, 1, MAX_DUE_DAY, null);
    if (due === null) return [];

    const hour = clampInt(card.reminder_hour, 0, 23, 9);
    const lead = clampInt(card.lead_days, 0, MAX_LEAD_DAYS, 0);
    const label = cardLabel(card);
    const onThe = ordinalDay(due);

    const reminders = [{
        key: `${card.id}:due`,
        content: {
            title: label,
            body: `Payment due today (the ${onThe}).`,
            data: { kind: CARD_DUE_KIND, cardDueId: card.id, phase: 'due' },
        },
        trigger: { type: TRIGGER_TYPES.MONTHLY, day: due, hour, minute: 0 },
    }];

    // A zero-day lead is the same notification twice; the due-day one already
    // covers it.
    if (lead > 0) {
        reminders.unshift({
            key: `${card.id}:lead`,
            content: {
                title: label,
                body: `Payment due on the ${onThe}.`,
                data: { kind: CARD_DUE_KIND, cardDueId: card.id, phase: 'lead' },
            },
            trigger: {
                type: TRIGGER_TYPES.MONTHLY,
                day: leadDay(due, lead),
                hour,
                minute: 0,
            },
        });
    }

    return reminders;
}

/** Human description for the card row: "Due the 15th · 3 days notice". */
export function describeCardDueDate(card) {
    if (!card?.due_day) return 'No due date set';
    if (card.enabled === false) return `Due the ${ordinalDay(card.due_day)} · reminders off`;

    const lead = clampInt(card.lead_days, 0, MAX_LEAD_DAYS, 0);
    const notice = lead === 0
        ? 'on the day'
        : `${lead} day${lead === 1 ? '' : 's'} notice`;
    return `Due the ${ordinalDay(card.due_day)} · ${notice}`;
}
