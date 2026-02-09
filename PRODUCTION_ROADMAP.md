# IndusWealth - Production Readiness Roadmap

> From current state to a production-ready application that real users can trust with their financial data.

**Audit Date**: February 9, 2026
**Current State**: Feature-complete beta, needs hardening for production launch
**Estimated Effort**: 8-12 weeks for full production readiness

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Legal, Privacy & Compliance](#2-legal-privacy--compliance)
3. [Security Hardening](#3-security-hardening)
4. [Authentication & Account Management](#4-authentication--account-management)
5. [Backend Infrastructure](#5-backend-infrastructure)
6. [Database & Data Management](#6-database--data-management)
7. [API Quality & Documentation](#7-api-quality--documentation)
8. [Mobile App Polish](#8-mobile-app-polish)
9. [Testing](#9-testing)
10. [CI/CD & DevOps](#10-cicd--devops)
11. [Monitoring, Logging & Alerting](#11-monitoring-logging--alerting)
12. [Performance & Scalability](#12-performance--scalability)
13. [Notification System](#13-notification-system)
14. [Onboarding & User Experience](#14-onboarding--user-experience)
15. [Feature Gaps & Enhancements](#15-feature-gaps--enhancements)
16. [App Store & Distribution](#16-app-store--distribution)
17. [Support & Operations](#17-support--operations)
18. [Cost & Infrastructure Planning](#18-cost--infrastructure-planning)
19. [Launch Checklist](#19-launch-checklist)
20. [Post-Launch Roadmap](#20-post-launch-roadmap)

---

## 1. Executive Summary

### What Exists Today

IndusWealth is a functional personal finance app with:
- 14 mobile screens covering auth, transactions, analytics, debt payoff, AI insights, and education
- 9 backend API route groups with proper middleware (auth, rate limiting, error handling)
- Plaid integration for bank account aggregation
- AI-powered financial insights via Google Gemini
- Two-layer caching (mobile AsyncStorage + server PostgreSQL)
- Deployed backend on Render.com, mobile builds via EAS

### What's Missing for Production

The app is **feature-rich but not production-hardened**. Key gaps:
- No legal/privacy framework (Terms of Service, Privacy Policy, data handling agreements)
- No automated testing (zero unit, integration, or E2E tests)
- No CI/CD pipeline
- No error tracking or monitoring (no Sentry, no metrics)
- No notification system (push, email, or in-app)
- Security gaps (no 2FA, no token revocation, broad CORS, unencrypted sensitive data)
- No app store presence (no Play Store/App Store listing)
- No customer support infrastructure

### Priority Tiers

| Tier | Focus | Timeline |
|------|-------|----------|
| **P0 - Blockers** | Legal, security, critical bugs | Weeks 1-2 |
| **P1 - Required** | Testing, monitoring, auth hardening | Weeks 3-5 |
| **P2 - Important** | Notifications, CI/CD, UX polish | Weeks 6-8 |
| **P3 - Nice-to-Have** | Performance, features, app store | Weeks 9-12 |

---

## 2. Legal, Privacy & Compliance

### 2.1 Terms of Service (P0)

- [ ] **Draft Terms of Service document**
  - Define scope of service (personal finance tracking, not financial advice)
  - Include disclaimer: "IndusWealth does not provide financial, investment, or tax advice"
  - Define user responsibilities (accurate information, account security)
  - Define account termination conditions
  - Define liability limitations
  - Include dispute resolution mechanism
  - Specify governing jurisdiction
- [ ] **Display ToS during signup** - require explicit acceptance (checkbox)
- [ ] **Store ToS acceptance timestamp** in the `users` table
- [ ] **Add ToS version tracking** - when ToS changes, re-prompt users to accept
- [ ] **Make ToS accessible** from Profile screen and app settings

### 2.2 Privacy Policy (P0)

- [ ] **Draft Privacy Policy** covering:
  - What data is collected (name, email, DOB, bank account info, transactions)
  - How data is used (analytics, AI insights, categorization)
  - Third-party data sharing (Plaid, Google Gemini AI)
  - Data retention periods
  - User rights (access, correction, deletion, portability)
  - Cookie/tracking policy (if applicable)
  - Children's data (COPPA compliance - state minimum age requirement)
  - Contact information for privacy inquiries
- [ ] **Display Privacy Policy** during signup with explicit acceptance
- [ ] **Link to Privacy Policy** from Profile screen
- [ ] **Implement data subject access requests** - user can request all their data
- [ ] **Implement data deletion** - currently partially exists via DELETE /account, ensure all data is purged (transactions, insights, caches, logs)

### 2.3 Financial Regulations

- [ ] **Determine regulatory requirements** based on operating jurisdiction:
  - Canada: PIPEDA (Personal Information Protection and Electronic Documents Act)
  - US: Gramm-Leach-Bliley Act (if applicable), state money transmitter laws
  - General: Not a money transmitter (read-only access), but verify
- [ ] **Add financial disclaimer** to all AI-generated insights: "This is not financial advice. Consult a qualified financial advisor."
- [ ] **Review Plaid's compliance requirements** for production:
  - Plaid requires a compliance review before going to production
  - Submit Plaid production access application
  - Complete Plaid's security questionnaire
- [ ] **Ensure AI insights don't constitute regulated advice**
  - Current implementation has guardrails (good)
  - Add visible disclaimers on Insights and Wealth Academy screens

### 2.4 Data Processing Agreements

- [ ] **Plaid Data Processing Agreement** - review and sign
- [ ] **Google Cloud / Gemini AI** - review data processing terms
  - Verify that transaction data sent to Gemini complies with their terms
  - Consider: is PII being sent to Gemini? If so, ensure proper DPA
- [ ] **Render.com** - review hosting DPA and data residency
- [ ] **Document all third-party sub-processors** for privacy policy

### 2.5 GDPR / PIPEDA Compliance

- [ ] **Right to Access** - API endpoint to export all user data (JSON/CSV)
- [ ] **Right to Deletion** - complete data purge including:
  - User record
  - All accounts and transactions
  - AI insights and preferences
  - Categorization cache entries
  - Educational bookmarks
  - Sync logs
  - Any analytics/logging data
- [ ] **Right to Rectification** - ability to correct personal information
- [ ] **Data Portability** - export in machine-readable format
- [ ] **Consent Management** - granular consent for:
  - Bank account linking (Plaid)
  - AI-powered insights (Gemini)
  - Educational content recommendations
- [ ] **Data minimization** - only collect what's necessary
- [ ] **Breach notification plan** - process for notifying users within 72 hours

### 2.6 Accessibility Compliance

- [ ] **WCAG 2.1 Level AA** audit for mobile app
  - Screen reader compatibility (VoiceOver / TalkBack)
  - Sufficient color contrast (current gold-on-dark may fail)
  - Touch target sizes (minimum 44x44 points)
  - Dynamic text sizing support
- [ ] **Add accessibility labels** to all interactive elements
- [ ] **Test with screen readers** on both platforms

---

## 3. Security Hardening

### 3.1 Authentication Security (P0)

- [ ] **Implement refresh tokens**
  - Short-lived access tokens (15 minutes)
  - Long-lived refresh tokens (30 days) stored securely
  - Refresh token rotation on each use
  - Revoke all refresh tokens on password change
- [ ] **Token revocation / blacklist**
  - Create `revoked_tokens` table
  - Check token validity on each request
  - Revoke tokens on logout, password change, account deletion
- [ ] **Strengthen password requirements**
  - Minimum 8 characters (currently 6)
  - Require at least one uppercase, one number
  - Check against common password lists (Have I Been Pwned API)
  - Add password strength indicator on signup screen
- [ ] **Implement account lockout**
  - Lock account after 5 failed login attempts
  - 15-minute lockout period or email-based unlock
  - Log all failed attempts with IP address
- [ ] **Add brute force protection**
  - Current rate limiting is IP-based (good)
  - Add per-account rate limiting for login attempts

### 3.2 Two-Factor Authentication (P1)

- [ ] **Implement TOTP-based 2FA** (Google Authenticator / Authy)
  - Generate shared secret on enable
  - Store encrypted in database
  - Require 2FA code on login when enabled
  - Provide backup recovery codes (store hashed)
- [ ] **Optional but recommended** for accounts with linked bank data
- [ ] **2FA management in Profile screen** - enable/disable with verification

### 3.3 Data Encryption (P0)

- [ ] **Encrypt Plaid access tokens at rest**
  - Use AES-256-GCM encryption
  - Store encryption key in environment variable (separate from DB)
  - Encrypt before storing, decrypt on read
- [ ] **Encrypt sensitive user data**
  - Plaid item IDs
  - Any PII beyond what's needed for basic auth
- [ ] **Enforce TLS/HTTPS**
  - Render.com handles this (verify)
  - Add HSTS header via helmet configuration
  - Redirect HTTP to HTTPS
- [ ] **Database connection encryption**
  - Verify SSL is enabled for PostgreSQL connection
  - Add `ssl: { rejectUnauthorized: true }` to pg config

### 3.4 API Security (P1)

- [ ] **Restrict CORS origins**
  - Replace `cors()` with specific allowed origins
  - Only allow mobile app and admin dashboard origins
  ```javascript
  cors({ origin: ['https://induswealth.com', 'exp://...'] })
  ```
- [ ] **Add request body size limits**
  - `express.json({ limit: '10kb' })` to prevent large payload attacks
- [ ] **Implement Content Security Policy** headers
- [ ] **Add API versioning** (`/api/v1/...`) for future compatibility
- [ ] **Input validation and sanitization**
  - Add `express-validator` or `joi` for all endpoints
  - Validate email format, password complexity, date formats
  - Sanitize user input to prevent XSS in stored data (transaction notes)
- [ ] **Remove duplicate bcrypt dependency**
  - Remove `bcrypt` from package.json (keep `bcryptjs` only)

### 3.5 Plaid Security (P1)

- [ ] **Apply for Plaid production access** (currently sandbox)
  - Complete security questionnaire
  - Demonstrate compliance requirements
  - Get production API keys
- [ ] **Implement Plaid webhook verification**
  - Verify webhook signatures
  - Handle `ITEM_LOGIN_REQUIRED` via update-mode Link
- [ ] **Scope Plaid products** to only what's needed
  - Currently: transactions, auth, liabilities
  - Remove any unused products to minimize data access
- [ ] **Handle Plaid token expiration gracefully**
  - Implement update-mode Plaid Link for seamless re-authentication
  - Notify users when re-auth is needed (before token expires)

### 3.6 Security Audit (P1)

- [ ] **Run dependency vulnerability scan** (`npm audit`)
- [ ] **Remove unused dependencies** (flinks.js service appears unused)
- [ ] **Conduct OWASP Top 10 review**
  - SQL Injection: Parameterized queries (good)
  - XSS: Validate/sanitize user input (notes field)
  - CSRF: Not applicable (API-only, JWT-based)
  - Insecure deserialization: Review JSON parsing
  - Broken access control: Verify user_id checks on all endpoints
- [ ] **Penetration testing** before public launch (consider third-party audit)

---

## 4. Authentication & Account Management

### 4.1 Email Verification (P0)

- [ ] **Send verification email on signup**
  - Generate verification token (random UUID)
  - Send email with verification link
  - Mark account as unverified until confirmed
  - Block Plaid linking until email is verified
- [ ] **Resend verification email** option
- [ ] **Add email service integration** (SendGrid, AWS SES, or Postmark)
- [ ] **Add `email_verified` column** to users table

### 4.2 Password Reset (P0)

- [ ] **"Forgot Password" flow**
  - Request reset via email
  - Generate time-limited reset token (1 hour)
  - Send email with reset link
  - Reset password with token validation
  - Invalidate all existing sessions on reset
- [ ] **Add reset token storage** (table or cache)
- [ ] **Rate limit reset requests** (3 per hour per email)

### 4.3 Account Recovery

- [ ] **Recovery email support** (optional secondary email)
- [ ] **Account recovery via support** process documentation
- [ ] **Session management** - view and revoke active sessions

### 4.4 Profile Enhancements

- [ ] **Profile picture upload** (optional, low priority)
- [ ] **Currency preference** (currently assumes USD/CAD)
- [ ] **Language preference** (future i18n support)
- [ ] **Notification preferences** (see Section 13)

---

## 5. Backend Infrastructure

### 5.1 Environment Configuration (P0)

- [ ] **Set NODE_ENV=production** in Render environment
- [ ] **Add environment validation on startup**
  ```javascript
  const required = ['JWT_SECRET', 'DATABASE_URL', 'PLAID_CLIENT_ID', ...];
  required.forEach(key => {
    if (!process.env[key]) throw new Error(`Missing env: ${key}`);
  });
  ```
- [ ] **Separate configs for development/staging/production**
- [ ] **Validate JWT_SECRET is strong** (minimum 32 characters in production)

### 5.2 Process Management (P1)

- [ ] **Add graceful shutdown handling**
  ```javascript
  process.on('SIGTERM', async () => {
    await server.close();
    await db.pool.end();
    process.exit(0);
  });
  ```
- [ ] **Add health check endpoint** (`GET /health`)
  - Check database connectivity
  - Check Plaid API connectivity
  - Return uptime, version, memory usage
- [ ] **Handle uncaught exceptions and unhandled rejections**
  - Log the error
  - Report to Sentry
  - Gracefully restart

### 5.3 API Response Compression (P2)

- [ ] **Add gzip compression** (`compression` middleware)
- [ ] **Set appropriate cache headers** for static responses

### 5.4 Background Jobs (P2)

- [ ] **Implement job queue** for:
  - Plaid transaction sync (periodic, not on-demand)
  - AI categorization batch processing
  - Insight pre-generation
  - Email sending
- [ ] **Options**: Bull (Redis-based), Agenda (MongoDB), or simple cron via `node-cron`

### 5.5 Webhook Support (P2)

- [ ] **Implement Plaid webhooks**
  - `TRANSACTIONS`: Receive real-time transaction updates
  - `ITEM`: Handle `ITEM_LOGIN_REQUIRED` and other status changes
  - `HOLDINGS`: Portfolio updates (future)
- [ ] **Webhook endpoint** with signature verification
- [ ] **Retry logic** for failed webhook processing

---

## 6. Database & Data Management

### 6.1 Migration System (P1)

- [ ] **Implement proper migration versioning**
  - Add migration tracking table (`schema_migrations`)
  - Use sequential version numbers or timestamps
  - Support rollback (down migrations)
  - Options: `node-pg-migrate`, `knex`, or custom
- [ ] **Run pending migrations on Render**
  - Verify `add_ai_categorization.sql` tables exist
  - Verify `add_educational_content.sql` tables exist
- [ ] **Test migrations on fresh database**

### 6.2 Backups (P0)

- [ ] **Configure automated database backups**
  - Render managed PostgreSQL includes daily backups (verify plan)
  - Set retention period (minimum 30 days)
  - Test backup restoration process
- [ ] **Implement point-in-time recovery** if available
- [ ] **Document backup/restore procedure** in runbook

### 6.3 Data Retention Policy (P1)

- [ ] **Define retention periods**:
  - Transactions: Keep indefinitely (user data)
  - AI insights cache: 6 hours (already implemented)
  - Merchant category cache: 30 days TTL (already implemented)
  - Educational articles: 7 days (already implemented)
  - Sync logs: 90 days
  - Error logs: 30 days
  - Deleted user data: Purge immediately
- [ ] **Implement cleanup job** for expired data
- [ ] **Archive old transactions** (>3 years) to cold storage

### 6.4 Database Indexing (P2)

- [ ] **Audit existing indexes** with `EXPLAIN ANALYZE` on common queries
- [ ] **Add missing indexes**:
  - `transactions(user_id, date DESC)` - for sorted transaction lists
  - `transactions(user_id, category)` - for analytics queries
  - `accounts(user_id)` - for account listing
  - `user_insights(user_id, expires_at)` - for cache lookups
- [ ] **Monitor slow queries** in production

### 6.5 Connection Pool Management (P1)

- [ ] **Configure pool limits appropriately**
  - Current: default pg pool settings
  - Set `max: 20` for production
  - Set `idleTimeoutMillis: 30000`
  - Set `connectionTimeoutMillis: 5000`
- [ ] **Monitor connection pool health**
- [ ] **Handle pool exhaustion** gracefully

---

## 7. API Quality & Documentation

### 7.1 API Documentation (P1)

- [ ] **Add OpenAPI/Swagger specification**
  - Document all endpoints with request/response schemas
  - Include authentication requirements
  - Document error codes and responses
  - Add example requests and responses
- [ ] **Serve Swagger UI** at `/api/docs` (development only)
- [ ] **Generate API reference** from OpenAPI spec
- [ ] **Keep Postman collection in sync** with changes

### 7.2 API Versioning (P2)

- [ ] **Prefix all routes with `/api/v1`**
- [ ] **Plan for version deprecation** strategy
- [ ] **Add API version in response headers**

### 7.3 Request Validation (P1)

- [ ] **Add comprehensive input validation** using `express-validator` or `joi`:
  - Email format validation
  - Password complexity rules
  - Date format validation
  - Amount/numeric validation
  - String length limits
  - Array size limits (for batch operations)
- [ ] **Return detailed validation errors** with field names and hints
- [ ] **Sanitize all user input** (HTML entities, SQL special chars)

### 7.4 API Consistency (P2)

- [ ] **Standardize response format** across all endpoints
  - Currently mostly consistent, but some variation exists
  - Always include: `success`, `data`, `message`, `requestId`
- [ ] **Standardize error format**
  - Always include: `success: false`, `code`, `message`, `requestId`
- [ ] **Standardize pagination** for list endpoints
  - Add `page`, `limit`, `total`, `hasMore` to transaction/account lists
  - Default limit: 50, max limit: 200

---

## 8. Mobile App Polish

### 8.1 Loading & Error States (P1)

- [ ] **Add skeleton loading screens** (instead of blank screens with spinners)
- [ ] **Implement pull-to-refresh** on all data screens
- [ ] **Add empty state illustrations** for:
  - No transactions yet
  - No accounts linked
  - No insights available
  - No subscriptions detected
- [ ] **Improve error states** with retry buttons and helpful messages
- [ ] **Add offline indicator** banner when no internet connection

### 8.2 Navigation & UX (P2)

- [ ] **Add deep linking support** for:
  - Opening specific accounts from notifications
  - Navigating to insights from push notifications
  - Sharing account views (future)
- [ ] **Add transition animations** between screens
- [ ] **Implement haptic feedback** for key interactions
- [ ] **Add swipe gestures** (swipe to dismiss, swipe to delete)

### 8.3 Component Refactoring (P2)

- [ ] **Extract reusable components** from large screens:
  - Transaction list item component
  - Account card component
  - Insight card component
  - Chart wrapper components
  - Header/navigation bar components
- [ ] **Create a shared Button component** with loading/disabled states
- [ ] **Create shared form inputs** with validation states

### 8.4 Accessibility (P1)

- [ ] **Add accessibilityLabel** to all interactive elements
- [ ] **Add accessibilityRole** to buttons, links, headers
- [ ] **Test with VoiceOver** (iOS) and **TalkBack** (Android)
- [ ] **Ensure minimum touch target size** (44x44 points)
- [ ] **Check color contrast** - gold (#C9A227) on dark (#000000):
  - Contrast ratio: ~6.5:1 (passes AA but check all combinations)
  - Light text on dark backgrounds should be verified
- [ ] **Support dynamic text sizes** (system font scaling)

### 8.5 Biometric Authentication (P2)

- [ ] **Add fingerprint / Face ID login**
  - Use `expo-local-authentication`
  - Store auth token securely in keychain/keystore
  - Offer biometric login after first successful login
  - Fallback to password entry

### 8.6 App Icon & Splash Screen (P1)

- [ ] **Design production app icon** (1024x1024 base)
  - Follow Apple and Google guidelines
  - Distinct, recognizable at small sizes
- [ ] **Design splash/launch screen**
  - Match app theme (dark with gold accents)
  - Show app logo
  - Smooth transition to home screen
- [ ] **Configure adaptive icons** for Android

---

## 9. Testing

### 9.1 Unit Tests (P1)

- [ ] **Set up Jest** for backend and mobile
  ```bash
  npm install --save-dev jest @testing-library/react-native
  ```
- [ ] **Backend unit tests** (target: 70% coverage):
  - `debt_calculator.js` - payoff algorithm correctness
  - `categorization.js` - category mapping accuracy
  - `ai_insights.js` - prompt generation, response parsing
  - `watchdog.js` - subscription detection patterns
  - `auth.js` - token generation, validation
  - `db.js` - query builders, data transformations
  - `errorHandler.js` - error classification
- [ ] **Mobile unit tests**:
  - `api.js` - request formatting, error parsing
  - `cache.js` - storage operations
  - Utility functions
  - Component rendering tests

### 9.2 Integration Tests (P1)

- [ ] **Set up Supertest** for API testing
  ```bash
  npm install --save-dev supertest
  ```
- [ ] **Test complete flows**:
  - Signup → Login → Get Token → Access Protected Route
  - Connect Plaid → Sync Accounts → Fetch Transactions
  - Fetch Analytics → Verify Calculations
  - Generate Insights → Dismiss Insight → Verify Persistence
  - Create Custom Debt → Calculate Payoff → Verify Math
- [ ] **Test error handling**:
  - Invalid JWT token → 401
  - Rate limit exceeded → 429
  - Invalid input → 400 with details
  - Database error → 500 with requestId
- [ ] **Use test database** (separate from development)

### 9.3 End-to-End Tests (P3)

- [ ] **Set up Detox** for mobile E2E tests
  ```bash
  npm install --save-dev detox detox-cli
  ```
- [ ] **Test critical user journeys**:
  - New user signup → connect bank → view dashboard
  - Existing user login → view transactions → add note
  - View analytics → switch category filter → verify chart
  - View insights → dismiss → verify persistence
- [ ] **Run E2E tests in CI** on each release

### 9.4 Test Infrastructure (P2)

- [ ] **Add test scripts to package.json**
  ```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --config jest.integration.config.js"
  }
  ```
- [ ] **Set up test database seeding** with realistic data
- [ ] **Mock external services** (Plaid, Gemini) in tests
- [ ] **Add coverage thresholds** (fail CI below 60%)

---

## 10. CI/CD & DevOps

### 10.1 GitHub Actions (P1)

- [ ] **Create CI workflow** (`.github/workflows/ci.yml`):
  ```yaml
  on: [push, pull_request]
  jobs:
    lint:    # ESLint + Prettier
    test:    # Unit + Integration tests
    build:   # Verify builds succeed
    audit:   # npm audit for vulnerabilities
  ```
- [ ] **Create CD workflow** (`.github/workflows/deploy.yml`):
  ```yaml
  on:
    push:
      branches: [main]
  jobs:
    deploy-backend:    # Trigger Render deploy
    build-mobile:      # Trigger EAS build (on release tags)
  ```
- [ ] **Add branch protection rules**:
  - Require CI passing before merge
  - Require at least 1 review (if team)
  - No direct pushes to main

### 10.2 Code Quality (P2)

- [ ] **Add ESLint** with recommended rules
  ```bash
  npm install --save-dev eslint eslint-config-recommended
  ```
- [ ] **Add Prettier** for code formatting
  ```bash
  npm install --save-dev prettier
  ```
- [ ] **Add pre-commit hooks** with Husky + lint-staged
  ```bash
  npm install --save-dev husky lint-staged
  ```
- [ ] **Add commit message linting** (Conventional Commits)

### 10.3 Environment Management (P1)

- [ ] **Create staging environment** on Render
  - Separate database instance
  - Plaid sandbox credentials
  - Test Gemini API key
- [ ] **Document environment promotion** process:
  1. Develop on local
  2. Test on staging
  3. Deploy to production
- [ ] **Never deploy untested code directly to production**

### 10.4 Infrastructure as Code (P3)

- [ ] **Document all Render configuration** (render.yaml or similar)
- [ ] **Document database setup** steps
- [ ] **Create Docker setup** for local development parity

---

## 11. Monitoring, Logging & Alerting

### 11.1 Error Tracking (P0)

- [ ] **Integrate Sentry** for backend and mobile:
  ```bash
  # Backend
  npm install @sentry/node
  # Mobile
  npx expo install sentry-expo
  ```
- [ ] **Configure error grouping** and alert thresholds
- [ ] **Set up Slack/email alerts** for:
  - New error types
  - Error rate spikes (>5x normal)
  - Critical errors (database, auth failures)
- [ ] **Add user context** to Sentry events (user ID, not PII)

### 11.2 Application Metrics (P2)

- [ ] **Track key metrics**:
  - API response times (p50, p95, p99)
  - Error rate by endpoint
  - Active users (DAU/MAU)
  - Plaid sync success/failure rate
  - AI insight generation times
  - Database query latency
  - Memory and CPU usage
- [ ] **Options**: Prometheus + Grafana, Datadog, or Render built-in metrics
- [ ] **Create dashboards** for at-a-glance health view

### 11.3 Logging Improvements (P1)

- [ ] **Centralize log aggregation**
  - Current: Render dashboard (limited retention)
  - Options: Datadog, Papertrail, LogDNA, CloudWatch
- [ ] **Add structured context to all logs**:
  - Request ID (already done)
  - User ID
  - Endpoint
  - Response time
  - Status code
- [ ] **Set log retention policy** (30 days minimum)
- [ ] **Add log-based alerts** (error patterns, suspicious activity)

### 11.4 Uptime Monitoring (P1)

- [ ] **Set up uptime monitoring** (UptimeRobot, Pingdom, or Better Uptime)
  - Monitor `/health` endpoint every 1 minute
  - Alert on downtime via SMS/email/Slack
- [ ] **Create status page** (optional) - statuspage.io or similar
- [ ] **Define SLA targets**:
  - Uptime: 99.5% (allows ~3.6 hours downtime/month)
  - API response time: p95 < 500ms
  - Plaid sync: < 30 second latency

### 11.5 Audit Logging (P1)

- [ ] **Create audit_log table**:
  ```sql
  CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100),      -- 'LOGIN', 'PLAID_CONNECT', 'DATA_EXPORT', etc.
    resource_type VARCHAR(50), -- 'user', 'account', 'transaction'
    resource_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- [ ] **Log security-relevant actions**:
  - Login attempts (success and failure)
  - Password changes
  - Plaid connections and disconnections
  - Data exports
  - Account deletion
  - Profile changes
  - 2FA enable/disable

---

## 12. Performance & Scalability

### 12.1 Backend Optimization (P2)

- [ ] **Add response compression** (gzip/brotli)
  ```javascript
  const compression = require('compression');
  app.use(compression());
  ```
- [ ] **Implement Redis caching** for frequently accessed data:
  - User sessions
  - Account balances (5-minute TTL)
  - Analytics aggregations (1-hour TTL)
- [ ] **Optimize database queries**:
  - Run `EXPLAIN ANALYZE` on all major queries
  - Add composite indexes for common WHERE + ORDER BY patterns
  - Consider materialized views for analytics
- [ ] **Add connection pooling metrics** to monitor pool utilization

### 12.2 Mobile Optimization (P2)

- [ ] **Replace ScrollView with FlatList** for transaction lists
  - Better memory usage for large lists
  - Built-in virtualization
- [ ] **Implement React.memo** on expensive components
- [ ] **Lazy load screens** that aren't immediately needed
- [ ] **Optimize bundle size**:
  - Analyze with `npx expo export --dump-sourcemap`
  - Tree-shake unused code
  - Use `react-native-bundle-visualizer`
- [ ] **Image optimization** - use WebP format, proper sizing
- [ ] **Reduce app launch time**:
  - Defer non-critical initialization
  - Cache auth state for instant startup

### 12.3 Scalability Preparations (P3)

- [ ] **Horizontal scaling readiness**:
  - JWT auth is already stateless (good)
  - Add Redis for any shared state
  - Ensure no in-memory session storage
- [ ] **Database scaling plan**:
  - Read replicas for analytics queries
  - Connection pooling via PgBouncer (when needed)
  - Table partitioning for transactions (by date)
- [ ] **CDN for static assets** (educational article images, etc.)
- [ ] **Rate limiting per user** (not just per IP)
  - Track API usage per user for fair usage

---

## 13. Notification System

### 13.1 Push Notifications (P2)

- [ ] **Set up push notification infrastructure**:
  - Use `expo-notifications` for cross-platform push
  - Register for push tokens on login
  - Store push tokens in database (new `push_tokens` table)
- [ ] **Configure notification channels**:
  ```
  - Financial Alerts (high priority)
  - Insights & Tips (normal priority)
  - Account Updates (normal priority)
  - Security Alerts (high priority)
  ```
- [ ] **Implement notification types**:
  - Large transaction alert (above user-defined threshold)
  - Low balance warning
  - New AI insight available
  - Subscription payment upcoming
  - Plaid re-authentication required
  - Security alert (new device login)
  - Weekly/monthly spending summary

### 13.2 Email Notifications (P1)

- [ ] **Set up email service** (SendGrid, AWS SES, or Postmark)
- [ ] **Implement transactional emails**:
  - Welcome email on signup
  - Email verification
  - Password reset
  - Security alerts (login from new device/location)
  - Account deletion confirmation
- [ ] **Implement digest emails** (optional, user preference):
  - Weekly spending summary
  - Monthly financial report
  - New insights digest
- [ ] **Email templates** with consistent branding

### 13.3 In-App Notifications (P2)

- [ ] **Create notification center** in the app:
  - Bell icon in header with unread count badge
  - Notification list screen
  - Mark as read/unread
  - Swipe to dismiss
- [ ] **Create `notifications` table**:
  ```sql
  CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(50),
    title TEXT,
    body TEXT,
    data JSONB,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

### 13.4 Notification Preferences (P2)

- [ ] **Add preference screen** for each notification type:
  - Enable/disable per channel (push, email, in-app)
  - Set quiet hours (no push between 10pm-8am)
  - Set alert thresholds (e.g., alert on transactions > $100)
- [ ] **Store preferences** in `user_preferences` table (partially exists)
- [ ] **Respect user preferences** in all notification sending logic

---

## 14. Onboarding & User Experience

### 14.1 First-Time User Experience (P2)

- [ ] **Add onboarding walkthrough** (3-4 screens):
  1. Welcome - what IndusWealth does
  2. Security - how data is protected (Plaid, encryption)
  3. Features - AI insights, debt attack, analytics
  4. Get Started - connect your first bank account
- [ ] **Show feature tooltips** on first visit to each screen
- [ ] **Progressive disclosure** - don't overwhelm new users
- [ ] **Demo mode** (optional) - show sample data without linking bank

### 14.2 Bank Connection Flow (P1)

- [ ] **Improve post-connection experience**:
  - Show sync progress with clear messaging
  - Redirect to home screen after successful connection
  - Handle Plaid errors gracefully with user-friendly messages
- [ ] **Support multiple bank connections** - verify this works end-to-end
- [ ] **Add "reconnect" flow** for expired Plaid connections

### 14.3 Empty States (P2)

- [ ] **Design empty state screens** for each section:
  - Transactions: "No transactions yet. Connect a bank to get started."
  - Analytics: "Connect a bank to see your spending insights."
  - Watchdog: "We'll detect subscriptions once you have transactions."
  - Insights: "AI insights will appear after we analyze your finances."
- [ ] **Include call-to-action** in empty states (e.g., "Connect Bank" button)

### 14.4 Settings & Customization (P3)

- [ ] **Theme toggle** (dark mode is default, but add light mode option)
- [ ] **Currency selector** (CAD, USD, other)
- [ ] **Date format preference** (MM/DD/YYYY vs DD/MM/YYYY)
- [ ] **Dashboard customization** - choose which widgets to show

---

## 15. Feature Gaps & Enhancements

### 15.1 Transaction Management (P2)

- [ ] **Transaction search** - search by name, merchant, amount, date range
- [ ] **Transaction editing** - correct categorization, merchant name
- [ ] **Transaction splitting** - split a transaction across categories
- [ ] **Recurring transaction detection** improvement - ML-based instead of regex-only
- [ ] **Receipt attachment** (photo capture, optional)

### 15.2 Budgeting (P3)

- [ ] **Category budgets** - set monthly budget per category
- [ ] **Budget tracking** - show progress bars against budget
- [ ] **Budget alerts** - notify when approaching/exceeding budget
- [ ] **Budget history** - compare budget vs actual over time

### 15.3 Reports & Export (P2)

- [ ] **Monthly financial report** (PDF or in-app)
  - Income summary
  - Expense breakdown by category
  - Net worth change
  - Subscription costs
  - Top merchants
- [ ] **Data export** (CSV/JSON) for:
  - All transactions
  - Account information
  - Analytics data
- [ ] **Tax report helper** - categorize deductible expenses

### 15.4 Multi-Account Features (P2)

- [ ] **Net worth tracking** across all accounts
- [ ] **Account grouping** (checking, savings, credit, loans)
- [ ] **Transfer detection** between own accounts (avoid double-counting)
- [ ] **Account-level analytics** (spending per account)

### 15.5 Goals & Savings (P3)

- [ ] **Savings goals** - define target amount and deadline
- [ ] **Goal tracking** - show progress towards goals
- [ ] **Goal suggestions** from AI insights
- [ ] **Emergency fund calculator**

---

## 16. App Store & Distribution

### 16.1 Google Play Store (P1)

- [ ] **Create Google Play Developer account** ($25 one-time fee)
- [ ] **Prepare store listing**:
  - App title: "IndusWealth - Personal Finance"
  - Short description (80 chars)
  - Full description (4000 chars)
  - Feature graphic (1024x500)
  - Screenshots (phone + tablet, min 2 per device type)
  - App category: Finance
  - Content rating questionnaire
  - Privacy policy URL (required for finance apps)
- [ ] **Build production APK/AAB** via EAS
  ```bash
  eas build --platform android --profile production
  ```
- [ ] **Internal testing** → Closed beta → Open beta → Production rollout
- [ ] **Set up Google Play Console** alerts for crashes and reviews

### 16.2 Apple App Store (P2)

- [ ] **Apple Developer Program** enrollment ($99/year)
- [ ] **Prepare App Store listing**:
  - Same content as Play Store, adapted for Apple guidelines
  - Screenshots for iPhone and iPad sizes
  - App Preview video (optional but recommended)
- [ ] **Build iOS app** via EAS
  ```bash
  eas build --platform ios --profile production
  ```
- [ ] **Submit for App Store Review**
  - Finance apps get extra scrutiny
  - Prepare for questions about data handling
  - May need to demonstrate Plaid integration to reviewer
- [ ] **TestFlight** for beta testing before submission

### 16.3 Store Optimization (P3)

- [ ] **App Store Optimization (ASO)**:
  - Keyword research for finance app discovery
  - A/B test app icon and screenshots
  - Localize listing for target markets
- [ ] **Review management** - respond to user reviews promptly
- [ ] **Release notes** for each update (what's new)

---

## 17. Support & Operations

### 17.1 Customer Support (P1)

- [ ] **Create support email** (support@induswealth.com or similar)
- [ ] **Add in-app support link** in Profile screen
- [ ] **Create FAQ / Help Center**:
  - How to connect a bank account
  - How to disconnect an account
  - How are categories determined?
  - Is my data secure?
  - How to delete my account
  - Troubleshooting Plaid connection issues
- [ ] **Bug reporting mechanism** - in-app feedback form or link

### 17.2 Operational Runbooks (P1)

- [ ] **Create runbook documents** for:
  - Deploying a new version (backend + mobile)
  - Rolling back a failed deployment
  - Database backup and restore procedure
  - Handling a security incident
  - Responding to Plaid outages
  - Investigating user-reported bugs
  - Scaling up infrastructure
  - Rotating API keys and secrets

### 17.3 Incident Response (P1)

- [ ] **Define incident severity levels**:
  - P0: Service down, data breach → immediate response
  - P1: Major feature broken → respond within 1 hour
  - P2: Minor issue → respond within 24 hours
  - P3: Cosmetic / low impact → next sprint
- [ ] **Create incident response plan**:
  1. Detect (monitoring alerts)
  2. Triage (determine severity)
  3. Communicate (notify users if needed)
  4. Fix (resolve the issue)
  5. Post-mortem (document and prevent recurrence)
- [ ] **Set up on-call rotation** (if team)

### 17.4 Analytics & Business Metrics (P3)

- [ ] **Track key business metrics**:
  - Daily/Monthly active users
  - User retention (Day 1, Day 7, Day 30)
  - Bank connection success rate
  - Feature usage (which screens, which features)
  - Churn rate and reasons
- [ ] **Options**: Mixpanel, Amplitude, PostHog, or custom
- [ ] **GDPR-compliant analytics** (anonymize user data)

---

## 18. Cost & Infrastructure Planning

### 18.1 Current Costs

| Service | Plan | Est. Monthly Cost |
|---------|------|-------------------|
| Render.com (Backend) | Free/Starter | $0 - $7 |
| Render.com (PostgreSQL) | Free/Starter | $0 - $7 |
| Plaid | Free (100 items sandbox) | $0 (sandbox) |
| Google Gemini AI | Pay-per-use | ~$5 - $20 |
| **Total (current)** | | **$0 - $34** |

### 18.2 Production Costs (Estimated)

| Service | Plan | Est. Monthly Cost |
|---------|------|-------------------|
| Render.com (Backend) | Standard | $25 |
| Render.com (PostgreSQL) | Standard | $25 |
| Plaid | Production (per-item) | $0.30/item/month |
| Google Gemini AI | Pay-per-use | $10 - $50 |
| SendGrid (Email) | Free tier | $0 |
| Sentry (Error tracking) | Developer | $0 |
| Domain + SSL | Annual | ~$2/month |
| Apple Developer Program | Annual | ~$8/month |
| Google Play Developer | One-time | $25 |
| **Total (100 users)** | | **~$100 - $150** |
| **Total (1000 users)** | | **~$400 - $600** |

### 18.3 Cost Optimization (P3)

- [ ] **Monitor Gemini AI costs** - batch requests, increase cache TTL
- [ ] **Optimize Plaid usage** - only sync when needed, use webhooks
- [ ] **Cache aggressively** - reduce database queries
- [ ] **Set cost alerts** on all services
- [ ] **Plan for growth** - when to upgrade plans

---

## 19. Launch Checklist

### Pre-Launch (1 week before)

- [ ] All P0 tasks completed
- [ ] Security audit passed
- [ ] Terms of Service and Privacy Policy published
- [ ] Production environment configured and tested
- [ ] Database backups verified
- [ ] Error tracking (Sentry) active
- [ ] Uptime monitoring active
- [ ] Email service configured and tested
- [ ] Plaid production access approved
- [ ] All migrations run on production database
- [ ] Load testing completed (simulate expected traffic)

### Launch Day

- [ ] Final smoke test on production
- [ ] Verify all API endpoints respond correctly
- [ ] Verify mobile app connects to production API
- [ ] Verify Plaid connection works in production mode
- [ ] Verify AI insights generate correctly
- [ ] Verify email notifications send correctly
- [ ] Monitor error rates closely for first 24 hours
- [ ] Have rollback plan ready if critical issues found

### Post-Launch (first week)

- [ ] Monitor error rates daily
- [ ] Respond to user feedback within 24 hours
- [ ] Fix any critical bugs immediately
- [ ] Review analytics for unexpected patterns
- [ ] Check database performance under real load
- [ ] Verify backup system is working
- [ ] Document any issues encountered
- [ ] Plan next iteration based on user feedback

---

## 20. Post-Launch Roadmap

### Phase 1: Stability (Month 1)
- Fix bugs reported by users
- Optimize performance based on real usage data
- Complete remaining P1 tasks
- Build test coverage to 60%+

### Phase 2: Growth (Month 2-3)
- Implement budgeting features
- Add push notifications
- Implement transaction search and editing
- App Store optimization

### Phase 3: Advanced Features (Month 4-6)
- Net worth tracking
- Savings goals
- Investment portfolio view
- Bill payment reminders
- Multi-currency support

### Phase 4: Scale (Month 6-12)
- Performance optimization for 10k+ users
- Advanced AI features (predictive spending, anomaly detection)
- API rate limiting per user tier
- Consider premium/paid features
- International expansion

---

## Appendix A: File-Level Task Reference

### Backend Files Needing Changes

| File | Changes Needed |
|------|---------------|
| `index.js` | Add health check endpoint, graceful shutdown, env validation, compression |
| `middleware/auth.js` | Add refresh tokens, token revocation, account lockout |
| `routes/users.js` | Add email verification, password reset, data export |
| `services/db.js` | Add migration versioning, connection pool config, audit logging |
| `services/plaid.js` | Add webhook handling, token refresh, production mode |
| `package.json` | Add test scripts, linting, remove duplicate bcrypt |
| New: `middleware/validation.js` | Input validation middleware |
| New: `services/email.js` | Email sending service |
| New: `services/notifications.js` | Push notification service |
| New: `routes/notifications.js` | Notification API endpoints |

### Mobile Files Needing Changes

| File | Changes Needed |
|------|---------------|
| `App.js` | Add Sentry, notification setup, biometric auth |
| `navigation/AppNavigator.js` | Add deep linking, notification center |
| `screens/LoginScreen.js` | Add biometric login, forgot password link |
| `screens/SignupScreen.js` | Add ToS/Privacy acceptance, email verification |
| `screens/ProfileScreen.js` | Add notification preferences, data export, 2FA |
| `screens/HomeScreen.js` | Add notification badge, empty states |
| `services/api.js` | Add refresh token logic, retry mechanism |
| New: `screens/OnboardingScreen.js` | First-time user walkthrough |
| New: `screens/NotificationsScreen.js` | Notification center |
| New: `components/` | Multiple reusable components |

### New Database Tables Needed

| Table | Purpose |
|-------|---------|
| `email_verifications` | Email verification tokens |
| `password_resets` | Password reset tokens |
| `revoked_tokens` | JWT token blacklist |
| `push_tokens` | Device push notification tokens |
| `notifications` | In-app notification storage |
| `audit_log` | Security audit trail |
| `schema_migrations` | Migration version tracking |
| `totp_secrets` | 2FA TOTP secrets (encrypted) |
| `user_budgets` | Category budget targets (future) |
| `savings_goals` | User savings goals (future) |

---

## Appendix B: Third-Party Services Needed

| Service | Purpose | Free Tier? | Est. Cost |
|---------|---------|------------|-----------|
| **SendGrid** or **Postmark** | Transactional email | Yes (100/day) | $0-15/mo |
| **Sentry** | Error tracking | Yes (5k events) | $0-26/mo |
| **UptimeRobot** | Uptime monitoring | Yes (50 monitors) | $0 |
| **Plaid Production** | Bank connection | No | $0.30/item/mo |
| **Google Play Console** | Android distribution | One-time $25 | $25 |
| **Apple Developer Program** | iOS distribution | No | $99/year |
| **Domain registrar** | induswealth.com | No | $12-15/year |
| **Redis** (optional) | Caching, sessions | Render free tier | $0-10/mo |

---

*This document should be reviewed and updated as tasks are completed. Use the checkboxes to track progress. Prioritize P0 items first, then work through P1, P2, and P3 in order.*
