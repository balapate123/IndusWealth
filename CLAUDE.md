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
| | `src/routes/insights.js` | AI-generated financial insights |
| | `src/routes/educational.js` | Wealth Academy articles |
| | `src/routes/feedback.js` | User feedback |
| | `src/routes/twoFactor.js` | TOTP 2FA setup/verify/disable |
| | `src/routes/flags.js` | User-defined transaction flags: CRUD, bulk attach/detach, per-flag analytics |
| | `src/routes/goals.js` | Savings goals: CRUD, manual contributions, `POST /goals/milestones/check` |
| Services | `src/services/db.js` | PostgreSQL pool + query helpers |
| | `src/services/plaid.js` | Plaid API client wrapper |
| | `src/services/encryption.js` | AES-256-GCM (Plaid tokens) |
| | `src/services/ai_insights.js` | Gemini AI insights generation |
| | `src/services/ai_categorization.js` | AI transaction categorization |
| | `src/services/categorization.js` | Rule-based categorization |
| | `src/services/debt_calculator.js` | Snowball/Avalanche algorithms |
| | `src/services/watchdog.js` | Recurring expense logic |
| | `src/services/educational_content.js` | Article management |
| | `src/services/insight_data.js` | Insight aggregation |
| | `src/services/logger.js` | Logging utility |
| | `src/services/flags.js` | Flag constants: icon allowlist, ramp size, starter set |
| | `src/services/goals.js` | Goal constants: icons, types, cadences, milestones + `newMilestones()` |
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
| | `src/hooks/useTransactionFlags.js` | Flags + the attach/detach diff for the transaction sheet |
| | `src/hooks/useGoals.js` | Goals CRUD; re-syncs device reminders after every mutation |
| Components | `src/components/CustomAlert.js` | Alert component |
| | `src/components/DataFreshnessIndicator.js` | Cache freshness badge |
| | `src/components/ErrorMessage.js` | Error display |
| | `src/components/ArticleCard.js` | Article card |
| | `src/components/GoalCard.js` | Goal progress card (shared by Home and the Goals list) |
| | `src/components/GoalEditorSheet.js` | Create/edit a goal incl. tracking mode and reminder |
| Constants | `src/constants/theme.js` | Dark theme + gold accents |
| Utils | `src/utils/categorization.js` | Client-side category helpers |
| | `src/utils/goalReminders.js` | Pure reminder logic (trigger building, copy, cadence text) — no expo/RN imports so it is testable off-device |

### Database Tables
`users`, `accounts`, `transactions`, `sync_log`, `custom_debts`, `debt_apr_overrides`, `user_insights`, `user_insight_dismissals`, `user_preferences`, `insight_actions`, `merchant_category_cache`, `ai_categorization_log`, `educational_articles`, `user_article_bookmarks`, `insight_articles`, `refresh_tokens`, `login_attempts`, `totp_secrets`, `recovery_codes`, `category_ai_insights` (migration: `add_category_insights.sql`), `transaction_flags` + `transaction_flag_links` (migration: `add_transaction_flags.sql`), `user_goals` + `goal_contributions` (migration: `add_goals.sql`)

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

### Local Notifications (goal reminders)
Local, **not push** — no APNs cert, no FCM key, no server scheduler. Two iOS constraints drive the design:
- **64 pending notifications max.** Reminders are *repeating triggers rebuilt from server state* (cancel-then-reschedule in `syncGoalReminders`), never dated instances. Goals are capped at 25 server-side.
- **Content freezes at schedule time, not fire time.** Reminder copy is evergreen ("Move $25 toward Emergency Fund") and must never quote progress. Milestones need a current balance, so they are fetched via `POST /goals/milestones/check` when the app opens and presented immediately; the server records `milestones_notified` so two devices cannot both announce one.
- **Weekday conversion is off by one**: the API stores 0–6 (Sunday = 0, JS convention); expo/iOS want 1–7 (Sunday = 1). Isolated in `utils/goalReminders.js` with tests, because getting it wrong delivers every weekly reminder on the wrong day *without erroring*. Monthly days cap at 28 so nothing skips February.
- Permission is requested **when a reminder is switched on, never at launch** — iOS grants one prompt.
- `expo-notifications` is a native module and there is **no OTA**, so it needs an EAS rebuild to reach a device.

### No Investment Advice (hard product constraint)
IndusWealth is **not a registered adviser**, so it must never recommend a security. Google Play rejected the app in July 2026 under the Financial Services policy because the Financial features declaration said the app gives no personalized advice while the Insights tab recommended specific ETFs off the user's own surplus.
- **Never name a specific security anywhere** — no tickers, no fund names, not as an example, not "such as". Account *types* (TFSA, RRSP, FHSA, HISA) are fine: they are tax structures, not products.
- **Never rank or filter products by a user's own data.** `getRecommendedETFs()` and `GET /etfs/recommended` were removed for exactly this; the endpoint now returns 410 because there is no OTA and old builds still call it.
- **No ticker data is given to the model at all** (`getETFDataForPrompt` is gone). It cannot name a fund it was never handed — the same principle as the link registry.
- `_rejectSecurityMentions()` in `ai_insights.js` **drops** any insight naming a security, checking title, description, reasoning, button labels and the benefit calculation. A prompt rule is a request; this is the enforcement. `CASH` is excluded from the ticker blocklist — it is a real ticker and an ordinary word, and blocking it would delete every cash-flow insight.
- The ETF list screen stays as **education**: same order for everyone, nothing derived from the user's finances.
- No brokerage or bank product pages in `link_registry.js`. Neutral rate comparison (`ratehub_savings`) is fine; a provider signup page reached from an insight about your own balance is product steering.
- `docs/store/PLAY_STORE_LISTING.md` already promises "does not provide financial, investment, legal, or tax advice" — keep the app matching that claim, not the other way round.

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
- **Plaid**: products `transactions` only (`liabilities` pending dashboard approval — re-add when granted), country_codes `CA` only. **History depth**: `transactions.days_requested` is sent at link time (730); Plaid's default is 90 and the value is **fixed for the Item's life**, so existing connections keep their old depth until reconnected. After linking, Plaid fires `INITIAL_UPDATE` (~30 days ready) then `HISTORICAL_UPDATE` (full backfill) — `routes/plaidWebhook.js` syncs on both, which is what stops a new account being stuck at ~30 days for 24h. Still on `/transactions/get`; `SYNC_UPDATES_AVAILABLE` is handled in advance of any move to `/transactions/sync`. Production OAuth: Android link tokens use `android_package_name` (`com.induswealth.app`, must be registered in the Plaid dashboard); iOS/web use `redirect_uri`. The app sends `platform` in the `create_link_token` body
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

# No test suite configured (test script is a stub)
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

**Working:** Advanced Analytics page (entry: "Advanced" button on Analytics header), AI category insights with rule-based fallback, `Taxes & Government` category (fixes CANADA TXD → Transportation misclassification), Resend email verification from hello@induswealth.app (domain verified, DNS on Spaceship), transaction flags, savings goals with local reminders, registry-backed insight links.

**Needs an EAS rebuild before it reaches a device:** `expo-notifications` (goal reminders) is a native module and there is no OTA. Everything else in the goals feature is JS.

**Pending / blockers:**
1. **Plaid Android OAuth (IN PROGRESS — user finishing manually)**: `PLAID_ENV=production` on Render. The Plaid dashboard login has TWO teams: "BHARGAV KIRIT MARSONIA" (personal) and "IndusWealth". The Android package name `com.induswealth.app` was mistakenly being registered under the personal team; it must be saved under Developers → API → "Allowed Android package names" in the team whose `PLAID_CLIENT_ID` matches Render's (verify via Developers → Keys — likely the IndusWealth team). Redirect URIs list was empty on the personal team, further evidence Render's keys belong to the other team. Error until done: "Android package name must be configured in the developer dashboard."
2. **Plaid Link cannot open in Expo Go** (native module missing). Testing bank connect requires a dev build: `cd packages/mobile && eas build --profile development --platform android`, then `npx expo start` and open the standalone dev app. JS-only changes need no rebuild; there is NO EAS Update (OTA) configured, so installed builds only get new JS via rebuild.
3. ~~Run `npm run migrate` against prod DB for `category_ai_insights`~~ **RESOLVED**: migrations now run automatically on every deploy. `services/db.js` `initDb()` (called on boot) and the `npm run migrate` CLI both iterate the single ordered list in `db/migrations.js`; `add_category_insights.sql` is included, so it lands on the next Render deploy. All migrations are idempotent, so the boot re-run is a safe no-op.
4. **Render env check**: if `GEMINI_MODEL` is set to a retired model (e.g. `gemini-2.0-flash`/`gemini-2.0-pro`), delete it or set `gemini-3.5-flash`. (Local `packages/backend/.env` currently pins the dead `gemini-2.0-flash` — local-only.)
5. ~~`migrate.js` MIGRATIONS list missing 8 files~~ **RESOLVED**: boot + CLI now share `db/migrations.js` (18 files, dependency-ordered) so the two lists can't drift. Add a migration by dropping the `.sql` in `db/` and appending its name there (must be idempotent).
6. `liabilities` product: request access in Plaid dashboard, then re-add to `products` in `services/plaid.js`.
7. **Gemini "thinking" was truncating JSON** (FIXED): all Gemini JSON calls now set `thinkingConfig: { thinkingBudget: 0 }` (`ai_insights.js` ×2, `ai_categorization.js`). Without it, hidden reasoning tokens exhausted `maxOutputTokens` and cut the JSON mid-string → "Unterminated string in JSON" (Insights tab 500s, silent AI-insight/categorization failures).
8. **Two years of Plaid history needs a reconnect.** `days_requested` is fixed when the Item is created, so connections made before that change still return 90 days regardless of what we ask for. Disconnect and relink to get the full depth.
9. **113 → 123 ESLint findings** (`npm run lint` in `packages/mobile`) are a known backlog, mostly `react-hooks/static-components`, `set-state-in-effect`, and `import/no-named-as-default` on the `api` default import. `npm run lint:theme` is the gate that must stay clean and is unaffected.
