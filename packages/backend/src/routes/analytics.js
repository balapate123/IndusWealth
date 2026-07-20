const express = require('express');
const router = express.Router();
const db = require('../services/db');
const plaidService = require('../services/plaid');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown, batchCategorizeWithAI } = require('../services/categorization');
const { generateCategoryInsights } = require('../services/ai_insights');
const { createLogger } = require('../services/logger');
const { DATA_SOURCES, PLAID_STATUS, createMeta, successResponse, getPlaidStatusFromError } = require('../utils/responseHelper');

const logger = createLogger('ANALYTICS');

// Intent categories mapping
const INTENT_CATEGORIES = {
    fixedNeeds: ['Payments', 'Fees & Charges', 'Transfers', 'Health & Pharmacy'],
    growth: ['Investments', 'Income'],
    lifestyle: ['Restaurants', 'Entertainment', 'Shopping', 'Alcohol & Bars', 'Subscriptions', 'Fitness']
};

// Helper: Calculate month progress percentage
const getMonthProgress = () => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.round((now.getDate() / daysInMonth) * 100);
};

// Helper: Calculate spending by intent
const getSpendingByIntent = (categoryBreakdown) => {
    const result = {
        fixedNeeds: { amount: 0, label: 'Fixed Needs' },
        growth: { amount: 0, label: 'Growth' },
        lifestyle: { amount: 0, label: 'Lifestyle' }
    };

    categoryBreakdown.forEach(cat => {
        const categoryName = cat.name;
        if (INTENT_CATEGORIES.fixedNeeds.includes(categoryName)) {
            result.fixedNeeds.amount += cat.total;
        } else if (INTENT_CATEGORIES.growth.includes(categoryName)) {
            result.growth.amount += cat.total;
        } else {
            // Default to lifestyle for unmatched categories
            result.lifestyle.amount += cat.total;
        }
    });

    const total = result.fixedNeeds.amount + result.growth.amount + result.lifestyle.amount;
    result.fixedNeeds.percentage = total > 0 ? Math.round((result.fixedNeeds.amount / total) * 100) : 0;
    result.growth.percentage = total > 0 ? Math.round((result.growth.amount / total) * 100) : 0;
    result.lifestyle.percentage = total > 0 ? Math.round((result.lifestyle.amount / total) * 100) : 0;

    return result;
};

// Helper: Get top merchant spending
const getTopMerchant = (transactions, previousTransactions) => {
    const merchantMap = {};
    const prevMerchantMap = {};

    // Current period
    transactions.forEach(tx => {
        if (parseFloat(tx.amount) > 0) {
            const merchant = tx.merchant_name || tx.name || 'Unknown';
            const cleanMerchant = merchant.split(/\s+/).slice(0, 2).join(' ');
            if (!merchantMap[cleanMerchant]) {
                merchantMap[cleanMerchant] = { amount: 0, category: tx.category?.[0] || 'Other' };
            }
            merchantMap[cleanMerchant].amount += parseFloat(tx.amount);
        }
    });

    // Previous period
    previousTransactions.forEach(tx => {
        if (parseFloat(tx.amount) > 0) {
            const merchant = tx.merchant_name || tx.name || 'Unknown';
            const cleanMerchant = merchant.split(/\s+/).slice(0, 2).join(' ');
            if (!prevMerchantMap[cleanMerchant]) {
                prevMerchantMap[cleanMerchant] = 0;
            }
            prevMerchantMap[cleanMerchant] += parseFloat(tx.amount);
        }
    });

    // Find top merchant
    const sortedMerchants = Object.entries(merchantMap)
        .sort(([, a], [, b]) => b.amount - a.amount);

    if (sortedMerchants.length === 0) {
        return null;
    }

    const [topName, topData] = sortedMerchants[0];
    const previousAmount = prevMerchantMap[topName] || 0;
    const changePercent = previousAmount > 0
        ? Math.round(((topData.amount - previousAmount) / previousAmount) * 100)
        : 0;

    return {
        name: topName,
        amount: Math.round(topData.amount * 100) / 100,
        previousAmount: Math.round(previousAmount * 100) / 100,
        changePercent,
        category: topData.category
    };
};

// Helper: Generate AI tip based on financial data
const generateAiTip = (surplus, netCashFlow, totalExpenses) => {
    const hisaRate = 0.045; // 4.5% annual rate
    const monthlyEarnings = Math.round((surplus * hisaRate) / 12);

    if (surplus > 500) {
        return {
            title: 'Optimization Tip',
            description: `Move $${surplus.toLocaleString()} to your HISA for an extra $${monthlyEarnings}/mo interest.`,
            action: 'Execute Now',
            surplus: Math.round(surplus),
            potentialEarnings: monthlyEarnings
        };
    } else if (netCashFlow < 0) {
        return {
            title: 'Spending Alert',
            description: `You're spending $${Math.abs(Math.round(netCashFlow))} more than your income. Review subscriptions.`,
            action: 'Review Now',
            surplus: 0,
            potentialEarnings: 0
        };
    } else {
        return {
            title: 'AI Insight',
            description: `You're on track to spend $${Math.round(totalExpenses * 1.1)} by EOM. Consider the TTC for work commutes.`,
            action: 'View Details',
            surplus: Math.round(surplus),
            potentialEarnings: monthlyEarnings
        };
    }
};

// Helper: Generate wealth narrative
const generateWealthNarrative = (accounts, netCashFlow, periodDays) => {
    // Calculate total assets (all positive balances)
    const totalAssets = accounts
        .filter(acc => parseFloat(acc.current_balance || 0) > 0)
        .reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

    // Calculate total debts (credit card balances, loans)
    const debtTypes = ['credit', 'loan'];
    const totalDebt = accounts
        .filter(acc => debtTypes.includes(acc.type) || debtTypes.includes(acc.subtype))
        .reduce((sum, acc) => sum + Math.abs(parseFloat(acc.current_balance || 0)), 0);

    const netWorth = totalAssets - totalDebt;

    // Simulate change based on net cash flow (extrapolated)
    const changeAmount = netCashFlow;
    const changePercent = netWorth !== 0 ? Math.round((changeAmount / (netWorth - changeAmount)) * 1000) / 10 : 0;

    // Generate narrative text
    let narrative = '';
    if (changePercent > 0) {
        narrative = `Your Net Worth increased by ${Math.abs(changePercent)}% this month. Growth driven by $${Math.abs(Math.round(changeAmount / 1000))}k surplus and market returns.`;
    } else if (changePercent < 0) {
        narrative = `Your Net Worth decreased by ${Math.abs(changePercent)}% this month. Consider reviewing your spending.`;
    } else {
        narrative = 'Your Net Worth has remained stable this month.';
    }

    return {
        netWorth: Math.round(netWorth * 100) / 100,
        netWorthChange: changePercent,
        netWorthChangeAmount: Math.round(changeAmount * 100) / 100,
        narrative,
        totalAssets: Math.round(totalAssets * 100) / 100,
        totalDebt: Math.round(totalDebt * 100) / 100
    };
};

// GET /analytics
// Returns analytics data for charts and insights
router.get('/', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const period = req.query.period || '30';
    logger.info('Fetching analytics', { ...ctx, period });

    try {
        const userId = req.user.id;
        const { refresh } = req.query;
        const forceRefresh = refresh === 'true';

        let dataSource = DATA_SOURCES.DATABASE;
        let plaidStatus = PLAID_STATUS.CACHED;

        // Sync from Plaid if needed (same logic as transactions endpoint)
        const needsSync = forceRefresh || await db.shouldSync(userId, 'last_transaction_sync', 24);

        if (needsSync) {
            logger.info('Syncing transactions from Plaid for analytics', { ...ctx, forceRefresh });
            const accessToken = req.user.plaidAccessToken || process.env.PLAID_ACCESS_TOKEN_OVERRIDE;

            if (accessToken) {
                try {
                    const plaidTransactions = await plaidService.getTransactions(accessToken);
                    await db.upsertTransactions(userId, plaidTransactions);

                    // Also refresh accounts
                    try {
                        const plaidAccounts = await plaidService.getAccounts(accessToken);
                        await db.upsertAccounts(userId, plaidAccounts);
                    } catch (accErr) {
                        logger.warn('Could not fetch accounts', { ...ctx, error: accErr });
                    }

                    await db.updateSyncTime(userId, 'last_transaction_sync');
                    dataSource = DATA_SOURCES.PLAID_API;
                    plaidStatus = PLAID_STATUS.SUCCESS;
                    logger.info('Synced transactions from Plaid for analytics', { ...ctx, count: plaidTransactions.length });
                } catch (plaidError) {
                    plaidStatus = getPlaidStatusFromError(plaidError);
                    logger.warn('Plaid sync failed for analytics', { ...ctx, error: plaidError });
                }
            } else {
                plaidStatus = PLAID_STATUS.NO_TOKEN;
            }
        }

        // Get transactions and accounts
        const [transactions, accounts] = await Promise.all([
            db.getTransactions(userId, 1000),
            db.getAccounts(userId),
        ]);

        // Filter transactions by period
        const periodDays = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Also get previous period for comparison
        const prevStartDate = new Date();
        prevStartDate.setDate(prevStartDate.getDate() - (periodDays * 2));

        const filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startDate;
        });

        const previousPeriodTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= prevStartDate && txDate < startDate;
        });

        // Apply categorization to transactions (now async)
        const categorizedTransactions = [];
        const transactionsNeedingAI = [];

        for (const tx of filteredTransactions) {
            const categoryInfo = await categorizeTransaction(tx);
            categorizedTransactions.push({
                ...tx,
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color,
                categorySource: categoryInfo.source
            });

            if (categoryInfo.needsAI) {
                transactionsNeedingAI.push(tx);
            }
        }

        const prevCategorizedTransactions = [];
        for (const tx of previousPeriodTransactions) {
            const categoryInfo = await categorizeTransaction(tx);
            prevCategorizedTransactions.push({
                ...tx,
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color,
                categorySource: categoryInfo.source
            });

            if (categoryInfo.needsAI) {
                transactionsNeedingAI.push(tx);
            }
        }

        // Trigger background AI categorization (non-blocking)
        if (transactionsNeedingAI.length > 0) {
            logger.info('Triggering background AI categorization', {
                ...ctx,
                count: transactionsNeedingAI.length
            });

            // Run in background (don't await)
            batchCategorizeWithAI(transactionsNeedingAI)
                .then(() => {
                    logger.info('Background AI categorization completed', { ...ctx });
                })
                .catch(err => {
                    logger.error('Background AI categorization failed', { ...ctx, error: err });
                });
        }

        // Get category breakdown using our categorization
        const categoryBreakdown = await getCategoryBreakdown(categorizedTransactions);

        // Previous-period breakdown for per-category comparison
        const prevCategoryBreakdown = await getCategoryBreakdown(prevCategorizedTransactions);
        const prevCategoryMap = {};
        prevCategoryBreakdown.forEach(cat => {
            prevCategoryMap[cat.name] = cat.total;
        });

        // Calculate totals
        const totalSpending = categoryBreakdown.reduce((sum, cat) => sum + cat.total, 0);

        // Calculate income and expenses
        let totalIncome = 0;
        let totalExpenses = 0;
        categorizedTransactions.forEach(tx => {
            const amount = parseFloat(tx.amount);
            if (amount < 0) {
                totalIncome += Math.abs(amount);
            } else {
                totalExpenses += amount;
            }
        });

        const netCashFlow = totalIncome - totalExpenses;

        // Calculate liquid cash
        const liquidAccountTypes = ['checking', 'savings', 'depository'];
        const liquidCash = accounts
            .filter(acc => liquidAccountTypes.includes(acc.type) || liquidAccountTypes.includes(acc.subtype))
            .reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

        // Get daily spending
        const dailySpendingMap = {};
        categorizedTransactions.forEach(tx => {
            if (parseFloat(tx.amount) > 0) {
                const date = tx.date;
                dailySpendingMap[date] = (dailySpendingMap[date] || 0) + parseFloat(tx.amount);
            }
        });
        const dailySpending = Object.entries(dailySpendingMap)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate average daily spending
        const avgDailySpending = dailySpending.length > 0
            ? (dailySpending.reduce((sum, day) => sum + day.amount, 0) / periodDays).toFixed(2)
            : 0;

        // Find top spending category
        const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

        // ============ NEW ANALYTICS DATA ============

        // 1. Wealth Narrative
        const wealthNarrative = generateWealthNarrative(accounts, netCashFlow, periodDays);

        // 2. Burn Rate
        const monthProgress = getMonthProgress();
        const estimatedMonthlyBudget = totalIncome > 0 ? totalIncome * 0.85 : totalExpenses * 1.2;
        const budgetSpent = estimatedMonthlyBudget > 0
            ? Math.round((totalExpenses / estimatedMonthlyBudget) * 100)
            : 0;
        const burnRateStatus = budgetSpent <= monthProgress ? 'safe' : budgetSpent <= monthProgress + 15 ? 'warning' : 'danger';
        const paceAmount = Math.abs(Math.round((monthProgress - budgetSpent) * estimatedMonthlyBudget / 100));

        const burnRate = {
            monthProgress,
            budgetSpent: Math.min(budgetSpent, 100),
            status: burnRateStatus,
            difference: paceAmount,
            message: budgetSpent <= monthProgress
                ? `You're $${paceAmount} under-paced`
                : `You're $${paceAmount} over-paced`
        };

        // 3. Spending by Intent
        const spendingByIntent = getSpendingByIntent(categoryBreakdown);

        // 4. Top Merchant
        const topMerchant = getTopMerchant(categorizedTransactions, prevCategorizedTransactions);

        // 5. AI Tip
        const surplus = netCashFlow > 0 ? netCashFlow : 0;
        const aiTip = generateAiTip(surplus, netCashFlow, totalExpenses);

        // 6. Net Worth Trend (simulated daily data)
        const netWorthTrend = [];
        const baseNetWorth = wealthNarrative.netWorth - netCashFlow;
        let runningTotal = baseNetWorth;
        for (let i = periodDays; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dailyChange = dailySpendingMap[dateStr] || 0;
            runningTotal += (netCashFlow / periodDays) - (dailyChange * 0.3);
            netWorthTrend.push({
                date: dateStr,
                value: Math.round(runningTotal)
            });
        }

        const meta = await createMeta(userId, dataSource, {
            syncType: 'last_transaction_sync',
            plaidStatus,
            count: categorizedTransactions.length
        });

        logger.info('Returning analytics', {
            ...ctx,
            period: periodDays,
            transactionCount: categorizedTransactions.length,
            dataSource,
            plaidStatus
        });

        successResponse(res, {
            period: parseInt(period),
            summary: {
                liquidCash,
                totalSpending,
                totalIncome,
                totalExpenses,
                netCashFlow,
                spendingChange: 0,
                avgDailySpending: parseFloat(avgDailySpending),
                topCategory: topCategory ? {
                    name: topCategory.name,
                    amount: topCategory.total,
                    icon: topCategory.icon,
                    color: topCategory.color,
                } : null,
            },
            charts: {
                categoryBreakdown: categoryBreakdown.map(cat => {
                    const previousAmount = prevCategoryMap[cat.name] || 0;
                    return {
                        category: cat.name,
                        amount: cat.total,
                        count: cat.count,
                        icon: cat.icon,
                        color: cat.color,
                        previousAmount: Math.round(previousAmount * 100) / 100,
                        changePercent: previousAmount > 0
                            ? Math.round(((cat.total - previousAmount) / previousAmount) * 100)
                            : null,
                    };
                }),
                dailySpending,
                incomeVsExpenses: {
                    income: totalIncome,
                    expenses: totalExpenses,
                },
                netWorthTrend,
            },
            // Enhanced analytics
            wealthNarrative,
            burnRate,
            spendingByIntent,
            topMerchant,
            aiTip,
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch analytics', { ...ctx, error });
        next(error);
    }
});

// GET /analytics/monthly
// Returns monthly spending trends
router.get('/monthly', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Fetching monthly analytics', ctx);

    try {
        const userId = req.user.id;
        const monthlyTrends = await db.getMonthlySpending(userId, 6);

        const meta = await createMeta(userId, DATA_SOURCES.DATABASE, {
            syncType: 'last_transaction_sync',
            count: monthlyTrends.length
        });

        logger.info('Returning monthly analytics', { ...ctx, monthCount: monthlyTrends.length });

        successResponse(res, {
            data: monthlyTrends.map(month => ({
                month: month.month,
                spending: parseFloat(month.spending),
                income: parseFloat(month.income),
            })),
        }, meta);
    } catch (error) {
        logger.error('Failed to fetch monthly analytics', { ...ctx, error });
        next(error);
    }
});

// ============ ADVANCED CATEGORY ANALYTICS ============

const round2 = (n) => Math.round(n * 100) / 100;

// Same merchant normalization as getTopMerchant (first two words)
const cleanMerchantName = (tx) => {
    const merchant = tx.merchant_name || tx.name || 'Unknown';
    return merchant.split(/\s+/).slice(0, 2).join(' ');
};

// Local noon avoids UTC date-shift when parsing YYYY-MM-DD strings
const txDate = (tx) => new Date(`${tx.date}T12:00:00`);

// Helper: Build computed insight nuggets from category analytics
const buildCategoryInsights = ({ categories, totalSpend, weekendSpend, firstHalfSpend, secondHalfSpend, topMerchantsOverall, expenseCount }) => {
    const insights = [];
    if (totalSpend <= 0 || expenseCount === 0) return insights;

    // Biggest increase vs previous period
    const withPrev = categories.filter(c => c.prevTotal > 0);
    const biggestUp = [...withPrev].sort((a, b) => b.changeAmount - a.changeAmount)[0];
    if (biggestUp && biggestUp.changeAmount > 0 && biggestUp.changePercent >= 10) {
        insights.push({
            type: 'increase',
            icon: 'trending-up',
            color: '#FF6B6B',
            title: `${biggestUp.name} is rising`,
            description: `Up ${biggestUp.changePercent}% vs the previous period — $${round2(biggestUp.changeAmount).toLocaleString()} more spent.`
        });
    }

    // Biggest decrease vs previous period
    const biggestDown = [...withPrev].sort((a, b) => a.changeAmount - b.changeAmount)[0];
    if (biggestDown && biggestDown.changeAmount < 0 && Math.abs(biggestDown.changePercent) >= 10) {
        insights.push({
            type: 'decrease',
            icon: 'trending-down',
            color: '#4CAF50',
            title: `${biggestDown.name} is down`,
            description: `You cut ${biggestDown.name.toLowerCase()} by ${Math.abs(biggestDown.changePercent)}% — $${round2(Math.abs(biggestDown.changeAmount)).toLocaleString()} saved vs last period.`
        });
    }

    // Concentration: top category share of wallet
    const topCat = categories[0];
    if (topCat && topCat.percentage >= 25) {
        insights.push({
            type: 'concentration',
            icon: 'pie-chart',
            color: '#C9A227',
            title: `${topCat.name} dominates`,
            description: `${topCat.percentage.toFixed(0)}% of your spending goes to ${topCat.name.toLowerCase()} ($${topCat.total.toLocaleString()}).`
        });
    }

    // Most frequent category (habit spending)
    const mostFrequent = [...categories].sort((a, b) => b.count - a.count)[0];
    if (mostFrequent && mostFrequent.count >= 5) {
        insights.push({
            type: 'frequency',
            icon: 'repeat',
            color: '#5856D6',
            title: `${mostFrequent.name} is a habit`,
            description: `${mostFrequent.count} purchases this period, averaging $${mostFrequent.avgTransaction.toFixed(2)} each.`
        });
    }

    // Weekend spending share
    const weekendShare = Math.round((weekendSpend / totalSpend) * 100);
    if (weekendShare >= 40) {
        insights.push({
            type: 'weekend',
            icon: 'calendar',
            color: '#AF52DE',
            title: 'Weekend spender',
            description: `${weekendShare}% of your spending happens on weekends — just 2 of 7 days.`
        });
    }

    // Spending velocity: first vs second half of the period
    if (firstHalfSpend > 0 && secondHalfSpend > firstHalfSpend * 1.25) {
        const pct = Math.round(((secondHalfSpend - firstHalfSpend) / firstHalfSpend) * 100);
        insights.push({
            type: 'accelerating',
            icon: 'speedometer',
            color: '#FF9500',
            title: 'Spending is accelerating',
            description: `The second half of this period is up ${pct}% over the first half.`
        });
    } else if (secondHalfSpend > 0 && firstHalfSpend > secondHalfSpend * 1.25) {
        const pct = Math.round(((firstHalfSpend - secondHalfSpend) / firstHalfSpend) * 100);
        insights.push({
            type: 'decelerating',
            icon: 'speedometer',
            color: '#4CAF50',
            title: 'Spending is slowing down',
            description: `The second half of this period is down ${pct}% from the first half.`
        });
    }

    // Merchant concentration
    const topMerchant = topMerchantsOverall[0];
    if (topMerchant) {
        const share = Math.round((topMerchant.total / totalSpend) * 100);
        if (share >= 15) {
            insights.push({
                type: 'merchant',
                icon: 'storefront',
                color: '#32ADE6',
                title: `${topMerchant.name} is your top merchant`,
                description: `${share}% of total spending across ${topMerchant.count} transaction${topMerchant.count === 1 ? '' : 's'}.`
            });
        }
    }

    return insights.slice(0, 5);
};

// Compute the full advanced-analytics payload for a user + period.
// Shared by GET /categories (screen data) and GET /categories/insights (AI input).
// Reads from the DB only — the mobile app forces a Plaid sync via
// /transactions?refresh=true before calling these on pull-to-refresh.
const computeCategoryAnalytics = async (userId, periodDays) => {
        const [transactions, monthlyTrend] = await Promise.all([
            db.getTransactions(userId, 2000),
            db.getMonthlySpending(userId, 6),
        ]);

        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - periodDays);
        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - periodDays);

        // Categorize every fetched transaction once. categorizeTransaction is
        // the single source of truth (pattern > Plaid > AI cache > Other) so
        // aggregates and the drill-down transaction lists always agree.
        const enriched = [];
        for (const tx of transactions) {
            const info = await categorizeTransaction(tx);
            enriched.push({
                id: tx.id,
                transaction_id: tx.transaction_id,
                name: tx.name,
                merchant_name: tx.merchant_name,
                amount: parseFloat(tx.amount),
                date: tx.date,
                account_name: tx.account_name,
                account_id: tx.account_id,
                pending: tx.pending,
                categoryName: info.category,
                categoryIcon: info.icon,
                categoryColor: info.color,
            });
        }

        const inPeriod = enriched.filter(tx => txDate(tx) >= startDate);
        const inPrevPeriod = enriched.filter(tx => {
            const d = txDate(tx);
            return d >= prevStartDate && d < startDate;
        });

        const expenses = inPeriod.filter(tx => tx.amount > 0);
        const prevExpenses = inPrevPeriod.filter(tx => tx.amount > 0);

        const totalSpend = expenses.reduce((s, tx) => s + tx.amount, 0);
        const prevTotalSpend = prevExpenses.reduce((s, tx) => s + tx.amount, 0);
        const totalIncome = inPeriod
            .filter(tx => tx.amount < 0)
            .reduce((s, tx) => s + Math.abs(tx.amount), 0);

        // Per-category accumulation
        const catMap = {};
        expenses.forEach(tx => {
            if (!catMap[tx.categoryName]) {
                catMap[tx.categoryName] = {
                    name: tx.categoryName,
                    icon: tx.categoryIcon,
                    color: tx.categoryColor,
                    total: 0,
                    count: 0,
                    min: Infinity,
                    max: -Infinity,
                    weekdayTotal: 0,
                    weekendTotal: 0,
                    merchants: {},
                    transactions: [],
                };
            }
            const c = catMap[tx.categoryName];
            c.total += tx.amount;
            c.count += 1;
            c.min = Math.min(c.min, tx.amount);
            c.max = Math.max(c.max, tx.amount);
            const day = txDate(tx).getDay();
            if (day === 0 || day === 6) c.weekendTotal += tx.amount;
            else c.weekdayTotal += tx.amount;
            const merchant = cleanMerchantName(tx);
            if (!c.merchants[merchant]) {
                c.merchants[merchant] = { name: merchant, total: 0, count: 0 };
            }
            c.merchants[merchant].total += tx.amount;
            c.merchants[merchant].count += 1;
            c.transactions.push(tx);
        });

        // Previous-period totals per category
        const prevCatTotals = {};
        prevExpenses.forEach(tx => {
            prevCatTotals[tx.categoryName] = (prevCatTotals[tx.categoryName] || 0) + tx.amount;
        });

        // Last 6 calendar months (local time, oldest first)
        const now = new Date();
        const monthKeys = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        // Per-category monthly totals over the last 6 months
        const catMonthly = {};
        enriched.forEach(tx => {
            if (tx.amount <= 0) return;
            const month = tx.date.slice(0, 7);
            if (!monthKeys.includes(month)) return;
            if (!catMonthly[tx.categoryName]) catMonthly[tx.categoryName] = {};
            catMonthly[tx.categoryName][month] = (catMonthly[tx.categoryName][month] || 0) + tx.amount;
        });

        const categories = Object.values(catMap)
            .map(c => {
                const prevTotal = prevCatTotals[c.name] || 0;
                const topMerchants = Object.values(c.merchants)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .map(m => ({
                        name: m.name,
                        total: round2(m.total),
                        count: m.count,
                        avg: round2(m.total / m.count),
                    }));
                const txList = c.transactions
                    .sort((a, b) => txDate(b) - txDate(a))
                    .slice(0, 100)
                    .map(tx => ({
                        id: tx.id,
                        transaction_id: tx.transaction_id,
                        name: tx.name,
                        merchant_name: tx.merchant_name,
                        amount: round2(tx.amount),
                        date: tx.date,
                        account_name: tx.account_name,
                        pending: tx.pending,
                    }));
                return {
                    name: c.name,
                    icon: c.icon,
                    color: c.color,
                    total: round2(c.total),
                    count: c.count,
                    percentage: totalSpend > 0 ? round2((c.total / totalSpend) * 100) : 0,
                    avgTransaction: round2(c.total / c.count),
                    minTransaction: round2(c.min),
                    maxTransaction: round2(c.max),
                    prevTotal: round2(prevTotal),
                    changeAmount: round2(c.total - prevTotal),
                    changePercent: prevTotal > 0
                        ? Math.round(((c.total - prevTotal) / prevTotal) * 100)
                        : null,
                    weekdayTotal: round2(c.weekdayTotal),
                    weekendTotal: round2(c.weekendTotal),
                    monthlyTrend: monthKeys.map(month => ({
                        month,
                        amount: round2((catMonthly[c.name] && catMonthly[c.name][month]) || 0),
                    })),
                    topMerchants,
                    transactions: txList,
                };
            })
            .sort((a, b) => b.total - a.total);

        // Day-of-week pattern (Mon..Sun display order)
        const dowTotals = Array.from({ length: 7 }, () => ({ amount: 0, count: 0 }));
        expenses.forEach(tx => {
            const day = txDate(tx).getDay();
            dowTotals[day].amount += tx.amount;
            dowTotals[day].count += 1;
        });
        const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayOfWeek = [1, 2, 3, 4, 5, 6, 0].map(d => ({
            day: DOW_LABELS[d],
            amount: round2(dowTotals[d].amount),
            count: dowTotals[d].count,
        }));
        const weekendSpend = dowTotals[0].amount + dowTotals[6].amount;

        // Transaction size distribution
        const SIZE_BUCKETS = [
            { label: 'Under $10', min: 0, max: 10 },
            { label: '$10–$50', min: 10, max: 50 },
            { label: '$50–$100', min: 50, max: 100 },
            { label: '$100–$500', min: 100, max: 500 },
            { label: '$500+', min: 500, max: Infinity },
        ];
        const sizeBuckets = SIZE_BUCKETS.map(b => {
            const bucketTxs = expenses.filter(tx => tx.amount >= b.min && tx.amount < b.max);
            return {
                label: b.label,
                count: bucketTxs.length,
                total: round2(bucketTxs.reduce((s, tx) => s + tx.amount, 0)),
            };
        });

        // Top merchants across all categories
        const merchantMap = {};
        expenses.forEach(tx => {
            const merchant = cleanMerchantName(tx);
            if (!merchantMap[merchant]) {
                merchantMap[merchant] = {
                    name: merchant,
                    total: 0,
                    count: 0,
                    category: tx.categoryName,
                    color: tx.categoryColor,
                };
            }
            merchantMap[merchant].total += tx.amount;
            merchantMap[merchant].count += 1;
        });
        const topMerchantsOverall = Object.values(merchantMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 8)
            .map(m => ({
                name: m.name,
                total: round2(m.total),
                count: m.count,
                avg: round2(m.total / m.count),
                category: m.category,
                color: m.color,
            }));

        // Spending velocity: first vs second half of the period
        const midDate = new Date(startDate);
        midDate.setDate(midDate.getDate() + Math.floor(periodDays / 2));
        let firstHalfSpend = 0;
        let secondHalfSpend = 0;
        expenses.forEach(tx => {
            if (txDate(tx) < midDate) firstHalfSpend += tx.amount;
            else secondHalfSpend += tx.amount;
        });

        // Largest single expense
        const largest = expenses.reduce(
            (best, tx) => (best === null || tx.amount > best.amount ? tx : best),
            null
        );

        // Overall monthly trend aligned to the same 6-month window
        const monthlyMap = {};
        monthlyTrend.forEach(m => { monthlyMap[m.month] = m; });
        const monthlyOverall = monthKeys.map(month => ({
            month,
            spending: round2(parseFloat((monthlyMap[month] && monthlyMap[month].spending) || 0)),
            income: round2(parseFloat((monthlyMap[month] && monthlyMap[month].income) || 0)),
        }));

        const insights = buildCategoryInsights({
            categories,
            totalSpend,
            weekendSpend,
            firstHalfSpend,
            secondHalfSpend,
            topMerchantsOverall,
            expenseCount: expenses.length,
        });

        return {
            period: periodDays,
            summary: {
                totalSpend: round2(totalSpend),
                prevTotalSpend: round2(prevTotalSpend),
                spendChangePercent: prevTotalSpend > 0
                    ? Math.round(((totalSpend - prevTotalSpend) / prevTotalSpend) * 100)
                    : null,
                totalIncome: round2(totalIncome),
                netCashFlow: round2(totalIncome - totalSpend),
                expenseCount: expenses.length,
                avgTransaction: expenses.length > 0 ? round2(totalSpend / expenses.length) : 0,
                avgDailySpend: round2(totalSpend / periodDays),
                activeCategories: categories.length,
                weekendSpend: round2(weekendSpend),
                weekdaySpend: round2(totalSpend - weekendSpend),
                firstHalfSpend: round2(firstHalfSpend),
                secondHalfSpend: round2(secondHalfSpend),
                largestExpense: largest ? {
                    name: largest.merchant_name || largest.name,
                    amount: round2(largest.amount),
                    date: largest.date,
                    category: largest.categoryName,
                    color: largest.categoryColor,
                } : null,
            },
            categories,
            dayOfWeek,
            sizeBuckets,
            topMerchants: topMerchantsOverall,
            monthlyTrend: monthlyOverall,
            insights,
        };
};

// GET /analytics/categories
// Advanced category-level analytics: per-category stats, trends,
// merchants, day-of-week patterns, size distribution, and rule-based insights.
router.get('/categories', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const periodDays = Math.max(parseInt(req.query.period) || 30, 1);
    logger.info('Fetching category analytics', { ...ctx, period: periodDays });

    try {
        const payload = await computeCategoryAnalytics(req.user.id, periodDays);

        const meta = await createMeta(req.user.id, DATA_SOURCES.DATABASE, {
            syncType: 'last_transaction_sync',
            count: payload.summary.expenseCount,
        });

        logger.info('Returning category analytics', {
            ...ctx,
            period: periodDays,
            categories: payload.categories.length,
            expenses: payload.summary.expenseCount,
        });

        successResponse(res, payload, meta);
    } catch (error) {
        logger.error('Failed to fetch category analytics', { ...ctx, error });
        next(error);
    }
});

// GET /analytics/categories/insights
// Gemini-generated insights for the Advanced Analytics screen, cached per
// user + period in category_ai_insights (INSIGHTS_CACHE_HOURS, default 6h).
// Degrades gracefully: cache errors are non-fatal, and when AI is unavailable
// the response carries source: 'unavailable' so the app keeps its rule-based
// insights from /categories.
router.get('/categories/insights', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    const periodDays = Math.max(parseInt(req.query.period) || 30, 1);
    const forceRefresh = req.query.refresh === 'true';
    const cacheHours = parseInt(process.env.INSIGHTS_CACHE_HOURS) || 6;
    logger.info('Fetching AI category insights', { ...ctx, period: periodDays, forceRefresh });

    try {
        const userId = req.user.id;

        if (!forceRefresh) {
            try {
                const cached = await db.pool.query(
                    `SELECT insights, ai_model_used, generated_at
                     FROM category_ai_insights
                     WHERE user_id = $1 AND period_days = $2 AND cache_expires_at > NOW()`,
                    [userId, periodDays]
                );
                if (cached.rows.length > 0) {
                    logger.info('Returning cached AI category insights', ctx);
                    return successResponse(res, {
                        source: 'ai',
                        cached: true,
                        aiModel: cached.rows[0].ai_model_used,
                        generatedAt: cached.rows[0].generated_at,
                        insights: cached.rows[0].insights,
                    });
                }
            } catch (cacheErr) {
                logger.warn('Category insights cache read failed — run migrations?', { ...ctx, error: cacheErr });
            }
        }

        if (!process.env.GEMINI_API_KEY) {
            logger.warn('GEMINI_API_KEY not set — AI category insights unavailable', ctx);
            return successResponse(res, { source: 'unavailable', insights: [] });
        }

        const analytics = await computeCategoryAnalytics(userId, periodDays);
        if (analytics.summary.expenseCount === 0) {
            return successResponse(res, { source: 'unavailable', insights: [] });
        }

        const result = await generateCategoryInsights(analytics);
        if (!result.insights || result.insights.length === 0) {
            logger.warn('AI category insights generation returned nothing', { ...ctx, error: result.metadata?.error_message });
            return successResponse(res, { source: 'unavailable', insights: [] });
        }

        try {
            await db.pool.query(
                `INSERT INTO category_ai_insights
                 (user_id, period_days, insights, ai_model_used, generated_at, cache_expires_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW() + make_interval(hours => $5))
                 ON CONFLICT (user_id, period_days)
                 DO UPDATE SET insights = EXCLUDED.insights,
                               ai_model_used = EXCLUDED.ai_model_used,
                               generated_at = EXCLUDED.generated_at,
                               cache_expires_at = EXCLUDED.cache_expires_at`,
                [userId, periodDays, JSON.stringify(result.insights), result.metadata.ai_model_used, cacheHours]
            );
        } catch (cacheErr) {
            logger.warn('Category insights cache write failed — run migrations?', { ...ctx, error: cacheErr });
        }

        logger.info('Returning fresh AI category insights', {
            ...ctx,
            count: result.insights.length,
            model: result.metadata.ai_model_used,
            generationMs: result.metadata.generation_time_ms,
        });

        successResponse(res, {
            source: 'ai',
            cached: false,
            aiModel: result.metadata.ai_model_used,
            generatedAt: new Date().toISOString(),
            insights: result.insights,
        });
    } catch (error) {
        logger.error('Failed to fetch AI category insights', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
