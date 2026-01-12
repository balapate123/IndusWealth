const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../middleware/auth');

// GET /analytics
// Returns analytics data for charts and insights
router.get('/', authenticateToken, async (req, res) => {
    console.log('\n📥 [GET /analytics] Request received');

    try {
        const userId = req.user.id;
        const { period = '30' } = req.query; // Default to 30 days

        // Get all analytics data in parallel
        const [categorySpending, dailySpending, incomeVsExpenses, accounts] = await Promise.all([
            db.getCategorySpending(userId, parseInt(period)),
            db.getDailySpending(userId, parseInt(period)),
            db.getIncomeVsExpenses(userId, parseInt(period)),
            db.getAccounts(userId),
        ]);

        // Calculate totals
        const totalSpending = categorySpending.reduce((sum, cat) => sum + parseFloat(cat.amount || 0), 0);
        const totalIncome = parseFloat(incomeVsExpenses.income || 0);
        const totalExpenses = parseFloat(incomeVsExpenses.expenses || 0);
        const netCashFlow = totalIncome - totalExpenses;

        // Calculate liquid cash
        const liquidAccountTypes = ['checking', 'savings', 'depository'];
        const liquidCash = accounts
            .filter(acc => liquidAccountTypes.includes(acc.type) || liquidAccountTypes.includes(acc.subtype))
            .reduce((sum, acc) => sum + parseFloat(acc.current_balance || 0), 0);

        // Get previous period for comparison
        const previousPeriodSpending = await db.getCategorySpending(userId, parseInt(period), parseInt(period));
        const previousTotal = previousPeriodSpending.reduce((sum, cat) => sum + parseFloat(cat.amount || 0), 0);
        const spendingChange = previousTotal > 0
            ? ((totalSpending - previousTotal) / previousTotal * 100).toFixed(1)
            : 0;

        // Find top spending category
        const topCategory = categorySpending.length > 0
            ? categorySpending.reduce((max, cat) => parseFloat(cat.amount) > parseFloat(max.amount) ? cat : max, categorySpending[0])
            : null;

        // Calculate average daily spending
        const avgDailySpending = dailySpending.length > 0
            ? (dailySpending.reduce((sum, day) => sum + parseFloat(day.amount || 0), 0) / dailySpending.length).toFixed(2)
            : 0;

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
                spendingChange: parseFloat(spendingChange),
                avgDailySpending: parseFloat(avgDailySpending),
                topCategory: topCategory ? {
                    name: topCategory.category,
                    amount: parseFloat(topCategory.amount),
                } : null,
            },
            charts: {
                categoryBreakdown: categorySpending.map(cat => ({
                    category: cat.category,
                    amount: parseFloat(cat.amount),
                    count: parseInt(cat.count),
                })),
                dailySpending: dailySpending.map(day => ({
                    date: day.date,
                    amount: parseFloat(day.amount),
                })),
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
