# IndusWealth — Product Backlog

**Last updated**: 2026-08-19

What to build next and, just as importantly, what has already been ruled out and
why. `PRODUCTION_ROADMAP.md` is the February 2026 launch-hardening audit and is a
different document; this one is about product.

Section D is the one to read before proposing anything new. Several of those
ideas look attractive and have already cost us a Play Store rejection.

---

## A. Watchdog rebuild — in flight

The screen was showing gas stations as subscriptions and its two action buttons
did nothing. Diagnosis, design and backend are done; the mobile screen is not.

### Done (on `dev`, unpushed)

| Commit | What |
|---|---|
| `1cf74f5` | The copy, written first as the spec — `docs/superpowers/specs/2026-08-19-watchdog-rebuild-copy.md` |
| `adca102` | `services/recurrence.js` — pure detector, 29 tests, 11 mutations all caught |
| `c42180c` | Spec addendum §14–16: one vocabulary, slug guide keys, notification design |
| `cb55c5a` | Wiring — canonical categories, slug guides, `expense_class` column, Keep sticks |
| `4a0f1dd` | The mobile screen — three sections, class-gated buttons, evidence lines, intro card, sheet copy |

Verified with `node tests/manual/watchdog_sql_check.js` (PGlite, 27 checks,
drives the shipped service with `pool.query` redirected).

### 1. The mobile screen — DONE (`4a0f1dd`)

Sections with subheads, evidence lines, class-gated buttons, `Keep` surfaced for
the first time, canonical filter chips, both sheets opening with "we can't cancel
it for you", competitor blocks cut, intro card.

Two things deliberately deferred to the watch loop, and they are the reason it
should be next:

- **No "we'll check your next statement" anywhere.** Nothing checks yet, and
  shipping that promise before the loop exists is the exact failure this rebuild
  is undoing. The cancel sheet says only "We'll mark it as cancelled here".
- **The hero number is committed spend, not confirmed savings.** Committed spend
  is measured and true today; confirmed savings would read `$0` forever until the
  loop lands. Swap it then — the comment in `WatchdogScreen.js` says so.
- `snooze` is still unsurfaced. `Keep` and `undo` are wired.

### 2. The watch loop — do this next (~half day, backend)

What makes the buttons worth pressing.

- A `watching` state carrying the expected charge date.
- Resolution: no charge → *"Netflix stopped, $16.49 a month back"*; charge →
  *"Netflix charged you again"*, benign explanation first.
- Replace `potential_savings` (today a counterfactual — money the user said they
  would save) with **confirmed** savings.
- Read-only check endpoint plus a separate confirm, the milestone two-phase
  pattern, so an app-open without notification permission cannot consume the
  event permanently.

### 3. Notifications (~half day)

Design is settled in spec §16. Content freezes at schedule time, so the body can
never carry the outcome.

- Dated one-shot per watch, evergreen body, fires expected date **+ 3 days**.
- Android HIGH-importance channel, like card due dates.
- Cap 8 concurrent (ceiling becomes 54 of iOS's 64), through `reminderSyncQueue`.
- Server records what was actually presented.

### 4. Loose ends

- "How Watchdog works" article in Wealth Academy — the long-form home for *why
  isn't X in my list*.
- Retention phone numbers: verify them the way `link_registry.js` verifies URLs,
  or cut them and keep the scripts. Phone numbers rot like links do.
- **Ontario fitness-contract line needs a legal check** before it ships.
- Move Watchdog out of the Profile menu. It used to be a tab, and it is the
  feature with the clearest dollar value.
- Strip `alternatives` from `cancellation_guides.json` itself, not just the
  render path.

---

## B. Goals — the missing half is pace

`target_date` is stored, sorted on, and displayed as a date on GoalDetail.
Nothing computes a rate. Every goal answers *how much have I saved* and none
answers **am I going to make it**.

### 1. Required vs. actual pace

`(target − saved) ÷ months remaining` → *"$210/mo to hit this by March."* Compare
to the actual contribution rate over the last 90 days → *"you're averaging $170,
about $40/mo behind."*

Pure arithmetic on existing columns. No schema change, no Plaid, no notification
budget. It also upgrades the check-in nudge and the spotlight for free, because
*"you're $40/mo behind on Emergency Fund"* is a legitimate, user-owned, entirely
non-advisory ask.

### 2. Auto-detect contributions

Manual goals decay because people forget to log. The Watchdog engine detects
recurring charges — run it with the sign flipped and it detects recurring
transfers *into* the linked account. *"We saw $200 into your savings on the 1st.
Count it toward Emergency Fund?"* Same detector, opposite sign; reuses
`services/recurrence.js` wholesale.

### 3. Round-up as a ledger, not a transfer

We cannot move money and should not. But we can compute *"rounding up every
purchase this month would have been $34"* and offer it as one logged
contribution. The only gamification here that is not fake.

### 4. Give completion a moment

`achieved_at` and `status = 'achieved'` are stored and nothing celebrates. A
completed goal deserves a real screen — how long it took, the contribution
history, the milestones. Retention is made of moments and every input is already
stored.

**Not worth building:** streaks (they punish, and they collide with the
never-scold rule the insights prompt already enforces), goal templates, social
sharing.

---

## C. New features, ranked

### 1. Income detection — start here

Nothing in the app understands a paycheque. It is the same detector on credits
instead of debits, and it unlocks everything below it.

### 2. "Safe to spend" — 30-day cash-flow forecast

Recurring expenses with predicted dates, card due dates, goal cadences, and up to
730 days of history. Project forward: *"$1,240 of known bills before your next
pay; $380 uncommitted."* This is the question people actually open a finance app
to ask, and we hold more of the inputs than most apps do. Arithmetic on the
user's own money — not advice.

### 3. Promote the price-increase alert

Already computed in `generateAlerts` and visible only inside a screen nobody
opens. *"Rogers went up $8/mo"* is spotlight-worthy and derives entirely from the
user's own data.

### 4. Year in review / merchant deep-dive

730 days of history is now available and unused. Cheap, shareable, zero
compliance surface.

### 5. Household / shared mode

`transaction_flags` already models "Trip to Montreal". Real, but a quarter of
work, not a week.

---

## D. Explicitly not building

Read this before proposing a feature. These are settled decisions with reasons,
not open questions.

| Idea | Why not |
|---|---|
| **Anything that ranks a financial product against user data** | Exactly what caused Play rejection #2. See "No Investment Advice" in `CLAUDE.md` — no tickers, no fund names, not as an example. |
| **Credit score** | Bureau licensing, and it is the feature that turns a finance app into lead generation. |
| **Envelope budgeting** | Expensive to build, historically poor retention, and Analytics already covers most of the value. |
| **Bill negotiation as a service** (we negotiate for you) | A regulated activity and an unbounded support burden. We provide the script; the user makes the call. |
| **Streaks** | They punish, and they contradict the never-scold rule enforced elsewhere. |
| **Product-benefit matching (A5)** | Parked by user decision on compliance grounds until the app is live. The affiliate question is deferred, not answered. |

---

## E. Blocked on something outside the code

- **Play rejection #3** — needs an organisation developer account. User is
  handling it.
- **`induswealth.app/privacy`** (other repo) — still claims "Liability data",
  lacks the Plaid End User Privacy Policy link, Resend, and the cross-border
  notice. This is the URL submitted to Plaid.
- **Plaid Android package name** — `com.induswealth.app` must be registered under
  the *IndusWealth* team, not the personal one.
- **Render Manual Deploy** — auto-deploy is off. Three migrations pending there
  (`add_card_due_dates`, `add_checkin_nudges`, `add_watchdog_classes`); all
  idempotent and run on boot.
- **Dev build over Metro** — a production APK will not pick up any of the mobile
  work. There is no OTA.
