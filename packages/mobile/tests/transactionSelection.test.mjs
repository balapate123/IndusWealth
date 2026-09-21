/**
 * Run with:  npm test   (from packages/mobile)
 *
 * Imports the shipped module, not a copy — Node 22 detects the ESM syntax in
 * src/utils, which is why these live there and take no expo import.
 *
 * The rule the whole module exists to protect: **the count and the total always
 * describe the same rows.** A footer reading "5 selected · $240" where the $240
 * covers four of them is a number with no visible working, and this codebase
 * refuses those everywhere else — server-side totals on the transaction list,
 * null rather than zero on a disconnected goal, no figure at all on a nudge it
 * cannot measure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
    MAX_SELECTION,
    toggleSelection,
    summarizeSelection,
    formatSelectionTotal,
} from '../src/utils/transactionSelection.js';

const tx = (id, amount) => ({ id, amount, name: `Txn ${id}` });

const LIST = [tx(1, 61.4), tx(2, 48.15), tx(3, 55), tx(4, -20)];

const sel = (...ids) => new Set(ids);

// ---------------------------------------------------------------------------
// Toggling
// ---------------------------------------------------------------------------

test('tapping a row selects it, tapping again lets it go', () => {
    const once = toggleSelection(sel(), 1);
    assert.deepEqual([...once], [1]);
    assert.deepEqual([...toggleSelection(once, 1)], []);
});

test('toggling returns a new set rather than editing the old one', () => {
    // React state has to change identity to re-render. Mutating in place is the
    // version of this bug where the total is right and the screen never updates.
    const before = sel(1);
    const after = toggleSelection(before, 2);
    assert.notEqual(before, after);
    assert.deepEqual([...before], [1]);
    assert.deepEqual([...after], [1, 2]);
});

test('a missing or unusable id changes nothing', () => {
    assert.deepEqual([...toggleSelection(sel(1), null)], [1]);
    assert.deepEqual([...toggleSelection(sel(1), undefined)], [1]);
    assert.deepEqual([...toggleSelection(null, 1)], [1]);
});

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test('the count and the total describe the same rows', () => {
    const { count, net } = summarizeSelection(LIST, sel(1, 2));
    assert.equal(count, 2);
    assert.equal(net, 109.55);
});

test('an id that is not on screen is counted by neither', () => {
    // The screen clears the selection when a filter changes, so this should not
    // arise -- but if it ever does, dropping the row from the count as well as
    // the total keeps the two honest. Counting it and not totalling it is the
    // failure this module exists to prevent.
    const { count, net } = summarizeSelection(LIST, sel(1, 999));
    assert.equal(count, 1);
    assert.equal(net, 61.4);
});

test('nothing selected is zero of both, not null', () => {
    assert.deepEqual(summarizeSelection(LIST, sel()), { count: 0, net: 0, hasInflow: false });
    assert.deepEqual(summarizeSelection(LIST, null), { count: 0, net: 0, hasInflow: false });
    assert.deepEqual(summarizeSelection(null, sel(1)), { count: 0, net: 0, hasInflow: false });
});

// ---------------------------------------------------------------------------
// Money in and money out
// ---------------------------------------------------------------------------

test('the total is net, matching what a flag would report', () => {
    // Positive amount is money out. A selection holding a purchase and its
    // refund nets to what was actually spent, which is the number that matters
    // for a shared expense -- and it is what the flag's own screen will show
    // for the same rows if the selection becomes one.
    const { net } = summarizeSelection(LIST, sel(1, 4));
    assert.equal(net, 41.4);
});

test('a selection containing money coming in says so', () => {
    // Without it, "$41.40" for a $61.40 purchase and a $20 refund looks like an
    // arithmetic error to the one person who can check.
    assert.equal(summarizeSelection(LIST, sel(1, 4)).hasInflow, true);
    assert.equal(summarizeSelection(LIST, sel(1, 2)).hasInflow, false);
});

test('a selection that nets negative is money back, not a negative spend', () => {
    const { net, hasInflow } = summarizeSelection(LIST, sel(4));
    assert.equal(net, -20);
    assert.equal(hasInflow, true);
});

test('amounts arriving as strings still add up', () => {
    // The API sends DECIMAL columns through JSON and a cached page can hold
    // either shape. String concatenation here would turn $61.40 and $48.15 into
    // "61.448.15" without erroring.
    const { net } = summarizeSelection([{ id: 1, amount: '61.40' }, { id: 2, amount: '48.15' }], sel(1, 2));
    assert.equal(net, 109.55);
});

test('floating point does not leak into the total', () => {
    // 0.1 + 0.2 is the classic; a footer reading $0.30000000000000004 is the
    // visible form of it.
    const { net } = summarizeSelection([{ id: 1, amount: 0.1 }, { id: 2, amount: 0.2 }], sel(1, 2));
    assert.equal(net, 0.3);
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

test('the total reads as money, with cents', () => {
    // Unlike a pace, this is an exact sum of real transactions, so the cents
    // are real and rounding them away would make it not match the rows above.
    assert.equal(formatSelectionTotal(109.55), '$109.55');
    assert.equal(formatSelectionTotal(1234.5), '$1,234.50');
    assert.equal(formatSelectionTotal(0), '$0.00');
});

test('money coming back reads as a credit, not as minus money', () => {
    assert.equal(formatSelectionTotal(-20), '+$20.00');
});

// ---------------------------------------------------------------------------
// The cap has to match the server
// ---------------------------------------------------------------------------

test('the selection cap matches what the server will accept', () => {
    // A screen that lets somebody select more than the endpoint takes is a
    // button that fails at the end of the job. Loaded from the backend module
    // rather than asserted as a number, the same way the grace-days and
    // nudge-kind parity tests work: asserting 200 on this side proves nothing
    // about the other.
    const require = createRequire(import.meta.url);
    const backend = require('../../backend/src/services/category_corrections.js');

    assert.equal(MAX_SELECTION, backend.MAX_BULK_TRANSACTIONS);
});
