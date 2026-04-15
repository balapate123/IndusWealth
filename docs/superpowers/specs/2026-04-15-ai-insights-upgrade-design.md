# AI Insights & Wealth Academy Upgrade - Design Specification

**Date**: 2026-04-15
**Status**: Ready for Implementation
**Branch**: `feature/ai-insights-upgrade`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Architecture Changes](#3-architecture-changes)
4. [Canadian ETF Knowledge Base](#4-canadian-etf-knowledge-base)
5. [New Insight Categories & Prompt Engineering](#5-new-insight-categories--prompt-engineering)
6. [Learning Portal / Wealth Academy Overhaul](#6-learning-portal--wealth-academy-overhaul)
7. [UI/UX Redesign - InsightsScreen](#7-uiux-redesign---insightsscreen)
8. [API Changes](#8-api-changes)
9. [Database Schema Changes](#9-database-schema-changes)
10. [Implementation Phases](#10-implementation-phases)
11. [Risk Disclaimers & Compliance](#11-risk-disclaimers--compliance)

---

## 1. Executive Summary

The current AI Insights feature generates generic Canadian finance advice ("open a TFSA", "build emergency fund"). This upgrade transforms it into an intelligent financial co-pilot that delivers specific, numbers-driven, actionable insights including ETF recommendations, tax optimization strategies, opportunity cost analysis, and seasonal timely advice.

**Key deliverables:**
- Upgraded AI model (Gemini 2.0 Pro) with enhanced prompt engineering
- Static Canadian ETF knowledge base (JSON) feeding into AI context
- 6 new insight categories beyond the existing 7
- Fixed and curated Wealth Academy with 40+ reliable articles
- Complete UI/UX redesign with Financial Health Score, tabbed insights, Investment Corner, and premium article cards

---

## 2. Current State Analysis

### 2.1 Backend Architecture (What Exists)

**AI Pipeline** (`packages/backend/src/services/ai_insights.js`):
- Model: `gemini-2.0-flash` via `@google/generative-ai` SDK
- Temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 4096
- Response format: `application/json` (structured output)
- Validation: requires `id`, `type`, `priority`, `title`, `description`, `action`, `potential_benefit`
- Prioritization: sorts by priority weight (high=3, medium=2, low=1) then annual_savings, returns top 5
- Article recommendations: AI generates 3-5 article URLs in response; validated for URL format and category

**Data Aggregation** (`packages/backend/src/services/insight_data.js`):
- 9 parallel queries: userProfile, accounts, spendingSummary, incomeSummary, subscriptions, debtSummary, creditHealth, savingsMetrics, cashFlow
- Produces `financial_readiness` composite (emergency_fund_complete, high_interest_debt_cleared, stable_income, positive_cash_flow, ready_to_invest)
- Analysis period: 90 days default
- Does NOT currently query `user_preferences` (risk tolerance, homebuyer status, etc.)

**Caching** (`packages/backend/src/routes/insights.js`):
- PostgreSQL `user_insights` table, 6-hour TTL (configurable via `INSIGHTS_CACHE_HOURS`)
- Fallback: returns stale cache on AI failure
- Force refresh via `?force_refresh=true` query param

**Educational Content** (`packages/backend/src/services/educational_content.js`):
- Articles stored in `educational_articles` table with 7-day expiry
- AI-generated article URLs are cached with metadata
- Bookmark system: `user_article_bookmarks` table
- Insight-article linking: `insight_articles` table with relevance scores
- Seed function has 8 hardcoded articles
- **Problem**: AI hallucinates URLs. Real URLs from trusted sources expire or change. No health checking.

### 2.2 Mobile Architecture (What Exists)

**InsightsScreen** (`packages/mobile/src/screens/InsightsScreen.js`):
- Flat vertical scroll of insight cards
- Each card: priority badge, category icon, title, description, reasoning bullets, benefit amounts, action buttons, dismiss
- Wealth Academy section at bottom: horizontal scroll of ArticleCard components
- No Financial Health Score, no tabs/carousel, no expandable cards, no Investment Corner

**ArticleCard** (`packages/mobile/src/components/ArticleCard.js`):
- Two variants: `horizontal` (280px wide scroll item) and `vertical` (full-width list item)
- Shows: thumbnail placeholder, category badge, read time badge, title, description, source avatar, bookmark button
- Source logo is just first-letter avatar

### 2.3 Database Schema (What Exists)

Tables involved: `user_insights`, `user_insight_dismissals`, `user_preferences`, `insight_actions`, `educational_articles`, `user_article_bookmarks`, `insight_articles`

`user_preferences` has: `first_time_homebuyer`, `investment_risk_tolerance` (conservative/moderate/aggressive), `interested_in_investing`, `interested_in_crypto`, `preferred_savings_account_type`

---

## 3. Architecture Changes

### 3.1 AI Model Upgrade

**Change**: Upgrade from `gemini-2.0-flash` to `gemini-2.0-pro` for deeper financial reasoning.

**File**: `packages/backend/src/services/ai_insights.js`

```js
// Change from:
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Change to:
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-pro' });
```

**Configuration updates**:
- `maxOutputTokens`: increase from 4096 to 8192 (more insight categories = more output)
- `temperature`: keep at 0.7 (good balance for financial advice)
- Add `GEMINI_MODEL` env var for easy switching: `process.env.GEMINI_MODEL || 'gemini-2.0-pro'`

**Rationale**: Pro model produces more nuanced, specific financial reasoning. Flash is faster but shallower. The 6-hour cache means we only call the model ~4 times/day per active user, so the cost difference is negligible.

### 3.2 New Service: ETF Knowledge Base

**New file**: `packages/backend/src/data/canadian_etfs.json`

Static JSON file containing Canadian ETF data. Loaded at startup and injected into the AI prompt as context. Updated manually on a quarterly basis.

**New file**: `packages/backend/src/services/etf_knowledge.js`

```js
// Service responsibilities:
// 1. Load and cache the ETF JSON data
// 2. Filter ETFs by risk level, category, or search term
// 3. Format ETF data for AI prompt injection
// 4. Provide ETF lookup for the API (mobile Investment Corner)
```

### 3.3 Enhanced Data Aggregation

**File**: `packages/backend/src/services/insight_data.js`

Add to the parallel query array:
- `_getUserPreferences(userId)` — fetch from `user_preferences` table (risk tolerance, homebuyer status, investment interest)
- `_getSeasonalContext()` — return current month, days until RRSP deadline (March 1), tax filing deadline (April 30), TFSA reset (January 1), back-to-school (September)

The `getUserFinancialSummary` return object gains two new keys:

```js
{
    // ... existing 10 keys ...
    user_preferences: {
        investment_risk_tolerance: 'moderate',
        first_time_homebuyer: null,
        interested_in_investing: true,
        preferred_savings_account_type: 'tfsa'
    },
    seasonal_context: {
        current_month: 'April',
        current_quarter: 'Q2',
        days_until_rrsp_deadline: 320,
        days_until_tax_deadline: 15,
        days_until_tfsa_reset: 261,
        is_tax_season: true,
        is_rrsp_season: false
    }
}
```

### 3.4 Financial Health Score Calculator

**New file**: `packages/backend/src/services/health_score.js`

Calculates a 0-100 financial health score based on weighted dimensions:

| Dimension | Weight | Scoring Logic |
|---|---|---|
| Emergency Fund | 20% | 0-6 months coverage maps to 0-100 |
| Debt Health | 20% | Based on debt-to-income ratio and highest APR |
| Credit Utilization | 15% | <30% = 100, 30-50% = 75, 50-70% = 50, >70% = 25 |
| Cash Flow | 15% | Surplus/income ratio: >20% = 100, 10-20% = 75, 0-10% = 50, negative = 0 |
| Savings Rate | 15% | savings/income: >20% = 100, 10-20% = 75, 5-10% = 50, <5% = 25 |
| Investment Readiness | 15% | Composite: emergency fund + no high-interest debt + stable income + positive cash flow |

Returns:
```js
{
    score: 72,
    grade: 'B',          // A (90-100), B (75-89), C (60-74), D (40-59), F (0-39)
    color: '#4CAF50',    // green/amber/red
    breakdown: {
        emergency_fund: { score: 85, weight: 20, label: 'Emergency Fund' },
        debt_health: { score: 60, weight: 20, label: 'Debt Health' },
        // ... etc
    },
    trend: 'improving',  // comparing to previous score if available
    previous_score: 68
}
```

---

## 4. Canadian ETF Knowledge Base

### 4.1 Schema

**File**: `packages/backend/src/data/canadian_etfs.json`

```json
{
    "last_updated": "2026-04-01",
    "data_disclaimer": "Historical returns are approximate and for educational purposes only. Past performance does not guarantee future results. Data updated quarterly.",
    "etfs": [
        {
            "ticker": "XEQT",
            "name": "iShares Core Equity ETF Portfolio",
            "provider": "BlackRock (iShares)",
            "category": "all_equity",
            "subcategory": "global_equity",
            "risk_level": "high",
            "mer_percent": 0.20,
            "distribution_yield_percent": 1.8,
            "distribution_frequency": "quarterly",
            "holdings_count": 9000,
            "geographic_allocation": {
                "canada": 25,
                "us": 45,
                "international_developed": 22,
                "emerging_markets": 8
            },
            "historical_returns": {
                "ytd_percent": 4.2,
                "one_year_percent": 12.5,
                "three_year_annualized_percent": 8.1,
                "five_year_annualized_percent": 9.3,
                "since_inception_annualized_percent": 10.2
            },
            "suitable_for": ["long_term_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "All-in-one 100% equity ETF with global diversification. Single-fund solution for long-term growth investors.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        }
    ],
    "categories": {
        "all_equity": "100% stocks, highest growth potential, highest volatility",
        "balanced": "Mix of stocks and bonds, moderate growth, moderate volatility",
        "fixed_income": "Bonds and fixed income, lower growth, lower volatility",
        "dividend": "Focus on dividend-paying stocks, income generation",
        "canadian_equity": "Canadian stock market focused",
        "us_equity": "US stock market focused",
        "international": "International/global market focused",
        "sector": "Specific sector (tech, real estate, etc.)",
        "hisa_etf": "High-interest savings account ETFs"
    },
    "risk_profiles": {
        "conservative": {
            "description": "Capital preservation, low volatility tolerance",
            "recommended_allocation": { "equity": 30, "fixed_income": 70 },
            "suitable_categories": ["fixed_income", "balanced", "hisa_etf", "dividend"]
        },
        "moderate": {
            "description": "Balanced growth and stability",
            "recommended_allocation": { "equity": 60, "fixed_income": 40 },
            "suitable_categories": ["balanced", "all_equity", "dividend", "canadian_equity"]
        },
        "aggressive": {
            "description": "Maximum growth, high volatility tolerance",
            "recommended_allocation": { "equity": 90, "fixed_income": 10 },
            "suitable_categories": ["all_equity", "us_equity", "international", "sector"]
        }
    }
}
```

### 4.2 ETFs to Include (30 entries)

**All-in-One Portfolio ETFs:**
- XEQT (iShares Core Equity), VEQT (Vanguard All-Equity), XGRO (iShares Core Growth), VGRO (Vanguard Growth), XBAL (iShares Core Balanced), VBAL (Vanguard Balanced)

**Canadian Equity:**
- XIU (iShares S&P/TSX 60), XIC (iShares Core S&P/TSX), VCN (Vanguard FTSE Canada)

**US Equity:**
- VFV (Vanguard S&P 500), XUU (iShares Core S&P US Total Market), ZSP (BMO S&P 500)

**International:**
- XEF (iShares Core MSCI EAFE), VIU (Vanguard FTSE Developed ex NA)

**Fixed Income:**
- ZAG (BMO Aggregate Bond), VAB (Vanguard Canadian Aggregate Bond), XBB (iShares Core Canadian Bond)

**Dividend:**
- VDY (Vanguard FTSE Canadian High Dividend), XDV (iShares Canadian Select Dividend), CDZ (iShares S&P/TSX Canadian Dividend Aristocrats)

**HISA ETFs:**
- CASH (CI High Interest Savings), PSA (Purpose High Interest Savings), HSAV (Global X High Interest Savings)

**Sector:**
- ZRE (BMO Equal Weight REITs), XIT (iShares S&P/TSX Capped Information Technology), HCAL (Hamilton Enhanced Canadian Bank)

**Emerging Markets:**
- XEC (iShares Core MSCI Emerging Markets)

**Global ESG:**
- GEQT (iShares ESG Aware All Equity)

### 4.3 ETF Service API

**File**: `packages/backend/src/services/etf_knowledge.js`

```js
module.exports = {
    getAllETFs(),                              // Full list
    getETFByTicker(ticker),                   // Single lookup
    getETFsByRiskProfile(riskLevel),           // Filter by conservative/moderate/aggressive
    getETFsByCategory(category),              // Filter by category
    getRecommendedETFs(userPreferences),      // AI-assisted recommendations
    getETFDataForPrompt(riskLevel),           // Formatted string for AI prompt injection
    getLastUpdated(),                          // Data freshness
};
```

---

## 5. New Insight Categories & Prompt Engineering

### 5.1 Expanded Insight Categories (13 total)

**Existing 7 (keep):**
1. Tax-Advantaged Account Opportunities
2. Spending Optimization
3. Debt Payoff Acceleration
4. Savings Acceleration
5. Cash Flow Optimization
6. Investment Readiness
7. Milestone Celebrations

**New 6 (add):**

8. **ETF/Investment Recommendations**
   - Triggered when: `financial_readiness.ready_to_invest === true` OR user has surplus > $500/month
   - Example insight:
   ```json
   {
       "type": "ETF/Investment Recommendations",
       "priority": "high",
       "title": "Your $800/mo surplus could grow to $58K in 5 years",
       "description": "Based on your moderate risk tolerance, XGRO (iShares Core Growth ETF, MER 0.20%) gives you 80/20 stock-bond exposure. At ~7% average annual return, $800/month DCA grows to approximately $57,600 in 5 years.",
       "reasoning": [
           "You have a 3.2-month emergency fund (target: 3-6 months) - you're covered",
           "No high-interest debt remaining",
           "Monthly surplus of $800 is consistent over 90 days",
           "XGRO matches your 'moderate' risk profile with global diversification"
       ],
       "data_points": {
           "monthly_surplus": 800,
           "recommended_etf": "XGRO",
           "etf_mer": 0.20,
           "projected_5yr_value": 57600,
           "assumed_annual_return": 7.0
       },
       "action": {
           "primary": {
               "label": "Open Wealthsimple Account",
               "type": "web_link",
               "url": "https://www.wealthsimple.com/en-ca/invest"
           }
       },
       "potential_benefit": {
           "monthly_savings": 0,
           "annual_savings": 0,
           "annual_growth_estimate": 3360,
           "calculation": "$800/mo x 12 = $9,600 invested. At 7% return, first year growth ~$336. Compounds significantly over 5+ years."
       }
   }
   ```
   - **Disclaimer**: Always include `"Note: Historical returns are approximate and for educational purposes. Past performance does not guarantee future results. Consider consulting a financial advisor."` in the description or reasoning.

9. **Tax Optimization**
   - Triggered when: tax season (Jan-April), user has RRSP room, or high income
   - Sub-types: RRSP contribution optimization, tax-loss harvesting concepts, FHSA strategies, income splitting
   - Example: "Contributing $X to your RRSP before March 1 could save you $Y on your 2025 taxes (based on estimated $Z income in the X% bracket)"

10. **Wealth Building Strategies**
    - Triggered when: user has positive cash flow and some investment readiness
    - Sub-types: Dollar-cost averaging plans, dividend reinvestment, asset allocation rebalancing, TFSA vs RRSP optimization
    - Example: "At your income level (~$65K), maxing your TFSA ($7,000) before RRSP is likely more tax-efficient. You could fill your TFSA by saving $583/month."

11. **Comparative Analysis**
    - Triggered when: spending data is available across categories
    - Uses Canadian statistical averages (from StatCan data, hardcoded in prompt)
    - Example: "You spend $620/month on dining out - that's 85% above the Canadian average of $335 for your income bracket ($50-75K). Reducing by 30% would save $186/month ($2,232/year)."

12. **Opportunity Cost Insights**
    - Triggered when: large balances sitting in low-interest accounts
    - Example: "You have $12,400 in your chequing account (avg over 90 days). Moving $8,000 to a HISA ETF (CASH.TO at ~4.8%) could earn ~$384/year vs. the ~$8 it earns in chequing (0.01%)."

13. **Seasonal/Timely Insights**
    - Triggered by: `seasonal_context` data
    - Types: RRSP deadline reminders, tax filing tips, TFSA room reset (Jan), back-to-school budgeting (Aug-Sep), holiday spending prep (Oct-Nov), new year financial goals (Jan)
    - Example (April): "Tax deadline is in 15 days (April 30). If you haven't filed yet, here are 3 deductions you might be missing based on your spending: home office ($X), public transit ($Y), charitable donations ($Z)."

### 5.2 Enhanced Prompt Engineering

The system prompt in `_buildPrompt()` needs major expansion. Key changes:

**A. Inject ETF knowledge base into prompt:**
```
CANADIAN ETF REFERENCE DATA (for investment recommendations):
${etfKnowledge.getETFDataForPrompt(userData.user_preferences.investment_risk_tolerance)}
```

**B. Inject user preferences:**
```
USER PREFERENCES:
- Risk tolerance: ${userData.user_preferences.investment_risk_tolerance}
- First-time homebuyer: ${userData.user_preferences.first_time_homebuyer}
- Interested in investing: ${userData.user_preferences.interested_in_investing}
- Preferred account type: ${userData.user_preferences.preferred_savings_account_type}
```

**C. Inject seasonal context:**
```
SEASONAL CONTEXT:
- Current date: ${new Date().toISOString().split('T')[0]}
- Tax season: ${userData.seasonal_context.is_tax_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_tax_deadline + ' days' : 'No'}
- RRSP season: ${userData.seasonal_context.is_rrsp_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_rrsp_deadline + ' days' : 'No'}
```

**D. Add Canadian statistical averages for comparative analysis:**
```
CANADIAN HOUSEHOLD SPENDING AVERAGES (2024 StatCan, approximate):
- Food: $1,060/month ($12,720/year)
- Shelter: $1,800/month ($21,600/year)
- Transportation: $860/month ($10,320/year)
- Dining out: $335/month ($4,020/year)
- Entertainment: $240/month ($2,880/year)
- Clothing: $200/month ($2,400/year)
- Personal care: $100/month ($1,200/year)

Income brackets (individual, Ontario):
- $0-$55,867: 15% federal + 5.05% provincial = ~20% marginal
- $55,867-$111,733: 20.5% + 9.15% = ~30% marginal
- $111,733-$154,906: 26% + 11.16% = ~37% marginal
- $154,906-$220,000: 29% + 12.16% = ~41% marginal
- $220,000+: 33% + 13.16% = ~46% marginal

HISA rates (approximate):
- EQ Bank: 4.00%
- Tangerine: 4.50% (promo)
- Wealthsimple Cash: 3.75%
- HISA ETFs (CASH, PSA): 4.5-5.0%
```

**E. New output rules:**
```
NEW INSIGHT RULES:
16. For ETF recommendations: ALWAYS name specific tickers, include MER, mention approximate historical returns, and link to a brokerage. Add disclaimer about past performance.
17. For tax insights: Use the user's estimated income to calculate approximate tax bracket and savings. Be specific with dollar amounts.
18. For comparative analysis: Compare user spending to Canadian averages and be specific about the difference.
19. For opportunity cost: Calculate the actual dollar difference between current and optimal allocation.
20. For seasonal insights: Only generate if seasonally relevant (check SEASONAL CONTEXT above).
21. Generate 6-8 insights total (increased from 4-5) across the expanded categories.
22. At least 1 insight must be from the new categories (8-13) if the user data supports it.
23. NEVER recommend specific stocks (individual companies). Only recommend broad-market ETFs from the provided reference data.
24. All projected returns must use the word "approximately" or "estimated" and include a disclaimer.
```

**F. Update max insights**: Change `_prioritizeInsights` to return top 7 instead of top 5.

### 5.3 Prompt Token Budget

Estimated prompt size after changes:
- System prompt (rules, categories, examples): ~3,500 tokens
- ETF knowledge base (30 ETFs, compressed): ~2,000 tokens
- Canadian averages + tax brackets: ~500 tokens
- User financial data: ~800 tokens
- **Total input**: ~6,800 tokens (well within Gemini Pro limits)
- **Expected output**: ~3,000-4,000 tokens (7 insights + 5 articles)

---

## 6. Learning Portal / Wealth Academy Overhaul

### 6.1 Root Cause of Broken Articles

The current system relies on AI-generated URLs which often do not resolve to real pages. The `educational_articles` table has a 7-day expiry, so articles disappear. The seed function only has 8 articles.

### 6.2 Solution: Curated Article Repository

**New file**: `packages/backend/src/data/curated_articles.json`

A manually curated, verified list of 40-50 articles from trusted Canadian finance sources. Each article has been manually verified to exist and be accessible.

**Categories (expanded from 6 to 8):**
1. `investing_basics` — How ETFs work, index investing, portfolio construction
2. `tax_planning` — RRSP, TFSA, FHSA, tax deductions, filing tips
3. `debt_management` — Snowball vs avalanche, consolidation, balance transfers
4. `budgeting` — 50/30/20, zero-based budgeting, expense tracking
5. `savings` — Emergency funds, HISA comparison, automation strategies
6. `canadian_finance_101` — Canadian banking system, credit scores in Canada, GICs
7. `etf_education` — Specific ETF guides, MER explained, DCA strategies
8. `wealth_building` — Compound interest, retirement planning, FIRE movement

**Article schema in JSON:**
```json
{
    "articles": [
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/what-is-etf",
            "title": "What Is an ETF? A Beginner's Guide",
            "description": "Learn what ETFs are, how they work, and why they've become one of the most popular investment vehicles in Canada.",
            "source": "Wealthsimple",
            "category": "etf_education",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["etf", "investing", "beginners"],
            "related_insight_types": ["investment_readiness", "etf_recommendation"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        }
    ]
}
```

### 6.3 Article Seeding and Refresh Strategy

**Modified**: `packages/backend/src/services/educational_content.js`

Add a new function `syncCuratedArticles()`:
1. Load `curated_articles.json`
2. Upsert all articles into `educational_articles` table
3. Set `expires_at` to 90 days (instead of 7 days) for curated articles
4. Link articles to insight types via `insight_articles` table
5. Run on server startup and via a new admin endpoint

**Article URL health check** (optional, Phase 3):
- Add a `url_status` column to `educational_articles`: `active`, `broken`, `unknown`
- Background job (daily cron or on-demand): HEAD request to each article URL
- If 404/unreachable after 3 checks, mark as `broken` and exclude from queries
- Fallback: if an article is broken, show the cached title/description with a "Source unavailable" notice

### 6.4 AI-Generated Articles Handling

Keep the existing flow where AI recommends articles, but with changes:
1. AI-recommended articles are saved with `source_type = 'ai_generated'`
2. Curated articles get `source_type = 'curated'`
3. Display priority: curated articles first, then AI-generated
4. If an AI-generated URL fails on the mobile WebView, show a fallback screen with article title, description, and a search link to the source domain

### 6.5 Curated Article List (40 Articles)

**Investing Basics (6 articles):**
1. Wealthsimple: "What Is an ETF?"
2. GetSmarterAboutMoney: "Understanding mutual funds and ETFs"
3. MoneySense: "Index Funds vs ETFs"
4. Investopedia: "Dollar-Cost Averaging"
5. Wealthsimple: "What Is a DRIP?"
6. MoneySense: "Best all-in-one ETFs in Canada"

**Tax Planning (6 articles):**
7. Canada.ca: "TFSA Overview"
8. Canada.ca: "RRSP Overview"
9. Canada.ca: "FHSA Overview"
10. Wealthsimple: "TFSA vs RRSP: Which is right for you?"
11. MoneySense: "Tax deductions and credits you might be missing"
12. TurboTax Canada: "Tax tips for young Canadians"

**Debt Management (5 articles):**
13. NerdWallet: "Debt Avalanche vs Debt Snowball"
14. Canada.ca: "Managing your debts"
15. Investopedia: "Balance Transfer Credit Cards"
16. MoneySense: "How to get out of debt in Canada"
17. GetSmarterAboutMoney: "Understanding credit card interest"

**Budgeting (5 articles):**
18. Investopedia: "What Is Budgeting?"
19. Wealthsimple: "The 50/30/20 Budget Rule"
20. MoneySense: "Best budgeting apps in Canada"
21. GetSmarterAboutMoney: "Making a budget"
22. NerdWallet: "Zero-Based Budgeting"

**Savings (5 articles):**
23. Investopedia: "Emergency Fund: What It Is and Why It Matters"
24. MoneySense: "Best high-interest savings accounts in Canada"
25. RateHub: "Compare savings accounts"
26. Wealthsimple: "What is a GIC?"
27. GetSmarterAboutMoney: "Saving and investing basics"

**Canadian Finance 101 (5 articles):**
28. Wealthsimple: "Credit Score in Canada"
29. GetSmarterAboutMoney: "How the Canadian financial system works"
30. MoneySense: "Banking basics in Canada"
31. Canada.ca: "Financial literacy resources"
32. Investopedia: "Introduction to Canadian banking"

**ETF Education (5 articles):**
33. Wealthsimple: "Best Canadian ETFs"
34. MoneySense: "MER explained: what you need to know"
35. Canadian Couch Potato: "Model portfolios"
36. Fool.ca: "How to build an ETF portfolio"
37. Wealthsimple: "How to buy ETFs in Canada"

**Wealth Building (5 articles):**
38. Investopedia: "Compound Interest Explained"
39. MoneySense: "Retirement planning in Canada"
40. Wealthsimple: "What is FIRE?"
41. GetSmarterAboutMoney: "Building wealth over time"
42. MoneySense: "How much do you need to retire in Canada?"

---

## 7. UI/UX Redesign - InsightsScreen

### 7.1 Screen Layout (Top to Bottom)

```
+----------------------------------------------+
| HEADER                                        |
| "AI Insights"  subtitle    [info] [refresh]   |
+----------------------------------------------+
| FINANCIAL HEALTH SCORE                        |
| [  Circular Progress  72  ]                   |
| "Good" | "Up 4 pts this month"               |
| [ Emergency | Debt | Credit | Cash | Savings ]|
+----------------------------------------------+
| INSIGHT TABS                                  |
| [ All (7) | High (2) | Medium (3) | Low (2) ]|
+----------------------------------------------+
| INSIGHT CARDS (scrollable)                    |
| +------------------------------------------+ |
| | [Priority Badge]           [Dismiss X]   | |
| | [Icon] Category                          | |
| |        Title                             | |
| | Description (collapsed: 2 lines)         | |
| | [Expand to see more v]                   | |
| |                                          | |
| | [Impact Meter: $2,400/yr =========>]     | |
| | [Take Action Button]                     | |
| +------------------------------------------+ |
+----------------------------------------------+
| INVESTMENT CORNER                             |
| "Based on your moderate risk profile"         |
| +--------+ +--------+ +--------+             |
| | XEQT   | | XGRO   | | ZAG    |            |
| | 12.5%↑ | | 10.8%↑ | | 3.2%↑  |            |
| | All Eq  | | Growth | | Bond   |            |
| +--------+ +--------+ +--------+             |
| [See all ETFs ->]                             |
+----------------------------------------------+
| WEALTH ACADEMY                                |
| "Recommended for you"  [View All ->]          |
| +------+ +------+ +------+                   |
| |Art 1 | |Art 2 | |Art 3 |                   |
| | img  | | img  | | img  |                   |
| |title | |title | |title |                   |
| |src   | |src   | |src   |                   |
| +------+ +------+ +------+                   |
+----------------------------------------------+
| DISCLAIMER                                    |
+----------------------------------------------+
```

### 7.2 Component Breakdown

**New components to create:**

1. **`FinancialHealthScore.js`** (`packages/mobile/src/components/FinancialHealthScore.js`)
   - Circular progress indicator using `react-native-svg` (already a dependency)
   - Color-coded: red (0-39), amber (40-59), yellow-green (60-74), green (75-89), gold (90-100)
   - Score number in center with grade letter
   - Trend indicator: "Up 4 pts" or "Down 2 pts" with arrow
   - Mini breakdown bar below: 5 small colored segments for each dimension
   - Tappable to show detailed breakdown modal

2. **`InsightTabBar.js`** (`packages/mobile/src/components/InsightTabBar.js`)
   - Horizontal tab bar: "All", "High Priority", "Medium", "Low"
   - Each tab shows count badge
   - Active tab: gold underline, white text
   - Inactive tab: muted text, no underline
   - Filters the insight list below

3. **`InsightCardV2.js`** (`packages/mobile/src/components/InsightCardV2.js`)
   - Expandable card (collapsed by default, tap to expand)
   - **Collapsed state**: Priority badge, category icon + category label, title, one-line description, impact meter bar
   - **Expanded state**: Full description, reasoning bullets, potential benefit card, action buttons, dismiss
   - Impact meter: horizontal gradient bar (red to green) showing annual savings relative to max insight savings
   - Subtle gradient border on high-priority cards (gold glow)
   - Smooth expand/collapse animation using `LayoutAnimation` or `Animated`

4. **`ImpactMeter.js`** (`packages/mobile/src/components/ImpactMeter.js`)
   - Horizontal bar showing potential annual savings
   - Label: "$2,400/yr potential savings"
   - Bar fill: percentage of max possible savings (capped at $5,000 for scale)
   - Gradient fill: gold to green
   - Compact: fits in collapsed card

5. **`InvestmentCorner.js`** (`packages/mobile/src/components/InvestmentCorner.js`)
   - Section header: "Investment Corner" with portfolio icon
   - Subtitle: "Based on your [risk_tolerance] profile"
   - Horizontal scroll of ETF mini-cards (3-5 visible)
   - Each mini-card: ticker, name, 1yr return with arrow (green up / red down), category chip, MER
   - Optional: mini sparkline (static SVG path representing approximate historical trend)
   - "Learn more" link on each card -> opens relevant Wealth Academy article
   - Footer: "See all ETFs" button -> navigates to new ETFListScreen
   - **Important**: Prominent disclaimer text: "Approximate historical data. Not investment advice."

6. **`ETFMiniCard.js`** (`packages/mobile/src/components/ETFMiniCard.js`)
   - Width: 160px, height: ~140px
   - Top: category color accent bar (2px)
   - Ticker in bold (XEQT), name below in smaller text
   - 1yr return: large green/red number with trend arrow
   - MER: "MER 0.20%"
   - Bottom: risk level chip ("Moderate")

7. **`ArticleCardV2.js`** (`packages/mobile/src/components/ArticleCardV2.js`)
   - Evolution of current ArticleCard
   - Cover image area with gradient overlay
   - Source logo (actual logos stored locally or source-initial avatar)
   - Category chip (colored)
   - Difficulty badge ("Beginner" / "Intermediate" / "Advanced")
   - "Recommended for you" ribbon on insight-linked articles
   - Bookmark icon with animation on toggle

### 7.3 New Screen: ETFListScreen

**New file**: `packages/mobile/src/screens/ETFListScreen.js`

Full-screen ETF browser:
- Filter tabs: All, Equity, Balanced, Fixed Income, Dividend, HISA
- Risk filter: Conservative / Moderate / Aggressive
- Sort: by 1yr return, MER, name
- Each ETF card: full detail card with all historical returns, geographic allocation pie chart (simplified), description
- "Where to buy" links to Wealthsimple/Questrade
- Prominent disclaimer at top and bottom

Add to `AppNavigator.js` as a stack screen (not a tab).

### 7.4 Theme Additions

**File**: `packages/mobile/src/constants/theme.js`

Add to COLORS:
```js
// Health Score colors
HEALTH_EXCELLENT: '#4CAF50',    // 90-100
HEALTH_GOOD: '#8BC34A',         // 75-89
HEALTH_FAIR: '#FFC107',         // 60-74
HEALTH_POOR: '#FF9800',         // 40-59
HEALTH_CRITICAL: '#F44336',     // 0-39

// Investment Corner
ETF_POSITIVE: '#4CAF50',
ETF_NEGATIVE: '#FF6B6B',

// Category accent colors (for insight types)
CAT_TAX: '#8B5CF6',
CAT_ETF: '#10B981',
CAT_DEBT: '#F59E0B',
CAT_SAVINGS: '#06B6D4',
CAT_SPENDING: '#FF6B6B',
CAT_CASHFLOW: '#3B82F6',
CAT_INVEST: '#22C55E',
CAT_MILESTONE: '#E5C048',
CAT_COMPARATIVE: '#EC4899',
CAT_OPPORTUNITY: '#F97316',
CAT_SEASONAL: '#14B8A6',
CAT_WEALTH: '#6366F1',

// Surface colors for cards
SURFACE_ELEVATED: '#111111',
SURFACE_OVERLAY: 'rgba(255, 255, 255, 0.05)',
```

---

## 8. API Changes

### 8.1 Modified Endpoints

**`GET /api/insights`** - Enhanced response:

```json
{
    "success": true,
    "data": {
        "insights": [ /* ... existing + new categories */ ],
        "health_score": {
            "score": 72,
            "grade": "B",
            "color": "#8BC34A",
            "breakdown": { /* ... */ },
            "trend": "improving",
            "previous_score": 68
        },
        "summary": "7 insights generated from your last 90 days of activity",
        "generated_at": "2026-04-15T10:00:00Z",
        "cache_expires_at": "2026-04-15T16:00:00Z",
        "is_cached": false,
        "ai_model_used": "gemini-2.0-pro",
        "generation_time_ms": 3200,
        "recommended_articles_count": 5
    }
}
```

Changes:
- Add `health_score` object to response
- Increase max insights from 5 to 7
- New `ai_model_used` value

### 8.2 New Endpoints

**`GET /api/insights/health-score`**
- Returns just the financial health score (faster than full insights generation)
- Can be called independently for the health score widget
- Uses cached score from last insights generation, or calculates fresh if stale
- Response: `{ success: true, data: { score, grade, color, breakdown, trend, previous_score } }`

**`GET /api/etfs`**
- Returns all ETFs from knowledge base
- Query params: `?risk_level=moderate`, `?category=all_equity`, `?search=XEQT`
- Response: `{ success: true, data: { etfs: [...], last_updated: "2026-04-01", disclaimer: "..." } }`
- No auth required? Or keep behind `authenticateToken` for consistency.

**`GET /api/etfs/:ticker`**
- Returns single ETF detail
- Response: full ETF object from knowledge base

**`GET /api/etfs/recommended`**
- Requires auth (needs user preferences)
- Returns 3-5 ETFs matched to user's risk profile
- Response: filtered ETF list based on `user_preferences.investment_risk_tolerance`

**`POST /api/educational/sync-curated`**
- Admin endpoint to sync curated articles from JSON to database
- Called on server startup automatically
- Response: `{ success: true, data: { synced: 42, new: 5, updated: 37 } }`

**`GET /api/educational/recommended`**
- Requires auth
- Returns articles linked to user's current insight types
- Response: articles sorted by relevance score, tagged with "Recommended for you"

### 8.3 New Route File

**New file**: `packages/backend/src/routes/etfs.js`

```js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const etfKnowledge = require('../services/etf_knowledge');

router.get('/', authenticateToken, async (req, res) => { /* ... */ });
router.get('/recommended', authenticateToken, async (req, res) => { /* ... */ });
router.get('/:ticker', authenticateToken, async (req, res) => { /* ... */ });

module.exports = router;
```

Register in `src/app.js`:
```js
app.use('/api/etfs', require('./routes/etfs'));
```

---

## 9. Database Schema Changes

### 9.1 New Migration: `db/add_insights_upgrade.sql`

```sql
-- AI Insights Upgrade Migration
-- Adds health score tracking, ETF interactions, and enhanced article support

-- 1. Add health score columns to user_insights
ALTER TABLE user_insights
    ADD COLUMN IF NOT EXISTS health_score INTEGER,
    ADD COLUMN IF NOT EXISTS health_score_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS health_score_trend VARCHAR(20);

-- 2. Add source_type to educational_articles
ALTER TABLE educational_articles
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'ai_generated',
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'beginner',
    ADD COLUMN IF NOT EXISTS url_status VARCHAR(20) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- Index for source_type filtering
CREATE INDEX IF NOT EXISTS idx_educational_articles_source_type
    ON educational_articles(source_type);

-- 3. ETF interaction tracking (for analytics)
CREATE TABLE IF NOT EXISTS etf_interactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    etf_ticker VARCHAR(10) NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,  -- 'viewed', 'clicked_buy_link', 'bookmarked'
    source VARCHAR(30),                     -- 'insight', 'investment_corner', 'etf_list'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etf_interactions_user ON etf_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_etf_interactions_ticker ON etf_interactions(etf_ticker);

-- 4. Health score history (for trend tracking)
CREATE TABLE IF NOT EXISTS health_score_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    grade VARCHAR(2) NOT NULL,
    breakdown JSONB NOT NULL,
    calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_score_user ON health_score_history(user_id, calculated_at);

-- 5. Add new preference columns
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS age_range VARCHAR(20),
    ADD COLUMN IF NOT EXISTS investment_experience VARCHAR(20) DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS annual_income_range VARCHAR(20);

-- Comments
COMMENT ON TABLE etf_interactions IS 'Tracks user interactions with ETF recommendations for analytics';
COMMENT ON TABLE health_score_history IS 'Historical financial health scores for trend analysis';
```

### 9.2 Schema Summary

**Modified tables:**
- `user_insights`: +3 columns (health_score, health_score_breakdown, health_score_trend)
- `educational_articles`: +4 columns (source_type, tags, difficulty, url_status, last_verified_at)
- `user_preferences`: +3 columns (age_range, investment_experience, annual_income_range)

**New tables:**
- `etf_interactions`: tracks user engagement with ETF content
- `health_score_history`: stores historical health scores for trend calculation

---

## 10. Implementation Phases

### Phase 1: Backend Foundation (Priority: HIGH, Est: 3-4 days)

**Goal**: Enhanced AI engine with ETF knowledge, no mobile changes yet.

Tasks:
1. Create `packages/backend/src/data/canadian_etfs.json` with 30 ETFs
2. Create `packages/backend/src/services/etf_knowledge.js` service
3. Create `packages/backend/src/services/health_score.js` service
4. Create `packages/backend/src/data/curated_articles.json` with 40 articles
5. Run DB migration `db/add_insights_upgrade.sql`
6. Modify `packages/backend/src/services/insight_data.js`:
   - Add `_getUserPreferences()` query
   - Add `_getSeasonalContext()` function
   - Include both in `getUserFinancialSummary()` return
7. Modify `packages/backend/src/services/ai_insights.js`:
   - Upgrade model to `gemini-2.0-pro` (env-configurable)
   - Expand `_buildPrompt()` with ETF data, preferences, seasonal context, Canadian averages
   - Add new insight categories to prompt
   - Increase `maxOutputTokens` to 8192
   - Update `_prioritizeInsights()` to return top 7
8. Modify `packages/backend/src/routes/insights.js`:
   - Calculate and include health_score in response
   - Save health_score to user_insights and health_score_history
9. Create `packages/backend/src/routes/etfs.js` and register in app.js
10. Modify `packages/backend/src/services/educational_content.js`:
    - Add `syncCuratedArticles()` function
    - Add `source_type` awareness to queries
    - Call sync on startup

**Testing**: Call `GET /api/insights?force_refresh=true` and verify new insight categories appear, health score is returned, ETF data is referenced in insights.

### Phase 2: Mobile UI Redesign (Priority: HIGH, Est: 4-5 days)

**Goal**: New InsightsScreen with all new components.

Tasks:
1. Create `FinancialHealthScore.js` component
2. Create `InsightTabBar.js` component
3. Create `InsightCardV2.js` component (expandable)
4. Create `ImpactMeter.js` component
5. Create `InvestmentCorner.js` component
6. Create `ETFMiniCard.js` component
7. Create `ArticleCardV2.js` component (enhanced)
8. Rewrite `InsightsScreen.js` with new layout
9. Update `packages/mobile/src/constants/theme.js` with new colors
10. Add `api.getETFs()`, `api.getRecommendedETFs()`, `api.getHealthScore()` to `api.js`
11. Create `ETFListScreen.js` and add to `AppNavigator.js`

**Testing**: Visual QA on iOS and Android simulators. Test all interactions: tab switching, card expansion, ETF card taps, article navigation, bookmark toggle.

### Phase 3: Polish & Analytics (Priority: MEDIUM, Est: 2-3 days)

Tasks:
1. Add ETF interaction tracking (tap events sent to `/api/insights/action`)
2. Add article URL health checking (background job)
3. Add "Recommended for you" logic linking current insights to articles
4. Add pull-to-refresh animation improvements
5. Add empty state for Investment Corner (when user has no risk profile set)
6. Add onboarding prompt for risk tolerance if not set (modal on first visit)
7. Performance optimization: lazy-load Investment Corner and Wealth Academy sections

### Phase 4: Advanced Features (Priority: LOW, Est: 2-3 days)

Tasks:
1. Health score trend chart (last 30 days of scores as a mini line graph)
2. Insight history: "Previously dismissed" section user can review
3. Push notification for new high-priority insights (when cache refreshes)
4. A/B testing framework for prompt variations (track which prompt version produces higher action rates)
5. Quarterly ETF data update script/process documentation

---

## 11. Risk Disclaimers & Compliance

### 11.1 Legal Disclaimers (Required)

Every screen/component that shows investment data must include:

**Insights Screen (bottom)**:
> "AI insights are for informational purposes only and do not constitute financial, investment, or tax advice. ETF data is approximate, updated quarterly, and may not reflect current market conditions. Past performance does not guarantee future results. Consult a qualified financial advisor before making investment decisions."

**Investment Corner (inline)**:
> "Approximate historical data. Not investment advice."

**ETF List Screen (top)**:
> "The ETF information below is for educational purposes only. Data is approximate and updated quarterly. IndusWealth does not sell, recommend, or endorse any specific investment product. Past performance does not guarantee future results."

**Individual ETF recommendations in insights**:
> Each ETF insight must contain a reasoning bullet: "Note: Returns shown are approximate historical averages and may not reflect current performance."

### 11.2 PIPEDA Compliance

- No additional PII is sent to Gemini in this upgrade
- ETF interaction data stays in our database (not sent to AI)
- Health score is calculated server-side from existing data
- User preferences are stored with existing privacy controls

### 11.3 Regulatory Notes

- IndusWealth is NOT a registered securities dealer. All ETF information is educational.
- We link to registered brokerages (Wealthsimple, Questrade) for actual purchases.
- No price quotes, no real-time data, no portfolio management features.
- The app does not execute trades or hold securities.

---

## Appendix A: File Change Summary

### New Files (10)
| File | Purpose |
|---|---|
| `packages/backend/src/data/canadian_etfs.json` | Static ETF knowledge base |
| `packages/backend/src/data/curated_articles.json` | Verified article repository |
| `packages/backend/src/services/etf_knowledge.js` | ETF data service |
| `packages/backend/src/services/health_score.js` | Financial health score calculator |
| `packages/backend/src/routes/etfs.js` | ETF API endpoints |
| `packages/backend/db/add_insights_upgrade.sql` | Database migration |
| `packages/mobile/src/components/FinancialHealthScore.js` | Health score widget |
| `packages/mobile/src/components/InsightTabBar.js` | Priority filter tabs |
| `packages/mobile/src/components/InsightCardV2.js` | Expandable insight card |
| `packages/mobile/src/components/ImpactMeter.js` | Savings impact bar |
| `packages/mobile/src/components/InvestmentCorner.js` | ETF recommendation section |
| `packages/mobile/src/components/ETFMiniCard.js` | Compact ETF display card |
| `packages/mobile/src/screens/ETFListScreen.js` | Full ETF browser screen |

### Modified Files (9)
| File | Changes |
|---|---|
| `packages/backend/src/services/ai_insights.js` | Model upgrade, expanded prompt, new categories |
| `packages/backend/src/services/insight_data.js` | Add preferences + seasonal context queries |
| `packages/backend/src/services/educational_content.js` | Add curated article sync, source_type filtering |
| `packages/backend/src/routes/insights.js` | Health score in response, save to history |
| `packages/backend/src/app.js` | Register ETF routes, curated article sync on startup |
| `packages/mobile/src/screens/InsightsScreen.js` | Complete rewrite with new layout |
| `packages/mobile/src/constants/theme.js` | New color tokens |
| `packages/mobile/src/services/api.js` | New API methods for ETFs, health score |
| `packages/mobile/src/navigation/AppNavigator.js` | Add ETFListScreen |

### Potentially Modified (1)
| File | Changes |
|---|---|
| `packages/mobile/src/components/ArticleCard.js` | Evolve to ArticleCardV2 or keep for backward compat |

---

## Appendix B: Environment Variable Changes

**New env vars for `packages/backend/.env`:**
```
GEMINI_MODEL=gemini-2.0-pro          # AI model (default: gemini-2.0-pro, fallback: gemini-2.0-flash)
ETF_DATA_PATH=./src/data/canadian_etfs.json   # Path to ETF knowledge base
CURATED_ARTICLES_PATH=./src/data/curated_articles.json  # Path to curated articles
HEALTH_SCORE_CACHE_HOURS=6            # How long to cache health scores (default: same as insights)
```

---

## Appendix C: Dependency Changes

**No new npm dependencies required.** All features are built with existing packages:
- `@google/generative-ai` (already installed) - Gemini API
- `react-native-svg` (already installed) - Health score circle, sparklines
- `@expo/vector-icons` (already installed) - New icons

**Optional (Phase 3+):**
- `react-native-reanimated` - If smoother card expand/collapse animations are needed beyond `LayoutAnimation`
