/**
 * Debt Calculator Service
 * Calculates debt payoff timelines using Snowball and Avalanche strategies
 * Supports both Plaid liabilities and custom user-entered debts
 */

// Default APRs by account type
const DEFAULT_APRS = {
    'credit_card': 22.00,
    'line_of_credit': 11.00,
    'personal_loan': 10.00,
    'student_loan': 6.00,
    'mortgage': 5.00,
    'other': 15.00
};

class DebtCalculator {
    /**
     * Main calculation entry point
     * @param {Object} liabilities - Plaid liabilities object
     * @param {number} extraMonthlyPayment - Extra payment amount
     * @param {Array} customDebts - Array of custom debt objects
     */
    calculate(liabilities, extraMonthlyPayment = 0, customDebts = []) {
        // 1. Normalize all debts into unified format
        const debts = this._normalizeDebts(liabilities, customDebts)
            .filter(d => d.balance > 0); // Only active debts

        if (debts.length === 0) {
            return this._emptyResult();
        }

        // 2. Calculate Status Quo (Min Payments Only)
        const statusQuo = this._simulateRepayment(debts, 0, 'APR_DESC');

        // 3. Calculate Avalanche (Extra Payment to Highest APR)
        const avalanche = this._simulateRepayment(debts, extraMonthlyPayment, 'APR_DESC');

        // 4. Calculate Snowball (Extra Payment to Lowest Balance)
        const snowball = this._simulateRepayment(debts, extraMonthlyPayment, 'BALANCE_ASC');

        // 5. Get per-debt payoff info for display
        const debtDetails = debts.map(d => ({
            id: d.id,
            name: d.name,
            balance: d.balance,
            apr: d.apr,
            min_payment: d.min_payment_calc,
            is_custom: d.is_custom || false,
            debt_type: d.debt_type || 'other',
            // Individual payoff without extra payments
            solo_payoff_months: this._calculateSoloPayoff(d)
        }));

        return {
            total_debt: debts.reduce((sum, d) => sum + d.balance, 0),
            total_min_payment: debts.reduce((sum, d) => sum + d.min_payment_calc, 0),
            debt_count: debts.length,
            debts: debtDetails,
            strategies: {
                status_quo: statusQuo,
                avalanche: avalanche,
                snowball: snowball
            },
            savings: {
                interest_saved_avalanche: Math.round(statusQuo.total_interest - avalanche.total_interest),
                months_saved_avalanche: statusQuo.months_to_payoff - avalanche.months_to_payoff,
                interest_saved_snowball: Math.round(statusQuo.total_interest - snowball.total_interest),
                months_saved_snowball: statusQuo.months_to_payoff - snowball.months_to_payoff
            }
        };
    }

    /**
     * Calculate payoff months for a single debt with just minimum payments
     */
    _calculateSoloPayoff(debt) {
        if (debt.balance <= 0) return 0;

        let balance = debt.balance;
        let months = 0;
        const monthlyRate = debt.apr / 100 / 12;
        const minPayment = debt.min_payment_calc;

        // Safety limit
        while (balance > 0 && months < 600) {
            months++;
            const interest = balance * monthlyRate;
            balance += interest;
            const payment = Math.min(balance, minPayment);
            balance -= payment;

            // Check if payment is less than interest (will never pay off)
            if (minPayment <= interest && months > 12) {
                return 999; // Indicates "never" at minimum payments
            }
        }

        return months;
    }

    /**
     * Normalize debts from various sources into unified format
     */
    _normalizeDebts(liabilities, customDebts = []) {
        let all = [];

        // Process Plaid credit cards
        if (liabilities?.credit) {
            all = all.concat(liabilities.credit.map((d, idx) => {
                // Use effective_apr if available (already processed with overrides)
                // Otherwise fall back to Plaid APR or default
                const plaidApr = d.aprs?.find(a => a.apr_type === 'purchase_apr')?.apr_percentage;
                const apr = d.effective_apr ?? plaidApr ?? DEFAULT_APRS['credit_card'];
                const balance = d.last_statement_balance || 0;

                return {
                    id: d.account_id || `plaid_credit_${idx}`,
                    name: d.name || 'Credit Card',
                    balance: balance,
                    apr: apr,
                    min_payment: d.minimum_payment_amount || 0,
                    min_payment_calc: d.minimum_payment_amount || Math.max(balance * 0.02, 25),
                    debt_type: 'credit_card',
                    is_custom: false,
                    apr_source: d.apr_source || 'plaid'
                };
            }));
        }

        // Process Plaid student loans
        if (liabilities?.student) {
            all = all.concat(liabilities.student.map((d, idx) => ({
                id: d.account_id || `plaid_student_${idx}`,
                name: d.name || 'Student Loan',
                balance: d.outstanding_interest_amount + (d.principal_balance || 0),
                apr: d.interest_rate_percentage || DEFAULT_APRS['student_loan'],
                min_payment: d.minimum_payment_amount || 0,
                min_payment_calc: d.minimum_payment_amount || 200,
                debt_type: 'student_loan',
                is_custom: false
            })));
        }

        // Process custom debts
        if (customDebts && customDebts.length > 0) {
            all = all.concat(customDebts.map(d => ({
                id: d.id,
                name: d.name,
                balance: parseFloat(d.balance),
                apr: parseFloat(d.apr),
                min_payment: parseFloat(d.min_payment) || 0,
                min_payment_calc: parseFloat(d.min_payment) || Math.max(parseFloat(d.balance) * 0.02, 25),
                debt_type: d.debt_type || 'other',
                is_custom: true
            })));
        }

        return all;
    }

    /**
     * Simulate debt repayment over time
     */
    _simulateRepayment(initialDebts, extraPayment, sortMethod) {
        // Deep copy to avoid mutation during simulation
        let debts = JSON.parse(JSON.stringify(initialDebts));
        let totalInterest = 0;
        let months = 0;
        const payoffOrder = []; // Track in which month each debt gets paid off

        // Safety break to prevent infinite loops
        while (debts.some(d => d.balance > 0) && months < 600) {
            months++;
            let monthlyExtraAvailable = extraPayment;

            // Sort debts for this month's target
            debts.sort((a, b) => {
                if (sortMethod === 'APR_DESC') return b.apr - a.apr;
                if (sortMethod === 'BALANCE_ASC') return a.balance - b.balance;
                return 0;
            });

            // 1. Apply Minimum Payments & Accrue Interest
            debts.forEach(d => {
                if (d.balance <= 0) return;

                // Interest for this month
                const interest = d.balance * (d.apr / 100 / 12);
                d.balance += interest;
                totalInterest += interest;

                // Pay Minimum
                let payment = Math.min(d.balance, d.min_payment_calc);
                d.balance -= payment;

                // Track if paid off
                if (d.balance <= 0 && !payoffOrder.find(p => p.id === d.id)) {
                    payoffOrder.push({ id: d.id, name: d.name, month: months });
                }
            });

            // 2. Apply Extra Payment to Target (First in sorted list with balance)
            for (let d of debts) {
                if (d.balance > 0 && monthlyExtraAvailable > 0) {
                    let payment = Math.min(d.balance, monthlyExtraAvailable);
                    d.balance -= payment;
                    monthlyExtraAvailable -= payment;

                    // Track if paid off
                    if (d.balance <= 0 && !payoffOrder.find(p => p.id === d.id)) {
                        payoffOrder.push({ id: d.id, name: d.name, month: months });
                    }
                }
            }
        }

        const today = new Date();
        today.setMonth(today.getMonth() + months);

        return {
            total_interest: Math.round(totalInterest),
            months_to_payoff: months,
            payoff_date: today.toISOString().slice(0, 7), // YYYY-MM
            payoff_order: payoffOrder
        };
    }

    _emptyResult() {
        return {
            total_debt: 0,
            total_min_payment: 0,
            debt_count: 0,
            debts: [],
            strategies: {
                status_quo: { total_interest: 0, months_to_payoff: 0, payoff_date: null, payoff_order: [] },
                avalanche: { total_interest: 0, months_to_payoff: 0, payoff_date: null, payoff_order: [] },
                snowball: { total_interest: 0, months_to_payoff: 0, payoff_date: null, payoff_order: [] }
            },
            savings: {
                interest_saved_avalanche: 0,
                months_saved_avalanche: 0,
                interest_saved_snowball: 0,
                months_saved_snowball: 0
            }
        };
    }
}

module.exports = new DebtCalculator();
