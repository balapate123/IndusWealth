/**
 * Platform-aware Plaid Link wrapper.
 * On native (iOS/Android), delegates to react-native-plaid-link-sdk.
 * On web, provides stub functions that show a user-friendly message.
 */
import { Platform } from 'react-native';

let nativePlaid = null;

if (Platform.OS !== 'web') {
    // Only require the native SDK on iOS/Android
    nativePlaid = require('react-native-plaid-link-sdk');
}

/**
 * Create a Plaid Link session with the given config.
 * @param {Object} config - { token: string }
 */
export const create = async (config) => {
    if (Platform.OS === 'web') {
        console.log('[PlaidLink Web] create() called — Plaid Link is not available on web.');
        return;
    }
    return nativePlaid.create(config);
};

/**
 * Open the Plaid Link UI.
 * @param {Object} config - { onSuccess, onExit, oauthRedirectUri? }
 */
export const open = async (config) => {
    if (Platform.OS === 'web') {
        console.warn('[PlaidLink Web] open() called — Plaid Link is not available on web.');
        // Trigger onExit so callers can handle it gracefully
        if (config?.onExit) {
            config.onExit({
                error: {
                    displayMessage: 'Bank connection is not available in the web version. Please use the mobile app.',
                    errorCode: 'WEB_NOT_SUPPORTED',
                },
            });
        }
        return;
    }
    return nativePlaid.open(config);
};

/**
 * Dismiss/close the Plaid Link UI.
 */
export const dismissLink = () => {
    if (Platform.OS === 'web') {
        return;
    }
    return nativePlaid.dismissLink();
};

/**
 * Check if Plaid Link is available on the current platform.
 */
export const isPlaidAvailable = () => Platform.OS !== 'web';
