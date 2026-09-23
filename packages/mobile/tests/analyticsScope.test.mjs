/**
 * Run with:  npm test   (from packages/mobile)
 *
 * The guard that turns a silent wrong answer into a visible one.
 *
 * It went wrong exactly once and that was enough: the device asked for one
 * credit card's analytics, the deployed server did not yet know the parameter,
 * Express dropped it, and every account's spending came back with a 200. The
 * screen drew it under the card's name — right-looking hero, right-looking
 * categories, nothing to notice.
 *
 * The direction that must not break is the other one. Asking for everything
 * and getting everything is the Analytics tab, which is most of the traffic,
 * so a guard inverted by accident would replace the main screen with an error
 * for every user. That asymmetry is what these tests are mostly about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scopeMatches, SCOPE_MISMATCH_MESSAGE } from '../src/utils/analyticsScope.js';

const CARD = 'acct-card-123';

/** What the current server sends back when scoped. */
const scoped = (id) => ({
    success: true,
    scope: 'account',
    account: { id, name: 'Travel card', type: 'credit' },
});

/** What it sends for every account. */
const unscoped = { success: true, scope: 'all', account: null };

/** What a server deployed before this feature sends — no scope keys at all. */
const legacy = { success: true, summary: { totalSpend: 1234 }, categories: [] };

// ---------------------------------------------------------------------------
// The failure this exists for
// ---------------------------------------------------------------------------

test('an old server answering an account request is a mismatch', () => {
    // The actual bug. 200, full payload, no scope keys, every account's money.
    assert.equal(scopeMatches(CARD, legacy), false);
});

test('a scoped request answered with every account is a mismatch', () => {
    assert.equal(scopeMatches(CARD, unscoped), false);
});

test('a scoped request answered about a DIFFERENT account is a mismatch', () => {
    // Would need a params mix-up or a raced response, and is worse than the
    // stale-server case: the numbers are real, just somebody else's card.
    assert.equal(scopeMatches(CARD, scoped('acct-other-456')), false);
});

test('a scoped request answered about that account matches', () => {
    assert.equal(scopeMatches(CARD, scoped(CARD)), true);
});

// ---------------------------------------------------------------------------
// The direction that must never start failing
// ---------------------------------------------------------------------------

test('the Analytics tab asks for everything and is never a mismatch', () => {
    // Most of the traffic. An inverted guard would replace this screen with an
    // error for every user, which is a worse outage than the bug it prevents.
    assert.equal(scopeMatches(null, unscoped), true);
    assert.equal(scopeMatches(null, legacy), true);
    assert.equal(scopeMatches(null, scoped(CARD)), true);
    assert.equal(scopeMatches(undefined, unscoped), true);
});

// ---------------------------------------------------------------------------
// Not our failure to report
// ---------------------------------------------------------------------------

test('no payload is not a mismatch', () => {
    // A network error, a 500, a refused request: the caller already reports
    // those. Calling them "stale server" would name the wrong cause and send
    // somebody to redeploy something that is fine.
    assert.equal(scopeMatches(CARD, null), true);
    assert.equal(scopeMatches(CARD, undefined), true);
});

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

test('the message names the cause and does not blame the reader', () => {
    assert.match(SCOPE_MISMATCH_MESSAGE, /server/i);
    for (const scold of ['you ', 'your fault', 'invalid', 'error:']) {
        assert.ok(!SCOPE_MISMATCH_MESSAGE.toLowerCase().includes(scold),
            `the message scolds or jargons: "${scold}"`);
    }
});

test('and points at what still works, so the screen is not a dead end', () => {
    assert.match(SCOPE_MISMATCH_MESSAGE, /Analytics tab/);
});
