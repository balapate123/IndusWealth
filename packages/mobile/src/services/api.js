// API Configuration
// For development, use your computer's local IP address
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Replace with your actual IP when testing on a physical device

import cache from './cache';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://induswealth.onrender.com';

// In-memory tokens for faster access
let cachedToken = null;
let cachedRefreshToken = null;

// Mutex to prevent concurrent refresh calls
let refreshPromise = null;

// Error categories for UI handling
export const ERROR_CODES = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    PLAID_REAUTH: 'PLAID_REAUTH',
    VALIDATION: 'VALIDATION_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    TWO_FA_REQUIRED: '2FA_REQUIRED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
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

    // Account locked
    if (errorCode === 'ACCOUNT_LOCKED') {
        return {
            code: ERROR_CODES.ACCOUNT_LOCKED,
            message: responseData.message || 'Account temporarily locked due to too many failed attempts.',
            action: 'Please wait and try again',
            recoverable: false,
        };
    }

    // 2FA required
    if (errorCode === '2FA_REQUIRED') {
        return {
            code: ERROR_CODES.TWO_FA_REQUIRED,
            message: 'Two-factor authentication code required',
            action: 'Enter your 2FA code',
            recoverable: true,
        };
    }

    // Auth errors
    if (errorCode === 'TOKEN_INVALID' || errorCode === 'TOKEN_REQUIRED' || errorCode === 'AUTH_ERROR' || errorCode === 'TOKEN_REUSED') {
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

// Initialize tokens from storage on app start
export const initializeAuth = async () => {
    cachedToken = await cache.getAuthToken();
    cachedRefreshToken = await cache.getRefreshToken();
    return cachedToken;
};

// Get the current auth token
export const getToken = () => cachedToken;

// Set auth token (saves to both memory and storage)
export const setToken = async (token) => {
    cachedToken = token;
    await cache.setAuthToken(token);
};

// Set refresh token (saves to both memory and storage)
export const setRefreshTokenValue = async (token) => {
    cachedRefreshToken = token;
    await cache.setRefreshToken(token);
};

// Clear all auth tokens
export const clearToken = async () => {
    cachedToken = null;
    cachedRefreshToken = null;
    await cache.clearAuthToken();
    await cache.clearRefreshToken();
};

/**
 * Attempt to refresh tokens using the stored refresh token.
 * Uses a mutex so concurrent 401 retries don't race.
 * @returns {boolean} true if refresh succeeded
 */
const tryRefresh = async () => {
    if (!cachedRefreshToken) return false;

    // If another refresh is already in progress, wait for it
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/users/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: cachedRefreshToken }),
            });

            const data = await response.json().catch(() => null);

            if (response.ok && data?.success) {
                await setToken(data.accessToken || data.token);
                if (data.refreshToken) {
                    await setRefreshTokenValue(data.refreshToken);
                }
                return true;
            }

            // Refresh failed — clear tokens
            await clearToken();
            await cache.clearUserCache();
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error.message);
            return false;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

// Helper for making API requests with JWT authentication
const apiRequest = async (endpoint, options = {}, _isRetry = false) => {
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

        // Handle 401 Unauthorized — attempt token refresh (once)
        if (response.status === 401 && !_isRetry) {
            const refreshed = await tryRefresh();
            if (refreshed) {
                // Retry the original request with new token
                return apiRequest(endpoint, options, true);
            }

            // Refresh failed — clear tokens
            await clearToken();
            await cache.clearUserCache();

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

/**
 * Save both tokens from a login/signup response.
 */
const saveAuthTokens = async (response) => {
    const token = response.accessToken || response.token;
    if (token) {
        await setToken(token);
    }
    if (response.refreshToken) {
        await setRefreshTokenValue(response.refreshToken);
    }
};

// API Methods
export const api = {
    // Authentication
    auth: {
        login: async (email, password, twoFactorCode = null, recoveryCode = null) => {
            const body = { email, password };
            if (twoFactorCode) body.twoFactorCode = twoFactorCode;
            if (recoveryCode) body.recoveryCode = recoveryCode;

            const response = await apiRequest('/users/login', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            // Handle 2FA required response
            if (response.code === '2FA_REQUIRED') {
                return response;
            }

            // Save tokens on successful login
            if (response.success) {
                await saveAuthTokens(response);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        signup: async (name, email, password) => {
            const response = await apiRequest('/users/signup', {
                method: 'POST',
                body: JSON.stringify({ name, email, password }),
            });

            // Save tokens on successful signup
            if (response.success) {
                await saveAuthTokens(response);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        me: () => apiRequest('/users/me'),

        logout: async () => {
            try {
                await apiRequest('/users/logout', {
                    method: 'POST',
                    body: JSON.stringify({ refreshToken: cachedRefreshToken }),
                });
            } catch (error) {
                // Ignore logout errors
            }
            await cache.logout();
        },

        updateProfile: (data) => apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        changePassword: async (currentPassword, newPassword) => {
            const response = await apiRequest('/users/password', {
                method: 'PUT',
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            // Save new tokens after password change
            if (response.success) {
                await saveAuthTokens(response);
            }

            return response;
        },

        deleteAccount: (password) => apiRequest('/users/account', {
            method: 'DELETE',
            body: JSON.stringify({ password }),
        }),

        checkPasswordStrength: (password) => apiRequest('/users/password-strength', {
            method: 'POST',
            body: JSON.stringify({ password }),
        }),
    },

    // 2FA
    twoFactor: {
        getStatus: () => apiRequest('/2fa/status'),
        setup: () => apiRequest('/2fa/setup', { method: 'POST' }),
        verify: (code) => apiRequest('/2fa/verify', {
            method: 'POST',
            body: JSON.stringify({ code }),
        }),
        disable: (password) => apiRequest('/2fa/disable', {
            method: 'POST',
            body: JSON.stringify({ password }),
        }),
    },

    // Accounts & Balance
    getAccounts: () => apiRequest('/accounts'),

    updateAccountAlias: (accountId, alias) =>
        apiRequest(`/accounts/${accountId}/alias`, {
            method: 'PUT',
            body: JSON.stringify({ alias }),
        }),

    // Transactions (includes watchdog analysis)
    // Pass ?refresh=true to force sync from Plaid
    getTransactions: (queryParams = '') => apiRequest(`/transactions${queryParams}`),

    updateTransactionNotes: (transactionId, notes) =>
        apiRequest(`/transactions/${transactionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ notes }),
        }),

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

    // AI Insights
    getInsights: (forceRefresh = false) =>
        apiRequest(`/insights${forceRefresh ? '?force_refresh=true' : ''}`),

    dismissInsight: (insightId) =>
        apiRequest('/insights/dismiss', {
            method: 'POST',
            body: JSON.stringify({ insight_id: insightId }),
        }),

    // Educational Content / Wealth Academy
    getEducationalArticles: (category = null, page = 1, limit = 20) => {
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        params.append('page', page.toString());
        params.append('limit', limit.toString());
        return apiRequest(`/educational/articles?${params.toString()}`);
    },

    getEducationalCategories: () =>
        apiRequest('/educational/categories'),

    getArticlesForInsight: (insightType, limit = 3) =>
        apiRequest(`/educational/for-insight/${insightType}?limit=${limit}`),

    getArticleBookmarks: (page = 1, limit = 20) =>
        apiRequest(`/educational/bookmarks?page=${page}&limit=${limit}`),

    addArticleBookmark: (articleId) =>
        apiRequest('/educational/bookmarks', {
            method: 'POST',
            body: JSON.stringify({ article_id: articleId }),
        }),

    removeArticleBookmark: (articleId) =>
        apiRequest(`/educational/bookmarks/${articleId}`, {
            method: 'DELETE',
        }),

    seedEducationalArticles: () =>
        apiRequest('/educational/seed', { method: 'POST' }),
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
