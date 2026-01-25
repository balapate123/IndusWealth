# AI-Powered Financial Insights System
**IndusWealth - Personal Finance Intelligence**

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Insight Categories & Examples](#insight-categories--examples)
4. [Technical Architecture](#technical-architecture)
5. [Cost Analysis & Optimization](#cost-analysis--optimization)
6. [Database Schema](#database-schema)
7. [API Specifications](#api-specifications)
8. [AI Prompt Engineering](#ai-prompt-engineering)
9. [Mobile UI/UX Design](#mobile-uiux-design)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Testing & Quality Assurance](#testing--quality-assurance)
12. [Future Enhancements](#future-enhancements)

---

## Executive Summary

The AI Insights System transforms IndusWealth from a basic financial tracking app into an **intelligent financial advisor** that proactively helps users optimize their finances. By analyzing transaction data, account balances, and spending patterns, the system generates personalized, actionable recommendations.

**Key Features:**
- 7 categories of financial insights (tax optimization, debt payoff, spending optimization, etc.)
- Cost-efficient AI implementation using Gemini Flash 2.0 (~$13/month for 1000 users)
- Cached insights with smart refresh logic (reduces API calls by 90%+)
- Actionable recommendations with ROI calculations
- Canadian financial product integration (TFSA, FHSA, RRSP)

**Expected User Impact:**
- Average savings potential: $2,000-5,000/year per user
- Debt payoff acceleration: 1-3 years faster
- Tax-advantaged savings increase: $3,000-8,000/year

---

## System Overview

### How It Works

```
User Opens Insights Screen
         ↓
Mobile App calls GET /api/insights
         ↓
Backend checks cache (user_insights table)
         ↓
   [Cache Hit]                    [Cache Miss]
       ↓                               ↓
Return cached JSON        Aggregate user financial data
                                       ↓
                          Send to AI (Gemini/Claude)
                                       ↓
                          Parse & validate JSON response
                                       ↓
                          Save to cache + return to app
         ↓
Mobile renders insight cards with actions
```

### Design Principles

1. **Privacy First**: All data processing happens server-side; AI never stores user data
2. **Cost Efficiency**: Aggressive caching, data aggregation, and smart refresh logic
3. **Actionable**: Every insight has a clear next step with ROI calculation
4. **Canadian Context**: All recommendations use Canadian financial products and tax rules
5. **Personalized**: Insights adapt based on user profile, goals, and financial situation

---

## Insight Categories & Examples

### 1. Tax-Advantaged Account Opportunities

**TFSA Optimization**
```json
{
  "id": "tfsa_001",
  "type": "tfsa_opportunity",
  "priority": "high",
  "title": "You have $2,340 ready for your TFSA",
  "description": "Based on your spending patterns, you consistently have $2,000+ sitting in checking. Consider moving $2,340 to a TFSA to earn tax-free growth.",
  "reasoning": [
    "Your average checking balance is $3,200",
    "Your monthly expenses average $1,500",
    "Recommended safety buffer: $800",
    "Available for TFSA: $2,340"
  ],
  "data_points": {
    "avg_checking_balance": 3200,
    "monthly_expenses_avg": 1500,
    "safety_buffer": 800,
    "transferable_amount": 2340
  },
  "action": {
    "primary": {
      "label": "Learn about TFSA",
      "type": "web_link",
      "url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html"
    },
    "secondary": {
      "label": "Set up automatic transfer",
      "type": "feature_placeholder",
      "note": "Future: integrate with bank transfer API"
    }
  },
  "potential_benefit": {
    "annual_earnings": 117,
    "calculation": "$2,340 × 5% interest = $117/year tax-free",
    "five_year_projection": 635
  },
  "dismissible": true,
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**FHSA Recommendation**
```json
{
  "id": "fhsa_001",
  "type": "fhsa_recommendation",
  "priority": "high",
  "title": "First-time homebuyer? Unlock $8,000 in tax deductions",
  "description": "You're saving consistently ($650/month). If you're planning to buy a home, an FHSA gives you tax deductions + tax-free growth.",
  "reasoning": [
    "You've saved $650/month consistently for 6 months",
    "FHSA annual contribution limit: $8,000",
    "Estimated tax refund: $2,400 (at 30% marginal tax rate)",
    "Lifetime contribution limit: $40,000"
  ],
  "data_points": {
    "avg_monthly_savings": 650,
    "fhsa_annual_limit": 8000,
    "fhsa_lifetime_limit": 40000,
    "estimated_tax_bracket": 30,
    "potential_refund": 2400
  },
  "qualification_check": {
    "question": "Are you a first-time homebuyer planning to purchase in the next 15 years?",
    "action": "user_confirmation_required"
  },
  "action": {
    "primary": {
      "label": "Check FHSA eligibility",
      "type": "web_link",
      "url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html"
    },
    "secondary": {
      "label": "Compare FHSA vs TFSA",
      "type": "in_app_comparison"
    }
  },
  "potential_benefit": {
    "tax_deduction_year_1": 2400,
    "tax_free_growth": "Yes",
    "withdrawal_tax": "None (for first home purchase)"
  },
  "dismissible": true,
  "dismiss_options": ["not_first_time_buyer", "not_interested", "remind_later"],
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**RRSP Contribution Strategy**
```json
{
  "id": "rrsp_001",
  "type": "rrsp_tax_optimization",
  "priority": "medium",
  "title": "Contribute $5,000 to RRSP by March 1 for $1,500 tax refund",
  "description": "The RRSP deadline is March 1, 2026. Contributing $5,000 could reduce your 2025 tax bill by ~$1,500.",
  "reasoning": [
    "Your estimated income: $42,000/year",
    "Marginal tax rate: ~30%",
    "RRSP contribution room: $18,500",
    "Recommended contribution: $5,000",
    "Expected refund: $1,500"
  ],
  "data_points": {
    "estimated_annual_income": 42000,
    "marginal_tax_rate": 30,
    "rrsp_room_available": 18500,
    "recommended_contribution": 5000,
    "expected_refund": 1500
  },
  "action": {
    "primary": {
      "label": "Set up RRSP contribution",
      "type": "external_link"
    },
    "secondary": {
      "label": "Calculate my exact refund",
      "type": "web_link",
      "url": "https://www.wealthsimple.com/en-ca/tool/tax-calculator"
    }
  },
  "urgency": {
    "deadline": "2026-03-01",
    "days_remaining": 35
  },
  "potential_benefit": {
    "immediate_refund": 1500,
    "long_term_growth": "Tax-deferred until retirement",
    "note": "Refund can be re-invested in TFSA for tax-free growth"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 2. Spending Optimization Insights

**Subscription Audit**
```json
{
  "id": "sub_001",
  "type": "subscription_audit",
  "priority": "medium",
  "title": "You're paying for 7 subscriptions - save $89/month",
  "description": "We detected 7 recurring subscriptions totaling $247/month. Canceling unused ones could free up $89/month ($1,068/year).",
  "reasoning": [
    "Total subscriptions: 7",
    "Monthly cost: $247",
    "Unused subscriptions: 3 (no activity in 60+ days)",
    "Low-usage subscriptions: 1 (used 2x in 90 days)"
  ],
  "subscriptions": [
    {
      "name": "Netflix",
      "amount": 16.99,
      "frequency": "monthly",
      "last_charge": "2026-01-15",
      "usage": "active",
      "last_activity": "2026-01-24",
      "suggestion": "keep",
      "reason": "Used 23 times in last 30 days"
    },
    {
      "name": "Spotify",
      "amount": 10.99,
      "frequency": "monthly",
      "last_charge": "2026-01-10",
      "usage": "active",
      "last_activity": "2026-01-25",
      "suggestion": "keep",
      "reason": "Daily usage detected"
    },
    {
      "name": "LA Fitness Gym Membership",
      "amount": 65.00,
      "frequency": "monthly",
      "last_charge": "2026-01-03",
      "usage": "unused",
      "last_activity": "2025-11-20",
      "suggestion": "cancel",
      "reason": "No gym check-ins detected in 66 days",
      "annual_savings": 780
    },
    {
      "name": "Adobe Creative Cloud",
      "amount": 54.99,
      "frequency": "monthly",
      "last_charge": "2026-01-18",
      "usage": "low",
      "last_activity": "2026-01-12",
      "suggestion": "downgrade",
      "reason": "Used 2x in 90 days - consider Photoshop-only plan ($14.99)",
      "potential_savings": 40.00,
      "annual_savings": 480
    },
    {
      "name": "NYTimes Digital",
      "amount": 17.00,
      "frequency": "monthly",
      "last_charge": "2026-01-08",
      "usage": "unused",
      "last_activity": "2025-10-15",
      "suggestion": "cancel",
      "reason": "No logins detected in 102 days",
      "annual_savings": 204
    },
    {
      "name": "Audible",
      "amount": 14.95,
      "frequency": "monthly",
      "last_charge": "2026-01-22",
      "usage": "low",
      "last_activity": "2026-01-05",
      "suggestion": "pause",
      "reason": "1 book in 90 days - pause membership between books",
      "potential_savings": 14.95,
      "annual_savings": 84
    },
    {
      "name": "Xbox Game Pass",
      "amount": 11.99,
      "frequency": "monthly",
      "last_charge": "2026-01-20",
      "usage": "active",
      "last_activity": "2026-01-23",
      "suggestion": "keep",
      "reason": "Played 15 hours this month"
    }
  ],
  "summary": {
    "total_monthly": 247.91,
    "keep": 3,
    "cancel": 2,
    "downgrade_or_pause": 2,
    "potential_monthly_savings": 89.00,
    "potential_annual_savings": 1068.00
  },
  "action": {
    "primary": {
      "label": "Review all subscriptions",
      "type": "navigate",
      "route": "SubscriptionManager"
    },
    "secondary": {
      "label": "Cancel suggested subscriptions",
      "type": "multi_action",
      "actions": ["cancel_gym", "cancel_nytimes", "downgrade_adobe"]
    }
  },
  "potential_benefit": {
    "monthly_savings": 89,
    "annual_savings": 1068,
    "investment_potential": "$1,068/year in TFSA @ 5% = $5,714 after 5 years"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Dining Out Optimization**
```json
{
  "id": "dining_001",
  "type": "dining_optimization",
  "priority": "medium",
  "title": "Cut dining out by 30% → save $185/month",
  "description": "You spent $615 on dining in January (up 45% from December). Reducing to $430/month (still above average) frees up $185/month.",
  "reasoning": [
    "January dining: $615 (43 transactions)",
    "December dining: $424 (29 transactions)",
    "Increase: +45%",
    "Average per meal: $14.30",
    "Suggested reduction: 13 meals/month → cook at home",
    "Your grocery spending is low ($320/month) - room to cook more"
  ],
  "data_points": {
    "current_month_dining": 615,
    "previous_month_dining": 424,
    "percent_change": 45,
    "transaction_count": 43,
    "avg_per_transaction": 14.30,
    "suggested_target": 430,
    "monthly_savings": 185,
    "current_grocery_spend": 320
  },
  "breakdown": {
    "top_merchants": [
      {"name": "Starbucks", "count": 12, "total": 87.50},
      {"name": "McDonald's", "count": 8, "total": 76.20},
      {"name": "Chipotle", "count": 5, "total": 68.75},
      {"name": "The Keg Steakhouse", "count": 2, "total": 145.00},
      {"name": "Sushi King", "count": 3, "total": 89.25}
    ],
    "meal_type": {
      "breakfast_coffee": 187.50,
      "lunch": 245.00,
      "dinner": 182.50
    }
  },
  "suggestions": {
    "quick_wins": [
      "Make coffee at home - save $60/month (vs Starbucks)",
      "Meal prep lunches on Sunday - save $80/month",
      "Keep dining out for special occasions (2x/week max)"
    ],
    "realistic_target": "$430/month (15 meals out instead of 28)"
  },
  "action": {
    "primary": {
      "label": "See all dining expenses",
      "type": "navigate",
      "route": "AccountTransactions",
      "params": {"category": "dining"}
    },
    "secondary": {
      "label": "Set dining budget alert",
      "type": "create_budget",
      "category": "dining",
      "amount": 430
    }
  },
  "potential_benefit": {
    "monthly_savings": 185,
    "annual_savings": 2220,
    "investment_potential": "$185/month in TFSA @ 5% = $11,865 after 5 years"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Grocery Optimization (Impulse Spending)**
```json
{
  "id": "grocery_001",
  "type": "impulse_spending_alert",
  "priority": "low",
  "title": "Reduce impulse buys at grocery stores - save $45/month",
  "description": "You make 3.2 grocery trips per week (above 2.5 average). Extra trips often lead to impulse purchases. Plan weekly shopping to save $45/month.",
  "reasoning": [
    "Average trips per week: 3.2",
    "Recommended: 1-2 planned trips per week",
    "Small transactions (<$20): 8 in January",
    "These small trips add up: $180/month",
    "Impulse items identified: chips, candy, drinks"
  ],
  "data_points": {
    "trips_per_week": 3.2,
    "small_transaction_count": 8,
    "small_transaction_total": 180,
    "estimated_impulse_spend": 45
  },
  "action": {
    "primary": {
      "label": "Create grocery list template",
      "type": "external_resource"
    }
  },
  "potential_benefit": {
    "monthly_savings": 45,
    "annual_savings": 540
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 3. Debt Payoff Acceleration

**Avalanche Method Recommendation**
```json
{
  "id": "debt_001",
  "type": "debt_payoff_strategy",
  "priority": "high",
  "title": "Pay off Visa 2 years faster with avalanche method",
  "description": "You have $420/month in discretionary spending. Redirecting $200/month to your Visa ($5,200 @ 19.99% APR) saves $1,847 in interest.",
  "reasoning": [
    "Current debt: $5,200 on Visa (19.99% APR)",
    "Minimum payment: $156/month",
    "Discretionary spending identified: $420/month",
    "Suggested extra payment: $200/month",
    "Total payment: $356/month"
  ],
  "current_plan": {
    "method": "minimum_payments_only",
    "monthly_payment": 156,
    "payoff_date": "2029-03-15",
    "total_paid": 7540,
    "total_interest": 2340,
    "months_to_payoff": 38
  },
  "recommended_plan": {
    "method": "avalanche + $200 extra",
    "monthly_payment": 356,
    "payoff_date": "2027-01-10",
    "total_paid": 5693,
    "total_interest": 493,
    "months_to_payoff": 16,
    "time_saved_months": 22,
    "interest_saved": 1847
  },
  "data_points": {
    "current_balance": 5200,
    "apr": 19.99,
    "minimum_payment": 156,
    "recommended_extra": 200,
    "discretionary_budget": 420
  },
  "action": {
    "primary": {
      "label": "Set up $356 automatic payment",
      "type": "feature_placeholder"
    },
    "secondary": {
      "label": "See full debt payoff calculator",
      "type": "navigate",
      "route": "DebtPayoffCalculator"
    }
  },
  "potential_benefit": {
    "interest_saved": 1847,
    "time_saved": "22 months (almost 2 years)",
    "debt_free_date": "January 2027 instead of March 2029"
  },
  "motivation": {
    "quote": "Being debt-free 22 months earlier means you can start investing $356/month sooner",
    "future_value": "$356/month invested @ 7% for remaining 22 months = $8,400"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Balance Transfer Opportunity**
```json
{
  "id": "debt_002",
  "type": "balance_transfer_opportunity",
  "priority": "high",
  "title": "Save $1,200 in interest with a balance transfer card",
  "description": "Your credit score (742) qualifies you for 0% APR balance transfer cards. Transfer your $5,200 Visa balance and save $1,200 in interest over 18 months.",
  "reasoning": [
    "Current Visa balance: $5,200 @ 19.99% APR",
    "Monthly interest cost: ~$86",
    "Your credit score: 742 (Good)",
    "Qualify for 0% APR balance transfer offers",
    "Typical offer: 0% APR for 18 months, 3% transfer fee"
  ],
  "current_cost": {
    "balance": 5200,
    "apr": 19.99,
    "monthly_interest": 86.58,
    "interest_over_18_months": 1558
  },
  "opportunity": {
    "product_type": "0% APR Balance Transfer Card",
    "intro_period": "18 months",
    "transfer_fee_percent": 3,
    "transfer_fee_amount": 156,
    "monthly_interest": 0,
    "total_interest_18_months": 0,
    "net_savings": 1402
  },
  "calculation": {
    "current_path_interest": 1558,
    "balance_transfer_fee": 156,
    "savings": 1402
  },
  "requirements": {
    "credit_score_minimum": 670,
    "user_credit_score": 742,
    "qualifies": true
  },
  "action": {
    "primary": {
      "label": "See balance transfer offers",
      "type": "web_link",
      "url": "https://www.nerdwallet.com/ca/credit-cards/balance-transfer"
    },
    "secondary": {
      "label": "Calculate exact savings",
      "type": "navigate",
      "route": "BalanceTransferCalculator"
    }
  },
  "potential_benefit": {
    "interest_saved": 1402,
    "monthly_savings": 86.58,
    "note": "Pay off balance during 0% period to maximize savings"
  },
  "warnings": [
    "Must pay off balance before 18-month intro period ends",
    "Avoid new purchases on transfer card (focus on payoff)",
    "Recommended monthly payment: $305 to clear in 17 months"
  ],
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Debt Consolidation Loan**
```json
{
  "id": "debt_003",
  "type": "debt_consolidation",
  "priority": "medium",
  "title": "Consolidate 3 debts into one loan - save $95/month",
  "description": "You're juggling 3 credit accounts with different due dates and rates. A consolidation loan at 8.99% saves $95/month and simplifies payments.",
  "reasoning": [
    "Current debts: 3 accounts totaling $12,400",
    "Weighted average APR: 17.2%",
    "Total monthly payments: $485",
    "Consolidation loan APR: 8.99%",
    "New monthly payment: $390",
    "Savings: $95/month"
  ],
  "current_debts": [
    {
      "account": "Visa",
      "balance": 5200,
      "apr": 19.99,
      "monthly_payment": 156
    },
    {
      "account": "Mastercard",
      "balance": 4800,
      "apr": 18.99,
      "monthly_payment": 192
    },
    {
      "account": "Store Card (Best Buy)",
      "balance": 2400,
      "apr": 27.99,
      "monthly_payment": 137
    }
  ],
  "consolidation_offer": {
    "total_balance": 12400,
    "loan_apr": 8.99,
    "loan_term_months": 36,
    "monthly_payment": 390,
    "total_interest": 1640
  },
  "comparison": {
    "current_monthly": 485,
    "consolidation_monthly": 390,
    "monthly_savings": 95,
    "current_total_interest": 4280,
    "consolidation_total_interest": 1640,
    "total_interest_savings": 2640
  },
  "action": {
    "primary": {
      "label": "Check consolidation loan rates",
      "type": "web_link",
      "url": "https://loans.ca/debt-consolidation"
    },
    "secondary": {
      "label": "See full comparison",
      "type": "navigate",
      "route": "DebtConsolidationComparison"
    }
  },
  "potential_benefit": {
    "monthly_savings": 95,
    "total_interest_savings": 2640,
    "simplification": "One payment instead of 3 different due dates"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 4. Savings Acceleration Insights

**Found Money**
```json
{
  "id": "savings_001",
  "type": "found_money",
  "priority": "medium",
  "title": "You spent $280 less this month - don't let it disappear!",
  "description": "Your spending dropped from $2,150 (Dec) to $1,870 (Jan). Move the $280 difference to savings before lifestyle inflation eats it.",
  "reasoning": [
    "December spending: $2,150",
    "January spending: $1,870",
    "Savings opportunity: $280",
    "Monthly income: $3,500 (consistent)",
    "Current savings rate: 12%",
    "Potential savings rate with $280: 20%"
  ],
  "data_points": {
    "previous_month_spend": 2150,
    "current_month_spend": 1870,
    "difference": 280,
    "monthly_income": 3500,
    "current_savings_rate": 12,
    "potential_savings_rate": 20
  },
  "action": {
    "primary": {
      "label": "Transfer $280 to TFSA now",
      "type": "transfer_money",
      "amount": 280,
      "from": "checking",
      "to": "tfsa"
    },
    "secondary": {
      "label": "Set up automatic savings rule",
      "type": "create_automation",
      "rule": "transfer_surplus_monthly"
    }
  },
  "potential_benefit": {
    "one_time_save": 280,
    "if_monthly_habit": "Saving $280/month @ 5% = $3,528 after 1 year, $17,850 after 5 years"
  },
  "behavioral_note": "Research shows people who immediately save windfalls are 3x more likely to maintain higher savings rates",
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Emergency Fund Progress**
```json
{
  "id": "savings_002",
  "type": "emergency_fund_status",
  "priority": "high",
  "title": "You're 62% to a full emergency fund - almost there!",
  "description": "You have $2,800 saved. Financial experts recommend $4,500 (3 months of expenses) for full security. You're only $1,700 away from this major milestone.",
  "reasoning": [
    "Current emergency fund: $2,800",
    "Monthly expenses average: $1,500",
    "Recommended fund: 3 months × $1,500 = $4,500",
    "Remaining to goal: $1,700",
    "Current coverage: 1.87 months"
  ],
  "current_status": {
    "saved": 2800,
    "target": 4500,
    "remaining": 1700,
    "progress_percent": 62,
    "months_covered": 1.87,
    "status": "partial_protection"
  },
  "recommendation": {
    "monthly_contribution": 200,
    "months_to_goal": 8.5,
    "completion_date": "2026-09-30",
    "timeline": "8.5 months away"
  },
  "milestones": [
    {
      "amount": 1500,
      "label": "1 month covered",
      "achieved": true,
      "date": "2025-09-15"
    },
    {
      "amount": 3000,
      "label": "2 months covered",
      "achieved": false,
      "projected_date": "2026-02-28"
    },
    {
      "amount": 4500,
      "label": "3 months covered (GOAL)",
      "achieved": false,
      "projected_date": "2026-09-30"
    }
  ],
  "action": {
    "primary": {
      "label": "Set up $200/month auto-save",
      "type": "create_recurring_transfer",
      "amount": 200,
      "frequency": "monthly",
      "from": "checking",
      "to": "emergency_fund"
    },
    "secondary": {
      "label": "Adjust emergency fund goal",
      "type": "update_goal",
      "current": 4500
    }
  },
  "potential_benefit": {
    "financial_security": "Full 3-month buffer against job loss or emergencies",
    "peace_of_mind": "92% of people with 3-month emergency funds report lower financial stress"
  },
  "importance": "Emergency fund is the foundation of financial security. Complete this before aggressive investing.",
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Automatic Savings Rule**
```json
{
  "id": "savings_003",
  "type": "automation_suggestion",
  "priority": "medium",
  "title": "Automate your savings - save $500/month effortlessly",
  "description": "You manually save inconsistently. Set up automatic transfers the day after payday to save $500/month without thinking about it.",
  "reasoning": [
    "Current savings: Manual and inconsistent",
    "Some months: $800 saved",
    "Some months: $50 saved",
    "Average: $320/month",
    "Your income supports $500/month savings",
    "Automation increases savings success rate by 73%"
  ],
  "data_points": {
    "current_avg_monthly_savings": 320,
    "recommended_automatic_amount": 500,
    "payday": "15th of each month",
    "suggested_transfer_date": "16th of each month"
  },
  "action": {
    "primary": {
      "label": "Set up automatic $500 transfer",
      "type": "create_recurring_transfer",
      "amount": 500,
      "day_of_month": 16,
      "from": "checking",
      "to": "tfsa"
    }
  },
  "potential_benefit": {
    "annual_savings": 6000,
    "vs_current": "Increase from $3,840 to $6,000/year (+56%)",
    "five_year_projection": "$500/month @ 5% = $33,900 after 5 years"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 5. Cash Flow Optimization

**Credit Utilization Warning**
```json
{
  "id": "credit_001",
  "type": "credit_utilization_warning",
  "priority": "high",
  "title": "Your credit score is at risk - 78% utilization",
  "description": "Your Visa is at $3,900 of $5,000 limit (78%). Credit utilization above 30% can drop your score by 50+ points. Pay down $2,400 to reach the safe zone.",
  "reasoning": [
    "Credit utilization formula: (Balance / Limit) × 100",
    "Your utilization: ($3,900 / $5,000) = 78%",
    "Recommended maximum: 30%",
    "Target balance: $1,500",
    "Required paydown: $2,400"
  ],
  "current_state": {
    "total_credit_limit": 5000,
    "current_balance": 3900,
    "utilization_percent": 78,
    "status": "high_risk",
    "score_impact": "Negative (estimated -50 to -80 points)"
  },
  "recommendation": {
    "pay_down_amount": 2400,
    "target_balance": 1500,
    "target_utilization": 30,
    "expected_score_improvement": "+20 to +40 points within 60 days"
  },
  "severity_levels": [
    {"range": "0-30%", "status": "Excellent", "color": "green"},
    {"range": "31-49%", "status": "Good", "color": "yellow"},
    {"range": "50-69%", "status": "Fair - Score impact", "color": "orange"},
    {"range": "70-100%", "status": "Poor - Major score damage", "color": "red"}
  ],
  "your_level": "70-100% (Poor)",
  "action": {
    "primary": {
      "label": "Make $2,400 payment now",
      "type": "transfer_money",
      "amount": 2400,
      "from": "checking",
      "to": "visa"
    },
    "secondary": {
      "label": "Learn about credit utilization",
      "type": "web_link",
      "url": "https://www.creditkarma.ca/advice/i/credit-utilization-rate"
    }
  },
  "potential_benefit": {
    "score_improvement": "+20 to +40 points",
    "timeline": "Typically reflects in 30-60 days",
    "long_term": "Better credit = lower interest rates on future loans (mortgage, car, etc.)"
  },
  "urgency": "High - Credit utilization is 30% of your credit score calculation",
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Bill Timing Optimization**
```json
{
  "id": "cashflow_001",
  "type": "bill_timing_optimization",
  "priority": "low",
  "title": "Move your credit card due date to avoid low balances",
  "description": "Your Visa payment ($350) is due on the 3rd, but your paycheck arrives on the 5th. This creates stress and risk of late payment. Change the due date to the 10th.",
  "reasoning": [
    "Current due date: 3rd of each month",
    "Paycheck date: 5th of each month",
    "Average checking balance on 3rd: $180",
    "Payment amount: $350",
    "Result: Overdraft risk or delayed payment"
  ],
  "current_issue": {
    "payment_due_date": "3rd",
    "paycheck_date": "5th",
    "avg_balance_on_due_date": 180,
    "payment_amount": 350,
    "risk": "Insufficient funds or overdraft fees ($48/occurrence)"
  },
  "recommendation": {
    "new_due_date": "10th of each month",
    "days_after_paycheck": 5,
    "expected_balance_on_new_date": 2800,
    "benefit": "Always have $2,000+ cushion"
  },
  "action": {
    "primary": {
      "label": "Contact Visa to change due date",
      "type": "external_action",
      "instructions": "Call the number on back of your card or use mobile app settings"
    }
  },
  "potential_benefit": {
    "stress_reduction": "High",
    "overdraft_risk": "Eliminated",
    "late_payment_risk": "Eliminated ($35 late fee avoidance)"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Paycheck Allocation Strategy**
```json
{
  "id": "cashflow_002",
  "type": "paycheck_allocation",
  "priority": "medium",
  "title": "Optimize your paycheck with the 50/30/20 rule",
  "description": "Your current split: 65% needs, 30% wants, 5% savings. Financial experts recommend 50/30/20. Rebalance to save $525 more per month.",
  "reasoning": [
    "Monthly income: $3,500",
    "Current allocation: 65/30/5 (unbalanced)",
    "Recommended: 50/30/20 rule",
    "Needs: Rent, utilities, groceries, insurance",
    "Wants: Dining, entertainment, subscriptions",
    "Savings: Emergency fund, TFSA, debt payoff"
  ],
  "current_allocation": {
    "monthly_income": 3500,
    "needs": {
      "percent": 65,
      "amount": 2275,
      "categories": ["Rent", "Utilities", "Groceries", "Insurance", "Transportation"]
    },
    "wants": {
      "percent": 30,
      "amount": 1050,
      "categories": ["Dining", "Entertainment", "Subscriptions", "Shopping"]
    },
    "savings": {
      "percent": 5,
      "amount": 175,
      "categories": ["Emergency fund", "TFSA"]
    }
  },
  "recommended_allocation": {
    "needs": {
      "percent": 50,
      "amount": 1750,
      "change": -525,
      "optimization": "Review insurance, reduce utilities, shop smarter for groceries"
    },
    "wants": {
      "percent": 30,
      "amount": 1050,
      "change": 0,
      "note": "Already balanced"
    },
    "savings": {
      "percent": 20,
      "amount": 700,
      "change": +525,
      "allocation": "$300 emergency fund, $200 TFSA, $200 debt payoff"
    }
  },
  "action": {
    "primary": {
      "label": "Create 50/30/20 budget",
      "type": "navigate",
      "route": "BudgetPlanner"
    },
    "secondary": {
      "label": "Learn about 50/30/20 rule",
      "type": "web_link",
      "url": "https://www.nerdwallet.com/article/finance/nerdwallet-budget-calculator"
    }
  },
  "potential_benefit": {
    "monthly_increase": 525,
    "annual_increase": 6300,
    "five_year_projection": "$525/month savings @ 5% = $35,700 after 5 years"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 6. Investment Readiness

**Investment Ready**
```json
{
  "id": "invest_001",
  "type": "investment_ready",
  "priority": "medium",
  "title": "You're ready to start investing!",
  "description": "Financial checklist complete: Emergency fund ✓, High-interest debt paid ✓, TFSA room available ✓. Time to grow your wealth with $500/month in ETFs.",
  "reasoning": [
    "Emergency fund: $5,200 (3.5 months) ✓",
    "High-interest debt (>10% APR): $0 ✓",
    "TFSA contribution room: $18,000 available ✓",
    "Stable income: 6 months consistent ✓",
    "Monthly surplus: $650 available for investing"
  ],
  "readiness_checklist": {
    "emergency_fund": {
      "status": "complete",
      "requirement": "3 months minimum",
      "current": "$5,200 (3.5 months coverage)",
      "check": true
    },
    "high_interest_debt": {
      "status": "complete",
      "requirement": "No debt above 10% APR",
      "current": "$0",
      "check": true
    },
    "tfsa_room": {
      "status": "available",
      "requirement": "Contribution room available",
      "current": "$18,000 remaining",
      "check": true
    },
    "stable_income": {
      "status": "complete",
      "requirement": "Consistent for 3+ months",
      "current": "6 months at $3,500/month",
      "check": true
    },
    "monthly_surplus": {
      "status": "complete",
      "requirement": "$200+ available monthly",
      "current": "$650/month average surplus",
      "check": true
    }
  },
  "recommendation": {
    "starting_amount": 500,
    "frequency": "monthly",
    "account_type": "TFSA",
    "investment_type": "Low-cost ETF portfolio",
    "suggested_allocation": {
      "canadian_equity": 30,
      "us_equity": 40,
      "international_equity": 20,
      "bonds": 10
    },
    "risk_level": "moderate",
    "example_etfs": [
      "VGRO (Vanguard Growth ETF Portfolio) - All-in-one balanced",
      "VCN (Canadian stocks) + VUN (US stocks) + XEF (International)"
    ]
  },
  "action": {
    "primary": {
      "label": "Learn about ETF investing",
      "type": "web_link",
      "url": "https://www.canadianportfoliomanagerblog.com/model-etf-portfolios/"
    },
    "secondary": {
      "label": "Compare investment platforms",
      "type": "web_link",
      "url": "https://www.moneysense.ca/save/investing/best-online-brokers-in-canada/"
    }
  },
  "potential_benefit": {
    "monthly_investment": 500,
    "annual_contribution": 6000,
    "ten_year_projection": "$500/month @ 7% average return = $86,700",
    "twenty_year_projection": "$500/month @ 7% average return = $260,000"
  },
  "education": {
    "why_etfs": "Lower fees than mutual funds (0.2% vs 2%+), instant diversification",
    "why_tfsa": "All growth is tax-free forever",
    "dollar_cost_averaging": "Investing monthly reduces timing risk"
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Investment Platform Comparison**
```json
{
  "id": "invest_002",
  "type": "platform_recommendation",
  "priority": "low",
  "title": "Best investment platform for your needs: Wealthsimple",
  "description": "Based on your investing goals ($500/month in ETFs), Wealthsimple offers no trading fees on Canadian stocks/ETFs and an easy mobile experience.",
  "reasoning": [
    "Investment amount: $500/month",
    "Experience level: Beginner",
    "Investment type: ETFs (not individual stocks)",
    "Device preference: Mobile-first",
    "Fee sensitivity: High"
  ],
  "comparison": [
    {
      "platform": "Wealthsimple Trade",
      "pros": [
        "No fees on Canadian stocks/ETFs",
        "Beautiful mobile app",
        "Fractional shares available",
        "Great for beginners"
      ],
      "cons": [
        "1.5% fee on USD conversions",
        "Limited research tools"
      ],
      "best_for": "Canadian ETF investors",
      "score": 95
    },
    {
      "platform": "Questrade",
      "pros": [
        "Free ETF purchases",
        "$4.95-$9.95 stock trades",
        "Advanced tools available",
        "Norbert's Gambit for USD conversion"
      ],
      "cons": [
        "Interface less intuitive",
        "Small fee to sell ETFs"
      ],
      "best_for": "Cost-conscious active traders",
      "score": 85
    },
    {
      "platform": "TD Direct Investing",
      "pros": [
        "Full TD bank integration",
        "Strong research tools",
        "Good customer service"
      ],
      "cons": [
        "$9.99 per trade (ETFs and stocks)",
        "High fees for small accounts"
      ],
      "best_for": "Existing TD customers with $15k+",
      "score": 60
    }
  ],
  "recommendation": "Wealthsimple Trade",
  "action": {
    "primary": {
      "label": "Open Wealthsimple TFSA account",
      "type": "web_link",
      "url": "https://www.wealthsimple.com/en-ca/product/trade"
    }
  },
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

### 7. Financial Milestone Celebrations

**Milestone Achieved**
```json
{
  "id": "milestone_001",
  "type": "milestone_achieved",
  "priority": "low",
  "title": "🎉 Congratulations! You paid off your car loan!",
  "description": "Final payment of $380 cleared on Jan 18th. You've eliminated $18,240 in debt and freed up $380/month. Let's put that money to work!",
  "achievement": {
    "milestone_type": "debt_eliminated",
    "debt_name": "Honda Civic Car Loan",
    "total_principal_paid": 16500,
    "total_interest_paid": 1740,
    "total_paid": 18240,
    "monthly_payment_freed": 380,
    "start_date": "2021-03-15",
    "payoff_date": "2026-01-18",
    "duration_months": 58
  },
  "celebration": {
    "message": "You're now debt-free on this account! That's $380/month back in your pocket.",
    "emoji": "🎉🚗💰"
  },
  "next_steps": {
    "question": "What should we do with your freed-up $380/month?",
    "options": [
      {
        "option": "Aggressive debt payoff",
        "description": "Add $380 to Visa payment → debt-free 3 years faster",
        "monthly_action": "$380 extra to credit card",
        "outcome": "Visa paid off by June 2027 (instead of March 2029)",
        "total_interest_saved": 1847,
        "score": 95
      },
      {
        "option": "Start investing",
        "description": "Invest $380/month in TFSA → build wealth",
        "monthly_action": "$380 to VGRO ETF in TFSA",
        "outcome": "$23,500 after 5 years @ 7% return",
        "long_term_value": "$380/month for 20 years = $197,000",
        "score": 85
      },
      {
        "option": "Balanced approach",
        "description": "Split: $200 debt payoff + $180 investing",
        "monthly_action": "$200 to Visa, $180 to TFSA",
        "outcome": "Debt-free by Jan 2028 + $11,200 invested after 5 years",
        "score": 90
      },
      {
        "option": "Boost emergency fund",
        "description": "Build 6-month emergency fund (currently at 3.5 months)",
        "monthly_action": "$380 to high-interest savings",
        "outcome": "6-month fund complete in 4 months",
        "then": "Then redirect to investing or debt",
        "score": 70
      }
    ],
    "recommended": "Balanced approach"
  },
  "action": {
    "primary": {
      "label": "Choose your next money goal",
      "type": "user_decision",
      "options": ["debt", "invest", "balanced", "emergency"]
    }
  },
  "motivation": "You eliminated a major debt! Redirect this payment to keep the momentum going. Don't let lifestyle inflation steal your progress.",
  "generated_at": "2026-01-25T10:30:00Z"
}
```

**Net Worth Milestone**
```json
{
  "id": "milestone_002",
  "type": "net_worth_milestone",
  "priority": "low",
  "title": "🎯 You crossed $10,000 net worth!",
  "description": "Your net worth is now $10,240! That's assets ($15,440) minus debts ($5,200). You've grown your wealth by $4,200 in the last 6 months.",
  "achievement": {
    "milestone_type": "net_worth_threshold",
    "current_net_worth": 10240,
    "threshold_crossed": 10000,
    "previous_net_worth_6mo_ago": 6040,
    "growth_6_months": 4200,
    "growth_percent": 69.5
  },
  "breakdown": {
    "assets": {
      "checking": 3200,
      "savings": 5200,
      "tfsa": 0,
      "investments": 0,
      "car_value": 7040,
      "total": 15440
    },
    "liabilities": {
      "credit_card": 5200,
      "car_loan": 0,
      "total": 5200
    },
    "net_worth": 10240
  },
  "next_milestone": {
    "target": 25000,
    "remaining": 14760,
    "projected_date": "2027-09-15",
    "timeline": "20 months away at current pace"
  },
  "action": {
    "primary": {
      "label": "See net worth chart",
      "type": "navigate",
      "route": "NetWorthDashboard"
    }
  },
  "motivation": "The first $10k is the hardest! Your momentum is building. Keep going!",
  "generated_at": "2026-01-25T10:30:00Z"
}
```

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        MOBILE APP                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Insights Screen                                      │  │
│  │  - Pull to refresh                                    │  │
│  │  - Insight cards (categorized)                        │  │
│  │  - Action buttons with deep linking                   │  │
│  │  - Dismiss/snooze functionality                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓ GET /api/insights
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND API                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Route: /api/insights                                 │  │
│  │  - Check cache (user_insights table)                  │  │
│  │  - Rate limiting (max 1 refresh per 6 hours)          │  │
│  │  - Return cached or trigger generation                │  │
│  └───────────────────────────────────────────────────────┘  │
│                              ↓                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Service: insight_data.js                             │  │
│  │  - Aggregate transaction data                         │  │
│  │  - Calculate spending by category                     │  │
│  │  - Compute trends (MoM, YoY)                          │  │
│  │  - Get debt summary                                   │  │
│  │  - Get account balances                               │  │
│  │  - Identify recurring expenses                        │  │
│  │  - Calculate credit utilization                       │  │
│  │  OUTPUT: Compact JSON summary (~1KB)                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                              ↓                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Service: ai_insights.js                              │  │
│  │  - Build structured prompt                            │  │
│  │  - Call Gemini Flash 2.0 or Claude Haiku             │  │
│  │  - Parse AI response                                  │  │
│  │  - Validate JSON schema                               │  │
│  │  - Calculate priority scores                          │  │
│  │  - Limit to top 7 insights                            │  │
│  │  OUTPUT: Validated insights JSON                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                              ↓                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Database: PostgreSQL                                 │  │
│  │  - INSERT into user_insights                          │  │
│  │  - Set cache_expires_at = NOW() + 6 hours             │  │
│  │  - Return insights JSON                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      AI SERVICES                            │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  Gemini Flash    │   OR    │  Claude Haiku    │          │
│  │  - $0.075/1M in  │         │  - $0.80/1M in   │          │
│  │  - $0.30/1M out  │         │  - $4/1M out     │          │
│  └──────────────────┘         └──────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Example

**User opens Insights screen:**

1. Mobile app calls `GET /api/insights`
2. Backend checks `user_insights` table for cached insights
3. **Cache hit (< 6 hours old)**: Return cached JSON immediately
4. **Cache miss**:
   - Call `insight_data.js` to aggregate user data
   - Build compact summary (~1000 tokens):
     ```json
     {
       "user_profile": {...},
       "accounts": {...},
       "spending_summary_90d": {...},
       "debt_summary": {...}
     }
     ```
   - Call `ai_insights.js` with summary
   - AI generates 7-10 insights
   - Validate schema, calculate priority scores
   - Insert into `user_insights` table
   - Return to mobile app
5. Mobile renders insight cards

---

## Cost Analysis & Optimization

### Token Usage Breakdown

**Per Insight Generation:**

| Component | Tokens | Notes |
|-----------|--------|-------|
| System prompt | 300 | Reusable instructions + schema |
| User data summary | 800 | Aggregated financial snapshot |
| Few-shot examples | 400 | 2-3 example insights |
| **Total Input** | **1,500** | |
| Generated insights (5-7) | 800 | JSON format |
| **Total Output** | **800** | |
| **Total per request** | **2,300** | |

### Cost Per User Per Month

**Assumption: 1 generation per day per active user**

| Model | Input Cost | Output Cost | Total/Day | Total/Month (30 days) |
|-------|------------|-------------|-----------|----------------------|
| **Gemini Flash 2.0** | $0.001125 | $0.00024 | $0.001365 | **$0.041** |
| **Claude Haiku 4.5** | $0.0012 | $0.0032 | $0.0044 | **$0.132** |
| **Claude Sonnet 4.5** | $0.0045 | $0.012 | $0.0165 | **$0.495** |

### Scaling Cost Estimates

| Users | Gemini Flash | Claude Haiku | Claude Sonnet |
|-------|--------------|--------------|---------------|
| 100 | $4.10/mo | $13.20/mo | $49.50/mo |
| 1,000 | $41/mo | $132/mo | $495/mo |
| 10,000 | $410/mo | $1,320/mo | $4,950/mo |
| 100,000 | $4,100/mo | $13,200/mo | $49,500/mo |

### Cost Optimization Strategies

#### 1. Aggressive Caching
```javascript
// Cache insights for 6-12 hours
const CACHE_DURATION_HOURS = 6;

// Only regenerate if:
// - Cache expired
// - User manually refreshes (max once per 6 hours)
// - New transactions synced (> 10 new transactions)
```

**Impact:** Reduces API calls by 90%+ (from 30 calls/month to 2-3 calls/month per user)

**New cost with caching:**
- Gemini Flash: $0.041/mo → **$0.004/mo per user** (~90% reduction)
- 1,000 users: $41/mo → **$4-6/mo**

#### 2. Smart Refresh Logic
```javascript
// Don't regenerate if minimal changes
if (newTransactionCount < 10 && !userRequestedRefresh) {
  return cachedInsights;
}

// Prioritize regeneration for users with significant activity
if (newTransactionCount > 50 || significantBalanceChange) {
  priorityQueue.push(userId);
}
```

#### 3. Batch Processing (Future Enhancement)
```javascript
// Generate insights during off-peak hours (2-6 AM)
// Process all users in batch job
// Pre-populate cache before users wake up
```

**Impact:** Allows negotiated bulk pricing, better resource utilization

#### 4. Tiered AI Models
```javascript
// Use cheaper models for simple insights
if (insightType === 'milestone_celebration') {
  model = 'gemini-flash-2.0'; // Simple, cheap
} else if (insightType === 'investment_strategy') {
  model = 'claude-sonnet-4.5'; // Complex, premium
}
```

#### 5. Hybrid Approach: Rules + AI
```javascript
// Use rule-based logic for common insights (80% of cases)
if (creditUtilization > 70) {
  insights.push(ruleEngine.generateCreditWarning(user));
}

// Use AI only for complex, personalized insights (20% of cases)
const aiInsights = await aiService.generateAdvancedInsights(userData);
```

**Impact:** Reduces AI usage by 80%, cost drops to **$0.80-1.20/mo for 1,000 users**

---

## Database Schema

### New Tables

#### `user_insights`
Stores generated AI insights with caching metadata.

```sql
CREATE TABLE user_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insights JSONB NOT NULL,                    -- Array of insight objects
  summary TEXT,                               -- "5 insights from your last 90 days"
  generated_at TIMESTAMP DEFAULT NOW(),
  cache_expires_at TIMESTAMP,                 -- NOW() + 6 hours
  generation_trigger VARCHAR(50),             -- 'manual_refresh', 'scheduled', 'new_transactions'
  token_count_input INTEGER,                  -- For cost tracking
  token_count_output INTEGER,
  ai_model_used VARCHAR(50),                  -- 'gemini-flash-2.0', 'claude-haiku-4.5'
  generation_time_ms INTEGER,                 -- Performance tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_insights_user_cache ON user_insights(user_id, cache_expires_at);
CREATE INDEX idx_user_insights_expires ON user_insights(cache_expires_at);
```

#### `user_insight_dismissals`
Tracks which insights users have dismissed to avoid re-showing.

```sql
CREATE TABLE user_insight_dismissals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_type VARCHAR(100) NOT NULL,         -- 'tfsa_opportunity', 'subscription_audit'
  insight_fingerprint VARCHAR(255),           -- Hash of key data points
  dismissed_at TIMESTAMP DEFAULT NOW(),
  dismiss_reason VARCHAR(50),                 -- 'not_interested', 'already_done', 'remind_later'
  remind_after TIMESTAMP,                     -- For "remind me in 30 days"

  UNIQUE(user_id, insight_type, insight_fingerprint)
);

CREATE INDEX idx_dismissals_user_type ON user_insight_dismissals(user_id, insight_type);
```

#### `user_preferences`
Store user preferences for insight personalization.

```sql
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  first_time_homebuyer BOOLEAN,               -- null = unknown, true/false = known
  investment_risk_tolerance VARCHAR(20),      -- 'conservative', 'moderate', 'aggressive'
  interested_in_investing BOOLEAN DEFAULT true,
  interested_in_crypto BOOLEAN DEFAULT false,
  preferred_savings_account_type VARCHAR(20), -- 'tfsa', 'rrsp', 'fhsa', 'non_registered'
  email_insights_enabled BOOLEAN DEFAULT false,
  push_insights_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `insight_actions`
Track which actions users take on insights (analytics).

```sql
CREATE TABLE insight_actions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_id VARCHAR(100) NOT NULL,           -- From insights JSON
  insight_type VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,           -- 'clicked_primary', 'clicked_secondary', 'dismissed'
  action_timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_insight_actions_user ON insight_actions(user_id);
CREATE INDEX idx_insight_actions_type ON insight_actions(insight_type);
```

---

## API Specifications

### `GET /api/insights`

Get personalized financial insights for the authenticated user.

**Authentication:** Required (JWT)

**Query Parameters:**
- `force_refresh` (boolean, optional): Force regeneration even if cache is valid. Rate limited to once per 6 hours.

**Response:**
```json
{
  "success": true,
  "data": {
    "insights": [
      {
        "id": "tfsa_001",
        "type": "tfsa_opportunity",
        "priority": "high",
        "title": "You have $2,340 ready for your TFSA",
        "description": "...",
        "reasoning": [...],
        "data_points": {...},
        "action": {...},
        "potential_benefit": {...},
        "dismissible": true,
        "generated_at": "2026-01-25T10:30:00Z"
      },
      ...
    ],
    "summary": "5 insights generated from your last 90 days of activity",
    "generated_at": "2026-01-25T10:30:00Z",
    "cache_expires_at": "2026-01-25T16:30:00Z",
    "is_cached": true
  }
}
```

**Error Responses:**

- `429 Too Many Requests`: User has exceeded refresh rate limit
  ```json
  {
    "success": false,
    "error": "Rate limit exceeded. Please wait 4 hours before refreshing again.",
    "retry_after": "2026-01-25T14:30:00Z"
  }
  ```

- `500 Internal Server Error`: AI service failure (returns cached insights if available)
  ```json
  {
    "success": false,
    "error": "Unable to generate insights. Please try again later.",
    "cached_insights_available": true
  }
  ```

### `POST /api/insights/dismiss`

Dismiss a specific insight.

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "insight_id": "tfsa_001",
  "insight_type": "tfsa_opportunity",
  "reason": "not_interested",
  "remind_after_days": 30
}
```

**Response:**
```json
{
  "success": true,
  "message": "Insight dismissed successfully"
}
```

### `POST /api/insights/action`

Track when a user takes action on an insight (analytics).

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "insight_id": "tfsa_001",
  "insight_type": "tfsa_opportunity",
  "action_type": "clicked_primary"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Action tracked"
}
```

### `GET /api/insights/preferences`

Get user preferences for insight personalization.

**Authentication:** Required (JWT)

**Response:**
```json
{
  "success": true,
  "data": {
    "first_time_homebuyer": null,
    "investment_risk_tolerance": "moderate",
    "interested_in_investing": true,
    "interested_in_crypto": false,
    "preferred_savings_account_type": "tfsa",
    "email_insights_enabled": false,
    "push_insights_enabled": true
  }
}
```

### `PUT /api/insights/preferences`

Update user preferences.

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "first_time_homebuyer": true,
  "investment_risk_tolerance": "aggressive"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

---

## AI Prompt Engineering

### System Prompt Template

```
You are an expert Canadian personal finance advisor analyzing a user's financial data. Your goal is to generate 5-7 actionable, personalized insights that help the user optimize their finances.

CONTEXT:
- User location: Canada
- Financial products: TFSA, FHSA, RRSP, GIC, ETFs
- Tax considerations: Canadian tax brackets and deductions
- Currency: CAD

INSIGHT CATEGORIES (generate 1-2 from each relevant category):
1. Tax-Advantaged Account Opportunities (TFSA, FHSA, RRSP)
2. Spending Optimization (subscriptions, dining, groceries)
3. Debt Payoff Acceleration (avalanche, balance transfer, consolidation)
4. Savings Acceleration (emergency fund, found money, automation)
5. Cash Flow Optimization (credit utilization, bill timing, budgeting)
6. Investment Readiness (when user is ready to start investing)
7. Milestone Celebrations (debt payoff, net worth goals)

RULES:
1. Be specific with dollar amounts and calculations
2. Show clear ROI or savings potential for each insight
3. Prioritize high-impact insights (>$500/year savings or major financial health improvement)
4. Use encouraging but realistic tone
5. Every insight must have a clear action the user can take
6. Calculate benefits conservatively (use realistic interest rates, returns)
7. Consider user's actual financial situation (don't recommend investing if they have high-interest debt)
8. If user has negative cash flow, prioritize spending reduction insights
9. If user has positive cash flow + emergency fund, prioritize growth insights (investing, tax-advantaged accounts)

CANADIAN FINANCIAL CONSTANTS (use these in calculations):
- TFSA contribution limit 2026: $7,000/year (use user's actual room available)
- FHSA annual limit: $8,000/year, lifetime $40,000
- Average HISA rate: 4-5%
- Average credit card APR: 19.99%
- Average investment return (moderate risk): 6-7% annually
- Recommended credit utilization: < 30%
- Recommended emergency fund: 3-6 months of expenses

OUTPUT FORMAT:
Return a JSON array of insight objects matching this exact schema:

{
  "insights": [
    {
      "id": "unique_id",
      "type": "insight_category",
      "priority": "high|medium|low",
      "title": "Short compelling title (< 60 chars)",
      "description": "2-3 sentence explanation with specific numbers",
      "reasoning": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
      "data_points": {
        "key_metric_1": value,
        "key_metric_2": value
      },
      "action": {
        "primary": {
          "label": "Action button text",
          "type": "navigate|web_link|external_action",
          "route": "ScreenName" OR "url": "https://..."
        },
        "secondary": {
          "label": "Secondary action text",
          "type": "navigate|web_link"
        }
      },
      "potential_benefit": {
        "monthly_savings": 0,
        "annual_savings": 0,
        "calculation": "Explanation of how savings were calculated",
        "five_year_projection": 0
      },
      "dismissible": true,
      "generated_at": "ISO 8601 timestamp"
    }
  ]
}

PRIORITY SCORING:
- high: Potential savings/benefit > $1,000/year OR urgent financial health issue (credit score risk, overdraft, etc.)
- medium: Potential savings $300-1,000/year OR important optimization
- low: Potential savings < $300/year OR celebratory/educational insights

EXAMPLE INSIGHTS (use as reference for tone and structure):

[Include 2-3 full example insights from the categories above as few-shot examples]

Now, analyze the following user data and generate 5-7 personalized insights:
```

### User Data Summary Template

```json
{
  "user_profile": {
    "user_id": 123,
    "age": 28,
    "estimated_annual_income": 42000,
    "country": "CA",
    "analysis_period_days": 90,
    "first_time_homebuyer": null,
    "investment_experience": "beginner"
  },
  "accounts": {
    "checking": {
      "balance": 3200,
      "avg_balance_90d": 3100,
      "min_balance_90d": 890
    },
    "savings": {
      "balance": 2800,
      "avg_balance_90d": 2400
    },
    "tfsa": {
      "balance": 0,
      "contribution_room_available": 18000
    },
    "rrsp": {
      "balance": 0,
      "contribution_room_available": 7560
    },
    "credit_cards": [
      {
        "name": "TD Visa",
        "balance": 3900,
        "limit": 5000,
        "apr": 19.99,
        "minimum_payment": 156,
        "utilization": 78
      }
    ],
    "loans": []
  },
  "spending_summary_90d": {
    "total_spending": 5910,
    "avg_monthly_spending": 1970,
    "by_category": {
      "groceries": 960,
      "dining": 1245,
      "transportation": 540,
      "utilities": 420,
      "entertainment": 380,
      "subscriptions": 741,
      "shopping": 624,
      "other": 1000
    },
    "month_over_month": {
      "current_month": 1870,
      "previous_month": 2150,
      "change_amount": -280,
      "change_percent": -13
    },
    "transaction_count": 234,
    "avg_transaction_size": 25.26
  },
  "income_summary_90d": {
    "total_income": 10500,
    "avg_monthly_income": 3500,
    "sources": [
      {
        "source": "Salary - Acme Corp",
        "monthly_avg": 3500,
        "consistency": "very_consistent"
      }
    ]
  },
  "subscriptions": [
    {
      "name": "Netflix",
      "amount": 16.99,
      "frequency": "monthly",
      "last_charge": "2026-01-15",
      "usage_detected": true,
      "last_activity": "2026-01-24"
    },
    {
      "name": "LA Fitness",
      "amount": 65,
      "frequency": "monthly",
      "last_charge": "2026-01-03",
      "usage_detected": false,
      "last_activity": "2025-11-20",
      "days_since_use": 66
    }
  ],
  "debt_summary": {
    "total_balance": 3900,
    "total_minimum_monthly": 156,
    "highest_apr": 19.99,
    "highest_apr_account": "TD Visa",
    "total_monthly_interest_cost": 86.58,
    "debt_to_income_ratio": 9.3,
    "accounts_count": 1
  },
  "credit_health": {
    "credit_score": 742,
    "total_credit_limit": 5000,
    "total_credit_used": 3900,
    "utilization_percent": 78,
    "utilization_status": "high_risk"
  },
  "savings_metrics": {
    "total_liquid_savings": 6000,
    "emergency_fund_months_coverage": 3.05,
    "avg_monthly_savings_rate": 12,
    "savings_rate_last_month": 20
  },
  "cash_flow": {
    "avg_monthly_income": 3500,
    "avg_monthly_expenses": 1970,
    "avg_monthly_debt_payments": 156,
    "avg_monthly_surplus": 1374,
    "discretionary_spending": 420
  },
  "recent_milestones": [
    {
      "type": "debt_payoff",
      "description": "Car loan paid off",
      "date": "2026-01-18",
      "amount_freed": 380
    }
  ],
  "financial_readiness": {
    "emergency_fund_complete": false,
    "high_interest_debt_cleared": false,
    "stable_income": true,
    "positive_cash_flow": true,
    "ready_to_invest": false
  }
}
```

### AI Response Validation

```javascript
// Validate AI response matches schema
function validateInsightSchema(insight) {
  const requiredFields = [
    'id', 'type', 'priority', 'title', 'description',
    'reasoning', 'action', 'potential_benefit'
  ];

  // Check all required fields present
  for (const field of requiredFields) {
    if (!insight[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate priority values
  if (!['high', 'medium', 'low'].includes(insight.priority)) {
    throw new Error(`Invalid priority: ${insight.priority}`);
  }

  // Validate title length
  if (insight.title.length > 60) {
    throw new Error(`Title too long: ${insight.title.length} chars`);
  }

  // Validate reasoning is array
  if (!Array.isArray(insight.reasoning) || insight.reasoning.length < 2) {
    throw new Error('Reasoning must be array with 2+ items');
  }

  // Validate action structure
  if (!insight.action.primary || !insight.action.primary.label) {
    throw new Error('Primary action missing');
  }

  return true;
}
```

---

## Mobile UI/UX Design

### Insights Screen Layout

```
┌─────────────────────────────────────┐
│  ← Insights              🔄         │ ← Header with back & refresh
├─────────────────────────────────────┤
│                                     │
│  💡 5 insights from your last      │ ← Summary header
│     90 days of activity             │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🔴 HIGH PRIORITY              │ │ ← Priority badge
│  │                               │ │
│  │ Your credit score is at risk  │ │ ← Title (bold, 18px)
│  │ - 78% utilization             │ │
│  │                               │ │
│  │ Your Visa is at $3,900 of     │ │ ← Description (14px)
│  │ $5,000 limit (78%). Pay down  │ │
│  │ $2,400 to reach 30%.          │ │
│  │                               │ │
│  │ 💰 Save $1,200 in interest    │ │ ← Benefit highlight
│  │                               │ │
│  │ ┌──────────────┐ ┌──────────┐ │ │
│  │ │ Make payment │ │ Learn → │ │ │ ← Action buttons
│  │ └──────────────┘ └──────────┘ │ │
│  │                           ✕   │ │ ← Dismiss button
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🟡 MEDIUM PRIORITY            │ │
│  │                               │ │
│  │ You have $2,340 ready for     │ │
│  │ your TFSA                     │ │
│  │                               │ │
│  │ Based on your spending        │ │
│  │ patterns, you have $2,340     │ │
│  │ available to transfer to      │ │
│  │ TFSA for tax-free growth.     │ │
│  │                               │ │
│  │ 💰 Earn $117/year tax-free    │ │
│  │                               │ │
│  │ ┌──────────────┐ ┌──────────┐ │ │
│  │ │ Learn TFSA   │ │ Set up → │ │ │
│  │ └──────────────┘ └──────────┘ │ │
│  │                           ✕   │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🟢 MILESTONE                  │ │
│  │                               │ │
│  │ 🎉 You paid off your car loan!│ │
│  │                               │ │
│  │ Final payment cleared. You've │ │
│  │ freed up $380/month!          │ │
│  │                               │ │
│  │ ┌────────────────────────────┐│ │
│  │ │ Choose your next goal →   ││ │
│  │ └────────────────────────────┘│ │
│  └───────────────────────────────┘ │
│                                     │
│  Last updated: 2 hours ago          │ ← Timestamp
└─────────────────────────────────────┘
```

### Component Specifications

**InsightCard Component**
```jsx
<InsightCard
  insight={insight}
  onPrimaryAction={handlePrimaryAction}
  onSecondaryAction={handleSecondaryAction}
  onDismiss={handleDismiss}
/>
```

**Props:**
- `insight`: Insight object from API
- `onPrimaryAction`: Callback for primary button
- `onSecondaryAction`: Callback for secondary button
- `onDismiss`: Callback for dismiss

**Visual Styling:**
- High priority: Red accent (#FF4444), red left border
- Medium priority: Gold accent (#FFD700), gold left border
- Low priority: Green accent (#4CAF50), green left border
- Milestone: Purple accent (#9C27B0), purple left border

- Card: White background, rounded corners (12px), shadow
- Title: Bold, 18px, dark gray (#2C3E50)
- Description: Regular, 14px, medium gray (#7F8C8D)
- Benefit: Semi-bold, 14px, green (#27AE60), with 💰 emoji
- Buttons: Primary (gold #FFD700), Secondary (outline)

**Action Button Behavior:**
```javascript
// Handle different action types
switch (action.type) {
  case 'navigate':
    navigation.navigate(action.route, action.params);
    break;
  case 'web_link':
    Linking.openURL(action.url);
    break;
  case 'transfer_money':
    // Open transfer screen with pre-filled data
    navigation.navigate('Transfer', {
      from: action.from,
      to: action.to,
      amount: action.amount
    });
    break;
  case 'user_decision':
    // Open modal with options
    showDecisionModal(action.options);
    break;
}
```

**Dismiss Behavior:**
```javascript
const handleDismiss = async (insight) => {
  // Show dismiss options
  const option = await showDismissSheet([
    'Not interested',
    'Already done this',
    'Remind me in 30 days'
  ]);

  // Send to API
  await api.post('/insights/dismiss', {
    insight_id: insight.id,
    insight_type: insight.type,
    reason: option,
    remind_after_days: option === 'remind' ? 30 : null
  });

  // Remove from UI
  removeInsight(insight.id);
};
```

### Pull-to-Refresh

```javascript
const [refreshing, setRefreshing] = useState(false);

const onRefresh = async () => {
  setRefreshing(true);
  try {
    const response = await api.get('/insights?force_refresh=true');
    setInsights(response.data.insights);
  } catch (error) {
    if (error.status === 429) {
      // Rate limited
      Alert.alert(
        'Too many refreshes',
        'Please wait a few hours before refreshing again.'
      );
    }
  } finally {
    setRefreshing(false);
  }
};

return (
  <ScrollView
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    }
  >
    {insights.map(insight => (
      <InsightCard key={insight.id} insight={insight} />
    ))}
  </ScrollView>
);
```

### Empty State

```
┌─────────────────────────────────────┐
│  ← Insights              🔄         │
├─────────────────────────────────────┤
│                                     │
│          💡                         │
│                                     │
│    Analyzing your finances...       │
│                                     │
│    We're reviewing your             │
│    transactions to find             │
│    personalized insights.           │
│                                     │
│    This usually takes a few         │
│    seconds.                         │
│                                     │
│    [Loading spinner]                │
│                                     │
└─────────────────────────────────────┘
```

### Error State

```
┌─────────────────────────────────────┐
│  ← Insights              🔄         │
├─────────────────────────────────────┤
│                                     │
│          ⚠️                         │
│                                     │
│    Unable to load insights          │
│                                     │
│    We couldn't generate your        │
│    insights right now. Please       │
│    try again later.                 │
│                                     │
│    ┌────────────────────────────┐  │
│    │     Try Again              │  │
│    └────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Backend Infrastructure (Week 1-2)

**Tasks:**
1. ✅ Database schema creation
   - Create `user_insights`, `user_insight_dismissals`, `user_preferences`, `insight_actions` tables
   - Add migration scripts
   - Test with sample data

2. ✅ Data aggregation service (`/services/insight_data.js`)
   - Build functions to aggregate transaction data
   - Calculate spending by category
   - Compute month-over-month trends
   - Get debt summary and credit utilization
   - Identify recurring subscriptions
   - Calculate emergency fund coverage
   - Output compact JSON summary (~1KB)

3. ✅ AI service wrapper (`/services/ai_insights.js`)
   - Integrate Gemini Flash 2.0 API
   - Build prompt template system
   - Implement JSON response parsing
   - Add schema validation
   - Error handling and fallbacks
   - Token counting for cost tracking

4. ✅ Insights API endpoint (`/routes/insights.js`)
   - `GET /api/insights` - Get insights (with caching)
   - `POST /api/insights/dismiss` - Dismiss insight
   - `POST /api/insights/action` - Track action
   - `GET /api/insights/preferences` - Get user prefs
   - `PUT /api/insights/preferences` - Update prefs
   - Add rate limiting (1 refresh per 6 hours)

**Deliverables:**
- Working backend API that returns insights
- Caching system with 6-hour expiry
- Cost tracking metrics
- API documentation

---

### Phase 2: Prompt Engineering & Testing (Week 2-3)

**Tasks:**
1. ✅ Create comprehensive system prompt
   - Define all 7 insight categories
   - Add calculation guidelines
   - Include Canadian financial constants
   - Add few-shot examples

2. ✅ Build insight type generators
   - TFSA/FHSA/RRSP recommendation logic
   - Subscription audit detector
   - Debt payoff calculator integration
   - Credit utilization warnings
   - Emergency fund progress tracker
   - Spending optimization rules

3. ✅ Test with real user data
   - Run against 10-20 test user profiles
   - Validate insight quality and relevance
   - Check calculation accuracy
   - Tune priority scoring
   - Refine prompts based on output quality

4. ✅ A/B test AI models
   - Compare Gemini Flash vs Claude Haiku
   - Measure: quality, cost, speed, consistency
   - Choose optimal model

**Deliverables:**
- Production-ready prompt templates
- Validated insight generation logic
- Model selection decision
- Quality benchmarks

---

### Phase 3: Mobile Frontend (Week 3-4)

**Tasks:**
1. ✅ Create Insights screen
   - New tab in main navigation OR
   - Accessible from Home screen
   - Setup navigation routing

2. ✅ Build InsightCard component
   - Priority badges (high/medium/low)
   - Title, description, reasoning
   - Benefit highlighting
   - Action buttons (primary, secondary)
   - Dismiss functionality
   - Visual styling per priority level

3. ✅ Implement insight list
   - Pull-to-refresh
   - Loading states
   - Empty state
   - Error handling
   - Cached data display

4. ✅ Add action handlers
   - Navigate to related screens
   - Open web links
   - Show decision modals (for milestones)
   - Track actions via API

5. ✅ Dismiss functionality
   - Show dismiss options sheet
   - Send dismissal to API
   - Remove from UI
   - Handle "remind later"

**Deliverables:**
- Complete Insights screen in mobile app
- All UI components built and styled
- Action routing integrated
- User testing ready

---

### Phase 4: Polish & Launch (Week 4-5)

**Tasks:**
1. ✅ User testing
   - Internal team testing (5-10 people)
   - Gather feedback on insight quality
   - Test action flows
   - Check for edge cases

2. ✅ Performance optimization
   - Cache API responses in AsyncStorage
   - Lazy load insight cards
   - Optimize image/icon loading
   - Reduce bundle size

3. ✅ Analytics integration
   - Track insight views
   - Track action clicks
   - Track dismissals
   - Monitor cache hit rate
   - Monitor AI costs

4. ✅ Documentation
   - User-facing: "How Insights Work" help article
   - Developer: API docs, prompt guide
   - Runbook: AI service monitoring, cost alerts

5. ✅ Soft launch
   - Enable for 10% of users
   - Monitor performance and costs
   - Gather user feedback
   - Fix bugs

6. ✅ Full launch
   - Enable for 100% of users
   - Announce feature
   - Monitor metrics

**Deliverables:**
- Production-ready Insights feature
- User documentation
- Analytics dashboard
- Cost monitoring

---

### Phase 5: Iteration & Enhancement (Week 6+)

**Ongoing tasks:**
1. Monitor & optimize
   - Track cost per user
   - Monitor insight quality scores (user dismissal rate)
   - A/B test prompt variations
   - Optimize caching strategy

2. Add new insight types
   - Investment product recommendations (specific ETFs, GICs)
   - Bill negotiation opportunities (cable, phone, insurance)
   - Tax optimization (RRSP contribution timing, etc.)
   - Cashback/rewards optimization

3. Personalization improvements
   - Learn from user dismissals
   - Adjust priority scoring based on actions taken
   - Add machine learning for insight relevance

4. Advanced features
   - Email digest of weekly insights
   - Push notifications for urgent insights (credit utilization > 80%)
   - Insight history/archive
   - Export insights to PDF

**Success Metrics:**
- User engagement: % of users viewing insights weekly
- Action rate: % of insights resulting in user action
- Dismissal rate: < 30% (indicates relevant insights)
- Cost per user: < $0.01/month with caching
- User satisfaction: NPS score for Insights feature

---

## Testing & Quality Assurance

### Unit Tests

**Backend Services:**

```javascript
// Test data aggregation
describe('insight_data.js', () => {
  test('aggregates spending by category correctly', async () => {
    const userId = 1;
    const summary = await insightData.getUserSummary(userId);

    expect(summary.spending_summary_90d.total_spending).toBeGreaterThan(0);
    expect(summary.spending_summary_90d.by_category).toHaveProperty('groceries');
    expect(summary.accounts.checking.balance).toBeGreaterThanOrEqual(0);
  });

  test('calculates credit utilization correctly', async () => {
    const userId = 2;
    const summary = await insightData.getUserSummary(userId);

    const expectedUtilization =
      (summary.accounts.credit_cards[0].balance /
       summary.accounts.credit_cards[0].limit) * 100;

    expect(summary.credit_health.utilization_percent).toBe(expectedUtilization);
  });
});

// Test AI service
describe('ai_insights.js', () => {
  test('generates valid JSON response', async () => {
    const mockUserData = {...};
    const insights = await aiInsights.generate(mockUserData);

    expect(Array.isArray(insights.insights)).toBe(true);
    expect(insights.insights.length).toBeGreaterThan(0);
    expect(insights.insights.length).toBeLessThanOrEqual(7);
  });

  test('validates insight schema', () => {
    const validInsight = {
      id: 'test_001',
      type: 'tfsa_opportunity',
      priority: 'high',
      title: 'Test insight',
      description: 'Test description',
      reasoning: ['Reason 1', 'Reason 2'],
      action: {primary: {label: 'Test', type: 'navigate'}},
      potential_benefit: {annual_savings: 100}
    };

    expect(() => validateInsightSchema(validInsight)).not.toThrow();
  });

  test('rejects invalid insight schema', () => {
    const invalidInsight = {
      id: 'test_001',
      type: 'tfsa_opportunity'
      // Missing required fields
    };

    expect(() => validateInsightSchema(invalidInsight)).toThrow();
  });
});
```

### Integration Tests

```javascript
// Test full insights API flow
describe('GET /api/insights', () => {
  test('returns cached insights when available', async () => {
    const userId = 1;
    const token = generateTestJWT(userId);

    // First request (cache miss)
    const res1 = await request(app)
      .get('/api/insights')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.data.is_cached).toBe(false);

    // Second request (cache hit)
    const res2 = await request(app)
      .get('/api/insights')
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.data.is_cached).toBe(true);
    expect(res2.body.data.insights).toEqual(res1.body.data.insights);
  });

  test('respects rate limiting on force refresh', async () => {
    const userId = 1;
    const token = generateTestJWT(userId);

    // First force refresh
    const res1 = await request(app)
      .get('/api/insights?force_refresh=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);

    // Second force refresh immediately (should be rate limited)
    const res2 = await request(app)
      .get('/api/insights?force_refresh=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(429);
    expect(res2.body.error).toContain('Rate limit');
  });
});
```

### Quality Metrics

**Insight Quality Score:**
```javascript
// Track quality metrics per insight type
function calculateQualityScore(insightType, timeframe = '30d') {
  const metrics = db.query(`
    SELECT
      COUNT(*) as total_shown,
      SUM(CASE WHEN action_type IS NOT NULL THEN 1 ELSE 0 END) as actions_taken,
      SUM(CASE WHEN dismissed = true THEN 1 ELSE 0 END) as dismissed,
      AVG(time_to_action_seconds) as avg_time_to_action
    FROM insight_actions
    WHERE insight_type = $1
      AND created_at > NOW() - INTERVAL '${timeframe}'
  `, [insightType]);

  const actionRate = metrics.actions_taken / metrics.total_shown;
  const dismissRate = metrics.dismissed / metrics.total_shown;

  // Quality score: high action rate, low dismiss rate
  const qualityScore = (actionRate * 100) - (dismissRate * 50);

  return {
    insight_type: insightType,
    total_shown: metrics.total_shown,
    action_rate: actionRate,
    dismiss_rate: dismissRate,
    quality_score: qualityScore,
    avg_time_to_action: metrics.avg_time_to_action
  };
}
```

**Benchmarks:**
- Action rate > 15% = Good insight
- Action rate > 30% = Excellent insight
- Dismiss rate < 20% = Relevant insight
- Dismiss rate > 40% = Poor insight (needs improvement)

---

## Future Enhancements

### 1. Smart Notifications

**Push Notifications:**
- Urgent insights (credit utilization > 80%, overdraft risk)
- Weekly digest: "You have 3 new insights"
- Milestone celebrations (debt paid off, savings goal reached)

**Email Digest:**
- Weekly or monthly summary of insights
- PDF attachment with full breakdown
- Unsubscribe option

### 2. Conversational Insights (Chat Interface)

Allow users to ask follow-up questions:
```
User: "Why should I use a TFSA instead of a regular savings account?"

AI: "Great question! A TFSA offers two main advantages:

1. Tax-free growth: Any interest, dividends, or capital gains in your TFSA
   are never taxed. In a regular savings account, you'd pay tax on interest.

2. Tax-free withdrawals: You can take money out anytime without tax.

Example for you:
- $2,340 in regular savings @ 5% = $117/year interest
- Tax on interest (30% bracket) = -$35
- Net: $82/year

- $2,340 in TFSA @ 5% = $117/year interest
- Tax: $0
- Net: $117/year

You save $35/year in taxes, and over 10 years that's $350 extra!"
```

### 3. Goal Setting & Tracking

**Link insights to goals:**
- User sets goal: "Pay off credit card by Dec 2026"
- Insights track progress: "You're 23% to your goal! On track for Nov 2026."
- Celebrate milestones: "Halfway there! You've paid off $2,600."

### 4. Comparative Insights (Anonymized Benchmarking)

```json
{
  "type": "peer_comparison",
  "title": "You're saving more than 68% of similar users",
  "description": "Users in your age group (25-30) and income bracket ($40-50k) save an average of $245/month. You're saving $320/month - nice work!",
  "data_points": {
    "your_savings_rate": 320,
    "peer_average": 245,
    "percentile": 68
  }
}
```

### 5. Financial Product Recommendations

**Specific product recommendations:**
- "Based on your credit score (742) and spending ($1,200/mo on groceries/gas), you qualify for the Tangerine Money-Back Card - earn 2% cashback = $288/year"
- "Your savings ($5,200) could earn 5.5% in the EQ Bank HISA instead of 1.5% at TD - earn extra $208/year"

**Affiliate Integration (Revenue Stream):**
- Partner with financial institutions
- Earn referral fees when users sign up
- Offset AI costs (potentially net positive revenue)

### 6. Tax Optimization Insights (Advanced)

**Tax season insights:**
- "Contribute $3,000 to RRSP by March 1 for $900 refund"
- "You have $1,200 in charity donations - claim for $360 tax credit"
- "Claim home office expenses - save $450 (based on your WFH pattern)"

**Tax refund optimizer:**
- "Expecting a $1,500 tax refund? Here's the optimal use:"
  - Option 1: Pay down Visa → save $300 in interest
  - Option 2: Max out TFSA → earn $75/year tax-free
  - Option 3: Split: $1,000 debt + $500 TFSA

### 7. Bill Negotiation Assistant

**Detect negotiation opportunities:**
```json
{
  "type": "bill_negotiation",
  "title": "Save $240/year on car insurance",
  "description": "You've been with Intact Insurance for 3 years with no claims. Competitors are offering 15-20% lower rates for your profile.",
  "current_bill": {
    "provider": "Intact Insurance",
    "monthly_cost": 180,
    "annual_cost": 2160
  },
  "competitor_quotes": [
    {"provider": "TD Insurance", "estimated_annual": 1920, "savings": 240},
    {"provider": "Belairdirect", "estimated_annual": 1850, "savings": 310}
  ],
  "action": {
    "primary": {
      "label": "Get quotes",
      "type": "web_link",
      "url": "https://www.kanetix.ca/auto-insurance"
    }
  }
}
```

### 8. Investment Portfolio Rebalancing

Once users start investing:
```json
{
  "type": "portfolio_rebalancing",
  "title": "Your portfolio is overweight US stocks - rebalance",
  "description": "Your target allocation is 40% US, 30% Canada, 20% International, 10% Bonds. Currently: 52% US, 28% Canada, 15% International, 5% Bonds.",
  "current_allocation": {...},
  "target_allocation": {...},
  "rebalancing_trades": [
    {"action": "sell", "ticker": "VUN", "shares": 12, "value": 850},
    {"action": "buy", "ticker": "XEF", "shares": 15, "value": 450},
    {"action": "buy", "ticker": "ZAG", "shares": 20, "value": 400}
  ]
}
```

### 9. Gamification & Challenges

**Financial challenges:**
- "No-Spend Weekend Challenge: Save $150 this weekend"
- "Coffee Challenge: Make coffee at home for 2 weeks, save $60"
- "Subscription Audit Challenge: Cancel 1 unused subscription, save $15/month"

**Achievements & Badges:**
- 🏆 "Debt Crusher" - Paid off first debt
- 💰 "Savings Streak" - Saved money 3 months in a row
- 📈 "Investor" - Made first TFSA contribution
- 🎯 "Goal Getter" - Reached emergency fund goal

### 10. Shared Insights (Partner/Family Mode)

**Household insights:**
- Combined analysis for couples
- "You and Alex spent $2,400 on dining (combined). Reduce by 30% → save $720/month"
- "Combined TFSA room: $36,000 available"

---

## Appendix: Canadian Financial Constants

### TFSA (Tax-Free Savings Account)
- **2026 Annual Limit:** $7,000
- **Lifetime Contribution Room (if never contributed):** $95,000 (varies by age/year)
- **Typical Use:** Emergency fund, short-term savings, investments
- **Tax Treatment:** Contributions not deductible, growth tax-free, withdrawals tax-free

### FHSA (First Home Savings Account)
- **Annual Limit:** $8,000
- **Lifetime Limit:** $40,000
- **Eligibility:** First-time homebuyers (no home owned in last 4 years)
- **Tax Treatment:** Contributions deductible, growth tax-free, withdrawals tax-free (for first home)
- **Max Participation Period:** 15 years

### RRSP (Registered Retirement Savings Plan)
- **Annual Limit:** 18% of previous year's income (max $31,560 in 2024)
- **Contribution Deadline:** March 1 of following year
- **Tax Treatment:** Contributions deductible, growth tax-deferred, withdrawals taxable
- **Best For:** High earners in higher tax brackets

### Average Interest Rates (2026)
- **HISA (High-Interest Savings):** 4-5.5%
- **GIC (1-year):** 4.5-5%
- **GIC (5-year):** 4-4.5%
- **Credit Card:** 19.99% average
- **Personal Loan:** 8-12%
- **Mortgage (5-year fixed):** 5-6%

### Investment Returns (Historical Averages)
- **Canadian Stocks (TSX):** 7-8% annually
- **US Stocks (S&P 500):** 9-10% annually
- **Balanced Portfolio (60/40 stocks/bonds):** 6-7% annually
- **Conservative Portfolio:** 4-5% annually

### Credit Score Factors
- **Payment History:** 35%
- **Credit Utilization:** 30%
- **Length of Credit History:** 15%
- **Credit Mix:** 10%
- **New Credit:** 10%

**Utilization Guidelines:**
- 0-30%: Excellent
- 31-49%: Good
- 50-69%: Fair (negative impact)
- 70-100%: Poor (major negative impact)

### Tax Brackets (Federal, 2026 - Example)
- $0-$55,867: 15%
- $55,867-$111,733: 20.5%
- $111,733-$173,205: 26%
- $173,205-$246,752: 29%
- $246,752+: 33%

*Note: Add provincial taxes (varies by province)*

---

## Conclusion

The AI Insights System represents a major value-add for IndusWealth users, transforming the app from a passive tracker into an active financial advisor. By leveraging modern AI models cost-efficiently and providing actionable, personalized recommendations, we can help users:

- Save $2,000-5,000+ per year
- Pay off debt 1-3 years faster
- Optimize tax-advantaged accounts (TFSA, FHSA, RRSP)
- Build emergency funds and start investing

**Total Implementation Cost:**
- Development: 4-5 weeks (1 developer)
- Ongoing AI costs: $4-15/month for 1,000 active users (with caching)
- Maintenance: Minimal (prompt tuning, new insight types)

**Expected ROI:**
- Increased user engagement (20-30% increase in daily active users)
- Higher retention (users who use Insights are 2x more likely to stay)
- Potential revenue stream (affiliate partnerships for financial products)
- Competitive differentiation (few personal finance apps offer AI insights)

This document serves as the complete blueprint for implementation. Refer to specific sections as needed during development.

---

**Document Version:** 1.0
**Last Updated:** 2026-01-25
**Author:** IndusWealth Development Team
**Status:** Ready for Implementation
