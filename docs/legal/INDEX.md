# IndusWealth - Legal Documents Index

This folder contains all legal, privacy, and compliance documents for IndusWealth.

## Documents

| Document | File | Status | Priority |
|----------|------|--------|----------|
| **Terms of Service** | [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md) | Draft - Needs legal review | P0 |
| **Privacy Policy** | [PRIVACY_POLICY.md](PRIVACY_POLICY.md) | Draft - Needs legal review | P0 |
| **Financial Disclaimer** | [FINANCIAL_DISCLAIMER.md](FINANCIAL_DISCLAIMER.md) | Draft - Needs legal review | P0 |
| **Data Processing & Sub-Processors** | [DATA_PROCESSING.md](DATA_PROCESSING.md) | Draft - DPAs pending | P0 |
| **Cookie & Tracking Policy** | [COOKIE_AND_TRACKING_POLICY.md](COOKIE_AND_TRACKING_POLICY.md) | Draft - Needs review | P1 |
| **Acceptable Use Policy** | [ACCEPTABLE_USE_POLICY.md](ACCEPTABLE_USE_POLICY.md) | Draft - Needs review | P1 |

## Action Items

### Before Publishing
- [ ] Have all documents reviewed by a qualified legal professional
- [ ] Fill in all `[INSERT DATE]` placeholders with actual effective dates
- [ ] Fill in `[INSERT NAME/TITLE]` for Privacy Officer
- [ ] Confirm email addresses (support@induswealth.app, privacy@induswealth.app)
- [ ] Confirm website URL (https://induswealth.app)
- [ ] Review governing jurisdiction (currently: Ontario, Canada)
- [ ] Sign Data Processing Agreements with Plaid, Google, and Render

### App Integration Needed
- [ ] Display ToS during signup with acceptance checkbox
- [ ] Display Privacy Policy during signup with acceptance checkbox
- [ ] Store ToS/Privacy acceptance timestamp in `users` table
- [ ] Add ToS version tracking for re-acceptance on updates
- [ ] Link to ToS and Privacy Policy from Profile screen
- [ ] Display financial disclaimer on Insights, Wealth Academy, and Debt Attack screens
- [ ] Add "Legal" section in Profile/Settings with links to all documents
