// API Configuration
// For development, use your computer's local IP address
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Replace with your actual IP when testing on a physical device

import { Platform } from 'react-native';
import cache from './cache';
import { reset as resetAnalytics } from './analytics';

const PRODUCTION_API_URL = 'https://induswealth.onrender.com';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL;

/**
 * Which backend this build talks to, for the debug line in Profile.
 *
 * Worth surfacing because it is otherwise invisible: the `development` EAS
 * profile sets no env, so it falls back to packages/mobile/.env — which points
 * at production. A build you believe is on staging can quietly be on prod, and
 * the only symptom is confusing errors from the wrong server.
 */
export const getApiTarget = () => ({
    url: API_BASE_URL,
    host: API_BASE_URL.replace(/^https?:\/\//, ''),
    isProduction: API_BASE_URL === PRODUCTION_API_URL,
});

// In-memory tokens for faster access
let cachedToken = null;
let cachedRefreshToken = null;

/**
 * Called when a 401 could not be recovered by refreshing. Registered by the
 * navigator so an expired session returns to sign-in rather than leaving the
 * user on a screen whose every request will now fail.
 */
let sessionExpiredHandler = null;
export const setSessionExpiredHandler = (fn) => { sessionExpiredHandler = fn; };

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

            // Refresh failed — clear tokens and hand control back to sign-in.
            // Without this the tokens are gone but the user stays on an
            // authenticated screen, where every subsequent request also 401s.
            await clearToken();
            await cache.clearUserCache();
            global.CURRENT_USER_ID = undefined;
            sessionExpiredHandler?.();

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

            // Not-yet-final outcomes: the caller decides where to go next, and
            // neither carries tokens to save.
            if (response.code === '2FA_REQUIRED' || response.code === 'EMAIL_NOT_VERIFIED') {
                return response;
            }

            // Save tokens on successful login
            if (response.success) {
                await saveAuthTokens(response);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        // Creates the account only. The server issues no session until the
        // emailed code is confirmed, so there is deliberately nothing to save
        // here — storing a user now is what used to let signup walk straight
        // into the app past the verification screen.
        signup: (name, email, password) => apiRequest('/users/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
        }),

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
            resetAnalytics();
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

        // The only place a new account receives a session, so this is where its
        // tokens get stored. The code is scoped to the address it was sent to.
        verifyEmail: async (email, code) => {
            const response = await apiRequest('/users/verify-email', {
                method: 'POST',
                body: JSON.stringify({ email, code }),
            });

            if (response.success) {
                await saveAuthTokens(response);
                global.CURRENT_USER_ID = response.user.id;
            }

            return response;
        },

        // Public: a user who cannot log in until they verify has no token to
        // send. Answers identically whether or not the account exists.
        resendVerification: (email) => apiRequest('/users/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),

        forgotPassword: (email) => apiRequest('/users/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),

        resetPassword: (code, newPassword) => apiRequest('/users/reset-password', {
            method: 'POST',
            body: JSON.stringify({ code, newPassword }),
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

    // Flags — the user's own groupings ("Home", "Trip"), distinct from the
    // Plaid/AI category. GET /flags also publishes the icon allowlist and ramp
    // size the server will accept, so the picker never drifts from it.
    getFlags: () => apiRequest('/flags'),

    createFlag: ({ name, colorIndex, icon }) =>
        apiRequest('/flags', {
            method: 'POST',
            body: JSON.stringify({ name, colorIndex, icon }),
        }),

    updateFlag: (flagId, fields) =>
        apiRequest(`/flags/${flagId}`, {
            method: 'PATCH',
            body: JSON.stringify(fields),
        }),

    deleteFlag: (flagId) =>
        apiRequest(`/flags/${flagId}`, { method: 'DELETE' }),

    /** Attach/detach many transactions at once: { add: [id], remove: [id] }. */
    setFlagTransactions: (flagId, diff) =>
        apiRequest(`/flags/${flagId}/transactions`, {
            method: 'POST',
            body: JSON.stringify(diff),
        }),

    getFlagAnalytics: (flagId, days) =>
        apiRequest(`/flags/${flagId}/analytics${days ? `?days=${days}` : ''}`),

    // Savings goals
    getGoals: (status = 'active') => apiRequest(`/goals?status=${status}`),

    getGoal: (goalId) => apiRequest(`/goals/${goalId}`),

    createGoal: (goal) =>
        apiRequest('/goals', { method: 'POST', body: JSON.stringify(goal) }),

    updateGoal: (goalId, fields) =>
        apiRequest(`/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(fields) }),

    deleteGoal: (goalId) => apiRequest(`/goals/${goalId}`, { method: 'DELETE' }),

    addGoalContribution: (goalId, { amount, note, occurredOn }) =>
        apiRequest(`/goals/${goalId}/contributions`, {
            method: 'POST',
            body: JSON.stringify({ amount, note, occurredOn }),
        }),

    deleteGoalContribution: (goalId, contributionId) =>
        apiRequest(`/goals/${goalId}/contributions/${contributionId}`, { method: 'DELETE' }),

    /**
     * Which goals have newly crossed a milestone. Called on app open: a local
     * notification's content freezes when scheduled, so a milestone cannot be
     * scheduled ahead of the balance change that causes it.
     */
    checkGoalMilestones: () =>
        apiRequest('/goals/milestones/check', { method: 'POST' }),

    // Watchdog - Recurring Expenses
    getWatchdogAnalysis: (forceRefresh = false) =>
        apiRequest(`/watchdog${forceRefresh ? '?force_refresh=true' : ''}`),

    handleExpenseAction: (expenseId, action, notes = null, snoozeUntil = null) =>
        apiRequest('/watchdog/action', {
            method: 'POST',
            body: JSON.stringify({ expenseId, action, ...(notes && { notes }), ...(snoozeUntil && { snoozeUntil }) }),
        }),

    getWatchdogSummary: () => apiRequest('/watchdog/summary'),

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
    // platform picks the OAuth config server-side: Android needs
    // android_package_name in the link token, iOS/web need redirect_uri
    createLinkToken: () => apiRequest('/plaid/create_link_token', {
        method: 'POST',
        body: JSON.stringify({ platform: Platform.OS }),
    }),

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
    getCategoryAnalytics: (period = 30) => apiRequest(`/analytics/categories?period=${period}`),
    getCategoryAIInsights: (period = 30, forceRefresh = false) =>
        apiRequest(`/analytics/categories/insights?period=${period}${forceRefresh ? '&refresh=true' : ''}`),

    // Account-specific transactions
    getAccountTransactions: (accountId) => apiRequest(`/transactions?account_id=${accountId}`),

    // AI Insights
    getInsights: (forceRefresh = false) =>
        apiRequest(`/insights${forceRefresh ? '?force_refresh=true' : ''}`),

    // The server has always required insight_type as well, so the old
    // single-argument call answered 400 every time and the card reappeared on
    // the next load. The fingerprint is what actually makes a dismissal stick:
    // it is stable across generations, where insight_id is reinvented each time.
    dismissInsight: (insight, { remindAfterDays = null, reason = null } = {}) =>
        apiRequest('/insights/dismiss', {
            method: 'POST',
            body: JSON.stringify({
                insight_id: insight?.id,
                insight_type: insight?.type,
                fingerprint: insight?.fingerprint,
                reason,
                remind_after_days: remindAfterDays,
            }),
        }),

    trackInsightAction: (insight, actionType) =>
        apiRequest('/insights/action', {
            method: 'POST',
            body: JSON.stringify({
                insight_id: insight?.id,
                insight_type: insight?.type,
                fingerprint: insight?.fingerprint,
                action_type: actionType,
            }),
        }),

    // The pop-up recommendation. Reads cache only server-side, so it is safe to
    // call on app open.
    getSpotlight: () => apiRequest('/insights/spotlight'),

    markSpotlightSeen: (fingerprint) =>
        apiRequest('/insights/spotlight/seen', {
            method: 'POST',
            body: JSON.stringify({ fingerprint }),
        }),

    getInsightPreferences: () => apiRequest('/insights/preferences'),

    updateInsightPreferences: (preferences) =>
        apiRequest('/insights/preferences', {
            method: 'PUT',
            body: JSON.stringify(preferences),
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

    // Health Score
    getHealthScore: () => apiRequest('/insights/health-score'),

    // ETF endpoints
    getETFs: (params = {}) => {
        const searchParams = new URLSearchParams();
        if (params.risk_level) searchParams.append('risk_level', params.risk_level);
        if (params.category) searchParams.append('category', params.category);
        if (params.search) searchParams.append('search', params.search);
        const qs = searchParams.toString();
        return apiRequest(`/etfs${qs ? '?' + qs : ''}`);
    },

    // getRecommendedETFs() was removed along with the endpoint: it ranked the
    // ETF catalogue against the user's risk profile, which is a personalized
    // securities recommendation. The list is browsable education now.

    getETFByTicker: (ticker) => apiRequest(`/etfs/${ticker}`),

    trackETFInteraction: (etfTicker, interactionType, source) =>
        apiRequest('/etfs/interaction', {
            method: 'POST',
            body: JSON.stringify({ etf_ticker: etfTicker, interaction_type: interactionType, source }),
        }),

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

    // Feedback
    submitFeedback: (data) => apiRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    getFeedbackHistory: () => apiRequest('/feedback'),
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
