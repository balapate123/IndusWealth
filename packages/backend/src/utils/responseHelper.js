/**
 * Response helper utilities for consistent API responses
 * Provides standardized data source tracking and response formatting
 */

const db = require('../services/db');

/**
 * Data source enumeration - indicates where data was retrieved from
 */
const DATA_SOURCES = {
    PLAID_API: 'PLAID_API',      // Fresh data from Plaid
    DATABASE: 'DATABASE',        // Cached data from PostgreSQL
    CACHE: 'CACHE',              // Local/memory cache
    COMPUTED: 'COMPUTED',        // Calculated/derived data
    EMPTY: 'EMPTY'               // No data available
};

/**
 * Plaid connection status enumeration
 */
const PLAID_STATUS = {
    SUCCESS: 'success',           // Successfully synced
    CACHED: 'cached',             // Using cached data (sync not needed)
    NO_TOKEN: 'no_token',         // User hasn't connected bank
    LOGIN_REQUIRED: 'login_required', // Bank reconnection needed
    NOT_SUPPORTED: 'not_supported',   // Feature not available for bank
    ERROR: 'error',               // Generic Plaid error
    UNKNOWN: 'unknown'            // Status not determined
};

/**
 * Create standardized metadata object for API responses
 * @param {number} userId - User ID for sync time lookup
 * @param {string} dataSource - One of DATA_SOURCES values
 * @param {Object} options - Additional metadata options
 * @param {string} options.syncType - Sync type for last sync lookup
 * @param {string} options.plaidStatus - Plaid connection status
 * @param {number} options.count - Number of records returned
 * @returns {Object} Metadata object
 */
const createMeta = async (userId, dataSource, options = {}) => {
    const meta = {
        source: dataSource,
        cached: dataSource === DATA_SOURCES.DATABASE || dataSource === DATA_SOURCES.CACHE,
        timestamp: new Date().toISOString()
    };

    // Add record count if provided
    if (options.count !== undefined) {
        meta.count = options.count;
    }

    // Add last sync time if sync type is provided
    if (options.syncType && userId) {
        try {
            const lastSync = await db.getLastSyncTime(userId, options.syncType);
            meta.lastSync = lastSync ? lastSync.toISOString() : null;

            if (lastSync) {
                const minutesAgo = Math.floor((Date.now() - new Date(lastSync).getTime()) / (1000 * 60));
                if (minutesAgo < 1) {
                    meta.dataAge = 'Just now';
                } else if (minutesAgo < 60) {
                    meta.dataAge = `${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`;
                } else if (minutesAgo < 1440) {
                    const hours = Math.floor(minutesAgo / 60);
                    meta.dataAge = `${hours} hour${hours === 1 ? '' : 's'} ago`;
                } else {
                    const days = Math.floor(minutesAgo / 1440);
                    meta.dataAge = `${days} day${days === 1 ? '' : 's'} ago`;
                }
            }
        } catch (error) {
            // Don't fail the response if we can't get sync time
            meta.lastSync = null;
        }
    }

    // Add Plaid status if provided
    if (options.plaidStatus) {
        meta.plaidStatus = options.plaidStatus;
    }

    return meta;
};

/**
 * Send standardized success response
 * @param {Response} res - Express response object
 * @param {Object} data - Response data (will be spread into response)
 * @param {Object} meta - Metadata object from createMeta()
 */
const successResponse = (res, data, meta = {}) => {
    return res.json({
        success: true,
        ...data,
        _meta: meta
    });
};

/**
 * Send standardized error response
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {string} requestId - Request ID for correlation
 */
const errorResponse = (res, statusCode, code, message, requestId) => {
    return res.status(statusCode).json({
        success: false,
        code,
        message,
        requestId
    });
};

/**
 * Determine Plaid status from error
 * @param {Error} error - Error object from Plaid
 * @returns {string} Plaid status
 */
const getPlaidStatusFromError = (error) => {
    const errorCode = error.response?.data?.error_code;

    switch (errorCode) {
        case 'ITEM_LOGIN_REQUIRED':
            return PLAID_STATUS.LOGIN_REQUIRED;
        case 'PRODUCTS_NOT_SUPPORTED':
            return PLAID_STATUS.NOT_SUPPORTED;
        default:
            return PLAID_STATUS.ERROR;
    }
};

module.exports = {
    DATA_SOURCES,
    PLAID_STATUS,
    createMeta,
    successResponse,
    errorResponse,
    getPlaidStatusFromError
};
