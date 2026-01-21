const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown } = require('../services/categorization');

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
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /analytics] Request received');

    try {
        const userId = req.user.id;
        const { period = '30' } = req.query; // Default to 30 days

        // Get transactions and accounts
        const [transactions, accounts] = await Promise.all([
            db.getTransactions(userId, 1000), // Get more transactions for analytics
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

        // Apply categorization to transactions
        const categorizedTransactions = filteredTransactions.map(tx => {
            const categoryInfo = categorizeTransaction(tx);
            return {
                ...tx,
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color
            };
        });

        const prevCategorizedTransactions = previousPeriodTransactions.map(tx => {
            const categoryInfo = categorizeTransaction(tx);
            return {
                ...tx,
                category: (tx.category && tx.category.length > 0)
                    ? tx.category
                    : [categoryInfo.category],
                categoryIcon: categoryInfo.icon,
                categoryColor: categoryInfo.color
            };
        });

        // Get category breakdown using our categorization
        const categoryBreakdown = getCategoryBreakdown(categorizedTransactions);

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

        console.log(`   📤 Responding with enhanced analytics for ${period} days\n`);

        res.json({
            success: true,
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
                categoryBreakdown: categoryBreakdown.map(cat => ({
                    category: cat.name,
                    amount: cat.total,
                    count: cat.count,
                    icon: cat.icon,
                    color: cat.color,
                })),
                dailySpending,
                incomeVsExpenses: {
                    income: totalIncome,
                    expenses: totalExpenses,
                },
                netWorthTrend,
            },
            // NEW: Enhanced analytics
            wealthNarrative,
            burnRate,
            spendingByIntent,
            topMerchant,
            aiTip,
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /analytics/monthly
// Returns monthly spending trends
router.get('/monthly', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /analytics/monthly] Request received');

    try {
        const userId = req.user.id;
        const monthlyTrends = await db.getMonthlySpending(userId, 6); // Last 6 months

        res.json({
            success: true,
            data: monthlyTrends.map(month => ({
                month: month.month,
                spending: parseFloat(month.spending),
                income: parseFloat(month.income),
            })),
        });
    } catch (error) {
        console.error('Error fetching monthly analytics:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
