# Transaction selection, and correcting a category

**Date**: 2026-09-21
**Status**: implemented (`98a1756`, `6d22a02`, `455ad71`)

Two features that meet in the middle. Selecting several transactions to total
them — and optionally keep them as a group — and correcting a category the app
got wrong. They share a surface (the selection), so they are specified together.

---

## 1. What is actually being built

### 1.1 Selection

On **All transactions**, a `Select` control puts the list into selection mode.
Tapping rows toggles them. A pinned footer shows how many are selected and what
they add up to. Two actions sit in that footer:

- **Group** — name the selection and keep it.
- **Category** — set one category across the whole selection.

The total is the point. The group is the optional upgrade.

### 1.2 A group is a flag

`transaction_flags` already models a user-named grouping that a transaction can
belong to several of, with its own totals and analytics. CLAUDE.md's own example
for a flag is *"Trip to Montreal"*. This is the same concept, reached from the
other direction: today you open a flag and add transactions; now you can pick
transactions and make a flag.

**No new data model.** Group opens the existing `FlagEditorSheet`, then calls
`createFlag` followed by `setFlagTransactions(id, { add })`. Naming a group
should look identical to naming a flag, because it is one.

### 1.3 Correcting a category

Two entry points, one picker:

- **One transaction** — from the detail sheet, with an opt-in to apply the same
  correction to every transaction from that merchant, past and future.
- **A selection** — bulk, per-transaction only.

---

## 2. The problem this has to solve

The category a user sees **is not stored**. It is derived on every read by
`categorizeTransaction()`: keyword patterns first, then Plaid's taxonomy folded
through `category_map.js`, then the AI merchant cache, then a default.

Five modules derive it independently, and they do not all take the same route:

| Consumer | How it derives |
|---|---|
| `routes/transactions.js:124` | `categorizeTransaction()` (JS, per row) |
| `routes/analytics.js:275,293` | `categorizeTransaction()` (JS, per row) |
| `services/db.js:755` | SQL `GROUP BY category_path` → `mergeCanonicalRows` |
| `services/insight_data.js:160` | SQL `GROUP BY category_path` → `mergeCanonicalRows` |
| `services/watchdog.js` | `resolveCategory` over the raw array |

An override that only reaches the JS path makes the transaction list say `Gas`
while the treemap still says `Other`. That is the two-vocabularies bug this
project already spent a release removing, arriving through a different door.

**Therefore: one choke point, and a test that fails when something bypasses it.**

`upsertTransactions` already excludes `category` from its `ON CONFLICT DO UPDATE`
(only `name`, `amount`, `pending` are refreshed), so a sync cannot clobber a
correction. That is existing behaviour this design depends on — do not add
`category` to that SET list.

---

## 3. Data model

Migration: `db/add_transaction_category_override.sql`.

### 3.1 `transactions.user_category VARCHAR(50)` — nullable

The correction, as a canonical category name.

Plaid's `category` array is **never overwritten**. Keeping it means the
derivation still works underneath, a correction is reversible, and the original
is available if the mapping improves later. Writing the canonical name into
`category[]` would also put a third vocabulary into a column that holds Plaid's.

A **partial** index on `(user_id, user_category) WHERE user_category IS NOT NULL`.
Corrections will be a small fraction of rows; indexing the nulls is waste.

### 3.2 `merchant_category_rules`

```
id, user_id, merchant_key, merchant_label, category, created_at, updated_at
UNIQUE (user_id, merchant_key)
```

- `merchant_key` — the output of `normalizeMerchantName`, uppercase and
  stripped. It is a key, not prose.
- `merchant_label` — what to show a person. The key is an uppercase stripped
  form nobody wants to read, and resolving display from the key would lose the
  spacing and casing the statement actually had.
- `category` — no `CHECK`. The canonical list lives in JS; a database copy of it
  would drift. Validated in `middleware/validators.js` against
  `CANONICAL_CATEGORIES`, the same way goal icons and types already are.

### 3.3 Why the rule is materialised, not joined

A merchant rule writes `user_category` onto every matching existing row when it
is created, and is applied to new rows during sync. The column is therefore
self-contained: **the SQL aggregates need no join at all**, just one more column
in the `SELECT`.

The alternative — a join at read time — needs merchant normalisation in SQL,
which is JS logic today. Two implementations of one rule is exactly how the
`Entertainment` / `Alcohol & Bars` keyword drift happened.

The cost is a bulk `UPDATE` when a rule is created, and the possibility of the
rule and the materialised rows drifting if a rule is removed. Section 6.3
handles removal by re-deriving.

---

## 4. `services/merchant_identity.js` (extraction)

`normalizeMerchantName` is currently a **method on the Watchdog class**, so
nothing else can use it and nothing tests it directly. It strips store numbers
(`PIONEER #0421`), `*` suffixes (`SPOTIFY *FAMILY`), `.COM`/`.CA`/`INC`/`LTD`
tails, transaction prefixes (`POS `, `PREAUTHORIZED `), and applies
`merchant_aliases.json`.

"All Pioneer" only works if `PIONEER #0421` and `PIONEER #0388` resolve to the
same merchant, so this is load-bearing for the feature.

Extracted as a pure module exporting:

- `normalizeMerchantName(raw)` — unchanged behaviour, now testable.
- `merchantKeyFor(tx)` — `normalizeMerchantName(tx.merchant_name || tx.name)`.

Watchdog's method delegates to it. **One implementation**, and a third merchant
normaliser is not written.

---

## 5. The choke point

`category_map.js` gains:

```js
effectiveCategory(row)  // row.user_category || canonicalizeCategory(row.category)
```

Every consumer goes through it.

- **`categorizeTransaction`** gains a Layer 0 above the keyword pass, reading
  `transaction.user_category`. No extra query — the column arrives on the row.
  This covers both JS consumers.
- **The two SQL aggregates** add `user_category` to the `SELECT` and `GROUP BY`;
  `mergeCanonicalRows` gains an `overrideKey` option and prefers it when present.
- **Watchdog's `resolveCategory`** routes through the same helper.

### 5.1 `getCategorySpending` is deleted

`db.js:780` groups on `category[1]`, which CLAUDE.md explicitly bans, and is
**exported but called from nowhere**. It is the one query that would silently
disagree with every other surface. Deleted rather than taught about overrides.

### 5.2 The bypass test

`effectiveCategory` is only correct if everything uses it. A test scans the
backend source for a transaction row being canonicalised directly outside the
helper and fails on a new consumer that skips it.

Same idea as the `NUDGE_KINDS` icon-map parity check: it fails at the moment of
drift rather than in a chart nobody cross-references.

---

## 6. Endpoints

### 6.1 `PATCH /transactions/:id/category`

`{ category, applyToMerchant?: boolean }`

Sets `user_category` on the row. When `applyToMerchant` is true, upserts a rule
and writes it across matching history.

Returns the updated transaction and **how many other rows moved**, so the UI can
say *"and 23 other Pioneer transactions"* rather than claiming an unknown number.

### 6.2 `POST /transactions/category`

`{ transactionIds: number[], category }` — bulk, for selection mode. Capped at
**200** ids.

**Per-transaction only; it never creates a merchant rule.** A selection spans
merchants, so inferring a rule from one would be guessing at intent.

### 6.3 `DELETE /transactions/:id/category`

Reverts to the derived category. If a merchant rule covers this transaction, it
removes the rule and clears `user_category` from every row that rule had
written, so the rule and the materialised state cannot drift apart.

Without this, a merchant rule created by mistake has no way out. A rules
management screen is **deliberately out of scope** — reverting from any affected
transaction is the smallest thing that avoids the dead end.

### 6.4 Rules at sync

After `upsertTransactions` writes a chunk, it applies the user's rules to the
just-upserted ids **where `user_category IS NULL`**, so it never overwrites a
per-transaction correction and is safe to re-run.

Keeping this in the write path is what makes the column self-contained.

---

## 7. Mobile

### 7.1 Selection state

`selectMode: boolean` and a `Set` of transaction ids on `AllTransactionsScreen`.
`Select` sits in the header beside the existing count and pricetags button. While
on, the header title becomes `"{n} selected"` and Back becomes Cancel.

### 7.2 The footer

Pinned above the list, carrying the count, the total, and the two actions. Same
pattern as `FlagTransactionPickerScreen`, which already pins a running total and
a save button.

**The total is summed on the device.** This is a deliberate exception to the rule
that totals come from `db.sumTransactions`. That rule exists because the device
holds one page and cannot see the rest — but a selection *is* a set of rows the
user ticked in the list, so every one is in memory by construction. The picker
screen already does this, for the same reason.

The figure is `SUM(amount)` — net, positive being money out — matching the flag
convention, so a selection containing a refund reads the way the flag would.

### 7.3 Changing a filter clears the selection

Range, search and flag filter all clear it. Keeping the selection would mean a
total counting rows no longer on screen: a number with no visible working, which
is the one thing this codebase consistently refuses to render.

Filtering first and then selecting is unaffected, and that is the useful order.

### 7.4 No "Select all"

The list is paged, so it would mean "all loaded" while reading as "all matching".
The case that motivates it — forty Pioneer fill-ups — is better served by the
merchant rule. **Omitted deliberately, not forgotten.**

### 7.5 `CategoryPickerSheet`

One new component, listing `CANONICAL_CATEGORIES` with the icons and colours
`categoryMap.js` already carries. Used by both entry points so there is one way
to pick a category.

From the **detail sheet** it carries a footer toggle — *"Also apply to all
Pioneer"* — **off by default**. One screen, safe default, one tap to upgrade.

### 7.6 The detail sheet

The Category row at `TransactionDetailSheet.js:121` becomes tappable. When a
transaction carries a correction, the row is marked and offers an undo. If a
merchant rule covers it, the undo confirms first, because removing that rule
restores every transaction it touched — not just this one.

### 7.7 Caches

The transaction list and analytics both hold 24-hour AsyncStorage copies. Both
are cleared after any category mutation, or the old category shows until
tomorrow.

---

## 8. Testing

| What | Where |
|---|---|
| Merchant normalisation — store numbers, `*FAMILY`, `.COM`, prefixes, aliases, null | `tests/merchant_identity.test.js` |
| `effectiveCategory` precedence; `mergeCanonicalRows` with overrides | `tests/category_override.test.js` |
| **Bypass scan** — no consumer canonicalises a transaction row directly | `tests/category_override.test.js` |
| Migration against a populated table; bulk update; rules at sync; revert clearing rule **and** rows; another user's id changing nothing | `tests/manual/category_override_sql_check.js` (PGlite) |
| Selection maths — toggle, total, mixed signs, clear | `packages/mobile/tests/transactionSelection.test.mjs` |

Selection maths moves into `src/utils/transactionSelection.js` so it is testable
off-device, matching `goalPace.js` and `treemap.js`.

Every pure module gets a mutation sweep before it is called done.

---

## 9. Consequences worth stating

**Watchdog treats `Utilities` and `Insurance` as bill categories.** Correcting a
merchant into `Utilities` can therefore promote it into being tracked as a
recurring bill. This is intended — the user said what it is — but it is not
obvious from the edit screen.

**A merchant rule rewrites history.** That is what "past and future" means, and
it is why the opt-in is off by default and why the result reports the number of
rows it moved.

---

## 9a. What implementation found that the design did not

Two defects the design could not have caught, both of which would have shipped
as "built but silently does nothing" — the failure shape CLAUDE.md already names
as this project's recurring one.

**The device derives its own category.** `utils/categorization.js` runs the same
layers in the same order as the server, keyword pass first, so a correction
stored server-side never reached the screen: `UBER EATS` corrected to
`Transportation` kept rendering as `Restaurants`. The device needed a Priority 0
of its own, mirroring the backend's. A cross-package test now asserts the two
agree for every category a user can pick.

**The endpoints took the wrong id.** They were written against
`transactions.id`, the numeric primary key. Every other write this app makes to
a transaction — notes, flags — is addressed by `plaid_transaction_id`, because
`GET /transactions` aliases the numeric one away as `transaction_id` before the
device ever sees it. As written, every correction would have matched nothing and
returned a cheerful success. The PGlite harness now has a check that the numeric
key is not a way in.

A third, smaller one: `merchantLabel` is sent from the server rather than
derived on the device, because normalising a merchant name is backend logic and
a third implementation of it is how this project got two category vocabularies
in the first place.

## 9b. Known limitation

**Removing a merchant rule clears that merchant's corrections wholesale**,
including a row the user had separately corrected by hand *after* the rule
existed. Provenance is not stored, so "written by the rule" and "corrected
afterwards" are indistinguishable, and the wider answer wins.

The confirmation names how many rows will be restored, so the cost is visible
before it is paid. Storing provenance would fix it properly and is not worth a
column until somebody hits it.

## 10. Explicitly not in scope

- A rules management screen (§6.3 explains what replaces it).
- User-defined categories. `CANONICAL_CATEGORIES` stays closed; flags are the
  escape hatch for groupings the vocabulary does not carry.
- "Select all" (§7.4).
- Attaching a selection to an *existing* flag —
  `FlagTransactionPickerScreen` already does this from the other direction.
