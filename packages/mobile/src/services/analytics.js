/**
 * Analytics service — Mixpanel wrapper for event tracking.
 * Fails gracefully if no API key is set (analytics is opt-in).
 */

import { Mixpanel } from 'mixpanel-react-native';

let mixpanel = null;

// Pre-defined event names for consistency
export const EVENTS = {
    SIGNUP: 'User Signed Up',
    LOGIN: 'User Logged In',
    LOGOUT: 'User Logged Out',
    EMAIL_VERIFIED: 'Email Verified',
    BANK_CONNECTED: 'Bank Connected',
    TRANSACTION_VIEWED: 'Transaction Viewed',
    INSIGHT_VIEWED: 'Insight Viewed',
    FEEDBACK_SUBMITTED: 'Feedback Submitted',
    PASSWORD_RESET_REQUESTED: 'Password Reset Requested',
    PASSWORD_RESET_COMPLETED: 'Password Reset Completed',
    TWO_FA_ENABLED: '2FA Enabled',
    DEBT_CALCULATED: 'Debt Calculated',
    ARTICLE_VIEWED: 'Article Viewed',
};

/**
 * Initialize Mixpanel. Call once on app start.
 */
export const initAnalytics = async () => {
    const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
    if (!token) {
        console.log('[Analytics] Mixpanel token not set — analytics disabled');
        return;
    }

    try {
        mixpanel = new Mixpanel(token, true); // trackAutomaticEvents = true
        await mixpanel.init();
        console.log('[Analytics] Mixpanel initialized');
    } catch (error) {
        console.error('[Analytics] Failed to initialize Mixpanel:', error.message);
        mixpanel = null;
    }
};

/**
 * Identify a user (call after login/signup).
 * @param {string} userId - User ID
 * @param {Object} properties - User properties (email, name, etc.)
 */
export const identify = (userId, properties = {}) => {
    if (!mixpanel) return;
    try {
        mixpanel.identify(userId.toString());
        if (Object.keys(properties).length > 0) {
            mixpanel.getPeople().set(properties);
        }
    } catch (error) {
        console.error('[Analytics] identify error:', error.message);
    }
};

/**
 * Track an event.
 * @param {string} event - Event name (use EVENTS constants)
 * @param {Object} properties - Event properties
 */
export const track = (event, properties = {}) => {
    if (!mixpanel) return;
    try {
        mixpanel.track(event, properties);
    } catch (error) {
        console.error('[Analytics] track error:', error.message);
    }
};

/**
 * Reset identity (call on logout).
 */
export const reset = () => {
    if (!mixpanel) return;
    try {
        mixpanel.reset();
    } catch (error) {
        console.error('[Analytics] reset error:', error.message);
    }
};

/**
 * Track screen view.
 * @param {string} screenName - Name of the screen
 */
export const trackScreen = (screenName) => {
    track('Screen Viewed', { screen: screenName });
};

export default { initAnalytics, identify, track, reset, trackScreen, EVENTS };
