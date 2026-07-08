# IndusWealth - Cookie & Tracking Policy

**Effective Date**: [INSERT DATE]
**Last Updated**: [INSERT DATE]

---

## 1. Overview

IndusWealth is a **native mobile application** and does not use cookies, web beacons, pixels, or similar web-based tracking technologies.

This document describes the data storage and caching mechanisms used by the IndusWealth application.

---

## 2. Mobile App Local Storage

### 2.1 AsyncStorage (On-Device Cache)

IndusWealth uses React Native AsyncStorage to cache data locally on your device for performance and offline access. This data never leaves your device and is not shared with any third party.

| Cached Data | Purpose | Duration |
|-------------|---------|----------|
| Authentication token (JWT) | Keeps you logged in between app sessions | Until logout or token expiration |
| User profile data | Display name and account status without network call | Until logout |
| Account balances | Show last known balances while refreshing | Refreshed on each app open; cleared on logout |
| Recent transactions | Display transactions while refreshing from server | Refreshed on each sync; cleared on logout |
| AI insights | Show cached insights while checking for updates | 6-hour cache, refreshed automatically |
| User preferences | App settings and feature preferences | Until logout |

### 2.2 How to Clear Local Data

You can clear all locally stored data by:

1. **Logging out** of the app (clears auth token and cached data)
2. **Deleting the app** from your device (removes all app data)
3. **Clearing app data** through your device's settings (Android: Settings > Apps > IndusWealth > Clear Data)

---

## 3. Server-Side Caching

Our backend uses PostgreSQL-based caching for performance optimization. This cached data is stored on our servers (Render.com).

| Cache Type | Data Cached | TTL (Time-to-Live) | Purpose |
|------------|-------------|---------------------|---------|
| AI insights cache | Generated financial insights | 6 hours | Avoid redundant AI API calls |
| Merchant category cache | Merchant-to-category mappings | 30 days | Avoid redundant categorization API calls |
| Educational article cache | Article metadata and previews | 7 days | Reduce third-party website fetches |

All server-side caches are automatically purged when their TTL expires. All cached data is permanently deleted when you delete your account.

---

## 4. Product Usage Analytics (Mixpanel)

IndusWealth uses **Mixpanel** to collect product usage analytics. This helps us understand which features are used and how to improve the app.

**What is collected:**

| Data | Details |
|------|---------|
| App events | e.g., signed up, logged in, screen viewed, bank connected, insight viewed |
| Pseudonymous user ID | Your internal numeric account ID (not your name or email) |
| Basic device/app metadata | Collected automatically by the Mixpanel SDK (e.g., app version, OS version, device model) |

**What is NOT sent to Mixpanel:**

- Your name or email address
- Bank account names, numbers, or balances
- Transaction contents, amounts, or merchant details
- AI insight contents
- Any other financial data

**Advertising and other tracking — we do NOT use:**

- Google Analytics
- Facebook/Meta Pixel
- Advertising identifiers (IDFA/GAID) for ad targeting
- Attribution or deep-linking SDKs
- Social media tracking pixels
- A/B testing platforms

---

## 5. Network Requests

The IndusWealth app makes network requests only to:

| Destination | Purpose | When |
|-------------|---------|------|
| IndusWealth API (Render.com) | All app functionality (auth, data sync, insights) | On every app interaction requiring server data |
| Plaid (via backend) | Bank account linking and data sync | When linking a bank or refreshing financial data |
| Google Gemini (via backend) | AI insight generation | When generating or refreshing insights |
| Mixpanel | Product usage analytics (see Section 4) | When app events occur (e.g., login, screen view) |
| Third-party article URLs | Opening educational articles in WebView | When user taps an article in Wealth Academy |

All API requests between the app and our backend use **HTTPS (TLS encryption)**. The app does not make any background network requests when not in active use.

---

## 6. No Cross-Device Tracking

IndusWealth does not track users across devices or across other apps. Your account is tied to your email/password credentials, not to device identifiers. We do not collect or use:

- Device fingerprints
- Advertising identifiers
- Cross-device graphs

The Mixpanel SDK assigns an install-scoped identifier used solely to associate analytics events from this app; it is not used for advertising or shared with ad networks.

---

## 7. Changes to This Policy

We will update this policy if we introduce any new tracking or caching mechanisms. Material changes will be communicated through in-app notifications.

---

## 8. Contact

For questions about our tracking and caching practices:

- **Email**: [privacy@induswealth.com]

---

*IndusWealth is committed to minimal data collection and respecting user privacy. We believe in transparency about what data is stored and why.*
