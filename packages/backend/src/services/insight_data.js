/**
 * Insight Data Aggregation Service
 * Aggregates user financial data into a compact summary for AI analysis
 */

const { pool } = require('./db');

/**
 * Main entry point: Get complete financial summary for a user
 * @param {number} userId - User ID
 * @param {number} analysisPeriodDays - Days to analyze (default 90)
 * @returns {Object} Compact financial summary (~1KB)
 */
async function getUserFinancialSummary(userId, analysisPeriodDays = 90) {
    try {
        // Run queries in parallel for performance
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
    } catch (error) {
        console.error('Error aggregating user financial data:', error);
        throw error;
    }
}

/**
 * Get user profile data
 */
async function _getUserProfile(userId) {
    const result = await pool.query(
        `SELECT id, email, name, date_of_birth, created_at
         FROM users WHERE id = $1`,
        [userId]
    );

    const user = result.rows[0];
    if (!user) {
        throw new Error('User not found');
    }

    // Calculate age if DOB exists
    let age = null;
    if (user.date_of_birth) {
        const today = new Date();
        const birthDate = new Date(user.date_of_birth);
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
    }

    return { age };
}

/**
 * Get account balances organized by type
 */
async function _getAccountsData(userId) {
    const result = await pool.query(
        `SELECT type, subtype, current_balance, available_balance
         FROM accounts WHERE user_id = $1`,
        [userId]
    );

    const accounts = {
        checking: { balance: 0, avg_balance_90d: 0, min_balance_90d: 0 },
        savings: { balance: 0, avg_balance_90d: 0 },
        credit_cards: []
    };

    // Aggregate by account type
    result.rows.forEach(acc => {
        if (acc.type === 'depository') {
            if (acc.subtype === 'checking') {
                accounts.checking.balance += acc.current_balance || 0;
            } else if (acc.subtype === 'savings') {
                accounts.savings.balance += acc.current_balance || 0;
            }
        } else if (acc.type === 'credit') {
            accounts.credit_cards.push({
                balance: Math.abs(acc.current_balance || 0),
                available: acc.available_balance || 0
            });
        }
    });

    // Get historical balance averages (simplified - would need transaction history for precise calc)
    const balanceResult = await pool.query(
        `SELECT
            AVG(CASE WHEN a.subtype = 'checking' THEN a.current_balance ELSE 0 END) as avg_checking,
            MIN(CASE WHEN a.subtype = 'checking' THEN a.current_balance ELSE 999999 END) as min_checking,
            AVG(CASE WHEN a.subtype = 'savings' THEN a.current_balance ELSE 0 END) as avg_savings
         FROM accounts a
         WHERE a.user_id = $1`,
        [userId]
    );

    if (balanceResult.rows[0]) {
        accounts.checking.avg_balance_90d = Math.round(balanceResult.rows[0].avg_checking || accounts.checking.balance);
        accounts.checking.min_balance_90d = Math.round(balanceResult.rows[0].min_checking === 999999 ? 0 : balanceResult.rows[0].min_checking);
        accounts.savings.avg_balance_90d = Math.round(balanceResult.rows[0].avg_savings || accounts.savings.balance);
    }

    return accounts;
}

/**
 * Get spending summary by category for the analysis period
 */
async function _getSpendingSummary(userId, days) {
    // Get category spending
    const categoryResult = await pool.query(
        `SELECT
            COALESCE(category[1], 'Other') as category,
            SUM(amount) as total,
            COUNT(*) as count
         FROM transactions
         WHERE user_id = $1
           AND amount > 0
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
         GROUP BY category[1]
         ORDER BY total DESC`,
        [userId, days]
    );

    const by_category = {};
    let total_spending = 0;
    categoryResult.rows.forEach(row => {
        by_category[row.category.toLowerCase().replace(/ /g, '_')] = Math.round(row.total);
        total_spending += row.total;
    });

    // Get month-over-month comparison
    const momResult = await pool.query(
        `SELECT
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END) as current_month,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '60 days' AND date < CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END) as previous_month
         FROM transactions
         WHERE user_id = $1 AND amount > 0`,
        [userId]
    );

    const mom = momResult.rows[0];
    const current_month = Math.round(mom?.current_month || 0);
    const previous_month = Math.round(mom?.previous_month || 0);
    const change_amount = current_month - previous_month;
    const change_percent = previous_month > 0 ? Math.round((change_amount / previous_month) * 100) : 0;

    // Get transaction count
    const txCountResult = await pool.query(
        `SELECT COUNT(*) as count FROM transactions
         WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - INTERVAL '1 day' * $2`,
        [userId, days]
    );

    const transaction_count = parseInt(txCountResult.rows[0].count);

    return {
        total_spending: Math.round(total_spending),
        avg_monthly_spending: Math.round(total_spending / (days / 30)),
        by_category,
        month_over_month: {
            current_month,
            previous_month,
            change_amount,
            change_percent
        },
        transaction_count,
        avg_transaction_size: transaction_count > 0 ? Math.round(total_spending / transaction_count) : 0
    };
}

/**
 * Get income summary
 */
async function _getIncomeSummary(userId, days) {
    const result = await pool.query(
        `SELECT
            SUM(ABS(amount)) as total_income,
            COUNT(*) as deposit_count
         FROM transactions
         WHERE user_id = $1
           AND amount < 0
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2`,
        [userId, days]
    );

    const total_income = Math.round(result.rows[0]?.total_income || 0);
    const avg_monthly_income = Math.round(total_income / (days / 30));

    return {
        total_income,
        avg_monthly_income,
        estimated_annual_income: avg_monthly_income * 12,
        sources: [
            {
                source: 'Direct Deposit',
                monthly_avg: avg_monthly_income,
                consistency: 'consistent'
            }
        ]
    };
}

/**
 * Identify recurring subscriptions from transactions
 * IMPORTANT: Only includes actual subscriptions (streaming, software, memberships)
 * Excludes regular recurring expenses (restaurants, gas, groceries, transportation)
 */
async function _getSubscriptions(userId) {
    // Identify recurring payments (same merchant, similar amount, ~30 day intervals)
    // Filter out non-subscription categories like restaurants, gas, groceries, transportation
    const result = await pool.query(
        `WITH recurring_merchants AS (
            SELECT
                merchant_name,
                category[1] as primary_category,
                ROUND(AVG(amount)::numeric, 2) as avg_amount,
                COUNT(*) as occurrence_count,
                MAX(date) as last_charge,
                MIN(date) as first_charge
            FROM transactions
            WHERE user_id = $1
              AND amount > 0
              AND merchant_name IS NOT NULL
              AND date >= CURRENT_DATE - INTERVAL '6 months'
              -- Exclude categories that are NOT subscriptions
              AND category[1] NOT ILIKE '%restaurant%'
              AND category[1] NOT ILIKE '%food%'
              AND category[1] NOT ILIKE '%dining%'
              AND category[1] NOT ILIKE '%gas%'
              AND category[1] NOT ILIKE '%fuel%'
              AND category[1] NOT ILIKE '%groceries%'
              AND category[1] NOT ILIKE '%grocery%'
              AND category[1] NOT ILIKE '%transportation%'
              AND category[1] NOT ILIKE '%travel%'
              AND category[1] NOT ILIKE '%coffee%'
              AND category[1] NOT ILIKE '%bar%'
              AND category[1] NOT ILIKE '%alcohol%'
              AND category[1] NOT ILIKE '%entertainment%'
              AND category[1] NOT ILIKE '%shopping%'
              AND category[1] NOT ILIKE '%pharmacy%'
              AND category[1] NOT ILIKE '%health%'
            GROUP BY merchant_name, category[1]
            HAVING COUNT(*) >= 3
        )
        SELECT * FROM recurring_merchants
        WHERE occurrence_count >= 3
        ORDER BY avg_amount DESC
        LIMIT 20`,
        [userId]
    );

    return result.rows.map(row => ({
        name: row.merchant_name,
        amount: parseFloat(row.avg_amount),
        frequency: 'monthly',
        category: row.primary_category,
        last_charge: row.last_charge,
        usage_detected: true, // Simplified - would need more analysis
        occurrence_count: row.occurrence_count
    }));
}

/**
 * Get debt summary (credit cards + custom debts)
 */
async function _getDebtSummary(userId) {
    // Get credit card debts from accounts
    const ccResult = await pool.query(
        `SELECT name, ABS(current_balance) as balance
         FROM accounts
         WHERE user_id = $1 AND type = 'credit' AND current_balance < 0`,
        [userId]
    );

    // Get custom debts
    const customResult = await pool.query(
        `SELECT name, balance, apr, min_payment
         FROM custom_debts
         WHERE user_id = $1 AND balance > 0`,
        [userId]
    );

    let total_balance = 0;
    let total_minimum_monthly = 0;
    let highest_apr = 0;
    let highest_apr_account = null;

    ccResult.rows.forEach(row => {
        total_balance += parseFloat(row.balance);
        const minPayment = Math.max(row.balance * 0.03, 25); // Estimate 3% or $25
        total_minimum_monthly += minPayment;
        // Credit cards typically 19.99%
        if (19.99 > highest_apr) {
            highest_apr = 19.99;
            highest_apr_account = row.name;
        }
    });

    customResult.rows.forEach(row => {
        total_balance += parseFloat(row.balance);
        total_minimum_monthly += parseFloat(row.min_payment || 0);
        if (row.apr > highest_apr) {
            highest_apr = row.apr;
            highest_apr_account = row.name;
        }
    });

    // Estimate monthly interest cost
    const total_monthly_interest_cost = (total_balance * (highest_apr / 100)) / 12;

    return {
        total_balance: Math.round(total_balance),
        total_minimum_monthly: Math.round(total_minimum_monthly),
        highest_apr: highest_apr,
        highest_apr_account,
        total_monthly_interest_cost: Math.round(total_monthly_interest_cost),
        accounts_count: ccResult.rows.length + customResult.rows.length
    };
}

/**
 * Get credit health metrics
 */
async function _getCreditHealth(userId) {
    const result = await pool.query(
        `SELECT
            SUM(CASE WHEN type = 'credit' THEN ABS(available_balance + current_balance) ELSE 0 END) as total_limit,
            SUM(CASE WHEN type = 'credit' AND current_balance < 0 THEN ABS(current_balance) ELSE 0 END) as total_used
         FROM accounts
         WHERE user_id = $1`,
        [userId]
    );

    const total_credit_limit = Math.round(result.rows[0]?.total_limit || 0);
    const total_credit_used = Math.round(result.rows[0]?.total_used || 0);
    const utilization_percent = total_credit_limit > 0
        ? Math.round((total_credit_used / total_credit_limit) * 100)
        : 0;

    let utilization_status = 'excellent';
    if (utilization_percent > 70) utilization_status = 'poor';
    else if (utilization_percent > 50) utilization_status = 'fair';
    else if (utilization_percent > 30) utilization_status = 'good';

    return {
        credit_score: null, // Not available from Plaid in sandbox
        total_credit_limit,
        total_credit_used,
        utilization_percent,
        utilization_status
    };
}

/**
 * Get savings metrics
 */
async function _getSavingsMetrics(userId, days) {
    const result = await pool.query(
        `SELECT
            SUM(CASE WHEN type = 'depository' THEN current_balance ELSE 0 END) as total_liquid
         FROM accounts
         WHERE user_id = $1`,
        [userId]
    );

    // Get average monthly expenses for emergency fund calculation
    const expensesResult = await pool.query(
        `SELECT SUM(amount) as total_expenses
         FROM transactions
         WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - INTERVAL '1 day' * $2`,
        [userId, days]
    );

    const total_liquid_savings = Math.round(result.rows[0]?.total_liquid || 0);
    const avg_monthly_expenses = Math.round((expensesResult.rows[0]?.total_expenses || 0) / (days / 30));
    const emergency_fund_months_coverage = avg_monthly_expenses > 0
        ? parseFloat((total_liquid_savings / avg_monthly_expenses).toFixed(2))
        : 0;

    return {
        total_liquid_savings,
        emergency_fund_months_coverage,
        avg_monthly_expenses
    };
}

/**
 * Get cash flow analysis
 */
async function _getCashFlow(userId, days) {
    const result = await pool.query(
        `SELECT
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_income,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_expenses
         FROM transactions
         WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '1 day' * $2`,
        [userId, days]
    );

    const total_income = result.rows[0]?.total_income || 0;
    const total_expenses = result.rows[0]?.total_expenses || 0;
    const avg_monthly_income = Math.round(total_income / (days / 30));
    const avg_monthly_expenses = Math.round(total_expenses / (days / 30));
    const avg_monthly_surplus = avg_monthly_income - avg_monthly_expenses;

    // Get debt payments from debt summary
    const debtResult = await pool.query(
        `SELECT
            SUM(min_payment) as total_min_payments
         FROM custom_debts
         WHERE user_id = $1 AND balance > 0`,
        [userId]
    );

    const avg_monthly_debt_payments = Math.round(debtResult.rows[0]?.total_min_payments || 0);

    // Discretionary spending (entertainment, dining, shopping)
    const discretionaryResult = await pool.query(
        `SELECT SUM(amount) as discretionary
         FROM transactions
         WHERE user_id = $1
           AND amount > 0
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
           AND (category[1] ILIKE '%dining%'
                OR category[1] ILIKE '%entertainment%'
                OR category[1] ILIKE '%shopping%'
                OR category[1] ILIKE '%recreation%')`,
        [userId, days]
    );

    const discretionary_spending = Math.round((discretionaryResult.rows[0]?.discretionary || 0) / (days / 30));

    return {
        avg_monthly_income,
        avg_monthly_expenses,
        avg_monthly_debt_payments,
        avg_monthly_surplus,
        discretionary_spending
    };
}

/**
 * Calculate financial readiness indicators
 */
function _calculateFinancialReadiness(savingsMetrics, debtSummary, incomeSummary) {
    const emergency_fund_complete = savingsMetrics.emergency_fund_months_coverage >= 3;
    const high_interest_debt_cleared = debtSummary.highest_apr < 10 || debtSummary.total_balance === 0;
    const stable_income = incomeSummary.avg_monthly_income > 0;
    const positive_cash_flow = incomeSummary.avg_monthly_income > savingsMetrics.avg_monthly_expenses;
    const ready_to_invest = emergency_fund_complete && high_interest_debt_cleared && stable_income && positive_cash_flow;

    return {
        emergency_fund_complete,
        high_interest_debt_cleared,
        stable_income,
        positive_cash_flow,
        ready_to_invest
    };
}

module.exports = {
    getUserFinancialSummary
};
