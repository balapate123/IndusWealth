/**
 * Did the analytics payload answer the question we asked?
 *
 * Pure — no expo or RN imports — so the rule is testable off-device, like
 * goalPace.js and transactionSelection.js.
 *
 * This exists because of a real failure, and the failure was silent. The device
 * asked for `?period=30&account_id=<card>`; the server had not been deployed
 * yet, so Express dropped the parameter it did not know, computed every
 * account's spending, and answered 200. The screen rendered that under the
 * card's name: a plausible total, plausible categories, and no seam anywhere.
 *
 * A stale server is not a rare condition — it is the normal state of affairs
 * for the minutes or days between a JS reload and a backend deploy, and the
 * whole point of shipping the two separately. So the payload says what it
 * scoped to, and this checks it. Rendering "everything you spent" beneath one
 * credit card's title is the same class of defect as a count that does not
 * match its total: a number with no visible working.
 *
 * Deliberately one-directional. Asking for everything and getting everything is
 * the Analytics tab, which is most of the traffic — getting this backwards
 * would break the tab for everybody, which is why it has a test.
 */

/**
 * @param {string|null} requestedAccountId  the plaid_account_id we asked for,
 *                                          or null for every account
 * @param {object|null} payload             the /analytics/categories response
 * @returns {boolean} true when the payload is about what was requested
 */
export const scopeMatches = (requestedAccountId, payload) => {
    // Nothing to check against. The caller treats a missing payload as a
    // failure of its own; saying "mismatched" here would relabel a network
    // error as a stale server.
    if (!payload) return true;

    // No account asked for: any payload is the right shape. An older server
    // sends no `scope` at all, and that is fine — it is the answer we wanted.
    if (!requestedAccountId) return true;

    // Asked for one account, so the payload has to name it. An older server
    // sends neither `scope` nor `account`, which lands here and is reported as
    // a mismatch — correctly, because it just sent every account's spending.
    return payload.account != null && payload.account.id === requestedAccountId;
};

/**
 * What to tell somebody when it does not match.
 *
 * Names the cause rather than blaming them, and says what unblocks it. It is
 * never their fault that two halves of the app are on different versions.
 */
export const SCOPE_MISMATCH_MESSAGE =
    'Per-account analytics needs a newer version of the server than this one. '
    + 'The all-accounts view on the Analytics tab still works.';
