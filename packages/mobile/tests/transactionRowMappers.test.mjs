/**
 * Run with:  npm test   (from packages/mobile)
 *
 * Every transaction list builds its own row objects from the API payload, and
 * a field left out of that mapper is gone for good — the sheet below it reads
 * `undefined` and renders the un-corrected state, while the server has the
 * correction stored and returns it on every request.
 *
 * That is not hypothetical. `AccountTransactionsScreen` shipped without
 * `user_category`, so opening a transaction there showed no correction badge
 * and offered no undo, for a correction that was applied and persisted. The
 * bug is invisible: nothing throws, nothing logs, and the category rendered is
 * the derived one, which is a plausible answer.
 *
 * This is a source scan, and it says so. A precise check would need to know
 * which object literal is a row — and a check nobody can maintain gets deleted
 * the first time it is inconvenient. This one fails at the moment a fourth
 * screen copies the old mapper, which is the moment that matters.
 *
 * Same idiom as the backend's `category_override.test.js` bypass scan, for the
 * same reason: the correction is only correct if everything consults it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(here, '../src/screens');

/** Screens that map an API transaction into a row for the list. */
const mapperScreens = () => readdirSync(SCREENS)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, source: readFileSync(join(SCREENS, name), 'utf8') }))
    .filter(({ source }) => /formatTransactionsData\s*=/.test(source));

test('there is more than one of these, or the scan is watching nothing', () => {
    // A guard on the guard. If the helper is ever renamed, the filter above
    // silently matches zero files and every assertion below passes vacuously.
    const screens = mapperScreens().map((s) => s.name);
    assert.ok(screens.length >= 2, `found ${screens.length}: ${screens.join(', ')}`);
});

test('every row mapper carries the category correction through', () => {
    // Without it the detail sheet cannot mark a corrected row or offer the
    // undo, and `correctedCategoryOf` has nothing to act on — so a correction
    // made on one screen is invisible on another.
    const offenders = mapperScreens()
        .filter(({ source }) => !/user_category:/.test(source))
        .map(({ name }) => name);

    assert.deepEqual(offenders, [],
        `these build rows without the correction: ${offenders.join(', ')}`);
});

test('and the merchant label the server sent, rather than deriving one', () => {
    // `merchantLabel` names the merchant in the "also apply to all of these"
    // toggle. Deriving it on the device would be a third implementation of
    // normalizeMerchantName — which is how the two category vocabularies
    // happened in the first place.
    const offenders = mapperScreens()
        .filter(({ source }) => !/merchantLabel:/.test(source))
        .map(({ name }) => name);

    assert.deepEqual(offenders, [],
        `these build rows without the merchant label: ${offenders.join(', ')}`);
});

test('a screen offering bulk category also offers it for one transaction', () => {
    // Bulk correction without the single-row one is a screen where twenty
    // transactions can be fixed at once but not one, which reads as a bug
    // rather than as a limit.
    const offenders = readdirSync(SCREENS)
        .filter((name) => name.endsWith('.js'))
        .map((name) => ({ name, source: readFileSync(join(SCREENS, name), 'utf8') }))
        .filter(({ source }) => /TransactionSelectionBar/.test(source))
        .filter(({ source }) => !/onEditCategory/.test(source))
        .map(({ name }) => name);

    assert.deepEqual(offenders, [],
        `these can bulk-correct but not correct one: ${offenders.join(', ')}`);
});
