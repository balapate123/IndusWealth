import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';

/**
 * DataFreshnessIndicator - Shows data freshness status to user
 *
 * @param {Object} props
 * @param {Object} props.dataFreshness - Freshness data from getDataFreshness()
 * @param {Function} props.onRefresh - Callback when refresh is tapped
 * @param {boolean} props.refreshing - Whether refresh is in progress
 * @param {boolean} props.compact - Use compact mode for inline display
 */

const makeStyles = (t) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: t.SURFACE,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: RADIUS.MEDIUM,
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    compact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});

const DataFreshnessIndicator = ({
    dataFreshness,
    onRefresh,
    refreshing = false,
    compact = false,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!dataFreshness) return null;

    // Freshness is a status reading, so it uses the reserved semantic colours
    // and always ships with an icon and words beside it.
    const statusColor = () => {
        if (dataFreshness.plaidStatus === 'login_required') return theme.DANGER;
        if (dataFreshness.source === 'PLAID_API') return theme.SUCCESS;
        return theme.TEXT_MUTED;
    };

    const statusText = () => {
        if (dataFreshness.plaidStatus === 'login_required') return 'Bank reconnection needed';
        if (dataFreshness.dataAge) return `Updated ${dataFreshness.dataAge}`;
        if (dataFreshness.source === 'PLAID_API') return 'Just synced';
        if (dataFreshness.source === 'EMPTY') return 'No data';
        return 'From cache';
    };

    const icon = () => {
        if (dataFreshness.plaidStatus === 'login_required') return 'alert-circle';
        if (dataFreshness.source === 'PLAID_API') return 'cloud-done';
        if (dataFreshness.source === 'EMPTY') return 'cloud-offline-outline';
        return 'time-outline';
    };

    if (compact) {
        return (
            <View style={styles.compact}>
                <Ionicons name={icon()} size={12} color={statusColor()} />
                <Text variant="meta" color={statusColor()}>{statusText()}</Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onRefresh}
            disabled={refreshing || !onRefresh}
            activeOpacity={0.7}
        >
            <View style={styles.left}>
                {refreshing ? (
                    <ActivityIndicator size="small" color={theme.ACCENT} />
                ) : (
                    <Ionicons name={icon()} size={16} color={statusColor()} />
                )}
                <Text variant="meta" color={refreshing ? theme.TEXT_SECONDARY : statusColor()}>
                    {refreshing ? 'Syncing...' : statusText()}
                </Text>
            </View>
            {onRefresh && !refreshing && (
                <Ionicons name="refresh-outline" size={16} color={theme.ACCENT} />
            )}
        </TouchableOpacity>
    );
};

export default DataFreshnessIndicator;
