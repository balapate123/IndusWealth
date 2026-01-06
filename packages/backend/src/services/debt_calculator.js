class DebtCalculator {
    calculate(liabilities, extraMonthlyPayment = 0) {
        // 1. Normalize Debts
        // Plaid liabilities structure: { credit: [...], student: [...], ... }
        const debts = this._normalizeDebts(liabilities)
            .filter(d => d.balance > 0); // Only active debts

        if (debts.length === 0) return this._emptyResult();

        // 2. Calculate Status Quo (Min Payments Only)
        const statusQuo = this._simulateRepayment(debts, 0, 'APR_DESC');

        // 3. Calculate Avalanche (Extra Payment to Highest APR)
        const avalanche = this._simulateRepayment(debts, extraMonthlyPayment, 'APR_DESC');

        // 4. Calculate Snowball (Extra Payment to Lowest Balance)
        const snowball = this._simulateRepayment(debts, extraMonthlyPayment, 'BALANCE_ASC');

        return {
            total_debt: debts.reduce((sum, d) => sum + d.balance, 0),
            strategies: {
                status_quo: statusQuo,
                avalanche: avalanche,
                snowball: snowball
            },
            savings: {
                interest_saved_avalanche: statusQuo.total_interest - avalanche.total_interest,
                months_saved_avalanche: statusQuo.months_to_payoff - avalanche.months_to_payoff
            }
        };
    }

    _normalizeDebts(liabilities) {
        let all = [];
        if (liabilities.credit) all = all.concat(liabilities.credit.map(d => ({
            name: d.name || 'Credit Card',
            balance: d.is_overdue ? d.last_statement_balance : d.is_overdue === false ? d.last_statement_balance : (d.last_statement_balance || 0),
            // Plaid credit structure varies. usually 'last_statement_balance' or 'last_payment_balance'. 
            // Let's use standard 'is_overdue' check or just 'last_statement_balance'. 
            // Actually, Plaid returns 'aprs' array. We need purchase_apr.
            apr: d.aprs.find(a => a.apr_type === 'purchase_apr')?.apr_percentage || 19.99,
            min_payment: d.minimum_payment_amount || 0,
            // If min payment matches balance, it's a charge card or paid off? 
            // Assume 3% if missing for simulation safety
            min_payment_calc: d.minimum_payment_amount || (d.last_statement_balance * 0.03)
        })));

        // Add student/loans if needed, focusing on Credit (Avalanche target) first for MVP
        return all;
    }

    _simulateRepayment(initialDebts, extraPayment, sortMethod) {
        // Deep copy to avoid mutation during simulation
        let debts = JSON.parse(JSON.stringify(initialDebts));
        let totalInterest = 0;
        let months = 0;

        // Safety break to prevent infinite loops in bad math
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
            });

            // 2. Apply Extra Payment to Target (First in sorted list with balance)
            for (let d of debts) {
                if (d.balance > 0 && monthlyExtraAvailable > 0) {
                    let payment = Math.min(d.balance, monthlyExtraAvailable);
                    d.balance -= payment;
                    monthlyExtraAvailable -= payment;
                }
            }
        }

        const today = new Date();
        today.setMonth(today.getMonth() + months);

        return {
            total_interest: totalInterest,
            months_to_payoff: months,
            payoff_date: today.toISOString().slice(0, 7) // YYYY-MM
        };
    }

    _emptyResult() {
        return { total_debt: 0, strategies: {}, savings: {} };
    }
}

module.exports = new DebtCalculator();
