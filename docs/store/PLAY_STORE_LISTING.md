# Google Play Store Listing — IndusWealth

## Step 1: Create Developer Account
- Go to https://play.google.com/console
- Pay $25 USD one-time registration fee
- Complete identity verification (takes 1–2 days)

---

## App Details

### App Title (max 30 chars)
```
IndusWealth - Personal Finance
```

### Short Description (max 80 chars)
```
AI-powered personal finance tracker for Canadians. Budget. Save. Grow.
```

### Full Description (max 4000 chars)
```
Take control of your financial future with IndusWealth — Canada's smart personal finance app designed specifically for Canadians.

CONNECT YOUR BANK SECURELY
Link your Canadian bank accounts through Plaid, the industry-standard bank connectivity platform trusted by millions. Your credentials are never stored — IndusWealth uses read-only access to help you understand your money.

AI-POWERED INSIGHTS
Get personalized financial insights powered by Google's Gemini AI. IndusWealth analyzes your spending patterns and surfaces actionable recommendations to help you save more and spend smarter.

DEBT ATTACK TOOL
Crush your debt faster with our Snowball and Avalanche payoff calculators. See exactly how long it will take to pay off each balance and how much interest you'll save.

RECURRING EXPENSE WATCHDOG
Automatically detect and track subscriptions and recurring charges. Never be surprised by a forgotten subscription again.

SPENDING ANALYTICS
Beautiful charts and breakdowns by category let you see exactly where your money goes each month. Identify trends and make smarter spending decisions.

WEALTH ACADEMY
Learn personal finance fundamentals with curated educational articles covering budgeting, investing, debt management, savings, and Canadian tax strategies.

SECURITY FIRST
- Bank-grade AES-256 encryption for all sensitive data
- Biometric authentication support
- Two-factor authentication (TOTP)
- Read-only bank access — we can never move your money
- PIPEDA compliant — your data stays in Canada

BUILT FOR CANADIANS
- Supports all major Canadian banks
- CAD-native — no confusing USD conversions
- Ontario-based company, Canadian privacy law compliant

DISCLAIMER: IndusWealth is a financial tracking and education tool. It does not provide financial, investment, legal, or tax advice. Always consult a qualified financial advisor for personalized guidance.

For support: support@induswealth.com
Privacy Policy: https://induswealth.com/privacy
Terms of Service: https://induswealth.com/terms
```

---

## Store Listing Metadata

| Field | Value |
|---|---|
| Category | Finance |
| Content Rating | Everyone (ESRB) / General (IARC) |
| Target Age | 18+ (requires bank account) |
| Email | support@induswealth.com |
| Privacy Policy URL | https://induswealth.com/privacy *(must be live before submission)* |

---

## Content Rating Questionnaire (IARC)

Answer these on the Play Console under "Content Rating":

| Question | Answer |
|---|---|
| Does the app contain violence? | No |
| Does the app contain sexual content? | No |
| Does the app contain profanity? | No |
| Does the app contain controlled substances? | No |
| Does the app simulate gambling? | No |
| Does the app share location? | No |
| Does the app require users to be 18+? | No (recommend 18+ but not enforced) |
| Is the app a financial app? | Yes |
| Does the app allow user-generated content? | No |
| Does the app use the camera? | No (Plaid may for cheque deposit — mark No for IndusWealth's use) |

Expected rating: **Everyone** (finance apps don't get age-restricted unless they include gambling)

---

## Screenshots Required

Minimum 2 screenshots per device type. Recommended: 4–6 for phone.

**Phone (1080x1920 or similar 16:9):**
1. Home dashboard (accounts overview + net worth)
2. Spending analytics chart
3. AI Insights screen
4. Debt Attack calculator
5. Wealth Academy article list
6. Profile / settings screen

**Tablet (optional but recommended):**
- Same screens, tablet layout

**Feature Graphic (required):** 1024x500 px
- Dark background (#0A0A0A), gold logo, tagline
- "Smart Personal Finance for Canadians"

**App Icon:** Already configured at `./assets/indus-icon.png`
- Ensure it's 512x512 px for store listing upload

---

## Build & Submit Commands

```bash
# From packages/mobile

# 1. Build production AAB
eas build --platform android --profile production

# 2. Download the .aab from EAS dashboard, OR submit directly:
eas submit --platform android --profile production
# (requires google-service-account.json in packages/mobile — see Step 3)
```

### Step 3: Google Service Account for automated submission
1. In Play Console → Setup → API Access
2. Link to Google Cloud project
3. Create service account with "Release manager" role
4. Download JSON key → save as `packages/mobile/google-service-account.json`
5. Add `google-service-account.json` to `.gitignore` (NEVER commit this file)

---

## Release Track Strategy

| Track | Purpose |
|---|---|
| Internal testing | You + team (up to 100 testers) — immediate publish, no review |
| Closed testing (Alpha) | Invited users — no review needed |
| Open testing (Beta) | Public opt-in beta — quick review |
| Production | Full public release — 3–7 day review |

**Recommended path:** Internal → Closed (small beta) → Production

---

## Privacy Policy Hosting

The Privacy Policy must be publicly accessible before submission.

Options to host quickly:
1. **GitHub Pages**: Push `docs/legal/PRIVACY_POLICY.md` to a public repo page
2. **Notion public page**: Paste content, publish publicly
3. **Simple HTML page**: Deploy to Render or Vercel

URL must be stable and remain accessible permanently.

---

## Pre-Submission Checklist

- [ ] Google Play Developer account created and verified
- [ ] Privacy Policy live at a public URL
- [ ] App icon is 512x512 PNG (no alpha for store icon)
- [ ] Feature graphic created (1024x500)
- [ ] At least 2 phone screenshots ready
- [ ] Full description written and reviewed
- [ ] Content rating questionnaire complete
- [ ] Production AAB built via `eas build --platform android --profile production`
- [ ] App signed (EAS handles this automatically)
- [ ] `EXPO_PUBLIC_API_URL` set to production backend in eas.json production env
