import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text, Button } from './ui';
import { ERROR_CODES } from '../services/api';

/**
 * ErrorMessage - User-friendly error display component
 *
 * @param {Object} props
 * @param {Object} props.error - Parsed error object with code, message, action
 * @param {Function} props.onRetry - Callback when retry is tapped
 * @param {Function} props.onReconnectBank - Callback for Plaid reconnection
 * @param {Function} props.onDismiss - Callback to dismiss the error
 */

const makeStyles = () => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        marginHorizontal: SPACING.MEDIUM,
        marginVertical: SPACING.SMALL,
    },
    body: { flex: 1 },
    hint: { marginTop: 2 },
    requestId: {
        marginTop: 4,
        fontFamily: 'monospace',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
});

// Each error class maps to one reserved semantic role. Reconnection is the app
// asking for something rather than reporting a failure, so it reads as accent
// rather than danger.
const roleFor = (theme, code) => {
    switch (code) {
        case ERROR_CODES.PLAID_REAUTH:
            return { bg: theme.ACCENT_DIM, fg: theme.ACCENT, icon: 'key-outline' };
        case ERROR_CODES.VALIDATION:
            return { bg: theme.WARNING_DIM, fg: theme.WARNING, icon: 'warning-outline' };
        case ERROR_CODES.NETWORK_ERROR:
            return { bg: theme.DANGER_DIM, fg: theme.DANGER, icon: 'cloud-offline' };
        case ERROR_CODES.AUTH_EXPIRED:
            return { bg: theme.DANGER_DIM, fg: theme.DANGER, icon: 'lock-closed' };
        default:
            return { bg: theme.DANGER_DIM, fg: theme.DANGER, icon: 'alert-circle' };
    }
};

const ErrorMessage = ({ error, onRetry, onReconnectBank, onDismiss }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!error) return null;

    const role = roleFor(theme, error.code);

    const renderAction = () => {
        if (error.code === ERROR_CODES.PLAID_REAUTH && onReconnectBank) {
            return <Button title="Reconnect" size="sm" onPress={onReconnectBank} />;
        }
        if (error.recoverable && onRetry) {
            return <Button title="Retry" size="sm" variant="secondary" icon="refresh" onPress={onRetry} />;
        }
        return null;
    };

    return (
        <View style={[styles.container, { backgroundColor: role.bg }]}>
            <Ionicons name={role.icon} size={24} color={role.fg} />

            <View style={styles.body}>
                <Text variant="bodyMed">{error.message}</Text>
                {error.action && (
                    <Text variant="meta" tone="secondary" style={styles.hint}>{error.action}</Text>
                )}
                {error.requestId && (
                    <Text variant="meta" tone="muted" style={styles.requestId}>ID: {error.requestId}</Text>
                )}
            </View>

            <View style={styles.actions}>
                {renderAction()}
                {onDismiss && (
                    <TouchableOpacity
                        onPress={onDismiss}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss"
                    >
                        <Ionicons name="close" size={18} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default ErrorMessage;
