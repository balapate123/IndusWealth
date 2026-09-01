# CLAUDE.md

## Project Overview
- **IndusWealth**: Canada-only personal finance app (jurisdiction: Ontario, PIPEDA compliance)
- **Monorepo**: npm workspaces — `packages/backend` (Express API) + `packages/mobile` (Expo/React Native)
- **Integrations**: Plaid (CA bank aggregation), Google Gemini AI (insights), Resend (transactional email from hello@induswealth.app), Render.com (hosting), EAS (mobile builds)

---

## Architecture Map

### Backend — `packages/backend/`
| Layer | Path | Purpose |
|---|---|---|
| Entry | `index.js` | Server bootstrap |
| App | `src/app.js` | Express app config, middleware, routes |
| Routes | `src/routes/users.js` | Auth: login, signup, profile, password |
| | `src/routes/plaid.js` | Plaid link token + token exchange |
| | `src/routes/accounts.js` | Bank accounts |
| | `src/routes/transactions.js` | Transactions + Plaid sync |
| | `src/routes/debt.js` | Debt overview + snowball/avalanche calc |
| | `src/routes/analytics.js` | Spending analytics + `/analytics/categories` (advanced category analytics) + `/analytics/categories/insights` (AI insights, 6h cache) |
| | `src/routes/watchdog.js` | Recurring expense detection |
| | `src/routes/insights.js` | AI insights, dismissals, `GET /insights/spotlight` + `POST /insights/spotlight/seen` (the pop-up) |
| | `src/routes/educational.js` | Wealth Academy articles |
| | `src/routes/feedback.js` | User feedback |
| | `src/routes/twoFactor.js` | TOTP 2FA setup/verify/disable |
| | `src/routes/flags.js` | User-defined transaction flags: CRUD, bulk attach/detach, per-flag analytics |
| | `src/routes/goals.js` | Savings goals: CRUD, manual contributions, `POST /goals/milestones/check` |
| | `src/routes/cardDueDates.js` | Credit card payment due dates: list, upsert (`PUT`), delete |
| | `src/routes/nudges.js` | Weekly check-in: `GET /nudges/checkin`, `POST /checkin/seen`, `PUT /checkin/enabled` |
| Services | `src/services/db.js` | PostgreSQL pool + query helpers |
| | `src/services/plaid.js` | Plaid API client wrapper |
| | `src/services/encryption.js` | AES-256-GCM (Plaid tokens) |
| | `src/services/ai_insights.js` | Gemini AI insights generation |
| | `src/services/ai_categorization.js` | AI transaction categorization |
| | `src/services/categorization.js` | Rule-based categorization (keyword index, longest match wins) |
| | `src/services/category_map.js` | **The canonical category vocabulary.** Plaid's legacy taxonomy → our names + `mergeCanonicalRows` for SQL aggregates |
| | `src/services/debt_calculator.js` | Snowball/Avalanche algorithms |
| | `src/services/watchdog.js` | Watchdog orchestration: grouping, persistence, alerts, actions |
| | `src/services/recurrence.js` | **Pure.** The four detection gates — 3 charges, amount stability, calendar anchor, confidence. No pool, so the rules are testable as assertions |
| | `src/services/merchant_guides.js` | **The only way to reach a cancellation guide.** Slug keys (never display names) + three guide tiers; `buildGuide` never returns null |
| | `src/services/educational_content.js` | Article management |
| | `src/services/insight_data.js` | Insight aggregation |
| | `src/services/insight_identity.js` | **The stable identity of an insight.** Type enum + subject slug → `type:subject` fingerprint; dedupes a batch |
| | `src/services/insight_persistence.js` | Recurrence → prompt text and the `persistence` block; the only writer of the cost-of-inaction figure |
| | `src/services/logger.js` | Logging utility |
| | `src/services/flags.js` | Flag constants: icon allowlist, ramp size, starter set |
| | `src/services/goals.js` | Goal constants: icons, types, cadences, milestones + `newMilestones()` |
| | `src/services/goal_pace.js` | **Pure.** Required vs. actual savings rate, the projected date, and the closed `PACE_STATE` enum |
| | `src/services/cardDueDates.js` | Due-date constants: 28-day cap, lead bounds, 10-card cap |
| | `src/services/nudges.js` | **Pure** check-in selection: candidates, priority, both cooldowns, closed `NUDGE_KINDS` |
| | `src/services/price_alerts.js` | **Pure.** The price-increase rule, shared by Watchdog alerts and the insights pipeline |
| | `src/services/link_registry.js` | **The only source of outbound URLs.** Vetted destinations by key + host allowlist + safe in-app routes |
| | `src/services/link_health.js` | Probes article URLs and writes `educational_articles.url_status` |
| | `src/services/transactionSync.js` | Plaid→DB sync, shared by `GET /transactions` and the webhook (per-item in-flight guard) |
| | `src/services/flinks.js` | Flinks integration (alt to Plaid) |
| Middleware | `src/middleware/auth.js` | JWT + refresh token auth (`authenticateToken`) |
| | `src/middleware/validators.js` | express-validator input validation |
| | `src/middleware/errorHandler.js` | Centralized error handling |
| | `src/middleware/requestId.js` | Request ID injection |
| Utils | `src/utils/loginProtection.js` | Account lockout (5 failures → 15min lock) |
| | `src/utils/passwordValidator.js` | Min 8 chars, 1 uppercase, 1 number |
| | `src/utils/responseHelper.js` | Standardized API response helpers |
| Errors | `src/errors/AppError.js` | Custom error class |
| DB | `db/init.sql` | Core schema |
| | `db/add_*.sql` | Incremental migrations (run via `scripts/migrate.js`) |
| Scripts | `scripts/migrate.js` | Migration runner |
| | `scripts/encrypt-existing-tokens.js` | Backfill Plaid token encryption |
| | `scripts/backfill_ai_categories.js` | Backfill AI categorization |
| | `scripts/verify-links.js` | Probe every registry destination (`--articles` also checks the catalog). Exits non-zero on a dead destination — run after editing `link_registry.js` |

### Mobile — `packages/mobile/`
| Layer | Path | Purpose |
|---|---|---|
| Entry | `App.js` / `index.js` | App bootstrap |
| Navigation | `src/navigation/AppNavigator.js` | Auth Stack → Main Tabs (Home, Debt, Watchdog, Profile) |
| Screens | `src/screens/LoginScreen.js` | Login + 2FA flow |
| | `src/screens/SignupScreen.js` | Registration + password strength |
| | `src/screens/ConnectBankScreen.js` | Plaid Link integration |
| | `src/screens/HomeScreen.js` | Dashboard |
| | `src/screens/DebtAttackScreen.js` | Debt payoff tool |
| | `src/screens/WatchdogScreen.js` | Recurring expenses |
| | `src/screens/AnalyticsScreen.js` | Spending analytics ("Advanced" header button opens AdvancedAnalytics) |
| | `src/screens/AdvancedAnalyticsScreen.js` | Advanced category analytics: stat tiles, AI/rule-based insights, category drill-down, charts |
| | `src/screens/InsightsScreen.js` | AI insights |
| | `src/screens/ProfileScreen.js` | Profile + settings |
| | `src/screens/WealthAcademyScreen.js` | Educational content |
| | `src/screens/AllTransactionsScreen.js` | Transaction list: date range, search, flag filter, server-computed totals bar |
| | `src/screens/FlagsScreen.js` | Flag list with per-flag totals; create |
| | `src/screens/FlagDetailScreen.js` | One flag's analytics: totals, by month/category/merchant/account; edit + delete |
| | `src/screens/FlagTransactionPickerScreen.js` | Multi-select picker; saves one add/remove diff |
| | `src/screens/GoalsScreen.js` | Goal list with progress; create; notification-permission banner |
| | `src/screens/GoalDetailScreen.js` | One goal: progress, linked account, contributions; edit + delete |
| | (due dates live in the Debt tab via `components/CardDueDates.js`) | |
| | `src/screens/AllAccountsScreen.js` | Accounts list |
| | `src/screens/AccountTransactionsScreen.js` | Per-account transactions |
| | `src/screens/FeedbackScreen.js` | Feedback form |
| | `src/screens/LegalDocScreen.js` | Legal documents |
| | `src/screens/ArticleWebViewScreen.js` | Article viewer |
| Services | `src/services/api.js` | HTTP client (JWT auth, token refresh on 401) |
| | `src/services/cache.js` | AsyncStorage wrapper (24hr TTL) |
| | `src/services/plaidLink.js` | Plaid Link SDK handler |
| | `src/services/notifications.js` | Local goal reminders: permission, Android channel, cancel-and-reschedule sync |
| Hooks | `src/hooks/useAlert.js` | CustomAlert boilerplate |
| | `src/hooks/useCardDueDates.js` | Due dates CRUD; re-syncs device reminders after every mutation |
| | `src/hooks/useCheckinNudge.js` | Fetches the weekly nudge once per launch; suppressed by the spotlight |
| | `src/hooks/useTransactionFlags.js` | Flags + the attach/detach diff for the transaction sheet |
| | `src/hooks/useGoals.js` | Goals CRUD; re-syncs device reminders after every mutation |
| | `src/hooks/useInsightSpotlight.js` | Fetches the pop-up once per launch; act/snooze/dismiss |
| Components | `src/components/CustomAlert.js` | Alert component |
| | `src/components/DataFreshnessIndicator.js` | Cache freshness badge |
| | `src/components/ErrorMessage.js` | Error display |
| | `src/components/ArticleCard.js` | Article card |
| | `src/components/GoalCard.js` | Goal progress card (shared by Home and the Goals list) |
| | `src/components/GoalEditorSheet.js` | Create/edit a goal incl. tracking mode and reminder |
| | `src/components/InsightSpotlight.js` | The pop-up recommendation: ledger, action, snooze, dismiss |
| | `src/components/CardDueDates.js` | Debt-tab section: list, day picker, lead time, on/off |
| | `src/components/CheckinNudge.js` | The weekly check-in sheet: one thing, one action, a way out |
| | `src/components/ui/Treemap.js` | Part-to-whole by area (Analytics "Spending by category") |
| Constants | `src/constants/theme.js` | Dark theme + gold accents |
| | `src/constants/insights.js` | Insight type enum → icon/label/ramp slot; must mirror `insight_identity.js` |
| Utils | `src/utils/categorization.js` | Client-side category helpers |
| | `src/utils/categoryMap.js` | **Generated** from the backend map — never edit by hand; run `packages/backend/scripts/gen-mobile-category-map.js` |
| | `src/utils/goalReminders.js` | Pure reminder logic (trigger building, copy, cadence text) — no expo/RN imports so it is testable off-device |
| | `src/utils/goalPace.js` | Pure copy for the pace block; mirrors `PACE_STATE`. Never scolds, rounds, hedges |
| | `src/utils/cardDueReminders.js` | Pure due-date scheduling incl. the **lead-day wraparound** |
| | `src/utils/treemap.js` | Pure squarified treemap layout + top-7/Other folding |
| | `src/utils/syncQueue.js` | The one-at-a-time queue every reminder sync runs through |
| Tests | `packages/mobile/tests/*.test.mjs` | `npm test` — node --test, zero deps (Node 22 detects the module syntax) |
| | `packages/backend/tests/*.test.js` | `npm test` — node --test |

### Database Tables
`users`, `accounts`, `transactions`, `sync_log`, `custom_debts`, `debt_apr_overrides`, `user_insights`, `user_insight_dismissals`, `user_preferences`, `insight_actions`, `merchant_category_cache`, `ai_categorization_log`, `educational_articles`, `user_article_bookmarks`, `insight_articles`, `refresh_tokens`, `login_attempts`, `totp_secrets`, `recovery_codes`, `category_ai_insights` (migration: `add_category_insights.sql`), `transaction_flags` + `transaction_flag_links` (migration: `add_transaction_flags.sql`), `user_goals` + `goal_contributions` (migrations: `add_goals.sql`, `add_goal_baseline_at.sql` — adds `user_goals.baseline_at`), `insight_tracking` (migration: `add_insight_tracking.sql`, also adds `user_preferences.spotlight_enabled` / `.spotlight_last_shown_at`), `card_due_dates` (migration: `add_card_due_dates.sql`), `nudge_history` (migration: `add_checkin_nudges.sql`, also adds `user_preferences.checkin_enabled` / `.checkin_last_shown_at`)

### Charts
`Spending by category` on Analytics is a **treemap** (`components/ui/Treemap.js`), not a stacked bar: past about four shares a bar's segments are too thin to compare and the labels stop fitting. Layout is squarified (`utils/treemap.js`, pure + tested).
- Hue is **category identity** via `categoryColor()`, never rank — filtering or re-sorting must not repaint the survivors.
- Folds to **top 7 + Other**, per the ramp rule in `tokens.js` — unless the tail is a single category, where "Other" would be a rename.
- Labels use `TEXT_ON_CATEGORY`. **White-on-fill fails on every hue in the dark ramp** (2.84–3.49:1); the token flips per mode and clears 6:1 there. Three light-ramp hues sit near 4.1:1, which is why the category rows below the chart matter — they are the readable copy of the same numbers, alongside a per-tile a11y label.

### Transaction Categories (one vocabulary)
There were two, and the app showed both at once: our keyword patterns produced `Restaurants` / `Entertainment`, and whenever no keyword matched we returned **Plaid's raw top-level string verbatim** — `Food and Drink`, `Recreation`. Every aggregate groups by that string, so one real category occupied two rows, split on whether a merchant happened to be in a keyword list. McDonald's (keyword) and Chipotle (no keyword) are both dinner and both were filed differently.
- **`services/category_map.js` owns the vocabulary.** `CANONICAL_CATEGORIES` is closed; `canonicalizeCategory()` folds Plaid's legacy array into it. Nothing may emit a category name that did not come from there.
- **All three of Plaid's levels are consulted, most specific first**, so `Food and Drink > Restaurants > Coffee Shop` is `Coffee & Snacks` rather than collapsing to its parent. An unmapped subcategory falls back to its parent, never to `Other`.
- **Every one of Plaid's 13 legacy top-levels is mapped**, which is what makes `Other` unreachable for real Plaid data. A test asserts this — if Plaid adds a top level, it fails rather than quietly dumping a bucket into `Other`.
- **Our own names round-trip unchanged.** `analytics.js` writes `[categoryInfo.category]` back onto the transaction and re-reads it, so a canonical name must survive a second pass.
- **SQL aggregates group on the full path and merge in JS**, never `GROUP BY category[1]`. An `ORDER BY … LIMIT n` in the query ranks the *raw* vocabulary: two halves of one category can each place 8th and both fall outside a top-6 that their sum belongs at the top of.
- **Keywords match longest-first, not in declaration order.** `Transportation` is declared before `Restaurants`, so `UBER EATS` matched the 4-character `UBER` and food delivery was filed as a commute. Ties keep declaration order, so existing overlaps (TIM HORTONS) resolve as they always did.
- **The same keyword must not appear in two categories.** `LCBO`/`WINE`/`BAR`/`PUB`/`LIQUOR` sat in both `Entertainment` and `Alcohol & Bars`; the backend picked Entertainment (declared first) while mobile — which never had the duplicates — said Alcohol & Bars, so one purchase had two names depending on which side of the wire you read.
- **`packages/mobile/src/utils/categoryMap.js` is generated**, and `tests/category_map.test.mjs` loads the backend module and deep-compares both the map and the keyword tables. That parity test is what caught the Entertainment/Alcohol drift above.
- `getCategoryMeta()` canonicalizes before lookup so a **stale AsyncStorage page** holding raw Plaid names still renders the right icon instead of a gray wallet.

### Watchdog (recurring obligations)
The question is **"is this a fixed obligation?"**, not "does this merchant repeat?" — the second describes a habit as well as a commitment, which is why a gas station and a hardware store used to render as subscriptions. Four gates in `services/recurrence.js`, in the order their failure is most informative:
- **3 charges minimum.** Two give one interval, and `standardDeviation` of a single value is 0, so the weakest evidence used to score as maximally consistent.
- **Amount stability**, measured as the fraction of *adjacent* charges billing the same number — never as the spread. A subscription steps between stable runs when the price rises; a spread test would delete exactly the row the price-increase alert fires from.
- **A calendar anchor, not an interval band.** `Charged on the 14th` beats "average gap 25–35 days", which treats February as noise. **There is no `weekly`** — that band caught anything twice in ten days. A genuine weekly charge is now missed, which is the honest failure of the two.
- **Confidence gates rather than decorates.** `low` never reaches the screen.
- Three classes — `subscription` / `bill` / `fixed` — and **the class decides the buttons**, which is what structurally removes dead taps. `expense_class` is an explicit column, never inferred (the `user_goals.tracking_mode` lesson). The **variable-amount exemption is merchant-driven**: if unstable amounts alone could promote a row to `bill`, every gas station returns through that door.
- **Categories are canonical.** Watchdog had a third vocabulary; `merchant_categories.json` is now an internal guide lookup only, its values translated into canonical names on the way out.
- **A merchant key is a slug, never a display name** (`merchant_guides.js`) — the `insight_identity.js` discipline. **`buildGuide` never returns null**: the sheet only opens if a guide came back, so null meant the button flipped a hidden status and nothing appeared.
- **`keep` is stored as `keep`.** Stored as `active` it reads as "no answer" and `suggestAction` re-flags the row on the next refresh.
- Bump `ANALYSIS_VERSION` on any detector change — `getCacheFreshness` discards older caches, which is the only thing that clears stale false positives.

### Transaction Flags
User-defined groupings ("Home", "Trip to Montreal"), **distinct from `category`** — a category is inferred by Plaid/AI and single-valued; a flag is chosen by the user and a transaction can carry several.
- Colour is `color_index` into the theme's 7-hue ramp, **never a hex** — dark and light resolve different ramps from the same index. Icon is the secondary encoding once flags outnumber hues.
- Links key on `transactions.id`, which survives a sync only because `upsertTransactions` is `ON CONFLICT DO UPDATE`. Never change that to delete-and-reinsert or every user's flags detach.
- Sign convention: positive `amount` = money out. `net = SUM(amount)` = spent minus reimbursed — the number that matters for a shared expense.
- Totals are always server-side (`db.sumTransactions`, same `buildTransactionFilter` as the list). The device only ever holds one page, so never sum rows client-side.
- The flag filter uses `EXISTS`, not a join, or a row with two flags returns twice.

### Savings Goals
A target the user saves **toward**, so progress accumulates upward. Debt payoff is deliberately not a goal type — it counts downward and the Wealth tab already models it with APRs.
- `tracking_mode` (`account` | `manual`) is an **explicit column, never inferred** from `account_id` being null. Accounts are `ON DELETE SET NULL`, so inferring it would flip a disconnected goal to manual and report `$0 saved` — a real-looking measurement of nothing. Explicit, `saved_amount` comes back `NULL` and `needs_relink` is true.
- `saved_amount` is **not floored at zero**. A balance below the baseline really has lost ground. Only `progress_percent` clamps (0–100), because a bar cannot render −8%.
- `baseline_amount` is snapshotted when an account is linked, so an existing $4,000 does not instantly complete a $5,000 goal. `countExistingBalance: true` sets it to 0. **Relinking re-snapshots it** or progress is measured against another account's history.
- Accounts are addressed by **`plaid_account_id` (string)**, matching `GET /accounts` and the flag endpoints. The numeric `accounts.id` is the FK and stays inside the join. `a.user_id = g.user_id` in that join is the authorisation.
- Colour is `color_index` into the 7-hue ramp, never a hex — same rule as flags.
- `goal_contributions` has no `user_id`; the `EXISTS (SELECT 1 FROM user_goals WHERE id = $2 AND user_id = $1)` guard in the insert is what stops one user writing to another's goal.

### Goal Pace
`target_date` was stored, sorted on and rendered from the day goals shipped and nothing computed a rate from it. `services/goal_pace.js` is **pure** (`today` injected) and returns two rates and a date; `utils/goalPace.js` on the device owns what is said about them.
- **A rate we cannot measure is not reported as zero.** A disconnected goal has an *unknown* pace, a goal created last Tuesday has *none* — both distinct from stalled. Closed state enum, `unmeasurable` and `too_early` included, mirrored in `utils/goalPace.js` with a parity test. Same failure the `tracking_mode` column exists to prevent.
- **30-day observation floor.** Ten days and one $500 contribution extrapolates to $1,522/mo — arithmetic, not evidence. Same gate and same reason as the 2-sightings rule on insight persistence.
- **The window is the one the progress bar uses**, everything since `baseline_at`, not a rolling 90 days. A rolling window needs dated inflows for account-tracked goals and there are none — `current_balance` is one point in time with no history. Reading the account's transactions instead would be a second, differently-derived answer that disagrees with the first. One window means the projected date lands exactly where the bar implies.
- **`baseline_at` moves with `baseline_amount` and only with it** (migration `add_goal_baseline_at.sql`, backfilled from `created_at`). Relinking re-snapshots the baseline, so `saved` restarts near zero; dividing that by months of `created_at` history reports a confident, wrong "you have stalled". A rename must **not** touch it — the PGlite harness checks both directions.
- The lifetime average flatters a goal fed hard in October and abandoned in November. `last_contribution_at` catches it at **45 days, not 30**, or every monthly saver is called stalled once a month forever. It is ignored for account-tracked goals, whose old contribution rows survive a switch of tracking mode.
- **`node-postgres` returns DATE and TIMESTAMPTZ as `Date` objects, not strings.** `String(date).slice(0,10)` split on `-` yields nothing, so every goal read from the database reported no observation window and sat on "too early to tell" permanently, without erroring. `parseDate` takes both and reads **local** components, which is what pg builds a DATE from. Found by PGlite, not by reasoning.
- Pace is attached in `db.js`, not in the route: `getGoals` and `getGoalById` are the only two ways a goal row reaches anything. A decoration added in one route is three callers silently lacking it.
- **Copy never scolds** — the gap (`About $845/mo short of the pace`), never a verdict. The tone map has **no error colour**; missing a savings target is not a fault condition. Whole dollars and "about", and a projection names a **month, never a day** — the estimate moves a fortnight on one missed transfer.
- The due-soon countdown floors at zero *on the client*. Goal payloads cache for 24h, so a `due_soon` block can outlive its target date and the day count goes negative. Nothing on the server can produce that; only the cache can.

### Local Notifications (goal reminders)
Local, **not push** — no APNs cert, no FCM key, no server scheduler. Two iOS constraints drive the design:
- **64 pending notifications max.** Reminders are *repeating triggers rebuilt from server state* (cancel-then-reschedule in `syncGoalReminders`), never dated instances. Goals are capped at 25 server-side.
- **Content freezes at schedule time, not fire time.** Reminder copy is evergreen ("Move $25 toward Emergency Fund") and must never quote progress. Milestones need a current balance, so they are fetched via `POST /goals/milestones/check` when the app opens and presented immediately; the server records `milestones_notified` so two devices cannot both announce one.
- **Weekday conversion is off by one**: the API stores 0–6 (Sunday = 0, JS convention); expo/iOS want 1–7 (Sunday = 1). Isolated in `utils/goalReminders.js` with tests, because getting it wrong delivers every weekly reminder on the wrong day *without erroring*. Monthly days cap at 28 so nothing skips February.
- Permission is requested **when a reminder is switched on, never at launch** — iOS grants one prompt.
- **`syncGoalReminders` is serialised through a promise chain** (`reminderSyncQueue` in `services/notifications.js`); the worker is `_syncGoalReminders` and must never be called directly. Cancel-then-reschedule is not concurrency-safe: two overlapping runs interleave as cancel, cancel, schedule, schedule, so both cancels land before either schedule and **every reminder ends up scheduled twice**. Reachable in normal use — any two goal refetches close together. Both continuation handlers run the sync so one rejected run cannot wedge the queue.
- **Milestones use a two-phase protocol.** `POST /goals/milestones/check` is **read-only**; the device confirms with `POST /goals/:id/milestones` only what it actually managed to present. It used to mark them notified inside the reporting loop, so an app-open without notification permission consumed the milestone permanently and it could never fire again. Failure direction is now a duplicate celebration, never a lost one.
- `expo-notifications` is a native module, so it needs an **EAS rebuild** — but only for the native part. A **dev build** (`developmentClient: true` + `expo-dev-client`) loads JS from Metro, so JS-only changes reach it on reload with no rebuild. The "no OTA" caveat applies to standalone/production builds.

### Insight Persistence & the Spotlight Pop-up
An insight's `id` is invented by the model every generation and its `type` used to be free text, so the same condition was unrecognisable between runs. That made dismissals, recurrence, and any notion of "you have been told this before" impossible — and both `user_insight_dismissals` and `insight_actions` were **write-only tables nothing ever read**.
- **Identity is `type:subject`**, computed server-side by `insight_identity.js`. `type` is a closed enum; `subject` is a slug the model reuses from a list in the prompt. Model-authored strings are normalised, never trusted as keys — the same rule as link destinations. Drift is aliased (`dining` → `dining_out`); drift past that costs a reset streak, never a wrong one.
- **A batch is deduped before the top-7 slice.** Two phrasings of one condition would otherwise each bump `occurrence_count`, so one generation would read as two days of being ignored.
- **The cost-of-inaction figure is calculated in SQL, never by the model.** Prompt rule 30 forbids it from writing one and `insight_persistence.js` is the only thing that computes it — an invented number contradicting the recorded one is worse than none. It uses `LEAST(first_annual_benefit, annual_benefit)` so a later upward requote cannot be applied retroactively.
- **Gated at 2 sightings + 14 days + positive benefit.** Day one of a $340/yr insight is "$0.93 forgone", which is true, ridiculous, and spends the number's credibility before it matters.
- **`occurrence_count` advances at most once per 20 hours**, so pulling to refresh cannot manufacture a streak.
- **A resolved condition that returns restarts the clock** (`first_seen_at`, `occurrence_count`, `acted_at` all reset). The gap was not time spent ignoring anything.
- **`markInsightsResolved` refuses an empty batch** — that means "we learned nothing", not "everything is fixed".
- **Decoration happens on read, not at generation**, on the cache-hit path too, so a dismissal takes effect immediately and the day count is never frozen. Dismissed insights are filtered for *display* only; the ledger keeps recording that the condition persists, because a snooze hides a card, it does not stop the money leaking.
- **The spotlight reads cache only** and never triggers a Gemini call — it runs on app open. Two cooldowns: 14 days per insight, 7 days per user. `POST /spotlight/seen` starts them, sent when the sheet *renders*, not when it is fetched, or a background request would spend the user's one interruption on nothing.
- **It requires a second sighting**: a brand-new insight is already on the Insights tab, and interrupting someone with something they have not had a chance to read is just noise.
- **Never scold.** Prompt rule 31 bans the model from shaming; our own copy holds the same line (`test_insight_identity.cjs` asserts it). The user declined to act, which is their decision.
- `constants/insights.js` on mobile mirrors the backend enum. A missing key means the two drifted, not that the model improvised.

### Card Payment Due Dates
**User-entered, because there is nowhere to read them from.** Plaid's `liabilities` product carries `credit[].next_payment_due_date` and is **not enabled on our account** — `services/plaid.js` requests `transactions` only, and `routes/debt.js` already swallows the unsupported-product error. When liabilities is granted the Plaid date takes precedence and the stored value becomes the fallback; it stays useful either way (CA coverage is partial, the field is often null, and a user may want a reminder for a card they never linked).
- `target_type` (`plaid_account` | `custom_debt`) is **explicit, never inferred** from which FK is null — the `user_goals.tracking_mode` lesson. A CHECK enforces exactly one target matching the declared type.
- `due_day` caps at **28**. 29–31 do not exist in every month and a monthly repeating trigger on a missing day **does not error, it just never fires**. Same cap and reason as goal reminders. The day picker says so rather than leaving it an unexplained limit.
- **The lead-day wraparound is the bug this feature is built around.** A card due on the 2nd with 3 days' notice wants the 30th of the *previous* month; naive subtraction gives −1, and the day-28 cap does not help because the value is not too large, it is negative. `leadDay()` in `utils/cardDueReminders.js` wraps in a 28-day cycle, with tests over every (due, lead) pair. Months are modelled as 28 days deliberately — repeating triggers, not dated instances, keeps us under the 64 cap; the cost is a wrapped warning up to 3 days early in a 31-day month. Early is harmless, missing is not. Only due days 1..leadDays wrap.
- Two partial unique indexes, not one combined — **NULL is not equal to itself**, so a combined index would allow duplicates.
- Keyed on `plaid_account_id`, so **disconnecting a card keeps its due date** (`needs_relink` surfaces it). Dropping it silently is the worst failure available to a payment reminder.
- Capped at **10 cards** — 2 notification slots each, so 25 goals + 10 cards + 1 check-in ceilings at 46 of iOS's 64.
- Card reminders get their own Android channel at HIGH importance, so silencing savings nudges does not silence the one that costs money to miss.

### The Weekly Check-in Nudge
One local weekly notification with **evergreen** copy that opens the app to a live recommendation. Content freezes at schedule time, so the notification cannot name a figure — it would be a week stale and might name a deleted goal. The specific ask is fetched on open, the same split as milestones.
- **Scope is a compliance boundary, not a preference.** A nudge may reference a goal or debt **the user created**, and nothing else. No branch in `services/nudges.js` invents a destination — "put your surplus into X" is the shape that got the app rejected. Tests assert no nudge names a security or product, and that every action points at an id the user already owns.
- Priority: goal ≥90% → goal needing a relink → goal idle 21 days → **behind its own pace** → routine step → interest on a **manually entered** debt. `goal_behind` reads the `pace` block; a stalled goal outranks it because "do anything" is a clearer ask than "do more". `due_soon` earns no nudge — inside the last month there is no monthly rate to offer and the only thing left to say is that a date is about to pass. `NUDGE_KINDS` is closed, and `CheckinNudge`'s icon map is asserted against it in both directions. Plaid-derived debts are excluded: their balances move on their own, so a nudge about one can be stale by the time it is read.
- A goal that **cannot be measured** (`needs_relink`, `saved_amount` null) asks for a reconnect and quotes no figure. "Move $25 toward" a number we cannot see is worse than silence.
- Two cooldowns, both **server-owned** so two devices cannot disagree: **7 days per user**, **21 days per nudge**. Per-user is checked first, or somebody with several eligible nudges gets a different one every day. Recorded when the sheet **renders**, not when it is fetched.
- The suggested amount **never exceeds what is left**, and the user's own per-goal `reminder_amount` wins over anything computed.
- On Home the **spotlight has first claim**; the check-in is suppressed while one is showing. Two pop-ups on one app open is not two chances to help.
- Nothing about what a nudge *says* is stored — only cooldown bookkeeping. A stored nudge goes stale between write and read.

### No Investment Advice (hard product constraint)
IndusWealth is **not a registered adviser**, so it must never recommend a security. Google Play rejected the app in July 2026 under the Financial Services policy because the Financial features declaration said the app gives no personalized advice while the Insights tab recommended specific ETFs off the user's own surplus.
- **Never name a specific security anywhere** — no tickers, no fund names, not as an example, not "such as". Account *types* (TFSA, RRSP, FHSA, HISA) are fine: they are tax structures, not products.
- **Never rank or filter products by a user's own data.** `getRecommendedETFs()` and `GET /etfs/recommended` were removed for exactly this; the endpoint now returns 410 because there is no OTA and old builds still call it.
- **No ticker data is given to the model at all** (`getETFDataForPrompt` is gone). It cannot name a fund it was never handed — the same principle as the link registry.
- `_rejectSecurityMentions()` in `ai_insights.js` **drops** any insight naming a security, checking title, description, reasoning, button labels and the benefit calculation. A prompt rule is a request; this is the enforcement. `CASH` is excluded from the ticker blocklist — it is a real ticker and an ordinary word, and blocking it would delete every cash-flow insight.
- The ETF list screen stays as **education**: same order for everyone, nothing derived from the user's finances.
- No brokerage or bank product pages in `link_registry.js`. Neutral rate comparison (`ratehub_savings`) is fine; a provider signup page reached from an insight about your own balance is product steering.
- `docs/store/PLAY_STORE_LISTING.md` already promises "does not provide financial, investment, legal, or tax advice" — keep the app matching that claim, not the other way round.

### Price Increases
`generateAlerts` computed "Rogers went up $8/mo" from the user's own transactions, wrote it to `subscription_alerts`, and rendered it only on the Watchdog screen — a tab that no longer has a slot. It is the most concrete thing the app knows about anybody's money and nobody saw it.
- **`services/price_alerts.js` owns the rule**, shared with `generateAlerts`. Inline in one place, the alert and the insight could disagree about what counts as an increase, and one of them would be wrong.
- **Only the last two charges count.** A bill that spiked in June and came back down in July has not gone up; an introductory price that ended two years ago is not an increase either. Comparing against `amountHistory[0]` announces both.
- **Two floors, not one.** 5% *and* $1. Extracting the rule is what surfaced the missing dollar gate — fifty cents on a $2 subscription clears 5% and is six dollars a year.
- **Merged into the insights list before `recordGeneration`**, so price increases inherit identity, recurrence, dismissals and both spotlight cooldowns. A parallel channel would have none of that, and the spotlight is one interruption per user per week.
- **Subject is prefixed** — `price_rogers`, not `rogers` — so our measured figure and whatever the model says about Rogers spending occupy two ledger rows instead of one overwriting the other. Slug, never a display name (`merchant_guides.js` rule).
- **The benefit is the increase, not the whole bill.** Claiming the entire charge assumes they cancel; the difference is what changed and what retentions could return.
- **Freshness is `recurring_expenses.last_seen`, never the alert row.** `persistAlerts` updates an undismissed alert in place and never deletes one, so a subscription cancelled in March still carries its March alert. 45-day window.
- `DECIMAL[]` comes back from pg as **strings** — `"103" > "95"` is false lexically and the increase vanishes silently. Same family as the goal-pace `Date` bug.

### AI Insight Links
The insights prompt used to ask Gemini for "REAL, valid URLs", which is the one thing an LLM cannot do — it knows the domain and invents the path. 40% of links 404'd.
- **The model never writes a URL.** It picks a `destination` key from `link_registry.js`, and the server resolves it. An invented key resolves to null and the action degrades to an in-app route.
- **There is no escape hatch for a raw URL**, even on an allowlisted host: `moneysense.ca/save/anything-i-imagine/` passes a host check and still 404s. Missing links go in the registry, where `scripts/verify-links.js` proves they load.
- Articles work the same way: the catalog goes into the prompt as `[id] Title` and the model returns **ids**.
- `educational_articles.url_status` is written by `link_health.js` (a bounded batch after the curated sync on boot). 404/410 → `broken`; 403/429/timeout are left alone so bot-blocking cannot silently drain the catalog.
- Don't validate a URL with `new URL(str)` (proves it parses, not that it resolves) or `Linking.canOpenURL` (returns true for any `https://` on Android). Both were in place while every link was broken.

---

## Tech Stack
- **Backend**: Node.js, Express 5, PostgreSQL 15 (pg), JWT (jsonwebtoken), bcryptjs, helmet, express-rate-limit, express-validator, otplib (TOTP), qrcode
- **Mobile**: React Native 0.81.5, Expo ~54, React 19, React Navigation v6 (stack + bottom-tabs), AsyncStorage, react-native-plaid-link-sdk, react-native-svg, expo-linear-gradient, expo-notifications (local reminders only — native module, needs an EAS rebuild)
- **AI**: Google Generative AI (Gemini) — aggregated summaries only, no PII sent. Default model `gemini-3.5-flash` everywhere (the 2.0 family was retired 2026-06-01 and returns 404; never use `gemini-2.0-*`). Env overrides: `GEMINI_MODEL` (Insights tab), `GEMINI_CATEGORIZATION_MODEL`, `GEMINI_CATEGORY_INSIGHTS_MODEL`
- **Plaid**: products `transactions` only (`liabilities` pending dashboard approval — re-add when granted), country_codes `CA` only. **History depth**: `transactions.days_requested` is sent at link time (730); Plaid's default is 90 and the value is **fixed for the Item's life**, so existing connections keep their old depth until reconnected. After linking, Plaid fires `INITIAL_UPDATE` (~30 days ready) then `HISTORICAL_UPDATE` (full backfill) — `routes/plaidWebhook.js` syncs on both, which is what stops a new account being stuck at ~30 days for 24h. **That depends entirely on `users.plaid_item_id` being populated**: the item id is the only key a webhook carries, and the exchange used to store `null`, so every webhook was dropped as "an item with no matching user" and the whole path was dead from the day it shipped. Never let `exchangePublicToken` discard `item_id`. Old connections self-repair via `/item/get` on their next sync. Paired rule: **an empty pull must not stamp `last_transaction_sync`** — Plaid reports the Item ready before the backfill lands, so stamping zero rows hid a just-linked account's data for 24 hours. Still on `/transactions/get`; `SYNC_UPDATES_AVAILABLE` is handled in advance of any move to `/transactions/sync`. Production OAuth: Android link tokens use `android_package_name` (`com.induswealth.app`, must be registered in the Plaid dashboard); iOS/web use `redirect_uri`. The app sends `platform` in the `create_link_token` body
- **Email**: Resend — pattern-first templates in `services/email.js`; no `RESEND_API_KEY` = dev mode (codes logged to server console only)
- **Deployment**: Render.com (backend), EAS (mobile builds), Docker Compose (local DB)

---

## Key Commands

```bash
# Database
docker-compose up -d                    # Start PostgreSQL on port 5432

# Backend (from root or packages/backend)
npm run dev:backend                     # nodemon from root
npm run dev                             # nodemon from packages/backend
npm run migrate                         # Run DB migrations

# Mobile (from root or packages/mobile)
npm run dev:mobile                      # Expo from root
npx expo start                          # Expo dev server
npx expo start --android                # Android direct
npx expo start --ios                    # iOS direct

# Tests — node --test, no dependencies, no device, no database
npm test                                # from packages/mobile (35) or packages/backend (19)
npm run lint:theme                      # the gate that must stay clean
```

---

## Environment Variables

### Backend (`packages/backend/.env`)
```
PORT=3000
DB_HOST=localhost  DB_PORT=5432  DB_NAME=induswealth  DB_USER=induswealth  DB_PASSWORD=induswealth123
PLAID_CLIENT_ID=  PLAID_SECRET=  PLAID_ENV=sandbox
JWT_SECRET=        JWT_EXPIRES_IN=7d
GEMINI_API_KEY=    INSIGHTS_CACHE_HOURS=6
RESEND_API_KEY=    # Resend.com API key — without it, emails are only logged (dev mode)
FROM_EMAIL=IndusWealth <hello@induswealth.app>   # from-domain must be verified in Resend
GEMINI_MODEL=      # optional; default gemini-3.5-flash (2.0 family is retired — 404s)
GEMINI_CATEGORIZATION_MODEL=       # optional; default gemini-3.5-flash
GEMINI_CATEGORY_INSIGHTS_MODEL=    # optional; default gemini-3.5-flash
PLAID_DAYS_REQUESTED=              # optional; default 730 (max 730). Set at Item creation and FIXED for that Item's life — raising it does nothing for already-linked accounts, they must be reconnected
PLAID_SYNC_WINDOW_DAYS=            # optional; default 730, clamped to PLAID_DAYS_REQUESTED
PLAID_MAX_SYNC_TRANSACTIONS=       # optional; default 20000 — backstop on the pagination loop
PLAID_ANDROID_PACKAGE_NAME=        # optional; default com.induswealth.app
PLAID_OAUTH_REDIRECT_URI=          # optional; default https://induswealth.onrender.com/plaid/oauth-redirect (iOS/web only)
LINK_HEALTH_CHECK_ENABLED=   # optional; set to "false" to skip the boot link check (tests do)
LINK_HEALTH_BATCH=           # optional; default 25 URLs per boot
LINK_HEALTH_RECHECK_DAYS=    # optional; default 7 — how stale before a URL is re-probed
LINK_HEALTH_TIMEOUT_MS=      # optional; default 8000
ENCRYPTION_KEY=    # 64 hex chars (32 bytes) for AES-256-GCM
CORS_ORIGINS=      # comma-separated allowed origins (prod)
AI_CATEGORIZATION_ENABLED=false
AI_CATEGORIZATION_MIN_CONFIDENCE=0.7  AI_CATEGORIZATION_BATCH_SIZE=20
```

### Mobile (`packages/mobile/.env`)
```
EXPO_PUBLIC_API_URL=   # Override default API endpoint
```

---

## Coding Conventions

### Auth & Security
- All protected routes use `authenticateToken` middleware (Bearer JWT, 15min access + 30d refresh with family rotation)
- Plaid tokens encrypted at rest with AES-256-GCM (`services/encryption.js`, "enc:" prefix)
- Passwords hashed with bcryptjs cost factor 12
- Account lockout: 5 failures → 15min lock (`utils/loginProtection.js`)
- TOTP 2FA secrets encrypted with same AES key; recovery codes SHA-256 hashed
- Input validation via `middleware/validators.js` (express-validator) on all mutation endpoints
- 10kb body size limit, CORS restricted via `CORS_ORIGINS` env var

### Error Handling
- Custom `AppError` class (`src/errors/AppError.js`) for operational errors
- Centralized handler in `src/middleware/errorHandler.js` — all errors routed there
- Use `responseHelper.js` utilities for consistent API response shapes

### File Naming
- Backend: `camelCase.js` for all files
- Mobile screens: `PascalCaseScreen.js`; components: `PascalCase.js`
- DB migrations: `add_feature_name.sql`

### Data Patterns
- Mobile caching: two-layer — AsyncStorage (24hr TTL) + server PostgreSQL cache
- Token refresh: mutex-guarded in `api.js` to prevent concurrent refresh races
- `global.CURRENT_USER_ID` used for legacy cross-screen user ID passing
- No PII ever sent to Gemini — only aggregated financial summaries

### Test Credentials
- App: `demo@induswealth.com` / `demo123`
- Plaid sandbox: `user_good` / `pass_good`

---

## Current Status & Pending Steps (as of 2026-07-29)

Work is on `dev`. Backend deploys to Render from the deploy branch.

> **`docs/PRODUCT_BACKLOG.md` is the product backlog** — what to build next, and
> what has already been ruled out and why (section D). Read section D before
> proposing a feature; several of those ideas cost us a Play Store rejection.

**Watchdog rebuild, 2026-08-19 (on `dev`, unpushed, mobile screen NOT done).** The screen showed gas stations as subscriptions and both action buttons were dead. Root causes, all confirmed against the shipped code:
- `classifyFrequency` returned `'weekly'` for **any** average interval of 0–10 days, so any merchant visited twice in a week and a half qualified. `confidence` was computed, stored, rendered as an unlabelled dot, and **filtered nothing**. The minimum was 2 charges — one interval, whose standard deviation is 0 by definition, so the weakest evidence scored as the strongest.
- `EXCLUDED_CATEGORIES` listed `'Payment'` and `'Loan'`, filtering out exactly the commitments the feature exists to show.
- `cancellation_guides.json` is keyed on the display name `Rogers` while the detector emits `ROGERS`; **5 of 12 guides never resolved**, and 4 of those 5 were the only merchants with negotiation scripts. Negotiate worked for GoodLife Fitness alone.
- Watchdog kept a **third category vocabulary** disagreeing with `category_map.js` on every row (Netflix: Streaming vs Subscriptions; Rogers, Pioneer, Esso, Intact: all `Other`).
- `recordAction('keep')` stored `'active'`, which `analyzeForUser` reads as "no answer", so a kept row came back on the next refresh.

Fixed by `services/recurrence.js` (**pure**, no pool — the gates as assertions; 29 tests, 11 mutations all caught) plus `services/merchant_guides.js` (slug keys, tiered guides, **never returns null**). Copy was written *before* the code, as the spec: `docs/superpowers/specs/2026-08-19-watchdog-rebuild-copy.md` §12 maps each user-facing promise to the rule it obligates. Verify with `node tests/manual/watchdog_sql_check.js` (PGlite, 27 checks, drives the shipped service).

**Added 2026-08-11 (all on `dev`, none deployed):** the category treemap on Analytics, credit card payment due dates with local reminders, and the weekly check-in nudge. Three real bugs were found by verification rather than by running the app:
- `_resolveOwnedAccount` was used by the new card route but **had never been exported** from `db.js` — every card save 500'd.
- `recordNudgeShown` **table-qualified the column on the left of an `ON CONFLICT ... SET`**, which Postgres reads as a column named `nudge_history`; every `POST /nudges/checkin/seen` 500'd. Same silent write-path shape as the `PUT /insights/preferences` bug.
- A treemap mutation test passed against a deliberately broken layout because the aspect-ratio bound was guessed (6:1) rather than measured. It is now 4:1, measured against both variants across four box shapes.

**There is now a real test suite** — `npm test` in either package, `node --test`, no dependencies, no device, no database. 35 mobile + 19 backend. Node 22 detects the ESM syntax in `src/utils`, so mobile tests import the **shipped** file rather than a copy. Previous sessions' verification scripts lived in the scratchpad and were lost; these are committed.

**Working:** Advanced Analytics page (entry: "Advanced" button on Analytics header), AI category insights with rule-based fallback, `Taxes & Government` category (fixes CANADA TXD → Transportation misclassification), Resend email verification from hello@induswealth.app (domain verified, DNS on Spaceship), transaction flags, savings goals with local reminders, registry-backed insight links, insight persistence + the spotlight pop-up.

**Fixed in passing while building the spotlight** (all three were silent, all three had shipped):
- `PUT /insights/preferences` built an INSERT with one more target column than expressions (`updated_at` was pushed into the SET array that also generated the column list), so it **500'd on every call since it shipped**. Rewritten around explicit (column, value) pairs.
- `api.dismissInsight()` sent only `insight_id` while the route requires `insight_type`, so **every dismiss returned 400** and the card came back on the next load.
- `InsightCardV2`'s `TYPE_META` was keyed on long human labels the model wrote freehand, so **every card fell back to a generic bulb** and printed the raw type string above the title. Now keyed on the enum.

**A recurring shape worth naming:** several features were *built but unreachable or silently broken*, and only surfaced when the user ran a real build. Goals had exactly one entry point and it was gated on already owning a goal; dismiss had always 400'd; preferences had always 500'd; milestones were consumed by the act of checking. None of these throw. When something "doesn't work", trace the actual path before blaming the build.

**Fixed after the user tested the dev build** (`f326be9`, `ba0f778`, `24845de`, `c1e0ff4`):
- **Goals were unreachable.** The only entry point was the Home goals card, which rendered only once you already had a goal. Home now always renders the section (empty state is a tappable "Set a savings goal"), and Profile → Quick access has permanent **Goals** and **Flags** rows.
- **The per-account transaction list had no flags.** `AccountTransactionsScreen` called `api.getAccountTransactions` and summed one page client-side. Now on `api.getTransactions(?account_id=…&flag_id=…)` with the header pricetags button, the All/flag/Unflagged chip row, and server-computed totals — same contract as `AllTransactionsScreen`.
- **Deleting a goal left it on Home.** `useGoals` state is per-instance and Home is a tab that never remounts, so its copy went stale until an app restart (same for create/rename/contribute — just less visible). Home now uses `useFocusEffect` + `load({ silent: true })`, matching every other screen. That second refetch trigger is what forced the reminder-sync serialisation above.

**Build profiles (`packages/mobile/eas.json`):** `development` (dev client, **staging**), `preview` (apk, **staging**), `production` (**app-bundle** → Play upload only, cannot be sideloaded), `production-apk` (apk, internal distribution, **production** backend — the only profile that installs the real app on a phone). Every key under `build` must be a profile object: a string comment key fails schema validation and blocks all builds. Validate with `eas config --profile <name> --platform android`, not by checking the JSON parses.

**Reaching a device:** JS-only changes load from Metro on a dev build — no rebuild. Only native changes (e.g. adding `expo-notifications`) need `eas build`. Note the `development` EAS profile bakes `EXPO_PUBLIC_API_URL` pointing at **staging**, so the dev build talks to staging unless the local `.env` overrides it.

**Pending / blockers:**
0. **Play Store rejection #3 — needs an organisation developer account.** Not a code fix. The user is handling it; development continues meanwhile. (Rejections #1 and #2 had different causes — see `memory/project_play_store_rejections.md`.)
0b. **Deploy branch has drifted badly.** Production builds from `feature/web-export-fix` (`d32dee6`); `dev` is now **ten commits ahead** (standing instruction: work stays on `dev` until told otherwise). Production 404s `/insights/spotlight`, `/card-due-dates` and `/nudges`, and needs a **Manual Deploy** — auto-deploy is off. Three migrations are pending there (`add_card_due_dates.sql`, `add_checkin_nudges.sql`, `add_watchdog_classes.sql`); all are idempotent and run automatically on boot. Staging has the Track B routes but nothing since.
1. **Plaid Android OAuth (IN PROGRESS — user finishing manually)**: `PLAID_ENV=production` on Render. The Plaid dashboard login has TWO teams: "BHARGAV KIRIT MARSONIA" (personal) and "IndusWealth". The Android package name `com.induswealth.app` was mistakenly being registered under the personal team; it must be saved under Developers → API → "Allowed Android package names" in the team whose `PLAID_CLIENT_ID` matches Render's (verify via Developers → Keys — likely the IndusWealth team). Redirect URIs list was empty on the personal team, further evidence Render's keys belong to the other team. Error until done: "Android package name must be configured in the developer dashboard."
2. **Plaid Link cannot open in Expo Go** (native module missing). Testing bank connect requires a dev build: `cd packages/mobile && eas build --profile development --platform android`, then `npx expo start` and open the standalone dev app. JS-only changes need no rebuild; there is NO EAS Update (OTA) configured, so installed builds only get new JS via rebuild.
3. ~~Run `npm run migrate` against prod DB for `category_ai_insights`~~ **RESOLVED**: migrations now run automatically on every deploy. `services/db.js` `initDb()` (called on boot) and the `npm run migrate` CLI both iterate the single ordered list in `db/migrations.js`; `add_category_insights.sql` is included, so it lands on the next Render deploy. All migrations are idempotent, so the boot re-run is a safe no-op.
4. **Render env check**: if `GEMINI_MODEL` is set to a retired model (e.g. `gemini-2.0-flash`/`gemini-2.0-pro`), delete it or set `gemini-3.5-flash`. (Local `packages/backend/.env` currently pins the dead `gemini-2.0-flash` — local-only.)
5. ~~`migrate.js` MIGRATIONS list missing 8 files~~ **RESOLVED**: boot + CLI now share `db/migrations.js` (19 files, dependency-ordered) so the two lists can't drift. Add a migration by dropping the `.sql` in `db/` and appending its name there (must be idempotent).
6. `liabilities` product: request access in Plaid dashboard, then re-add to `products` in `services/plaid.js`.
7. **Gemini "thinking" was truncating JSON** (FIXED): all Gemini JSON calls now set `thinkingConfig: { thinkingBudget: 0 }` (`ai_insights.js` ×2, `ai_categorization.js`). Without it, hidden reasoning tokens exhausted `maxOutputTokens` and cut the JSON mid-string → "Unterminated string in JSON" (Insights tab 500s, silent AI-insight/categorization failures).
8. **Two years of Plaid history needs a reconnect.** `days_requested` is fixed when the Item is created, so connections made before that change still return 90 days regardless of what we ask for. Disconnect and relink to get the full depth.
9. **~126 ESLint findings** (`npm run lint` in `packages/mobile`) are a known backlog, mostly `react-hooks/static-components`, `set-state-in-effect`, and `import/no-named-as-default` on the `api` default import. `npm run lint:theme` is the gate that must stay clean and is unaffected. The single highest-value fix is hoisting `MenuItem` out of `ProfileScreen`'s render (~22 `static-components` errors in one change). **Method for keeping this honest:** the count only means something against a baseline — `git stash` the touched file, lint HEAD, then compare, rather than reading the absolute number.
10. **The check-in nudge overlaps goal reminders by design** — a per-goal reminder already says "Move $25 toward Emergency Fund" on the user's own cadence. The check-in adds value only for people who set **no** per-goal reminder, and for debt-interest nudges. Worth watching whether both firing in one week reads as nagging; the per-user cooldown does not know about goal reminders.
11. **Product-benefit matching (A5) is parked** until the app is live — user decision, on compliance grounds (see "No Investment Advice"). Goal notifications stay as-is. The affiliate question is deferred, not answered.
