# Selecting and analysing one account

**Date:** 2026-09-23
**Status:** approved — implementation in progress
**Supersedes nothing.** Extends `2026-09-21-transaction-selection-and-category-override-design.md`.

---

## 1. What this is

Two features, both reuse rather than invention:

1. **Selection on the account transaction list.** `Select` in the header of
   `AccountTransactionsScreen`, exactly as it already works on
   `AllTransactionsScreen`: tap to toggle, a pinned bar shows the count and the
   running total, and Group / Category act on the selection.
2. **Analytics for one account.** An entry point on the account's balance card
   that opens the existing Advanced Analytics screen scoped to that account —
   the same categories, merchants, trends and stat tiles, counting only the
   transactions on that card or chequing account.

Neither adds a model. The first reuses `transaction_flags` (a group *is* a
flag) and `utils/transactionSelection.js`. The second reuses
`computeCategoryAnalytics` and `AdvancedAnalyticsScreen`, threading one
parameter through a pipeline that already exists.

---

## 2. Why the shared parts are extracted

Selection as shipped is about 150 lines inside `AllTransactionsScreen`: six
pieces of state, four async handlers, a pinned bar and two sheets. Copying that
into the account screen creates two copies of a feature whose third caller
(Flag Detail) is already foreseeable, and the copies would drift the way the
two category vocabularies drifted.

| New unit | What it owns | What it does not own |
|---|---|---|
| `hooks/useTransactionSelection.js` | `selectMode`, the selected id set, the busy flag, the group error, the two sheets' open state, and the `applyBulkCategory` / `createGroup` calls | anything about *one* transaction |
| `components/TransactionSelectionBar.js` | the pinned bar, the **bulk** category sheet, the group sheet | the detail sheet, and the single-transaction category sheet |

The single-transaction category sheet deliberately stays outside both. It is
driven by the detail sheet's `selectedTransaction`, not by the selection.
Folding the two together is how one sheet ends up open over a transaction it
was not about — the reason they are separate state on `AllTransactionsScreen`
today.

`utils/transactionSelection.js` is unchanged. It is already pure and already
tested; the hook is the orchestration layer above it.

`AllTransactionsScreen` is refactored onto the hook and the bar. That means
re-verifying code that shipped four commits ago, which is the cost of not
carrying two copies.

---

## 3. Selection on the account screen

### 3.1 The three things that differ from the full list

Copying the full list's implementation without these would ship three defects.

**Search is client-side here.** `AllTransactionsScreen` searches on the server,
so typing refetches and the selection is cleared as a side effect.
`AccountTransactionsScreen` computes `filteredTransactions` in memory, so
`transactions` holds rows that are not on screen. Two rules, both applied:

- the summary walks **`filteredTransactions`**, never `transactions`;
- the selection is cleared when the search text or the flag filter changes.

Either alone would be enough on a good day. The summary keeps the count-and-
total invariant if a clear is ever missed; the clear stops a selection
surviving out of sight and reappearing in a Group the user did not intend.
Select mode itself stays on, matching the full list.

**`formatTransactionsData` drops `user_category` and `merchantLabel`.** Without
them the picker cannot name the merchant in the "all of this merchant" toggle,
and a corrected row cannot be marked in the detail sheet. This is the failure
mode from the correction work two days ago: the server does the right thing and
nothing changes on screen.

**The detail sheet has no `onEditCategory`.** Adding bulk correction without it
would mean a user can recategorise twenty rows from this screen but not one.

### 3.2 Caps and copy

`PAGE_LIMIT` on this screen is 500 and `MAX_SELECTION` is 200, so the cap is
reachable in normal use. The existing bar copy applies unchanged: at the cap the
bar reads `· max 200`, and an already-selected row can always be tapped off so a
refused tap never reads as a broken row.

### 3.3 Not doing: Select all

The same reason it was left off the full list. This screen loads 500 rows as one
page, so "Select all" would mean "all loaded" while reading as "all matching".
Bulk recategorisation of one merchant remains the merchant rule's job.

---

## 4. Account-scoped analytics — server

### 4.1 The parameter

```
GET /analytics/categories?period=30&account_id=<plaid_account_id>
```

Addressed by `plaid_account_id`, never the numeric key — the same contract as
`GET /transactions`, flags, goals and category corrections.

### 4.2 What changes

`computeCategoryAnalytics(userId, periodDays, { accountId })` passes the scope
to its two reads and nothing else. Every aggregate below the fetch is JS over
the returned rows, so no aggregation logic is touched.

- **`db.getTransactions(userId, limit, { accountId })`** — adds
  `AND a.plaid_account_id = $n` to a query that already `LEFT JOIN`s accounts.
  Two callers, both in `analytics.js`.
- **`db.getMonthlySpending(userId, months, { accountId })`** — needs a join it
  does not currently have. **This is the one that matters.** The 6-month trend
  is rendered on the screen, so leaving it unscoped puts all-accounts bars
  inside a single-card view: a wrong number with no visible seam, which is the
  precise failure this codebase keeps finding by verification rather than by
  looking at it.

Both keep their existing signatures when no `accountId` is given, and the
unscoped payload must be identical to today's.

### 4.3 Authorisation

`account_id`, when present, is resolved through `db._resolveOwnedAccount` and a
miss is a 404. The filter already carries `t.user_id`, so a foreign id would
return zero rows and leak nothing either way — the explicit check only makes
"not your account" distinguishable from "no spending here".

### 4.4 AI insights are refused, not silently reused

`category_ai_insights` is unique on `(user_id, period_days)`. An account-scoped
generation would overwrite the all-accounts one and be served back under the
wrong name.

`GET /analytics/categories/insights` therefore returns
`{ source: 'unavailable', insights: [] }` whenever `account_id` is present. The
screen does not call it in account mode, so this is unreachable in normal use —
it exists so that a stray call cannot render all-accounts AI insights under one
card's heading. Enforced rather than requested, the same shape as
`_rejectSecurityMentions`.

The rule-based insights that ship inside the `/categories` payload are scoped
correctly by construction, because they are computed from the scoped
aggregates. The account view is not insight-less.

### 4.5 A note on the row cap

`computeCategoryAnalytics` reads the newest 2000 transactions and windows them
in JS. Scoping moves that cap from "2000 across every account" to "2000 on this
account", so coverage improves. The unscoped path keeps its existing limitation;
fixing it is out of scope here.

---

## 5. Account-scoped analytics — device

### 5.1 A third mode on an already dual-mode screen

`AdvancedAnalyticsScreen` renders both as the Analytics tab (`AnalyticsTab`) and
as a pushed stack screen (`AdvancedAnalytics`). It gains a third case driven by
`route.params.account`. No new route is registered: the pushed route already
takes params, and `isTab` is already false there, so the back arrow works.

- **Title** is the account's alias or name. `ScreenHeader` takes a title only and
  clips at one line, so a composed "<name> analytics" would truncate the part
  that identifies the account. The period row and the `Total spent` hero make
  the context plain.
- **The AI insights request is skipped entirely** when scoped — not fired and
  discarded. It is a Gemini call.
- **Refresh** keeps its existing best-effort Plaid sync, unchanged.

### 5.2 Credit accounts say what actually happened

On a credit card a negative amount is a payment or a refund, so the hero would
read `Income $1,240 · Net +$50` — as though the card had earned money.

When `account.type === 'credit'`:

| Unscoped / deposit account | Credit account |
|---|---|
| `Income` | `Payments & credits` |
| `Net` | `Net change` |

Label-only. The arithmetic is untouched, and `type` already arrives with the
account from `GET /accounts`, so nothing new is fetched.

### 5.3 The entry point

`AccountBalanceCard` gains an optional `onOpenAnalytics`. When passed, it renders
a labelled footer row — icon, "Analytics", chevron — below the balance and
utilisation block. When not passed it renders exactly as it does now.

A labelled row rather than a fourth header icon: the header already carries the
mask, Select and Flags, and an unlabelled glyph in a crowded row is not
discoverable. The card has exactly one consumer today, so no other screen can
shift.

---

## 6. Data flow

```
AllAccountsScreen / HomeScreen
        │  navigate('AccountTransactions', { account })
        ▼
AccountTransactionsScreen ──── Select ───► useTransactionSelection
        │                                       │
        │                                  TransactionSelectionBar
        │                                       ├─ CategoryPickerSheet (bulk)
        │                                       └─ FlagEditorSheet (group)
        │
        └── AccountBalanceCard onOpenAnalytics
                    │  navigate('AdvancedAnalytics', { account })
                    ▼
        AdvancedAnalyticsScreen
                    │  GET /analytics/categories?period&account_id
                    ▼
        computeCategoryAnalytics(userId, days, { accountId })
                    ├─ db.getTransactions(userId, 2000, { accountId })
                    └─ db.getMonthlySpending(userId, 6, { accountId })
```

---

## 7. Error handling

| Case | Behaviour |
|---|---|
| Group create fails (duplicate name → 409) | Surfaced in the sheet, selection kept. A silent failure loses a selection built by hand. |
| Bulk category fails | Logged, bar stays, selection kept. |
| `account_id` not owned | 404 from `/analytics/categories`; the screen shows its existing error card. |
| Account has no spending in the period | Existing empty state: "No spending found in this period." |
| Plaid sync refused during refresh (429 cooldown) | Already handled — the analytics load continues from the database. |
| Disconnected account | Analytics returns whatever history remains; the balance card already surfaces `needs_relink`. |

---

## 8. Testing

- **`packages/backend/tests/manual/account_analytics_sql_check.js`** — PGlite
  driving the shipped `computeCategoryAnalytics`:
  - scoping excludes another account's rows from categories, merchants and the
    summary;
  - **the monthly trend is scoped too** (the silent-wrong-number risk of §4.2);
  - a foreign `account_id` is rejected rather than answered with an empty page;
  - the unscoped payload is unchanged from today's.
- **A source-scan test** asserting every transaction list screen carries
  `user_category` through its row mapper — the `category_override.test.js`
  idiom, so a fourth screen copying the old mapper fails at that moment rather
  than in a chart nobody cross-references.
- **`transactionSelection.test.mjs`** already covers the arithmetic and the cap
  parity; unchanged.
- Mutation sweep on anything pure that is added.
- `npm test` in both packages; `npm run lint:theme` clean; ESLint compared
  against an extracted-HEAD baseline rather than read as an absolute count.

---

## 9. Defects found during implementation

*(filled in as they are found — §9 of the previous spec exists because
the design missed two things the code found. Empty until the code finds one.)*

## 10. Known limitations

- The AI insight strip is absent on account-scoped views by design (§4.4).
  Making it work needs a migration widening the `category_ai_insights` unique
  index to include the account, and one cached generation per account per
  period.
- Selection is cleared by a search keystroke on the account screen. That is
  deliberate (§3.1) and matches the full list, but the full list's clear is
  debounced by its refetch while this one is immediate.
