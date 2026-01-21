const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');
const { categorizeTransaction, getCategoryBreakdown } = require('../services/categorization');

// GET /analytics
// Returns analytics data for charts and insights
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /analytics] Request received');

    try {
        const userId = req.user.id;
        const { period = '30' } = req.query; // Default to 30 days

        // Get transactions and accounts
        const [transactions, accounts] = await Promise.all([
            db.getTransactions(userId, 500), // Get more transactions for analytics
            db.getAccounts(userId),
        ]);

        // Filter transactions by period
        const periodDays = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        const filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startDate;
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

        console.log(`   📤 Responding with analytics for ${period} days\n`);

        res.json({
            success: true,
            period: parseInt(period),
            summary: {
                liquidCash,
                totalSpending,
                totalIncome,
                totalExpenses,
                netCashFlow,
                spendingChange: 0, // TODO: Add period comparison
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
            },
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
