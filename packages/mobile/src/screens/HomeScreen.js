import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    StatusBar,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';
import cache from '../services/cache';

// Category icon mapping
const CATEGORY_ICONS = {
    'Coffee & Snacks': { icon: 'coffee', library: 'FontAwesome5', color: '#4A7C59' },
    'Income': { icon: 'cash', library: 'Ionicons', color: '#4CAF50' },
    'Transportation': { icon: 'car', library: 'Ionicons', color: '#5C6BC0' },
    'Utilities': { icon: 'flash', library: 'Ionicons', color: '#FFC107' },
    'Groceries': { icon: 'cart', library: 'Ionicons', color: '#8BC34A' },
    'Subscription': { icon: 'repeat', library: 'Ionicons', color: '#E91E63' },
    'Bank Fees': { icon: 'alert-circle', library: 'Ionicons', color: '#F44336' },
    'default': { icon: 'wallet', library: 'Ionicons', color: '#9E9E9E' },
};

const HomeScreen = ({ navigation }) => {
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [totalCash, setTotalCash] = useState(0);
    const [changePercent, setChangePercent] = useState(0);
    const [showBalance, setShowBalance] = useState(true);
    const [selectedAccount, setSelectedAccount] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    // Format transactions for display
    const formatTransactions = (rawTransactions) => {
        return (rawTransactions || []).map((tx, index) => {
            const isToday = isDateToday(tx.date);
            const isYesterday = isDateYesterday(tx.date);

            return {
                id: tx.transaction_id || index,
                merchant: tx.name,
                category: tx.category?.[0] || 'Other',
                amount: tx.amount * -1,
                time: formatTime(tx.date),
                rawDate: tx.date,
                dateGroup: isToday ? 'today' : isYesterday ? 'yesterday' : 'older',
            };
        });
    };

    // Load from cache first, then fetch fresh data
    const loadData = useCallback(async (forceRefresh = false) => {
        try {
            setError(null);

            // STEP 1: Load from cache first (instant display)
            if (!forceRefresh) {
                const [cachedAccounts, cachedTransactions] = await Promise.all([
                    cache.getCachedAccounts(),
                    cache.getCachedTransactions(),
                ]);

                if (cachedAccounts) {
                    setAccounts(cachedAccounts.accounts || []);
                    setTotalCash(cachedAccounts.total_balance || 0);
                    setChangePercent(cachedAccounts.change_percent || 0);
                }

                if (cachedTransactions) {
                    setTransactions(formatTransactions(cachedTransactions));
                    setLoading(false); // Show cached data immediately
                }
            }

            // STEP 2: Fetch fresh data from API
            const refreshParam = forceRefresh ? '?refresh=true' : '';
            const [accountsData, transactionsData] = await Promise.all([
                api.getAccounts().catch(() => null),
                api.getTransactions(refreshParam).catch(() => null),
            ]);

            if (accountsData?.success) {
                setAccounts(accountsData.accounts || []);
                setTotalCash(accountsData.total_balance || 0);
                setChangePercent(accountsData.change_percent || 0);
                // Cache the accounts data
                await cache.setCachedAccounts(accountsData);
            }

            if (transactionsData?.success) {
                setTransactions(formatTransactions(transactionsData.data));
                // Cache the raw transactions data
                await cache.setCachedTransactions(transactionsData.data);
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setError('Failed to load data. Pull to refresh.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData(false); // Initial load from cache
    }, [loadData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData(true); // Force refresh from API
    }, [loadData]);

    // Helper functions
    const isDateToday = (dateStr) => {
        const today = new Date().toISOString().slice(0, 10);
        return dateStr === today;
    };

    const isDateYesterday = (dateStr) => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        return dateStr === yesterday;
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const todayTransactions = transactions.filter(t => t.dateGroup === 'today');
    const yesterdayTransactions = transactions.filter(t => t.dateGroup === 'yesterday');
    const olderTransactions = transactions.filter(t => t.dateGroup === 'older');

    const getCategoryIcon = (category) => {
        const mapping = CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
        return mapping;
    };

    const renderTransactionIcon = (category, isIncome) => {
        if (isIncome) {
            return (
                <View style={[styles.transactionIcon, { backgroundColor: '#1A3D1A' }]}>
                    <Ionicons name="cash" size={20} color="#4CAF50" />
                </View>
            );
        }
        const iconData = getCategoryIcon(category);
        const bgColor = `${iconData.color}20`;

        if (iconData.library === 'FontAwesome5') {
            return (
                <View style={[styles.transactionIcon, { backgroundColor: bgColor }]}>
                    <FontAwesome5 name={iconData.icon} size={18} color={iconData.color} />
                </View>
            );
        }
        return (
            <View style={[styles.transactionIcon, { backgroundColor: bgColor }]}>
                <Ionicons name={iconData.icon} size={20} color={iconData.color} />
            </View>
        );
    };

    const renderTransaction = (item) => (
        <View key={item.id} style={styles.transactionItem}>
            {renderTransactionIcon(item.category, item.amount > 0)}
            <View style={styles.transactionContent}>
                <Text style={styles.transactionMerchant} numberOfLines={1}>{item.merchant}</Text>
                <Text style={styles.transactionCategory}>{item.category}</Text>
            </View>
            <View style={styles.transactionRight}>
                <Text style={[
                    styles.transactionAmount,
                    { color: item.amount > 0 ? COLORS.GREEN : COLORS.WHITE }
                ]}>
                    {item.amount > 0 ? '+' : '-'}${Math.abs(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
                <Text style={styles.transactionTime}>{item.time}</Text>
            </View>
        </View>
    );

    const renderTransactionGroup = (title, items, showSeeAll = false) => {
        if (items.length === 0) return null;
        return (
            <View style={styles.transactionGroup}>
                <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{title}</Text>
                    {showSeeAll && (
                        <TouchableOpacity onPress={() => navigation.navigate('AllTransactions')}>
                            <Text style={styles.seeAllText}>See All</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {items.map(item => renderTransaction(item))}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Loading your finances...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Ionicons name="person" size={24} color={COLORS.TEXT_SECONDARY} />
                        </View>
                        <View style={styles.onlineIndicator} />
                    </View>
                    <View style={styles.greetingContainer}>
                        <Text style={styles.welcomeText}>Welcome back,</Text>
                        <Text style={styles.userName}>Alexander</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.notificationButton}>
                    <Ionicons name="notifications" size={24} color={COLORS.GOLD} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
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
                {/* Balance Card */}
                <View style={styles.balanceCard}>
                    <View style={styles.balanceHeader}>
                        <Text style={styles.balanceLabel}>TOTAL LIQUID CASH</Text>
                        <View style={styles.growthBadge}>
                            <Ionicons name="trending-up" size={12} color="#4CAF50" />
                            <Text style={styles.growthText}>+{changePercent}%</Text>
                        </View>
                    </View>

                    <View style={styles.balanceRow}>
                        <Text style={styles.balanceAmount}>
                            {showBalance ? `$${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '••••••'}
                        </Text>
                        <TouchableOpacity onPress={() => setShowBalance(!showBalance)}>
                            <Ionicons
                                name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                                size={20}
                                color={COLORS.TEXT_SECONDARY}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Mini Cards */}
                    <View style={styles.miniCardsRow}>
                        <View style={styles.miniCard} />
                        <View style={styles.miniCard} />
                        <View style={styles.miniCard} />
                        <View style={[styles.miniCard, styles.miniCardGold]} />
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity style={styles.addMoneyButton}>
                            <Ionicons name="add" size={18} color={COLORS.BACKGROUND} />
                            <Text style={styles.addMoneyText}>Add Account</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.transferButton}>
                            <Ionicons name="analytics" size={18} color={COLORS.WHITE} />
                            <Text style={styles.transferText}>Analytics</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Account Filters */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.accountFilters}
                    contentContainerStyle={styles.accountFiltersContent}
                >
                    {accounts.map((account) => (
                        <TouchableOpacity
                            key={account.id}
                            style={[
                                styles.accountTab,
                                selectedAccount === account.id && styles.accountTabActive
                            ]}
                            onPress={() => setSelectedAccount(account.id)}
                        >
                            {account.type === 'aggregate' ? (
                                <Ionicons
                                    name="grid"
                                    size={16}
                                    color={selectedAccount === account.id ? COLORS.WHITE : COLORS.TEXT_SECONDARY}
                                />
                            ) : (
                                <View style={styles.bankLogo}>
                                    <Text style={styles.bankLogoText}>{account.bank?.[0] || 'A'}</Text>
                                </View>
                            )}
                            <Text style={[
                                styles.accountTabText,
                                selectedAccount === account.id && styles.accountTabTextActive
                            ]}>
                                {account.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Transactions */}
                <View style={styles.transactionsContainer}>
                    {renderTransactionGroup('TODAY', todayTransactions)}
                    {renderTransactionGroup('YESTERDAY', yesterdayTransactions)}
                    {renderTransactionGroup('RECENT', olderTransactions.slice(0, 20), true)}

                    {transactions.length === 0 && !error && (
                        <View style={styles.emptyState}>
                            <Ionicons name="receipt-outline" size={48} color={COLORS.TEXT_MUTED} />
                            <Text style={styles.emptyText}>No transactions yet</Text>
                        </View>
                    )}
                </View>

                {/* More indicator */}
                {transactions.length > 0 && (
                    <View style={styles.moreIndicator}>
                        <View style={styles.dot} />
                        <View style={styles.dot} />
                        <View style={styles.dot} />
                    </View>
                )}
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
    scrollContent: {
        paddingBottom: 100,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
        marginRight: SPACING.SMALL,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.CARD_BG,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: COLORS.GOLD,
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.GREEN,
        borderWidth: 2,
        borderColor: COLORS.BACKGROUND,
    },
    greetingContainer: {
        marginLeft: SPACING.SMALL,
    },
    welcomeText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    userName: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
    },
    notificationButton: {
        padding: SPACING.SMALL,
    },

    // Balance Card
    balanceCard: {
        margin: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    balanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    balanceLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '500',
    },
    growthBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    growthText: {
        color: '#4CAF50',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    balanceAmount: {
        color: COLORS.WHITE,
        fontSize: 36,
        fontWeight: 'bold',
        marginRight: SPACING.SMALL,
    },
    miniCardsRow: {
        flexDirection: 'row',
        marginBottom: SPACING.LARGE,
        gap: SPACING.SMALL,
    },
    miniCard: {
        width: 50,
        height: 32,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: BORDER_RADIUS.SMALL,
    },
    miniCardGold: {
        backgroundColor: COLORS.GOLD,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: SPACING.MEDIUM,
    },
    addMoneyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.GREEN,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        flex: 1,
    },
    addMoneyText: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
        marginLeft: 4,
    },
    transferButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    transferText: {
        color: COLORS.WHITE,
        fontWeight: '600',
        marginLeft: 4,
    },

    // Account Filters
    accountFilters: {
        marginVertical: SPACING.MEDIUM,
    },
    accountFiltersContent: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    accountTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.XL,
        backgroundColor: COLORS.CARD_BG,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        marginRight: SPACING.SMALL,
    },
    accountTabActive: {
        backgroundColor: COLORS.CARD_BORDER,
    },
    bankLogo: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: COLORS.GREEN,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bankLogoText: {
        color: COLORS.WHITE,
        fontSize: 8,
        fontWeight: 'bold',
    },
    accountTabText: {
        color: COLORS.TEXT_SECONDARY,
        marginLeft: SPACING.SMALL,
        fontSize: 13,
    },
    accountTabTextActive: {
        color: COLORS.WHITE,
    },

    // Error
    errorContainer: {
        margin: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    errorText: {
        color: '#F44336',
        textAlign: 'center',
    },

    // Transactions
    transactionsContainer: {
        paddingHorizontal: SPACING.MEDIUM,
    },
    transactionGroup: {
        marginBottom: SPACING.MEDIUM,
    },
    groupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    groupTitle: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
    },
    seeAllText: {
        color: '#3B82F6',
        fontSize: 13,
        fontWeight: '500',
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        marginBottom: SPACING.SMALL,
    },
    transactionIcon: {
        width: 44,
        height: 44,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    transactionContent: {
        flex: 1,
    },
    transactionMerchant: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    transactionCategory: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    transactionRight: {
        alignItems: 'flex-end',
    },
    transactionAmount: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    transactionTime: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        padding: SPACING.XL,
    },
    emptyText: {
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.MEDIUM,
    },

    // More indicator
    moreIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 4,
        marginTop: SPACING.MEDIUM,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.TEXT_MUTED,
    },
});

export default HomeScreen;
