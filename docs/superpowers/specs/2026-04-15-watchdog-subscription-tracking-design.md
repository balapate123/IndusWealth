# Watchdog Subscription Tracking - Design Specification

**Date**: 2026-04-15
**Status**: Ready for Implementation
**Branch**: feature/watchdog-full-implementation

---

## 1. Current State Assessment

### What Exists

| Component | File | Status |
|---|---|---|
| Mobile UI | `packages/mobile/src/screens/WatchdogScreen.js` (535 lines) | Fully built - savings card, category filters, expense list with action buttons |
| Backend route | `packages/backend/src/routes/watchdog.js` (80 lines) | Stubbed - GET returns empty arrays, POST logs but does not persist |
| Detection service | `packages/backend/src/services/watchdog.js` (39 lines) | Hardcoded regex for 8 merchants, simple string matching, no pattern detection |
| API client | `packages/mobile/src/services/api.js` | `getWatchdogAnalysis()` and `handleExpenseAction()` already wired |
| Database tables | None | Zero tables for recurring expenses, actions, or alerts |
| Transactions route | `packages/backend/src/routes/transactions.js` line 174 | Calls `watchdogService.analyze()` and returns result in transaction response |

### What the Mobile UI Expects (contract from WatchdogScreen.js)

```json
{
  "success": true,
  "expenses": [
    {
      "id": "string",
      "name": "Rogers Internet",
      "amount": 120.00,
      "category": "Telecom",
      "action": "negotiate" | "stop" | "active",
      "dueDate": "Oct 15",
      "logoColor": "#E50914"
    }
  ],
  "analysis": {
    "potential_savings": 85.00,
    "flags_found": 3,
    "total_monthly": 189.98
  },
  "categories": ["All", "Streaming", "Utilities", "Health", "Other"]
}
```

The UI also calls `handleExpenseAction(expenseId, action)` which POSTs `{ expenseId, action }` to `/watchdog/action`.

---

## 2. Database Schema

### Migration file: `db/add_watchdog_tables.sql`

```sql
-- ============================================================
-- Watchdog Subscription Tracking Tables
-- ============================================================

-- recurring_expenses: Detected recurring charges per user
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Merchant identification
    merchant_name VARCHAR(255) NOT NULL,          -- Normalized merchant name (e.g., "Netflix")
    merchant_raw_names TEXT[] DEFAULT '{}',        -- All raw transaction names seen (e.g., {"NETFLIX.COM", "NETFLIX INC"})

    -- Charge details
    amount DECIMAL(15, 2) NOT NULL,               -- Most recent charge amount
    amount_history DECIMAL(15, 2)[] DEFAULT '{}',  -- Last N amounts for trend detection
    currency VARCHAR(10) DEFAULT 'CAD',

    -- Recurrence pattern
    frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- weekly, bi-weekly, monthly, quarterly, annual
    interval_days INTEGER,                              -- Average days between charges
    confidence VARCHAR(10) NOT NULL DEFAULT 'medium',   -- high, medium, low

    -- Category
    category VARCHAR(50) NOT NULL DEFAULT 'Other',  -- Streaming, Utilities, Telecom, Health, Software, Insurance, Music, Other

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, negotiating, cancelling, cancelled, snoozed, paused
    action VARCHAR(20) DEFAULT NULL,               -- Current UI action: negotiate, stop, active (null = unreviewed)

    -- Dates
    first_seen DATE NOT NULL,
    last_seen DATE NOT NULL,
    next_expected DATE,
    snoozed_until DATE,

    -- Alert flags (stored as JSONB for flexibility)
    flags JSONB DEFAULT '[]',
    -- Example: [{"type": "price_increase", "detail": "Up 15% from $15.49", "severity": "warning"}]

    -- Metadata
    plaid_transaction_ids TEXT[] DEFAULT '{}',     -- Transaction IDs that formed this detection
    detection_metadata JSONB DEFAULT '{}',         -- Algorithm details: score breakdown, pattern info

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, merchant_name)
);

-- subscription_actions: Audit trail of user actions on expenses
CREATE TABLE IF NOT EXISTS subscription_actions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,           -- negotiate, stop, keep, snooze, undo
    previous_status VARCHAR(20),           -- Status before action
    notes TEXT,                            -- Optional user note
    snooze_until DATE,                     -- For snooze actions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- subscription_alerts: Proactive alerts/notifications
CREATE TABLE IF NOT EXISTS subscription_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,       -- price_increase, new_subscription, duplicate_category, unused, annual_savings, charge_after_cancel
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',   -- info, warning, critical
    data JSONB DEFAULT '{}',               -- Alert-specific structured data
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- watchdog_analysis_cache: Cache detection results to avoid re-computing on every request
CREATE TABLE IF NOT EXISTS watchdog_analysis_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    last_analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_transaction_date DATE,            -- Latest transaction date at analysis time
    transaction_count INTEGER,             -- Number of transactions analyzed
    analysis_version INTEGER DEFAULT 1,    -- Bump when algorithm changes to force re-analysis
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

### Key Design Decisions

1. **`merchant_raw_names TEXT[]`**: Stores all variant spellings seen in transactions so the fuzzy matcher can learn.
2. **`amount_history DECIMAL[]`**: Keeps the last 6 amounts to detect price trends without querying transactions again.
3. **`flags JSONB`**: Flexible alert storage on each expense (price increase, unused, duplicate category) without requiring JOINs.
4. **`UNIQUE(user_id, merchant_name)`**: One row per merchant per user; upsert on re-analysis.
5. **`watchdog_analysis_cache`**: Avoids re-running the detection algorithm on every GET request. Invalidated when new transactions sync.

---

## 3. Recurring Expense Detection Algorithm

### 3.1 Overview

The detection algorithm runs when:
1. A user requests GET `/watchdog` AND the cache is stale (new transactions since last analysis)
2. After a Plaid transaction sync completes (background, non-blocking)

### 3.2 Merchant Name Normalization

```
function normalizeMerchantName(rawName):
    name = rawName.toUpperCase().trim()

    // Strip common suffixes
    name = name.replace(/(\.COM|\.CA|INC\.?|LLC|LTD|CORP|CO\.)$/g, '')

    // Strip transaction prefixes
    name = name.replace(/^(POS |PREAUTHORIZED |PAD |EFT |RECURRING |MONTHLY |ANNUAL )/g, '')

    // Strip trailing reference numbers
    name = name.replace(/\s*#?\d{4,}$/, '')

    // Strip trailing asterisks and codes (e.g., "SPOTIFY *FAMILY")
    name = name.replace(/\s*\*.*$/, '')

    // Apply known merchant aliases
    return MERCHANT_ALIASES[name] || name.trim()
```

**MERCHANT_ALIASES** (partial — stored in `src/data/merchant_aliases.json`):

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
  "CRAVE BELL": "Crave"
}
```

### 3.3 Merchant Category Assignment

```json
{
  "Streaming": ["Netflix", "Disney+", "Crave", "Amazon Prime", "Apple TV+", "Paramount+", "Hayu"],
  "Music": ["Spotify", "Apple Music", "YouTube Music", "Tidal", "Amazon Music"],
  "Telecom": ["Rogers", "Bell", "Telus", "Fido", "Koodo", "Virgin Plus", "Freedom Mobile", "Fizz"],
  "Utilities": ["Enbridge", "Toronto Hydro", "Hydro One", "Alectra", "London Hydro"],
  "Software": ["Adobe", "Microsoft 365", "Google Subscription", "Dropbox", "Notion", "Canva", "ChatGPT", "iCloud"],
  "Health": ["GoodLife Fitness", "Anytime Fitness", "LA Fitness", "Planet Fitness", "Headspace", "Calm"],
  "Insurance": ["Manulife", "Sun Life", "Great-West Life", "Desjardins", "Intact", "TD Insurance"],
  "News": ["Globe and Mail", "Toronto Star", "National Post", "New York Times", "Washington Post"],
  "Other": []
}
```

Stored in `src/data/merchant_categories.json`. Category lookup falls back to "Other" if not in any list.

### 3.4 Pattern Detection Algorithm

```
function detectRecurringExpenses(userId, transactions):
    // Step 1: Filter to last 180 days, exclude pending
    recentTxns = transactions
        .filter(tx => tx.date >= today - 180 days)
        .filter(tx => tx.pending === false)
        .filter(tx => tx.amount > 0)  // Only charges, not refunds

    // Step 2: Group by normalized merchant name
    merchantGroups = {}
    for tx in recentTxns:
        normalized = normalizeMerchantName(tx.merchant_name || tx.name)
        merchantGroups[normalized].push(tx)

    // Step 3: Filter to merchants with 2+ charges
    candidates = merchantGroups where group.length >= 2

    // Step 4: Analyze each candidate
    results = []
    for (merchant, txns) in candidates:
        analysis = analyzeRecurrencePattern(txns)
        if analysis.isRecurring:
            results.push({
                merchantName: merchant,
                rawNames: unique(txns.map(t => t.name)),
                ...analysis
            })

    // Step 5: Generate alerts
    alerts = generateAlerts(results, transactions)

    return { expenses: results, alerts: alerts }
```

### 3.5 Recurrence Pattern Analysis

```
function analyzeRecurrencePattern(transactions):
    // Sort chronologically
    sorted = transactions.sort(by date ascending)
    amounts = sorted.map(t => t.amount)
    dates = sorted.map(t => t.date)

    // Calculate intervals between consecutive charges
    intervals = []
    for i in 1..dates.length:
        intervals.push(daysBetween(dates[i-1], dates[i]))

    avgInterval = mean(intervals)
    intervalStdDev = standardDeviation(intervals)

    // Determine frequency
    frequency = classifyFrequency(avgInterval)
    //   0-10 days  -> weekly (7)
    //  10-18 days  -> bi-weekly (14)
    //  25-35 days  -> monthly (30)
    //  80-100 days -> quarterly (90)
    // 340-395 days -> annual (365)
    // else         -> irregular (not recurring)

    if frequency == 'irregular':
        return { isRecurring: false }

    // Calculate amount consistency
    avgAmount = mean(amounts)
    amountVariation = max(amounts) - min(amounts)
    amountConsistent = (amountVariation / avgAmount) < 0.10  // Within 10%

    // Confidence scoring
    confidence = 'low'
    if amountConsistent AND intervalStdDev < 5:
        confidence = 'high'
    else if amountConsistent OR intervalStdDev < 10:
        confidence = 'medium'

    // Predict next charge date
    nextExpected = dates.last + expectedIntervalDays(frequency)

    return {
        isRecurring: true,
        frequency: frequency,
        intervalDays: round(avgInterval),
        amount: amounts.last,          // Most recent amount
        amountHistory: amounts.slice(-6),
        confidence: confidence,
        firstSeen: dates[0],
        lastSeen: dates.last,
        nextExpected: nextExpected,
        transactionIds: sorted.map(t => t.plaid_transaction_id)
    }
```

### 3.6 Exclusion Rules (Not Subscriptions)

The algorithm must exclude common recurring-but-not-subscription transactions:

```
EXCLUDED_CATEGORIES = [
    'Food and Drink',        // Weekly grocery trips
    'Transfer',              // Internal transfers
    'Payment',               // Credit card payments
    'Loan',                  // Loan/mortgage payments (tracked in Debt Attack)
]

EXCLUDED_MERCHANTS = [
    'ATM', 'INTERAC', 'E-TRANSFER', 'PAYROLL',
    'WALMART', 'COSTCO', 'LOBLAWS', 'METRO', 'SOBEYS',
    'NO FRILLS', 'FOOD BASICS', 'FRESHCO',
    'TIM HORTONS', 'STARBUCKS', 'MCDONALD'
]
```

These are checked during Step 2 grouping. Transactions matching excluded categories or merchants are skipped.

### 3.7 Confidence Score Breakdown

| Factor | High | Medium | Low |
|---|---|---|---|
| Amount variation | < 5% | 5-15% | > 15% |
| Interval std dev | < 3 days | 3-7 days | > 7 days |
| Number of occurrences | 4+ | 3 | 2 |
| Has known merchant alias | Yes | - | - |

Final confidence = weighted combination. If any factor is "low", overall caps at "medium". All "high" required for overall "high".

---

## 4. API Endpoint Specifications

### 4.1 GET `/watchdog`

**Auth**: Required (Bearer JWT via `authenticateToken`)

**Query Parameters**:
| Param | Type | Default | Description |
|---|---|---|---|
| `force_refresh` | boolean | false | Force re-analysis even if cache is fresh |

**Response** (200):

```json
{
  "success": true,
  "data": {
    "expenses": [
      {
        "id": 42,
        "name": "Netflix",
        "amount": 22.99,
        "currency": "CAD",
        "frequency": "monthly",
        "category": "Streaming",
        "confidence": "high",
        "status": "active",
        "action": "stop",
        "firstSeen": "2025-11-12",
        "lastSeen": "2026-04-12",
        "nextExpected": "2026-05-12",
        "dueDate": "May 12",
        "logoColor": "#E50914",
        "flags": [
          { "type": "price_increase", "detail": "Up 15% from $19.99", "severity": "warning" }
        ]
      }
    ],
    "analysis": {
      "total_monthly": 284.97,
      "total_annual": 3419.64,
      "potential_savings": 85.00,
      "flags_found": 3,
      "category_breakdown": {
        "Streaming": 52.97,
        "Telecom": 120.00,
        "Health": 39.99,
        "Software": 15.99,
        "Music": 10.99,
        "Utilities": 45.03
      }
    },
    "alerts": [
      {
        "id": 7,
        "type": "duplicate_category",
        "title": "3 Streaming Services",
        "message": "You have Netflix, Disney+, and Crave. Consider consolidating.",
        "severity": "info"
      }
    ],
    "categories": ["All", "Streaming", "Telecom", "Utilities", "Health", "Software", "Music", "Other"]
  },
  "meta": {
    "source": "computed",
    "cached": true,
    "lastAnalyzedAt": "2026-04-15T10:30:00Z",
    "transactionsAnalyzed": 347,
    "timestamp": "2026-04-15T14:22:00Z"
  }
}
```

**Implementation Notes**:
- Check `watchdog_analysis_cache` to see if re-analysis is needed
- Cache is stale if: (a) no cache exists, (b) new transactions have been synced since `last_analyzed_at`, (c) `force_refresh=true`, (d) `analysis_version` is outdated
- If cache is fresh, read from `recurring_expenses` table directly
- If cache is stale, run detection algorithm, upsert into `recurring_expenses`, update cache
- The `action` field is determined by: user-set action from `subscription_actions` table, or auto-suggested action based on flags
- `dueDate` is formatted from `next_expected` as "MMM DD" for the UI
- `logoColor` comes from a static mapping in the cancellation knowledge base

### 4.2 POST `/watchdog/action`

**Auth**: Required

**Request Body**:

```json
{
  "expenseId": 42,
  "action": "stop",
  "notes": "Too expensive, switching to basic plan",
  "snoozeUntil": "2026-05-15"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `expenseId` | integer | Yes | `recurring_expenses.id` |
| `action` | string | Yes | One of: `negotiate`, `stop`, `keep`, `snooze`, `undo` |
| `notes` | string | No | Optional user note |
| `snoozeUntil` | date string | No | Required if action is `snooze` |

**Action Effects**:

| Action | Status Change | Behavior |
|---|---|---|
| `negotiate` | `active` -> `negotiating` | Returns negotiation tips from knowledge base |
| `stop` | `active` -> `cancelling` | Returns cancellation guide from knowledge base. Starts monitoring for post-cancel charges. |
| `keep` | any -> `active` | Sets `action` to `active`. Stops flagging this expense. |
| `snooze` | any -> `snoozed` | Sets `snoozed_until`. Hidden from UI until date passes. |
| `undo` | any -> `active` | Reverts to active, clears action. |

**Response** (200):

```json
{
  "success": true,
  "data": {
    "expenseId": 42,
    "newStatus": "cancelling",
    "action": "stop",
    "guide": {
      "merchantName": "Netflix",
      "steps": [
        "Go to netflix.com/cancelplan",
        "Click 'Cancel Membership'",
        "Confirm cancellation"
      ],
      "directUrl": "https://www.netflix.com/cancelplan",
      "estimatedTime": "2 minutes",
      "tips": ["Your access continues until the end of your billing period"],
      "negotiationScript": null
    }
  }
}
```

**Validation** (using express-validator):
- `expenseId`: required, integer, must belong to authenticated user
- `action`: required, must be one of the allowed values
- `snoozeUntil`: required if action is `snooze`, must be a future date, max 90 days out

### 4.3 GET `/watchdog/summary`

**Auth**: Required

Quick stats for dashboard widget on HomeScreen.

**Response** (200):

```json
{
  "success": true,
  "data": {
    "total_monthly": 284.97,
    "subscription_count": 8,
    "flags_found": 3,
    "potential_savings": 85.00,
    "top_flag": {
      "name": "GoodLife Fitness",
      "reason": "Inactive for 3 months",
      "amount": 39.99
    }
  }
}
```

**Implementation**: Reads directly from `recurring_expenses` table aggregates. Does not trigger re-analysis.

---

## 5. Cancellation Knowledge Base

### File: `packages/backend/src/data/cancellation_guides.json`

Static JSON file loaded into memory at server start. Keyed by normalized merchant name.

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

### Knowledge Base Design Principles

1. **Static JSON, not database**: This data changes rarely. Loaded at server startup, no DB queries needed.
2. **Keyed by normalized merchant name**: Direct lookup from detection results.
3. **Canadian-focused**: All phone numbers, URLs, and tips are for Canadian services.
4. **Nullable fields**: Not all merchants have negotiation scripts or annual options.
5. **Extensible**: New merchants can be added by editing the JSON file. No migration needed.

---

## 6. Smart Alerts Logic

### 6.1 Alert Types

```
function generateAlerts(expenses, allTransactions):
    alerts = []

    // 1. PRICE INCREASE DETECTION
    for expense in expenses:
        if expense.amountHistory.length >= 2:
            previous = expense.amountHistory[-2]
            current = expense.amountHistory[-1]
            if current > previous:
                pctIncrease = ((current - previous) / previous) * 100
                if pctIncrease >= 5:
                    alerts.push({
                        type: 'price_increase',
                        expenseId: expense.id,
                        title: `${expense.name} price increased`,
                        message: `${expense.name} went from $${previous} to $${current} (${pctIncrease.toFixed(0)}% increase)`,
                        severity: pctIncrease >= 20 ? 'critical' : 'warning',
                        data: { previous, current, pctIncrease }
                    })

    // 2. DUPLICATE CATEGORY DETECTION
    categoryGroups = groupBy(expenses, 'category')
    for (category, items) in categoryGroups:
        if items.length >= 3 AND category in ['Streaming', 'Music', 'Software']:
            totalCost = sum(items.map(i => i.amount))
            alerts.push({
                type: 'duplicate_category',
                title: `${items.length} ${category} services`,
                message: `You're spending $${totalCost}/mo on ${items.map(i => i.name).join(', ')}. Consider consolidating.`,
                severity: 'info',
                data: { category, services: items.map(i => i.name), totalCost }
            })

    // 3. NEW SUBSCRIPTION DETECTION
    for expense in expenses:
        daysSinceFirstSeen = daysBetween(expense.firstSeen, today)
        if daysSinceFirstSeen <= 45 AND expense.amountHistory.length <= 2:
            alerts.push({
                type: 'new_subscription',
                expenseId: expense.id,
                title: `New: ${expense.name}`,
                message: `${expense.name} ($${expense.amount}/mo) was first detected ${daysSinceFirstSeen} days ago`,
                severity: 'info',
                data: { firstSeen: expense.firstSeen }
            })

    // 4. CHARGE AFTER CANCEL DETECTION
    for expense in expenses where status == 'cancelling':
        if expense.lastSeen > expense.statusChangedAt:
            alerts.push({
                type: 'charge_after_cancel',
                expenseId: expense.id,
                title: `${expense.name} still charging`,
                message: `You marked ${expense.name} for cancellation, but a charge of $${expense.amount} was detected on ${expense.lastSeen}`,
                severity: 'critical',
                data: { chargeDate: expense.lastSeen, amount: expense.amount }
            })

    // 5. ANNUAL SAVINGS OPPORTUNITY
    for expense in expenses where frequency == 'monthly':
        guide = cancellationGuides[expense.name]
        if guide?.annualOption:
            monthlySavings = expense.amount - guide.annualOption.monthlyEquivalent
            if monthlySavings > 0:
                alerts.push({
                    type: 'annual_savings',
                    expenseId: expense.id,
                    title: `Save on ${expense.name}`,
                    message: `Switch to annual billing and save $${(monthlySavings * 12).toFixed(2)}/year`,
                    severity: 'info',
                    data: { currentMonthly: expense.amount, annualEquivalent: guide.annualOption.monthlyEquivalent }
                })

    return alerts
```

### 6.2 Alert Deduplication

- Alerts are generated fresh on each analysis run
- Before inserting into `subscription_alerts`, check for existing non-dismissed alerts of the same `(user_id, recurring_expense_id, alert_type)` combination
- If an existing alert exists, update its message/data but keep the original `created_at`
- If the alert condition no longer applies (e.g., price went back down), mark it as dismissed

### 6.3 Potential Savings Calculation

```
function calculatePotentialSavings(expenses, alerts):
    savings = 0

    // Expenses flagged as "stop" candidates
    for expense where action == 'stop':
        savings += expense.amount

    // Negotiation savings (estimated 20% of telecom/utility bills)
    for expense where action == 'negotiate':
        guide = cancellationGuides[expense.name]
        if guide?.negotiation?.expectedDiscount:
            discountPct = parseRange(guide.negotiation.expectedDiscount).low / 100
            savings += expense.amount * discountPct

    // Annual billing savings
    for alert where type == 'annual_savings':
        savings += alert.data.currentMonthly - alert.data.annualEquivalent

    return round(savings, 2)
```

### 6.4 Auto-Suggested Actions

When no user action has been taken, the system auto-suggests an action for the UI:

| Condition | Suggested Action |
|---|---|
| Has `charge_after_cancel` alert | `stop` |
| Has `price_increase` alert (>20%) | `negotiate` |
| No charges in 60+ days (but still recurring) | `stop` (possibly unused) |
| Telecom/Utility with above-average pricing | `negotiate` |
| Everything normal | `active` |

---

## 7. UI Enhancements

### 7.1 Updated Category List

The current UI has only 4 categories. Update to match backend:

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

### 7.2 New Components

#### CancellationBottomSheet

Shown when user taps "Stop" on an expense. Uses React Native bottom sheet pattern.

```
Props:
  - visible: boolean
  - expense: RecurringExpense
  - guide: CancellationGuide (from API response)
  - onClose: () => void
  - onConfirm: () => void

Content:
  - Merchant name + logo
  - "How to Cancel" heading
  - Numbered step list
  - Direct link button (opens in-app browser)
  - Estimated time badge
  - Tips section
  - "I've Cancelled" confirmation button
  - "Pause Instead" option (if canPause is true)
```

#### NegotiationBottomSheet

Shown when user taps "Negotiate" on a telecom/utility expense.

```
Props:
  - visible: boolean
  - expense: RecurringExpense
  - guide: NegotiationGuide (from API response)
  - onClose: () => void

Content:
  - "Negotiation Script" card with copyable text
  - Phone number with tap-to-call
  - Best time to call
  - Expected discount range
  - Tips list
  - "I Negotiated" button (records action + prompts for new amount)
```

#### AlertBanner

Displayed above the expense list when there are critical or warning alerts.

```
Props:
  - alerts: Alert[]

Content:
  - Horizontal scrollable alert cards
  - Color-coded by severity (critical=red, warning=amber, info=blue)
  - Tap to expand details
  - Dismiss button
```

#### SavingsTracker

Shows running tally of money saved since user started cancelling/negotiating.

```
Props:
  - totalSaved: number
  - cancelledExpenses: RecurringExpense[]

Content:
  - "You've saved $X so far" heading
  - List of cancelled/negotiated items with monthly savings each
  - Streak counter ("3 months of savings!")
```

#### CategoryBreakdownChart

Pie or donut chart showing subscription spend by category.

```
Props:
  - breakdown: { [category]: amount }

Content:
  - Donut chart using react-native-svg
  - Category legend with amounts
  - Total in center of donut
```

### 7.3 Enhanced Expense Item

Update `renderExpenseItem` to show:
- Frequency badge (Monthly, Bi-weekly, Annual) below the amount
- Alert flag icon if the expense has flags (price increase indicator, unused warning)
- Confidence indicator (subtle dot: green=high, yellow=medium, gray=low)

### 7.4 Annual vs Monthly Toggle

Add a toggle at the top of the savings card:

```
[Monthly: $284.97] | [Annual: $3,419.64]
```

Toggling switches the display amount and the expense list amounts to show annual equivalents.

### 7.5 Empty State Enhancement

When the user has no linked bank accounts or insufficient transaction history:

```
Content:
  - Shield icon
  - "Connect your bank to activate Watchdog"
  - "We need at least 2 months of transaction history to detect recurring expenses"
  - "Connect Bank" button -> navigates to ConnectBankScreen
```

---

## 8. Backend Service Refactoring

### 8.1 New File Structure

```
packages/backend/src/
  services/
    watchdog.js              -- Rewritten: full detection algorithm
  data/
    merchant_aliases.json    -- Merchant name normalization map
    merchant_categories.json -- Category assignments
    cancellation_guides.json -- Knowledge base
  routes/
    watchdog.js              -- Rewritten: real endpoints
```

### 8.2 Updated watchdog.js Service

The service should export:

```javascript
class WatchdogService {
    // Main entry point - runs full analysis or returns cache
    async analyzeForUser(userId, forceRefresh = false)

    // Internal: detect recurring expenses from transactions
    detectRecurringExpenses(transactions)

    // Internal: normalize merchant name
    normalizeMerchantName(rawName)

    // Internal: analyze recurrence pattern for a merchant group
    analyzeRecurrencePattern(transactions)

    // Internal: generate alerts
    generateAlerts(expenses, allTransactions)

    // Internal: calculate savings
    calculatePotentialSavings(expenses, alerts)

    // Record user action
    async recordAction(userId, expenseId, action, notes, snoozeUntil)

    // Get summary stats (for dashboard)
    async getSummary(userId)

    // Invalidate cache (called after transaction sync)
    async invalidateCache(userId)
}
```

### 8.3 Cache Invalidation

In `packages/backend/src/routes/transactions.js`, after a successful Plaid sync (line ~76), add:

```javascript
// Invalidate watchdog cache so next GET /watchdog re-analyzes
await watchdogService.invalidateCache(userId);
```

### 8.4 Integration with Transactions Route

The existing `watchdogService.analyze()` call on line 174 of transactions.js should remain for backward compatibility (returns leakage analysis in the transactions response), but the service method should be updated to use the new detection logic rather than simple regex matching.

---

## 9. Implementation Phases

### Phase 1: Database + Core Detection (Backend)
**Estimated effort**: 1 session

1. Create migration file `db/add_watchdog_tables.sql`
2. Create `src/data/merchant_aliases.json`
3. Create `src/data/merchant_categories.json`
4. Rewrite `src/services/watchdog.js` with full detection algorithm
5. Implement `normalizeMerchantName()` and `analyzeRecurrencePattern()`
6. Update `src/routes/watchdog.js` GET endpoint to use real detection
7. Wire up cache logic in `watchdog_analysis_cache` table
8. Add cache invalidation call in transactions.js after Plaid sync

### Phase 2: Actions + Knowledge Base (Backend)
**Estimated effort**: 1 session

1. Create `src/data/cancellation_guides.json`
2. Implement POST `/watchdog/action` with full persistence
3. Implement GET `/watchdog/summary`
4. Add input validation via `middleware/validators.js`
5. Implement alert generation logic
6. Wire cancellation guide data into action responses

### Phase 3: Mobile UI Enhancements
**Estimated effort**: 1 session

1. Update CATEGORIES array with full category list
2. Build CancellationBottomSheet component
3. Build NegotiationBottomSheet component
4. Update expense item rendering (frequency badge, flags, confidence)
5. Add alert banner above expense list
6. Add annual/monthly toggle on savings card
7. Update empty state for no-data scenario

### Phase 4: Dashboard Integration + Polish
**Estimated effort**: 1 session

1. Build CategoryBreakdownChart component
2. Add Watchdog summary widget to HomeScreen
3. Build SavingsTracker component
4. Handle edge cases (snoozed expenses, undo actions)
5. Add sorting options (by cost, by category, by flag status)

---

## 10. Edge Cases and Error Handling

### Detection Edge Cases

| Case | Handling |
|---|---|
| User has < 60 days of transactions | Return empty results with `needs_more_history: true` flag. UI shows helpful message. |
| Merchant name is completely unrecognizable | Falls through to "Other" category. Low confidence. |
| Same merchant, two different amounts (e.g., Rogers wireless + Rogers internet) | If amount difference > 30%, treat as two separate recurring expenses. Group by normalized name + amount bucket. |
| Refund followed by re-charge | Exclude negative amounts (refunds) from pattern detection. |
| One-time annual charge looks like it could be monthly | Require minimum 2 occurrences at the detected frequency before classifying as recurring. Annual charges need 2+ years of data OR known merchant alias match. |
| Charge stops appearing (cancelled elsewhere) | If `next_expected` is more than 1.5x interval in the past, mark as `paused`. After 3x interval, mark as `cancelled` automatically. |
| Currency other than CAD | Ignore non-CAD transactions (Canada-only app). |
| Shared/family plans | Cannot distinguish - treat as a single subscription at the detected amount. |

### API Error Handling

| Error | HTTP Status | Response |
|---|---|---|
| No transactions in DB | 200 | Empty expenses array with `needs_transaction_history: true` |
| Invalid expense ID in action | 404 | `{ success: false, error: "Expense not found" }` |
| Expense belongs to different user | 404 | Same as above (don't leak existence) |
| Invalid action value | 400 | Validation error from express-validator |
| Snooze without snoozeUntil | 400 | `{ success: false, error: "snoozeUntil is required for snooze action" }` |
| Detection algorithm fails | 500 | Log error, return cached results if available, empty array if not |
| Database connection error | 500 | Standard error handler catches via `next(error)` |

### Data Privacy

- No subscription data is sent to Gemini AI. The watchdog feature is entirely local analysis.
- Merchant names and amounts are stored in the IndusWealth database only.
- The cancellation knowledge base is static reference data, not user-specific.
- Action audit trail (`subscription_actions`) respects CASCADE delete on user deletion.

---

## 11. Testing Considerations

Since the project has no test suite, manual testing should cover:

1. **Empty state**: New user with no transactions -> proper empty message
2. **Few transactions**: User with < 2 months data -> `needs_more_history` flag
3. **Normal detection**: Plaid sandbox with recurring charges -> expenses detected
4. **Action persistence**: Stop/Negotiate/Keep/Snooze -> check DB state and UI update
5. **Cache behavior**: First load (compute), second load (cached), after sync (re-compute)
6. **Price increase**: Manually insert transactions with increasing amounts -> alert generated
7. **Duplicate category**: 3+ streaming services -> consolidation alert
8. **Cancellation guide**: Tap Stop on Netflix -> see cancellation steps and URL
9. **Negotiation flow**: Tap Negotiate on Rogers -> see script and phone number

### Plaid Sandbox Data

Plaid sandbox returns predictable transaction data. To test effectively:
- Use `user_good` / `pass_good` credentials
- Sandbox generates ~90 days of transactions with recurring patterns
- Look for recurring merchants in sandbox data and ensure they're detected

---

## 12. Future Enhancements (Out of Scope for V1)

- **Push notifications** for charge-after-cancel detection
- **Gemini AI** for smarter subscription categorization and personalized savings tips
- **Subscription sharing** detection (family plan recommendations)
- **Bill negotiation service** integration (e.g., Billshark, Trim)
- **Historical savings dashboard** showing cumulative money saved over months
- **Export** subscription list to CSV/PDF
