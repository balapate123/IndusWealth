# IndusWealth — Launch Setup Guide

> This document contains all the services, credentials, and configuration needed to launch IndusWealth.  
> Created: April 15, 2026

---

## Table of Contents
1. [Services Overview](#services-overview)
2. [Domain Setup](#domain-setup)
3. [Email Service (Resend)](#email-service-resend)
4. [Analytics (Mixpanel)](#analytics-mixpanel)
5. [Environment Variables](#environment-variables)
6. [What Was Built](#what-was-built)

---

## Services Overview

| Service | Purpose | Free Tier | Sign Up URL |
|---------|---------|-----------|-------------|
| **Resend** | Transactional emails (verification, password reset) | 100 emails/day, 3,000/month | https://resend.com |
| **Mixpanel** | User analytics & event tracking | 20M events/month | https://mixpanel.com |
| **Cloudflare** | Domain registrar + DNS + DDoS protection | Free DNS, paid domain registration | https://dash.cloudflare.com |

---

## Domain Setup

### Domain Name Status

`induswealth.com` is **already taken** by someone else.

**Available alternatives (checked April 2026):**

| Domain | Notes |
|--------|-------|
| **`induswealth.ca`** | Best choice — Canada-only app, `.ca` signals trust |
| `induswealth.app` | Modern, tech-focused TLD |
| `induswealthapp.com` | Longer but available `.com` |
| `myinduswealth.com` | Available `.com` alternative |
| `getinduswealth.com` | Available `.com` alternative |

**Recommendation:** Go with **`induswealth.ca`** — it aligns with your Canada-only jurisdiction and looks professional.

### Step-by-Step Domain Registration

1. **Go to [Cloudflare Registrar](https://dash.cloudflare.com)** — create a free account
2. Search for your chosen domain (e.g., `induswealth.ca`)
3. Purchase the domain (typically $10-15/year for `.ca`)
4. Cloudflare automatically sets up DNS management for free

**Why Cloudflare?** Cheapest renewals (at-cost pricing), free DNS management, free DDoS protection, no upsells. If `.ca` isn't available on Cloudflare, use [Namecheap](https://namecheap.com) as an alternative.

### DNS Records You'll Need

After purchasing the domain, you'll add these DNS records:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| A | `@` | Render.com IP | Point domain to your backend |
| CNAME | `www` | `your-app.onrender.com` | www subdomain |
| TXT | `@` | `v=spf1 include:resend.com ~all` | SPF for email |
| CNAME | Various | Resend-provided values | DKIM for email |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@induswealth.ca` | DMARC policy |

---

## Email Service (Resend)

### Account Setup

1. Go to **https://resend.com** and create an account
2. Go to **Settings → API Keys** and create a new API key
3. Save the key — it starts with `re_` (e.g., `re_123abc...`)
4. Go to **Domains** → **Add Domain** → enter your domain (e.g., `induswealth.ca`)
5. Resend will give you DNS records to add (SPF, DKIM) — add them in Cloudflare
6. Click **Verify** in Resend once DNS records propagate (can take up to 48 hours)

### Credentials to Save

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx    (from Resend dashboard)
FROM_EMAIL=IndusWealth <noreply@induswealth.ca>
```

### Emails the App Sends

| Email | When | Expires |
|-------|------|---------|
| **Verification Code** | After user signs up | 24 hours |
| **Password Reset Code** | When user requests password reset | 1 hour |
| **Welcome Email** | After email is verified | N/A |

All emails use 6-digit numeric codes that users enter in the app (no links to click).

### Dev Mode

If `RESEND_API_KEY` is not set, emails are **logged to console** instead of being sent. This means you can develop locally without a Resend account.

---

## Analytics (Mixpanel)

### Account Setup

1. Go to **https://mixpanel.com** and create a free account
2. Create a new project called **"IndusWealth"**
3. Go to **Settings → Project Settings** and copy your **Project Token**
4. The token looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Credentials to Save

```
EXPO_PUBLIC_MIXPANEL_TOKEN=your_project_token_here
```

### Events Being Tracked

| Event | When |
|-------|------|
| `User Signed Up` | After successful signup |
| `User Logged In` | After successful login |
| `User Logged Out` | On logout |
| `Email Verified` | After email verification |
| `Bank Connected` | After Plaid link success |
| `Transaction Viewed` | When viewing transactions |
| `Insight Viewed` | When viewing AI insights |
| `Feedback Submitted` | After submitting feedback |
| `Password Reset Requested` | When requesting password reset |
| `Password Reset Completed` | After successful password reset |
| `2FA Enabled` | After enabling 2FA |
| `Screen Viewed` | On screen navigation |

### Dev Mode

If `EXPO_PUBLIC_MIXPANEL_TOKEN` is not set, analytics is silently disabled. No errors.

---

## Environment Variables

### Backend (`packages/backend/.env`)

Add these **new** variables to your existing `.env`:

```bash
# ── Email (Resend) ──────────────────────────────
RESEND_API_KEY=              # Get from resend.com dashboard (starts with re_)
FROM_EMAIL=IndusWealth <noreply@induswealth.ca>

# ── App URL ─────────────────────────────────────
APP_URL=https://induswealth.ca     # Your domain (used in emails)

# ── CORS (Production) ──────────────────────────
CORS_ORIGINS=https://induswealth.ca,https://www.induswealth.ca

# ── Existing vars (already set) ─────────────────
# PORT=3000
# DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
# PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
# JWT_SECRET, JWT_EXPIRES_IN
# GEMINI_API_KEY
# ENCRYPTION_KEY
```

### Mobile (`packages/mobile/.env`)

Add this **new** variable:

```bash
# ── Analytics (Mixpanel) ────────────────────────
EXPO_PUBLIC_MIXPANEL_TOKEN=  # Get from mixpanel.com → Project Settings
```

### Render.com

Add the same backend env vars in your Render.com dashboard:
1. Go to your service on render.com
2. **Environment** → Add the new variables listed above
3. Redeploy the service

---

## Support & Contact Emails

You'll need email addresses for the app's legal pages and support. Options:

### Option A: Google Workspace ($6/user/month) — Recommended
- Go to https://workspace.google.com
- Sign up with your domain
- Create: `support@induswealth.ca`, `privacy@induswealth.ca`, `security@induswealth.ca`
- Full Gmail inbox, calendar, Drive

### Option B: Zoho Mail (Free for up to 5 users)
- Go to https://www.zoho.com/mail/
- Sign up with your domain
- Create the same email addresses
- Limited storage but free

### Option C: Resend Inbound Forwarding (Simplest)
- In Resend dashboard, set up inbound forwarding
- Forward `support@induswealth.ca` → `balapate1234@gmail.com`
- Cheapest option for solo launch

---

## What Was Built

### New Files Created

| File | Purpose |
|------|---------|
| `packages/backend/src/services/email.js` | Resend email service with HTML templates |
| `packages/backend/db/add_email_verification.sql` | DB migration for email verification + password reset |
| `packages/mobile/src/screens/EmailVerificationScreen.js` | Email verification screen (6-digit code input) |
| `packages/mobile/src/screens/ForgotPasswordScreen.js` | Forgot password screen (email input) |
| `packages/mobile/src/screens/ResetPasswordScreen.js` | Reset password screen (code + new password) |
| `packages/mobile/src/services/analytics.js` | Mixpanel analytics wrapper |

### Files Modified

| File | Changes |
|------|---------|
| `packages/backend/src/routes/users.js` | Added: verify-email, resend-verification, forgot-password, reset-password routes. Modified signup to send verification email. |
| `packages/backend/src/services/db.js` | Added email verification + password reset query helpers. Updated getUserByEmail/getUserById to include email_verified. |
| `packages/backend/src/app.js` | CORS tightening, HTTPS redirect, rate limiters for new endpoints, security.txt, log sanitization |
| `packages/backend/src/middleware/validators.js` | Added validation chains for new endpoints |
| `packages/backend/package.json` | Added `resend` dependency |
| `packages/mobile/src/services/api.js` | Added verifyEmail, resendVerification, forgotPassword, resetPassword API methods. Analytics reset on logout. |
| `packages/mobile/src/navigation/AppNavigator.js` | Registered 3 new screens in auth stack |
| `packages/mobile/src/screens/LoginScreen.js` | Wired "Forgot Password?" button, added analytics tracking |
| `packages/mobile/src/screens/SignupScreen.js` | Navigate to EmailVerification after signup, added analytics tracking |
| `packages/mobile/App.js` | Initialize Mixpanel analytics on app start |
| `packages/mobile/package.json` | Added `mixpanel-react-native` dependency |

### New Database Columns (users table)

| Column | Type | Purpose |
|--------|------|---------|
| `email_verified` | BOOLEAN (default false) | Whether user has verified their email |
| `email_verification_token` | VARCHAR(128) | SHA-256 hash of verification code |
| `email_verification_expires` | TIMESTAMPTZ | When verification code expires |
| `password_reset_token` | VARCHAR(128) | SHA-256 hash of reset code |
| `password_reset_expires` | TIMESTAMPTZ | When reset code expires |

### New API Endpoints

| Method | Endpoint | Auth | Rate Limited | Purpose |
|--------|----------|------|-------------|---------|
| POST | `/users/verify-email` | No | Yes (5/15min) | Verify email with 6-digit code |
| POST | `/users/resend-verification` | Yes | Yes (5/15min) | Resend verification email |
| POST | `/users/forgot-password` | No | Yes (5/15min) | Request password reset code |
| POST | `/users/reset-password` | No | Yes (5/15min) | Reset password with code |
| GET | `/.well-known/security.txt` | No | No | Security contact disclosure |

### Security Improvements

- CORS now restricted via `CORS_ORIGINS` env var in production
- HTTPS redirect middleware for production (Render.com)
- Authorization header masked in request logs
- `security.txt` served at `/.well-known/security.txt`
- All new endpoints rate-limited (5 requests per 15 minutes)
- Password reset uses anti-enumeration (always returns success regardless of email existence)
- All tokens stored as SHA-256 hashes (never plaintext)

---

## Launch Checklist

- [ ] Purchase domain (`induswealth.ca` recommended)
- [ ] Create Resend account and add API key
- [ ] Verify domain in Resend (add DNS records)
- [ ] Create Mixpanel account and get project token
- [ ] Set up support email (Google Workspace, Zoho, or forwarding)
- [ ] Add all new env vars to Render.com
- [ ] Redeploy backend on Render.com
- [ ] Test signup → verification email → verify → login flow
- [ ] Test forgot password → reset code → new password → login flow
- [ ] Verify Mixpanel receives events
- [ ] Update legal docs with final domain/email addresses
