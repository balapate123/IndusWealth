/**
 * Platform-aware Plaid Link wrapper.
 * On native (iOS/Android), delegates to react-native-plaid-link-sdk.
 * On web and in Expo Go, provides stubs that report why it is unavailable.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let nativePlaid = null;

if (Platform.OS !== 'web') {
    // Only require the native SDK on iOS/Android
    nativePlaid = require('react-native-plaid-link-sdk');
}

/**
 * Expo Go ships a fixed set of native modules and Plaid's is not among them.
 * The SDK's JavaScript still imports fine, so `open()` simply resolves and
 * nothing happens — the caller sits on a spinner forever with no error. This
 * check turns that silent hang into a message.
 *
 * Keyed on app ownership rather than on probing NativeModules by name: a
 * renamed module in a future SDK version would make a name probe wrongly
 * report a real dev build as unsupported, which is the worse failure.
 */
const isExpoGo =
    Constants?.appOwnership === 'expo' ||
    Constants?.executionEnvironment === 'storeClient';

const UNAVAILABLE = {
    web: {
        displayMessage: 'Bank connection is not available in the web version. Please use the mobile app.',
        errorCode: 'WEB_NOT_SUPPORTED',
    },
    expoGo: {
        displayMessage:
            'Bank connection needs a development build — Expo Go cannot load the Plaid module. '
            + 'Run: eas build --profile development --platform android',
        errorCode: 'EXPO_GO_NOT_SUPPORTED',
    },
};

/** Which stub applies, or null when Plaid can genuinely run. */
const unavailableReason = () => {
    if (Platform.OS === 'web') return UNAVAILABLE.web;
    if (isExpoGo) return UNAVAILABLE.expoGo;
    return null;
};

/**
 * Create a Plaid Link session with the given config.
 * @param {Object} config - { token: string }
 */
export const create = async (config) => {
    const reason = unavailableReason();
    if (reason) {
        console.warn(`[PlaidLink] create() skipped — ${reason.errorCode}`);
        return;
    }
    return nativePlaid.create(config);
};

/**
 * Open the Plaid Link UI.
 * @param {Object} config - { onSuccess, onExit, oauthRedirectUri? }
 */
export const open = async (config) => {
    const reason = unavailableReason();
    if (reason) {
        console.warn(`[PlaidLink] open() unavailable — ${reason.errorCode}: ${reason.displayMessage}`);
        // Report through onExit so callers clear their loading state and surface
        // the message, instead of waiting on a callback that never arrives.
        if (config?.onExit) {
            config.onExit({ error: reason });
        }
        return;
    }
    return nativePlaid.open(config);
};

/**
 * Dismiss/close the Plaid Link UI.
 */
export const dismissLink = () => {
    if (unavailableReason()) return;
    return nativePlaid.dismissLink();
};

/**
 * Check if Plaid Link can actually run in this build.
 */
export const isPlaidAvailable = () => unavailableReason() === null;

/** Why Plaid is unavailable, or null. Lets screens explain before the attempt. */
export const getPlaidUnavailableReason = () => unavailableReason();
