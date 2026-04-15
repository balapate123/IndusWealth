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
