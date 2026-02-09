# IndusWealth - Data Processing & Sub-Processors

**Effective Date**: [INSERT DATE]
**Last Updated**: [INSERT DATE]

---

## 1. Overview

This document describes the third-party service providers ("sub-processors") that IndusWealth uses to deliver the Service. Each sub-processor may process certain categories of your personal data in accordance with our agreements with them and their respective privacy policies.

IndusWealth acts as the **data controller** for your personal data. Sub-processors act as **data processors** on our behalf, processing data only as instructed by us and for the purposes described below.

---

## 2. Sub-Processors

### 2.1 Plaid Inc.

| Detail | Information |
|--------|-------------|
| **Company** | Plaid Inc. |
| **Headquarters** | San Francisco, California, USA |
| **Purpose** | Financial data aggregation - connects to your bank to retrieve account and transaction data |
| **Data processed** | Bank account credentials (handled by Plaid, never seen by IndusWealth), account balances, account metadata, transaction history, liability data |
| **Data flow** | User's bank -> Plaid -> IndusWealth backend |
| **Plaid products used** | `transactions` (primary), `liabilities` (for debt data) |
| **Country codes** | Canada (`CA`) |
| **Data residency** | United States |
| **Retention by Plaid** | Per Plaid's data retention policy |
| **Privacy policy** | [Plaid End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy) |
| **Security** | SOC 2 Type II certified, AES-256 encryption at rest, TLS 1.2+ in transit |

**What Plaid receives:**
- Your bank login credentials (entered directly in Plaid's secure interface, never transmitted to IndusWealth)
- A client user ID (IndusWealth internal user ID, not your email or name)

**What Plaid provides to IndusWealth:**
- Access tokens (for ongoing data sync)
- Item IDs (identifying your bank connection)
- Account information (name, type, balances, last 4 digits)
- Transaction data (name, merchant, amount, date, category, pending status)
- Liability data (credit card balances, limits)

---

### 2.2 Google Cloud / Gemini AI

| Detail | Information |
|--------|-------------|
| **Company** | Google LLC |
| **Headquarters** | Mountain View, California, USA |
| **Purpose** | AI-powered financial insight generation and transaction categorization |
| **Data processed** | Aggregated financial summaries (see detailed breakdown below) |
| **Data flow** | IndusWealth backend -> Google Gemini API -> IndusWealth backend |
| **AI models used** | Gemini 2.0 Flash |
| **Data residency** | Google Cloud regions (US) |
| **Retention by Google** | Per Google Cloud terms of service |
| **Privacy policy** | [Google Privacy Policy](https://policies.google.com/privacy) |
| **Terms** | [Google Cloud Terms of Service](https://cloud.google.com/terms) |

**What is sent to Google Gemini for insight generation:**

| Data Category | Specific Data | Contains PII? |
|---------------|---------------|---------------|
| User profile | Age (calculated, not DOB), country (CA) | No |
| Account balances | Checking balance, savings balance, credit card balances (aggregated) | No |
| Spending summary | Total spending, average monthly spending, spending by category, month-over-month change | No |
| Income summary | Estimated monthly income, annual income estimate | No |
| Subscriptions | Detected subscription names, amounts, frequency | Potentially (merchant names) |
| Debt summary | Total debt balance, highest APR, monthly interest cost | No |
| Credit health | Credit utilization percentage, total credit limit | No |
| Savings metrics | Total liquid savings, emergency fund coverage | No |
| Cash flow | Monthly income vs expenses, surplus/deficit | No |
| Financial readiness | Boolean flags (emergency fund, debt status, investment readiness) | No |

**What is sent to Google Gemini for transaction categorization:**

| Data Category | Specific Data | Contains PII? |
|---------------|---------------|---------------|
| Merchant names | Normalized merchant names (e.g., "NETFLIX", "SPOTIFY") | No (business names only) |

**What is NOT sent to Google Gemini:**
- User name, email, or password
- Date of birth (only calculated age)
- Bank account numbers or access tokens
- Individual transaction amounts or descriptions
- Transaction notes
- Any direct identifiers

---

### 2.3 Render.com

| Detail | Information |
|--------|-------------|
| **Company** | Render Services, Inc. |
| **Headquarters** | San Francisco, California, USA |
| **Purpose** | Backend server hosting and managed PostgreSQL database |
| **Data processed** | All application data (stored in Render-managed PostgreSQL database) |
| **Data flow** | Mobile app -> Render backend server -> Render PostgreSQL database |
| **Infrastructure** | Web service (Node.js/Express) + Managed PostgreSQL |
| **Data residency** | United States (Render's Oregon region, or as configured) |
| **Retention** | Data retained as long as the database exists |
| **Privacy policy** | [Render Privacy Policy](https://render.com/privacy) |
| **Security** | SOC 2 Type II, encrypted storage, network isolation |

**What is stored on Render infrastructure:**
- All user account data (email, hashed password, name, DOB)
- Plaid access tokens and item IDs
- All synced account and transaction data
- Custom debts and APR overrides
- AI-generated insights (cached)
- User preferences and dismissals
- Merchant category cache
- Educational article cache and bookmarks
- Sync logs and AI usage logs

---

### 2.4 Expo / EAS (Expo Application Services)

| Detail | Information |
|--------|-------------|
| **Company** | Expo (650 Industries, Inc.) |
| **Headquarters** | Palo Alto, California, USA |
| **Purpose** | Mobile app build and distribution infrastructure |
| **Data processed** | Application source code (during builds), app binaries |
| **Data flow** | Source code -> EAS Build -> App binary |
| **Data residency** | United States |
| **Privacy policy** | [Expo Privacy Policy](https://expo.dev/privacy) |

**Note:** Expo/EAS does not process end-user personal data. It is used solely for building and distributing the mobile application.

---

## 3. Data Flow Diagram

```
User's Mobile Device
    |
    | (HTTPS/TLS encrypted)
    |
    v
IndusWealth Backend (Render.com)
    |
    |---> Plaid API
    |     - Sends: client_user_id, access_token
    |     - Receives: accounts, transactions, liabilities
    |
    |---> Google Gemini AI
    |     - Sends: aggregated financial summary (~1KB)
    |     - Receives: personalized insights JSON
    |
    v
PostgreSQL Database (Render.com)
    - Stores: all user data, accounts, transactions, insights
```

---

## 4. Data Processing Agreements

| Sub-Processor | DPA Status | Notes |
|---------------|------------|-------|
| **Plaid** | [PENDING] | Plaid production access requires compliance review and DPA |
| **Google Cloud** | [PENDING] | Review Google Cloud DPA for Gemini API usage |
| **Render.com** | [PENDING] | Review Render's standard DPA |
| **Expo/EAS** | N/A | Does not process end-user personal data |

---

## 5. Changes to Sub-Processors

We will notify users before adding or changing sub-processors that process personal data. Notification will be provided through:

- Update to this document
- In-app notification
- Email notification (for material changes)

---

## 6. Security Standards

All sub-processors are required to maintain appropriate security measures, including:

- Encryption of data in transit (TLS 1.2+)
- Encryption of data at rest
- Access controls and authentication
- Regular security audits
- Incident response procedures
- Data breach notification capabilities

---

## 7. Contact

For questions about our sub-processors or data processing practices:

- **Email**: [privacy@induswealth.com]

---

*This document is maintained as part of IndusWealth's compliance with PIPEDA, GDPR, and other applicable data protection regulations.*
