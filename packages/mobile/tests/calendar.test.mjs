/**
 * Run with:  npm test   (from packages/mobile)
 *
 * The month grid behind the date picker.
 *
 * A calendar's characteristic bug is being off by one, and it does not throw.
 * It renders a plausible month with every date on the wrong weekday, and the
 * only way to catch it by looking is to already know which day the 1st was —
 * which is precisely what you opened the calendar to find out. Same reason the
 * weekday conversion in goalReminders.js is isolated and tested.
 *
 * So the grid is checked against known months, and every crossing between
 * 0-based monthIndex and 1-based ISO is checked at January and December, where
 * an error moves the year too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    WEEKDAY_LABELS,
    daysInMonth,
    firstWeekday,
    isBetween,
    monthGrid,
    monthTitle,
    openingMonth,
    parseISO,
    stepMonth,
    toISO,
} from '../src/utils/calendar.js';

// ---------------------------------------------------------------------------
// Month lengths
// ---------------------------------------------------------------------------

test('month lengths, February included', () => {
    assert.equal(daysInMonth(2026, 0), 31);   // January
    assert.equal(daysInMonth(2026, 3), 30);   // April
    assert.equal(daysInMonth(2026, 8), 30);   // September
    assert.equal(daysInMonth(2026, 11), 31);  // December
});

test('leap years are the calendar getting it right, not a special case', () => {
    assert.equal(daysInMonth(2026, 1), 28);
    assert.equal(daysInMonth(2024, 1), 29);
    assert.equal(daysInMonth(2000, 1), 29, '2000 is a leap year — divisible by 400');
    assert.equal(daysInMonth(1900, 1), 28, '1900 is not — divisible by 100 but not 400');
});

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

test('September 2026 starts on a Tuesday', () => {
    // Checkable against any calendar, which is the point of pinning a real
    // month rather than asserting the shape.
    assert.equal(firstWeekday(2026, 8), 2);
    const weeks = monthGrid(2026, 8);
    assert.deepEqual(weeks[0], [null, null, 1, 2, 3, 4, 5]);
});

test('every row is a full week, so the grid never reflows', () => {
    for (let month = 0; month < 12; month++) {
        const weeks = monthGrid(2026, month);
        for (const week of weeks) {
            assert.equal(week.length, 7, `${monthTitle(2026, month)} has a short row`);
        }
    }
});

test('the grid holds every day of the month exactly once', () => {
    for (let month = 0; month < 12; month++) {
        const days = monthGrid(2026, month).flat().filter((d) => d !== null);
        assert.deepEqual(
            days,
            Array.from({ length: daysInMonth(2026, month) }, (_, i) => i + 1),
            `${monthTitle(2026, month)} lost or repeated a day`
        );
    }
});

test('a month starting on Sunday has no leading blanks', () => {
    // February 2026 starts on a Sunday: the case where an off-by-one in the
    // lead would push the whole month a week down and still look like a month.
    assert.equal(firstWeekday(2026, 1), 0);
    assert.equal(monthGrid(2026, 1)[0][0], 1);
});

test('a 31-day month starting late still fits whole weeks', () => {
    // August 2026 starts on a Saturday — one day in the first row, so the month
    // needs six rows.
    assert.equal(firstWeekday(2026, 7), 6);
    const weeks = monthGrid(2026, 7);
    assert.deepEqual(weeks[0], [null, null, null, null, null, null, 1]);
    assert.equal(weeks.length, 6);
});

test('the weekday labels line up with getDay()', () => {
    // The labels are a parallel array to the grid columns. If they ever stop
    // being Sunday-first, every date renders under the wrong heading.
    assert.equal(WEEKDAY_LABELS.length, 7);
    assert.equal(WEEKDAY_LABELS[0], 'Su');
    assert.equal(WEEKDAY_LABELS[new Date(2026, 8, 23).getDay()], 'We', '23 Sep 2026 is a Wednesday');
});

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

test('stepping carries the year in both directions', () => {
    assert.deepEqual(stepMonth({ year: 2026, monthIndex: 11 }, 1), { year: 2027, monthIndex: 0 });
    assert.deepEqual(stepMonth({ year: 2026, monthIndex: 0 }, -1), { year: 2025, monthIndex: 11 });
    assert.deepEqual(stepMonth({ year: 2026, monthIndex: 8 }, 1), { year: 2026, monthIndex: 9 });
    assert.deepEqual(stepMonth({ year: 2026, monthIndex: 8 }, -12), { year: 2025, monthIndex: 8 });
});

test('the title names the month a person would name', () => {
    assert.equal(monthTitle(2026, 0), 'January 2026');
    assert.equal(monthTitle(2026, 8), 'September 2026');
    assert.equal(monthTitle(2026, 11), 'December 2026');
});

// ---------------------------------------------------------------------------
// The 0-based / 1-based crossing
// ---------------------------------------------------------------------------

test('toISO adds the one, at both ends of the year', () => {
    assert.equal(toISO(2026, 0, 1), '2026-01-01');
    assert.equal(toISO(2026, 8, 23), '2026-09-23');
    assert.equal(toISO(2026, 11, 31), '2026-12-31');
});

test('parseISO takes it back off, at both ends of the year', () => {
    assert.deepEqual(parseISO('2026-01-01'), { year: 2026, monthIndex: 0, day: 1 });
    assert.deepEqual(parseISO('2026-12-31'), { year: 2026, monthIndex: 11, day: 31 });
});

test('the two round-trip for every day of a year', () => {
    // The cheapest possible proof that the crossing is symmetric. A one-way
    // off-by-one would survive either test alone.
    for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= daysInMonth(2026, month); day++) {
            const iso = toISO(2026, month, day);
            assert.deepEqual(parseISO(iso), { year: 2026, monthIndex: month, day },
                `${iso} did not round-trip`);
        }
    }
});

test('parseISO refuses a date that does not exist', () => {
    assert.equal(parseISO('2026-02-30'), null);
    assert.equal(parseISO('2026-02-29'), null);
    assert.deepEqual(parseISO('2024-02-29'), { year: 2024, monthIndex: 1, day: 29 });
    assert.equal(parseISO('2026-13-01'), null);
    assert.equal(parseISO('2026-00-05'), null);
    assert.equal(parseISO('2026-9-5'), null);
    assert.equal(parseISO(''), null);
    assert.equal(parseISO(null), null);
});

// ---------------------------------------------------------------------------
// Where the picker opens
// ---------------------------------------------------------------------------

test('a picker opens on the month it already holds', () => {
    assert.deepEqual(openingMonth('2026-03-14', new Date(2026, 8, 23)),
        { year: 2026, monthIndex: 2 });
});

test('and on this month when it holds nothing usable', () => {
    const today = new Date(2026, 8, 23);
    assert.deepEqual(openingMonth(null, today), { year: 2026, monthIndex: 8 });
    assert.deepEqual(openingMonth('', today), { year: 2026, monthIndex: 8 });
    // A stored value that is not a real date opens on today rather than on
    // whatever month new Date() would have rolled it into.
    assert.deepEqual(openingMonth('2026-02-30', today), { year: 2026, monthIndex: 8 });
});

// ---------------------------------------------------------------------------
// Range fill
// ---------------------------------------------------------------------------

test('the fill is strictly between, so endpoints stay endpoints', () => {
    assert.equal(isBetween('2026-03-15', '2026-03-01', '2026-03-31'), true);
    assert.equal(isBetween('2026-03-01', '2026-03-01', '2026-03-31'), false);
    assert.equal(isBetween('2026-03-31', '2026-03-01', '2026-03-31'), false);
    assert.equal(isBetween('2026-04-01', '2026-03-01', '2026-03-31'), false);
});

test('an open-ended range fills nothing', () => {
    // Half a range is not a range. Filling to the edge of the visible month
    // would claim a boundary the user never set.
    assert.equal(isBetween('2026-03-15', '2026-03-01', null), false);
    assert.equal(isBetween('2026-03-15', null, '2026-03-31'), false);
});

test('the fill spans a month boundary without parsing anything', () => {
    // Lexical order is chronological order for ISO dates, which is why this
    // needs no Date object and so cannot lose a day to a timezone.
    assert.equal(isBetween('2026-03-31', '2026-02-14', '2026-04-02'), true);
    assert.equal(isBetween('2025-12-31', '2025-12-01', '2026-01-15'), true);
});
