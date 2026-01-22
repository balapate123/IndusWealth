import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Platform,
    StatusBar,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Modal,
    TextInput,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
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
    'Travel': { icon: 'airplane', library: 'Ionicons', color: '#00BCD4' },
    'Food and Drink': { icon: 'restaurant', library: 'Ionicons', color: '#FF5722' },
    'Payment': { icon: 'card', library: 'Ionicons', color: '#3F51B5' },
    'Transfer': { icon: 'swap-horizontal', library: 'Ionicons', color: '#607D8B' },
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

const AllTransactionsScreen = ({ navigation }) => {
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const formatTransactionsData = (rawTransactions) => {
        return (rawTransactions || []).map((tx, index) => ({
            id: tx.transaction_id || index,
            merchant: tx.name,
            category: tx.category?.[0] || 'Other',
            amount: tx.amount * -1,
            date: tx.date,
            formattedDate: formatDate(tx.date),
            account_id: tx.account_id,
        }));
    };

    const fetchData = useCallback(async (forceRefresh = false) => {
        try {
            console.log('📱 [AllTransactions] fetchData called, forceRefresh:', forceRefresh);

            // STEP 1: Load from cache first (instant display)
            const cachedTransactions = await cache.getCachedTransactions();
            console.log('📱 [AllTransactions] Cache returned:', cachedTransactions?.length || 0, 'transactions');

            if (cachedTransactions && cachedTransactions.length > 0) {
                const dates = cachedTransactions.slice(0, 3).map(t => t.date);
                console.log('📱 [AllTransactions] First 3 dates in cache:', dates);

                const formattedTransactions = formatTransactionsData(cachedTransactions);
                setTransactions(formattedTransactions);
                setLoading(false);
            }

            // STEP 2: ALWAYS fetch fresh data from API (ensures consistency with HomeScreen)
            // This fetches in background after showing cached data
            const refreshParam = forceRefresh ? '?refresh=true' : '';
            console.log('📱 [AllTransactions] Fetching fresh data from API...');
            const transactionsData = await api.getTransactions(refreshParam);
            console.log('📱 [AllTransactions] API returned:', transactionsData?.data?.length || 0, 'transactions');

            if (transactionsData?.success) {
                const firstDates = transactionsData.data.slice(0, 3).map(t => t.date);
                console.log('📱 [AllTransactions] First 3 API dates:', firstDates);

                const formattedTransactions = formatTransactionsData(transactionsData.data);
                setTransactions(formattedTransactions);
                // Update the cache so other screens get the fresh data
                await cache.setCachedTransactions(transactionsData.data);
                console.log('📱 [AllTransactions] Cache updated with fresh data');
            }

            // STEP 3: Always fetch accounts for color coding
            const accountsData = await api.getAccounts();
            if (accountsData?.success) {
                setAccounts(accountsData.accounts || []);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData(false); // Initial load from cache
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData(true); // Force refresh from API
    }, [fetchData]);

    const formatDate = (dateStr) => {
        // Add T12:00:00 to prevent timezone shift (UTC midnight -> local = previous day)
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getCategoryIcon = (category) => {
        return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
    };

    // Get color for an account based on its index in the accounts array
    const getAccountColor = (accountId) => {
        if (!accountId || accounts.length === 0) return ACCOUNT_COLORS[0];
        const realAccounts = accounts.filter(acc => acc.id !== 'all' && acc.type !== 'aggregate');
        const accountIndex = realAccounts.findIndex(acc => acc.id === accountId);
        if (accountIndex === -1) return ACCOUNT_COLORS[0];
        return ACCOUNT_COLORS[accountIndex % ACCOUNT_COLORS.length];
    };

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setShowTransactionModal(true);
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

    const renderTransaction = ({ item }) => {
        const accountColor = getAccountColor(item.account_id);

        return (
            <TouchableOpacity
                style={styles.transactionItem}
                onPress={() => openTransactionDetails(item)}
                activeOpacity={0.7}
            >
                {/* Account color indicator */}
                <View style={[styles.accountColorIndicator, { backgroundColor: accountColor }]} />
                {renderTransactionIcon(item.category, item.amount > 0)}
                <View style={styles.transactionContent}>
                    <Text style={styles.transactionMerchant} numberOfLines={1}>{item.merchant}</Text>
                    <Text style={styles.transactionCategory}>{item.category} • {item.formattedDate}</Text>
                </View>
                <View style={styles.transactionRight}>
                    <Text style={[
                        styles.transactionAmount,
                        { color: item.amount > 0 ? COLORS.GREEN : COLORS.WHITE }
                    ]}>
                        {item.amount > 0 ? '+' : '-'}${Math.abs(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    // Filter and sort transactions
    const filteredTransactions = useMemo(() => {
        let result = [...transactions];

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(tx =>
                tx.merchant?.toLowerCase().includes(query) ||
                tx.category?.toLowerCase().includes(query) ||
                Math.abs(tx.amount).toFixed(2).includes(query)
            );
        }

        // Sort by date descending
        result.sort((a, b) => new Date(b.date) - new Date(a.date));

        return result;
    }, [transactions, searchQuery]);

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Loading transactions...</Text>
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
                <Text style={styles.headerTitle}>All Transactions</Text>
                <View style={styles.headerRight}>
                    <Text style={styles.countText}>
                        {searchQuery ? `${filteredTransactions.length} of ${transactions.length}` : `${transactions.length} items`}
                    </Text>
                </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={COLORS.TEXT_MUTED} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search transactions..."
                    placeholderTextColor={COLORS.TEXT_MUTED}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                        <Ionicons name="close-circle" size={20} color={COLORS.TEXT_MUTED} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Transaction List */}
            <FlatList
                data={filteredTransactions}
                renderItem={renderTransaction}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.GOLD}
                        colors={[COLORS.GOLD]}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name={searchQuery ? "search-outline" : "receipt-outline"} size={48} color={COLORS.TEXT_MUTED} />
                        <Text style={styles.emptyText}>
                            {searchQuery ? `No results for "${searchQuery}"` : 'No transactions found'}
                        </Text>
                    </View>
                }
            />

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
                                        {selectedTransaction.date
                                            ? new Date(selectedTransaction.date + 'T12:00:00').toLocaleDateString('en-US', {
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

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.MEDIUM,
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
        padding: SPACING.SMALL,
    },
    countText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
    },

    // Search Bar
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG,
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    searchIcon: {
        marginRight: SPACING.SMALL,
    },
    searchInput: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 16,
        paddingVertical: SPACING.MEDIUM,
    },
    clearButton: {
        padding: SPACING.SMALL,
    },

    // List
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 100,
    },

    // Transaction Item
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
        marginLeft: SPACING.SMALL,
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
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        padding: SPACING.XL,
        marginTop: 50,
    },
    emptyText: {
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.MEDIUM,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    transactionModalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    modalTitle: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontWeight: '600',
    },
    modalCloseButton: {
        padding: SPACING.SMALL,
    },
    transactionDetails: {
        gap: SPACING.MEDIUM,
    },
    detailAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    detailAmount: {
        fontSize: 32,
        fontWeight: 'bold',
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
        paddingVertical: SPACING.SMALL,
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
        fontWeight: '500',
        textAlign: 'right',
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    transactionId: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    accountIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'flex-end',
    },
    accountDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: SPACING.SMALL,
    },
    modalDoneButton: {
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        alignItems: 'center',
        marginTop: SPACING.LARGE,
    },
    modalDoneText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontWeight: '600',
    },
});

export default AllTransactionsScreen;
