# Watchdog Subscription Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Watchdog feature fully functional — detect recurring subscriptions from transaction data, persist user actions, provide cancellation guidance, and deliver smart alerts.

**Architecture:** PostgreSQL tables for persistence (recurring_expenses, subscription_actions, subscription_alerts, watchdog_analysis_cache) → WatchdogService class with detection algorithm → Express routes (GET /watchdog, POST /watchdog/action, GET /watchdog/summary) → React Native mobile UI with bottom sheets, alert banners, and expanded categories.

**Tech Stack:** Node.js/Express 5, PostgreSQL 15 (pg), React Native 0.81.5/Expo 54, React 19, Ionicons, react-native-svg, AsyncStorage caching. No external AI — pure algorithmic detection.

---

## Task 1: Database Migration

**Files:**
- Create: `packages/backend/db/add_watchdog_tables.sql`
- Modify: `packages/backend/src/services/db.js`

### Steps

- [ ] **1.1** Create the migration file `packages/backend/db/add_watchdog_tables.sql` with the following complete SQL:

```sql
-- ============================================================
-- Watchdog Subscription Tracking Tables
-- ============================================================

-- recurring_expenses: Detected recurring charges per user
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Merchant identification
    merchant_name VARCHAR(255) NOT NULL,
    merchant_raw_names TEXT[] DEFAULT '{}',

    -- Charge details
    amount DECIMAL(15, 2) NOT NULL,
    amount_history DECIMAL(15, 2)[] DEFAULT '{}',
    currency VARCHAR(10) DEFAULT 'CAD',

    -- Recurrence pattern
    frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
    interval_days INTEGER,
    confidence VARCHAR(10) NOT NULL DEFAULT 'medium',

    -- Category
    category VARCHAR(50) NOT NULL DEFAULT 'Other',

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    action VARCHAR(20) DEFAULT NULL,

    -- Dates
    first_seen DATE NOT NULL,
    last_seen DATE NOT NULL,
    next_expected DATE,
    snoozed_until DATE,

    -- Alert flags
    flags JSONB DEFAULT '[]',

    -- Metadata
    plaid_transaction_ids TEXT[] DEFAULT '{}',
    detection_metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, merchant_name)
);

-- subscription_actions: Audit trail of user actions on expenses
CREATE TABLE IF NOT EXISTS subscription_actions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    notes TEXT,
    snooze_until DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- subscription_alerts: Proactive alerts/notifications
CREATE TABLE IF NOT EXISTS subscription_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- watchdog_analysis_cache: Cache detection results
CREATE TABLE IF NOT EXISTS watchdog_analysis_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    last_analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_transaction_date DATE,
    transaction_count INTEGER,
    analysis_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_status ON recurring_expenses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_actions_expense ON subscription_actions(recurring_expense_id);
CREATE INDEX IF NOT EXISTS idx_subscription_alerts_user ON subscription_alerts(user_id, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_watchdog_cache_user ON watchdog_analysis_cache(user_id);
```

- [ ] **1.2** Add the watchdog migration to `packages/backend/src/services/db.js` in the `initDb` function. Add the following block after the email verification migration block (after line 133, before the `console.log('✅ Database initialized successfully')` line):

```javascript
        // Run watchdog tables migration
        const watchdogSqlPath = path.join(__dirname, '../../db/add_watchdog_tables.sql');
        if (fs.existsSync(watchdogSqlPath)) {
            const watchdogSql = fs.readFileSync(watchdogSqlPath, 'utf8');
            console.log('🔄 Running watchdog tables migration...');
            await pool.query(watchdogSql);
        }
```

- [ ] **1.3** Verify by running:

```bash
cd packages/backend && docker-compose up -d && npm run dev
```

Check the console output for `🔄 Running watchdog tables migration...` followed by no errors. Then verify tables exist:

```bash
docker exec -it $(docker ps -q) psql -U induswealth -d induswealth -c "\dt recurring_expenses; \dt subscription_actions; \dt subscription_alerts; \dt watchdog_analysis_cache;"
```

- [ ] **1.4** Commit: `feat: Add watchdog subscription tracking database tables`

---

## Task 2: Create Static Data Files (Merchant Aliases, Categories)

**Files:**
- Create: `packages/backend/src/data/merchant_aliases.json`
- Create: `packages/backend/src/data/merchant_categories.json`

### Steps

- [ ] **2.1** Create directory and file `packages/backend/src/data/merchant_aliases.json`:

```json
{
  "NETFLIX": "Netflix",
  "NETFLIX.COM": "Netflix",
  "NETFLIX INC": "Netflix",
  "DISNEY PLUS": "Disney+",
  "DISNEYPLUS": "Disney+",
  "DISNEY+": "Disney+",
  "SPOTIFY": "Spotify",
  "SPOTIFY AB": "Spotify",
  "SPOTIFY PREMIUM": "Spotify",
  "ROGERS WIRELESS": "Rogers",
  "ROGERS CABLE": "Rogers",
  "ROGERS COMM": "Rogers",
  "BELL CANADA": "Bell",
  "BELL MOBILITY": "Bell",
  "TELUS MOBILITY": "Telus",
  "TELUS COMM": "Telus",
  "ENBRIDGE GAS": "Enbridge",
  "TORONTO HYDRO": "Toronto Hydro",
  "AMAZON PRIME": "Amazon Prime",
  "AMZN PRIME": "Amazon Prime",
  "PRIME VIDEO": "Amazon Prime",
  "APPLE.COM/BILL": "Apple Subscription",
  "APPLE COM BILL": "Apple Subscription",
  "GOOGLE PLAY": "Google Play",
  "GOOGLE *SVC": "Google Subscription",
  "ADOBE SYSTEMS": "Adobe",
  "ADOBE CREATIVE": "Adobe",
  "MICROSOFT 365": "Microsoft 365",
  "MICROSOFT *OFF": "Microsoft 365",
  "GOODLIFE": "GoodLife Fitness",
  "GOODLIFE FITNESS": "GoodLife Fitness",
  "ANYTIME FITNESS": "Anytime Fitness",
  "CRAVE": "Crave",
  "CRAVE BELL": "Crave",
  "FIDO": "Fido",
  "KOODO": "Koodo",
  "VIRGIN PLUS": "Virgin Plus",
  "VIRGIN MOBILE": "Virgin Plus",
  "FREEDOM MOBILE": "Freedom Mobile",
  "FIZZ": "Fizz",
  "HYDRO ONE": "Hydro One",
  "ALECTRA": "Alectra",
  "YOUTUBE PREMIUM": "YouTube Music",
  "YOUTUBE MUSIC": "YouTube Music",
  "APPLE MUSIC": "Apple Music",
  "ICLOUD": "iCloud",
  "APPLE.COM BILL": "Apple Subscription",
  "DROPBOX": "Dropbox",
  "NOTION": "Notion",
  "CANVA": "Canva",
  "CHATGPT": "ChatGPT",
  "OPENAI": "ChatGPT",
  "HEADSPACE": "Headspace",
  "CALM": "Calm",
  "PLANET FITNESS": "Planet Fitness",
  "LA FITNESS": "LA Fitness",
  "MANULIFE": "Manulife",
  "SUN LIFE": "Sun Life",
  "GREAT-WEST LIFE": "Great-West Life",
  "DESJARDINS": "Desjardins",
  "INTACT": "Intact",
  "TD INSURANCE": "TD Insurance",
  "GLOBE AND MAIL": "Globe and Mail",
  "TORONTO STAR": "Toronto Star",
  "PARAMOUNT+": "Paramount+",
  "PARAMOUNT PLUS": "Paramount+",
  "HAYU": "Hayu",
  "TIDAL": "Tidal",
  "AMAZON MUSIC": "Amazon Music"
}
```

- [ ] **2.2** Create file `packages/backend/src/data/merchant_categories.json`:

```json
{
  "Streaming": ["Netflix", "Disney+", "Crave", "Amazon Prime", "Apple TV+", "Paramount+", "Hayu"],
  "Music": ["Spotify", "Apple Music", "YouTube Music", "Tidal", "Amazon Music"],
  "Telecom": ["Rogers", "Bell", "Telus", "Fido", "Koodo", "Virgin Plus", "Freedom Mobile", "Fizz"],
  "Utilities": ["Enbridge", "Toronto Hydro", "Hydro One", "Alectra", "London Hydro"],
  "Software": ["Adobe", "Microsoft 365", "Google Subscription", "Google Play", "Dropbox", "Notion", "Canva", "ChatGPT", "iCloud", "Apple Subscription"],
  "Health": ["GoodLife Fitness", "Anytime Fitness", "LA Fitness", "Planet Fitness", "Headspace", "Calm"],
  "Insurance": ["Manulife", "Sun Life", "Great-West Life", "Desjardins", "Intact", "TD Insurance"],
  "News": ["Globe and Mail", "Toronto Star", "National Post", "New York Times", "Washington Post"],
  "Other": []
}
```

- [ ] **2.3** Commit: `feat: Add merchant aliases and category mappings for watchdog`

---

## Task 3: Create Cancellation Knowledge Base

**Files:**
- Create: `packages/backend/src/data/cancellation_guides.json`

### Steps

- [ ] **3.1** Create `packages/backend/src/data/cancellation_guides.json` with the complete knowledge base. This is a large file — the full content is specified in the design spec (Section 5). Copy the entire JSON object from the spec containing entries for: Netflix, Rogers, Bell, Telus, Disney+, Spotify, Amazon Prime, GoodLife Fitness, Adobe, Microsoft 365, Crave, and Enbridge.

The file must contain exactly this structure (full content from spec Section 5):

```json
{
  "Netflix": {
    "displayName": "Netflix",
    "logoColor": "#E50914",
    "category": "Streaming",
    "cancellation": {
      "url": "https://www.netflix.com/cancelplan",
      "steps": [
        "Log in to netflix.com",
        "Go to Account > Membership & Billing",
        "Click 'Cancel Membership'",
        "Confirm cancellation"
      ],
      "estimatedMinutes": 2,
      "tips": [
        "Your access continues until the end of your billing period",
        "You can restart anytime within 10 months and keep your profile"
      ],
      "canPause": true,
      "pauseNote": "Netflix allows you to pause for 1-3 months instead of cancelling"
    },
    "negotiation": null,
    "alternatives": [
      { "name": "Crave", "price": 7.99, "note": "Canadian content + HBO" },
      { "name": "Amazon Prime Video", "price": 9.99, "note": "Included with Prime membership" }
    ],
    "annualOption": null,
    "averageCanadianPrice": 16.49
  },
  "Rogers": {
    "displayName": "Rogers",
    "logoColor": "#DA291C",
    "category": "Telecom",
    "cancellation": {
      "url": "https://www.rogers.com/support/account/how-to-cancel",
      "steps": [
        "Call Rogers at 1-888-764-3771",
        "Say 'Cancel' to the automated system",
        "You will be transferred to the retention department",
        "State you want to cancel; they will offer retention deals",
        "If satisfied with the deal, accept. Otherwise, confirm cancellation."
      ],
      "estimatedMinutes": 30,
      "tips": [
        "Call during business hours (Mon-Fri 9am-5pm ET) for shorter wait times",
        "Have a competing offer ready (Bell, Telus) to leverage in negotiation",
        "The first offer is never the best - politely decline and wait for a better one",
        "Ask for a 'win-back' or 'loyalty' discount"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": {
      "script": "Hi, I'm calling because I've been reviewing my bills and my current plan at $X/month is higher than what I'm seeing from competitors. [Bell/Telus] is offering [specific plan] for $Y/month. I've been a loyal customer for [Z years] and I'd like to see if there's anything you can do to match or beat that price before I switch.",
      "expectedDiscount": "15-30%",
      "bestTimeToCall": "End of month or end of quarter",
      "retentionNumber": "1-888-764-3771",
      "tips": [
        "Always ask for the retention or loyalty department",
        "Mention specific competitor offers with prices",
        "If they can't match, ask about a credit on your next bill",
        "Be polite but firm - they have significant discount authority"
      ]
    },
    "alternatives": [
      { "name": "Bell", "price": null, "note": "Compare plans at bell.ca/mobility" },
      { "name": "Telus", "price": null, "note": "Compare plans at telus.com" },
      { "name": "Fido", "price": null, "note": "Rogers flanker brand, often cheaper" },
      { "name": "Koodo", "price": null, "note": "Telus flanker brand" }
    ],
    "annualOption": null,
    "averageCanadianPrice": null
  },
  "Bell": {
    "displayName": "Bell",
    "logoColor": "#003E7E",
    "category": "Telecom",
    "cancellation": {
      "url": "https://www.bell.ca/support",
      "steps": [
        "Call Bell at 1-800-668-6878",
        "Navigate to cancellation through the automated system",
        "Speak with the retention department",
        "Confirm cancellation or accept a retention offer"
      ],
      "estimatedMinutes": 25,
      "tips": [
        "Similar to Rogers - always ask for retention department",
        "Mention Rogers or Telus competitive offers",
        "Check if you have a contract term remaining (early termination fees may apply)"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": {
      "script": "Hi, I'm looking to reduce my monthly bill. I'm currently paying $X/month and I've seen that [Rogers/Telus] is offering comparable plans for less. I'd like to stay with Bell, but I need to see a better rate. What can you offer me?",
      "expectedDiscount": "15-25%",
      "bestTimeToCall": "End of month",
      "retentionNumber": "1-800-668-6878",
      "tips": [
        "Bell often has unadvertised plans for retention customers",
        "Ask about bundle discounts if you have multiple Bell services"
      ]
    },
    "alternatives": [
      { "name": "Rogers", "price": null, "note": "Compare at rogers.com" },
      { "name": "Virgin Plus", "price": null, "note": "Bell flanker brand, often cheaper" }
    ],
    "annualOption": null,
    "averageCanadianPrice": null
  },
  "Telus": {
    "displayName": "Telus",
    "logoColor": "#6C2C91",
    "category": "Telecom",
    "cancellation": {
      "url": "https://www.telus.com/en/support/account/cancel",
      "steps": [
        "Call Telus at 1-866-558-2273",
        "Request to speak with the loyalty/retention team",
        "Discuss cancellation or negotiate a better rate"
      ],
      "estimatedMinutes": 20,
      "tips": [
        "Telus tends to be the most willing of the Big 3 to offer deals",
        "Check for Koodo (their flanker brand) pricing first"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": {
      "script": "Hi, I'd like to discuss my current plan pricing. I'm paying $X/month and I've found better rates at [Rogers/Bell/Koodo]. Before I switch, I wanted to see if Telus can offer something competitive.",
      "expectedDiscount": "15-30%",
      "bestTimeToCall": "End of quarter",
      "retentionNumber": "1-866-558-2273",
      "tips": [
        "Telus EPP (Employee Purchase Plan) pricing is sometimes offered to retention customers"
      ]
    },
    "alternatives": [
      { "name": "Koodo", "price": null, "note": "Telus flanker brand" },
      { "name": "Rogers", "price": null, "note": "Compare at rogers.com" }
    ],
    "annualOption": null,
    "averageCanadianPrice": null
  },
  "Disney+": {
    "displayName": "Disney+",
    "logoColor": "#113CCF",
    "category": "Streaming",
    "cancellation": {
      "url": "https://www.disneyplus.com/account",
      "steps": [
        "Go to disneyplus.com/account",
        "Click on your subscription",
        "Select 'Cancel Subscription'",
        "Confirm cancellation"
      ],
      "estimatedMinutes": 2,
      "tips": [
        "Access continues until end of billing period",
        "Disney+ sometimes offers a discounted rate when you try to cancel"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": null,
    "alternatives": [
      { "name": "Netflix", "price": 16.49, "note": "Broader content library" },
      { "name": "Crave", "price": 7.99, "note": "Canadian + HBO content" }
    ],
    "annualOption": { "monthlyEquivalent": 11.08, "annualPrice": 132.99, "savings": "16%" },
    "averageCanadianPrice": 11.99
  },
  "Spotify": {
    "displayName": "Spotify",
    "logoColor": "#1DB954",
    "category": "Music",
    "cancellation": {
      "url": "https://www.spotify.com/account/subscription/",
      "steps": [
        "Go to spotify.com/account",
        "Scroll to 'Your plan'",
        "Click 'Change plan'",
        "Select 'Cancel Premium'"
      ],
      "estimatedMinutes": 2,
      "tips": [
        "You keep Premium until the end of your billing period",
        "Your playlists and saved music are preserved on the free tier",
        "Spotify often offers 3 months at a discount to win you back"
      ],
      "canPause": true,
      "pauseNote": "Spotify allows you to pause for up to 3 months"
    },
    "negotiation": null,
    "alternatives": [
      { "name": "YouTube Music", "price": 10.99, "note": "Includes YouTube Premium" },
      { "name": "Apple Music", "price": 10.99, "note": "Better if you're in the Apple ecosystem" }
    ],
    "annualOption": null,
    "averageCanadianPrice": 10.99
  },
  "Amazon Prime": {
    "displayName": "Amazon Prime",
    "logoColor": "#FF9900",
    "category": "Streaming",
    "cancellation": {
      "url": "https://www.amazon.ca/gp/primecentral",
      "steps": [
        "Go to amazon.ca/gp/primecentral",
        "Click 'End Membership'",
        "Follow the prompts to confirm cancellation"
      ],
      "estimatedMinutes": 3,
      "tips": [
        "Amazon will show you how much you saved on shipping - don't let that dissuade you if you don't shop frequently",
        "If you cancel mid-cycle, you may get a partial refund"
      ],
      "canPause": true,
      "pauseNote": "You can pause Prime for up to 3 months"
    },
    "negotiation": null,
    "alternatives": [],
    "annualOption": { "monthlyEquivalent": 8.25, "annualPrice": 99.00, "savings": "17%" },
    "averageCanadianPrice": 9.99
  },
  "GoodLife Fitness": {
    "displayName": "GoodLife Fitness",
    "logoColor": "#ED1C24",
    "category": "Health",
    "cancellation": {
      "url": "https://www.goodlifefitness.com/membership/cancel",
      "steps": [
        "Visit your home club in person OR call 1-800-387-2524",
        "Request a cancellation form",
        "Fill out the form and submit it",
        "You may need to provide 30 days notice"
      ],
      "estimatedMinutes": 15,
      "tips": [
        "GoodLife requires 30 days written notice for cancellation",
        "If you signed a term commitment, early termination fees apply",
        "Ask about a 'freeze' option if you plan to return - typically $5/month",
        "Keep written confirmation of your cancellation request"
      ],
      "canPause": true,
      "pauseNote": "GoodLife offers membership freeze for ~$5/month"
    },
    "negotiation": {
      "script": "Hi, I'm considering cancelling my membership because I'm not using it enough to justify the cost. Before I do, are there any reduced-rate options or freeze plans available?",
      "expectedDiscount": "10-20%",
      "bestTimeToCall": "January (New Year rush means they want to keep existing members)",
      "retentionNumber": "1-800-387-2524",
      "tips": [
        "GoodLife sometimes offers a reduced 'basic' membership",
        "Corporate rates may be available through your employer"
      ]
    },
    "alternatives": [
      { "name": "Planet Fitness", "price": 15.00, "note": "Budget gym option" },
      { "name": "Anytime Fitness", "price": 49.99, "note": "24/7 access" },
      { "name": "YMCA", "price": 30.00, "note": "Community-based, income-adjusted pricing available" }
    ],
    "annualOption": { "monthlyEquivalent": 35.00, "annualPrice": 420.00, "savings": "12%" },
    "averageCanadianPrice": 50.00
  },
  "Adobe": {
    "displayName": "Adobe Creative Cloud",
    "logoColor": "#FF0000",
    "category": "Software",
    "cancellation": {
      "url": "https://account.adobe.com/plans",
      "steps": [
        "Go to account.adobe.com/plans",
        "Click 'Manage plan' on your subscription",
        "Select 'Cancel plan'",
        "Adobe will show early termination fees if on annual plan",
        "Confirm cancellation"
      ],
      "estimatedMinutes": 5,
      "tips": [
        "If on annual plan paid monthly, cancellation incurs 50% of remaining months fee",
        "Adobe often offers 2-3 months free or a significant discount when you try to cancel",
        "Wait for the retention offer before confirming"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": {
      "script": "I'd like to cancel my Creative Cloud subscription. [Wait for retention offer - Adobe almost always offers one]",
      "expectedDiscount": "40-60% for 3-6 months",
      "bestTimeToCall": null,
      "retentionNumber": null,
      "tips": [
        "Start the cancellation flow online - Adobe's retention offers are automated and generous",
        "Common offers: 2 months free, 40% off for 3 months, or Photography plan at reduced rate"
      ]
    },
    "alternatives": [
      { "name": "Affinity Suite", "price": 99.99, "note": "One-time purchase, no subscription" },
      { "name": "Canva Pro", "price": 16.99, "note": "Good for basic design needs" }
    ],
    "annualOption": null,
    "averageCanadianPrice": 75.99
  },
  "Microsoft 365": {
    "displayName": "Microsoft 365",
    "logoColor": "#0078D4",
    "category": "Software",
    "cancellation": {
      "url": "https://account.microsoft.com/services",
      "steps": [
        "Go to account.microsoft.com/services",
        "Find your Microsoft 365 subscription",
        "Click 'Manage' > 'Cancel'",
        "Follow the confirmation prompts"
      ],
      "estimatedMinutes": 3,
      "tips": [
        "Your Office apps will revert to read-only mode after expiration",
        "OneDrive storage drops to 5GB - download your files first"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": null,
    "alternatives": [
      { "name": "Google Workspace", "price": 8.40, "note": "Web-based alternative" },
      { "name": "LibreOffice", "price": 0, "note": "Free and open source" }
    ],
    "annualOption": { "monthlyEquivalent": 8.25, "annualPrice": 99.00, "savings": "16%" },
    "averageCanadianPrice": 9.99
  },
  "Crave": {
    "displayName": "Crave",
    "logoColor": "#0028F0",
    "category": "Streaming",
    "cancellation": {
      "url": "https://www.crave.ca/account",
      "steps": [
        "Go to crave.ca/account",
        "Click 'Manage Subscription'",
        "Select 'Cancel Subscription'",
        "Confirm"
      ],
      "estimatedMinutes": 2,
      "tips": [
        "If subscribed through Bell, you need to cancel through your Bell account",
        "Access continues until end of billing period"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": null,
    "alternatives": [
      { "name": "Netflix", "price": 16.49, "note": "Larger content library" },
      { "name": "Disney+", "price": 11.99, "note": "Disney/Marvel/Star Wars" }
    ],
    "annualOption": null,
    "averageCanadianPrice": 7.99
  },
  "Enbridge": {
    "displayName": "Enbridge Gas",
    "logoColor": "#FDB813",
    "category": "Utilities",
    "cancellation": {
      "url": "https://www.enbridgegas.com/residential/my-account",
      "steps": [
        "Call Enbridge at 1-877-362-7434",
        "Provide your account number and service address",
        "Request disconnection",
        "Schedule a date (required for home sale/move)"
      ],
      "estimatedMinutes": 10,
      "tips": [
        "You can only cancel if you're moving - gas service is required for heated homes",
        "Check if you're on an equal billing plan - switching may save during low-usage months"
      ],
      "canPause": false,
      "pauseNote": null
    },
    "negotiation": null,
    "alternatives": [],
    "annualOption": null,
    "averageCanadianPrice": null
  }
}
```

- [ ] **3.2** Commit: `feat: Add cancellation knowledge base for Canadian services`

---

## Task 4: Rewrite Watchdog Service (Core Detection Algorithm)

**Files:**
- Modify (full rewrite): `packages/backend/src/services/watchdog.js`

### Steps

- [ ] **4.1** Completely rewrite `packages/backend/src/services/watchdog.js` with the full detection algorithm:

```javascript
const { pool } = require('./db');
const { createLogger } = require('./logger');
const merchantAliases = require('../data/merchant_aliases.json');
const merchantCategories = require('../data/merchant_categories.json');
const cancellationGuides = require('../data/cancellation_guides.json');

const logger = createLogger('WATCHDOG');

// Current algorithm version - bump to force re-analysis for all users
const ANALYSIS_VERSION = 1;

// Exclusion lists
const EXCLUDED_CATEGORIES = [
    'Food and Drink',
    'Transfer',
    'Payment',
    'Loan',
];

const EXCLUDED_MERCHANTS = [
    'ATM', 'INTERAC', 'E-TRANSFER', 'PAYROLL',
    'WALMART', 'COSTCO', 'LOBLAWS', 'METRO', 'SOBEYS',
    'NO FRILLS', 'FOOD BASICS', 'FRESHCO',
    'TIM HORTONS', 'STARBUCKS', 'MCDONALD',
];

// Build a reverse lookup: merchant name -> category
const merchantToCategoryMap = {};
for (const [category, merchants] of Object.entries(merchantCategories)) {
    for (const merchant of merchants) {
        merchantToCategoryMap[merchant] = category;
    }
}

class WatchdogService {
    /**
     * Normalize a raw merchant/transaction name to a canonical form.
     */
    normalizeMerchantName(rawName) {
        if (!rawName) return null;

        let name = rawName.toUpperCase().trim();

        // Strip common suffixes
        name = name.replace(/(\.COM|\.CA|INC\.?|LLC|LTD|CORP|CO\.)$/g, '');

        // Strip transaction prefixes
        name = name.replace(/^(POS |PREAUTHORIZED |PAD |EFT |RECURRING |MONTHLY |ANNUAL )/g, '');

        // Strip trailing reference numbers
        name = name.replace(/\s*#?\d{4,}$/, '');

        // Strip trailing asterisks and codes (e.g., "SPOTIFY *FAMILY")
        name = name.replace(/\s*\*.*$/, '');

        name = name.trim();

        // Apply known merchant aliases
        return merchantAliases[name] || name;
    }

    /**
     * Determine the category for a normalized merchant name.
     */
    classifyCategory(merchantName) {
        return merchantToCategoryMap[merchantName] || 'Other';
    }

    /**
     * Check if a transaction should be excluded from subscription detection.
     */
    isExcluded(tx, normalizedName) {
        // Check excluded Plaid categories
        if (tx.category && Array.isArray(tx.category)) {
            for (const cat of tx.category) {
                if (EXCLUDED_CATEGORIES.some(exc => cat && cat.toLowerCase().includes(exc.toLowerCase()))) {
                    return true;
                }
            }
        }

        // Check excluded merchants
        const upperName = (normalizedName || '').toUpperCase();
        for (const exc of EXCLUDED_MERCHANTS) {
            if (upperName.includes(exc)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Classify frequency from average interval in days.
     * Returns frequency string or 'irregular' if no pattern matches.
     */
    classifyFrequency(avgInterval) {
        if (avgInterval >= 0 && avgInterval <= 10) return 'weekly';
        if (avgInterval > 10 && avgInterval <= 18) return 'bi-weekly';
        if (avgInterval >= 25 && avgInterval <= 35) return 'monthly';
        if (avgInterval >= 80 && avgInterval <= 100) return 'quarterly';
        if (avgInterval >= 340 && avgInterval <= 395) return 'annual';
        return 'irregular';
    }

    /**
     * Get the expected interval in days for a frequency.
     */
    expectedIntervalDays(frequency) {
        switch (frequency) {
            case 'weekly': return 7;
            case 'bi-weekly': return 14;
            case 'monthly': return 30;
            case 'quarterly': return 90;
            case 'annual': return 365;
            default: return 30;
        }
    }

    /**
     * Calculate standard deviation of an array of numbers.
     */
    standardDeviation(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const sqDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    /**
     * Calculate days between two date strings.
     */
    daysBetween(dateA, dateB) {
        const a = new Date(dateA);
        const b = new Date(dateB);
        return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
    }

    /**
     * Analyze recurrence pattern for a group of transactions from the same merchant.
     */
    analyzeRecurrencePattern(transactions) {
        // Sort chronologically
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const amounts = sorted.map(t => parseFloat(t.amount));
        const dates = sorted.map(t => t.date);

        if (dates.length < 2) {
            return { isRecurring: false };
        }

        // Calculate intervals between consecutive charges
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
            intervals.push(this.daysBetween(dates[i - 1], dates[i]));
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const intervalStdDev = this.standardDeviation(intervals);

        // Determine frequency
        const frequency = this.classifyFrequency(avgInterval);

        if (frequency === 'irregular') {
            return { isRecurring: false };
        }

        // Calculate amount consistency
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariation = Math.max(...amounts) - Math.min(...amounts);
        const amountVariationPct = avgAmount > 0 ? amountVariation / avgAmount : 1;

        // Confidence scoring
        let amountScore = 'low';
        if (amountVariationPct < 0.05) amountScore = 'high';
        else if (amountVariationPct < 0.15) amountScore = 'medium';

        let intervalScore = 'low';
        if (intervalStdDev < 3) intervalScore = 'high';
        else if (intervalStdDev < 7) intervalScore = 'medium';

        let occurrenceScore = 'low';
        if (sorted.length >= 4) occurrenceScore = 'high';
        else if (sorted.length >= 3) occurrenceScore = 'medium';

        // Check if merchant has a known alias (boosts confidence)
        const rawName = (sorted[0].merchant_name || sorted[0].name || '').toUpperCase().trim();
        const hasKnownAlias = !!merchantAliases[rawName];

        // Final confidence: all high = high, any low caps at medium
        let confidence = 'low';
        const scores = [amountScore, intervalScore, occurrenceScore];
        if (scores.every(s => s === 'high') || (hasKnownAlias && scores.filter(s => s === 'high').length >= 2)) {
            confidence = 'high';
        } else if (!scores.includes('low') || (hasKnownAlias && scores.filter(s => s !== 'low').length >= 2)) {
            confidence = 'medium';
        }

        // Predict next charge date
        const lastDate = new Date(dates[dates.length - 1]);
        const nextExpected = new Date(lastDate);
        nextExpected.setDate(nextExpected.getDate() + this.expectedIntervalDays(frequency));

        return {
            isRecurring: true,
            frequency,
            intervalDays: Math.round(avgInterval),
            amount: amounts[amounts.length - 1],
            amountHistory: amounts.slice(-6),
            confidence,
            firstSeen: dates[0],
            lastSeen: dates[dates.length - 1],
            nextExpected: nextExpected.toISOString().split('T')[0],
            transactionIds: sorted.map(t => t.transaction_id || t.plaid_transaction_id).filter(Boolean),
        };
    }

    /**
     * Detect recurring expenses from a set of transactions.
     */
    detectRecurringExpenses(transactions) {
        const today = new Date();
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

        // Step 1: Filter to last 180 days, exclude pending, only charges (positive amounts)
        const recentTxns = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= sixMonthsAgo
                && !tx.pending
                && parseFloat(tx.amount) > 0;
        });

        // Step 2: Group by normalized merchant name
        const merchantGroups = {};
        for (const tx of recentTxns) {
            const rawName = tx.merchant_name || tx.name;
            const normalized = this.normalizeMerchantName(rawName);
            if (!normalized) continue;

            // Check exclusions
            if (this.isExcluded(tx, normalized)) continue;

            if (!merchantGroups[normalized]) {
                merchantGroups[normalized] = [];
            }
            merchantGroups[normalized].push(tx);
        }

        // Step 3: Filter to merchants with 2+ charges
        const results = [];
        for (const [merchant, txns] of Object.entries(merchantGroups)) {
            if (txns.length < 2) continue;

            // Step 4: Analyze each candidate
            const analysis = this.analyzeRecurrencePattern(txns);
            if (analysis.isRecurring) {
                const category = this.classifyCategory(merchant);
                const guide = cancellationGuides[merchant];

                results.push({
                    merchantName: merchant,
                    rawNames: [...new Set(txns.map(t => t.merchant_name || t.name))],
                    category,
                    logoColor: guide?.logoColor || null,
                    ...analysis,
                });
            }
        }

        return results;
    }

    /**
     * Generate smart alerts from detected expenses.
     */
    generateAlerts(expenses) {
        const alerts = [];

        // 1. PRICE INCREASE DETECTION
        for (const expense of expenses) {
            if (expense.amountHistory && expense.amountHistory.length >= 2) {
                const previous = expense.amountHistory[expense.amountHistory.length - 2];
                const current = expense.amountHistory[expense.amountHistory.length - 1];
                if (current > previous) {
                    const pctIncrease = ((current - previous) / previous) * 100;
                    if (pctIncrease >= 5) {
                        alerts.push({
                            type: 'price_increase',
                            merchantName: expense.merchantName,
                            title: `${expense.merchantName} price increased`,
                            message: `${expense.merchantName} went from $${previous.toFixed(2)} to $${current.toFixed(2)} (${pctIncrease.toFixed(0)}% increase)`,
                            severity: pctIncrease >= 20 ? 'critical' : 'warning',
                            data: { previous, current, pctIncrease },
                        });
                    }
                }
            }
        }

        // 2. DUPLICATE CATEGORY DETECTION
        const categoryGroups = {};
        for (const expense of expenses) {
            if (!categoryGroups[expense.category]) categoryGroups[expense.category] = [];
            categoryGroups[expense.category].push(expense);
        }
        for (const [category, items] of Object.entries(categoryGroups)) {
            if (items.length >= 3 && ['Streaming', 'Music', 'Software'].includes(category)) {
                const totalCost = items.reduce((sum, i) => sum + i.amount, 0);
                alerts.push({
                    type: 'duplicate_category',
                    title: `${items.length} ${category} services`,
                    message: `You're spending $${totalCost.toFixed(2)}/mo on ${items.map(i => i.merchantName).join(', ')}. Consider consolidating.`,
                    severity: 'info',
                    data: { category, services: items.map(i => i.merchantName), totalCost },
                });
            }
        }

        // 3. NEW SUBSCRIPTION DETECTION
        const today = new Date();
        for (const expense of expenses) {
            const daysSinceFirstSeen = this.daysBetween(expense.firstSeen, today.toISOString().split('T')[0]);
            if (daysSinceFirstSeen <= 45 && expense.amountHistory && expense.amountHistory.length <= 2) {
                alerts.push({
                    type: 'new_subscription',
                    merchantName: expense.merchantName,
                    title: `New: ${expense.merchantName}`,
                    message: `${expense.merchantName} ($${expense.amount.toFixed(2)}/mo) was first detected ${daysSinceFirstSeen} days ago`,
                    severity: 'info',
                    data: { firstSeen: expense.firstSeen },
                });
            }
        }

        // 4. ANNUAL SAVINGS OPPORTUNITY
        for (const expense of expenses) {
            if (expense.frequency === 'monthly') {
                const guide = cancellationGuides[expense.merchantName];
                if (guide?.annualOption) {
                    const monthlySavings = expense.amount - guide.annualOption.monthlyEquivalent;
                    if (monthlySavings > 0) {
                        alerts.push({
                            type: 'annual_savings',
                            merchantName: expense.merchantName,
                            title: `Save on ${expense.merchantName}`,
                            message: `Switch to annual billing and save $${(monthlySavings * 12).toFixed(2)}/year`,
                            severity: 'info',
                            data: { currentMonthly: expense.amount, annualEquivalent: guide.annualOption.monthlyEquivalent },
                        });
                    }
                }
            }
        }

        return alerts;
    }

    /**
     * Calculate potential monthly savings based on actions and alerts.
     */
    calculatePotentialSavings(expenses, alerts) {
        let savings = 0;

        // Expenses flagged as "stop"
        for (const expense of expenses) {
            if (expense.action === 'stop' || expense.status === 'cancelling') {
                savings += expense.amount;
            }
        }

        // Negotiation savings (estimated low end of discount range)
        for (const expense of expenses) {
            if (expense.action === 'negotiate' || expense.status === 'negotiating') {
                const guide = cancellationGuides[expense.merchantName];
                if (guide?.negotiation?.expectedDiscount) {
                    const match = guide.negotiation.expectedDiscount.match(/(\d+)/);
                    const discountPct = match ? parseInt(match[1], 10) / 100 : 0.15;
                    savings += expense.amount * discountPct;
                }
            }
        }

        // Annual billing savings from alerts
        for (const alert of alerts) {
            if (alert.type === 'annual_savings' && alert.data) {
                savings += alert.data.currentMonthly - alert.data.annualEquivalent;
            }
        }

        return Math.round(savings * 100) / 100;
    }

    /**
     * Determine auto-suggested action for an expense.
     */
    suggestAction(expense, alerts) {
        // Check for charge after cancel
        if (expense.status === 'cancelling') {
            return 'stop';
        }

        // Check for large price increase
        const priceAlert = alerts.find(a => a.type === 'price_increase' && a.merchantName === expense.merchantName && a.data?.pctIncrease >= 20);
        if (priceAlert) {
            return 'negotiate';
        }

        // Telecom/Utility with known negotiation path
        if (['Telecom', 'Utilities'].includes(expense.category) && cancellationGuides[expense.merchantName]?.negotiation) {
            return 'negotiate';
        }

        // No charges in 60+ days for a monthly subscription
        if (expense.frequency === 'monthly') {
            const daysSinceLastSeen = this.daysBetween(expense.lastSeen, new Date().toISOString().split('T')[0]);
            if (daysSinceLastSeen >= 60) {
                return 'stop';
            }
        }

        return 'active';
    }

    /**
     * Format a date string as "MMM DD" for the mobile UI.
     */
    formatDueDate(dateString) {
        if (!dateString) return null;
        const date = new Date(dateString);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    /**
     * Check if the analysis cache is still fresh for a user.
     * Returns the cache row if fresh, null if stale.
     */
    async getCacheFreshness(userId) {
        try {
            const cacheResult = await pool.query(
                `SELECT wac.*, 
                    (SELECT MAX(t.date) FROM transactions t WHERE t.user_id = $1) as latest_tx_date,
                    (SELECT COUNT(*) FROM transactions t WHERE t.user_id = $1) as current_tx_count
                 FROM watchdog_analysis_cache wac
                 WHERE wac.user_id = $1`,
                [userId]
            );

            if (cacheResult.rows.length === 0) return null;

            const cache = cacheResult.rows[0];

            // Check algorithm version
            if (cache.analysis_version < ANALYSIS_VERSION) return null;

            // Check if new transactions have arrived
            if (cache.latest_tx_date && cache.last_transaction_date) {
                if (new Date(cache.latest_tx_date) > new Date(cache.last_transaction_date)) return null;
            }

            // Check if transaction count changed
            if (cache.current_tx_count !== cache.transaction_count) return null;

            // Cache is fresh if analyzed within last 6 hours
            const hoursSince = (Date.now() - new Date(cache.last_analyzed_at).getTime()) / (1000 * 60 * 60);
            if (hoursSince > 6) return null;

            return cache;
        } catch (error) {
            logger.error('Error checking cache freshness', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Main entry point: analyze for a user, using cache when possible.
     */
    async analyzeForUser(userId, forceRefresh = false) {
        const ctx = { userId };

        // Check cache unless force refresh
        if (!forceRefresh) {
            const cache = await this.getCacheFreshness(userId);
            if (cache) {
                logger.debug('Returning cached watchdog analysis', ctx);
                return await this.loadFromDatabase(userId, true, cache.last_analyzed_at);
            }
        }

        logger.info('Running fresh watchdog analysis', ctx);

        // Fetch transactions from database
        const txResult = await pool.query(
            `SELECT t.plaid_transaction_id as transaction_id, t.name, t.merchant_name,
                    t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending,
                    t.iso_currency_code
             FROM transactions t
             WHERE t.user_id = $1
             ORDER BY t.date DESC`,
            [userId]
        );

        const transactions = txResult.rows;

        if (transactions.length === 0) {
            return {
                expenses: [],
                analysis: {
                    total_monthly: 0,
                    total_annual: 0,
                    potential_savings: 0,
                    flags_found: 0,
                    category_breakdown: {},
                },
                alerts: [],
                categories: ['All'],
                needs_transaction_history: true,
            };
        }

        // Check if user has at least 60 days of history
        const dates = transactions.map(t => new Date(t.date));
        const oldestDate = new Date(Math.min(...dates));
        const newestDate = new Date(Math.max(...dates));
        const historyDays = this.daysBetween(oldestDate.toISOString(), newestDate.toISOString());

        // Run detection
        const detected = this.detectRecurringExpenses(transactions);

        // Generate alerts
        const alerts = this.generateAlerts(detected);

        // Load existing user actions from database
        const existingExpenses = await pool.query(
            `SELECT id, merchant_name, status, action, snoozed_until FROM recurring_expenses WHERE user_id = $1`,
            [userId]
        );
        const existingMap = {};
        for (const row of existingExpenses.rows) {
            existingMap[row.merchant_name] = row;
        }

        // Upsert detected expenses into recurring_expenses table
        const upsertedExpenses = [];
        for (const expense of detected) {
            const existing = existingMap[expense.merchantName];

            // Preserve user-set status and action if they exist
            let status = existing?.status || 'active';
            let action = existing?.action || null;

            // If snoozed and snooze has expired, revert to active
            if (status === 'snoozed' && existing?.snoozed_until) {
                if (new Date(existing.snoozed_until) < new Date()) {
                    status = 'active';
                    action = null;
                }
            }

            // Auto-suggest action if user hasn't set one
            if (!action || action === 'active') {
                action = this.suggestAction({ ...expense, status }, alerts);
            }

            // Check for charge_after_cancel
            if (status === 'cancelling') {
                const cancelAction = await pool.query(
                    `SELECT created_at FROM subscription_actions 
                     WHERE recurring_expense_id = $1 AND action = 'stop' 
                     ORDER BY created_at DESC LIMIT 1`,
                    [existing?.id]
                );
                if (cancelAction.rows.length > 0) {
                    const cancelDate = cancelAction.rows[0].created_at;
                    if (new Date(expense.lastSeen) > new Date(cancelDate)) {
                        alerts.push({
                            type: 'charge_after_cancel',
                            merchantName: expense.merchantName,
                            title: `${expense.merchantName} still charging`,
                            message: `You marked ${expense.merchantName} for cancellation, but a charge of $${expense.amount.toFixed(2)} was detected on ${expense.lastSeen}`,
                            severity: 'critical',
                            data: { chargeDate: expense.lastSeen, amount: expense.amount },
                        });
                    }
                }
            }

            const upsertResult = await pool.query(
                `INSERT INTO recurring_expenses (
                    user_id, merchant_name, merchant_raw_names, amount, amount_history, currency,
                    frequency, interval_days, confidence, category, status, action,
                    first_seen, last_seen, next_expected, flags, plaid_transaction_ids, detection_metadata,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
                ON CONFLICT (user_id, merchant_name) DO UPDATE SET
                    merchant_raw_names = $3,
                    amount = $4,
                    amount_history = $5,
                    frequency = $7,
                    interval_days = $8,
                    confidence = $9,
                    category = $10,
                    status = CASE 
                        WHEN recurring_expenses.status IN ('cancelling', 'cancelled', 'snoozed', 'negotiating') 
                        THEN recurring_expenses.status 
                        ELSE $11 
                    END,
                    action = CASE 
                        WHEN recurring_expenses.action IS NOT NULL AND recurring_expenses.action != 'active'
                        THEN recurring_expenses.action 
                        ELSE $12 
                    END,
                    last_seen = $14,
                    next_expected = $15,
                    flags = $16,
                    plaid_transaction_ids = $17,
                    detection_metadata = $18,
                    updated_at = NOW()
                RETURNING *`,
                [
                    userId,
                    expense.merchantName,
                    expense.rawNames,
                    expense.amount,
                    expense.amountHistory,
                    'CAD',
                    expense.frequency,
                    expense.intervalDays,
                    expense.confidence,
                    expense.category,
                    status,
                    action,
                    expense.firstSeen,
                    expense.lastSeen,
                    expense.nextExpected,
                    JSON.stringify(this.buildFlags(expense, alerts)),
                    expense.transactionIds,
                    JSON.stringify({ intervalStdDev: expense.intervalStdDev }),
                ]
            );

            upsertedExpenses.push(upsertResult.rows[0]);
        }

        // Persist alerts
        await this.persistAlerts(userId, alerts, upsertedExpenses);

        // Update cache
        await pool.query(
            `INSERT INTO watchdog_analysis_cache (user_id, last_analyzed_at, last_transaction_date, transaction_count, analysis_version, updated_at)
             VALUES ($1, NOW(), $2, $3, $4, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                last_analyzed_at = NOW(),
                last_transaction_date = $2,
                transaction_count = $3,
                analysis_version = $4,
                updated_at = NOW()`,
            [userId, newestDate.toISOString().split('T')[0], transactions.length, ANALYSIS_VERSION]
        );

        return await this.loadFromDatabase(userId, false, new Date().toISOString());
    }

    /**
     * Build flags array for an expense based on alerts.
     */
    buildFlags(expense, alerts) {
        const flags = [];
        for (const alert of alerts) {
            if (alert.merchantName === expense.merchantName) {
                flags.push({
                    type: alert.type,
                    detail: alert.message,
                    severity: alert.severity,
                });
            }
        }
        return flags;
    }

    /**
     * Persist alerts to the subscription_alerts table with deduplication.
     */
    async persistAlerts(userId, alerts, expenses) {
        const expenseMap = {};
        for (const exp of expenses) {
            expenseMap[exp.merchant_name] = exp.id;
        }

        for (const alert of alerts) {
            const expenseId = alert.merchantName ? expenseMap[alert.merchantName] : null;

            // Check for existing non-dismissed alert of same type
            const existing = await pool.query(
                `SELECT id FROM subscription_alerts 
                 WHERE user_id = $1 
                   AND alert_type = $2 
                   AND ($3::INTEGER IS NULL OR recurring_expense_id = $3)
                   AND is_dismissed = false`,
                [userId, alert.type, expenseId]
            );

            if (existing.rows.length > 0) {
                // Update existing alert
                await pool.query(
                    `UPDATE subscription_alerts SET title = $1, message = $2, severity = $3, data = $4
                     WHERE id = $5`,
                    [alert.title, alert.message, alert.severity, JSON.stringify(alert.data || {}), existing.rows[0].id]
                );
            } else {
                // Insert new alert
                await pool.query(
                    `INSERT INTO subscription_alerts (user_id, recurring_expense_id, alert_type, title, message, severity, data)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [userId, expenseId, alert.type, alert.title, alert.message, alert.severity, JSON.stringify(alert.data || {})]
                );
            }
        }
    }

    /**
     * Load watchdog data from database tables (after analysis or from cache).
     */
    async loadFromDatabase(userId, cached, lastAnalyzedAt) {
        // Load expenses (exclude snoozed whose snooze hasn't expired)
        const expensesResult = await pool.query(
            `SELECT * FROM recurring_expenses 
             WHERE user_id = $1 
               AND (status != 'snoozed' OR snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE)
             ORDER BY amount DESC`,
            [userId]
        );

        const expenses = expensesResult.rows.map(row => ({
            id: row.id,
            name: row.merchant_name,
            amount: parseFloat(row.amount),
            currency: row.currency,
            frequency: row.frequency,
            category: row.category,
            confidence: row.confidence,
            status: row.status,
            action: row.action || 'active',
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            nextExpected: row.next_expected,
            dueDate: this.formatDueDate(row.next_expected),
            logoColor: cancellationGuides[row.merchant_name]?.logoColor || null,
            flags: row.flags || [],
            amountHistory: row.amount_history || [],
        }));

        // Load active alerts
        const alertsResult = await pool.query(
            `SELECT id, alert_type as type, title, message, severity, data
             FROM subscription_alerts
             WHERE user_id = $1 AND is_dismissed = false
             ORDER BY 
                CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                created_at DESC`,
            [userId]
        );

        const alerts = alertsResult.rows;

        // Calculate analysis summary
        const activeExpenses = expenses.filter(e => e.status !== 'cancelled');
        const totalMonthly = activeExpenses.reduce((sum, e) => {
            switch (e.frequency) {
                case 'weekly': return sum + e.amount * 4.33;
                case 'bi-weekly': return sum + e.amount * 2.17;
                case 'monthly': return sum + e.amount;
                case 'quarterly': return sum + e.amount / 3;
                case 'annual': return sum + e.amount / 12;
                default: return sum + e.amount;
            }
        }, 0);

        const potentialSavings = this.calculatePotentialSavings(expenses, alerts);
        const flagsFound = alerts.filter(a => a.severity === 'warning' || a.severity === 'critical').length;

        // Category breakdown
        const categoryBreakdown = {};
        for (const expense of activeExpenses) {
            if (!categoryBreakdown[expense.category]) categoryBreakdown[expense.category] = 0;
            let monthlyEquiv = expense.amount;
            if (expense.frequency === 'weekly') monthlyEquiv = expense.amount * 4.33;
            else if (expense.frequency === 'bi-weekly') monthlyEquiv = expense.amount * 2.17;
            else if (expense.frequency === 'quarterly') monthlyEquiv = expense.amount / 3;
            else if (expense.frequency === 'annual') monthlyEquiv = expense.amount / 12;
            categoryBreakdown[expense.category] += Math.round(monthlyEquiv * 100) / 100;
        }

        // Build categories list from detected expenses
        const detectedCategories = [...new Set(expenses.map(e => e.category))].sort();
        const categories = ['All', ...detectedCategories];

        // Transaction count for meta
        const txCountResult = await pool.query(
            `SELECT COUNT(*) as count FROM transactions WHERE user_id = $1`,
            [userId]
        );

        return {
            expenses,
            analysis: {
                total_monthly: Math.round(totalMonthly * 100) / 100,
                total_annual: Math.round(totalMonthly * 12 * 100) / 100,
                potential_savings: potentialSavings,
                flags_found: flagsFound,
                category_breakdown: categoryBreakdown,
            },
            alerts,
            categories,
            needs_transaction_history: expenses.length === 0,
            meta: {
                cached,
                lastAnalyzedAt,
                transactionsAnalyzed: parseInt(txCountResult.rows[0].count, 10),
            },
        };
    }

    /**
     * Record a user action on an expense.
     * Returns the updated expense and optional guide data.
     */
    async recordAction(userId, expenseId, action, notes = null, snoozeUntil = null) {
        // Verify expense belongs to user
        const expenseResult = await pool.query(
            `SELECT * FROM recurring_expenses WHERE id = $1 AND user_id = $2`,
            [expenseId, userId]
        );

        if (expenseResult.rows.length === 0) {
            return null;
        }

        const expense = expenseResult.rows[0];
        const previousStatus = expense.status;

        // Determine new status based on action
        let newStatus;
        let newAction;
        switch (action) {
            case 'negotiate':
                newStatus = 'negotiating';
                newAction = 'negotiate';
                break;
            case 'stop':
                newStatus = 'cancelling';
                newAction = 'stop';
                break;
            case 'keep':
                newStatus = 'active';
                newAction = 'active';
                break;
            case 'snooze':
                newStatus = 'snoozed';
                newAction = null;
                break;
            case 'undo':
                newStatus = 'active';
                newAction = null;
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        // Update the expense
        await pool.query(
            `UPDATE recurring_expenses 
             SET status = $1, action = $2, snoozed_until = $3, updated_at = NOW()
             WHERE id = $4`,
            [newStatus, newAction, snoozeUntil, expenseId]
        );

        // Record in audit trail
        await pool.query(
            `INSERT INTO subscription_actions (user_id, recurring_expense_id, action, previous_status, notes, snooze_until)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, expenseId, action, previousStatus, notes, snoozeUntil]
        );

        // Get guide data if applicable
        let guide = null;
        const merchantName = expense.merchant_name;
        const guideData = cancellationGuides[merchantName];

        if (action === 'stop' && guideData) {
            guide = {
                merchantName: guideData.displayName,
                steps: guideData.cancellation.steps,
                directUrl: guideData.cancellation.url,
                estimatedTime: `${guideData.cancellation.estimatedMinutes} minutes`,
                tips: guideData.cancellation.tips,
                canPause: guideData.cancellation.canPause,
                pauseNote: guideData.cancellation.pauseNote,
                alternatives: guideData.alternatives,
                negotiationScript: null,
            };
        } else if (action === 'negotiate' && guideData?.negotiation) {
            guide = {
                merchantName: guideData.displayName,
                steps: guideData.cancellation.steps,
                directUrl: guideData.cancellation.url,
                estimatedTime: `${guideData.cancellation.estimatedMinutes} minutes`,
                tips: guideData.negotiation.tips,
                canPause: false,
                pauseNote: null,
                alternatives: guideData.alternatives,
                negotiationScript: guideData.negotiation.script,
                retentionNumber: guideData.negotiation.retentionNumber,
                expectedDiscount: guideData.negotiation.expectedDiscount,
                bestTimeToCall: guideData.negotiation.bestTimeToCall,
            };
        }

        return {
            expenseId,
            newStatus,
            action,
            guide,
        };
    }

    /**
     * Get summary stats for dashboard widget.
     */
    async getSummary(userId) {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as subscription_count,
                COALESCE(SUM(amount), 0) as total_monthly
             FROM recurring_expenses
             WHERE user_id = $1 AND status NOT IN ('cancelled', 'snoozed')`,
            [userId]
        );

        const flagsResult = await pool.query(
            `SELECT COUNT(*) as count FROM subscription_alerts
             WHERE user_id = $1 AND is_dismissed = false AND severity IN ('warning', 'critical')`,
            [userId]
        );

        // Get top flag
        const topFlagResult = await pool.query(
            `SELECT sa.title as reason, sa.severity, re.merchant_name as name, re.amount
             FROM subscription_alerts sa
             LEFT JOIN recurring_expenses re ON sa.recurring_expense_id = re.id
             WHERE sa.user_id = $1 AND sa.is_dismissed = false
             ORDER BY CASE sa.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
             LIMIT 1`,
            [userId]
        );

        const stats = result.rows[0];
        const flagsCount = parseInt(flagsResult.rows[0].count, 10);
        const topFlag = topFlagResult.rows[0] || null;

        // Calculate potential savings
        const savingsResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as savings
             FROM recurring_expenses
             WHERE user_id = $1 AND action IN ('stop', 'negotiate')`,
            [userId]
        );

        return {
            total_monthly: parseFloat(stats.total_monthly),
            subscription_count: parseInt(stats.subscription_count, 10),
            flags_found: flagsCount,
            potential_savings: parseFloat(savingsResult.rows[0].savings),
            top_flag: topFlag ? {
                name: topFlag.name,
                reason: topFlag.reason,
                amount: parseFloat(topFlag.amount),
            } : null,
        };
    }

    /**
     * Invalidate the analysis cache for a user (called after transaction sync).
     */
    async invalidateCache(userId) {
        await pool.query(
            `DELETE FROM watchdog_analysis_cache WHERE user_id = $1`,
            [userId]
        );
        logger.debug('Watchdog cache invalidated', { userId });
    }

    /**
     * Legacy method for backward compatibility with transactions route.
     * Returns a simple leakage analysis.
     */
    analyze(transactions) {
        const detected = this.detectRecurringExpenses(transactions);
        const alerts = this.generateAlerts(detected);

        const leakage = {
            subscriptions: detected.map(d => ({
                name: d.merchantName,
                amount: d.amount,
                category: d.category,
                frequency: d.frequency,
            })),
            fees: [],
            total_monthly_leakage: detected.reduce((sum, d) => sum + d.amount, 0),
        };

        return leakage;
    }
}

module.exports = new WatchdogService();
```

- [ ] **4.2** Verify the service loads without errors by starting the backend:

```bash
cd packages/backend && npm run dev
```

Check that there are no require/import errors in the console output.

- [ ] **4.3** Commit: `feat: Rewrite watchdog service with full subscription detection algorithm`

---

## Task 5: Rewrite Watchdog Routes (GET /watchdog, POST /watchdog/action, GET /watchdog/summary)

**Files:**
- Modify (full rewrite): `packages/backend/src/routes/watchdog.js`
- Modify: `packages/backend/src/middleware/validators.js` (add watchdog validators)

### Steps

- [ ] **5.1** Add watchdog action validators to `packages/backend/src/middleware/validators.js`. Append the following at the end of the file, before `module.exports`:

```javascript
/**
 * Validation chains for watchdog action endpoint.
 */
const validateWatchdogAction = [
    body('expenseId')
        .notEmpty().withMessage('expenseId is required')
        .isInt({ min: 1 }).withMessage('expenseId must be a positive integer'),
    body('action')
        .notEmpty().withMessage('action is required')
        .isIn(['negotiate', 'stop', 'keep', 'snooze', 'undo']).withMessage('action must be one of: negotiate, stop, keep, snooze, undo'),
    body('notes')
        .optional()
        .isString().withMessage('notes must be a string')
        .isLength({ max: 500 }).withMessage('notes must be 500 characters or less'),
    body('snoozeUntil')
        .optional()
        .isISO8601().withMessage('snoozeUntil must be a valid date')
        .custom((value, { req }) => {
            if (req.body.action === 'snooze' && !value) {
                throw new Error('snoozeUntil is required for snooze action');
            }
            if (value) {
                const snoozeDate = new Date(value);
                const now = new Date();
                if (snoozeDate <= now) {
                    throw new Error('snoozeUntil must be a future date');
                }
                const maxDate = new Date(now);
                maxDate.setDate(maxDate.getDate() + 90);
                if (snoozeDate > maxDate) {
                    throw new Error('snoozeUntil must be within 90 days');
                }
            }
            return true;
        }),
    handleValidationErrors,
];
```

Also add `validateWatchdogAction` to the `module.exports` of that file.

- [ ] **5.2** Read the current validators.js exports to know the exact export line to modify, then update the `module.exports` to include `validateWatchdogAction`.

- [ ] **5.3** Completely rewrite `packages/backend/src/routes/watchdog.js`:

```javascript
const express = require('express');
const router = express.Router();
const watchdogService = require('../services/watchdog');
const { authenticateToken } = require('../middleware/auth');
const { validateWatchdogAction } = require('../middleware/validators');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, successResponse, errorResponse } = require('../utils/responseHelper');

const logger = createLogger('WATCHDOG');

// GET /watchdog
// Returns recurring expense analysis for WatchdogScreen
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const forceRefresh = req.query.force_refresh === 'true';

    logger.info('Fetching recurring expense analysis', { ...ctx, forceRefresh });

    try {
        const result = await watchdogService.analyzeForUser(req.user.id, forceRefresh);

        logger.info('Returning watchdog analysis', {
            ...ctx,
            expenseCount: result.expenses.length,
            cached: result.meta?.cached,
        });

        // Format response to match mobile UI contract
        // The mobile UI reads data.expenses, data.analysis, data.categories from the response
        // successResponse spreads data into the response, so expenses/analysis/categories are top-level
        successResponse(res, {
            expenses: result.expenses,
            analysis: result.analysis,
            alerts: result.alerts,
            categories: result.categories,
            needs_transaction_history: result.needs_transaction_history,
        }, {
            source: result.meta?.cached ? DATA_SOURCES.DATABASE : DATA_SOURCES.COMPUTED,
            cached: result.meta?.cached || false,
            lastAnalyzedAt: result.meta?.lastAnalyzedAt,
            transactionsAnalyzed: result.meta?.transactionsAnalyzed,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to analyze recurring expenses', { ...ctx, error: error.message });
        next(error);
    }
});

// POST /watchdog/action
// Handle user actions (negotiate, stop, keep, snooze, undo)
router.post('/action', authenticateToken, validateWatchdogAction, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const { expenseId, action, notes, snoozeUntil } = req.body;

    logger.info('Processing watchdog action', { ...ctx, expenseId, action });

    try {
        const result = await watchdogService.recordAction(
            req.user.id,
            parseInt(expenseId, 10),
            action,
            notes || null,
            snoozeUntil || null
        );

        if (!result) {
            return errorResponse(res, 404, 'NOT_FOUND', 'Expense not found', req.requestId);
        }

        logger.info('Watchdog action processed', { ...ctx, expenseId, action, newStatus: result.newStatus });

        res.json({
            success: true,
            data: result,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Failed to process watchdog action', { ...ctx, error: error.message });
        next(error);
    }
});

// GET /watchdog/summary
// Quick stats for dashboard widget
router.get('/summary', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };

    logger.info('Fetching watchdog summary', ctx);

    try {
        const summary = await watchdogService.getSummary(req.user.id);

        successResponse(res, { ...summary }, {
            source: DATA_SOURCES.DATABASE,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to fetch watchdog summary', { ...ctx, error: error.message });
        next(error);
    }
});

module.exports = router;
```

- [ ] **5.4** Verify routes load by starting the backend and testing with curl:

```bash
# Test GET /watchdog (should return empty or detected expenses)
curl -H "Authorization: Bearer <token>" http://localhost:3000/watchdog

# Test GET /watchdog/summary
curl -H "Authorization: Bearer <token>" http://localhost:3000/watchdog/summary

# Test POST /watchdog/action (with a valid expenseId from the GET response)
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"expenseId": 1, "action": "stop"}' \
  http://localhost:3000/watchdog/action
```

- [ ] **5.5** Commit: `feat: Rewrite watchdog routes with real detection, actions, and summary endpoint`

---

## Task 6: Wire Transaction Sync to Invalidate Watchdog Cache

**Files:**
- Modify: `packages/backend/src/routes/transactions.js`

### Steps

- [ ] **6.1** In `packages/backend/src/routes/transactions.js`, add cache invalidation after Plaid sync. Find the line `await db.updateSyncTime(userId, 'last_transaction_sync');` (around line 76) and add the following line directly after it:

```javascript
                    // Invalidate watchdog cache so next GET /watchdog re-analyzes
                    await watchdogService.invalidateCache(userId);
```

Make sure `watchdogService` is already required at the top of the file (it should be, since it's used on line 174).

- [ ] **6.2** Verify by checking the transactions route file has the import and the invalidation call in the right place.

- [ ] **6.3** Commit: `feat: Invalidate watchdog cache on Plaid transaction sync`

---

## Task 7: Update Mobile API Client

**Files:**
- Modify: `packages/mobile/src/services/api.js`

### Steps

- [ ] **7.1** Update the `getWatchdogAnalysis` method to support force refresh. Find the existing method:

```javascript
    getWatchdogAnalysis: () => apiRequest('/watchdog'),
```

Replace with:

```javascript
    getWatchdogAnalysis: (forceRefresh = false) =>
        apiRequest(`/watchdog${forceRefresh ? '?force_refresh=true' : ''}`),
```

- [ ] **7.2** Update the `handleExpenseAction` method to support additional fields. Find the existing method:

```javascript
    handleExpenseAction: (expenseId, action) =>
        apiRequest('/watchdog/action', {
            method: 'POST',
            body: JSON.stringify({ expenseId, action }),
        }),
```

Replace with:

```javascript
    handleExpenseAction: (expenseId, action, notes = null, snoozeUntil = null) =>
        apiRequest('/watchdog/action', {
            method: 'POST',
            body: JSON.stringify({ expenseId, action, ...(notes && { notes }), ...(snoozeUntil && { snoozeUntil }) }),
        }),
```

- [ ] **7.3** Add the new watchdog summary method. Find the `handleExpenseAction` method and add after it:

```javascript
    getWatchdogSummary: () => apiRequest('/watchdog/summary'),
```

- [ ] **7.4** Commit: `feat: Update mobile API client with enhanced watchdog methods`

---

## Task 8: Create CancellationBottomSheet Component

**Files:**
- Create: `packages/mobile/src/components/CancellationBottomSheet.js`

### Steps

- [ ] **8.1** Create `packages/mobile/src/components/CancellationBottomSheet.js`:

```javascript
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Linking,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';

const CancellationBottomSheet = ({ visible, expense, guide, onClose, onConfirm }) => {
    if (!guide) return null;

    const openUrl = () => {
        if (guide.directUrl) {
            Linking.openURL(guide.directUrl).catch(() => {});
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.merchantIcon, { backgroundColor: expense?.logoColor ? `${expense.logoColor}20` : COLORS.CARD_BORDER }]}>
                                <Text style={[styles.merchantInitial, { color: expense?.logoColor || COLORS.WHITE }]}>
                                    {expense?.name?.charAt(0) || '?'}
                                </Text>
                            </View>
                            <View style={styles.headerText}>
                                <Text style={styles.merchantName}>{guide.merchantName || expense?.name}</Text>
                                <Text style={styles.amountText}>${expense?.amount?.toFixed(2)}/month</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={COLORS.TEXT_SECONDARY} />
                            </TouchableOpacity>
                        </View>

                        {/* How to Cancel */}
                        <Text style={styles.sectionTitle}>How to Cancel</Text>
                        <View style={styles.stepsContainer}>
                            {guide.steps?.map((step, index) => (
                                <View key={index} style={styles.stepRow}>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>{index + 1}</Text>
                                    </View>
                                    <Text style={styles.stepText}>{step}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Estimated Time */}
                        {guide.estimatedTime && (
                            <View style={styles.timeBadge}>
                                <Ionicons name="time-outline" size={14} color={COLORS.GOLD} />
                                <Text style={styles.timeText}>Estimated time: {guide.estimatedTime}</Text>
                            </View>
                        )}

                        {/* Direct Link */}
                        {guide.directUrl && (
                            <TouchableOpacity style={styles.linkButton} onPress={openUrl}>
                                <Ionicons name="open-outline" size={16} color={COLORS.WHITE} />
                                <Text style={styles.linkButtonText}>Open Cancellation Page</Text>
                            </TouchableOpacity>
                        )}

                        {/* Tips */}
                        {guide.tips && guide.tips.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Tips</Text>
                                {guide.tips.map((tip, index) => (
                                    <View key={index} style={styles.tipRow}>
                                        <Ionicons name="bulb-outline" size={14} color={COLORS.GOLD} />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Pause Option */}
                        {guide.canPause && (
                            <View style={styles.pauseContainer}>
                                <Ionicons name="pause-circle-outline" size={18} color="#3B82F6" />
                                <Text style={styles.pauseText}>{guide.pauseNote || 'You can pause this subscription instead of cancelling.'}</Text>
                            </View>
                        )}

                        {/* Alternatives */}
                        {guide.alternatives && guide.alternatives.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Alternatives</Text>
                                {guide.alternatives.map((alt, index) => (
                                    <View key={index} style={styles.altRow}>
                                        <Text style={styles.altName}>{alt.name}</Text>
                                        {alt.price !== null && <Text style={styles.altPrice}>${alt.price}/mo</Text>}
                                        {alt.note && <Text style={styles.altNote}>{alt.note}</Text>}
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Confirm Button */}
                        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.WHITE} />
                            <Text style={styles.confirmText}>I've Cancelled This</Text>
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
        backgroundColor: '#1A1A1A',
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        maxHeight: '85%',
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#555',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingBottom: SPACING.LARGE,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    merchantIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    merchantInitial: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
    },
    headerText: {
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    merchantName: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    amountText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginTop: 2,
    },
    closeButton: {
        padding: SPACING.SMALL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    stepsContainer: {
        marginBottom: SPACING.MEDIUM,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: COLORS.GOLD,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    stepNumberText: {
        color: '#000',
        fontSize: 12,
        fontFamily: FONTS.BOLD,
    },
    stepText: {
        color: COLORS.WHITE,
        fontSize: 14,
        flex: 1,
        lineHeight: 20,
    },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        alignSelf: 'flex-start',
    },
    timeText: {
        color: COLORS.GOLD,
        fontSize: 12,
        marginLeft: SPACING.SMALL,
    },
    linkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    linkButtonText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
    },
    tipText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        flex: 1,
        marginLeft: SPACING.SMALL,
        lineHeight: 18,
    },
    pauseContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    pauseText: {
        color: '#93C5FD',
        fontSize: 13,
        flex: 1,
        marginLeft: SPACING.SMALL,
        lineHeight: 18,
    },
    altRow: {
        backgroundColor: COLORS.CARD_BG,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    altName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    altPrice: {
        color: COLORS.GREEN,
        fontSize: 13,
        marginTop: 2,
    },
    altNote: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#16A34A',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.LARGE,
    },
    confirmText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
});

export default CancellationBottomSheet;
```

- [ ] **8.2** Commit: `feat: Add CancellationBottomSheet component for watchdog`

---

## Task 9: Create NegotiationBottomSheet Component

**Files:**
- Create: `packages/mobile/src/components/NegotiationBottomSheet.js`

### Steps

- [ ] **9.1** Create `packages/mobile/src/components/NegotiationBottomSheet.js`:

```javascript
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Linking,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';

const NegotiationBottomSheet = ({ visible, expense, guide, onClose, onNegotiated }) => {
    if (!guide) return null;

    const callRetention = () => {
        if (guide.retentionNumber) {
            const phoneUrl = Platform.OS === 'ios'
                ? `telprompt:${guide.retentionNumber}`
                : `tel:${guide.retentionNumber}`;
            Linking.openURL(phoneUrl).catch(() => {});
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.merchantIcon, { backgroundColor: expense?.logoColor ? `${expense.logoColor}20` : COLORS.CARD_BORDER }]}>
                                <Text style={[styles.merchantInitial, { color: expense?.logoColor || COLORS.WHITE }]}>
                                    {expense?.name?.charAt(0) || '?'}
                                </Text>
                            </View>
                            <View style={styles.headerText}>
                                <Text style={styles.merchantName}>{guide.merchantName || expense?.name}</Text>
                                <Text style={styles.amountText}>Current: ${expense?.amount?.toFixed(2)}/month</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={COLORS.TEXT_SECONDARY} />
                            </TouchableOpacity>
                        </View>

                        {/* Expected Discount */}
                        {guide.expectedDiscount && (
                            <View style={styles.discountBanner}>
                                <Ionicons name="trending-down" size={18} color="#4ADE80" />
                                <Text style={styles.discountText}>
                                    Expected discount: {guide.expectedDiscount}
                                </Text>
                            </View>
                        )}

                        {/* Negotiation Script */}
                        {guide.negotiationScript && (
                            <>
                                <Text style={styles.sectionTitle}>Your Negotiation Script</Text>
                                <View style={styles.scriptCard}>
                                    <Text style={styles.scriptText}>
                                        {guide.negotiationScript.replace(/\$X/g, `$${expense?.amount?.toFixed(2) || 'XX'}`)}
                                    </Text>
                                </View>
                            </>
                        )}

                        {/* Retention Number */}
                        {guide.retentionNumber && (
                            <TouchableOpacity style={styles.callButton} onPress={callRetention}>
                                <Ionicons name="call" size={18} color={COLORS.WHITE} />
                                <View style={styles.callButtonText}>
                                    <Text style={styles.callLabel}>Call Retention</Text>
                                    <Text style={styles.callNumber}>{guide.retentionNumber}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        )}

                        {/* Best Time to Call */}
                        {guide.bestTimeToCall && (
                            <View style={styles.infoRow}>
                                <Ionicons name="calendar-outline" size={14} color={COLORS.GOLD} />
                                <Text style={styles.infoText}>Best time to call: {guide.bestTimeToCall}</Text>
                            </View>
                        )}

                        {/* Tips */}
                        {guide.tips && guide.tips.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Negotiation Tips</Text>
                                {guide.tips.map((tip, index) => (
                                    <View key={index} style={styles.tipRow}>
                                        <Ionicons name="checkmark-circle" size={14} color={COLORS.GREEN} />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Alternatives */}
                        {guide.alternatives && guide.alternatives.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Competitor Options</Text>
                                {guide.alternatives.map((alt, index) => (
                                    <View key={index} style={styles.altRow}>
                                        <Text style={styles.altName}>{alt.name}</Text>
                                        {alt.note && <Text style={styles.altNote}>{alt.note}</Text>}
                                    </View>
                                ))}
                            </>
                        )}

                        {/* I Negotiated Button */}
                        <TouchableOpacity style={styles.negotiatedButton} onPress={onNegotiated}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.WHITE} />
                            <Text style={styles.negotiatedText}>I've Negotiated</Text>
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
        backgroundColor: '#1A1A1A',
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        maxHeight: '85%',
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#555',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingBottom: SPACING.LARGE,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    merchantIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    merchantInitial: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
    },
    headerText: {
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    merchantName: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    amountText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginTop: 2,
    },
    closeButton: {
        padding: SPACING.SMALL,
    },
    discountBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    discountText: {
        color: '#4ADE80',
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    scriptCard: {
        backgroundColor: 'rgba(201, 162, 39, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(201, 162, 39, 0.3)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    scriptText: {
        color: COLORS.WHITE,
        fontSize: 14,
        lineHeight: 22,
        fontStyle: 'italic',
    },
    callButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#16A34A',
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    callButtonText: {
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    callLabel: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    callNumber: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    infoText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginLeft: SPACING.SMALL,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
    },
    tipText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        flex: 1,
        marginLeft: SPACING.SMALL,
        lineHeight: 18,
    },
    altRow: {
        backgroundColor: COLORS.CARD_BG,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    altName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    altNote: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    negotiatedButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.LARGE,
    },
    negotiatedText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
});

export default NegotiationBottomSheet;
```

- [ ] **9.2** Commit: `feat: Add NegotiationBottomSheet component for watchdog`

---

## Task 10: Create AlertBanner Component

**Files:**
- Create: `packages/mobile/src/components/AlertBanner.js`

### Steps

- [ ] **10.1** Create `packages/mobile/src/components/AlertBanner.js`:

```javascript
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';

const SEVERITY_COLORS = {
    critical: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', icon: '#EF4444', text: '#FCA5A5' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B', icon: '#F59E0B', text: '#FDE68A' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3B82F6', icon: '#3B82F6', text: '#93C5FD' },
};

const SEVERITY_ICONS = {
    critical: 'alert-circle',
    warning: 'warning',
    info: 'information-circle',
};

const AlertBanner = ({ alerts, onDismiss }) => {
    if (!alerts || alerts.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {alerts.map((alert, index) => {
                    const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
                    const icon = SEVERITY_ICONS[alert.severity] || 'information-circle';

                    return (
                        <View
                            key={alert.id || index}
                            style={[styles.alertCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
                        >
                            <View style={styles.alertHeader}>
                                <Ionicons name={icon} size={16} color={colors.icon} />
                                <Text style={[styles.alertTitle, { color: colors.text }]} numberOfLines={1}>
                                    {alert.title}
                                </Text>
                                {onDismiss && (
                                    <TouchableOpacity onPress={() => onDismiss(alert.id)} style={styles.dismissButton}>
                                        <Ionicons name="close" size={14} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.alertMessage} numberOfLines={2}>
                                {alert.message}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    alertCard: {
        width: 260,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        marginRight: SPACING.SMALL,
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    alertTitle: {
        fontSize: 13,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
        flex: 1,
    },
    dismissButton: {
        padding: 2,
    },
    alertMessage: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        lineHeight: 16,
    },
});

export default AlertBanner;
```

- [ ] **10.2** Commit: `feat: Add AlertBanner component for watchdog smart alerts`

---

## Task 11: Update WatchdogScreen.js with Full Integration

**Files:**
- Modify: `packages/mobile/src/screens/WatchdogScreen.js`

### Steps

- [ ] **11.1** Update the CATEGORIES array at the top of `WatchdogScreen.js`. Replace the existing `CATEGORIES` constant (lines 17-22) with:

```javascript
const CATEGORIES = [
    { id: 'all', name: 'All', icon: null },
    { id: 'streaming', name: 'Streaming', icon: 'tv' },
    { id: 'music', name: 'Music', icon: 'musical-notes' },
    { id: 'telecom', name: 'Telecom', icon: 'call' },
    { id: 'utilities', name: 'Utilities', icon: 'flash' },
    { id: 'health', name: 'Health', icon: 'fitness' },
    { id: 'software', name: 'Software', icon: 'laptop' },
    { id: 'insurance', name: 'Insurance', icon: 'shield-checkmark' },
    { id: 'other', name: 'Other', icon: 'construct' },
];
```

- [ ] **11.2** Add imports for the new components. Add after the existing imports at line 15:

```javascript
import CancellationBottomSheet from '../components/CancellationBottomSheet';
import NegotiationBottomSheet from '../components/NegotiationBottomSheet';
import AlertBanner from '../components/AlertBanner';
```

- [ ] **11.3** Add new state variables to the WatchdogScreen component. After the existing state declarations (around line 30), add:

```javascript
    const [alerts, setAlerts] = useState([]);
    const [totalMonthly, setTotalMonthly] = useState(0);
    const [totalAnnual, setTotalAnnual] = useState(0);
    const [showAnnual, setShowAnnual] = useState(false);
    const [cancelSheet, setCancelSheet] = useState({ visible: false, expense: null, guide: null });
    const [negotiateSheet, setNegotiateSheet] = useState({ visible: false, expense: null, guide: null });
```

- [ ] **11.4** Update the `fetchData` callback to capture the new response fields. Replace the existing `if (data?.success)` block inside `fetchData` with:

```javascript
            if (data?.success) {
                setExpenses(data.expenses || []);
                setPotentialSavings(data.analysis?.potential_savings || 0);
                setFlagsFound(data.analysis?.flags_found || 0);
                setTotalMonthly(data.analysis?.total_monthly || 0);
                setTotalAnnual(data.analysis?.total_annual || 0);
                setAlerts(data.alerts || []);
            }
```

- [ ] **11.5** Update the `handleAction` function to open bottom sheets instead of immediately calling the API. Replace the existing `handleAction` function with:

```javascript
    const handleAction = async (expenseId, action) => {
        try {
            const result = await api.handleExpenseAction(expenseId, action);

            // If the action returned a guide, show the appropriate bottom sheet
            if (result?.success && result?.data?.guide) {
                const expense = expenses.find(e => e.id === expenseId);
                if (action === 'stop') {
                    setCancelSheet({ visible: true, expense, guide: result.data.guide });
                } else if (action === 'negotiate') {
                    setNegotiateSheet({ visible: true, expense, guide: result.data.guide });
                }
            }

            // Refresh data after action
            fetchData();
        } catch (err) {
            console.error('Error processing action:', err);
        }
    };
```

- [ ] **11.6** Add the annual/monthly toggle to the savings card. Find the line `<Text style={styles.savingsLabel}>POTENTIAL MONTHLY SAVINGS</Text>` and replace the savings card content section (from `<Text style={styles.savingsLabel}>` through the `infoRow` View) with:

```javascript
                        {/* Annual/Monthly Toggle */}
                        <View style={styles.toggleRow}>
                            <TouchableOpacity
                                style={[styles.toggleButton, !showAnnual && styles.toggleButtonActive]}
                                onPress={() => setShowAnnual(false)}
                            >
                                <Text style={[styles.toggleText, !showAnnual && styles.toggleTextActive]}>Monthly</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleButton, showAnnual && styles.toggleButtonActive]}
                                onPress={() => setShowAnnual(true)}
                            >
                                <Text style={[styles.toggleText, showAnnual && styles.toggleTextActive]}>Annual</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.savingsLabel}>
                            {showAnnual ? 'TOTAL ANNUAL SUBSCRIPTIONS' : 'POTENTIAL MONTHLY SAVINGS'}
                        </Text>
                        <Text style={styles.savingsAmount}>
                            ${showAnnual ? totalAnnual.toFixed(2) : potentialSavings.toFixed(2)}
                        </Text>

                        <View style={styles.infoRow}>
                            <Ionicons name="information-circle-outline" size={14} color={COLORS.TEXT_SECONDARY} />
                            <Text style={styles.infoText}>
                                {showAnnual
                                    ? `$${totalMonthly.toFixed(2)}/month across all subscriptions`
                                    : 'Based on your recurring expense analysis'}
                            </Text>
                        </View>
```

- [ ] **11.7** Add the AlertBanner before the category filters. Find the line `{/* Category Filters */}` and add before it:

```javascript
                {/* Smart Alerts */}
                {alerts.length > 0 && (
                    <AlertBanner alerts={alerts} />
                )}
```

- [ ] **11.8** Add the bottom sheet components at the end of the main return, just before the closing `</View>` of the component (before the final `</View>` on the line before the styles):

```javascript
            {/* Bottom Sheets */}
            <CancellationBottomSheet
                visible={cancelSheet.visible}
                expense={cancelSheet.expense}
                guide={cancelSheet.guide}
                onClose={() => setCancelSheet({ visible: false, expense: null, guide: null })}
                onConfirm={() => {
                    setCancelSheet({ visible: false, expense: null, guide: null });
                    fetchData();
                }}
            />
            <NegotiationBottomSheet
                visible={negotiateSheet.visible}
                expense={negotiateSheet.expense}
                guide={negotiateSheet.guide}
                onClose={() => setNegotiateSheet({ visible: false, expense: null, guide: null })}
                onNegotiated={() => {
                    setNegotiateSheet({ visible: false, expense: null, guide: null });
                    fetchData();
                }}
            />
```

- [ ] **11.9** Update the `renderExpenseItem` function to show frequency badge and confidence indicator. Find the line `<Text style={styles.expenseDetails}>Due {item.dueDate} • {item.category}</Text>` and replace with:

```javascript
                        <Text style={styles.expenseDetails}>
                            {item.dueDate ? `Due ${item.dueDate}` : item.frequency} • {item.category}
                            {item.confidence === 'high' ? ' \u25CF' : item.confidence === 'medium' ? ' \u25CB' : ''}
                        </Text>
```

- [ ] **11.10** Add the new styles for toggle and other elements. Add the following styles to the StyleSheet.create call, before the closing `});`:

```javascript
    // Toggle
    toggleRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: 2,
        marginBottom: SPACING.MEDIUM,
        alignSelf: 'flex-start',
    },
    toggleButton: {
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    toggleButtonActive: {
        backgroundColor: COLORS.GOLD,
    },
    toggleText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontFamily: FONTS.BOLD,
    },
    toggleTextActive: {
        color: '#000',
    },
```

- [ ] **11.11** Verify the screen renders correctly by running the mobile app:

```bash
cd packages/mobile && npx expo start
```

Open the app on a device/emulator, navigate to the Watchdog screen, and verify:
- The expanded category filters render (9 categories)
- The annual/monthly toggle works
- If expenses exist, the bottom sheets open when tapping Stop/Negotiate
- Alert banners display if alerts are returned

- [ ] **11.12** Commit: `feat: Update WatchdogScreen with bottom sheets, alerts, toggle, and expanded categories`

---

## Task 12: Add Watchdog Summary to Mobile API and Empty State Enhancement

**Files:**
- Modify: `packages/mobile/src/screens/WatchdogScreen.js`

### Steps

- [ ] **12.1** Update the empty state in WatchdogScreen.js. Find the existing empty state block:

```javascript
                    {filteredExpenses.length === 0 && !error && (
                        <View style={styles.emptyState}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.GREEN} />
                            <Text style={styles.emptyText}>No flagged expenses in this category</Text>
                        </View>
                    )}
```

Replace with:

```javascript
                    {filteredExpenses.length === 0 && !error && (
                        <View style={styles.emptyState}>
                            {expenses.length === 0 ? (
                                <>
                                    <Ionicons name="shield-outline" size={48} color={COLORS.GOLD} />
                                    <Text style={styles.emptyTitle}>Connect Your Bank to Activate Watchdog</Text>
                                    <Text style={styles.emptyText}>
                                        We need at least 2 months of transaction history to detect recurring expenses.
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.GREEN} />
                                    <Text style={styles.emptyText}>No flagged expenses in this category</Text>
                                </>
                            )}
                        </View>
                    )}
```

- [ ] **12.2** Add the `emptyTitle` style to the StyleSheet:

```javascript
    emptyTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        marginTop: SPACING.MEDIUM,
        textAlign: 'center',
    },
```

- [ ] **12.3** Commit: `feat: Enhance watchdog empty state with bank connection prompt`

---

## Task 13: API Integration Testing

**Files:** None (manual verification only)

### Steps

- [ ] **13.1** Start the backend and database:

```bash
docker-compose up -d
cd packages/backend && npm run dev
```

- [ ] **13.2** Log in to get a JWT token:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@induswealth.com", "password": "demo123"}' | jq -r '.accessToken // .token')
echo "Token: $TOKEN"
```

- [ ] **13.3** Test GET /watchdog endpoint:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/watchdog | jq .
```

Verify:
- Response has `success: true`
- Response has `expenses` array (may be empty if no transactions)
- Response has `analysis` object with `total_monthly`, `total_annual`, `potential_savings`, `flags_found`
- Response has `categories` array
- Response has `_meta` object

- [ ] **13.4** Test GET /watchdog with force refresh:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/watchdog?force_refresh=true" | jq .
```

- [ ] **13.5** Test GET /watchdog/summary:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/watchdog/summary | jq .
```

Verify: Response has `total_monthly`, `subscription_count`, `flags_found`, `potential_savings`

- [ ] **13.6** If expenses were detected, test POST /watchdog/action with the first expense ID:

```bash
# Get first expense ID
EXPENSE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/watchdog | jq '.expenses[0].id')

# Test stop action
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"expenseId\": $EXPENSE_ID, \"action\": \"stop\"}" \
  http://localhost:3000/watchdog/action | jq .

# Test undo action
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"expenseId\": $EXPENSE_ID, \"action\": \"undo\"}" \
  http://localhost:3000/watchdog/action | jq .

# Test negotiate action
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"expenseId\": $EXPENSE_ID, \"action\": \"negotiate\"}" \
  http://localhost:3000/watchdog/action | jq .
```

- [ ] **13.7** Test validation errors:

```bash
# Missing expenseId
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action": "stop"}' \
  http://localhost:3000/watchdog/action | jq .

# Invalid action
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"expenseId": 1, "action": "invalid"}' \
  http://localhost:3000/watchdog/action | jq .

# Snooze without snoozeUntil
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"expenseId": 1, "action": "snooze"}' \
  http://localhost:3000/watchdog/action | jq .
```

Verify all return 400 with VALIDATION_ERROR code.

- [ ] **13.8** Test with Plaid sandbox data. Use the app to connect a bank with `user_good`/`pass_good`, trigger a transaction sync, then hit GET /watchdog again to see if recurring expenses are detected from Plaid sandbox data.

- [ ] **13.9** Final commit: `feat: Complete watchdog subscription tracking feature`
