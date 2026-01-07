// API Configuration
// For development, use your computer's local IP address
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Replace with your actual IP when testing on a physical device

const API_BASE_URL = __DEV__
    ? 'http://192.168.2.34:3000'  // Your local IP
    : 'https://api.induswealth.com';

// Helper for making API requests
const apiRequest = async (endpoint, options = {}) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Inject User ID if available (simple auth for MVP)
        // In a real app, this would be a Bearer token
        if (typeof global.CURRENT_USER_ID !== 'undefined') {
            headers['x-user-id'] = global.CURRENT_USER_ID.toString();
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers,
            ...options,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Request failed for ${endpoint}:`, error);
        throw error;
    }
};

// API Methods
export const api = {
    // Authentication
    auth: {
        login: (email, password) => apiRequest('/users/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),
        signup: (name, email, password) => apiRequest('/users/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
        }),
        me: () => apiRequest('/users/me'),
    },
    // Accounts & Balance
    getAccounts: () => apiRequest('/accounts'),

    // Transactions (includes watchdog analysis)
    // Pass ?refresh=true to force sync from Plaid
    getTransactions: (queryParams = '') => apiRequest(`/transactions${queryParams}`),

    // Watchdog - Recurring Expenses
    getWatchdogAnalysis: () => apiRequest('/watchdog'),

    handleExpenseAction: (expenseId, action) =>
        apiRequest('/watchdog/action', {
            method: 'POST',
            body: JSON.stringify({ expenseId, action }),
        }),

    // Debt
    getDebtOverview: () => apiRequest('/debt'),

    calculateDebt: (extraPayment, liabilities) =>
        apiRequest('/debt/calculate', {
            method: 'POST',
            body: JSON.stringify({
                extra_payment: extraPayment,
                liabilities
            }),
        }),

    // Plaid Link
    createLinkToken: () => apiRequest('/plaid/link-token', { method: 'POST' }),

    exchangePublicToken: (publicToken) =>
        apiRequest('/plaid/exchange-token', {
            method: 'POST',
            body: JSON.stringify({ public_token: publicToken }),
        }),
};

// Configuration for updating the API URL
export const setApiBaseUrl = (url) => {
    // This would need to use a state management solution
    // For now, update the constant above directly
    console.log('API URL should be updated to:', url);
};

export default api;
