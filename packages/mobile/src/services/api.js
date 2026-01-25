// API Configuration
// For development, use your computer's local IP address
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Replace with your actual IP when testing on a physical device

import cache from './cache';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://induswealth.onrender.com';

// In-memory token for faster access
let cachedToken = null;

// Error categories for UI handling
export const ERROR_CODES = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    PLAID_REAUTH: 'PLAID_REAUTH',
    VALIDATION: 'VALIDATION_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    NOT_FOUND: 'NOT_FOUND',
};

/**
 * Parse API error into user-friendly format
 * @param {Error} error - Error object
 * @param {Object} responseData - Response data from server
 * @returns {Object} Parsed error with code, message, action
 */
export const parseApiError = (error, responseData) => {
    // Network error - no response received
    if (!responseData && error.message?.includes('fetch')) {
        return {
            code: ERROR_CODES.NETWORK_ERROR,
            message: 'Unable to connect. Please check your internet connection.',
            action: 'Tap to retry',
            recoverable: true,
        };
    }

    if (!responseData) {
        return {
            code: ERROR_CODES.SERVER_ERROR,
            message: error.message || 'Something went wrong.',
            action: 'Please try again later',
            recoverable: true,
        };
    }

    const errorCode = responseData.code;

    // Auth errors
    if (errorCode === 'TOKEN_INVALID' || errorCode === 'TOKEN_REQUIRED' || errorCode === 'AUTH_ERROR') {
        return {
            code: ERROR_CODES.AUTH_EXPIRED,
            message: 'Your session has expired.',
            action: 'Please log in again',
            recoverable: false,
        };
    }

    // Plaid re-authentication needed
    if (responseData._meta?.plaidStatus === 'login_required' || errorCode === 'PLAID_ERROR') {
        return {
            code: ERROR_CODES.PLAID_REAUTH,
            message: responseData.message || 'Your bank connection needs to be refreshed.',
            action: 'Tap to reconnect',
            recoverable: true,
        };
    }

    // Validation errors
    if (errorCode === 'VALIDATION_ERROR') {
        return {
            code: ERROR_CODES.VALIDATION,
            message: responseData.message || 'Please check your input.',
            action: 'Review and try again',
            recoverable: true,
            details: responseData.details,
        };
    }

    // Generic server error
    return {
        code: ERROR_CODES.SERVER_ERROR,
        message: responseData.message || 'Something went wrong.',
        action: 'Please try again later',
        requestId: responseData.requestId,
        recoverable: true,
    };
};

/**
 * Extract data freshness information from response metadata
 * @param {Object} meta - Response _meta object
 * @returns {Object|null} Data freshness info
 */
export const getDataFreshness = (meta) => {
    if (!meta) return null;

    return {
        source: meta.source,
        isCached: meta.cached,
        dataAge: meta.dataAge || null,
        lastSync: meta.lastSync ? new Date(meta.lastSync) : null,
        plaidStatus: meta.plaidStatus,
        timestamp: meta.timestamp ? new Date(meta.timestamp) : new Date(),
    };
};

/**
 * Get human-readable freshness text
 * @param {Object} freshness - Data freshness object
 * @returns {string} Human-readable freshness description
 */
export const getFreshnessText = (freshness) => {
    if (!freshness) return '';

    if (freshness.plaidStatus === 'login_required') {
        return 'Bank reconnection needed';
    }

    if (freshness.dataAge) {
        return `Updated ${freshness.dataAge}`;
    }

    if (freshness.source === 'PLAID_API') {
        return 'Just synced from bank';
    }

    if (freshness.source === 'DATABASE' && freshness.isCached) {
        return 'From cache';
    }

    return '';
};

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
    let responseData = null;

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

        // Parse response
        responseData = await response.json().catch(() => null);

        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
            // Clear invalid token
            if (responseData?.code === 'TOKEN_INVALID' || responseData?.code === 'TOKEN_REQUIRED') {
                await clearToken();
                await cache.clearUserCache();
            }

            const parsedError = parseApiError(new Error('Unauthorized'), responseData);
            const error = new Error(parsedError.message);
            error.parsedError = parsedError;
            error.responseData = responseData;
            throw error;
        }

        if (!response.ok) {
            const parsedError = parseApiError(new Error(`HTTP ${response.status}`), responseData);
            const error = new Error(parsedError.message);
            error.parsedError = parsedError;
            error.responseData = responseData;
            throw error;
        }

        return responseData;
    } catch (error) {
        // If error wasn't already parsed, parse it now
        if (!error.parsedError) {
            error.parsedError = parseApiError(error, responseData);
            error.responseData = responseData;
        }

        console.error(`API Request failed for ${endpoint}:`, {
            message: error.message,
            code: error.parsedError?.code,
            requestId: error.responseData?.requestId,
        });

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

        updateProfile: (data) => apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        changePassword: (currentPassword, newPassword) => apiRequest('/users/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword }),
        }),

        deleteAccount: (password) => apiRequest('/users/account', {
            method: 'DELETE',
            body: JSON.stringify({ password }),
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
    getAnalytics: (period = 30, forceRefresh = false) =>
        apiRequest(`/analytics?period=${period}${forceRefresh ? '&refresh=true' : ''}`),
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
