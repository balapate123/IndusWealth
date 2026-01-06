// Mock Flinks Service
// In a real scenario, this would connect to the Flinks API

const MOCK_ACCOUNTS = [
    {
        id: 'acc_01',
        institution: 'Royal Bank Test',
        type: 'Chequing',
        balance: 5432.10,
        currency: 'CAD'
    },
    {
        id: 'acc_02',
        institution: 'TD Test',
        type: 'Savings',
        balance: 12500.00,
        currency: 'CAD'
    }
];

const MOCK_TRANSACTIONS = [
    {
        id: 'tx_01',
        accountId: 'acc_01',
        date: '2025-12-24', // Recent mock date
        amount: -45.50,
        description: 'WALMART STORE #1234',
        category: 'Groceries'
    },
    {
        id: 'tx_02',
        accountId: 'acc_01',
        date: '2025-12-23',
        amount: -12.99,
        description: 'NETFLIX.COM',
        category: 'Subscription'
    },
    {
        id: 'tx_03',
        accountId: 'acc_02',
        date: '2025-12-20',
        amount: 3000.00,
        description: 'Payroll Deposit',
        category: 'Income'
    }
];

class FlinksService {
    async getAccounts() {
        return Promise.resolve(MOCK_ACCOUNTS);
    }

    async getTransactions(days = 30) {
        // Return mock transactions
        // Real implementation would fetch based on date range
        return Promise.resolve(MOCK_TRANSACTIONS);
    }
}

module.exports = new FlinksService();
