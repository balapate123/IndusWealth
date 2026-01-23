import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
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
const ErrorMessage = ({ error, onRetry, onReconnectBank, onDismiss }) => {
    if (!error) return null;

    const getIcon = () => {
        switch (error.code) {
            case ERROR_CODES.NETWORK_ERROR:
                return 'cloud-offline';
            case ERROR_CODES.PLAID_REAUTH:
                return 'key-outline';
            case ERROR_CODES.AUTH_EXPIRED:
                return 'lock-closed';
            case ERROR_CODES.VALIDATION:
                return 'warning-outline';
            default:
                return 'alert-circle';
        }
    };

    const getBackgroundColor = () => {
        switch (error.code) {
            case ERROR_CODES.PLAID_REAUTH:
                return 'rgba(201, 162, 39, 0.1)'; // Gold tint
            case ERROR_CODES.VALIDATION:
                return 'rgba(255, 193, 7, 0.1)'; // Warning yellow
            default:
                return 'rgba(244, 67, 54, 0.1)'; // Error red
        }
    };

    const getBorderColor = () => {
        switch (error.code) {
            case ERROR_CODES.PLAID_REAUTH:
                return 'rgba(201, 162, 39, 0.3)';
            case ERROR_CODES.VALIDATION:
                return 'rgba(255, 193, 7, 0.3)';
            default:
                return 'rgba(244, 67, 54, 0.2)';
        }
    };

    const getIconColor = () => {
        switch (error.code) {
            case ERROR_CODES.PLAID_REAUTH:
                return COLORS.GOLD;
            case ERROR_CODES.VALIDATION:
                return '#FFC107';
            default:
                return COLORS.RED;
        }
    };

    const renderAction = () => {
        if (error.code === ERROR_CODES.PLAID_REAUTH && onReconnectBank) {
            return (
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={onReconnectBank}
                    activeOpacity={0.7}
                >
                    <Text style={styles.primaryButtonText}>Reconnect</Text>
                </TouchableOpacity>
            );
        }

        if (error.recoverable && onRetry) {
            return (
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={onRetry}
                    activeOpacity={0.7}
                >
                    <Ionicons name="refresh" size={14} color={COLORS.WHITE} />
                    <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
            );
        }

        return null;
    };

    return (
        <View style={[
            styles.container,
            { backgroundColor: getBackgroundColor(), borderColor: getBorderColor() }
        ]}>
            <View style={styles.iconContainer}>
                <Ionicons name={getIcon()} size={24} color={getIconColor()} />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.message}>{error.message}</Text>
                {error.action && (
                    <Text style={styles.actionHint}>{error.action}</Text>
                )}
                {error.requestId && (
                    <Text style={styles.requestId}>ID: {error.requestId}</Text>
                )}
            </View>
            <View style={styles.actionContainer}>
                {renderAction()}
                {onDismiss && (
                    <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={onDismiss}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close" size={18} color={COLORS.TEXT_SECONDARY} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginHorizontal: SPACING.MEDIUM,
        marginVertical: SPACING.SMALL,
        borderWidth: 1,
    },
    iconContainer: {
        marginRight: SPACING.MEDIUM,
    },
    textContainer: {
        flex: 1,
    },
    message: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '500',
    },
    actionHint: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    requestId: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
        marginTop: 4,
        fontFamily: 'monospace',
    },
    actionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    primaryButton: {
        backgroundColor: COLORS.GOLD,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    primaryButtonText: {
        color: COLORS.BACKGROUND,
        fontSize: 12,
        fontWeight: '600',
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: SPACING.TINY,
    },
    retryText: {
        color: COLORS.WHITE,
        fontSize: 12,
        marginLeft: 4,
    },
    dismissButton: {
        marginLeft: SPACING.SMALL,
        padding: SPACING.TINY,
    },
});

export default ErrorMessage;
