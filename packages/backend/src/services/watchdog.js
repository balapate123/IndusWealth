const SUBSCRIPTION_REGEX = /(Netflix|Disney\+|Spotify|Amazon Prime|Rogers|Bell|Telus|Enbridge)/i;
const FEES_REGEX = /(NSF FEE|OVERDRAFT|MONTHLY PLAN FEE|NON-TRADING FEE)/i;

class WatchdogService {
    analyze(transactions) {
        const leakage = {
            subscriptions: [],
            fees: [],
            total_monthly_leakage: 0
        };

        transactions.forEach(tx => {
            // Check for Subscriptions
            if (SUBSCRIPTION_REGEX.test(tx.name)) {
                leakage.subscriptions.push({
                    name: tx.name,
                    amount: tx.amount,
                    date: tx.date
                });
                leakage.total_monthly_leakage += tx.amount;
            }

            // Check for Hidden Fees
            if (FEES_REGEX.test(tx.name)) {
                leakage.fees.push({
                    name: tx.name,
                    amount: tx.amount,
                    date: tx.date
                });
                leakage.total_monthly_leakage += tx.amount;
            }
        });

        return leakage;
    }
}

module.exports = new WatchdogService();
