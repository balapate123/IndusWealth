import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache keys
const CACHE_KEYS = {
    TRANSACTIONS: '@induswealth_transactions',
    ACCOUNTS: '@induswealth_accounts',
    USER: '@induswealth_user',
    AUTH_TOKEN: '@induswealth_auth_token',
    REFRESH_TOKEN: '@induswealth_refresh_token',
    LAST_FETCH: '@induswealth_last_fetch',
    PROFILE_PICTURE: '@induswealth_profile_picture',
    WATCHDOG_INTRO_SEEN: '@induswealth_watchdog_intro_seen',
};

// ============ ONE-TIME UI FLAGS ============

/**
 * Whether the Watchdog explainer has been dismissed.
 *
 * Local rather than server-side: it is a UI preference, not a financial fact,
 * and showing it once more on a new device costs nothing. Contrast the spotlight
 * and check-in cooldowns, which are server-owned precisely so two devices cannot
 * disagree about whether the user has been interrupted this week.
 */
export const hasSeenWatchdogIntro = async () => {
    try {
        return (await AsyncStorage.getItem(CACHE_KEYS.WATCHDOG_INTRO_SEEN)) === 'true';
    } catch {
        // A storage failure must not hide the screen. Showing the card again is
        // the harmless direction.
        return false;
    }
};

export const setWatchdogIntroSeen = async () => {
    try {
        await AsyncStorage.setItem(CACHE_KEYS.WATCHDOG_INTRO_SEEN, 'true');
    } catch {
        // Nothing to do — it reappears next launch.
    }
};

// ============ AUTH TOKEN ============

export const getAuthToken = async () => {
    try {
        const token = await AsyncStorage.getItem(CACHE_KEYS.AUTH_TOKEN);
        return token;
    } catch (error) {
        console.error('Error reading auth token:', error);
        return null;
    }
};

export const setAuthToken = async (token) => {
    try {
        if (token) {
            await AsyncStorage.setItem(CACHE_KEYS.AUTH_TOKEN, token);
            console.log('🔐 [CACHE] Auth token saved');
        } else {
            await AsyncStorage.removeItem(CACHE_KEYS.AUTH_TOKEN);
            console.log('🔐 [CACHE] Auth token cleared');
        }
    } catch (error) {
        console.error('Error saving auth token:', error);
    }
};

export const clearAuthToken = async () => {
    try {
        await AsyncStorage.removeItem(CACHE_KEYS.AUTH_TOKEN);
        console.log('🔐 [CACHE] Auth token cleared');
    } catch (error) {
        console.error('Error clearing auth token:', error);
    }
};

// ============ REFRESH TOKEN ============

export const getRefreshToken = async () => {
    try {
        return await AsyncStorage.getItem(CACHE_KEYS.REFRESH_TOKEN);
    } catch (error) {
        console.error('Error reading refresh token:', error);
        return null;
    }
};

export const setRefreshToken = async (token) => {
    try {
        if (token) {
            await AsyncStorage.setItem(CACHE_KEYS.REFRESH_TOKEN, token);
        } else {
            await AsyncStorage.removeItem(CACHE_KEYS.REFRESH_TOKEN);
        }
    } catch (error) {
        console.error('Error saving refresh token:', error);
    }
};

export const clearRefreshToken = async () => {
    try {
        await AsyncStorage.removeItem(CACHE_KEYS.REFRESH_TOKEN);
    } catch (error) {
        console.error('Error clearing refresh token:', error);
    }
};

// ============ TRANSACTIONS ============

export const getCachedTransactions = async () => {
    try {
        const data = await AsyncStorage.getItem(CACHE_KEYS.TRANSACTIONS);
        if (data) {
            const parsed = JSON.parse(data);
            console.log(`📦 [CACHE] Loaded ${parsed.length} transactions from cache`);
            return parsed;
        }
        return null;
    } catch (error) {
        console.error('Error reading transactions cache:', error);
        return null;
    }
};

export const setCachedTransactions = async (transactions) => {
    try {
        await AsyncStorage.setItem(CACHE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
        await AsyncStorage.setItem(CACHE_KEYS.LAST_FETCH + '_transactions', new Date().toISOString());
        console.log(`📦 [CACHE] Saved ${transactions.length} transactions to cache`);
    } catch (error) {
        console.error('Error saving transactions cache:', error);
    }
};

// ============ ACCOUNTS ============

export const getCachedAccounts = async () => {
    try {
        const data = await AsyncStorage.getItem(CACHE_KEYS.ACCOUNTS);
        if (data) {
            const parsed = JSON.parse(data);
            console.log(`📦 [CACHE] Loaded ${parsed.accounts?.length || 0} accounts from cache`);
            return parsed;
        }
        return null;
    } catch (error) {
        console.error('Error reading accounts cache:', error);
        return null;
    }
};

export const setCachedAccounts = async (accountsData) => {
    try {
        await AsyncStorage.setItem(CACHE_KEYS.ACCOUNTS, JSON.stringify(accountsData));
        await AsyncStorage.setItem(CACHE_KEYS.LAST_FETCH + '_accounts', new Date().toISOString());
        console.log(`📦 [CACHE] Saved accounts to cache`);
    } catch (error) {
        console.error('Error saving accounts cache:', error);
    }
};

// ============ USER ============

export const getCachedUser = async () => {
    try {
        const data = await AsyncStorage.getItem(CACHE_KEYS.USER);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('Error reading user cache:', error);
        return null;
    }
};

export const setCachedUser = async (userData) => {
    try {
        await AsyncStorage.setItem(CACHE_KEYS.USER, JSON.stringify(userData));
        console.log(`📦 [CACHE] Saved user to cache`);
    } catch (error) {
        console.error('Error saving user cache:', error);
    }
};

export const clearUserCache = async () => {
    try {
        await AsyncStorage.removeItem(CACHE_KEYS.USER);
        console.log(`📦 [CACHE] Cleared user cache`);
    } catch (error) {
        console.error('Error clearing user cache:', error);
    }
};

// ============ PROFILE PICTURE ============

export const getProfilePicture = async () => {
    try {
        return await AsyncStorage.getItem(CACHE_KEYS.PROFILE_PICTURE);
    } catch (error) {
        console.error('Error reading profile picture:', error);
        return null;
    }
};

export const setProfilePicture = async (uri) => {
    try {
        if (uri) {
            await AsyncStorage.setItem(CACHE_KEYS.PROFILE_PICTURE, uri);
        } else {
            await AsyncStorage.removeItem(CACHE_KEYS.PROFILE_PICTURE);
        }
    } catch (error) {
        console.error('Error saving profile picture:', error);
    }
};

// ============ CACHE MANAGEMENT ============

export const clearAllCache = async () => {
    try {
        const keys = Object.values(CACHE_KEYS);
        await AsyncStorage.multiRemove(keys);
        console.log(`📦 [CACHE] Cleared all cache`);
    } catch (error) {
        console.error('Error clearing cache:', error);
    }
};

export const getLastFetchTime = async (type = 'transactions') => {
    try {
        const time = await AsyncStorage.getItem(CACHE_KEYS.LAST_FETCH + '_' + type);
        return time ? new Date(time) : null;
    } catch (error) {
        return null;
    }
};

export const isCacheStale = async (type = 'transactions', maxAgeMinutes = 5) => {
    const lastFetch = await getLastFetchTime(type);
    if (!lastFetch) return true;

    const minutesSinceFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60);
    return minutesSinceFetch > maxAgeMinutes;
};

// Full logout - clears all user data
export const logout = async () => {
    try {
        await clearAuthToken();
        await clearRefreshToken();
        await clearUserCache();
        await clearAllCache();
        global.CURRENT_USER_ID = undefined;
        global.AUTH_TOKEN = undefined;
        console.log('🚪 [CACHE] Full logout completed');
    } catch (error) {
        console.error('Error during logout:', error);
    }
};

export default {
    // Auth
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    // Refresh token
    getRefreshToken,
    setRefreshToken,
    clearRefreshToken,
    // Data
    getCachedTransactions,
    setCachedTransactions,
    getCachedAccounts,
    setCachedAccounts,
    getCachedUser,
    setCachedUser,
    clearUserCache,
    // Profile picture
    getProfilePicture,
    setProfilePicture,
    clearAllCache,
    getLastFetchTime,
    isCacheStale,
    logout,
};
