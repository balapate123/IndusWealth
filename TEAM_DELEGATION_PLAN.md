# IndusWealth - 3-Week Task Delegation Plan

> **Period**: February 24 - March 14, 2026
> **Project Owner**: Away during this period
> **Reference**: See `PRODUCTION_ROADMAP.md` for full context on each item
> **Sync Schedule**: Daily async updates (Slack/Teams), weekly 30-min sync call (Friday)

---

## Team Members & Roles

| # | Role | Focus Area |
|---|------|-----------|
| 1 | **Fullstack Developer** | Backend infrastructure, API hardening, mobile integration |
| 2 | **Digital Marketing Expert** | App store presence, branding, user acquisition prep |
| 3 | **Software Quality Expert** | Testing infrastructure, CI/CD, code quality |
| 4 | **Investment Portfolio Manager** | Financial accuracy review, content strategy, feature validation |
| 5 | **Security Consultant** | Regulatory compliance, Plaid production access, government registrations |

---

## Week-by-Week Overview

| Week | Theme | Key Deliverables |
|------|-------|-----------------|
| **Week 1** (Feb 24-28) | Foundation & Setup | Email service, testing framework, Plaid application, store accounts, financial audit |
| **Week 2** (Mar 3-7) | Core Implementation | Password reset, CI/CD, test coverage, store listings, compliance filings |
| **Week 3** (Mar 10-14) | Integration & Polish | Health checks, monitoring, E2E tests, marketing assets, compliance follow-up |

---

## 1. Fullstack Developer

### Responsibilities
Backend infrastructure hardening, critical missing features (email verification, password reset), API improvements, and mobile app integration for new backend features.

### Week 1: Email Service & Verification (Feb 24-28)

**Roadmap Sections**: 4.1, 4.2, 13.2

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 1.1 | **Set up email service** | P0 | Integrate SendGrid (free tier: 100 emails/day). Create `packages/backend/src/services/email.js` with send method. Configure SENDGRID_API_KEY env var on Render. | Working email service with send capability |
| 1.2 | **Email verification on signup** | P0 | Add `email_verified` boolean + `verification_token` + `verification_expires` columns to `users` table. Generate UUID token on signup, send verification email, block Plaid linking until verified. Create `POST /users/verify-email` endpoint. See Roadmap 4.1. | Users must verify email before linking banks |
| 1.3 | **Resend verification email** | P0 | Create `POST /users/resend-verification` endpoint. Rate limit to 3 per hour per email. | Resend capability with rate limit |
| 1.4 | **Mobile: verification flow** | P0 | Add verification pending screen after signup. Show "check your email" message. Add resend button. Handle deep link or manual token entry. | Mobile verification UX |
| 1.5 | **Environment validation on startup** | P0 | In `packages/backend/src/index.js`, validate all required env vars on boot: JWT_SECRET (min 32 chars), DATABASE_URL, PLAID_CLIENT_ID, PLAID_SECRET, ENCRYPTION_KEY (64 hex), SENDGRID_API_KEY. Fail fast with clear error messages. See Roadmap 5.1. | Server refuses to start with missing/weak config |

**DB Migration Required:**
```sql
-- db/add_email_verification.sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN verification_expires TIMESTAMPTZ;

CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
```

### Week 2: Password Reset & API Hardening (Mar 3-7)

**Roadmap Sections**: 4.2, 5.2, 7.3

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 2.1 | **Password reset flow (backend)** | P0 | Create `POST /users/forgot-password` (generate token, send email) and `POST /users/reset-password` (validate token, update password, revoke all sessions). Time-limited token: 1 hour. Rate limit: 3 requests/hour/email. See Roadmap 4.2. | Full password reset API |
| 2.2 | **Password reset flow (mobile)** | P0 | Add "Forgot Password?" link on LoginScreen. Create ForgotPasswordScreen (enter email) and ResetPasswordScreen (enter new password with token from email link). | Mobile forgot password UX |
| 2.3 | **Health check endpoint** | P1 | Create `GET /health` that checks: DB connectivity (run `SELECT 1`), Plaid API reachability, memory usage, uptime, app version. Return JSON status. See Roadmap 5.2. | Health endpoint for monitoring |
| 2.4 | **Graceful shutdown** | P1 | Add SIGTERM/SIGINT handlers in `index.js`. Close HTTP server, drain DB pool, log shutdown. See Roadmap 5.2. | Clean shutdown on deploy |
| 2.5 | **Uncaught exception handling** | P1 | Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers. Log error, close connections, exit with code 1. See Roadmap 5.2. | No silent crashes |
| 2.6 | **Comprehensive input validation** | P1 | Extend `middleware/validators.js` to cover ALL endpoints (transactions, debt, analytics, insights, educational). Validate dates, amounts, array sizes, string lengths. See Roadmap 7.3. | All endpoints validated |

### Week 3: Monitoring & Polish (Mar 10-14)

**Roadmap Sections**: 11.1, 11.5, 5.3, 6.5

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 3.1 | **Integrate Sentry (backend)** | P0 | Install `@sentry/node`. Initialize in `app.js` before routes. Add Sentry error handler after routes. Configure DSN env var. Add user context (user ID only, no PII). See Roadmap 11.1. | Backend error tracking live |
| 3.2 | **Integrate Sentry (mobile)** | P0 | Install `sentry-expo`. Initialize in `App.js`. Capture unhandled JS errors and native crashes. Add user context on login. See Roadmap 11.1. | Mobile crash reporting live |
| 3.3 | **Audit logging** | P1 | Create `audit_log` table (see Roadmap 11.5 for schema). Create `services/auditLog.js` with `log(userId, action, resourceType, resourceId, metadata)` method. Add logging to: login, password change, Plaid connect/disconnect, data export, account deletion, 2FA changes. | Security audit trail |
| 3.4 | **Response compression** | P2 | Install `compression` middleware. Add `app.use(compression())` in `app.js`. See Roadmap 5.3. | Gzip responses |
| 3.5 | **Connection pool tuning** | P1 | Configure pg pool: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`. Add pool error handler. See Roadmap 6.5. | Optimized DB connections |
| 3.6 | **Database SSL** | P1 | Add `ssl: { rejectUnauthorized: true }` to pg config for production. Conditional on NODE_ENV. See Roadmap 3.3. | Encrypted DB connection |

**Handoff Notes for Fullstack Developer:**
- All backend code is in `packages/backend/src/`
- Use existing patterns: see `routes/twoFactor.js` for a well-structured route example
- Use `middleware/validators.js` patterns for input validation
- Use `services/encryption.js` for any new encrypted storage
- Use `utils/responseHelper.js` for consistent API responses
- DB migrations go in `packages/backend/db/` as new SQL files
- Mobile code is in `packages/mobile/src/`
- Test with Plaid sandbox credentials: `user_good` / `pass_good`
- Run `docker-compose up -d` for local PostgreSQL

---

## 2. Digital Marketing Expert

### Responsibilities
App store presence, branding materials, marketing copy, user acquisition strategy, and store optimization.

### Week 1: Research & Accounts (Feb 24-28)

**Roadmap Sections**: 16.1, 16.2

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 1.1 | **Create Google Play Developer account** | P1 | Register at play.google.com/console ($25 one-time fee). Complete identity verification. This can take several days for approval. See Roadmap 16.1. | Active developer account |
| 1.2 | **Research Apple Developer Program** | P2 | Review requirements for enrollment ($99/year). Determine if we need a personal or organization account. Document requirements. See Roadmap 16.2. | Decision document on Apple enrollment |
| 1.3 | **Competitive analysis** | P2 | Research top 10 personal finance apps in Canada on both stores: Wealthsimple, KOHO, Moka, YNAB, Mint, etc. Document their app store listings (screenshots, descriptions, keywords, ratings). | Competitive analysis report |
| 1.4 | **App name & keyword research** | P2 | Research ASO keywords for "personal finance Canada", "budget tracker", "debt payoff", "bank aggregation". Determine if "IndusWealth" is available on both stores. Check trademark conflicts. See Roadmap 16.3. | Keyword list + name availability |
| 1.5 | **Brand style guide draft** | P2 | Document current design language: dark theme (#000000), gold accents (#C9A227, #E5C048), Space Grotesk font, premium/minimalist aesthetic. This guides all marketing materials. | Brand style reference |

### Week 2: Store Listing Preparation (Mar 3-7)

**Roadmap Sections**: 16.1, 16.2, 8.6

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 2.1 | **Write app store descriptions** | P1 | Short description (80 chars): concise value proposition. Full description (4000 chars): features, security, privacy focus. Target Canadian audience. Highlight: Plaid bank connection, AI insights, debt calculator, privacy-first. See Roadmap 16.1. | Store copy (both platforms) |
| 2.2 | **App icon design brief** | P1 | Commission or create production app icon (1024x1024 base). Must be distinct at small sizes. Follow both Apple and Google guidelines. Match brand: dark + gold. See Roadmap 8.6. | Icon design (or design brief for designer) |
| 2.3 | **Screenshot planning** | P1 | Plan 5-8 screenshots showcasing: Dashboard, AI Insights, Debt Attack, Analytics, Wealth Academy, Security (2FA). Add marketing captions to each. Minimum 2 screenshots per device type. See Roadmap 16.1. | Screenshot mockup plan |
| 2.4 | **Feature graphic** | P1 | Design Google Play feature graphic (1024x500). Brand-consistent promotional image. See Roadmap 16.1. | Feature graphic |
| 2.5 | **Content rating questionnaire** | P1 | Complete Google Play content rating for finance category. Document: no violence, no user-generated content displayed publicly, handles financial data. See Roadmap 16.1. | Completed rating |

### Week 3: Marketing Strategy & Assets (Mar 10-14)

**Roadmap Sections**: 16.3, 17.1

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 3.1 | **Splash/launch screen design** | P1 | Design app splash screen matching brand (dark + gold). Show IndusWealth logo. Smooth transition feel. See Roadmap 8.6. | Splash screen design |
| 3.2 | **Pre-launch landing page plan** | P2 | Plan a simple landing page (induswealth.com or similar). Email signup for launch notification. Features overview. Privacy-focused messaging. | Landing page wireframe + copy |
| 3.3 | **Social media strategy** | P3 | Identify target channels (LinkedIn for finance professionals, Instagram/TikTok for younger Canadian audience). Plan content calendar for launch month. | Social media plan |
| 3.4 | **FAQ / Help Center content** | P1 | Write user-facing FAQ covering: How to connect bank, Is my data safe?, How AI insights work, How to delete account, Troubleshooting Plaid. See Roadmap 17.1. | FAQ document (10-15 questions) |
| 3.5 | **Privacy-focused marketing messaging** | P1 | Develop key privacy messages: "Your data never leaves Canada", "No PII sent to AI", "Bank-level encryption", "You own your data". These differentiate us in the market. | Marketing copy focused on privacy/security |

**Handoff Notes for Digital Marketing Expert:**
- Current app theme: pure black (#000000) background, gold (#C9A227) accents, Space Grotesk font
- App category: Finance
- Target audience: Canadian millennials/Gen Z who want to understand and improve their finances
- Key value props: Bank connection via Plaid, AI insights, debt payoff strategies, educational content
- Privacy is a major selling point - emphasize no PII to AI, encryption, PIPEDA compliance
- The app is Canada-only (Plaid CA banks, Ontario jurisdiction)
- Screenshots can be taken from the Expo app running in an emulator

---

## 3. Software Quality Expert

### Responsibilities
Establish testing infrastructure, CI/CD pipeline, code quality tools, and test coverage for critical paths.

### Week 1: Testing Infrastructure Setup (Feb 24-28)

**Roadmap Sections**: 9.1, 9.4

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 1.1 | **Set up Jest for backend** | P1 | Install `jest`, `@types/jest`. Create `jest.config.js` in `packages/backend/`. Add test scripts to `package.json`: `test`, `test:watch`, `test:coverage`. Set up test database (separate from dev). See Roadmap 9.1. | Backend testing framework ready |
| 1.2 | **Set up Jest for mobile** | P1 | Install `jest`, `@testing-library/react-native`, `@testing-library/jest-native`. Create `jest.config.js` in `packages/mobile/`. Configure Expo Jest preset. See Roadmap 9.1. | Mobile testing framework ready |
| 1.3 | **Create test utilities** | P1 | Build shared test helpers: mock database, mock Plaid API responses, mock Gemini responses, test user factory, JWT token generator for tests. See Roadmap 9.4. | Test utility library |
| 1.4 | **Backend unit tests: debt_calculator.js** | P1 | Write comprehensive tests for the debt calculator. Test all 3 strategies (Status Quo, Snowball, Avalanche), edge cases (zero balance, zero APR, single debt, no extra payment, large extra payment). This is the most mathematically critical service. See Roadmap 9.1. | Debt calculator test suite (target: 90%+ coverage) |
| 1.5 | **Backend unit tests: auth middleware** | P1 | Test JWT generation, validation, refresh token rotation, expired tokens, invalid tokens, reuse detection. See Roadmap 9.1. | Auth middleware test suite |

**Test Database Setup:**
```bash
# Create test database (add to docker-compose.yml or manual)
createdb induswealth_test
# Run migrations against test DB
psql -d induswealth_test -f db/init.sql
psql -d induswealth_test -f db/add_security_tables.sql
# ... run all migration files
```

### Week 2: CI/CD & Integration Tests (Mar 3-7)

**Roadmap Sections**: 9.2, 10.1, 10.2

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 2.1 | **Set up Supertest for API testing** | P1 | Install `supertest`. Create integration test setup that starts Express app with test database. See Roadmap 9.2. | API testing framework ready |
| 2.2 | **Integration tests: auth flows** | P1 | Test: signup → login → get token → access protected route. Test: invalid JWT → 401. Test: rate limit → 429. Test: lockout after 5 failures. See Roadmap 9.2. | Auth flow integration tests |
| 2.3 | **Integration tests: debt & transactions** | P1 | Test: create custom debt → calculate payoff → verify math. Test: fetch transactions (mocked Plaid). Test: add transaction note. See Roadmap 9.2. | Business logic integration tests |
| 2.4 | **Create GitHub Actions CI workflow** | P1 | Create `.github/workflows/ci.yml`. Jobs: lint (ESLint), test (Jest unit + integration), build (verify both packages build), audit (npm audit). Trigger on push + PR. See Roadmap 10.1. | CI pipeline running on every push |
| 2.5 | **Set up ESLint + Prettier** | P2 | Install ESLint with recommended rules + Prettier. Create `.eslintrc.js` and `.prettierrc`. Add lint scripts. Fix any existing lint errors. See Roadmap 10.2. | Code quality tooling |

**GitHub Actions Workflow Template:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: induswealth_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: packages/backend/coverage/

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
```

### Week 3: Coverage Goals & Quality Gates (Mar 10-14)

**Roadmap Sections**: 9.1, 9.4, 10.2

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 3.1 | **Backend unit tests: remaining services** | P1 | Test `categorization.js` (category mapping), `ai_insights.js` (prompt generation, response parsing), `encryption.js` (encrypt/decrypt round-trip), `passwordValidator.js` (strength scoring). See Roadmap 9.1. | Additional service tests |
| 3.2 | **Mobile unit tests** | P1 | Test `api.js` (request formatting, error parsing, token refresh logic), `cache.js` (storage operations, expiry). See Roadmap 9.1. | Mobile unit tests |
| 3.3 | **Add coverage thresholds** | P2 | Configure Jest to fail if coverage drops below 60% (global). Set per-file thresholds for critical files: `debt_calculator.js` ≥ 90%, `auth.js` ≥ 80%. See Roadmap 9.4. | Coverage gates enforced |
| 3.4 | **Pre-commit hooks** | P2 | Install Husky + lint-staged. Run lint + format on staged files before commit. See Roadmap 10.2. | Pre-commit quality gate |
| 3.5 | **Test coverage report** | P1 | Generate HTML coverage report. Document current coverage by file. Identify gaps. Create prioritized list of what needs tests next. | Coverage report + gap analysis |
| 3.6 | **Dependency vulnerability audit** | P1 | Run `npm audit` on both packages. Document all findings. Fix high/critical vulnerabilities. Create plan for medium ones. Remove unused dependencies (check if `flinks.js` is still referenced). See Roadmap 3.6. | Audit report with fixes |

**Handoff Notes for Software Quality Expert:**
- Currently **zero tests** exist - you're building from scratch
- Backend entry: `packages/backend/src/index.js`, main app: `packages/backend/src/app.js`
- Most critical service to test first: `services/debt_calculator.js` (financial math must be correct)
- Auth middleware: `middleware/auth.js` (security-critical)
- Mobile entry: `packages/mobile/App.js`
- Both packages use npm workspaces (install from root with `npm install`)
- Plaid and Gemini should be mocked in tests - never call real APIs
- Test credentials: `demo@induswealth.com` / `demo123`

---

## 4. Investment Portfolio Manager

### Responsibilities
Validate financial accuracy of calculations, review AI insight quality, curate educational content, and advise on financial features.

### Week 1: Financial Accuracy Audit (Feb 24-28)

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 1.1 | **Audit debt calculator math** | P0 | Review `packages/backend/src/services/debt_calculator.js`. Verify: compound interest calculations, amortization schedules, Snowball ordering (lowest balance first), Avalanche ordering (highest APR first), monthly payment allocation logic. Test with known scenarios. | Math verification report |
| 1.2 | **Verify default APR values** | P1 | Review default APRs: Credit card 22%, LOC 11%, Personal loan 10%, Student loan 6%, Mortgage 5%, Other 15%. Are these reasonable for the Canadian market in 2026? Should we use Bank of Canada posted rates? | Recommended APR table |
| 1.3 | **Review AI insight prompts** | P1 | Review `packages/backend/src/services/ai_insights.js`. Examine the prompts sent to Gemini. Verify: insights are actionable, Canada-specific (TFSA, RRSP, RESP not 401k/IRA), no regulated financial advice, appropriate disclaimers. Check the 7 insight categories are relevant. | Prompt review with recommendations |
| 1.4 | **Validate analytics categorization** | P1 | Review `packages/backend/src/services/categorization.js`. Check the 16 spending categories and intent mapping (Fixed Needs, Growth, Lifestyle). Are categories comprehensive? Is the intent classification reasonable? | Category mapping review |
| 1.5 | **Review financial disclaimers** | P0 | Read `docs/legal/FINANCIAL_DISCLAIMER.md`. Verify disclaimers adequately cover: AI insights, debt calculator, analytics, Wealth Academy. Ensure no language could be construed as financial advice. | Disclaimer adequacy report |

### Week 2: Content & Feature Strategy (Mar 3-7)

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 2.1 | **Wealth Academy content audit** | P1 | Review `packages/backend/src/services/educational_content.js`. Assess: Are the trusted sources appropriate (NerdWallet, Investopedia, MoneySense, etc.)? Are Canada-specific sources prioritized? Any sources we should add or remove? | Content source recommendations |
| 2.2 | **Wealth Academy article categories** | P1 | Review the 6 categories (Budgeting, Investing, Debt, Taxes, Savings). Propose additional categories if needed (e.g., "Canadian Benefits" for TFSA/RRSP/CCB/OAS). Suggest starter article URLs for each category. | Category recommendations + article URLs |
| 2.3 | **Canadian financial product coverage** | P1 | Identify gaps in Canada-specific financial product knowledge. Does the app understand: TFSA contribution limits (2026), RRSP deadlines, RESP grants, GIS, CCB, provincial tax brackets (Ontario)? These affect AI insight quality. | Canadian product coverage gap analysis |
| 2.4 | **Budgeting feature specification** | P2 | Design the budgeting feature (Roadmap 15.2). Propose: How should category budgets work? Monthly vs bi-weekly? What Canadian benchmarks should we reference (50/30/20 rule adapted for Canada)? How to handle variable income? | Budget feature spec |
| 2.5 | **Investment readiness scoring** | P2 | Review the "Investment Readiness" insight category. Propose criteria for when the app should suggest investing: emergency fund threshold, debt-to-income ratio, minimum savings rate. All Canada-specific (registered accounts first). | Investment readiness criteria |

### Week 3: User Experience & Recommendations (Mar 10-14)

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 3.1 | **Test the app as a user** | P1 | Use the app end-to-end with Plaid sandbox. Connect accounts, view insights, try debt calculator, browse Wealth Academy. Document: confusing flows, missing information, misleading numbers, UX pain points. | User experience feedback report |
| 3.2 | **Net worth tracking specification** | P2 | Design net worth tracking feature (Roadmap 15.4). Define: which accounts contribute to net worth (checking, savings, credit, loans), how to handle joint accounts, how to present trends. | Net worth feature spec |
| 3.3 | **Savings goals specification** | P3 | Design savings goals feature (Roadmap 15.5). Propose: goal types (emergency fund, house down payment, vacation, RRSP contribution), progress tracking method, AI-generated suggestions. | Savings goals feature spec |
| 3.4 | **Tax-related feature opportunities** | P2 | Identify tax-related features valuable for Canadian users: RRSP contribution room tracking, TFSA contribution tracking, tax-deductible expense flagging (medical, charitable, work-from-home). | Tax feature opportunity document |
| 3.5 | **Quarterly financial report template** | P2 | Design a quarterly financial report that the app could generate: income summary, spending by category, net worth change, debt reduction progress, subscription costs. See Roadmap 15.3. | Report template design |

**Handoff Notes for Investment Portfolio Manager:**
- The app is **NOT** providing financial advice - it's a tracking/analysis tool
- All AI insights must have disclaimers ("This is not financial advice")
- Canada-specific focus: TFSA, RRSP, RESP, not American 401k/IRA
- Plaid sandbox has fake data - use it to understand the flow, not the numbers
- The debt calculator is the most math-critical feature - please verify the algorithms
- Review files: `services/debt_calculator.js`, `services/ai_insights.js`, `services/categorization.js`, `docs/legal/FINANCIAL_DISCLAIMER.md`
- Run the mobile app: `cd packages/mobile && npx expo start` (need Expo Go on phone)

---

## 5. Security Consultant

### Responsibilities
Regulatory compliance, Plaid production access, government registrations, security audit, and ongoing compliance framework.

### Week 1: Regulatory Assessment & Plaid (Feb 24-28)

**Roadmap Sections**: 2.3, 3.5, 2.4

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 1.1 | **Plaid production access application** | P0 | Start the Plaid production access application process. This involves: completing their security questionnaire, demonstrating data handling practices, showing compliance framework. Plaid reviews can take 2-4 weeks. See Roadmap 3.5. **Contact**: dashboard.plaid.com → Apply for Production | Application submitted |
| 1.2 | **Review Plaid compliance requirements** | P0 | Document all requirements Plaid has for production access. What security controls do they expect? What data handling policies must be in place? What certifications do they look for? See Roadmap 2.3. | Plaid requirements checklist |
| 1.3 | **PIPEDA compliance audit** | P0 | Review the Privacy Policy (`docs/legal/PRIVACY_POLICY.md`) against PIPEDA's 10 fair information principles. Identify gaps. Verify: consent mechanisms, data access/correction rights, data breach notification procedures, privacy officer designation. See Roadmap 2.5. | PIPEDA compliance gap analysis |
| 1.4 | **Review current security implementation** | P1 | Audit implemented security features: AES-256-GCM encryption (see `services/encryption.js`), refresh token rotation (`middleware/auth.js`), account lockout (`utils/loginProtection.js`), 2FA (`routes/twoFactor.js`), input validation (`middleware/validators.js`). Identify any weaknesses. See Roadmap 3.6. | Security audit findings |
| 1.5 | **Data processing agreement review** | P1 | Review DPA status for all third parties: Plaid, Google Cloud/Gemini, Render.com. What agreements need to be signed? Is PII sent to Gemini? (Answer: no, only aggregated summaries). See Roadmap 2.4. | DPA status report |

### Week 2: Government Registrations & Compliance (Mar 3-7)

**Roadmap Sections**: 2.3, 2.5, 2.1

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 2.1 | **FINTRAC assessment** | P0 | Determine if IndusWealth requires FINTRAC registration. The app is read-only (no money movement), so it likely doesn't qualify as a money services business (MSB). Document the reasoning. Contact FINTRAC if needed for formal determination. See Roadmap 2.3 + `docs/legal/FINANCIAL_DISCLAIMER.md`. | FINTRAC determination document |
| 2.2 | **Provincial securities review** | P1 | Confirm the app doesn't trigger registration with OSC (Ontario Securities Commission) or CIRO. The app doesn't provide investment advice, manage money, or execute trades. Document the analysis. See Roadmap 2.3. | Regulatory classification document |
| 2.3 | **Quebec Law 25 compliance** | P1 | Review Quebec's Law 25 (privacy law amendments). If the app will be available in Quebec: privacy impact assessment may be required, privacy officer designation, incident response plan, transparency requirements. See Privacy Policy Section for Quebec provisions. | Quebec compliance checklist |
| 2.4 | **Data residency verification** | P1 | Verify where all data is stored. Render.com hosting region (which data center?). PostgreSQL location. Are there Canadian data residency requirements we need to meet? PIPEDA allows cross-border transfers with contractual protections. | Data residency report |
| 2.5 | **OWASP Top 10 review** | P1 | Conduct OWASP Top 10 security review against the codebase. Existing protections: parameterized queries (SQL injection), input validation (XSS), JWT auth (not CSRF-vulnerable), express-validator. Check: broken access control (user_id checks on all endpoints), security misconfiguration, vulnerable dependencies. See Roadmap 3.6. | OWASP audit report |

### Week 3: Compliance Framework & Ongoing (Mar 10-14)

**Roadmap Sections**: 2.5, 11.5, 3.6

| # | Task | Priority | Details | Deliverable |
|---|------|----------|---------|-------------|
| 3.1 | **Data subject rights implementation plan** | P1 | Specify exact implementation for PIPEDA rights: Right to Access (data export endpoint - what fields/format), Right to Deletion (what data, what order, verification), Right to Rectification (which fields), Data Portability (JSON + CSV formats). See Roadmap 2.5. | Implementation spec for developer |
| 3.2 | **Consent management design** | P1 | Design granular consent system: bank account linking (Plaid), AI-powered insights (Gemini), educational content recommendations. How to record, track, and allow withdrawal of consent. See Roadmap 2.5. | Consent management spec |
| 3.3 | **Incident response plan** | P1 | Create formal incident response plan covering: detection (what triggers an alert), classification (P0-P3 severity), containment (how to stop the bleeding), notification (PIPEDA mandatory breach notification to OPC within 72 hours, affected individuals), recovery, post-mortem. See Roadmap 17.3. | Incident response document |
| 3.4 | **Penetration testing recommendation** | P1 | Assess readiness for a professional penetration test. What should the scope be? Which areas are highest risk? Recommend 2-3 reputable Canadian pen testing firms. Estimate cost and timeline. See Roadmap 3.6. | Pen test recommendation |
| 3.5 | **Security compliance roadmap** | P1 | Create a 6-month security compliance roadmap beyond these 3 weeks. What needs to happen before app store launch? What ongoing compliance obligations exist? Annual review schedule. | Long-term security roadmap |
| 3.6 | **Plaid production follow-up** | P0 | Follow up on Plaid production application from Week 1. Address any questions or requirements from Plaid. Prepare additional documentation if requested. | Plaid application progress |

**Handoff Notes for Security Consultant:**
- All legal docs are in `docs/legal/` - review these first
- Current security implementation details are in `PRODUCTION_ROADMAP.md` Section 3 (checkboxes show what's done)
- Key security files to review: `services/encryption.js`, `middleware/auth.js`, `utils/loginProtection.js`, `routes/twoFactor.js`, `middleware/validators.js`
- The app is **read-only** - no money movement, no trades, no transfers
- Canada-only (Ontario jurisdiction), PIPEDA applies
- Data sent to Gemini AI: aggregated financial summaries only, NO PII (no names, account numbers, merchant names)
- Plaid sandbox currently - need production access for real users
- Render.com is the hosting provider - check their SOC 2 / data residency

---

## Cross-Team Dependencies

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DEPENDENCY MAP                                   │
│                                                                      │
│  Security Consultant                  Fullstack Developer            │
│  ┌──────────────────┐                 ┌──────────────────┐           │
│  │ Plaid prod access │───depends on──▶│ Email service    │           │
│  │ (Week 1)          │                │ setup (Week 1)   │           │
│  └──────────────────┘                 └────────┬─────────┘           │
│                                                │                     │
│  ┌──────────────────┐                 ┌────────▼─────────┐           │
│  │ Data subject      │───spec for────▶│ Password reset   │           │
│  │ rights spec (Wk3) │                │ (Week 2)         │           │
│  └──────────────────┘                 └──────────────────┘           │
│                                                                      │
│  Software Quality Expert              Digital Marketing Expert       │
│  ┌──────────────────┐                 ┌──────────────────┐           │
│  │ CI/CD pipeline    │                │ Store listings   │           │
│  │ (Week 2)          │                │ (Week 2)         │           │
│  └────────┬─────────┘                 └──────────────────┘           │
│           │                                                          │
│  ┌────────▼─────────┐                 Investment Portfolio Manager   │
│  │ Dep. vuln audit   │                ┌──────────────────┐           │
│  │ (Week 3)          │                │ Calculator audit  │           │
│  └──────────────────┘                 │ (Week 1)         │─────┐     │
│                                       └──────────────────┘     │     │
│                                                                │     │
│                              Software Quality Expert           │     │
│                              ┌──────────────────┐              │     │
│                              │ Debt calc tests   │◀─verified──┘     │
│                              │ (Week 1)          │                   │
│                              └──────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Coordination Points

1. **Investment PM → Quality Expert** (Week 1): The portfolio manager's debt calculator audit results should inform the test cases the quality expert writes. Share findings by end of day Wednesday.

2. **Security Consultant → Fullstack Developer** (Week 3): The data subject rights implementation spec from the security consultant feeds directly into the fullstack developer's future work. Deliver spec by Wednesday of Week 3.

3. **Fullstack Developer → Quality Expert** (Week 2): New features (email verification, password reset) need integration tests. Coordinate: developer completes feature → quality expert writes tests.

4. **Security Consultant → All**: OWASP audit findings (Week 2) may generate new tasks for the fullstack developer. Share findings promptly.

---

## Communication Plan

### Daily
- **Async standup** (Slack/Teams): Each person posts by 10am:
  - What I did yesterday
  - What I'm doing today
  - Any blockers

### Weekly (Fridays, 30 min)
- **Video call**: Progress review, dependency resolution, decisions needed
- **Friday of Week 3**: Final handoff meeting with project owner (remote)

### Shared Resources
- **Repository**: All code changes go through pull requests
- **Documentation**: All specs/reports go in `docs/` directory
- **Roadmap**: Update `PRODUCTION_ROADMAP.md` checkboxes as tasks complete

### Escalation
- If blocked for more than 4 hours, post in group chat immediately
- If a critical security issue is found, alert the project owner directly

---

## 3-Week Success Criteria

By **March 14, 2026**, we should have:

### Must Complete
- [ ] Email service integrated and working (SendGrid)
- [ ] Email verification on signup
- [ ] Password reset flow (backend + mobile)
- [ ] Environment validation on server startup
- [ ] Jest testing framework set up (backend + mobile)
- [ ] Debt calculator tests written and passing (90%+ coverage)
- [ ] Auth flow integration tests
- [ ] GitHub Actions CI pipeline running
- [ ] Sentry error tracking live (backend + mobile)
- [ ] Google Play Developer account created
- [ ] Plaid production access application submitted
- [ ] PIPEDA compliance gap analysis completed
- [ ] Debt calculator math verified by financial expert
- [ ] AI insight prompts reviewed for Canadian relevance
- [ ] Financial disclaimers validated

### Should Complete
- [ ] Health check endpoint
- [ ] Graceful shutdown handling
- [ ] ESLint + Prettier configured
- [ ] App store descriptions written
- [ ] App icon designed
- [ ] FINTRAC determination documented
- [ ] OWASP Top 10 review completed
- [ ] Audit logging implemented
- [ ] 60%+ backend test coverage
- [ ] Pre-commit hooks set up

### Nice to Have
- [ ] Budgeting feature specification
- [ ] Net worth tracking specification
- [ ] Pre-launch landing page plan
- [ ] Penetration testing firm identified
- [ ] Coverage threshold enforcement in CI
- [ ] Social media strategy drafted

---

## Appendix: Access & Setup Requirements

### What Each Team Member Needs

| Person | Access Needed |
|--------|-------------|
| **Fullstack Developer** | GitHub repo (write), Render.com dashboard, SendGrid account, local dev environment |
| **Digital Marketing Expert** | Google Play Console, app screenshots/recordings, brand assets, competitor apps |
| **Software Quality Expert** | GitHub repo (write), local dev environment, CI/CD admin (GitHub Actions) |
| **Investment Portfolio Manager** | Mobile app (Expo Go), Plaid sandbox credentials, backend API access, legal docs |
| **Security Consultant** | GitHub repo (read), Plaid dashboard, legal docs, Render.com dashboard (read), all security-related code |

### Local Development Setup
```bash
# 1. Clone the repository
git clone <repo-url>
cd IndusWealth

# 2. Install dependencies (from root)
npm install

# 3. Start PostgreSQL
docker-compose up -d

# 4. Set up backend environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with required values

# 5. Run database migrations
cd packages/backend
npm run migrate

# 6. Start backend
npm run dev

# 7. Start mobile (in another terminal)
cd packages/mobile
npx expo start
```

### Key Reference Documents
| Document | Location | Purpose |
|----------|----------|---------|
| Production Roadmap | `PRODUCTION_ROADMAP.md` | Full task checklist (20 sections) |
| Demo Guide | `DEMO_GUIDE.md` | Project demonstration walkthrough |
| Terms of Service | `docs/legal/TERMS_OF_SERVICE.md` | Legal terms |
| Privacy Policy | `docs/legal/PRIVACY_POLICY.md` | PIPEDA-compliant privacy policy |
| Financial Disclaimer | `docs/legal/FINANCIAL_DISCLAIMER.md` | "Not financial advice" disclaimers |
| Data Processing | `docs/legal/DATA_PROCESSING.md` | Data handling documentation |
| Sub-processors | `docs/legal/DATA_PROCESSING_SUBPROCESSORS.md` | Third-party service list |
| Project Instructions | `CLAUDE.md` | Developer setup + architecture guide |

---

*This delegation plan should be reviewed in the kickoff meeting and adjusted based on team member availability and expertise. Update checkboxes in the Success Criteria section as work progresses.*
