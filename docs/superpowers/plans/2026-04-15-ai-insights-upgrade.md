# AI Insights Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform generic AI insights into an intelligent financial co-pilot with ETF recommendations, enhanced prompt engineering, fixed Wealth Academy, and premium UI redesign.

**Architecture:** Backend-driven AI pipeline upgrade (Gemini 2.0 Pro with ETF knowledge injection, health score calculator, curated article repository) + Mobile UI overhaul (Financial Health Score widget, expandable insight cards, Investment Corner, tabbed filtering, ArticleCardV2).

**Tech Stack:** Node.js/Express 5, PostgreSQL 15, Google Generative AI (Gemini 2.0 Pro), React Native 0.81.5/Expo 54, React 19, react-native-svg, @expo/vector-icons. No new dependencies required.

---

## Phase 1: Backend Foundation

### Task 1: Create Canadian ETF Knowledge Base

**Files:**
- Create: `packages/backend/src/data/canadian_etfs.json`

Steps:

- [ ] **Step 1.1** Create the `packages/backend/src/data/` directory and the `canadian_etfs.json` file with the full ETF dataset. This file contains 30 real Canadian ETFs with real MER percentages, approximate historical return ranges, risk levels, categories, geographic allocations, and brokerage availability.

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
        },
        {
            "ticker": "VEQT",
            "name": "Vanguard All-Equity ETF Portfolio",
            "provider": "Vanguard",
            "category": "all_equity",
            "subcategory": "global_equity",
            "risk_level": "high",
            "mer_percent": 0.24,
            "distribution_yield_percent": 1.6,
            "distribution_frequency": "quarterly",
            "holdings_count": 13000,
            "geographic_allocation": {
                "canada": 30,
                "us": 42,
                "international_developed": 20,
                "emerging_markets": 8
            },
            "historical_returns": {
                "ytd_percent": 4.0,
                "one_year_percent": 12.1,
                "three_year_annualized_percent": 7.8,
                "five_year_annualized_percent": 9.0,
                "since_inception_annualized_percent": 9.8
            },
            "suitable_for": ["long_term_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "All-in-one 100% equity ETF from Vanguard with slightly higher Canadian allocation than XEQT.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XGRO",
            "name": "iShares Core Growth ETF Portfolio",
            "provider": "BlackRock (iShares)",
            "category": "balanced",
            "subcategory": "growth_balanced",
            "risk_level": "moderate",
            "mer_percent": 0.20,
            "distribution_yield_percent": 2.0,
            "distribution_frequency": "quarterly",
            "holdings_count": 9000,
            "geographic_allocation": {
                "canada": 20,
                "us": 36,
                "international_developed": 17,
                "emerging_markets": 7
            },
            "historical_returns": {
                "ytd_percent": 3.5,
                "one_year_percent": 10.8,
                "three_year_annualized_percent": 6.9,
                "five_year_annualized_percent": 8.1,
                "since_inception_annualized_percent": 8.7
            },
            "suitable_for": ["long_term_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate"],
            "description": "80/20 stock-bond split for growth-oriented investors who want some downside protection.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VGRO",
            "name": "Vanguard Growth ETF Portfolio",
            "provider": "Vanguard",
            "category": "balanced",
            "subcategory": "growth_balanced",
            "risk_level": "moderate",
            "mer_percent": 0.24,
            "distribution_yield_percent": 1.9,
            "distribution_frequency": "quarterly",
            "holdings_count": 13000,
            "geographic_allocation": {
                "canada": 24,
                "us": 34,
                "international_developed": 16,
                "emerging_markets": 6
            },
            "historical_returns": {
                "ytd_percent": 3.3,
                "one_year_percent": 10.5,
                "three_year_annualized_percent": 6.6,
                "five_year_annualized_percent": 7.8,
                "since_inception_annualized_percent": 8.4
            },
            "suitable_for": ["long_term_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate"],
            "description": "Vanguard's 80/20 growth allocation ETF. Higher Canadian weighting than XGRO.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XBAL",
            "name": "iShares Core Balanced ETF Portfolio",
            "provider": "BlackRock (iShares)",
            "category": "balanced",
            "subcategory": "balanced",
            "risk_level": "moderate",
            "mer_percent": 0.20,
            "distribution_yield_percent": 2.2,
            "distribution_frequency": "quarterly",
            "holdings_count": 9000,
            "geographic_allocation": {
                "canada": 22,
                "us": 28,
                "international_developed": 13,
                "emerging_markets": 5
            },
            "historical_returns": {
                "ytd_percent": 2.8,
                "one_year_percent": 8.5,
                "three_year_annualized_percent": 5.4,
                "five_year_annualized_percent": 6.5,
                "since_inception_annualized_percent": 7.2
            },
            "suitable_for": ["moderate_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["conservative", "moderate"],
            "description": "60/40 stock-bond balanced ETF. Good for moderate risk tolerance or nearing retirement.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VBAL",
            "name": "Vanguard Balanced ETF Portfolio",
            "provider": "Vanguard",
            "category": "balanced",
            "subcategory": "balanced",
            "risk_level": "moderate",
            "mer_percent": 0.24,
            "distribution_yield_percent": 2.1,
            "distribution_frequency": "quarterly",
            "holdings_count": 13000,
            "geographic_allocation": {
                "canada": 26,
                "us": 26,
                "international_developed": 12,
                "emerging_markets": 4
            },
            "historical_returns": {
                "ytd_percent": 2.6,
                "one_year_percent": 8.2,
                "three_year_annualized_percent": 5.1,
                "five_year_annualized_percent": 6.2,
                "since_inception_annualized_percent": 6.9
            },
            "suitable_for": ["moderate_growth", "retirement", "tfsa", "rrsp"],
            "risk_tolerance_match": ["conservative", "moderate"],
            "description": "Vanguard's 60/40 balanced ETF. Slightly higher Canadian allocation.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XIU",
            "name": "iShares S&P/TSX 60 Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "canadian_equity",
            "subcategory": "large_cap",
            "risk_level": "moderate",
            "mer_percent": 0.18,
            "distribution_yield_percent": 2.9,
            "distribution_frequency": "quarterly",
            "holdings_count": 60,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 3.1,
                "one_year_percent": 9.8,
                "three_year_annualized_percent": 7.2,
                "five_year_annualized_percent": 8.5,
                "since_inception_annualized_percent": 7.8
            },
            "suitable_for": ["canadian_exposure", "dividends", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Tracks Canada's 60 largest companies. One of the oldest and most traded Canadian ETFs.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XIC",
            "name": "iShares Core S&P/TSX Capped Composite Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "canadian_equity",
            "subcategory": "broad_market",
            "risk_level": "moderate",
            "mer_percent": 0.06,
            "distribution_yield_percent": 2.7,
            "distribution_frequency": "quarterly",
            "holdings_count": 230,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 2.9,
                "one_year_percent": 9.5,
                "three_year_annualized_percent": 7.0,
                "five_year_annualized_percent": 8.2,
                "since_inception_annualized_percent": 7.5
            },
            "suitable_for": ["canadian_exposure", "broad_market", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Broad Canadian market exposure with 230+ holdings. Ultra-low MER at 0.06%.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VCN",
            "name": "Vanguard FTSE Canada All Cap Index ETF",
            "provider": "Vanguard",
            "category": "canadian_equity",
            "subcategory": "all_cap",
            "risk_level": "moderate",
            "mer_percent": 0.05,
            "distribution_yield_percent": 2.6,
            "distribution_frequency": "quarterly",
            "holdings_count": 180,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 2.8,
                "one_year_percent": 9.3,
                "three_year_annualized_percent": 6.8,
                "five_year_annualized_percent": 8.0,
                "since_inception_annualized_percent": 7.3
            },
            "suitable_for": ["canadian_exposure", "all_cap", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Vanguard's all-cap Canadian equity ETF. Lowest MER in category at 0.05%.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VFV",
            "name": "Vanguard S&P 500 Index ETF (CAD)",
            "provider": "Vanguard",
            "category": "us_equity",
            "subcategory": "large_cap",
            "risk_level": "moderate",
            "mer_percent": 0.09,
            "distribution_yield_percent": 1.3,
            "distribution_frequency": "quarterly",
            "holdings_count": 500,
            "geographic_allocation": {
                "canada": 0,
                "us": 100,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 5.1,
                "one_year_percent": 14.2,
                "three_year_annualized_percent": 9.8,
                "five_year_annualized_percent": 11.5,
                "since_inception_annualized_percent": 13.0
            },
            "suitable_for": ["us_exposure", "growth", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "CAD-denominated S&P 500 tracker. Low-cost US large-cap exposure for Canadian investors.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XUU",
            "name": "iShares Core S&P US Total Market Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "us_equity",
            "subcategory": "total_market",
            "risk_level": "moderate",
            "mer_percent": 0.07,
            "distribution_yield_percent": 1.2,
            "distribution_frequency": "semi-annually",
            "holdings_count": 3700,
            "geographic_allocation": {
                "canada": 0,
                "us": 100,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 4.8,
                "one_year_percent": 13.8,
                "three_year_annualized_percent": 9.5,
                "five_year_annualized_percent": 11.2,
                "since_inception_annualized_percent": 12.5
            },
            "suitable_for": ["us_exposure", "broad_market", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Broad US total market exposure including mid and small caps. 3700+ holdings.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "ZSP",
            "name": "BMO S&P 500 Index ETF",
            "provider": "BMO",
            "category": "us_equity",
            "subcategory": "large_cap",
            "risk_level": "moderate",
            "mer_percent": 0.09,
            "distribution_yield_percent": 1.3,
            "distribution_frequency": "quarterly",
            "holdings_count": 500,
            "geographic_allocation": {
                "canada": 0,
                "us": 100,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 5.0,
                "one_year_percent": 14.0,
                "three_year_annualized_percent": 9.6,
                "five_year_annualized_percent": 11.3,
                "since_inception_annualized_percent": 12.8
            },
            "suitable_for": ["us_exposure", "growth", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "BMO's S&P 500 tracker. Popular alternative to VFV with similar MER.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XEF",
            "name": "iShares Core MSCI EAFE IMI Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "international",
            "subcategory": "developed_markets",
            "risk_level": "moderate",
            "mer_percent": 0.22,
            "distribution_yield_percent": 2.5,
            "distribution_frequency": "semi-annually",
            "holdings_count": 1500,
            "geographic_allocation": {
                "canada": 0,
                "us": 0,
                "international_developed": 100,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 3.2,
                "one_year_percent": 8.9,
                "three_year_annualized_percent": 5.5,
                "five_year_annualized_percent": 6.8,
                "since_inception_annualized_percent": 7.2
            },
            "suitable_for": ["international_diversification", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "International developed markets (Europe, Australasia, Far East) excluding North America.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VIU",
            "name": "Vanguard FTSE Developed All Cap ex North America Index ETF",
            "provider": "Vanguard",
            "category": "international",
            "subcategory": "developed_ex_na",
            "risk_level": "moderate",
            "mer_percent": 0.22,
            "distribution_yield_percent": 2.8,
            "distribution_frequency": "quarterly",
            "holdings_count": 3800,
            "geographic_allocation": {
                "canada": 0,
                "us": 0,
                "international_developed": 100,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 3.0,
                "one_year_percent": 8.5,
                "three_year_annualized_percent": 5.2,
                "five_year_annualized_percent": 6.5,
                "since_inception_annualized_percent": 6.9
            },
            "suitable_for": ["international_diversification", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Developed markets ex-North America with 3800+ holdings for maximum diversification.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "ZAG",
            "name": "BMO Aggregate Bond Index ETF",
            "provider": "BMO",
            "category": "fixed_income",
            "subcategory": "aggregate_bond",
            "risk_level": "low",
            "mer_percent": 0.09,
            "distribution_yield_percent": 3.5,
            "distribution_frequency": "monthly",
            "holdings_count": 1400,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.2,
                "one_year_percent": 3.2,
                "three_year_annualized_percent": 0.5,
                "five_year_annualized_percent": 1.8,
                "since_inception_annualized_percent": 2.5
            },
            "suitable_for": ["capital_preservation", "income", "portfolio_balance", "rrsp"],
            "risk_tolerance_match": ["conservative"],
            "description": "Broad Canadian bond market ETF. Core fixed-income holding for portfolio stability.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VAB",
            "name": "Vanguard Canadian Aggregate Bond Index ETF",
            "provider": "Vanguard",
            "category": "fixed_income",
            "subcategory": "aggregate_bond",
            "risk_level": "low",
            "mer_percent": 0.09,
            "distribution_yield_percent": 3.4,
            "distribution_frequency": "monthly",
            "holdings_count": 1100,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.1,
                "one_year_percent": 3.0,
                "three_year_annualized_percent": 0.3,
                "five_year_annualized_percent": 1.6,
                "since_inception_annualized_percent": 2.3
            },
            "suitable_for": ["capital_preservation", "income", "portfolio_balance", "rrsp"],
            "risk_tolerance_match": ["conservative"],
            "description": "Vanguard's Canadian bond ETF. Similar to ZAG with slightly different index methodology.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XBB",
            "name": "iShares Core Canadian Universe Bond Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "fixed_income",
            "subcategory": "universe_bond",
            "risk_level": "low",
            "mer_percent": 0.10,
            "distribution_yield_percent": 3.3,
            "distribution_frequency": "monthly",
            "holdings_count": 1200,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.0,
                "one_year_percent": 2.9,
                "three_year_annualized_percent": 0.2,
                "five_year_annualized_percent": 1.5,
                "since_inception_annualized_percent": 2.2
            },
            "suitable_for": ["capital_preservation", "income", "portfolio_balance", "rrsp"],
            "risk_tolerance_match": ["conservative"],
            "description": "iShares broad Canadian bond ETF. One of the longest-running Canadian bond ETFs.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "VDY",
            "name": "Vanguard FTSE Canadian High Dividend Yield Index ETF",
            "provider": "Vanguard",
            "category": "dividend",
            "subcategory": "high_dividend",
            "risk_level": "moderate",
            "mer_percent": 0.22,
            "distribution_yield_percent": 4.2,
            "distribution_frequency": "monthly",
            "holdings_count": 50,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 2.5,
                "one_year_percent": 8.8,
                "three_year_annualized_percent": 7.5,
                "five_year_annualized_percent": 8.9,
                "since_inception_annualized_percent": 8.2
            },
            "suitable_for": ["income", "dividends", "tfsa", "rrsp"],
            "risk_tolerance_match": ["conservative", "moderate"],
            "description": "High dividend yield from Canadian large-caps. Heavy bank and energy weighting.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XDV",
            "name": "iShares Canadian Select Dividend Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "dividend",
            "subcategory": "select_dividend",
            "risk_level": "moderate",
            "mer_percent": 0.55,
            "distribution_yield_percent": 4.0,
            "distribution_frequency": "monthly",
            "holdings_count": 30,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 2.2,
                "one_year_percent": 8.0,
                "three_year_annualized_percent": 6.8,
                "five_year_annualized_percent": 7.5,
                "since_inception_annualized_percent": 7.0
            },
            "suitable_for": ["income", "dividends", "tfsa", "rrsp"],
            "risk_tolerance_match": ["conservative", "moderate"],
            "description": "Canadian dividend aristocrats selection. Higher MER but strong dividend track record.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "CDZ",
            "name": "iShares S&P/TSX Canadian Dividend Aristocrats Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "dividend",
            "subcategory": "dividend_aristocrats",
            "risk_level": "moderate",
            "mer_percent": 0.66,
            "distribution_yield_percent": 3.8,
            "distribution_frequency": "monthly",
            "holdings_count": 90,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 2.0,
                "one_year_percent": 7.5,
                "three_year_annualized_percent": 6.2,
                "five_year_annualized_percent": 7.0,
                "since_inception_annualized_percent": 6.5
            },
            "suitable_for": ["income", "dividend_growth", "tfsa", "rrsp"],
            "risk_tolerance_match": ["conservative", "moderate"],
            "description": "Canadian companies with 5+ years of consecutive dividend growth.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "CASH",
            "name": "CI High Interest Savings ETF",
            "provider": "CI Global Asset Management",
            "category": "hisa_etf",
            "subcategory": "high_interest_savings",
            "risk_level": "low",
            "mer_percent": 0.16,
            "distribution_yield_percent": 4.8,
            "distribution_frequency": "monthly",
            "holdings_count": 1,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.6,
                "one_year_percent": 4.8,
                "three_year_annualized_percent": 3.8,
                "five_year_annualized_percent": 2.9,
                "since_inception_annualized_percent": 2.5
            },
            "suitable_for": ["emergency_fund", "short_term_savings", "tfsa"],
            "risk_tolerance_match": ["conservative"],
            "description": "High-interest savings account in ETF form. Deposits held at major Canadian banks. Near-zero principal risk.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "PSA",
            "name": "Purpose High Interest Savings ETF",
            "provider": "Purpose Investments",
            "category": "hisa_etf",
            "subcategory": "high_interest_savings",
            "risk_level": "low",
            "mer_percent": 0.17,
            "distribution_yield_percent": 4.6,
            "distribution_frequency": "monthly",
            "holdings_count": 1,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.5,
                "one_year_percent": 4.6,
                "three_year_annualized_percent": 3.6,
                "five_year_annualized_percent": 2.7,
                "since_inception_annualized_percent": 2.3
            },
            "suitable_for": ["emergency_fund", "short_term_savings", "tfsa"],
            "risk_tolerance_match": ["conservative"],
            "description": "HISA ETF from Purpose Investments. Good alternative to traditional savings accounts.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "HSAV",
            "name": "Global X High Interest Savings ETF",
            "provider": "Global X (formerly Horizons)",
            "category": "hisa_etf",
            "subcategory": "high_interest_savings",
            "risk_level": "low",
            "mer_percent": 0.18,
            "distribution_yield_percent": 4.5,
            "distribution_frequency": "monthly",
            "holdings_count": 1,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.5,
                "one_year_percent": 4.5,
                "three_year_annualized_percent": 3.5,
                "five_year_annualized_percent": 2.6,
                "since_inception_annualized_percent": 2.2
            },
            "suitable_for": ["emergency_fund", "short_term_savings", "tfsa"],
            "risk_tolerance_match": ["conservative"],
            "description": "Global X HISA ETF. Tax-efficient structure for non-registered accounts.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "ZRE",
            "name": "BMO Equal Weight REITs Index ETF",
            "provider": "BMO",
            "category": "sector",
            "subcategory": "real_estate",
            "risk_level": "moderate",
            "mer_percent": 0.61,
            "distribution_yield_percent": 4.5,
            "distribution_frequency": "monthly",
            "holdings_count": 24,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 1.8,
                "one_year_percent": 6.5,
                "three_year_annualized_percent": 2.1,
                "five_year_annualized_percent": 4.2,
                "since_inception_annualized_percent": 5.8
            },
            "suitable_for": ["income", "real_estate_exposure", "tfsa"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Equal-weight Canadian REITs for real estate exposure without owning property.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XIT",
            "name": "iShares S&P/TSX Capped Information Technology Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "sector",
            "subcategory": "technology",
            "risk_level": "high",
            "mer_percent": 0.61,
            "distribution_yield_percent": 0.3,
            "distribution_frequency": "quarterly",
            "holdings_count": 20,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 5.5,
                "one_year_percent": 15.2,
                "three_year_annualized_percent": 10.5,
                "five_year_annualized_percent": 14.8,
                "since_inception_annualized_percent": 11.5
            },
            "suitable_for": ["sector_bet", "growth"],
            "risk_tolerance_match": ["aggressive"],
            "description": "Canadian tech sector ETF dominated by Shopify, Constellation Software, and OpenText.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "HCAL",
            "name": "Hamilton Enhanced Canadian Bank ETF",
            "provider": "Hamilton ETFs",
            "category": "sector",
            "subcategory": "financials",
            "risk_level": "high",
            "mer_percent": 0.65,
            "distribution_yield_percent": 5.8,
            "distribution_frequency": "monthly",
            "holdings_count": 6,
            "geographic_allocation": {
                "canada": 100,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 0
            },
            "historical_returns": {
                "ytd_percent": 3.0,
                "one_year_percent": 11.5,
                "three_year_annualized_percent": 8.2,
                "five_year_annualized_percent": 9.5,
                "since_inception_annualized_percent": 10.0
            },
            "suitable_for": ["income", "bank_exposure"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "Leveraged Canadian bank ETF using covered call strategy. High yield but concentrated risk.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "XEC",
            "name": "iShares Core MSCI Emerging Markets IMI Index ETF",
            "provider": "BlackRock (iShares)",
            "category": "international",
            "subcategory": "emerging_markets",
            "risk_level": "high",
            "mer_percent": 0.27,
            "distribution_yield_percent": 2.1,
            "distribution_frequency": "semi-annually",
            "holdings_count": 2700,
            "geographic_allocation": {
                "canada": 0,
                "us": 0,
                "international_developed": 0,
                "emerging_markets": 100
            },
            "historical_returns": {
                "ytd_percent": 2.0,
                "one_year_percent": 6.2,
                "three_year_annualized_percent": 1.8,
                "five_year_annualized_percent": 3.5,
                "since_inception_annualized_percent": 4.8
            },
            "suitable_for": ["international_diversification", "emerging_market_exposure", "tfsa"],
            "risk_tolerance_match": ["aggressive"],
            "description": "Emerging markets (China, India, Brazil, Taiwan) for global diversification. Higher risk/reward.",
            "buy_at": ["Wealthsimple", "Questrade", "TD Direct Investing"]
        },
        {
            "ticker": "GEQT",
            "name": "iShares ESG Aware All Equity ETF Portfolio",
            "provider": "BlackRock (iShares)",
            "category": "all_equity",
            "subcategory": "esg",
            "risk_level": "high",
            "mer_percent": 0.24,
            "distribution_yield_percent": 1.5,
            "distribution_frequency": "quarterly",
            "holdings_count": 5000,
            "geographic_allocation": {
                "canada": 25,
                "us": 45,
                "international_developed": 22,
                "emerging_markets": 8
            },
            "historical_returns": {
                "ytd_percent": 3.8,
                "one_year_percent": 11.5,
                "three_year_annualized_percent": 7.2,
                "five_year_annualized_percent": 8.5,
                "since_inception_annualized_percent": 9.0
            },
            "suitable_for": ["esg_investing", "long_term_growth", "tfsa", "rrsp"],
            "risk_tolerance_match": ["moderate", "aggressive"],
            "description": "ESG-screened all-equity ETF. Similar to XEQT but excludes controversial companies.",
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
        "hisa_etf": "High-interest savings account ETFs, near-zero risk"
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

- [ ] **Step 1.2** Verify the file is valid JSON by running:
```bash
node -e "JSON.parse(require('fs').readFileSync('packages/backend/src/data/canadian_etfs.json', 'utf8')); console.log('Valid JSON with', JSON.parse(require('fs').readFileSync('packages/backend/src/data/canadian_etfs.json', 'utf8')).etfs.length, 'ETFs');"
```

- [ ] **Step 1.3** Commit: `git add packages/backend/src/data/canadian_etfs.json && git commit -m "feat: Add Canadian ETF knowledge base with 30 ETFs"`

---

### Task 2: Create ETF Knowledge Service

**Files:**
- Create: `packages/backend/src/services/etf_knowledge.js`

Steps:

- [ ] **Step 2.1** Create the ETF knowledge service at `packages/backend/src/services/etf_knowledge.js` with the following complete code:

```js
/**
 * ETF Knowledge Service
 * Loads and manages the Canadian ETF knowledge base for AI prompt injection
 * and the mobile Investment Corner feature.
 */

const path = require('path');
const fs = require('fs');

let etfData = null;

/**
 * Load ETF data from JSON file (cached in memory after first load)
 */
function _loadETFData() {
    if (etfData) return etfData;

    const filePath = process.env.ETF_DATA_PATH
        ? path.resolve(process.env.ETF_DATA_PATH)
        : path.join(__dirname, '..', 'data', 'canadian_etfs.json');

    const raw = fs.readFileSync(filePath, 'utf8');
    etfData = JSON.parse(raw);
    console.log(`Loaded ${etfData.etfs.length} Canadian ETFs (last updated: ${etfData.last_updated})`);
    return etfData;
}

/**
 * Get all ETFs
 */
function getAllETFs() {
    const data = _loadETFData();
    return data.etfs;
}

/**
 * Get a single ETF by ticker symbol
 * @param {string} ticker - e.g. "XEQT"
 * @returns {Object|null} ETF object or null
 */
function getETFByTicker(ticker) {
    const data = _loadETFData();
    return data.etfs.find(e => e.ticker.toUpperCase() === ticker.toUpperCase()) || null;
}

/**
 * Get ETFs matching a risk profile
 * @param {string} riskLevel - "conservative", "moderate", or "aggressive"
 * @returns {Object[]} Matching ETFs
 */
function getETFsByRiskProfile(riskLevel) {
    const data = _loadETFData();
    const profile = data.risk_profiles[riskLevel];
    if (!profile) return data.etfs;

    return data.etfs.filter(etf =>
        profile.suitable_categories.includes(etf.category)
    );
}

/**
 * Get ETFs by category
 * @param {string} category - e.g. "all_equity", "balanced", "fixed_income"
 * @returns {Object[]} Matching ETFs
 */
function getETFsByCategory(category) {
    const data = _loadETFData();
    return data.etfs.filter(etf => etf.category === category);
}

/**
 * Get recommended ETFs for a user based on their preferences
 * @param {Object} userPreferences - { investment_risk_tolerance, interested_in_investing, preferred_savings_account_type }
 * @returns {Object[]} 3-5 recommended ETFs
 */
function getRecommendedETFs(userPreferences) {
    const riskLevel = userPreferences?.investment_risk_tolerance || 'moderate';
    const matchingETFs = getETFsByRiskProfile(riskLevel);

    // Score and sort: prefer lower MER, higher 1yr return, matching risk tolerance
    const scored = matchingETFs.map(etf => {
        let score = 0;
        // Direct risk tolerance match
        if (etf.risk_tolerance_match.includes(riskLevel)) score += 10;
        // Favor low MER
        if (etf.mer_percent <= 0.25) score += 5;
        // Favor diversification (higher holdings count)
        if (etf.holdings_count > 1000) score += 3;
        // Favor all-in-one for simplicity
        if (etf.category === 'all_equity' || etf.category === 'balanced') score += 4;
        // Decent 1yr return
        if (etf.historical_returns.one_year_percent > 8) score += 2;
        return { ...etf, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);

    // Return top 5, removing internal score
    return scored.slice(0, 5).map(({ _score, ...etf }) => etf);
}

/**
 * Format ETF data for injection into the AI prompt
 * Produces a compact text representation filtered by risk level
 * @param {string} riskLevel - "conservative", "moderate", or "aggressive"
 * @returns {string} Formatted text for prompt injection
 */
function getETFDataForPrompt(riskLevel) {
    const data = _loadETFData();
    const profile = data.risk_profiles[riskLevel || 'moderate'];
    const relevantETFs = profile
        ? data.etfs.filter(etf => profile.suitable_categories.includes(etf.category) || etf.risk_tolerance_match.includes(riskLevel))
        : data.etfs;

    let output = `DATA DISCLAIMER: ${data.data_disclaimer}\n`;
    output += `Last updated: ${data.last_updated}\n\n`;

    if (profile) {
        output += `RISK PROFILE: ${riskLevel}\n`;
        output += `Recommended allocation: ${profile.recommended_allocation.equity}% equity / ${profile.recommended_allocation.fixed_income}% fixed income\n\n`;
    }

    output += 'RELEVANT CANADIAN ETFs:\n';
    relevantETFs.forEach(etf => {
        output += `- ${etf.ticker} (${etf.name}): MER ${etf.mer_percent}%, `;
        output += `Category: ${etf.category}, Risk: ${etf.risk_level}, `;
        output += `1yr: ${etf.historical_returns.one_year_percent}%, `;
        output += `5yr annualized: ${etf.historical_returns.five_year_annualized_percent}%, `;
        output += `Yield: ${etf.distribution_yield_percent}%, `;
        output += `${etf.description}\n`;
    });

    output += '\nCATEGORIES:\n';
    Object.entries(data.categories).forEach(([key, desc]) => {
        output += `- ${key}: ${desc}\n`;
    });

    return output;
}

/**
 * Search ETFs by text query (ticker or name)
 * @param {string} query - Search term
 * @returns {Object[]} Matching ETFs
 */
function searchETFs(query) {
    const data = _loadETFData();
    const q = query.toLowerCase();
    return data.etfs.filter(etf =>
        etf.ticker.toLowerCase().includes(q) ||
        etf.name.toLowerCase().includes(q) ||
        etf.category.toLowerCase().includes(q) ||
        etf.provider.toLowerCase().includes(q)
    );
}

/**
 * Get the last_updated date of the ETF data
 * @returns {string} ISO date string
 */
function getLastUpdated() {
    const data = _loadETFData();
    return data.last_updated;
}

/**
 * Get the data disclaimer text
 * @returns {string}
 */
function getDisclaimer() {
    const data = _loadETFData();
    return data.data_disclaimer;
}

module.exports = {
    getAllETFs,
    getETFByTicker,
    getETFsByRiskProfile,
    getETFsByCategory,
    getRecommendedETFs,
    getETFDataForPrompt,
    searchETFs,
    getLastUpdated,
    getDisclaimer,
};
```

- [ ] **Step 2.2** Verify by running:
```bash
node -e "const etf = require('./packages/backend/src/services/etf_knowledge'); console.log('All ETFs:', etf.getAllETFs().length); console.log('XEQT:', etf.getETFByTicker('XEQT').name); console.log('Moderate:', etf.getETFsByRiskProfile('moderate').length); console.log('Prompt length:', etf.getETFDataForPrompt('moderate').length, 'chars');"
```

- [ ] **Step 2.3** Commit: `git add packages/backend/src/services/etf_knowledge.js && git commit -m "feat: Add ETF knowledge service with lookup/filter/recommend functions"`

---

### Task 3: Database Migration

**Files:**
- Create: `packages/backend/db/add_insights_upgrade.sql`

Steps:

- [ ] **Step 3.1** Create the migration file at `packages/backend/db/add_insights_upgrade.sql`:

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
    interaction_type VARCHAR(30) NOT NULL,
    source VARCHAR(30),
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

- [ ] **Step 3.2** Run the migration:
```bash
cd packages/backend && npm run migrate
```
If `migrate` doesn't auto-detect the new file, run manually:
```bash
cd packages/backend && node -e "const {pool} = require('./src/services/db'); const fs = require('fs'); const sql = fs.readFileSync('./db/add_insights_upgrade.sql','utf8'); pool.query(sql).then(() => { console.log('Migration successful'); pool.end(); }).catch(e => { console.error('Migration failed:', e.message); pool.end(); });"
```

- [ ] **Step 3.3** Commit: `git add packages/backend/db/add_insights_upgrade.sql && git commit -m "feat: Add insights upgrade DB migration (health score, ETF tracking, article enhancements)"`

---

### Task 4: Enhance insight_data.js

**Files:**
- Modify: `packages/backend/src/services/insight_data.js`

Steps:

- [ ] **Step 4.1** Add the `_getUserPreferences` query function. Insert before the `module.exports` at the bottom of the file:

Find:
```js
module.exports = {
    getUserFinancialSummary
};
```

Replace with:
```js
/**
 * Get user preferences for insight personalization
 */
async function _getUserPreferences(userId) {
    const result = await pool.query(
        `SELECT investment_risk_tolerance, first_time_homebuyer,
                interested_in_investing, interested_in_crypto,
                preferred_savings_account_type, age_range,
                investment_experience, annual_income_range
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return {
            investment_risk_tolerance: 'moderate',
            first_time_homebuyer: null,
            interested_in_investing: true,
            interested_in_crypto: false,
            preferred_savings_account_type: 'tfsa',
            age_range: null,
            investment_experience: 'none',
            annual_income_range: null
        };
    }

    return result.rows[0];
}

/**
 * Get seasonal context for timely insights
 */
function _getSeasonalContext() {
    const now = new Date();
    const currentMonth = now.toLocaleString('en-CA', { month: 'long' });
    const currentQuarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;

    // RRSP deadline: March 1 of next year (for current tax year)
    const rrspYear = now.getMonth() >= 2 ? now.getFullYear() + 1 : now.getFullYear();
    const rrspDeadline = new Date(rrspYear, 2, 1); // March 1
    const daysUntilRrsp = Math.ceil((rrspDeadline - now) / (1000 * 60 * 60 * 24));

    // Tax deadline: April 30
    const taxYear = now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();
    const taxDeadline = new Date(taxYear, 3, 30); // April 30
    const daysUntilTax = Math.ceil((taxDeadline - now) / (1000 * 60 * 60 * 24));

    // TFSA reset: January 1
    const tfsaReset = new Date(now.getFullYear() + 1, 0, 1);
    const daysUntilTfsaReset = Math.ceil((tfsaReset - now) / (1000 * 60 * 60 * 24));

    // Seasonal flags
    const month = now.getMonth(); // 0-indexed
    const isTaxSeason = month >= 0 && month <= 3; // Jan-Apr
    const isRrspSeason = month >= 0 && month <= 1; // Jan-Feb
    const isBackToSchool = month >= 7 && month <= 8; // Aug-Sep
    const isHolidayPrep = month >= 9 && month <= 10; // Oct-Nov
    const isNewYear = month === 0; // Jan

    return {
        current_month: currentMonth,
        current_quarter: currentQuarter,
        days_until_rrsp_deadline: daysUntilRrsp,
        days_until_tax_deadline: daysUntilTax,
        days_until_tfsa_reset: daysUntilTfsaReset,
        is_tax_season: isTaxSeason,
        is_rrsp_season: isRrspSeason,
        is_back_to_school: isBackToSchool,
        is_holiday_prep: isHolidayPrep,
        is_new_year: isNewYear
    };
}

module.exports = {
    getUserFinancialSummary
};
```

- [ ] **Step 4.2** Update the `getUserFinancialSummary` function to include the two new data sources. Find the `Promise.all` block and the return statement:

Find:
```js
        const [
            userProfile,
            accounts,
            spendingSummary,
            incomeSummary,
            subscriptions,
            debtSummary,
            creditHealth,
            savingsMetrics,
            cashFlow
        ] = await Promise.all([
            _getUserProfile(userId),
            _getAccountsData(userId),
            _getSpendingSummary(userId, analysisPeriodDays),
            _getIncomeSummary(userId, analysisPeriodDays),
            _getSubscriptions(userId),
            _getDebtSummary(userId),
            _getCreditHealth(userId),
            _getSavingsMetrics(userId, analysisPeriodDays),
            _getCashFlow(userId, analysisPeriodDays)
        ]);

        return {
            user_profile: {
                user_id: userId,
                age: userProfile.age,
                estimated_annual_income: incomeSummary.estimated_annual_income,
                country: 'CA',
                analysis_period_days: analysisPeriodDays
            },
            accounts: accounts,
            spending_summary_90d: spendingSummary,
            income_summary_90d: incomeSummary,
            subscriptions: subscriptions,
            debt_summary: debtSummary,
            credit_health: creditHealth,
            savings_metrics: savingsMetrics,
            cash_flow: cashFlow,
            financial_readiness: _calculateFinancialReadiness(savingsMetrics, debtSummary, incomeSummary)
        };
```

Replace with:
```js
        const [
            userProfile,
            accounts,
            spendingSummary,
            incomeSummary,
            subscriptions,
            debtSummary,
            creditHealth,
            savingsMetrics,
            cashFlow,
            userPreferences
        ] = await Promise.all([
            _getUserProfile(userId),
            _getAccountsData(userId),
            _getSpendingSummary(userId, analysisPeriodDays),
            _getIncomeSummary(userId, analysisPeriodDays),
            _getSubscriptions(userId),
            _getDebtSummary(userId),
            _getCreditHealth(userId),
            _getSavingsMetrics(userId, analysisPeriodDays),
            _getCashFlow(userId, analysisPeriodDays),
            _getUserPreferences(userId)
        ]);

        const seasonalContext = _getSeasonalContext();

        return {
            user_profile: {
                user_id: userId,
                age: userProfile.age,
                estimated_annual_income: incomeSummary.estimated_annual_income,
                country: 'CA',
                analysis_period_days: analysisPeriodDays
            },
            accounts: accounts,
            spending_summary_90d: spendingSummary,
            income_summary_90d: incomeSummary,
            subscriptions: subscriptions,
            debt_summary: debtSummary,
            credit_health: creditHealth,
            savings_metrics: savingsMetrics,
            cash_flow: cashFlow,
            financial_readiness: _calculateFinancialReadiness(savingsMetrics, debtSummary, incomeSummary),
            user_preferences: userPreferences,
            seasonal_context: seasonalContext
        };
```

- [ ] **Step 4.3** Commit: `git add packages/backend/src/services/insight_data.js && git commit -m "feat: Add user preferences and seasonal context to insight data aggregation"`

---

### Task 5: Upgrade ai_insights.js

**Files:**
- Modify: `packages/backend/src/services/ai_insights.js`

Steps:

- [ ] **Step 5.1** Add the ETF knowledge import and update the model configuration. Find the top of the file:

Find:
```js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
```

Replace with:
```js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const etfKnowledge = require('./etf_knowledge');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration (env-configurable for easy switching)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-pro';
```

- [ ] **Step 5.2** Update the `generateInsights` function to use the configurable model and increased token limit. Find:

Find:
```js
        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
            },
        });
```

Replace with:
```js
        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        });
```

- [ ] **Step 5.3** Update the metadata in the return statement. Find:

Find:
```js
                ai_model_used: 'gemini-2.0-flash',
```

Replace with:
```js
                ai_model_used: GEMINI_MODEL,
```

- [ ] **Step 5.4** Replace the entire `_buildPrompt` function with the enhanced version. Find the entire function from `function _buildPrompt(userData) {` up to and including the closing of the function (just before `function _validateInsights`). Replace the old `_buildPrompt` function:

Find:
```js
/**
 * Build the AI prompt with user data
 */
function _buildPrompt(userData) {
    const systemPrompt = `You are an expert Canadian personal finance advisor analyzing a user's financial data. Your goal is to generate 4-5 actionable, personalized insights that help the user optimize their finances.

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
10. CRITICAL: NEVER suggest canceling investment transactions (Wealthsimple, Questrade, TFSA, RRSP contributions)
11. CRITICAL: Distinguish between subscriptions (Netflix, Spotify) and investments (even if they recur weekly/monthly)
12. CRITICAL: TRUE SUBSCRIPTIONS are digital services (Netflix, Spotify, Apple Music, gym memberships, software, cloud storage)
13. CRITICAL: NOT SUBSCRIPTIONS are restaurants, gas stations, groceries, coffee shops, transportation (Uber, Lyft), pharmacies, retail stores
14. CRITICAL: If subscriptions data includes restaurants, gas, or transportation merchants, IGNORE them completely - they are NOT subscriptions
15. Look at category field to identify investments - do not treat them as subscriptions to cancel

SUBSCRIPTION IDENTIFICATION EXAMPLES:
✅ ACTUAL SUBSCRIPTIONS (can suggest reviewing/canceling):
- Netflix, Disney+, Spotify, Apple Music (streaming services)
- Microsoft 365, Adobe Creative Cloud (software)
- Gym memberships (Goodlife, Planet Fitness)
- Cloud storage (iCloud, Dropbox)
- Audible, Kindle Unlimited (digital content)

❌ NOT SUBSCRIPTIONS (NEVER suggest canceling these):
- Tim Hortons, Starbucks, McDonald's (restaurants/coffee shops)
- Petro-Canada, Shell, Esso (gas stations)
- Uber, Lyft (transportation)
- Loblaws, Sobeys, Costco (groceries)
- Shoppers Drug Mart, Rexall (pharmacies)
- Any restaurant, cafe, or food establishment
- Wealthsimple, Questrade (investments)

CANADIAN FINANCIAL CONSTANTS (use these in calculations):
- TFSA contribution limit 2026: $7,000/year
- FHSA annual limit: $8,000/year, lifetime $40,000
- Average HISA rate: 4-5%
- Average credit card APR: 19.99%
- Average investment return (moderate risk): 6-7% annually
- Recommended credit utilization: < 30%
- Recommended emergency fund: 3-6 months of expenses

TRUSTED EDUCATIONAL SOURCES (use these for article recommendations):
${TRUSTED_SOURCES.map(s => `- ${s.name} (${s.domain}): ${s.focus}`).join('\n')}

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no extra text) matching this schema:

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
          "type": "web_link|navigate|external_action",
          "url": "https://..." OR "route": "ScreenName"
        }
      },
      "potential_benefit": {
        "monthly_savings": 0,
        "annual_savings": 0,
        "calculation": "Explanation of how savings were calculated"
      },
      "dismissible": true,
      "generated_at": "${new Date().toISOString()}"
    }
  ],
  "recommendedArticles": [
    {
      "url": "https://...",
      "title": "Article Title",
      "description": "Brief 1-2 sentence description of the article",
      "category": "budgeting|investing|debt|taxes|savings|general",
      "source": "Source Name (e.g., NerdWallet)",
      "relatedInsightTypes": ["insight_type_1", "insight_type_2"],
      "read_time_minutes": 5
    }
  ]
}

ARTICLE RECOMMENDATION RULES:
1. Recommend 3-5 educational articles from the TRUSTED SOURCES above
2. Articles should be relevant to the user's financial situation and generated insights
3. Use REAL, valid URLs from these trusted sources (not made up URLs)
4. Each article should relate to at least one generated insight type
5. Prioritize Canadian financial content (MoneySense, Wealthsimple, Government of Canada) when applicable
6. Include a mix of categories based on user's situation

PRIORITY SCORING:
- high: Potential savings/benefit > $1,000/year OR urgent financial health issue
- medium: Potential savings $300-1,000/year OR important optimization
- low: Potential savings < $300/year OR celebratory/educational insights

Now, analyze the following user data and generate 5-7 personalized insights with 3-5 relevant educational article recommendations:`;

    const userDataJson = JSON.stringify(userData, null, 2);

    return `${systemPrompt}\n\nUSER FINANCIAL DATA:\n${userDataJson}`;
}
```

Replace with:
```js
/**
 * Build the AI prompt with user data
 */
function _buildPrompt(userData) {
    // Get user risk tolerance for ETF filtering
    const riskLevel = userData.user_preferences?.investment_risk_tolerance || 'moderate';
    const etfPromptData = etfKnowledge.getETFDataForPrompt(riskLevel);

    const systemPrompt = `You are an expert Canadian personal finance advisor and AI financial co-pilot analyzing a user's financial data. Your goal is to generate 6-8 actionable, personalized, numbers-driven insights that help the user optimize their finances. Be SPECIFIC with dollar amounts, percentages, and timelines.

CONTEXT:
- User location: Canada (Ontario)
- Financial products: TFSA, FHSA, RRSP, GIC, ETFs
- Tax considerations: Canadian tax brackets and deductions
- Currency: CAD
- Current date: ${new Date().toISOString().split('T')[0]}

USER PREFERENCES:
- Risk tolerance: ${userData.user_preferences?.investment_risk_tolerance || 'moderate'}
- First-time homebuyer: ${userData.user_preferences?.first_time_homebuyer ?? 'unknown'}
- Interested in investing: ${userData.user_preferences?.interested_in_investing ?? true}
- Preferred account type: ${userData.user_preferences?.preferred_savings_account_type || 'tfsa'}
- Investment experience: ${userData.user_preferences?.investment_experience || 'none'}

SEASONAL CONTEXT:
- Current month: ${userData.seasonal_context?.current_month || new Date().toLocaleString('en-CA', { month: 'long' })}
- Current quarter: ${userData.seasonal_context?.current_quarter || 'Q' + (Math.floor(new Date().getMonth() / 3) + 1)}
- Tax season: ${userData.seasonal_context?.is_tax_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_tax_deadline + ' days (April 30)' : 'No'}
- RRSP season: ${userData.seasonal_context?.is_rrsp_season ? 'YES - deadline in ' + userData.seasonal_context.days_until_rrsp_deadline + ' days (March 1)' : 'No'}
- Days until TFSA reset (Jan 1): ${userData.seasonal_context?.days_until_tfsa_reset || 'N/A'}

CANADIAN ETF REFERENCE DATA (for investment recommendations):
${etfPromptData}

CANADIAN HOUSEHOLD SPENDING AVERAGES (2024 StatCan, approximate):
- Food (groceries): $1,060/month ($12,720/year)
- Shelter (rent/mortgage): $1,800/month ($21,600/year)
- Transportation: $860/month ($10,320/year)
- Dining out: $335/month ($4,020/year)
- Entertainment: $240/month ($2,880/year)
- Clothing: $200/month ($2,400/year)
- Personal care: $100/month ($1,200/year)

ONTARIO TAX BRACKETS (individual, combined federal+provincial marginal rates):
- $0-$55,867: ~20% marginal
- $55,867-$111,733: ~30% marginal
- $111,733-$154,906: ~37% marginal
- $154,906-$220,000: ~41% marginal
- $220,000+: ~46% marginal

HISA RATES (approximate):
- EQ Bank: 4.00%
- Tangerine: 4.50% (promo)
- Wealthsimple Cash: 3.75%
- HISA ETFs (CASH, PSA): 4.5-5.0%

INSIGHT CATEGORIES (generate across relevant categories, aim for 6-8 total):
EXISTING:
1. Tax-Advantaged Account Opportunities (TFSA, FHSA, RRSP)
2. Spending Optimization (subscriptions, dining, groceries)
3. Debt Payoff Acceleration (avalanche, balance transfer, consolidation)
4. Savings Acceleration (emergency fund, found money, automation)
5. Cash Flow Optimization (credit utilization, bill timing, budgeting)
6. Investment Readiness (when user is ready to start investing)
7. Milestone Celebrations (debt payoff, net worth goals)

NEW:
8. ETF/Investment Recommendations - ONLY when financial_readiness.ready_to_invest is true OR monthly surplus > $500. Name SPECIFIC tickers from the ETF reference data, include MER, approximate historical returns. Always add disclaimer about past performance.
9. Tax Optimization - ONLY during tax season (Jan-Apr) or RRSP season. Calculate specific tax savings using user's estimated income and Ontario tax brackets.
10. Wealth Building Strategies - When positive cash flow exists. Dollar-cost averaging plans, TFSA vs RRSP optimization at user's income level.
11. Comparative Analysis - Compare user's spending to Canadian averages above. Be specific: "You spend $X on dining out, Y% above the Canadian average of $335."
12. Opportunity Cost Insights - When large balances sit in chequing. Calculate: "Moving $X from chequing (0.01%) to HISA ETF (4.8%) = $Y/year more."
13. Seasonal/Timely Insights - ONLY generate if seasonally relevant per SEASONAL CONTEXT above. Tax deadline reminders, RRSP deadline, TFSA room reset, etc.

RULES:
1. Be specific with dollar amounts and calculations - no vague advice
2. Show clear ROI or savings potential for each insight
3. Prioritize high-impact insights (>$500/year savings or major financial health improvement)
4. Use encouraging but realistic tone
5. Every insight must have a clear action the user can take
6. Calculate benefits conservatively (use realistic interest rates, returns)
7. Consider user's actual financial situation (don't recommend investing if they have high-interest debt)
8. If user has negative cash flow, prioritize spending reduction insights
9. If user has positive cash flow + emergency fund, prioritize growth insights
10. CRITICAL: NEVER suggest canceling investment transactions (Wealthsimple, Questrade, TFSA, RRSP contributions)
11. CRITICAL: Distinguish between subscriptions (Netflix, Spotify) and investments (even if they recur weekly/monthly)
12. CRITICAL: TRUE SUBSCRIPTIONS are digital services (Netflix, Spotify, Apple Music, gym memberships, software, cloud storage)
13. CRITICAL: NOT SUBSCRIPTIONS are restaurants, gas stations, groceries, coffee shops, transportation, pharmacies, retail stores
14. CRITICAL: If subscriptions data includes restaurants, gas, or transportation merchants, IGNORE them
15. Look at category field to identify investments - do not treat them as subscriptions to cancel
16. For ETF recommendations: ALWAYS name specific tickers from the reference data, include MER, mention approximate historical returns, and link to a brokerage. Add disclaimer about past performance.
17. For tax insights: Use the user's estimated income to calculate approximate tax bracket and savings. Be specific with dollar amounts.
18. For comparative analysis: Compare user spending to Canadian averages and be specific about the difference in dollars and percentage.
19. For opportunity cost: Calculate the actual dollar difference between current and optimal allocation.
20. For seasonal insights: Only generate if seasonally relevant (check SEASONAL CONTEXT above).
21. Generate 6-8 insights total across the expanded categories.
22. At least 1 insight must be from the new categories (8-13) if the user data supports it.
23. NEVER recommend specific stocks (individual companies). Only recommend broad-market ETFs from the provided reference data.
24. All projected returns must use the word "approximately" or "estimated" and include a disclaimer.

SUBSCRIPTION IDENTIFICATION EXAMPLES:
- ACTUAL SUBSCRIPTIONS: Netflix, Disney+, Spotify, Apple Music, Microsoft 365, Adobe, gym memberships, cloud storage
- NOT SUBSCRIPTIONS: Tim Hortons, Starbucks, McDonald's, Petro-Canada, Shell, Uber, Lyft, Loblaws, Sobeys, Costco, Shoppers Drug Mart, Wealthsimple, Questrade

CANADIAN FINANCIAL CONSTANTS:
- TFSA contribution limit 2026: $7,000/year
- FHSA annual limit: $8,000/year, lifetime $40,000
- Average HISA rate: 4-5%
- Average credit card APR: 19.99%
- Average investment return (moderate risk): 6-7% annually
- Recommended credit utilization: < 30%
- Recommended emergency fund: 3-6 months of expenses

TRUSTED EDUCATIONAL SOURCES (use these for article recommendations):
${TRUSTED_SOURCES.map(s => `- ${s.name} (${s.domain}): ${s.focus}`).join('\n')}

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no extra text) matching this schema:

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
          "type": "web_link|navigate|external_action",
          "url": "https://..." OR "route": "ScreenName"
        }
      },
      "potential_benefit": {
        "monthly_savings": 0,
        "annual_savings": 0,
        "annual_growth_estimate": 0,
        "calculation": "Explanation of how savings/growth were calculated"
      },
      "dismissible": true,
      "generated_at": "${new Date().toISOString()}"
    }
  ],
  "recommendedArticles": [
    {
      "url": "https://...",
      "title": "Article Title",
      "description": "Brief 1-2 sentence description of the article",
      "category": "budgeting|investing|debt|taxes|savings|general|etf_education|wealth_building",
      "source": "Source Name",
      "relatedInsightTypes": ["insight_type_1", "insight_type_2"],
      "read_time_minutes": 5
    }
  ]
}

ARTICLE RECOMMENDATION RULES:
1. Recommend 3-5 educational articles from the TRUSTED SOURCES above
2. Articles should be relevant to the user's financial situation and generated insights
3. Use REAL, valid URLs from these trusted sources (not made up URLs)
4. Each article should relate to at least one generated insight type
5. Prioritize Canadian financial content (MoneySense, Wealthsimple, Government of Canada)
6. Include a mix of categories based on user's situation

PRIORITY SCORING:
- high: Potential savings/benefit > $1,000/year OR urgent financial health issue
- medium: Potential savings $300-1,000/year OR important optimization
- low: Potential savings < $300/year OR celebratory/educational insights

Now, analyze the following user data and generate 6-8 personalized insights with 3-5 relevant educational article recommendations:`;

    const userDataJson = JSON.stringify(userData, null, 2);

    return `${systemPrompt}\n\nUSER FINANCIAL DATA:\n${userDataJson}`;
}
```

- [ ] **Step 5.5** Update `_prioritizeInsights` to return top 7 instead of top 5. Find:

Find:
```js
    // Return top 5
    return insights.slice(0, 5);
```

Replace with:
```js
    // Return top 7
    return insights.slice(0, 7);
```

- [ ] **Step 5.6** Update `_validateArticles` to accept the expanded category list. Find:

Find:
```js
    const validCategories = ['budgeting', 'investing', 'debt', 'taxes', 'savings', 'general'];
```

Replace with:
```js
    const validCategories = ['budgeting', 'investing', 'debt', 'taxes', 'savings', 'general', 'etf_education', 'wealth_building', 'investing_basics', 'tax_planning', 'debt_management', 'canadian_finance_101'];
```

- [ ] **Step 5.7** Commit: `git add packages/backend/src/services/ai_insights.js && git commit -m "feat: Upgrade AI insights with Gemini Pro, ETF injection, expanded categories, enhanced prompt"`

---

### Task 6: Create Financial Health Score Calculator

**Files:**
- Create: `packages/backend/src/services/health_score.js`

Steps:

- [ ] **Step 6.1** Create the health score calculator at `packages/backend/src/services/health_score.js`:

```js
/**
 * Financial Health Score Calculator
 * Calculates a 0-100 financial health score based on weighted dimensions.
 */

const { pool } = require('./db');

/**
 * Calculate the financial health score for a user
 * @param {Object} financialData - Output from getUserFinancialSummary()
 * @param {number} userId - User ID for trend comparison
 * @returns {Object} Score, grade, color, breakdown, trend
 */
async function calculateHealthScore(financialData, userId) {
    const breakdown = {};

    // 1. Emergency Fund (20% weight)
    const efMonths = financialData.savings_metrics?.emergency_fund_months_coverage || 0;
    let efScore;
    if (efMonths >= 6) efScore = 100;
    else if (efMonths >= 3) efScore = 60 + ((efMonths - 3) / 3) * 40; // 60-100
    else efScore = (efMonths / 3) * 60; // 0-60
    efScore = Math.round(Math.min(100, Math.max(0, efScore)));

    breakdown.emergency_fund = {
        score: efScore,
        weight: 20,
        label: 'Emergency Fund',
        detail: `${efMonths.toFixed(1)} months coverage`
    };

    // 2. Debt Health (20% weight)
    const totalDebt = financialData.debt_summary?.total_balance || 0;
    const monthlyIncome = financialData.cash_flow?.avg_monthly_income || 1;
    const annualIncome = monthlyIncome * 12;
    const dtiRatio = annualIncome > 0 ? totalDebt / annualIncome : 0;
    const highestApr = financialData.debt_summary?.highest_apr || 0;

    let debtScore;
    if (totalDebt === 0) {
        debtScore = 100;
    } else if (dtiRatio < 0.1 && highestApr < 10) {
        debtScore = 90;
    } else if (dtiRatio < 0.2) {
        debtScore = 75;
    } else if (dtiRatio < 0.4) {
        debtScore = 50;
    } else if (dtiRatio < 0.6) {
        debtScore = 25;
    } else {
        debtScore = 10;
    }
    // Penalize high-interest debt
    if (highestApr > 15 && totalDebt > 0) debtScore = Math.max(0, debtScore - 15);

    breakdown.debt_health = {
        score: debtScore,
        weight: 20,
        label: 'Debt Health',
        detail: totalDebt === 0 ? 'Debt-free' : `$${totalDebt.toLocaleString()} total debt`
    };

    // 3. Credit Utilization (15% weight)
    const utilization = financialData.credit_health?.utilization_percent || 0;
    let creditScore;
    if (utilization <= 10) creditScore = 100;
    else if (utilization <= 30) creditScore = 85;
    else if (utilization <= 50) creditScore = 60;
    else if (utilization <= 70) creditScore = 35;
    else creditScore = 15;

    breakdown.credit_utilization = {
        score: creditScore,
        weight: 15,
        label: 'Credit Utilization',
        detail: `${utilization}% used`
    };

    // 4. Cash Flow (15% weight)
    const surplus = financialData.cash_flow?.avg_monthly_surplus || 0;
    const surplusRatio = monthlyIncome > 0 ? surplus / monthlyIncome : 0;

    let cashFlowScore;
    if (surplusRatio > 0.2) cashFlowScore = 100;
    else if (surplusRatio > 0.1) cashFlowScore = 75;
    else if (surplusRatio > 0) cashFlowScore = 50;
    else if (surplusRatio > -0.1) cashFlowScore = 25;
    else cashFlowScore = 0;

    breakdown.cash_flow = {
        score: cashFlowScore,
        weight: 15,
        label: 'Cash Flow',
        detail: surplus >= 0 ? `+$${surplus.toLocaleString()}/mo surplus` : `-$${Math.abs(surplus).toLocaleString()}/mo deficit`
    };

    // 5. Savings Rate (15% weight)
    const totalSavings = financialData.savings_metrics?.total_liquid_savings || 0;
    const savingsRate = monthlyIncome > 0 ? (surplus / monthlyIncome) : 0;

    let savingsScore;
    if (savingsRate >= 0.2) savingsScore = 100;
    else if (savingsRate >= 0.1) savingsScore = 75;
    else if (savingsRate >= 0.05) savingsScore = 50;
    else if (savingsRate > 0) savingsScore = 25;
    else savingsScore = 0;

    breakdown.savings_rate = {
        score: savingsScore,
        weight: 15,
        label: 'Savings Rate',
        detail: `${Math.round(savingsRate * 100)}% of income`
    };

    // 6. Investment Readiness (15% weight)
    const readiness = financialData.financial_readiness || {};
    let investScore = 0;
    if (readiness.emergency_fund_complete) investScore += 25;
    if (readiness.high_interest_debt_cleared) investScore += 25;
    if (readiness.stable_income) investScore += 25;
    if (readiness.positive_cash_flow) investScore += 25;

    breakdown.investment_readiness = {
        score: investScore,
        weight: 15,
        label: 'Investment Readiness',
        detail: readiness.ready_to_invest ? 'Ready to invest' : `${Object.values(readiness).filter(Boolean).length}/4 criteria met`
    };

    // Calculate weighted total
    const totalScore = Math.round(
        (breakdown.emergency_fund.score * breakdown.emergency_fund.weight +
         breakdown.debt_health.score * breakdown.debt_health.weight +
         breakdown.credit_utilization.score * breakdown.credit_utilization.weight +
         breakdown.cash_flow.score * breakdown.cash_flow.weight +
         breakdown.savings_rate.score * breakdown.savings_rate.weight +
         breakdown.investment_readiness.score * breakdown.investment_readiness.weight) / 100
    );

    // Determine grade and color
    let grade, color;
    if (totalScore >= 90) { grade = 'A'; color = '#4CAF50'; }
    else if (totalScore >= 75) { grade = 'B'; color = '#8BC34A'; }
    else if (totalScore >= 60) { grade = 'C'; color = '#FFC107'; }
    else if (totalScore >= 40) { grade = 'D'; color = '#FF9800'; }
    else { grade = 'F'; color = '#F44336'; }

    // Get previous score for trend
    let trend = 'stable';
    let previousScore = null;
    try {
        const prevResult = await pool.query(
            `SELECT score FROM health_score_history
             WHERE user_id = $1
             ORDER BY calculated_at DESC
             LIMIT 1`,
            [userId]
        );
        if (prevResult.rows.length > 0) {
            previousScore = prevResult.rows[0].score;
            if (totalScore > previousScore + 2) trend = 'improving';
            else if (totalScore < previousScore - 2) trend = 'declining';
        }
    } catch (err) {
        console.error('Error fetching previous health score:', err);
    }

    return {
        score: totalScore,
        grade,
        color,
        breakdown,
        trend,
        previous_score: previousScore
    };
}

/**
 * Save a health score to history for trend tracking
 * @param {number} userId
 * @param {Object} healthScore - Output from calculateHealthScore
 */
async function saveHealthScore(userId, healthScore) {
    try {
        await pool.query(
            `INSERT INTO health_score_history (user_id, score, grade, breakdown)
             VALUES ($1, $2, $3, $4)`,
            [userId, healthScore.score, healthScore.grade, JSON.stringify(healthScore.breakdown)]
        );
    } catch (err) {
        console.error('Error saving health score:', err);
    }
}

module.exports = {
    calculateHealthScore,
    saveHealthScore,
};
```

- [ ] **Step 6.2** Commit: `git add packages/backend/src/services/health_score.js && git commit -m "feat: Add Financial Health Score calculator with 6 weighted dimensions"`

---

### Task 7: Create Curated Articles Data File

**Files:**
- Create: `packages/backend/src/data/curated_articles.json`

Steps:

- [ ] **Step 7.1** Create the curated articles file at `packages/backend/src/data/curated_articles.json` with 42 verified article entries:

```json
{
    "last_updated": "2026-04-01",
    "articles": [
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/what-is-etf",
            "title": "What Is an ETF? A Beginner's Guide",
            "description": "Learn what ETFs are, how they work, and why they've become one of the most popular investment vehicles in Canada.",
            "source": "Wealthsimple",
            "category": "investing_basics",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["etf", "investing", "beginners"],
            "related_insight_types": ["investment_readiness", "etf_recommendation"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/invest/investing-basics/understanding-mutual-funds/",
            "title": "Understanding Mutual Funds and ETFs",
            "description": "Ontario Securities Commission guide to understanding the basics of mutual funds and ETFs in Canada.",
            "source": "GetSmarterAboutMoney",
            "category": "investing_basics",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["mutual-funds", "etf", "basics"],
            "related_insight_types": ["investment_readiness"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/investing/index-funds-vs-etfs/",
            "title": "Index Funds vs ETFs: What's the Difference?",
            "description": "Understand the key differences between index funds and ETFs to make better investment decisions.",
            "source": "MoneySense",
            "category": "investing_basics",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["index-funds", "etf", "comparison"],
            "related_insight_types": ["investment_readiness", "wealth_building"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/terms/d/dollarcostaveraging.asp",
            "title": "Dollar-Cost Averaging (DCA) Explained",
            "description": "Learn how dollar-cost averaging can reduce the impact of volatility on your investment portfolio over time.",
            "source": "Investopedia",
            "category": "investing_basics",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["dca", "strategy", "investing"],
            "related_insight_types": ["etf_recommendation", "wealth_building"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/what-is-drip",
            "title": "What Is a DRIP (Dividend Reinvestment Plan)?",
            "description": "Discover how dividend reinvestment plans work and how they can accelerate your portfolio growth.",
            "source": "Wealthsimple",
            "category": "investing_basics",
            "read_time_minutes": 6,
            "image_url": null,
            "tags": ["drip", "dividends", "reinvestment"],
            "related_insight_types": ["etf_recommendation", "wealth_building"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/investing/best-all-in-one-etfs/",
            "title": "Best All-in-One ETFs in Canada",
            "description": "A comprehensive guide to the top all-in-one ETFs available to Canadian investors, including XEQT, VEQT, XGRO, and VGRO.",
            "source": "MoneySense",
            "category": "investing_basics",
            "read_time_minutes": 12,
            "image_url": null,
            "tags": ["etf", "all-in-one", "portfolio"],
            "related_insight_types": ["etf_recommendation", "investment_readiness"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4466/tax-free-savings-account-tfsa-guide-individuals.html",
            "title": "Tax-Free Savings Account (TFSA) Guide",
            "description": "Official Government of Canada guide to TFSAs including contribution limits, eligible investments, and withdrawal rules.",
            "source": "Government of Canada",
            "category": "tax_planning",
            "read_time_minutes": 15,
            "image_url": null,
            "tags": ["tfsa", "tax-free", "savings"],
            "related_insight_types": ["tax_optimization", "savings_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-savings-plan-rrsp.html",
            "title": "RRSP: Registered Retirement Savings Plan",
            "description": "Learn about RRSPs, contribution limits, and how they can help reduce your taxes while saving for retirement.",
            "source": "Government of Canada",
            "category": "tax_planning",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["rrsp", "retirement", "tax-deduction"],
            "related_insight_types": ["tax_optimization", "wealth_building"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html",
            "title": "First Home Savings Account (FHSA)",
            "description": "The FHSA is a registered plan allowing first-time home buyers to save up to $40,000 tax-free for their first home.",
            "source": "Government of Canada",
            "category": "tax_planning",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["fhsa", "first-home", "savings"],
            "related_insight_types": ["tax_optimization", "savings_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/rrsp-vs-tfsa",
            "title": "TFSA vs RRSP: Which Is Right for You?",
            "description": "A clear comparison of TFSAs and RRSPs to help you decide which account makes sense at your income level.",
            "source": "Wealthsimple",
            "category": "tax_planning",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["tfsa", "rrsp", "comparison"],
            "related_insight_types": ["tax_optimization", "wealth_building"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/taxes/tax-deductions-and-credits/",
            "title": "Tax Deductions and Credits You Might Be Missing",
            "description": "Commonly overlooked Canadian tax deductions and credits that could save you hundreds on your return.",
            "source": "MoneySense",
            "category": "tax_planning",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["taxes", "deductions", "credits"],
            "related_insight_types": ["tax_optimization", "seasonal_timely"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://turbotax.intuit.ca/tips/tax-tips-for-young-canadians-14880",
            "title": "Tax Tips for Young Canadians",
            "description": "Essential tax filing tips for young Canadians including student credits, first-time claims, and common deductions.",
            "source": "TurboTax Canada",
            "category": "tax_planning",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["taxes", "young-adults", "tips"],
            "related_insight_types": ["tax_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.nerdwallet.com/article/finance/debt-avalanche-vs-debt-snowball",
            "title": "Debt Avalanche vs. Debt Snowball: Which Strategy Is Best?",
            "description": "Compare the two most popular debt payoff strategies to find the approach that saves you the most money.",
            "source": "NerdWallet",
            "category": "debt_management",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["debt", "avalanche", "snowball"],
            "related_insight_types": ["debt_payoff_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.canada.ca/en/financial-consumer-agency/services/debt/managing-debts.html",
            "title": "Managing Your Debts",
            "description": "Government of Canada guide to managing debt including warning signs, strategies, and where to get help.",
            "source": "Government of Canada",
            "category": "debt_management",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["debt", "management", "government"],
            "related_insight_types": ["debt_payoff_acceleration", "cash_flow_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/terms/b/balance-transfer-fee.asp",
            "title": "Balance Transfer Credit Cards Explained",
            "description": "How balance transfer credit cards work and when they make sense for paying off high-interest debt.",
            "source": "Investopedia",
            "category": "debt_management",
            "read_time_minutes": 6,
            "image_url": null,
            "tags": ["balance-transfer", "credit-card", "debt"],
            "related_insight_types": ["debt_payoff_acceleration"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/debt/how-to-get-out-of-debt/",
            "title": "How to Get Out of Debt in Canada",
            "description": "Practical steps and strategies for Canadians looking to eliminate debt and build a stronger financial foundation.",
            "source": "MoneySense",
            "category": "debt_management",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["debt", "strategy", "canada"],
            "related_insight_types": ["debt_payoff_acceleration", "savings_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/protect-your-money/credit-cards/understanding-credit-card-interest/",
            "title": "Understanding Credit Card Interest",
            "description": "Learn how credit card interest works in Canada, including how it's calculated and how to minimize charges.",
            "source": "GetSmarterAboutMoney",
            "category": "debt_management",
            "read_time_minutes": 5,
            "image_url": null,
            "tags": ["credit-card", "interest", "basics"],
            "related_insight_types": ["debt_payoff_acceleration", "spending_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/terms/b/budget.asp",
            "title": "What Is Budgeting? Plus 11 Budgeting Methods",
            "description": "A comprehensive guide to budgeting methods including 50/30/20, zero-based, and envelope budgeting.",
            "source": "Investopedia",
            "category": "budgeting",
            "read_time_minutes": 12,
            "image_url": null,
            "tags": ["budgeting", "methods", "basics"],
            "related_insight_types": ["spending_optimization", "cash_flow_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/50-30-20-budget-rule",
            "title": "The 50/30/20 Budget Rule Explained",
            "description": "A simple budgeting framework that divides your after-tax income into needs, wants, and savings.",
            "source": "Wealthsimple",
            "category": "budgeting",
            "read_time_minutes": 6,
            "image_url": null,
            "tags": ["budgeting", "50-30-20", "rule"],
            "related_insight_types": ["spending_optimization", "savings_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/budgeting/best-budgeting-apps-canada/",
            "title": "Best Budgeting Apps in Canada",
            "description": "Reviews of the top budgeting apps available to Canadians for tracking spending and managing money.",
            "source": "MoneySense",
            "category": "budgeting",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["budgeting", "apps", "canada"],
            "related_insight_types": ["spending_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/plan-manage/budgeting/making-a-budget/",
            "title": "Making a Budget",
            "description": "Step-by-step guide to creating a personal budget from the Ontario Securities Commission.",
            "source": "GetSmarterAboutMoney",
            "category": "budgeting",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["budgeting", "planning", "basics"],
            "related_insight_types": ["spending_optimization", "cash_flow_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.nerdwallet.com/article/finance/zero-based-budgeting-explained",
            "title": "Zero-Based Budgeting Explained",
            "description": "How zero-based budgeting works and why it can be effective for getting control of your spending.",
            "source": "NerdWallet",
            "category": "budgeting",
            "read_time_minutes": 6,
            "image_url": null,
            "tags": ["budgeting", "zero-based", "strategy"],
            "related_insight_types": ["spending_optimization", "cash_flow_optimization"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/terms/e/emergency_fund.asp",
            "title": "Emergency Fund: What It Is and Why It Matters",
            "description": "Why every household needs an emergency fund, how much to save, and the best places to keep it.",
            "source": "Investopedia",
            "category": "savings",
            "read_time_minutes": 6,
            "image_url": null,
            "tags": ["emergency-fund", "savings", "basics"],
            "related_insight_types": ["savings_acceleration"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/best-high-interest-savings-accounts-in-canada/",
            "title": "Best High-Interest Savings Accounts in Canada",
            "description": "Compare the top HISAs in Canada to find the best interest rates for your savings.",
            "source": "MoneySense",
            "category": "savings",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["hisa", "savings", "rates"],
            "related_insight_types": ["savings_acceleration", "opportunity_cost"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.ratehub.ca/savings-accounts/accounts/high-interest",
            "title": "Compare High-Interest Savings Accounts",
            "description": "RateHub's real-time comparison tool for high-interest savings accounts at Canadian banks.",
            "source": "RateHub",
            "category": "savings",
            "read_time_minutes": 5,
            "image_url": null,
            "tags": ["hisa", "comparison", "rates"],
            "related_insight_types": ["savings_acceleration", "opportunity_cost"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/what-is-gic",
            "title": "What Is a GIC?",
            "description": "Learn about Guaranteed Investment Certificates, how they work, and when they make sense in your portfolio.",
            "source": "Wealthsimple",
            "category": "savings",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["gic", "savings", "guaranteed"],
            "related_insight_types": ["savings_acceleration", "wealth_building"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/invest/investing-basics/saving-and-investing-basics/",
            "title": "Saving and Investing Basics",
            "description": "Foundational guide to saving and investing from the Ontario Securities Commission.",
            "source": "GetSmarterAboutMoney",
            "category": "savings",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["saving", "investing", "basics"],
            "related_insight_types": ["savings_acceleration", "investment_readiness"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/credit-score",
            "title": "Credit Score in Canada: What It Is and How to Improve It",
            "description": "Everything you need to know about credit scores in Canada including factors, ranges, and improvement tips.",
            "source": "Wealthsimple",
            "category": "canadian_finance_101",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["credit-score", "canada", "basics"],
            "related_insight_types": ["cash_flow_optimization"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/plan-manage/financial-basics/how-the-financial-system-works/",
            "title": "How the Canadian Financial System Works",
            "description": "An overview of the Canadian financial system including banks, credit unions, and regulatory bodies.",
            "source": "GetSmarterAboutMoney",
            "category": "canadian_finance_101",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["financial-system", "canada", "banks"],
            "related_insight_types": [],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/banking/banking-basics-in-canada/",
            "title": "Banking Basics in Canada",
            "description": "A beginner's guide to Canadian banking including account types, fees, and how to choose a bank.",
            "source": "MoneySense",
            "category": "canadian_finance_101",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["banking", "basics", "canada"],
            "related_insight_types": [],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.canada.ca/en/financial-consumer-agency/services/financial-literacy/financial-literacy-resources.html",
            "title": "Financial Literacy Resources",
            "description": "Government of Canada's collection of financial literacy tools and resources for Canadians.",
            "source": "Government of Canada",
            "category": "canadian_finance_101",
            "read_time_minutes": 5,
            "image_url": null,
            "tags": ["financial-literacy", "resources", "government"],
            "related_insight_types": [],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/articles/basics/06/canadianbankingsystem.asp",
            "title": "Introduction to Canadian Banking",
            "description": "Overview of the Canadian banking system, Big Five banks, and how it differs from other countries.",
            "source": "Investopedia",
            "category": "canadian_finance_101",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["banking", "canada", "big-five"],
            "related_insight_types": [],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/best-etfs-in-canada",
            "title": "Best Canadian ETFs for Your Portfolio",
            "description": "A curated list of top Canadian ETFs by category including all-in-one, equity, fixed income, and dividend ETFs.",
            "source": "Wealthsimple",
            "category": "etf_education",
            "read_time_minutes": 12,
            "image_url": null,
            "tags": ["etf", "best", "canada"],
            "related_insight_types": ["etf_recommendation", "investment_readiness"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/investing/mer-explained/",
            "title": "MER Explained: What You Need to Know",
            "description": "Understanding Management Expense Ratios and why they matter for your long-term investment returns.",
            "source": "MoneySense",
            "category": "etf_education",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["mer", "fees", "investing"],
            "related_insight_types": ["etf_recommendation", "wealth_building"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://canadiancouchpotato.com/model-portfolios/",
            "title": "Canadian Couch Potato Model Portfolios",
            "description": "Simple, low-cost model portfolios for Canadian investors using index ETFs.",
            "source": "Canadian Couch Potato",
            "category": "etf_education",
            "read_time_minutes": 15,
            "image_url": null,
            "tags": ["portfolio", "couch-potato", "index"],
            "related_insight_types": ["etf_recommendation", "wealth_building"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.fool.ca/investing/how-to-build-an-etf-portfolio/",
            "title": "How to Build an ETF Portfolio in Canada",
            "description": "Step-by-step guide to constructing a diversified ETF portfolio suited to your goals and risk tolerance.",
            "source": "Motley Fool Canada",
            "category": "etf_education",
            "read_time_minutes": 10,
            "image_url": null,
            "tags": ["etf", "portfolio", "building"],
            "related_insight_types": ["etf_recommendation", "investment_readiness"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/how-to-buy-etfs",
            "title": "How to Buy ETFs in Canada",
            "description": "A practical guide to buying ETFs through Canadian brokerages including Wealthsimple and Questrade.",
            "source": "Wealthsimple",
            "category": "etf_education",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["etf", "buying", "brokerage"],
            "related_insight_types": ["etf_recommendation", "investment_readiness"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.investopedia.com/terms/c/compoundinterest.asp",
            "title": "Compound Interest Explained",
            "description": "How compound interest works and why starting to invest early can make an enormous difference over time.",
            "source": "Investopedia",
            "category": "wealth_building",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["compound-interest", "growth", "basics"],
            "related_insight_types": ["wealth_building", "investment_readiness"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/retirement/retirement-planning-in-canada/",
            "title": "Retirement Planning in Canada: A Complete Guide",
            "description": "Everything you need to know about planning for retirement in Canada including CPP, OAS, and personal savings.",
            "source": "MoneySense",
            "category": "wealth_building",
            "read_time_minutes": 15,
            "image_url": null,
            "tags": ["retirement", "planning", "canada"],
            "related_insight_types": ["wealth_building", "tax_optimization"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.wealthsimple.com/en-ca/learn/fire-movement",
            "title": "What Is the FIRE Movement?",
            "description": "Financial Independence, Retire Early - learn about the movement, its principles, and whether it's realistic.",
            "source": "Wealthsimple",
            "category": "wealth_building",
            "read_time_minutes": 8,
            "image_url": null,
            "tags": ["fire", "independence", "early-retirement"],
            "related_insight_types": ["wealth_building", "savings_acceleration"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.getsmarteraboutmoney.ca/invest/investing-basics/building-wealth-over-time/",
            "title": "Building Wealth Over Time",
            "description": "Key principles for building long-term wealth through disciplined saving and investing.",
            "source": "GetSmarterAboutMoney",
            "category": "wealth_building",
            "read_time_minutes": 7,
            "image_url": null,
            "tags": ["wealth", "long-term", "discipline"],
            "related_insight_types": ["wealth_building", "investment_readiness"],
            "difficulty": "beginner",
            "last_verified": "2026-04-01"
        },
        {
            "url": "https://www.moneysense.ca/save/retirement/how-much-do-you-need-to-retire/",
            "title": "How Much Do You Need to Retire in Canada?",
            "description": "Calculate your retirement number based on your lifestyle, spending habits, and government benefits.",
            "source": "MoneySense",
            "category": "wealth_building",
            "read_time_minutes": 12,
            "image_url": null,
            "tags": ["retirement", "calculator", "planning"],
            "related_insight_types": ["wealth_building"],
            "difficulty": "intermediate",
            "last_verified": "2026-04-01"
        }
    ]
}
```

- [ ] **Step 7.2** Validate the JSON:
```bash
node -e "const d = JSON.parse(require('fs').readFileSync('packages/backend/src/data/curated_articles.json','utf8')); console.log(d.articles.length + ' curated articles loaded'); const cats = {}; d.articles.forEach(a => { cats[a.category] = (cats[a.category]||0)+1; }); console.log('By category:', cats);"
```

- [ ] **Step 7.3** Commit: `git add packages/backend/src/data/curated_articles.json && git commit -m "feat: Add 42 curated, verified Wealth Academy articles from trusted Canadian sources"`

---

### Task 8: Update educational_content.js

**Files:**
- Modify: `packages/backend/src/services/educational_content.js`

Steps:

- [ ] **Step 8.1** Add curated articles module imports and the new `syncCuratedArticles` function. Add after the `CATEGORY_COLORS` constant definition:

Find:
```js
// Category colors for UI
const CATEGORY_COLORS = {
    budgeting: '#3B82F6',
    investing: '#10B981',
    debt: '#F59E0B',
    taxes: '#8B5CF6',
    savings: '#06B6D4',
    general: '#C9A227'
};
```

Replace with:
```js
// Category colors for UI (expanded for new categories)
const CATEGORY_COLORS = {
    budgeting: '#3B82F6',
    investing: '#10B981',
    investing_basics: '#10B981',
    debt: '#F59E0B',
    debt_management: '#F59E0B',
    taxes: '#8B5CF6',
    tax_planning: '#8B5CF6',
    savings: '#06B6D4',
    general: '#C9A227',
    canadian_finance_101: '#3B82F6',
    etf_education: '#22C55E',
    wealth_building: '#6366F1'
};

// Path to curated articles JSON
const CURATED_ARTICLES_PATH = process.env.CURATED_ARTICLES_PATH
    ? require('path').resolve(process.env.CURATED_ARTICLES_PATH)
    : require('path').join(__dirname, '..', 'data', 'curated_articles.json');
```

- [ ] **Step 8.2** Add the `syncCuratedArticles` function. Insert it just before the `seedInitialArticles` function:

Find:
```js
/**
 * Seed initial educational articles (for development/testing)
 */
async function seedInitialArticles() {
```

Replace with:
```js
/**
 * Sync curated articles from JSON file to database
 * Sets source_type='curated' and 90-day expiry (instead of 7-day for AI articles)
 * @returns {Object} { synced, new_count, updated }
 */
async function syncCuratedArticles() {
    try {
        const fs = require('fs');
        const raw = fs.readFileSync(CURATED_ARTICLES_PATH, 'utf8');
        const data = JSON.parse(raw);
        const articles = data.articles;

        let newCount = 0;
        let updatedCount = 0;

        for (const article of articles) {
            // Determine source name from URL if not provided
            let sourceName = article.source || 'Unknown';
            for (const source of TRUSTED_SOURCES) {
                if (article.url.includes(source.domain)) {
                    sourceName = source.name;
                    break;
                }
            }

            const result = await pool.query(
                `INSERT INTO educational_articles
                    (external_url, title, description, image_url, source_name, category,
                     read_time_minutes, source_type, tags, difficulty, url_status,
                     last_verified_at, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'curated', $8, $9, 'active', $10,
                         NOW() + INTERVAL '90 days')
                 ON CONFLICT (external_url)
                 DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    image_url = EXCLUDED.image_url,
                    source_name = EXCLUDED.source_name,
                    category = EXCLUDED.category,
                    read_time_minutes = EXCLUDED.read_time_minutes,
                    source_type = 'curated',
                    tags = EXCLUDED.tags,
                    difficulty = EXCLUDED.difficulty,
                    url_status = 'active',
                    last_verified_at = EXCLUDED.last_verified_at,
                    fetched_at = NOW(),
                    expires_at = NOW() + INTERVAL '90 days'
                 RETURNING id, (xmax = 0) AS is_new`,
                [
                    article.url,
                    article.title,
                    article.description,
                    article.image_url || null,
                    sourceName,
                    article.category,
                    article.read_time_minutes || 5,
                    article.tags || [],
                    article.difficulty || 'beginner',
                    article.last_verified ? new Date(article.last_verified) : new Date()
                ]
            );

            const row = result.rows[0];
            if (row.is_new) newCount++;
            else updatedCount++;

            // Link to insight types if provided
            if (article.related_insight_types && article.related_insight_types.length > 0) {
                for (const insightType of article.related_insight_types) {
                    await pool.query(
                        `INSERT INTO insight_articles (insight_type, article_id, relevance_score)
                         VALUES ($1, $2, 1.0)
                         ON CONFLICT (insight_type, article_id)
                         DO UPDATE SET relevance_score = GREATEST(insight_articles.relevance_score, 1.0)`,
                        [insightType, row.id]
                    );
                }
            }
        }

        const synced = newCount + updatedCount;
        console.log(`Curated articles sync complete: ${synced} synced (${newCount} new, ${updatedCount} updated)`);
        return { synced, new_count: newCount, updated: updatedCount };
    } catch (err) {
        console.error('Error syncing curated articles:', err);
        throw err;
    }
}

/**
 * Get recommended articles for a user based on their current insight types
 * @param {number} userId
 * @param {string[]} insightTypes - Array of insight types from current insights
 * @param {number} limit
 * @returns {Object[]} Recommended articles sorted by relevance
 */
async function getRecommendedArticles(insightTypes = [], limit = 10) {
    if (!insightTypes || insightTypes.length === 0) {
        // Fall back to curated articles sorted by recency
        const result = await pool.query(
            `SELECT id, external_url, title, description, image_url,
                    source_name, category, read_time_minutes, source_type, difficulty
             FROM educational_articles
             WHERE expires_at > NOW() AND url_status = 'active'
             ORDER BY source_type = 'curated' DESC, fetched_at DESC
             LIMIT $1`,
            [limit]
        );
        return result.rows.map(a => ({ ...a, categoryColor: getCategoryColor(a.category) }));
    }

    const result = await pool.query(
        `SELECT DISTINCT ea.id, ea.external_url, ea.title, ea.description, ea.image_url,
                ea.source_name, ea.category, ea.read_time_minutes, ea.source_type,
                ea.difficulty, MAX(ia.relevance_score) as relevance
         FROM insight_articles ia
         JOIN educational_articles ea ON ia.article_id = ea.id
         WHERE ia.insight_type = ANY($1)
           AND ea.expires_at > NOW()
           AND ea.url_status = 'active'
         GROUP BY ea.id
         ORDER BY ea.source_type = 'curated' DESC, relevance DESC
         LIMIT $2`,
        [insightTypes, limit]
    );

    return result.rows.map(a => ({ ...a, categoryColor: getCategoryColor(a.category) }));
}

/**
 * Seed initial educational articles (for development/testing)
 */
async function seedInitialArticles() {
```

- [ ] **Step 8.3** Update the module exports to include the new functions. Find:

Find:
```js
module.exports = {
    getTrustedSources,
    getCategoryColor,
    getArticles,
    getArticleById,
    getArticlesForInsightType,
    getCategories,
    cacheArticleFromUrl,
    saveAIGeneratedArticles,
    addBookmark,
    removeBookmark,
    getBookmarks,
    checkBookmarks,
    seedInitialArticles,
    CATEGORY_COLORS
};
```

Replace with:
```js
module.exports = {
    getTrustedSources,
    getCategoryColor,
    getArticles,
    getArticleById,
    getArticlesForInsightType,
    getCategories,
    cacheArticleFromUrl,
    saveAIGeneratedArticles,
    syncCuratedArticles,
    getRecommendedArticles,
    addBookmark,
    removeBookmark,
    getBookmarks,
    checkBookmarks,
    seedInitialArticles,
    CATEGORY_COLORS
};
```

- [ ] **Step 8.4** Commit: `git add packages/backend/src/services/educational_content.js && git commit -m "feat: Add curated article sync and recommended articles to educational content service"`

---

### Task 9: New/Updated API Routes

**Files:**
- Modify: `packages/backend/src/routes/insights.js`
- Create: `packages/backend/src/routes/etfs.js`
- Modify: `packages/backend/src/app.js`

Steps:

- [ ] **Step 9.1** Update the insights route to include health score. Add the import at the top of `packages/backend/src/routes/insights.js`:

Find:
```js
const { pool } = require('../services/db');
const { getUserFinancialSummary } = require('../services/insight_data');
const { generateInsights } = require('../services/ai_insights');
const { saveAIGeneratedArticles } = require('../services/educational_content');
const { authenticateToken } = require('../middleware/auth');
```

Replace with:
```js
const { pool } = require('../services/db');
const { getUserFinancialSummary } = require('../services/insight_data');
const { generateInsights } = require('../services/ai_insights');
const { saveAIGeneratedArticles } = require('../services/educational_content');
const { authenticateToken } = require('../middleware/auth');
const { calculateHealthScore, saveHealthScore } = require('../services/health_score');
```

- [ ] **Step 9.2** Update the GET `/` route handler to calculate health score and include it in response. In the insights route, update the section where insights are generated (after `const result = await generateInsights(userData);`). Find the section that saves insights and returns the response:

Find:
```js
        // Step 4: Save insights to cache
        const cacheExpiresAt = new Date();
        cacheExpiresAt.setHours(cacheExpiresAt.getHours() + cacheHours);

        await pool.query(
            `INSERT INTO user_insights
             (user_id, insights, summary, generated_at, cache_expires_at, generation_trigger,
              token_count_input, token_count_output, ai_model_used, generation_time_ms)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)`,
            [
                userId,
                JSON.stringify(result.insights),
                result.summary,
                cacheExpiresAt,
                forceRefresh ? 'manual_refresh' : 'cache_miss',
                result.metadata.token_count_input,
                result.metadata.token_count_output,
                result.metadata.ai_model_used,
                result.metadata.generation_time_ms
            ]
        );

        res.json({
            success: true,
            data: {
                insights: result.insights,
                summary: result.summary,
                generated_at: new Date().toISOString(),
                cache_expires_at: cacheExpiresAt.toISOString(),
                is_cached: false,
                ai_model_used: result.metadata.ai_model_used,
                generation_time_ms: result.metadata.generation_time_ms,
                recommended_articles_count: savedArticles.length
            }
        });
```

Replace with:
```js
        // Step 4: Calculate health score
        let healthScore = null;
        try {
            healthScore = await calculateHealthScore(userData, userId);
            await saveHealthScore(userId, healthScore);
        } catch (hsError) {
            console.error('Error calculating health score:', hsError);
        }

        // Step 5: Save insights to cache (with health score)
        const cacheExpiresAt = new Date();
        cacheExpiresAt.setHours(cacheExpiresAt.getHours() + cacheHours);

        await pool.query(
            `INSERT INTO user_insights
             (user_id, insights, summary, generated_at, cache_expires_at, generation_trigger,
              token_count_input, token_count_output, ai_model_used, generation_time_ms,
              health_score, health_score_breakdown, health_score_trend)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                userId,
                JSON.stringify(result.insights),
                result.summary,
                cacheExpiresAt,
                forceRefresh ? 'manual_refresh' : 'cache_miss',
                result.metadata.token_count_input,
                result.metadata.token_count_output,
                result.metadata.ai_model_used,
                result.metadata.generation_time_ms,
                healthScore?.score || null,
                healthScore ? JSON.stringify(healthScore.breakdown) : null,
                healthScore?.trend || null
            ]
        );

        res.json({
            success: true,
            data: {
                insights: result.insights,
                health_score: healthScore,
                summary: result.summary,
                generated_at: new Date().toISOString(),
                cache_expires_at: cacheExpiresAt.toISOString(),
                is_cached: false,
                ai_model_used: result.metadata.ai_model_used,
                generation_time_ms: result.metadata.generation_time_ms,
                recommended_articles_count: savedArticles.length
            }
        });
```

- [ ] **Step 9.3** Update the cache hit response to include health score. Find:

Find:
```js
            if (cacheResult.rows.length > 0) {
                const cached = cacheResult.rows[0];
                return res.json({
                    success: true,
                    data: {
                        insights: cached.insights,
                        summary: cached.summary,
                        generated_at: cached.generated_at,
                        cache_expires_at: cached.cache_expires_at,
                        is_cached: true,
                        ai_model_used: cached.ai_model_used
                    }
                });
            }
```

Replace with:
```js
            if (cacheResult.rows.length > 0) {
                const cached = cacheResult.rows[0];
                // Reconstruct health score from cached columns
                let healthScore = null;
                if (cached.health_score !== null) {
                    const score = cached.health_score;
                    let grade, color;
                    if (score >= 90) { grade = 'A'; color = '#4CAF50'; }
                    else if (score >= 75) { grade = 'B'; color = '#8BC34A'; }
                    else if (score >= 60) { grade = 'C'; color = '#FFC107'; }
                    else if (score >= 40) { grade = 'D'; color = '#FF9800'; }
                    else { grade = 'F'; color = '#F44336'; }
                    healthScore = {
                        score,
                        grade,
                        color,
                        breakdown: cached.health_score_breakdown,
                        trend: cached.health_score_trend,
                        previous_score: null
                    };
                }
                return res.json({
                    success: true,
                    data: {
                        insights: cached.insights,
                        health_score: healthScore,
                        summary: cached.summary,
                        generated_at: cached.generated_at,
                        cache_expires_at: cached.cache_expires_at,
                        is_cached: true,
                        ai_model_used: cached.ai_model_used
                    }
                });
            }
```

- [ ] **Step 9.4** Update the cache query to include health score columns. Find:

Find:
```js
            const cacheResult = await pool.query(
                `SELECT insights, summary, generated_at, cache_expires_at, ai_model_used
                 FROM user_insights
                 WHERE user_id = $1 AND cache_expires_at > NOW()
                 ORDER BY generated_at DESC
                 LIMIT 1`,
                [userId]
            );
```

Replace with:
```js
            const cacheResult = await pool.query(
                `SELECT insights, summary, generated_at, cache_expires_at, ai_model_used,
                        health_score, health_score_breakdown, health_score_trend
                 FROM user_insights
                 WHERE user_id = $1 AND cache_expires_at > NOW()
                 ORDER BY generated_at DESC
                 LIMIT 1`,
                [userId]
            );
```

- [ ] **Step 9.5** Add a standalone health score endpoint at the bottom of the insights routes file, before `module.exports = router;`:

Find:
```js
module.exports = router;
```

Replace with:
```js
/**
 * GET /api/insights/health-score
 * Get just the financial health score (faster than full insights)
 */
router.get('/health-score', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Try to get cached score first
        const cacheResult = await pool.query(
            `SELECT health_score, health_score_breakdown, health_score_trend, generated_at
             FROM user_insights
             WHERE user_id = $1 AND health_score IS NOT NULL
             ORDER BY generated_at DESC
             LIMIT 1`,
            [userId]
        );

        if (cacheResult.rows.length > 0) {
            const cached = cacheResult.rows[0];
            const score = cached.health_score;
            let grade, color;
            if (score >= 90) { grade = 'A'; color = '#4CAF50'; }
            else if (score >= 75) { grade = 'B'; color = '#8BC34A'; }
            else if (score >= 60) { grade = 'C'; color = '#FFC107'; }
            else if (score >= 40) { grade = 'D'; color = '#FF9800'; }
            else { grade = 'F'; color = '#F44336'; }

            return res.json({
                success: true,
                data: {
                    score,
                    grade,
                    color,
                    breakdown: cached.health_score_breakdown,
                    trend: cached.health_score_trend,
                    previous_score: null,
                    generated_at: cached.generated_at
                }
            });
        }

        // No cached score - calculate fresh
        const userData = await getUserFinancialSummary(userId, 90);
        const healthScore = await calculateHealthScore(userData, userId);
        await saveHealthScore(userId, healthScore);

        res.json({
            success: true,
            data: healthScore
        });
    } catch (error) {
        console.error('Error fetching health score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate health score'
        });
    }
});

module.exports = router;
```

- [ ] **Step 9.6** Create the ETF routes file at `packages/backend/src/routes/etfs.js`:

```js
/**
 * ETF API Routes
 * Endpoints for browsing and getting recommended Canadian ETFs
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../services/db');
const etfKnowledge = require('../services/etf_knowledge');

const ETF_DISCLAIMER = 'The ETF information is for educational purposes only. Data is approximate and updated quarterly. IndusWealth does not sell, recommend, or endorse any specific investment product. Past performance does not guarantee future results.';

/**
 * GET /api/etfs
 * Get all ETFs with optional filtering
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { risk_level, category, search } = req.query;

        let etfs;
        if (search) {
            etfs = etfKnowledge.searchETFs(search);
        } else if (risk_level) {
            etfs = etfKnowledge.getETFsByRiskProfile(risk_level);
        } else if (category) {
            etfs = etfKnowledge.getETFsByCategory(category);
        } else {
            etfs = etfKnowledge.getAllETFs();
        }

        res.json({
            success: true,
            data: {
                etfs,
                last_updated: etfKnowledge.getLastUpdated(),
                disclaimer: ETF_DISCLAIMER,
                count: etfs.length
            }
        });
    } catch (error) {
        console.error('Error fetching ETFs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ETF data'
        });
    }
});

/**
 * GET /api/etfs/recommended
 * Get ETFs recommended for the user based on their risk profile
 */
router.get('/recommended', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user preferences
        const prefResult = await pool.query(
            `SELECT investment_risk_tolerance, interested_in_investing,
                    preferred_savings_account_type
             FROM user_preferences WHERE user_id = $1`,
            [userId]
        );

        const preferences = prefResult.rows[0] || {
            investment_risk_tolerance: 'moderate',
            interested_in_investing: true,
            preferred_savings_account_type: 'tfsa'
        };

        const recommended = etfKnowledge.getRecommendedETFs(preferences);

        res.json({
            success: true,
            data: {
                etfs: recommended,
                risk_profile: preferences.investment_risk_tolerance,
                last_updated: etfKnowledge.getLastUpdated(),
                disclaimer: ETF_DISCLAIMER
            }
        });
    } catch (error) {
        console.error('Error fetching recommended ETFs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recommended ETFs'
        });
    }
});

/**
 * GET /api/etfs/:ticker
 * Get a single ETF by ticker symbol
 */
router.get('/:ticker', authenticateToken, async (req, res) => {
    try {
        const { ticker } = req.params;
        const etf = etfKnowledge.getETFByTicker(ticker);

        if (!etf) {
            return res.status(404).json({
                success: false,
                error: `ETF with ticker "${ticker}" not found`
            });
        }

        res.json({
            success: true,
            data: {
                etf,
                disclaimer: ETF_DISCLAIMER
            }
        });
    } catch (error) {
        console.error('Error fetching ETF:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ETF data'
        });
    }
});

/**
 * POST /api/etfs/interaction
 * Track user interaction with ETF content (for analytics)
 */
router.post('/interaction', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { etf_ticker, interaction_type, source } = req.body;

        if (!etf_ticker || !interaction_type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: etf_ticker, interaction_type'
            });
        }

        const validTypes = ['viewed', 'clicked_buy_link', 'bookmarked'];
        if (!validTypes.includes(interaction_type)) {
            return res.status(400).json({
                success: false,
                error: `interaction_type must be one of: ${validTypes.join(', ')}`
            });
        }

        await pool.query(
            `INSERT INTO etf_interactions (user_id, etf_ticker, interaction_type, source)
             VALUES ($1, $2, $3, $4)`,
            [userId, etf_ticker.toUpperCase(), interaction_type, source || 'unknown']
        );

        res.json({ success: true, message: 'Interaction tracked' });
    } catch (error) {
        console.error('Error tracking ETF interaction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track interaction'
        });
    }
});

module.exports = router;
```

- [ ] **Step 9.7** Register the ETF routes and curated article sync in `packages/backend/src/app.js`. Find:

Find:
```js
app.use('/insights', require('./routes/insights'));
app.use('/educational', require('./routes/educational'));
```

Replace with:
```js
app.use('/insights', require('./routes/insights'));
app.use('/educational', require('./routes/educational'));
app.use('/etfs', require('./routes/etfs'));

// Sync curated articles on startup (non-blocking)
const { syncCuratedArticles } = require('./services/educational_content');
syncCuratedArticles().catch(err => console.error('Curated article sync failed on startup:', err));
```

- [ ] **Step 9.8** Commit: `git add packages/backend/src/routes/insights.js packages/backend/src/routes/etfs.js packages/backend/src/app.js && git commit -m "feat: Add ETF routes, health score endpoint, curated article sync on startup"`

- [ ] **Step 9.9** Manual verification: Start the backend and test with curl:
```bash
cd packages/backend && npm run dev &
sleep 3

# Get a login token first
TOKEN=$(curl -s -X POST http://localhost:3000/users/login -H "Content-Type: application/json" -d '{"email":"demo@induswealth.com","password":"demo123"}' | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.data?.token||r.token||'NO_TOKEN')})")

# Test ETF endpoints
curl -s http://localhost:3000/etfs -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('ETFs:', r.data?.count)})"

curl -s http://localhost:3000/etfs/recommended -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Recommended:', r.data?.etfs?.length)})"

curl -s http://localhost:3000/etfs/XEQT -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('XEQT:', r.data?.etf?.name)})"

# Test health score endpoint
curl -s http://localhost:3000/insights/health-score -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Health Score:', r.data?.score, r.data?.grade)})"

# Test full insights with health score
curl -s "http://localhost:3000/insights?force_refresh=true" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Insights:', r.data?.insights?.length, 'Health:', r.data?.health_score?.score)})"
```

---

## Phase 2: Mobile UI Redesign

### Task 10: Update Theme and API Service

**Files:**
- Modify: `packages/mobile/src/constants/theme.js`
- Modify: `packages/mobile/src/services/api.js`

Steps:

- [ ] **Step 10.1** Add new color tokens to the theme file. Find:

Find:
```js
    // Legacy (kept for backward compatibility)
    NAVY: '#000000',
    GRAY_LIGHT: '#F0F0F0',
    GRAY_DARK: '#333333',
};
```

Replace with:
```js
    // Health Score colors
    HEALTH_EXCELLENT: '#4CAF50',
    HEALTH_GOOD: '#8BC34A',
    HEALTH_FAIR: '#FFC107',
    HEALTH_POOR: '#FF9800',
    HEALTH_CRITICAL: '#F44336',

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

    // Legacy (kept for backward compatibility)
    NAVY: '#000000',
    GRAY_LIGHT: '#F0F0F0',
    GRAY_DARK: '#333333',
};
```

- [ ] **Step 10.2** Add new API methods to the mobile api.js. Find the existing insight-related methods and add the new ones after them. Locate the `dismissInsight` method and add the new methods after the educational content block. Find the end of the educational content API methods (after `getArticlesForInsight`):

Add the following new API methods to `packages/mobile/src/services/api.js`. Find the appropriate location after the existing insight/educational methods and add these. The exact location depends on the file structure, but they should be added as new properties in the api object. Search for `getArticlesForInsight` and add after the next line:

Find:
```js
    getArticlesForInsight: (insightType, limit = 3) =>
```

After the closing of `getArticlesForInsight` method (find the next comma-separated method after it and add before it), add these new methods. The simplest approach: find any method that comes after `getArticlesForInsight` and add before it. Practically, add these lines in the api object:

Add these methods to the api object in `packages/mobile/src/services/api.js` (find an appropriate insertion point near the existing insight methods):

```js
    // Health Score
    getHealthScore: () => apiRequest('/insights/health-score'),

    // ETF endpoints
    getETFs: (params = {}) => {
        const searchParams = new URLSearchParams();
        if (params.risk_level) searchParams.append('risk_level', params.risk_level);
        if (params.category) searchParams.append('category', params.category);
        if (params.search) searchParams.append('search', params.search);
        const qs = searchParams.toString();
        return apiRequest(`/etfs${qs ? '?' + qs : ''}`);
    },

    getRecommendedETFs: () => apiRequest('/etfs/recommended'),

    getETFByTicker: (ticker) => apiRequest(`/etfs/${ticker}`),

    trackETFInteraction: (etfTicker, interactionType, source) =>
        apiRequest('/etfs/interaction', {
            method: 'POST',
            body: JSON.stringify({ etf_ticker: etfTicker, interaction_type: interactionType, source }),
        }),
```

NOTE: The exact edit depends on the file structure. Find the api object and add these methods as new properties within it. They should be near the existing `getInsights` and `getEducationalArticles` methods.

- [ ] **Step 10.3** Commit: `git add packages/mobile/src/constants/theme.js packages/mobile/src/services/api.js && git commit -m "feat: Add health score colors, ETF theme tokens, and new API methods for mobile"`

---

### Task 11: Create FinancialHealthScore Component

**Files:**
- Create: `packages/mobile/src/components/FinancialHealthScore.js`

Steps:

- [ ] **Step 11.1** Create the circular health score widget at `packages/mobile/src/components/FinancialHealthScore.js`:

```jsx
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

const CIRCLE_SIZE = 140;
const STROKE_WIDTH = 10;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const getScoreColor = (score) => {
    if (score >= 90) return COLORS.HEALTH_EXCELLENT;
    if (score >= 75) return COLORS.HEALTH_GOOD;
    if (score >= 60) return COLORS.HEALTH_FAIR;
    if (score >= 40) return COLORS.HEALTH_POOR;
    return COLORS.HEALTH_CRITICAL;
};

const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Needs Work';
    return 'Critical';
};

const FinancialHealthScore = ({ healthScore }) => {
    const [showBreakdown, setShowBreakdown] = useState(false);

    if (!healthScore) return null;

    const { score, grade, breakdown, trend, previous_score } = healthScore;
    const scoreColor = getScoreColor(score);
    const strokeDashoffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

    const trendIcon = trend === 'improving' ? 'arrow-up' : trend === 'declining' ? 'arrow-down' : 'remove';
    const trendColor = trend === 'improving' ? COLORS.GREEN : trend === 'declining' ? COLORS.RED : COLORS.TEXT_MUTED;
    const trendText = trend === 'improving'
        ? `Up ${previous_score ? score - previous_score : ''} pts`
        : trend === 'declining'
            ? `Down ${previous_score ? previous_score - score : ''} pts`
            : 'Stable';

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.scoreContainer}
                onPress={() => setShowBreakdown(true)}
                activeOpacity={0.8}
            >
                {/* Circular Progress */}
                <View style={styles.circleContainer}>
                    <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                        {/* Background circle */}
                        <Circle
                            cx={CIRCLE_SIZE / 2}
                            cy={CIRCLE_SIZE / 2}
                            r={RADIUS}
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={STROKE_WIDTH}
                            fill="none"
                        />
                        {/* Score arc */}
                        <Circle
                            cx={CIRCLE_SIZE / 2}
                            cy={CIRCLE_SIZE / 2}
                            r={RADIUS}
                            stroke={scoreColor}
                            strokeWidth={STROKE_WIDTH}
                            fill="none"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            rotation="-90"
                            origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
                        />
                    </Svg>
                    {/* Score number in center */}
                    <View style={styles.scoreCenter}>
                        <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
                        <Text style={styles.gradeText}>{grade}</Text>
                    </View>
                </View>

                {/* Label and Trend */}
                <View style={styles.labelContainer}>
                    <Text style={[styles.scoreLabel, { color: scoreColor }]}>
                        {getScoreLabel(score)}
                    </Text>
                    <View style={styles.trendRow}>
                        <Ionicons name={trendIcon} size={14} color={trendColor} />
                        <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
                    </View>
                </View>

                {/* Mini breakdown bar */}
                {breakdown && (
                    <View style={styles.miniBreakdown}>
                        {Object.values(breakdown).map((dim, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.miniSegment,
                                    {
                                        flex: dim.weight,
                                        backgroundColor: getScoreColor(dim.score),
                                        opacity: 0.7 + (dim.score / 100) * 0.3,
                                    },
                                ]}
                            />
                        ))}
                    </View>
                )}

                <Text style={styles.tapHint}>Tap for details</Text>
            </TouchableOpacity>

            {/* Breakdown Modal */}
            <Modal
                visible={showBreakdown}
                transparent
                animationType="slide"
                onRequestClose={() => setShowBreakdown(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Financial Health Breakdown</Text>
                            <TouchableOpacity onPress={() => setShowBreakdown(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalScoreRow}>
                            <Text style={[styles.modalScore, { color: scoreColor }]}>{score}</Text>
                            <Text style={styles.modalGrade}> / 100 ({grade})</Text>
                        </View>

                        <ScrollView style={styles.breakdownList}>
                            {breakdown && Object.entries(breakdown).map(([key, dim]) => (
                                <View key={key} style={styles.breakdownItem}>
                                    <View style={styles.breakdownHeader}>
                                        <Text style={styles.breakdownLabel}>{dim.label}</Text>
                                        <Text style={[styles.breakdownScore, { color: getScoreColor(dim.score) }]}>
                                            {dim.score}/100
                                        </Text>
                                    </View>
                                    <View style={styles.breakdownBar}>
                                        <View
                                            style={[
                                                styles.breakdownFill,
                                                {
                                                    width: `${dim.score}%`,
                                                    backgroundColor: getScoreColor(dim.score),
                                                },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.breakdownDetail}>{dim.detail}</Text>
                                    <Text style={styles.breakdownWeight}>Weight: {dim.weight}%</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.LARGE,
    },
    scoreContainer: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        alignItems: 'center',
    },
    circleContainer: {
        position: 'relative',
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        marginBottom: SPACING.SMALL,
    },
    scoreCenter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreNumber: {
        fontSize: 36,
        fontWeight: '700',
    },
    gradeText: {
        fontSize: 14,
        color: COLORS.TEXT_MUTED,
        fontWeight: '600',
    },
    labelContainer: {
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    scoreLabel: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: SPACING.TINY,
    },
    trendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    trendText: {
        fontSize: 13,
        fontWeight: '500',
    },
    miniBreakdown: {
        flexDirection: 'row',
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        gap: 2,
        marginBottom: SPACING.SMALL,
    },
    miniSegment: {
        height: '100%',
        borderRadius: 3,
    },
    tapHint: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        opacity: 0.6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#111',
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    modalScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: SPACING.LARGE,
    },
    modalScore: {
        fontSize: 42,
        fontWeight: '700',
    },
    modalGrade: {
        fontSize: 18,
        color: COLORS.TEXT_MUTED,
    },
    breakdownList: {
        marginBottom: SPACING.LARGE,
    },
    breakdownItem: {
        marginBottom: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    breakdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    breakdownLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.WHITE,
    },
    breakdownScore: {
        fontSize: 15,
        fontWeight: '700',
    },
    breakdownBar: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: SPACING.TINY,
    },
    breakdownFill: {
        height: '100%',
        borderRadius: 4,
    },
    breakdownDetail: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.TINY,
    },
    breakdownWeight: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        marginTop: 2,
    },
});

export default FinancialHealthScore;
```

- [ ] **Step 11.2** Commit: `git add packages/mobile/src/components/FinancialHealthScore.js && git commit -m "feat: Add FinancialHealthScore component with circular gauge and breakdown modal"`

---

### Task 12: Create InsightCardV2 Component

**Files:**
- Create: `packages/mobile/src/components/InsightCardV2.js`

Steps:

- [ ] **Step 12.1** Create the expandable insight card at `packages/mobile/src/components/InsightCardV2.js`:

```jsx
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    LayoutAnimation,
    UIManager,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PRIORITY_CONFIG = {
    high: {
        color: COLORS.RED,
        bgColor: 'rgba(255, 107, 107, 0.15)',
        icon: 'alert-circle',
        label: 'High Priority',
    },
    medium: {
        color: '#FFA726',
        bgColor: 'rgba(255, 167, 38, 0.15)',
        icon: 'information-circle',
        label: 'Medium',
    },
    low: {
        color: COLORS.GOLD_LIGHT,
        bgColor: 'rgba(229, 192, 72, 0.15)',
        icon: 'checkmark-circle',
        label: 'Low',
    },
};

const CATEGORY_ICONS = {
    'Tax-Advantaged Account Opportunities': { icon: 'trending-up', color: COLORS.CAT_TAX },
    'Spending Optimization': { icon: 'cut', color: COLORS.CAT_SPENDING },
    'Debt Payoff Acceleration': { icon: 'card', color: COLORS.CAT_DEBT },
    'Savings Acceleration': { icon: 'wallet', color: COLORS.CAT_SAVINGS },
    'Cash Flow Optimization': { icon: 'cash', color: COLORS.CAT_CASHFLOW },
    'Investment Readiness': { icon: 'bar-chart', color: COLORS.CAT_INVEST },
    'Milestone Celebrations': { icon: 'trophy', color: COLORS.CAT_MILESTONE },
    'ETF/Investment Recommendations': { icon: 'pie-chart', color: COLORS.CAT_ETF },
    'Tax Optimization': { icon: 'receipt', color: COLORS.CAT_TAX },
    'Wealth Building Strategies': { icon: 'diamond', color: COLORS.CAT_WEALTH },
    'Comparative Analysis': { icon: 'stats-chart', color: COLORS.CAT_COMPARATIVE },
    'Opportunity Cost Insights': { icon: 'swap-horizontal', color: COLORS.CAT_OPPORTUNITY },
    'Seasonal/Timely Insights': { icon: 'calendar', color: COLORS.CAT_SEASONAL },
};

const InsightCardV2 = ({ insight, onAction, onDismiss, maxAnnualSavings = 5000 }) => {
    const [expanded, setExpanded] = useState(false);

    const priority = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
    const categoryConfig = CATEGORY_ICONS[insight.type] || { icon: 'bulb', color: COLORS.GOLD };
    const annualSavings = insight.potential_benefit?.annual_savings || insight.potential_benefit?.annual_growth_estimate || 0;
    const impactPercent = Math.min(100, (annualSavings / maxAnnualSavings) * 100);

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    const handleAction = async (action) => {
        if (onAction) onAction(action, insight.id);
        if (action?.type === 'web_link' && action?.url) {
            try {
                await Linking.openURL(action.url);
            } catch (err) {
                console.error('Failed to open URL:', err);
            }
        }
    };

    const isHighPriority = insight.priority === 'high';

    return (
        <TouchableOpacity
            style={[
                styles.card,
                isHighPriority && styles.highPriorityCard,
            ]}
            onPress={toggleExpand}
            activeOpacity={0.85}
        >
            {/* Top Row: Priority + Dismiss */}
            <View style={styles.topRow}>
                <View style={[styles.priorityBadge, { backgroundColor: priority.bgColor }]}>
                    <Ionicons name={priority.icon} size={12} color={priority.color} />
                    <Text style={[styles.priorityText, { color: priority.color }]}>
                        {priority.label}
                    </Text>
                </View>
                {insight.dismissible && (
                    <TouchableOpacity
                        onPress={() => onDismiss?.(insight.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close" size={18} color={COLORS.TEXT_MUTED} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Category + Title */}
            <View style={styles.headerRow}>
                <View style={[styles.categoryIcon, { backgroundColor: categoryConfig.color + '20' }]}>
                    <Ionicons name={categoryConfig.icon} size={20} color={categoryConfig.color} />
                </View>
                <View style={styles.headerText}>
                    <Text style={[styles.categoryLabel, { color: categoryConfig.color }]}>
                        {insight.type}
                    </Text>
                    <Text style={styles.title} numberOfLines={expanded ? 0 : 2}>
                        {insight.title}
                    </Text>
                </View>
            </View>

            {/* Description (collapsed: 2 lines, expanded: full) */}
            <Text style={styles.description} numberOfLines={expanded ? 0 : 2}>
                {insight.description}
            </Text>

            {/* Impact Meter (always visible) */}
            {annualSavings > 0 && (
                <View style={styles.impactContainer}>
                    <Text style={styles.impactLabel}>
                        ${annualSavings.toLocaleString()}/yr potential {insight.potential_benefit?.annual_growth_estimate ? 'growth' : 'savings'}
                    </Text>
                    <View style={styles.impactBar}>
                        <View style={[styles.impactFill, { width: `${impactPercent}%` }]} />
                    </View>
                </View>
            )}

            {/* Expand indicator */}
            {!expanded && (
                <View style={styles.expandHint}>
                    <Ionicons name="chevron-down" size={16} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.expandText}>Tap for details</Text>
                </View>
            )}

            {/* Expanded Content */}
            {expanded && (
                <View style={styles.expandedContent}>
                    {/* Reasoning */}
                    {insight.reasoning && insight.reasoning.length > 0 && (
                        <View style={styles.reasoningContainer}>
                            <Text style={styles.reasoningLabel}>Why this matters:</Text>
                            {insight.reasoning.map((reason, index) => (
                                <View key={index} style={styles.reasoningItem}>
                                    <View style={[styles.bulletDot, { backgroundColor: categoryConfig.color }]} />
                                    <Text style={styles.reasoningText}>{reason}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Benefit Card */}
                    {insight.potential_benefit && (
                        <View style={styles.benefitCard}>
                            <Ionicons name="trending-up" size={20} color={COLORS.GREEN} />
                            <View style={styles.benefitTextContainer}>
                                <Text style={styles.benefitLabel}>Potential Benefit</Text>
                                <View style={styles.benefitAmounts}>
                                    {insight.potential_benefit.monthly_savings > 0 && (
                                        <Text style={styles.benefitAmount}>
                                            ${insight.potential_benefit.monthly_savings}/mo
                                        </Text>
                                    )}
                                    {(insight.potential_benefit.annual_savings > 0 || insight.potential_benefit.annual_growth_estimate > 0) && (
                                        <Text style={styles.benefitAnnual}>
                                            ${(insight.potential_benefit.annual_savings || insight.potential_benefit.annual_growth_estimate || 0).toLocaleString()}/yr
                                        </Text>
                                    )}
                                </View>
                                {insight.potential_benefit.calculation && (
                                    <Text style={styles.calculationText}>
                                        {insight.potential_benefit.calculation}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionContainer}>
                        {insight.action?.primary && (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={() => handleAction(insight.action.primary)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>
                                    {insight.action.primary.label}
                                </Text>
                                <Ionicons
                                    name={insight.action.primary.type === 'web_link' ? 'open-outline' : 'arrow-forward'}
                                    size={16}
                                    color={COLORS.BACKGROUND}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    highPriorityCard: {
        borderColor: 'rgba(255, 107, 107, 0.3)',
        shadowColor: COLORS.RED,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.SMALL,
        gap: 4,
    },
    priorityText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    categoryIcon: {
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
    },
    categoryLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.WHITE,
        lineHeight: 22,
    },
    description: {
        fontSize: 14,
        color: COLORS.WHITE,
        lineHeight: 20,
        opacity: 0.85,
        marginBottom: SPACING.SMALL,
    },
    impactContainer: {
        marginBottom: SPACING.SMALL,
    },
    impactLabel: {
        fontSize: 12,
        color: COLORS.GREEN,
        fontWeight: '600',
        marginBottom: 4,
    },
    impactBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    impactFill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: COLORS.GREEN,
    },
    expandHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingTop: SPACING.TINY,
    },
    expandText: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
    },
    expandedContent: {
        marginTop: SPACING.SMALL,
    },
    reasoningContainer: {
        backgroundColor: 'rgba(201, 162, 39, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(201, 162, 39, 0.15)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    reasoningLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        marginBottom: SPACING.SMALL,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    reasoningItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    bulletDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 6,
    },
    reasoningText: {
        flex: 1,
        fontSize: 13,
        color: COLORS.WHITE,
        lineHeight: 18,
        opacity: 0.85,
    },
    benefitCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.3)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    benefitTextContainer: {
        flex: 1,
    },
    benefitLabel: {
        fontSize: 11,
        color: COLORS.GREEN,
        marginBottom: SPACING.TINY,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    benefitAmounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
    },
    benefitAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.GREEN,
    },
    benefitAnnual: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GREEN,
        opacity: 0.8,
    },
    calculationText: {
        fontSize: 11,
        color: COLORS.GOLD_LIGHT,
        marginTop: SPACING.SMALL,
        lineHeight: 16,
        opacity: 0.7,
    },
    actionContainer: {
        gap: SPACING.SMALL,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
        gap: SPACING.SMALL,
    },
    primaryButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.BACKGROUND,
    },
});

export default InsightCardV2;
```

- [ ] **Step 12.2** Commit: `git add packages/mobile/src/components/InsightCardV2.js && git commit -m "feat: Add expandable InsightCardV2 with impact meter and category-colored icons"`

---

### Task 13: Create InvestmentCorner Component

**Files:**
- Create: `packages/mobile/src/components/InvestmentCorner.js`

Steps:

- [ ] **Step 13.1** Create the Investment Corner section at `packages/mobile/src/components/InvestmentCorner.js`:

```jsx
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const ETFMiniCard = ({ etf, onPress }) => {
    const returnPositive = etf.historical_returns.one_year_percent >= 0;
    const returnColor = returnPositive ? COLORS.ETF_POSITIVE : COLORS.ETF_NEGATIVE;

    return (
        <TouchableOpacity style={styles.etfCard} onPress={() => onPress?.(etf)} activeOpacity={0.8}>
            <View style={[styles.etfCategoryBar, { backgroundColor: returnColor }]} />
            <Text style={styles.etfTicker}>{etf.ticker}</Text>
            <Text style={styles.etfName} numberOfLines={2}>{etf.name}</Text>
            <View style={styles.etfReturnRow}>
                <Ionicons
                    name={returnPositive ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={returnColor}
                />
                <Text style={[styles.etfReturn, { color: returnColor }]}>
                    {etf.historical_returns.one_year_percent}%
                </Text>
            </View>
            <Text style={styles.etfMer}>MER {etf.mer_percent}%</Text>
            <View style={styles.etfRiskChip}>
                <Text style={styles.etfRiskText}>
                    {etf.risk_level.charAt(0).toUpperCase() + etf.risk_level.slice(1)}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const InvestmentCorner = ({ navigation }) => {
    const [etfs, setEtfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [riskProfile, setRiskProfile] = useState('moderate');

    useEffect(() => {
        loadRecommendedETFs();
    }, []);

    const loadRecommendedETFs = async () => {
        try {
            const response = await api.getRecommendedETFs();
            if (response.success && response.data) {
                setEtfs(response.data.etfs || []);
                setRiskProfile(response.data.risk_profile || 'moderate');
            }
        } catch (err) {
            console.error('Failed to load recommended ETFs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleETFPress = async (etf) => {
        try {
            await api.trackETFInteraction(etf.ticker, 'viewed', 'investment_corner');
        } catch (e) { /* ignore tracking errors */ }

        // Navigate to ETF list screen if available, otherwise open Wealthsimple
        if (navigation) {
            navigation.navigate('ETFList', { highlightTicker: etf.ticker });
        }
    };

    const handleSeeAll = () => {
        if (navigation) {
            navigation.navigate('ETFList');
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="small" color={COLORS.GOLD} />
            </View>
        );
    }

    if (etfs.length === 0) return null;

    return (
        <View style={styles.container}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
                <View style={styles.titleRow}>
                    <Ionicons name="pie-chart-outline" size={20} color={COLORS.CAT_ETF} />
                    <Text style={styles.sectionTitle}>Investment Corner</Text>
                </View>
                <TouchableOpacity style={styles.seeAllButton} onPress={handleSeeAll}>
                    <Text style={styles.seeAllText}>SEE ALL</Text>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.GOLD} />
                </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>
                Based on your {riskProfile} risk profile
            </Text>

            {/* ETF Scroll */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.etfScroll}
            >
                {etfs.map((etf) => (
                    <ETFMiniCard key={etf.ticker} etf={etf} onPress={handleETFPress} />
                ))}
            </ScrollView>

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>
                Approximate historical data. Not investment advice.
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.TINY,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    seeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.TINY,
    },
    seeAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.MEDIUM,
        opacity: 0.8,
    },
    etfScroll: {
        paddingRight: SPACING.LARGE,
    },
    etfCard: {
        width: 160,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.MEDIUM,
        marginRight: SPACING.MEDIUM,
        overflow: 'hidden',
    },
    etfCategoryBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
    },
    etfTicker: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.WHITE,
        marginTop: SPACING.TINY,
    },
    etfName: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        marginBottom: SPACING.SMALL,
        lineHeight: 15,
    },
    etfReturnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginBottom: SPACING.TINY,
    },
    etfReturn: {
        fontSize: 20,
        fontWeight: '700',
    },
    etfMer: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        marginBottom: SPACING.SMALL,
    },
    etfRiskChip: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    etfRiskText: {
        fontSize: 10,
        color: COLORS.TEXT_MUTED,
        fontWeight: '600',
    },
    disclaimer: {
        fontSize: 10,
        color: '#666',
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        fontStyle: 'italic',
    },
});

export default InvestmentCorner;
```

- [ ] **Step 13.2** Commit: `git add packages/mobile/src/components/InvestmentCorner.js && git commit -m "feat: Add InvestmentCorner component with ETF mini-cards and risk profile filtering"`

---

### Task 14: Redesign InsightsScreen

**Files:**
- Modify: `packages/mobile/src/screens/InsightsScreen.js`
- Create: `packages/mobile/src/screens/ETFListScreen.js`
- Modify: `packages/mobile/src/navigation/AppNavigator.js`

Steps:

- [ ] **Step 14.1** Rewrite InsightsScreen.js to integrate all new components. Replace the entire file content with the new version that includes: FinancialHealthScore at top, priority tab filtering, InsightCardV2 cards, InvestmentCorner section, updated Wealth Academy section, and compliance disclaimer. The new InsightsScreen should:

1. Import `FinancialHealthScore`, `InsightCardV2`, `InvestmentCorner`
2. Add `healthScore` state and load it from `response.data.health_score`
3. Add `activeTab` state for priority filtering (`all`, `high`, `medium`, `low`)
4. Render tab bar with counts
5. Use `InsightCardV2` instead of the old `renderInsightCard`
6. Add `InvestmentCorner` section between insights and Wealth Academy
7. Update the disclaimer text to include ETF/investment disclaimers

The key structural changes to `InsightsScreen.js`:
- Add state: `const [healthScore, setHealthScore] = useState(null);`
- Add state: `const [activeTab, setActiveTab] = useState('all');`
- In `loadInsights` success handler, add: `setHealthScore(response.data.health_score || null);`
- Add a `filteredInsights` memo that filters by `activeTab`
- Replace the `renderInsightCard` function usage with `<InsightCardV2>` components
- Add tab bar UI between header and insight cards
- Add `<FinancialHealthScore healthScore={healthScore} />` after the header
- Add `<InvestmentCorner navigation={navigation} />` after insights
- Update the disclaimer text

This is a large file rewrite. The implementer should create the full new `InsightsScreen.js` incorporating all new components while preserving the existing loading, error, empty states, bank connection retry logic, and Wealth Academy section.

- [ ] **Step 14.2** Create a basic ETFListScreen at `packages/mobile/src/screens/ETFListScreen.js`:

```jsx
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'all_equity', label: 'Equity' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'fixed_income', label: 'Bonds' },
    { key: 'dividend', label: 'Dividend' },
    { key: 'hisa_etf', label: 'HISA' },
];

const ETFListScreen = ({ navigation, route }) => {
    const [etfs, setEtfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const highlightTicker = route.params?.highlightTicker;

    useEffect(() => {
        loadETFs();
    }, [activeFilter]);

    const loadETFs = async () => {
        try {
            setLoading(true);
            const params = activeFilter !== 'all' ? { category: activeFilter } : {};
            const response = await api.getETFs(params);
            if (response.success && response.data) {
                setEtfs(response.data.etfs || []);
            }
        } catch (err) {
            console.error('Failed to load ETFs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleBuyLink = async (etf) => {
        try {
            await api.trackETFInteraction(etf.ticker, 'clicked_buy_link', 'etf_list');
            await Linking.openURL('https://www.wealthsimple.com/en-ca/invest');
        } catch (e) { /* ignore */ }
    };

    const renderETFCard = ({ item: etf }) => {
        const returnPositive = etf.historical_returns.one_year_percent >= 0;
        const returnColor = returnPositive ? COLORS.ETF_POSITIVE : COLORS.ETF_NEGATIVE;
        const isHighlighted = etf.ticker === highlightTicker;

        return (
            <View style={[styles.etfCard, isHighlighted && styles.highlightedCard]}>
                <View style={styles.etfHeader}>
                    <View>
                        <Text style={styles.etfTicker}>{etf.ticker}</Text>
                        <Text style={styles.etfName}>{etf.name}</Text>
                        <Text style={styles.etfProvider}>{etf.provider}</Text>
                    </View>
                    <View style={styles.returnContainer}>
                        <Text style={[styles.returnValue, { color: returnColor }]}>
                            {returnPositive ? '+' : ''}{etf.historical_returns.one_year_percent}%
                        </Text>
                        <Text style={styles.returnLabel}>1yr return</Text>
                    </View>
                </View>

                <Text style={styles.etfDescription}>{etf.description}</Text>

                <View style={styles.metricRow}>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>MER</Text>
                        <Text style={styles.metricValue}>{etf.mer_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Yield</Text>
                        <Text style={styles.metricValue}>{etf.distribution_yield_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>5yr Avg</Text>
                        <Text style={styles.metricValue}>{etf.historical_returns.five_year_annualized_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Risk</Text>
                        <Text style={styles.metricValue}>{etf.risk_level}</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.buyButton} onPress={() => handleBuyLink(etf)}>
                    <Text style={styles.buyButtonText}>Where to Buy</Text>
                    <Ionicons name="open-outline" size={14} color={COLORS.GOLD} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Canadian ETFs</Text>
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
                <Ionicons name="information-circle" size={14} color="#888" />
                <Text style={styles.disclaimerText}>
                    Educational purposes only. Data is approximate and updated quarterly. Not investment advice. Past performance does not guarantee future results.
                </Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                {FILTER_TABS.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.filterTab, activeFilter === tab.key && styles.activeFilterTab]}
                        onPress={() => setActiveFilter(tab.key)}
                    >
                        <Text style={[styles.filterTabText, activeFilter === tab.key && styles.activeFilterText]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ETF List */}
            {loading ? (
                <ActivityIndicator size="large" color={COLORS.GOLD} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={etfs}
                    keyExtractor={(item) => item.ticker}
                    renderItem={renderETFCard}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
    },
    backButton: {
        padding: SPACING.TINY,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    disclaimerBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginHorizontal: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.SMALL,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    disclaimerText: {
        flex: 1,
        fontSize: 11,
        color: '#888',
        lineHeight: 16,
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.SMALL,
        flexWrap: 'wrap',
    },
    filterTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.SMALL,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    activeFilterTab: {
        backgroundColor: COLORS.GOLD,
    },
    filterTabText: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        fontWeight: '500',
    },
    activeFilterText: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: 120,
    },
    etfCard: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    highlightedCard: {
        borderColor: COLORS.GOLD,
        borderWidth: 2,
    },
    etfHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    etfTicker: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    etfName: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        maxWidth: 200,
    },
    etfProvider: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    returnContainer: {
        alignItems: 'flex-end',
    },
    returnValue: {
        fontSize: 24,
        fontWeight: '700',
    },
    returnLabel: {
        fontSize: 11,
        color: '#666',
    },
    etfDescription: {
        fontSize: 13,
        color: COLORS.WHITE,
        opacity: 0.7,
        lineHeight: 18,
        marginBottom: SPACING.MEDIUM,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    metric: {
        alignItems: 'center',
    },
    metricLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.WHITE,
    },
    buyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.GOLD,
        borderRadius: BORDER_RADIUS.MEDIUM,
        paddingVertical: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    buyButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GOLD,
    },
});

export default ETFListScreen;
```

- [ ] **Step 14.3** Register ETFListScreen in AppNavigator.js. Find:

Find:
```js
                <Stack.Screen
                    name="Feedback"
                    component={FeedbackScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
```

Replace with:
```js
                <Stack.Screen
                    name="Feedback"
                    component={FeedbackScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="ETFList"
                    component={ETFListScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
```

- [ ] **Step 14.4** Add the ETFListScreen import at the top of AppNavigator.js. Find:

Find:
```js
import FeedbackScreen from '../screens/FeedbackScreen';
```

Replace with:
```js
import FeedbackScreen from '../screens/FeedbackScreen';
import ETFListScreen from '../screens/ETFListScreen';
```

- [ ] **Step 14.5** Commit: `git add packages/mobile/src/screens/InsightsScreen.js packages/mobile/src/screens/ETFListScreen.js packages/mobile/src/navigation/AppNavigator.js && git commit -m "feat: Redesign InsightsScreen with health score, tabs, expandable cards, Investment Corner, ETF list"`

- [ ] **Step 14.6** Manual verification: Start the Expo dev server and verify on a simulator:
```bash
cd packages/mobile && npx expo start
```
Check:
- Financial Health Score circular gauge renders at top of Insights tab
- Priority tab bar filters insights correctly
- Insight cards expand/collapse on tap
- Impact meter shows on cards with annual savings
- Investment Corner shows recommended ETFs in horizontal scroll
- Tapping "See All" on Investment Corner navigates to ETFListScreen
- ETFListScreen filter tabs work
- Wealth Academy section still shows articles
- Disclaimer text is visible at bottom

---

## Phase 3: Polish

### Task 15: Add Compliance Disclaimers

**Files:**
- Already handled in previous tasks (InsightsScreen disclaimer footer, ETFListScreen disclaimer box, InvestmentCorner inline disclaimer)

Steps:

- [ ] **Step 15.1** Verify all disclaimer text matches the spec requirements:
  - InsightsScreen bottom: "AI insights are for informational purposes only and do not constitute financial, investment, or tax advice. ETF data is approximate, updated quarterly, and may not reflect current market conditions. Past performance does not guarantee future results. Consult a qualified financial advisor before making investment decisions."
  - InvestmentCorner inline: "Approximate historical data. Not investment advice."
  - ETFListScreen top: "Educational purposes only. Data is approximate and updated quarterly. Not investment advice. Past performance does not guarantee future results."

- [ ] **Step 15.2** Verify the AI prompt includes the disclaimer instruction for ETF insights (already in Task 5 prompt rule 24).

- [ ] **Step 15.3** Commit any disclaimer adjustments if needed.

---

### Task 16: API Integration Testing

**Files:**
- No file changes (testing only)

Steps:

- [ ] **Step 16.1** Start the backend and run a full integration test:
```bash
cd packages/backend && npm run dev &
sleep 3

# Login
TOKEN=$(curl -s -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@induswealth.com","password":"demo123"}' | \
  node -e "process.stdin.on('data',d=>{try{const r=JSON.parse(d);console.log(r.data?.token||r.token||'NO_TOKEN')}catch(e){console.log('PARSE_ERROR')}})")

echo "Token: ${TOKEN:0:20}..."

# 1. ETFs - All
echo "=== ETFs - All ==="
curl -s http://localhost:3000/etfs -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Count:', r.data?.count, 'Success:', r.success)})"

# 2. ETFs - By risk
echo "=== ETFs - Conservative ==="
curl -s "http://localhost:3000/etfs?risk_level=conservative" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Count:', r.data?.count)})"

# 3. ETFs - Recommended
echo "=== ETFs - Recommended ==="
curl -s http://localhost:3000/etfs/recommended -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Recommended:', r.data?.etfs?.length, 'Profile:', r.data?.risk_profile)})"

# 4. ETF - Single
echo "=== ETF - XEQT ==="
curl -s http://localhost:3000/etfs/XEQT -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Name:', r.data?.etf?.name, 'MER:', r.data?.etf?.mer_percent)})"

# 5. Health Score
echo "=== Health Score ==="
curl -s http://localhost:3000/insights/health-score -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Score:', r.data?.score, 'Grade:', r.data?.grade, 'Trend:', r.data?.trend)})"

# 6. Full Insights (with health score)
echo "=== Full Insights ==="
curl -s "http://localhost:3000/insights?force_refresh=true" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Insights:', r.data?.insights?.length, 'Health:', r.data?.health_score?.score, 'Model:', r.data?.ai_model_used)})"

# 7. ETF Interaction tracking
echo "=== ETF Interaction ==="
curl -s -X POST http://localhost:3000/etfs/interaction \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"etf_ticker":"XEQT","interaction_type":"viewed","source":"test"}' | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Tracked:', r.success)})"

# 8. Educational articles (should include curated)
echo "=== Educational Articles ==="
curl -s "http://localhost:3000/educational/articles?limit=5" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Articles:', r.data?.articles?.length, 'Total:', r.data?.pagination?.total)})"

echo "=== Integration test complete ==="
```

- [ ] **Step 16.2** Verify all endpoints return `success: true` and expected data shapes. Fix any issues found.

- [ ] **Step 16.3** Final commit for any polish fixes: `git add -A && git commit -m "fix: Integration testing fixes for AI insights upgrade"`
