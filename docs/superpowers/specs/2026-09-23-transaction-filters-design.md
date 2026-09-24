# Filtering a transaction list

**Date:** 2026-09-23
**Status:** implemented
**Extends** `2026-09-23-account-selection-and-analytics-design.md`.

---

## 1. What this is

A filter button on both transaction lists — the full list and one account's —
opening a sheet that holds:

- **an amount range** (min and/or max),
- **a date range** (from and/or to),
- **a direction** (all / money out / money in).

Plus a badge on the button so an active filter is visible without opening
anything, and a way to clear the lot in one tap.

---

## 2. The constraint that decides the architecture

**Every one of these filters runs in SQL, not in a `useMemo`.**

The totals bar is computed by `db.sumTransactions` over the *whole* matching
set, deliberately, because the device only holds one page. A filter applied on
the device produces a list and a total describing different rows — the failure
this codebase names in three separate places (`Transaction Flags`,
`Selecting Transactions`, `Category Corrections`).

So the new filters go into `buildTransactionFilter`, which is already the single
place `getTransactionsPage`, `countTransactions`, `sumTransactions` and
`getFlagAnalytics` all derive their `WHERE` from. One clause, four consumers,
no way for them to disagree.

### 2.1 The corollary: the account screen's search moves to the server

`AccountTransactionsScreen` filters search in memory while its Income/Expenses
card comes from the server. Searching there today leaves the card describing the
unsearched set. That is the same defect the new filters must not reintroduce,
and it cannot be fixed by leaving it alone: adding server-side amount filters
beside a client-side search produces a card that honours some of the sheet and
not the search box.

Moving it makes the two screens one implementation:

- `filteredTransactions` and its `useMemo` are deleted;
- the effect that clears the selection on a search keystroke is deleted — the
  clear falls out of the refetch, exactly as it does on the full list;
- `useTransactionSelection` is handed `transactions`, which is now genuinely
  the visible list.

Cost: typing gains a 350 ms debounce and a round trip. That is the same cost the
full list already pays, and it buys a total that is never wrong.

---

## 3. What each filter means

### 3.1 Amount is a magnitude, not a signed value

`min_amount` / `max_amount` compare against **`ABS(t.amount)`**.

The row renders `$42.50` whichever way the money went, so "over $100" means a
big transaction. Making it signed would mean `min_amount=100` silently excluded
every refund, and Plaid's convention (positive = money leaving) is backwards
from the one on screen, so the sign a user would reason about is not the sign in
the column. Direction is a separate control precisely so neither has to encode
the other.

`min > max` matches nothing. The sheet refuses to apply it rather than swapping
them: swapping is a different query than the one that was asked for, answered
without saying so.

### 3.2 Dates are inclusive, and do not compose with the preset window

`start_date` / `end_date` are `YYYY-MM-DD`, compared as `t.date >= $n::date` and
`t.date <= $n::date`.

The clauses AND with `days` at the SQL level, but **the client never sends
both**. `days` is relative to `CURRENT_DATE`, so `days=30` AND a range in March
is an empty list for a reason nothing on screen explains. `filterQueryParts`
omits `days` whenever either date is set, and that is asserted.

Validation is strict: the format *and* the date. `2026-02-30` parses under
`new Date()` and lands in March, which would silently widen the window.

### 3.3 Direction splits on the sign

`out` → `t.amount > 0`; `in` → `t.amount < 0`. A zero-amount row is neither, and
is excluded by both — correct, and worth stating because `>= 0` would have put
it in "out".

---

## 4. Server

### 4.1 `services/transaction_filters.js` — new, pure

The route parsed its own query string inline. Parsing moves into a pure module
so it is testable as assertions rather than through HTTP:

```
parseTransactionFilters(query) -> { accountId, days, search, flagId,
                                    minAmount, maxAmount,
                                    startDate, endDate, direction }
```

Junk is `null`, never a throw and never a default that widens the query.
`min_amount=abc` filters nothing rather than filtering everything out; a bad
date is dropped rather than becoming `Invalid Date` in a bind parameter.

### 4.2 `buildTransactionFilter` gains five optional clauses

Every existing caller passes an options object and none of them pass the new
keys, so all five are inert until asked for. `getFlagAnalytics` inherits them
for free, which is the point of there being one filter.

---

## 5. Device

### 5.1 `utils/transactionFilters.js` — new, pure

No expo or RN imports, so it is tested off-device like `goalPace.js` and
`transactionSelection.js`. It owns:

| Export | Answers |
|---|---|
| `EMPTY_FILTERS` | what "no filter" is, in one place |
| `normalizeDraft(draft)` | raw sheet text → `{ filters, errors }` |
| `activeFilterCount(filters)` | the badge, and whether Clear is offered |
| `filterQueryParts(filters)` | the query string — **and the `days` suppression of §3.2** |
| `describeFilters(filters)` | the sentence in the totals label and the empty state |

`describeFilters` matters more than it looks: an empty list under an amount
filter must say *why* it is empty, or a filter left on three days ago reads as
missing data.

### 5.2 `components/TransactionFilterSheet.js` — new

Draft state lives in the sheet, not in the screen. Nothing refetches until
**Apply**, so a half-typed `1` in the minimum does not fire a request for
everything over a dollar. The draft is re-seeded from the screen's filters each
time the sheet opens, so a dismissed edit is discarded rather than lingering.

Dates are **picked from a calendar**, not typed — see §10, which is what the
first version got wrong. Two buttons (From / To) each open `ui/Calendar` inside
the sheet, with four shortcut chips (This month · Last month · Last 3 months ·
This year) for the common windows.

`ui/Calendar` is a plain React Native grid. A native date picker would be a new
native module, and that means an EAS rebuild for a change that is otherwise
pure JS — the whole feature would stop reaching the existing dev build. All its
arithmetic is in `utils/calendar.js`, because the one thing a calendar gets
wrong is being off by one, and that does not throw: it renders a plausible
month with every date under the wrong weekday.

### 5.3 The entry point and the preset row

A funnel icon joins Select and Flags in the header, carrying a count badge when
filters are active.

On `AllTransactionsScreen` the 7d/30d/90d/1y/2y control stays. When a custom
range is set, a sixth **Custom** segment appears and is selected; tapping any
preset clears the custom dates, and tapping Custom reopens the sheet. The sixth
segment exists only while a custom range does, so the default row stays five
wide. `SegmentedControl` gains `numberOfLines={1}` so six labels cannot wrap.

`AccountTransactionsScreen` has no preset row today and does not gain one; the
sheet owns dates there, and the default stays "everything", unchanged.

---

## 6. Testing

- **`packages/backend/tests/transaction_filters.test.js`** — the parser: junk,
  boundaries, the strict date check, `2026-02-30` rejected.
- **`packages/backend/tests/manual/transaction_filter_sql_check.js`** — PGlite
  driving the shipped `getTransactionsPage` / `countTransactions` /
  `sumTransactions`, asserting **the page and the totals describe the same rows
  under every filter** — the invariant of §2, executed rather than argued.
- **`packages/mobile/tests/transactionFilters.test.mjs`** — the pure util,
  including that `days` is dropped when a date range is set.
- Mutation sweep over the new pure modules.
- `npm test` both packages, `lint:theme` clean.

---

## 7. Not doing

**A category filter.** The category on a row is derived on read — `user_category`,
then a keyword match on the merchant name, then Plaid's path canonicalized.
Reproducing that in SQL means porting `KEYWORD_INDEX`, which is a sixth
implementation of the vocabulary and the exact drift `category_map.js` exists to
prevent; it would silently disagree with the rows on screen. Advanced Analytics
already offers category drill-down, which is the same question asked where the
derivation already happens.

**Persisting filters.** They reset when the screen unmounts. A filter that
outlives the visit to the screen is a list that is wrong on arrival for a reason
set in another session.

---

## 8. Found during implementation

**The mutation runner was wrong twice before it meant anything**, and both
failures reported as success:

1. `String.replace` treats `$$` in the *replacement* as an escape for a single
   `$`. Every pattern here contains `$${params.length}`, so the replacement
   silently produced `${params.length}` — the SQL lost its placeholder and
   became `t.amount >= 2::numeric`. Five mutations were then "caught" by
   Postgres throwing, which proves nothing about whether the checks
   discriminate. Fixed with a replacer **function**, which is not scanned for
   those escapes.
2. `db.js` is CRLF. The three multi-line "drop the clause entirely" patterns
   matched nothing and reported as skipped.

Same shape as the goal-pace sed patterns that contained a newline escape and so
had never applied. A mutation runner needs its own sanity check — which is why
the runner now reports `never validly applied` as a distinct outcome from
`survived`, instead of quietly not counting.

After both fixes: **11 mutations, 11 caught on real assertions.**

**`SegmentedControl` guarded `onChange` behind `if (!active)`.** The "Custom"
segment is selected exactly when a custom range is set, so it could never be
tapped — a segment visibly present and doing nothing. Adding `allowReselect`
opt-in rather than removing the guard: six of the seven other callers treat a
segment as a value, where re-selecting it is genuinely nothing.

## 9. Known limitations

- **Searching by category no longer works on the account screen.** Its
  in-memory filter matched the *displayed* category; the server's search matches
  name, merchant, notes and amount. This makes the two screens consistent — the
  full list never searched categories — but it is a capability lost on that one
  screen. It is not recoverable in SQL for the reason in §7: the displayed
  category is derived, and matching Plaid's raw array instead would hit a
  different set of rows than the ones showing that name. Category slicing lives
  on Advanced Analytics, which is now per-account.
- The account screen still loads one 500-row page. Filters narrow what counts
  toward that cap, so coverage improves; the cap remains.

---

## 10. Found on a device: the keyboard covered the sheet

Typed `YYYY-MM-DD` fields were the wrong call, and only a real phone showed it.
The numeric keypad covered the bottom half of the sheet — the second date
field, the preset chips, the direction control and both buttons. Nothing in a
test could have caught it.

Two independent fixes, because it was two independent bugs:

**`BottomSheet` never accounted for the keyboard at all.** It is anchored to
the bottom, which is exactly where the keyboard appears, so this was covering
the buttons of *every* sheet with a text field — `FlagEditorSheet`,
`CategoryPickerSheet`, `GoalEditorSheet`. It now measures the keyboard height
from `Keyboard` events and applies it as a bottom margin, shrinking `maxHeight`
by the same amount.

Measured rather than delegated to `KeyboardAvoidingView`: that behaves
differently per platform, and inside a `Modal` with a translucent status bar
Android's `adjustResize` does not reach it — which is why nothing moved on the
device in the first place. The keyboard's own reported height is the one number
true on both platforms. `maxHeight` shrinks in pixels, not as a percentage: a
percentage is of the whole screen, so the sheet would grow past the top of the
visible area rather than scroll inside it.

**Dates stopped needing a keyboard.** `ui/Calendar` renders the month inside the
sheet. `maskDateInput` and its test were deleted rather than left unreferenced.

The calendar's visible month is seeded once and remounted by `key` when the
caller wants it moved — never followed by an effect. An effect anchored on the
start date would drag the grid back to March the moment you paged to April to
pick an end. That also keeps the file free of an `exhaustive-deps` suppression,
which `lint:theme` rejects outright (pending item 8b: that config does not load
`react-hooks`, and ESLint errors on a disable naming a rule it cannot find).
