// API Configuration
// For development, use your computer's local IP address
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Replace with your actual IP when testing on a physical device

import cache from './cache';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://induswealth.onrender.com';

// In-memory token for faster access
let cachedToken = null;

// Initialize token from storage on app start
export const initializeAuth = async () => {
    cachedToken = await cache.getAuthToken();
    return cachedToken;
};

// Get the current auth token
export const getToken = () => cachedToken;

// Set auth token (saves to both memory and storage)
export const setToken = async (token) => {
    cachedToken = token;
    await cache.setAuthToken(token);
};

// Clear auth token
export const clearToken = async () => {
    cachedToken = null;
    await cache.clearAuthToken();
};

// Helper for making API requests with JWT authentication
const apiRequest = async (endpoint, options = {}) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Add JWT Bearer token if available
        if (cachedToken) {
            headers['Authorization'] = `Bearer ${cachedToken}`;
        }

        // Legacy support: Also inject User ID if available (for backwards compatibility)
        if (typeof global.CURRENT_USER_ID !== 'undefined') {
            headers['x-user-id'] = global.CURRENT_USER_ID.toString();
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers,
            ...options,
        });

        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
            const errorData = await response.json().catch(() => ({}));

            // Clear invalid token
            if (errorData.code === 'TOKEN_INVALID' || errorData.code === 'TOKEN_REQUIRED') {
                await clearToken();
                await cache.clearUserCache();
            }

            throw new Error(errorData.message || 'Session expired. Please log in again.');
        }

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
        login: async (email, password) => {
            const response = await apiRequest('/users/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            // Save token on successful login
            if (response.success && response.token) {
                await setToken(response.token);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        signup: async (name, email, password) => {
            const response = await apiRequest('/users/signup', {
                method: 'POST',
                body: JSON.stringify({ name, email, password }),
            });

            // Save token on successful signup
            if (response.success && response.token) {
                await setToken(response.token);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        me: () => apiRequest('/users/me'),

        logout: async () => {
            try {
                await apiRequest('/users/logout', { method: 'POST' });
            } catch (error) {
                // Ignore logout errors
            }
            await cache.logout();
        },

        updateProfile: (name) => apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ name }),
        }),

        changePassword: (currentPassword, newPassword) => apiRequest('/users/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword }),
        }),
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

    calculateDebt: (extraPayment, liabilities, customDebts) =>
        apiRequest('/debt/calculate', {
            method: 'POST',
            body: JSON.stringify({
                extra_payment: extraPayment,
                liabilities,
                custom_debts: customDebts
            }),
        }),

    // Custom Debts CRUD
    addCustomDebt: (debt) =>
        apiRequest('/debt/custom', {
            method: 'POST',
            body: JSON.stringify(debt),
        }),

    updateCustomDebt: (id, debt) =>
        apiRequest(`/debt/custom/${id}`, {
            method: 'PUT',
            body: JSON.stringify(debt),
        }),

    deleteCustomDebt: (id) =>
        apiRequest(`/debt/custom/${id}`, {
            method: 'DELETE',
        }),

    // APR Override for Plaid accounts
    saveAprOverride: (plaidAccountId, apr) =>
        apiRequest('/debt/apr-override', {
            method: 'PUT',
            body: JSON.stringify({ plaid_account_id: plaidAccountId, apr }),
        }),

    // Plaid Link
    createLinkToken: () => apiRequest('/plaid/create_link_token', { method: 'POST' }),

    // Plaid Link Update Mode (for re-authentication)
    createUpdateLinkToken: () => apiRequest('/plaid/create_update_link_token', { method: 'POST' }),

    exchangePublicToken: (publicToken) =>
        apiRequest('/plaid/exchange_public_token', {
            method: 'POST',
            body: JSON.stringify({ public_token: publicToken }),
        }),

    saveBankConnection: (accessToken, itemId) =>
        apiRequest('/plaid/save_connection', {
            method: 'POST',
            body: JSON.stringify({ access_token: accessToken, item_id: itemId }),
        }),

    disconnectBank: () => apiRequest('/plaid/disconnect', { method: 'DELETE' }),

    disconnectAccount: (accountId) => apiRequest(`/plaid/account/${accountId}`, { method: 'DELETE' }),

    // Analytics
    getAnalytics: (period = 30) => apiRequest(`/analytics?period=${period}`),
    getMonthlyAnalytics: () => apiRequest('/analytics/monthly'),

    // Account-specific transactions
    getAccountTransactions: (accountId) => apiRequest(`/transactions?account_id=${accountId}`),
};

// Check if user is authenticated
export const isAuthenticated = () => !!cachedToken;

// Configuration for updating the API URL
export const setApiBaseUrl = (url) => {
    // This would need to use a state management solution
    // For now, update the constant above directly
    console.log('API URL should be updated to:', url);
};

export default api;
