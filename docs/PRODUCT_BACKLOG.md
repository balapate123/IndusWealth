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
did nothing. Everything on the critical path is done — detector, screen, watch
loop, notifications. Only the loose ends in section 4 remain.

### Done (on `dev`, unpushed)

| Commit | What |
|---|---|
| `1cf74f5` | The copy, written first as the spec — `docs/superpowers/specs/2026-08-19-watchdog-rebuild-copy.md` |
| `adca102` | `services/recurrence.js` — pure detector, 29 tests, 11 mutations all caught |
| `c42180c` | Spec addendum §14–16: one vocabulary, slug guide keys, notification design |
| `cb55c5a` | Wiring — canonical categories, slug guides, `expense_class` column, Keep sticks |
| `4a0f1dd` | The mobile screen — three sections, class-gated buttons, evidence lines, intro card, sheet copy |
| `2332349` | The watch loop — did the cancellation stick, confirmed savings, outcome cards |
| `ed1defd` | Notifications — dated one-shot per watch, evergreen body, own HIGH channel |

Verified with `node tests/manual/watchdog_sql_check.js` (PGlite, 68 checks,
drives the shipped service with `pool.query` redirected), plus 101 backend and 64
mobile unit tests.

### 1. The mobile screen — DONE (`4a0f1dd`)

Sections with subheads, evidence lines, class-gated buttons, `Keep` surfaced for
the first time, canonical filter chips, both sheets opening with "we can't cancel
it for you", competitor blocks cut, intro card.

Both sheets now promise the check, and the hero is confirmed savings, because
the watch loop below landed. `snooze` is still unsurfaced; `Keep` and `undo` are
wired.

### 2. The watch loop — DONE (`2332349`)

`services/watch.js` (pure), `watchdog_watches`, `GET /watchdog/watches/outcomes`
plus `POST /:id/seen`, outcome cards on the screen, and `confirmed_savings`
replacing the counterfactual in the hero slot.

The defect worth remembering: a watch whose predicted charge date was already in
the past resolved as *confirmed stopped* on the next analysis having observed
nothing — and resolving it freed the partial unique index, so a second watch
could open on the same expense and count one saving twice. Any user cancelling
something after its due date hits it. The window is now measured from whichever
of the action and the expected charge came later, and `openWatch` rolls a stale
prediction forward.

### 3. Notifications — DONE (`ed1defd`)

`utils/watchReminders.js` (pure), a `watchdog-outcomes` Android channel at HIGH,
and `syncWatchReminders` through the shared queue. Dated one-shot, fires expected
+ 3 days, capped at 8 (app ceiling now 54 of 64).

`WATCH_GRACE_DAYS` in `utils/watchReminders.js` must stay equal to `GRACE_DAYS`
in the backend's `services/watch.js`. If they drift the notification arrives
before the outcome exists and the user opens the app to a watch still running. A
test asserts the mobile value; nothing asserts they match each other.

### 4. Loose ends — all that is left

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
