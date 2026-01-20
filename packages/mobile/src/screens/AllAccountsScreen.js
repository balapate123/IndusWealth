import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Platform,
    StatusBar,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

const AllAccountsScreen = ({ navigation }) => {
    const [accounts, setAccounts] = useState([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [liquidCash, setLiquidCash] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadAccounts = useCallback(async () => {
        try {
            const response = await api.getAccounts();
            if (response?.success) {
                // Filter out aggregate accounts
                const realAccounts = (response.accounts || []).filter(acc => acc.type !== 'aggregate');
                setAccounts(realAccounts);
                setTotalBalance(response.total_balance || 0);
                setLiquidCash(response.liquid_cash || 0);
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAccounts();
        }, [loadAccounts])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadAccounts();
    }, [loadAccounts]);

    const getAccountTypeIcon = (type, subtype) => {
        const accountType = subtype || type;
        switch (accountType) {
            case 'checking':
                return 'card-outline';
            case 'savings':
                return 'wallet-outline';
            case 'credit':
                return 'card';
            case 'investment':
            case 'brokerage':
                return 'trending-up';
            case 'loan':
            case 'mortgage':
                return 'home-outline';
            default:
                return 'cash-outline';
        }
    };

    const getAccountTypeColor = (type, subtype) => {
        const accountType = subtype || type;
        switch (accountType) {
            case 'checking':
                return '#4CAF50';
            case 'savings':
                return '#2196F3';
            case 'credit':
                return '#FF9800';
            case 'investment':
            case 'brokerage':
                return '#9C27B0';
            default:
                return COLORS.GOLD;
        }
    };

    const formatBalance = (balance) => {
        return `$${Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const renderAccount = (account) => {
        const iconColor = getAccountTypeColor(account.type, account.subtype);
        const isNegative = account.balance < 0;

        return (
            <TouchableOpacity
                key={account.id}
                style={styles.accountCard}
                onPress={() => navigation.navigate('AccountTransactions', { account })}
            >
                <View style={[styles.accountIcon, { backgroundColor: `${iconColor}20` }]}>
                    <Ionicons
                        name={getAccountTypeIcon(account.type, account.subtype)}
                        size={24}
                        color={iconColor}
                    />
                </View>

                <View style={styles.accountInfo}>
                    <Text style={styles.accountName} numberOfLines={1}>
                        {account.name}
                    </Text>
                    <Text style={styles.accountType}>
                        {account.subtype || account.type}
                        {account.mask && ` • ****${account.mask}`}
                    </Text>
                </View>

                <View style={styles.accountBalance}>
                    <Text style={[
                        styles.balanceAmount,
                        isNegative && styles.negativeBalance
                    ]}>
                        {isNegative ? '-' : ''}{formatBalance(account.balance)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.TEXT_MUTED} />
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Loading accounts...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Accounts</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.GOLD}
                        colors={[COLORS.GOLD]}
                    />
                }
            >
                {/* Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Total Assets</Text>
                            <Text style={styles.summaryValue}>
                                {formatBalance(totalBalance)}
                            </Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Liquid Cash</Text>
                            <Text style={styles.summaryValue}>
                                {formatBalance(liquidCash)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.accountCountBadge}>
                        <Text style={styles.accountCountText}>
                            {accounts.length} {accounts.length === 1 ? 'Account' : 'Accounts'} Connected
                        </Text>
                    </View>
                </View>

                {/* Accounts List */}
                {accounts.length > 0 ? (
                    <View style={styles.accountsList}>
                        <Text style={styles.sectionTitle}>CONNECTED ACCOUNTS</Text>
                        {accounts.map(renderAccount)}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="wallet-outline" size={64} color={COLORS.TEXT_MUTED} />
                        <Text style={styles.emptyTitle}>No Accounts Connected</Text>
                        <Text style={styles.emptySubtitle}>
                            Connect your bank accounts to see your balances and transactions
                        </Text>
                    </View>
                )}

                {/* Connect Account Button */}
                <TouchableOpacity
                    style={styles.connectButton}
                    onPress={() => navigation.navigate('ConnectBank')}
                >
                    <Ionicons name="add-circle-outline" size={20} color={COLORS.BACKGROUND} />
                    <Text style={styles.connectButtonText}>Connect New Account</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 50,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: COLORS.TEXT_SECONDARY,
        marginTop: SPACING.MEDIUM,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
    },
    backButton: {
        padding: SPACING.SMALL,
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    headerRight: {
        width: 40,
    },

    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 100,
    },

    // Summary Card
    summaryCard: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        marginBottom: SPACING.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginBottom: 4,
    },
    summaryValue: {
        color: COLORS.WHITE,
        fontSize: 22,
        fontWeight: '700',
    },
    summaryDivider: {
        width: 1,
        height: 40,
        backgroundColor: COLORS.CARD_BORDER,
    },
    accountCountBadge: {
        backgroundColor: COLORS.CARD_BORDER,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        alignSelf: 'center',
        marginTop: SPACING.MEDIUM,
    },
    accountCountText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: '500',
    },

    // Accounts List
    accountsList: {
        marginBottom: SPACING.LARGE,
    },
    sectionTitle: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: SPACING.MEDIUM,
    },
    accountCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        marginBottom: SPACING.SMALL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    accountIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    accountInfo: {
        flex: 1,
    },
    accountName: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    accountType: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        textTransform: 'capitalize',
    },
    accountBalance: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    balanceAmount: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginRight: SPACING.SMALL,
    },
    negativeBalance: {
        color: '#FF6B6B',
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: SPACING.XL * 2,
    },
    emptyTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
        marginTop: SPACING.MEDIUM,
    },
    emptySubtitle: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        paddingHorizontal: SPACING.LARGE,
    },

    // Connect Button
    connectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.GREEN,
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.LARGE,
        marginTop: SPACING.MEDIUM,
    },
    connectButtonText: {
        color: COLORS.BACKGROUND,
        fontSize: 15,
        fontWeight: '600',
        marginLeft: SPACING.SMALL,
    },
});

export default AllAccountsScreen;
