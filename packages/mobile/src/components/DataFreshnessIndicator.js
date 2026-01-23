import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

/**
 * DataFreshnessIndicator - Shows data freshness status to user
 *
 * @param {Object} props
 * @param {Object} props.dataFreshness - Freshness data from getDataFreshness()
 * @param {Function} props.onRefresh - Callback when refresh is tapped
 * @param {boolean} props.refreshing - Whether refresh is in progress
 * @param {boolean} props.compact - Use compact mode for inline display
 */
const DataFreshnessIndicator = ({
    dataFreshness,
    onRefresh,
    refreshing = false,
    compact = false,
}) => {
    if (!dataFreshness) return null;

    const getStatusColor = () => {
        if (dataFreshness.plaidStatus === 'login_required') return COLORS.RED;
        if (dataFreshness.source === 'PLAID_API') return COLORS.GREEN;
        if (dataFreshness.isCached) return COLORS.TEXT_SECONDARY;
        return COLORS.TEXT_SECONDARY;
    };

    const getStatusText = () => {
        if (dataFreshness.plaidStatus === 'login_required') {
            return 'Bank reconnection needed';
        }
        if (dataFreshness.dataAge) {
            return `Updated ${dataFreshness.dataAge}`;
        }
        if (dataFreshness.source === 'PLAID_API') {
            return 'Just synced';
        }
        if (dataFreshness.source === 'EMPTY') {
            return 'No data';
        }
        return 'From cache';
    };

    const getIcon = () => {
        if (dataFreshness.plaidStatus === 'login_required') return 'alert-circle';
        if (dataFreshness.source === 'PLAID_API') return 'cloud-done';
        if (dataFreshness.source === 'EMPTY') return 'cloud-offline-outline';
        return 'time-outline';
    };

    if (compact) {
        return (
            <View style={styles.compactContainer}>
                <Ionicons name={getIcon()} size={12} color={getStatusColor()} />
                <Text style={[styles.compactText, { color: getStatusColor() }]}>
                    {getStatusText()}
                </Text>
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
            <View style={styles.leftSection}>
                {refreshing ? (
                    <ActivityIndicator size="small" color={COLORS.GOLD} />
                ) : (
                    <Ionicons name={getIcon()} size={16} color={getStatusColor()} />
                )}
                <Text style={[styles.statusText, { color: getStatusColor() }]}>
                    {refreshing ? 'Syncing...' : getStatusText()}
                </Text>
            </View>
            {onRefresh && !refreshing && (
                <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={COLORS.GOLD}
                />
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.CARD_BG,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 12,
        marginLeft: SPACING.SMALL,
    },
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    compactText: {
        fontSize: 11,
        marginLeft: 4,
    },
});

export default DataFreshnessIndicator;
