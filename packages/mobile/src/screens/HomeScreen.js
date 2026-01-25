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
    Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { create, open } from 'react-native-plaid-link-sdk';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import api from '../services/api';
import cache from '../services/cache';

// Mini Balance Chart Component
const BalanceChart = ({ width = 120, height = 40 }) => {
    // Sample data points for the trend line (normalized 0-1)
    const dataPoints = [0.3, 0.4, 0.35, 0.5, 0.45, 0.6, 0.7, 0.65, 0.8, 0.85, 0.9];

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Convert data points to path
    const points = dataPoints.map((point, index) => {
        const x = padding + (index / (dataPoints.length - 1)) * chartWidth;
        const y = padding + (1 - point) * chartHeight;
        return { x, y };
    });

    // Create smooth curve path
    const linePath = points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const prev = points[index - 1];
        const cpX = (prev.x + point.x) / 2;
        return `${path} Q ${cpX} ${prev.y} ${point.x} ${point.y}`;
    }, '');

    // Create area path (for gradient fill)
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return (
        <Svg width={width} height={height}>
            <Defs>
                <LinearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor="#C9A227" stopOpacity="0.3" />
                    <Stop offset="100%" stopColor="#C9A227" stopOpacity="0" />
                </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#areaGradient)" />
            <Path d={linePath} stroke="#C9A227" strokeWidth={2} fill="none" />
        </Svg>
    );
};

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

// Account colors for color-coding transactions
const ACCOUNT_COLORS = [
    '#4CAF50', // Green
    '#2196F3', // Blue
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#E91E63', // Pink
    '#00BCD4', // Cyan
    '#FF5722', // Deep Orange
    '#607D8B', // Blue Grey
];

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
    const [userName, setUserName] = useState('User');
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [plaidStatus, setPlaidStatus] = useState('unknown');
    const [reAuthLoading, setReAuthLoading] = useState(false);

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
                account_id: tx.account_id,
            };
        });
    };

    // Load from cache first, then fetch fresh data
    const loadData = useCallback(async (forceRefresh = false) => {
        try {
            setError(null);

            // STEP 1: Load from cache first (instant display)
            if (!forceRefresh) {
                const [cachedAccounts, cachedTransactions, cachedUser] = await Promise.all([
                    cache.getCachedAccounts(),
                    cache.getCachedTransactions(),
                    cache.getCachedUser(),
                ]);

                if (cachedUser?.name) {
                    setUserName(cachedUser.name.split(' ')[0]); // Use first name
                }

                if (cachedAccounts) {
                    setAccounts(cachedAccounts.accounts || []);
                    // Use liquid_cash for display (only checking/savings accounts)
                    setTotalCash(cachedAccounts.liquid_cash || cachedAccounts.total_balance || 0);
                    setChangePercent(cachedAccounts.change_percent || 0);
                }

                if (cachedTransactions) {
                    setTransactions(formatTransactions(cachedTransactions));
                    setLoading(false); // Show cached data immediately
                }
            }

            // STEP 2: Fetch fresh data from API
            const refreshParam = forceRefresh ? '?refresh=true' : '';
            const [accountsData, transactionsData, userData] = await Promise.all([
                api.getAccounts().catch(() => null),
                api.getTransactions(refreshParam).catch(() => null),
                api.auth.me().catch(() => null),
            ]);

            if (userData?.user?.name) {
                setUserName(userData.user.name.split(' ')[0]); // Use first name
                await cache.setCachedUser(userData.user);
            }

            if (accountsData?.success) {
                setAccounts(accountsData.accounts || []);
                // Use liquid_cash for display (only checking/savings accounts)
                setTotalCash(accountsData.liquid_cash || accountsData.total_balance || 0);
                setChangePercent(accountsData.change_percent || 0);
                // Cache the accounts data
                await cache.setCachedAccounts(accountsData);
            }

            if (transactionsData?.success) {
                setTransactions(formatTransactions(transactionsData.data));
                // Cache the raw transactions data
                await cache.setCachedTransactions(transactionsData.data);
                // Track Plaid status for re-auth banner
                if (transactionsData.plaid_status) {
                    setPlaidStatus(transactionsData.plaid_status);
                }
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

    const [lastPullTime, setLastPullTime] = useState(0);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        const now = Date.now();
        // 3 seconds threshold for double-pull
        if (now - lastPullTime < 3000) {
            // Double pull detected - FORCE refresh from Plaid
            loadData(true);
        } else {
            // Single pull - Refresh from backend cache (cheap)
            // Backend will only sync if cache is stale (>24h)
            loadData(false);
            setLastPullTime(now);
        }
    }, [loadData, lastPullTime]);

    // Handle Plaid re-authentication - opens Plaid Link in update mode
    const handleReAuthenticate = async () => {
        setReAuthLoading(true);
        try {
            // Get update mode link token from backend
            console.log('🔄 Getting update mode link token...');
            const result = await api.createUpdateLinkToken();

            if (!result?.link_token) {
                console.error('Failed to get update link token');
                setReAuthLoading(false);
                return;
            }

            console.log('✅ Got update link token, opening Plaid Link...');

            // Create and open Plaid Link in update mode
            await create({
                token: result.link_token,
            });

            await open({
                onSuccess: async (success) => {
                    console.log('🎉 Plaid Link update success!');
                    setPlaidStatus('success');
                    // Refresh data after successful re-authentication
                    loadData(true);
                    setReAuthLoading(false);
                },
                onExit: (exit) => {
                    console.log('📤 Plaid Link exited:', exit?.error?.displayMessage || 'User cancelled');
                    setReAuthLoading(false);
                },
            });
        } catch (err) {
            console.error('Re-auth error:', err);
            setReAuthLoading(false);
        }
    };

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
        // Handle null, undefined, or empty dates
        if (!dateStr) return 'N/A';

        // Plaid only provides date, not time - so show formatted date
        try {
            const date = new Date(dateStr + 'T12:00:00'); // Add noon to avoid timezone issues
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch (e) {
            return 'N/A';
        }
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

    // Get color for an account based on its index in the accounts array
    const getAccountColor = (accountId) => {
        if (!accountId || accounts.length === 0) return ACCOUNT_COLORS[0]; // Default to first color

        // Filter out the aggregate 'all' account for color matching
        const realAccounts = accounts.filter(acc => acc.id !== 'all' && acc.type !== 'aggregate');

        // Match by id (which is the plaid_account_id in formatted accounts)
        const accountIndex = realAccounts.findIndex(acc => acc.id === accountId);

        if (accountIndex === -1) return ACCOUNT_COLORS[0]; // Default color if no match
        return ACCOUNT_COLORS[accountIndex % ACCOUNT_COLORS.length];
    };

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setShowTransactionModal(true);
    };

    const renderTransaction = (item) => {
        const accountColor = getAccountColor(item.account_id);

        return (
            <TouchableOpacity
                key={item.id}
                style={styles.transactionItem}
                onPress={() => openTransactionDetails(item)}
                activeOpacity={0.7}
            >
                {/* Account color indicator */}
                {accountColor && (
                    <View style={[styles.accountColorIndicator, { backgroundColor: accountColor }]} />
                )}
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
            </TouchableOpacity>
        );
    };

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
                    <TouchableOpacity
                        style={styles.avatarContainer}
                        onPress={() => navigation.navigate('Profile')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.avatar}>
                            <Ionicons name="person" size={24} color={COLORS.TEXT_SECONDARY} />
                        </View>
                        <View style={styles.onlineIndicator} />
                    </TouchableOpacity>
                    <View style={styles.greetingContainer}>
                        <Text style={styles.welcomeText}>Welcome back,</Text>
                        <Text style={styles.userName}>{userName}</Text>
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
                    {/* Top row: Label + Chart + Badge */}
                    <View style={styles.balanceTopRow}>
                        <View style={styles.balanceLeftSection}>
                            <Text style={styles.balanceLabel}>TOTAL LIQUID CASH</Text>
                            <View style={styles.balanceAmountRow}>
                                <Text style={styles.currencySign}>$</Text>
                                <Text style={styles.balanceAmount}>
                                    {showBalance ? totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '••••••'}
                                </Text>
                                <TouchableOpacity onPress={() => setShowBalance(!showBalance)} style={styles.eyeButton}>
                                    <Ionicons
                                        name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                                        size={18}
                                        color={COLORS.TEXT_SECONDARY}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.balanceRightSection}>
                            <View style={styles.growthBadge}>
                                <Ionicons name="trending-up" size={12} color="#4CAF50" />
                                <Text style={styles.growthText}>+{changePercent}%</Text>
                            </View>
                            <BalanceChart width={100} height={35} />
                        </View>
                    </View>

                    {/* Savings info */}
                    <View style={styles.savingsRow}>
                        <Text style={styles.savingsPositive}>+$1,200.00</Text>
                        <Text style={styles.savingsText}> in savings this month</Text>
                        <TouchableOpacity style={styles.settingsButton}>
                            <Ionicons name="settings-outline" size={16} color={COLORS.GOLD} />
                        </TouchableOpacity>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={styles.addMoneyButton}
                            onPress={() => navigation.navigate('ConnectBank')}
                        >
                            <Ionicons name="add" size={18} color={COLORS.BACKGROUND} />
                            <Text style={styles.addMoneyText}>Add Account</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.transferButton}
                            onPress={() => navigation.navigate('Analytics')}
                        >
                            <Ionicons name="analytics" size={18} color={COLORS.WHITE} />
                            <Text style={styles.transferText}>Analytics</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Account Filters */}
                {accounts.filter(acc => acc.type !== 'aggregate').length > 0 ? (
                    <View style={styles.accountFiltersWrapper}>
                        <View style={styles.accountFiltersHeader}>
                            <Text style={styles.accountFiltersLabel}>ACCOUNTS</Text>
                            <TouchableOpacity onPress={() => navigation.navigate('AllAccounts')}>
                                <Text style={styles.manageText}>Manage</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.accountFilters}
                            contentContainerStyle={styles.accountFiltersContent}
                        >
                            {accounts.filter(acc => acc.type !== 'aggregate').map((account) => (
                                <TouchableOpacity
                                    key={account.id}
                                    style={[
                                        styles.accountTab,
                                        selectedAccount === account.id && styles.accountTabActive
                                    ]}
                                    onPress={() => {
                                        setSelectedAccount(account.id);
                                        navigation.navigate('AccountTransactions', { account });
                                    }}
                                >
                                    <View style={[styles.bankLogo, { backgroundColor: getAccountColor(account.id) }]}>
                                        <Text style={styles.bankLogoText}>{account.bank?.[0] || account.name?.[0] || 'A'}</Text>
                                    </View>
                                    <Text style={[
                                        styles.accountTabText,
                                        selectedAccount === account.id && styles.accountTabTextActive
                                    ]}>
                                        {account.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                ) : (
                    <View style={styles.noAccountsPrompt}>
                        <Text style={styles.noAccountsText}>Connect a bank account to get started</Text>
                        <TouchableOpacity
                            style={styles.connectPromptButton}
                            onPress={() => navigation.navigate('ConnectBank')}
                        >
                            <Ionicons name="add" size={16} color={COLORS.BACKGROUND} />
                            <Text style={styles.connectPromptText}>Connect Account</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Re-authentication Banner */}
                {plaidStatus === 'login_required' && (
                    <TouchableOpacity
                        style={styles.reAuthBanner}
                        onPress={handleReAuthenticate}
                        disabled={reAuthLoading}
                    >
                        <View style={styles.reAuthContent}>
                            <Ionicons name="alert-circle" size={24} color="#FFA726" />
                            <View style={styles.reAuthTextContainer}>
                                <Text style={styles.reAuthTitle}>Bank Connection Expired</Text>
                                <Text style={styles.reAuthSubtitle}>
                                    Tap to re-authenticate and sync your latest transactions
                                </Text>
                            </View>
                        </View>
                        {reAuthLoading ? (
                            <ActivityIndicator size="small" color="#FFA726" />
                        ) : (
                            <Ionicons name="chevron-forward" size={20} color="#FFA726" />
                        )}
                    </TouchableOpacity>
                )}

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Transactions */}
                <View style={styles.transactionsContainer}>
                    {/* Logic to show "See All" button on the FIRST visible group */}
                    {renderTransactionGroup('TODAY', todayTransactions, todayTransactions.length > 0)}
                    {renderTransactionGroup('YESTERDAY', yesterdayTransactions, todayTransactions.length === 0 && yesterdayTransactions.length > 0)}
                    {renderTransactionGroup('RECENT', olderTransactions.slice(0, 20), todayTransactions.length === 0 && yesterdayTransactions.length === 0)}

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

            {/* Transaction Details Modal */}
            <Modal
                visible={showTransactionModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowTransactionModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.transactionModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Transaction Details</Text>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setShowTransactionModal(false)}
                            >
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        {selectedTransaction && (
                            <View style={styles.transactionDetails}>
                                {/* Amount */}
                                <View style={styles.detailAmountRow}>
                                    <Text style={[
                                        styles.detailAmount,
                                        { color: selectedTransaction.amount > 0 ? COLORS.GREEN : COLORS.WHITE }
                                    ]}>
                                        {selectedTransaction.amount > 0 ? '+' : '-'}${Math.abs(selectedTransaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </Text>
                                    <View style={[
                                        styles.amountBadge,
                                        { backgroundColor: selectedTransaction.amount > 0 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 107, 107, 0.2)' }
                                    ]}>
                                        <Text style={[
                                            styles.amountBadgeText,
                                            { color: selectedTransaction.amount > 0 ? COLORS.GREEN : '#FF6B6B' }
                                        ]}>
                                            {selectedTransaction.amount > 0 ? 'Income' : 'Expense'}
                                        </Text>
                                    </View>
                                </View>

                                {/* Detail Rows */}
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Merchant</Text>
                                    <Text style={styles.detailValue}>{selectedTransaction.merchant}</Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Category</Text>
                                    <Text style={styles.detailValue}>{selectedTransaction.category}</Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Date</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedTransaction.rawDate
                                            ? new Date(selectedTransaction.rawDate + 'T12:00:00').toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })
                                            : 'N/A'}
                                    </Text>
                                </View>

                                {selectedTransaction.account_id && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Account</Text>
                                        <View style={styles.accountIndicator}>
                                            <View style={[styles.accountDot, { backgroundColor: getAccountColor(selectedTransaction.account_id) }]} />
                                            <Text style={styles.detailValue}>
                                                {accounts.find(a => a.id === selectedTransaction.account_id)?.name || 'N/A'}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Transaction ID</Text>
                                    <Text style={[styles.detailValue, styles.transactionId]}>{selectedTransaction.id}</Text>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.modalDoneButton}
                            onPress={() => setShowTransactionModal(false)}
                        >
                            <Text style={styles.modalDoneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
        fontFamily: FONTS.BOLD,
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
    balanceTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    balanceLeftSection: {
        flex: 1,
    },
    balanceRightSection: {
        alignItems: 'flex-end',
    },
    balanceLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        letterSpacing: 1,
        letterSpacing: 1,
        fontFamily: FONTS.MEDIUM,
        marginBottom: 4,
    },
    balanceAmountRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    currencySign: {
        color: COLORS.WHITE,
        fontSize: 22,
        fontWeight: '600',
        marginRight: 2,
    },
    balanceAmount: {
        color: COLORS.WHITE,
        fontSize: 32,
        fontFamily: FONTS.BOLD,
    },
    eyeButton: {
        marginLeft: SPACING.SMALL,
        padding: 4,
    },
    growthBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    growthText: {
        color: '#C9A227',
        fontSize: 12,
        fontFamily: FONTS.BOLD,
        marginLeft: 4,
    },
    savingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    savingsPositive: {
        color: '#4CAF50',
        fontSize: 13,
        fontWeight: '600',
    },
    savingsText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        flex: 1,
    },
    settingsButton: {
        padding: 4,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
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
        backgroundColor: COLORS.GOLD,
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

    // Account Filters Wrapper
    accountFiltersWrapper: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    accountFiltersHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    accountFiltersLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
    },
    manageText: {
        color: '#3B82F6',
        fontSize: 13,
        fontWeight: '500',
    },

    // No Accounts Prompt
    noAccountsPrompt: {
        marginHorizontal: SPACING.MEDIUM,
        marginVertical: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        borderStyle: 'dashed',
        alignItems: 'center',
    },
    noAccountsText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginBottom: SPACING.MEDIUM,
    },
    connectPromptButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    connectPromptText: {
        color: COLORS.BACKGROUND,
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 4,
    },

    // Re-authentication Banner
    reAuthBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: 'rgba(255, 167, 38, 0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: 'rgba(255, 167, 38, 0.3)',
    },
    reAuthContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    reAuthTextContainer: {
        marginLeft: SPACING.SMALL,
        flex: 1,
    },
    reAuthTitle: {
        color: '#FFA726',
        fontSize: 14,
        fontWeight: '600',
    },
    reAuthSubtitle: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
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
        overflow: 'hidden',
    },
    accountColorIndicator: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: BORDER_RADIUS.LARGE,
        borderBottomLeftRadius: BORDER_RADIUS.LARGE,
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

    // Transaction Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'flex-end',
    },
    transactionModalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        paddingBottom: 120,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    modalTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    modalCloseButton: {
        padding: SPACING.SMALL,
    },
    transactionDetails: {
        marginBottom: SPACING.LARGE,
    },
    detailAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    detailAmount: {
        fontSize: 32,
        fontFamily: FONTS.BOLD,
    },
    amountBadge: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    amountBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    detailLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
    },
    detailValue: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.MEDIUM,
        maxWidth: '60%',
        textAlign: 'right',
    },
    accountIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    accountDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: SPACING.SMALL,
    },
    transactionId: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
    },
    modalDoneButton: {
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        alignItems: 'center',
    },
    modalDoneText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontWeight: '600',
    },
});

export default HomeScreen;
