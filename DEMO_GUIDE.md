# IndusWealth - Project Demonstration Guide

> **Meeting Date**: February 24, 2026
> **Presenter**: Project Owner
> **Audience**: Fullstack Developer, Digital Marketing Expert, Software Quality Expert, Investment Portfolio Manager, Security Consultant
> **Duration**: ~45 minutes (demo) + Q&A

---

## 1. Opening - What Is IndusWealth? (3 min)

### Elevator Pitch
IndusWealth is a **personal finance mobile app** designed for **Canadian users** that connects to real bank accounts via Plaid, provides AI-powered financial insights using Google Gemini, and helps users attack their debt with proven payoff strategies.

### Key Differentiators
- **Canada-first**: Built for Canadian banking, regulations (PIPEDA), and financial products
- **AI-powered**: Google Gemini generates personalized financial insights from aggregated data (no PII sent to AI)
- **Privacy-focused**: AES-256-GCM encryption, TOTP 2FA, token rotation with reuse detection
- **Debt Attack**: Snowball & Avalanche calculators with custom debt support and real Plaid liabilities

### Tech Stack At a Glance

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo SDK 54), React Navigation 6 |
| Backend | Node.js, Express 5.2, PostgreSQL 15 |
| Bank Data | Plaid SDK v41 (sandbox, Canada-only) |
| AI | Google Gemini Flash 2.0 |
| Auth | JWT (15min access + 30d refresh tokens), TOTP 2FA |
| Hosting | Render.com (backend + DB), EAS (mobile builds) |

---

## 2. Architecture Overview (5 min)

### Show the Team This Diagram

```
                    ┌─────────────────────┐
                    │   Mobile App (Expo)  │
                    │  14 Screens, 2-layer │
                    │  cache (AsyncStorage)│
                    └─────────┬───────────┘
                              │ HTTPS (JWT Bearer)
                              ▼
                    ┌─────────────────────┐
                    │  Express API Server  │
                    │  10 Route Groups     │
                    │  Middleware: auth,    │
                    │  rate-limit, helmet,  │
                    │  validators          │
                    └──┬──────┬──────┬─────┘
                       │      │      │
              ┌────────┘      │      └────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ PostgreSQL│   │  Plaid   │   │  Gemini  │
        │  15 (DB)  │   │ (Banks)  │   │  (AI)    │
        │ 20 tables │   │ Canada   │   │ Flash 2.0│
        └──────────┘   └──────────┘   └──────────┘
```

### Monorepo Structure
```
IndusWealth/
├── packages/backend/    # Express API (routes, services, middleware)
├── packages/mobile/     # React Native app (screens, navigation, services)
├── docs/legal/          # Terms of Service, Privacy Policy, Disclaimers
└── PRODUCTION_ROADMAP.md # Full production readiness checklist
```

### Key Architecture Decisions to Highlight
1. **Two-layer caching**: Mobile AsyncStorage + server PostgreSQL (24hr sync policy)
2. **No PII to AI**: Only aggregated summaries sent to Gemini
3. **Token family rotation**: Refresh tokens use family-based reuse detection
4. **Encrypted at rest**: Plaid tokens encrypted with AES-256-GCM

---

## 3. Live Demo Walkthrough (25 min)

> **Prerequisites**: Have the mobile app running on a device/emulator and the backend running locally or on Render.

### Demo Credentials
- **App login**: `demo@induswealth.com` / `demo123`
- **Plaid sandbox**: `user_good` / `pass_good`

---

### 3.1 Authentication Flow (3 min)

**Screen: LoginScreen**
- Show the login form with email/password
- Point out the **dark theme with gold accents** (Space Grotesk font)
- Demonstrate login with demo credentials
- **Mention**: Password strength validation (8+ chars, 1 uppercase, 1 number)
- **Mention**: Account locks after 5 failed attempts (15-minute cooldown)

**Screen: SignupScreen** (briefly show, don't create account)
- Password strength indicator (0-4 score with visual bar)
- Terms of Service and Privacy Policy acceptance

**2FA Flow** (if configured on demo account)
- Show the 6-digit TOTP code entry screen
- Mention: QR setup, 8 recovery codes, encrypted secret storage

---

### 3.2 Home Dashboard (4 min)

**Screen: HomeScreen**
- **Total Balance**: Aggregated across all linked accounts
- **Balance Trend Chart**: SVG mini-chart showing balance over time
- **Account Cards**: Colored cards (8-color rotation) with account names and balances
- **Recent Transactions**: Last 20 transactions with categories, amounts, dates
- **Pull-to-refresh**: Demonstrate syncing with Plaid

**Key Points to Highlight**:
- Data comes from Plaid via 24-hour cache policy (avoids excessive API calls)
- Balance can be hidden/shown (privacy toggle)
- Tap an account card → navigates to account-specific transactions

---

### 3.3 AI Insights (4 min)

**Screen: InsightsScreen**
- Show the **priority-coded insight cards** (High = red accent, Medium = gold, Low = green)
- Walk through an example insight (e.g., "Open a TFSA" or "Reduce dining spending")
- Show the **7 insight categories**: Tax-Advantaged, Spending Optimization, Debt Payoff, Savings, Cash Flow, Investment Readiness, Milestones
- Demonstrate **dismissing an insight** (with reason: not interested, already done, remind later)
- Show the **educational article links** attached to each insight

**Key Points to Highlight**:
- Powered by Google Gemini Flash 2.0
- Only aggregated data sent (no account numbers, no names, no merchant details)
- 6-hour server-side cache to control API costs
- Insights are personalized based on the user's actual financial data

---

### 3.4 Debt Attack Calculator (5 min)

**Screen: DebtAttackScreen**
- Show the **three strategies** side by side:
  - **Status Quo**: Minimum payments only
  - **Snowball**: Pay off smallest balance first (psychological wins)
  - **Avalanche**: Pay off highest APR first (saves most interest)
- Demonstrate the **extra payment slider** ($0 - $5,000/month)
- Show real-time recalculation as slider moves
- Show **per-debt breakdown**: balance, APR, minimum payment, months to payoff
- Show **savings comparison**: "You save $X,XXX in interest and Y months"

**Custom Debts**:
- Demonstrate adding a custom debt (e.g., personal loan, car payment)
- Show APR override for a Plaid account
- Show default APRs (CC 22%, LOC 11%, Student 6%)

**Key Points to Highlight**:
- Combines real Plaid liabilities + custom debts in one view
- Math is verified and accurate (compound interest, amortization)
- This is a key differentiator - most apps don't have payoff simulators

---

### 3.5 Analytics Dashboard (3 min)

**Screen: AnalyticsScreen**
- Show **intent-based spending breakdown**: Fixed Needs, Growth, Lifestyle
- Show **category breakdown** with bar charts (16 categories)
- Show **top merchants** comparison (this month vs last month)
- Show **monthly savings** calculation (income - expenses)

**Key Points to Highlight**:
- Victory Native charts with gold gradient fills
- Current vs previous month comparison
- Monthly progress indicator (% of month elapsed vs % of budget spent)

---

### 3.6 Watchdog - Subscription Detector (1 min)

**Screen: WatchdogScreen**
- Show the recurring expense detection interface
- **Note**: This is currently a placeholder/MVP - subscription detection logic needs enhancement
- Categories: Streaming, Utilities, Other
- Actions: Negotiate, Stop, Monitor, Keep

---

### 3.7 Wealth Academy (2 min)

**Screen: WealthAcademyScreen**
- Show category tabs: All, Budgeting, Investing, Debt, Taxes, Savings, Bookmarks
- Show article cards with metadata (read time, source, image)
- Demonstrate bookmarking an article
- Open an article in the WebView
- Show how articles are linked to AI insights

**Key Points to Highlight**:
- Curated from trusted sources (NerdWallet, Investopedia, MoneySense, Canada.ca)
- 7-day cache for article metadata
- AI recommends relevant articles based on user's financial situation

---

### 3.8 Profile & Security (3 min)

**Screen: ProfileScreen**
- Show user info editing (name, DOB)
- Show **security section**:
  - Change password
  - 2FA setup/disable (TOTP with QR code)
  - View/regenerate recovery codes
  - Logout all sessions
- Show **account actions**: Disconnect bank, Delete account
- Show **legal links**: Terms of Service, Privacy Policy

---

## 4. Backend & Security Deep Dive (5 min)

### API Overview (for the Fullstack Developer)

| Route Group | Endpoints | Key Features |
|-------------|-----------|-------------|
| `/users` | signup, login, refresh, logout, profile | JWT + refresh rotation, lockout |
| `/plaid` | link_token, exchange, disconnect | Encrypted token storage |
| `/transactions` | list, notes | 24hr cache, pagination |
| `/accounts` | list, balances | Aggregated totals |
| `/debt` | analysis, calculate, custom CRUD | 3-strategy calculator |
| `/analytics` | spending breakdown | Intent-based categories |
| `/watchdog` | recurring detection | Action tracking |
| `/insights` | AI generation, dismiss | 6hr cache, Gemini |
| `/educational` | articles, bookmarks | 7-day cache |
| `/2fa` | setup, verify, disable, recovery | TOTP + encrypted secrets |

### Security Features Implemented
- AES-256-GCM encryption for Plaid access tokens
- Refresh token rotation with family-based reuse detection
- Account lockout after 5 failed attempts (15 min)
- TOTP 2FA with 8 recovery codes (SHA-256 hashed)
- Helmet security headers (HSTS, CSP)
- CORS restriction (configurable origins)
- Request body limit (10kb)
- Input validation (express-validator)
- Rate limiting (general + auth endpoints)
- Request ID tracking for all API calls

### Database Schema (for the Fullstack Developer)

**20 tables across 4 domains:**

| Domain | Tables |
|--------|--------|
| Core | users, accounts, transactions, sync_log |
| Debt | custom_debts, debt_apr_overrides |
| AI/Content | user_insights, user_insight_dismissals, user_preferences, insight_actions, merchant_category_cache, ai_categorization_log, educational_articles, user_article_bookmarks, insight_articles |
| Security | refresh_tokens, login_attempts, totp_secrets, recovery_codes |

---

## 5. Legal & Compliance Status (2 min)

### Completed Documents (in `docs/legal/`)
| Document | Status |
|----------|--------|
| Terms of Service | Drafted |
| Privacy Policy | Drafted (PIPEDA-compliant) |
| Financial Disclaimer | Drafted |
| Cookie & Tracking Policy | Drafted |
| Data Processing Agreement | Drafted |
| Sub-processors List | Documented |

### Remaining Compliance Work
- Display ToS/Privacy during signup with explicit acceptance
- Store acceptance timestamps in database
- PIPEDA data subject access requests (export all data)
- Complete data deletion verification
- Plaid production access application + security questionnaire
- WCAG 2.1 Level AA accessibility audit

---

## 6. What's Missing - Production Gaps (5 min)

> **Reference**: `PRODUCTION_ROADMAP.md` has the full checklist (20 sections)

### P0 - Blockers (Must Have Before Launch)
- Email verification on signup
- Password reset ("Forgot Password" flow)
- Email service integration (SendGrid/Postmark)
- Environment validation on startup
- Database backup verification
- Error tracking (Sentry)

### P1 - Required (Critical for Quality)
- Automated testing (currently 0% coverage)
- CI/CD pipeline (GitHub Actions)
- API documentation (OpenAPI/Swagger)
- Uptime monitoring
- Audit logging
- Health check endpoint

### P2 - Important (Polish)
- Push notifications
- In-app notification center
- Onboarding walkthrough
- Biometric authentication (fingerprint/Face ID)
- Performance optimization

### P3 - Nice to Have
- Budgeting features
- Net worth tracking
- Savings goals
- App Store optimization
- Light mode theme

---

## 7. Demo Environment Setup Notes

### Running Locally for the Demo

**Backend:**
```bash
cd packages/backend
# Ensure PostgreSQL is running (Docker)
docker-compose up -d
# Start server
npm run dev
```

**Mobile:**
```bash
cd packages/mobile
npx expo start
# Scan QR code with Expo Go app, or press 'a' for Android emulator
```

### Using the Deployed Version
- Backend API: `https://induswealth.onrender.com`
- Note: Free tier may have cold-start delay (~30 seconds on first request)

---

## Appendix: Screen Flow Diagram

```
┌─────────────┐
│   App Start  │
└──────┬──────┘
       │
  Has Token?
   ┌───┴───┐
   No      Yes
   │       │
   ▼       ▼
┌──────┐ ┌─────────────────────────────────────┐
│Login │ │         Bottom Tab Navigator         │
│Screen│ │                                       │
└──┬───┘ │  ┌─────┬────────┬────────┬────────┐ │
   │     │  │Home │Insights│ Wealth │Watchdog│ │
   │     │  │     │        │(Debt)  │        │ │
   │     │  └──┬──┴───┬────┴────┬───┴───┬────┘ │
   │     │     │      │        │       │       │
   │     │     ▼      ▼        ▼       ▼       │
   │     │  Modals: AllTransactions, Analytics, │
   │     │  AccountTxns, AllAccounts,           │
   │     │  WealthAcademy, ArticleWebView       │
   │     │                              Profile │
   │     └──────────────────────────────────────┘
   │
   ▼
┌──────┐     ┌─────────────┐
│Signup│────▶│Connect Bank  │
└──────┘     │(Plaid Link)  │
             └──────────────┘
```

---

*This document is for internal team demonstration purposes only. Do not distribute externally.*
