# Plaid Production Access — Application Guide

## Overview
Plaid requires a manual review before granting production API keys. This process typically takes 1–5 business days. You must complete this BEFORE going live.

---

## Step 1: Access the Plaid Dashboard

1. Go to https://dashboard.plaid.com
2. Log in with your Plaid account
3. Navigate to **Team Settings** → **API** → **Request Production Access**

---

## Step 2: Security Questionnaire

Plaid will ask about your app's security practices. Use these answers:

### Data Storage
- **Do you store bank credentials?** No — we use Plaid Link. Credentials are never sent to our servers.
- **How do you store Plaid access tokens?** Encrypted at rest using AES-256-GCM. Stored in PostgreSQL on Render.com with SSL.
- **Do you store raw transaction data?** Yes, in our PostgreSQL database, encrypted connection, on Render.com (hosted in US-East).

### Authentication
- **How do users authenticate?** JWT-based auth with bcryptjs password hashing (cost factor 12), 15-minute access tokens, 30-day refresh tokens with rotation.
- **Do you support 2FA?** Yes — TOTP 2FA with encrypted secrets and recovery codes.
- **Account lockout?** Yes — 5 failed attempts triggers a 15-minute lockout.

### Data Usage
- **What Plaid products do you use?** `transactions`, `liabilities`
- **What country codes?** `CA` only
- **Do you share user data with third parties?** Transaction data is sent in aggregated, anonymized form to Google Gemini AI for insight generation. No PII is shared. We have a signed DPA with Google.
- **Is your app read-only?** Yes — we never initiate payments or transfers.

### Compliance
- **Privacy Policy URL:** https://induswealth.com/privacy *(must be live)*
- **Terms of Service URL:** https://induswealth.com/terms *(must be live)*
- **Jurisdiction:** Canada (Ontario) — PIPEDA compliant
- **Are you a licensed financial institution?** No — we are a personal finance tracking app, not a regulated financial institution.

### Technical
- **Do you implement webhook verification?** Yes — Plaid JWT signature verification with ES256, body hash validation.
- **Webhook URL:** `https://induswealth.onrender.com/plaid/webhook`
- **Do you handle ITEM_LOGIN_REQUIRED?** Yes — update-mode Link token endpoint and webhook handler implemented.
- **Do you use the redirect URI for OAuth?** Yes — `https://induswealth.onrender.com/plaid/oauth-redirect`

---

## Step 3: Required Before Submission

Before submitting the Plaid production access form, ensure:

- [ ] **Privacy Policy** is publicly accessible at a stable URL
- [ ] **Terms of Service** is publicly accessible at a stable URL
- [ ] **Webhook URL** is live and responding: `https://induswealth.onrender.com/plaid/webhook`
  - Test: `curl -X POST https://induswealth.onrender.com/plaid/webhook -H "Content-Type: application/json" -d '{}' -v`
  - Should return HTTP 200 (signature will fail but endpoint must exist)
- [ ] **OAuth redirect URL** registered in Plaid Dashboard under **API** → **Allowed redirect URIs**:
  - `https://induswealth.onrender.com/plaid/oauth-redirect`
- [ ] Backend deployed to Render with `PLAID_ENV=production` ready to switch once keys arrive

---

## Step 4: Register OAuth Redirect URI

In the Plaid Dashboard:
1. Go to **Team Settings** → **API** → **Allowed redirect URIs**
2. Add: `https://induswealth.onrender.com/plaid/oauth-redirect`
3. This is **required** for Canadian banks (all use OAuth flow)

---

## Step 5: Data Processing Agreement (DPA)

Plaid's DPA is embedded in their Terms of Service for standard use. For production:

1. In the Plaid Dashboard, go to **Settings** → **Legal**
2. Review and accept the **Plaid Developer Policy** and **End User Privacy Policy**
3. Confirm you have a **Privacy Policy** that discloses Plaid as a sub-processor
   - ✅ Already documented in `docs/legal/PRIVACY_POLICY.md` and `docs/legal/DATA_PROCESSING_SUBPROCESSORS.md`

---

## Step 6: Switch to Production Keys

Once Plaid approves production access:

1. In Plaid Dashboard → **Keys**, copy the **Production** client ID and secret
2. Update Render environment variables:
   ```
   PLAID_CLIENT_ID=<production client id>
   PLAID_SECRET=<production secret>
   PLAID_ENV=production
   PLAID_OAUTH_REDIRECT_URI=https://induswealth.onrender.com/plaid/oauth-redirect
   PLAID_WEBHOOK_URL=https://induswealth.onrender.com/plaid/webhook
   ```
3. Redeploy the backend on Render
4. Test with a real Canadian bank account (NOT sandbox credentials)

---

## Step 7: Production Test Checklist

After switching to production keys:

- [ ] Create a new link token and verify it works
- [ ] Link a real Canadian bank account through the app
- [ ] Confirm transactions sync correctly
- [ ] Confirm accounts load correctly
- [ ] Confirm liabilities (if applicable) load
- [ ] Confirm the webhook receives events from Plaid (check server logs)
- [ ] Test bank disconnection

---

## Important Notes

- **Sandbox → Production**: Existing sandbox access tokens will NOT work in production. All users must re-link their bank accounts when you switch.
- **Canadian banks use OAuth**: The redirect URI must be registered BEFORE any Canadian user tries to link. All major Canadian banks (TD, RBC, BMO, Scotiabank, CIBC, etc.) use OAuth flows.
- **Plaid's review timeline**: Typically 1–5 business days. They may ask follow-up questions via email.
- **Keep sandbox for development**: Maintain `PLAID_ENV=sandbox` in development `.env` files. Never use production keys in dev.
