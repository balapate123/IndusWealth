# IndusWealth — Data Processing & Sub-Processors

**Effective Date**: [INSERT DATE]
**Last Updated**: [INSERT DATE]
**Version**: 1.0

---

## 1. Overview

This document describes the third-party service providers ("sub-processors") that IndusWealth uses to process your personal information. It supplements our [Privacy Policy](PRIVACY_POLICY.md) and is provided in the interest of transparency, as required by PIPEDA's openness principle.

IndusWealth acts as the primary data controller for your personal information. Our sub-processors act on our behalf and are contractually bound to process your data only for the purposes we specify.

---

## 2. Sub-Processor List

### 2.1 Plaid Inc.

| Field | Details |
|-------|---------|
| **Provider** | Plaid Inc. |
| **Headquarters** | San Francisco, California, United States |
| **Purpose** | Bank account aggregation — connecting to Canadian financial institutions to retrieve account balances, transaction history, and liability data |
| **Data processed** | Bank credentials (provided directly by user to Plaid), client user ID, account information (names, types, balances, masked numbers), transaction data (names, amounts, dates, merchants, categories), liability data (credit/loan balances) |
| **Data flow** | User credentials go directly from user to Plaid. Plaid returns financial data to IndusWealth's backend via API. |
| **Data location** | United States |
| **Plaid products used** | `transactions` (primary), `liabilities` (for debt features) |
| **Country codes** | `CA` (Canada only) |
| **Encryption** | TLS 1.2+ in transit; encrypted at rest per Plaid's security policies |
| **Plaid's certifications** | SOC 2 Type II, ISO 27001 |
| **Plaid's privacy policy** | [https://plaid.com/legal/#end-user-privacy-policy](https://plaid.com/legal/#end-user-privacy-policy) |
| **User controls** | Users can disconnect bank accounts at any time. Users can contact Plaid directly to request data deletion from Plaid's systems via [https://my.plaid.com](https://my.plaid.com). |

**Important notes:**
- IndusWealth never receives or stores your bank login credentials — these are handled entirely by Plaid
- Plaid uses a secure, tokenized connection (access tokens) to retrieve data on an ongoing basis
- We only request read-only access; no write or transfer capabilities
- Plaid may retain your data according to their own retention policy, independent of IndusWealth

---

### 2.2 Google — Gemini AI

| Field | Details |
|-------|---------|
| **Provider** | Google LLC (Alphabet Inc.) |
| **Headquarters** | Mountain View, California, United States |
| **Purpose** | AI-powered financial insight generation and merchant transaction categorization |
| **Data processed** | Aggregated, anonymized financial summaries (see detailed breakdown below) |
| **Data NOT processed** | User names, email addresses, bank account numbers, institution names, Plaid tokens, or any direct personal identifiers |
| **Data location** | United States (Google Cloud) |
| **AI model used** | Gemini 2.0 Flash |
| **Encryption** | TLS 1.2+ in transit; Google's standard encryption at rest |
| **Google's certifications** | SOC 1/2/3, ISO 27001, ISO 27017, ISO 27018, FedRAMP |
| **Google's privacy policy** | [https://policies.google.com/privacy](https://policies.google.com/privacy) |
| **Google AI terms** | [https://ai.google.dev/terms](https://ai.google.dev/terms) |

#### Data sent to Google Gemini for insight generation:

| Data Element | Example | Contains PII? |
|-------------|---------|---------------|
| User age | `28` | No (derived, not DOB) |
| Account type balances | `checking: $2,450, savings: $8,200` | No |
| Spending by category | `groceries: $450, dining: $280` | No |
| Monthly income estimate | `avg_monthly_income: $4,500` | No |
| Subscription names/amounts | `Netflix: $16.99, Spotify: $11.99` | Minimal (merchant names only) |
| Debt summary | `total_balance: $3,200, highest_apr: 19.99%` | No |
| Cash flow metrics | `monthly_surplus: $800` | No |
| Credit utilization | `utilization_percent: 25%` | No |
| Financial readiness flags | `emergency_fund_complete: true` | No |

#### Data NOT sent to Google Gemini:

- User name or email
- Date of birth (only calculated age)
- Bank account names, numbers, or institution names
- Individual transaction names, descriptions, or dates
- Plaid access tokens or API credentials
- IP addresses or device identifiers

#### Data retention by Google:

Per Google's AI terms, data sent via the Gemini API may be used for model improvement unless opted out. We use the Gemini API in a manner that aims to minimize data retention. Review Google's data usage policies for the most current information.

---

### 2.3 Render.com

| Field | Details |
|-------|---------|
| **Provider** | Render Services, Inc. |
| **Headquarters** | San Francisco, California, United States |
| **Purpose** | Application hosting (backend API server) and managed PostgreSQL database |
| **Data processed** | All Service data — user accounts, bank account data, transactions, AI insights, preferences, logs |
| **Data location** | United States (Render's US data centres) |
| **Encryption** | TLS 1.2+ in transit; encrypted at rest for managed databases |
| **Render's certifications** | SOC 2 Type II |
| **Render's privacy policy** | [https://render.com/privacy](https://render.com/privacy) |
| **Render's DPA** | [https://render.com/dpa](https://render.com/dpa) |

**Important notes:**
- Render is an infrastructure provider — they host our application and database but do not access or process user data for their own purposes
- Database backups are managed by Render as part of their PostgreSQL hosting service
- All data in transit between the mobile app and Render-hosted backend is encrypted via HTTPS/TLS

---

### 2.4 Expo / EAS (Expo Application Services)

| Field | Details |
|-------|---------|
| **Provider** | Expo (650 Industries, Inc.) |
| **Headquarters** | Palo Alto, California, United States |
| **Purpose** | Mobile app build and distribution infrastructure |
| **Data processed** | Application source code during builds; no user personal data is processed by Expo at runtime |
| **Data location** | United States |
| **Expo's privacy policy** | [https://expo.dev/privacy](https://expo.dev/privacy) |

**Important notes:**
- Expo is used for building and distributing the mobile app only
- No end-user personal information is sent to Expo during normal app operation
- The app communicates directly with our Render-hosted backend, not through Expo

---

## 3. Third-Party Educational Content Sources

The Wealth Academy feature links to articles from the following educational sources. These are **not** sub-processors — we do not share your personal data with them. Users access these sites directly through their web browser.

| Source | Domain | Focus |
|--------|--------|-------|
| NerdWallet | nerdwallet.com | Personal finance, credit cards, loans |
| Investopedia | investopedia.com | Investing, trading, financial terms |
| MoneySense | moneysense.ca | Canadian personal finance, investing |
| Wealthsimple Learn | wealthsimple.com/en-ca/learn | Investing basics, Canadian finance |
| Government of Canada | canada.ca | TFSA, RRSP, FHSA, tax information |
| GetSmarterAboutMoney | getsmarteraboutmoney.ca | Financial literacy (Ontario Securities Commission) |
| RateHub | ratehub.ca | Mortgages, credit cards, banking rates |
| Motley Fool Canada | fool.ca | Stock investing, market analysis |

When you visit these sites through Wealth Academy, you are subject to their respective privacy policies and cookie practices.

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S DEVICE                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  IndusWealth Mobile App                                  │   │
│  │  - AsyncStorage (local cache)                            │   │
│  │  - JWT token (local storage)                             │   │
│  └────────────────────────┬─────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTPS/TLS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RENDER.COM (US)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  IndusWealth Backend (Node.js/Express)                   │   │
│  │  - Authentication (JWT)                                  │   │
│  │  - Rate limiting                                         │   │
│  │  - Request logging (request IDs only)                    │   │
│  └──────┬────────────────────────────┬──────────────────────┘   │
│         │                            │                          │
│  ┌──────▼──────────────┐      ┌──────▼──────────────┐          │
│  │  PostgreSQL DB      │      │  API Calls (HTTPS)  │          │
│  │  - User data        │      │                     │          │
│  │  - Accounts         │      │  ┌─────────────┐    │          │
│  │  - Transactions     │      │  │  Plaid API   │    │          │
│  │  - AI insights      │      │  │  (US)        │    │          │
│  │  - Preferences      │      │  └─────────────┘    │          │
│  │  - Sync logs        │      │                     │          │
│  └─────────────────────┘      │  ┌─────────────┐    │          │
│                               │  │  Gemini AI   │    │          │
│                               │  │  (US)        │    │          │
│                               │  └─────────────┘    │          │
│                               └─────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Cross-Border Data Transfer Summary

All of IndusWealth's sub-processors are headquartered in the **United States**. Your personal information is stored and processed in the United States.

Under PIPEDA, organizations may transfer personal information to a third party in another jurisdiction for processing, provided that:

1. The organization is accountable for the information and ensures a comparable level of protection
2. The transfer is for the purposes identified at the time of collection
3. Users are informed of the transfer

We have reviewed the privacy and security practices of each sub-processor and are satisfied that they provide a level of protection comparable to Canadian standards, as evidenced by their SOC 2, ISO 27001, and other certifications.

---

## 6. Changes to Sub-Processors

We will update this document when we add or change sub-processors. Material changes (particularly the addition of new sub-processors that process personal information) will be communicated through the app or via email.

---

## 7. Contact

If you have questions about our sub-processors or data processing practices:

- **Email**: [privacy@induswealth.app]

---

*Last reviewed: [INSERT DATE]*
