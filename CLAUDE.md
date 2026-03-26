# CLAUDE.md

## Project Overview
- **IndusWealth**: Canada-only personal finance app (jurisdiction: Ontario, PIPEDA compliance)
- **Monorepo**: npm workspaces — `packages/backend` (Express API) + `packages/mobile` (Expo/React Native)
- **Integrations**: Plaid (CA bank aggregation), Google Gemini AI (insights), Render.com (hosting), EAS (mobile builds)

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
| | `src/routes/analytics.js` | Spending analytics |
| | `src/routes/watchdog.js` | Recurring expense detection |
| | `src/routes/insights.js` | AI-generated financial insights |
| | `src/routes/educational.js` | Wealth Academy articles |
| | `src/routes/feedback.js` | User feedback |
| | `src/routes/twoFactor.js` | TOTP 2FA setup/verify/disable |
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
| | `src/screens/AnalyticsScreen.js` | Spending analytics |
| | `src/screens/InsightsScreen.js` | AI insights |
| | `src/screens/ProfileScreen.js` | Profile + settings |
| | `src/screens/WealthAcademyScreen.js` | Educational content |
| | `src/screens/AllTransactionsScreen.js` | Transaction list |
| | `src/screens/AllAccountsScreen.js` | Accounts list |
| | `src/screens/AccountTransactionsScreen.js` | Per-account transactions |
| | `src/screens/FeedbackScreen.js` | Feedback form |
| | `src/screens/LegalDocScreen.js` | Legal documents |
| | `src/screens/ArticleWebViewScreen.js` | Article viewer |
| Services | `src/services/api.js` | HTTP client (JWT auth, token refresh on 401) |
| | `src/services/cache.js` | AsyncStorage wrapper (24hr TTL) |
| | `src/services/plaidLink.js` | Plaid Link SDK handler |
| Components | `src/components/CustomAlert.js` | Alert component |
| | `src/components/DataFreshnessIndicator.js` | Cache freshness badge |
| | `src/components/ErrorMessage.js` | Error display |
| | `src/components/ArticleCard.js` | Article card |
| Constants | `src/constants/theme.js` | Dark theme + gold accents |
| Utils | `src/utils/categorization.js` | Client-side category helpers |

### Database Tables
`users`, `accounts`, `transactions`, `sync_log`, `custom_debts`, `debt_apr_overrides`, `user_insights`, `user_insight_dismissals`, `user_preferences`, `insight_actions`, `merchant_category_cache`, `ai_categorization_log`, `educational_articles`, `user_article_bookmarks`, `insight_articles`, `refresh_tokens`, `login_attempts`, `totp_secrets`, `recovery_codes`

---

## Tech Stack
- **Backend**: Node.js, Express 5, PostgreSQL 15 (pg), JWT (jsonwebtoken), bcryptjs, helmet, express-rate-limit, express-validator, otplib (TOTP), qrcode
- **Mobile**: React Native 0.81.5, Expo ~54, React 19, React Navigation v6 (stack + bottom-tabs), AsyncStorage, react-native-plaid-link-sdk, react-native-svg, expo-linear-gradient
- **AI**: Google Generative AI (Gemini) — aggregated summaries only, no PII sent
- **Plaid**: products `transactions` + `liabilities`, country_codes `CA` only
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
