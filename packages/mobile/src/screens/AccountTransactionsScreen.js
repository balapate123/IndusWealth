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

const AccountTransactionsScreen = ({ navigation, route }) => {
    const { account } = route.params;
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [totals, setTotals] = useState({ income: 0, expenses: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);

    const fetchTransactions = useCallback(async () => {
        try {
            const data = await api.getAccountTransactions(account.id);

            if (data?.success) {
                const formattedTransactions = (data.data || []).map((tx, index) => ({
                    id: tx.transaction_id || index,
                    merchant: tx.name,
                    category: tx.category?.[0] || 'Other',
                    amount: tx.amount * -1,
                    date: tx.date,
                    formattedDate: formatDate(tx.date),
                }));
                setTransactions(formattedTransactions);

                // Calculate totals
                const income = formattedTransactions
                    .filter(t => t.amount > 0)
                    .reduce((sum, t) => sum + t.amount, 0);
                const expenses = formattedTransactions
                    .filter(t => t.amount < 0)
                    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                setTotals({ income, expenses });
            }
        } catch (err) {
            console.error('Error fetching account transactions:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [account.id]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTransactions();
    }, [fetchTransactions]);

    const formatDate = (dateStr) => {
        // Add T12:00:00 to prevent timezone shift
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Filter and sort transactions
    const filteredTransactions = useMemo(() => {
        let result = [...transactions];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(tx =>
                tx.merchant?.toLowerCase().includes(query) ||
                tx.category?.toLowerCase().includes(query) ||
                Math.abs(tx.amount).toFixed(2).includes(query)
            );
        }

        result.sort((a, b) => new Date(b.date) - new Date(a.date));
        return result;
    }, [transactions, searchQuery]);

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setShowTransactionModal(true);
    };

    const formatCurrency = (amount) => {
        return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const getCategoryIcon = (category) => {
        return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
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

    const renderTransaction = ({ item }) => (
        <TouchableOpacity
            style={styles.transactionItem}
            onPress={() => openTransactionDetails(item)}
            activeOpacity={0.7}
        >
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
                    {item.amount > 0 ? '+' : '-'}{formatCurrency(item.amount)}
                </Text>
            </View>
        </TouchableOpacity>
    );

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
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{account.name}</Text>
                    {account.mask && (
                        <Text style={styles.headerSubtitle}>•••• {account.mask}</Text>
                    )}
                </View>
                <View style={styles.headerRight} />
            </View>

            {/* Account Balance Card */}
            <View style={styles.balanceCard}>
                <View style={styles.balanceRow}>
                    <View style={styles.balanceItem}>
                        <Text style={styles.balanceLabel}>Current Balance</Text>
                        <Text style={styles.balanceAmount}>
                            ${(account.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Text>
                    </View>
                    <View style={styles.accountBadge}>
                        <Text style={styles.accountType}>{account.subtype || account.type}</Text>
                    </View>
                </View>

                {/* Income/Expense Summary */}
                <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                        <View style={styles.summaryIcon}>
                            <Ionicons name="trending-up" size={16} color="#4CAF50" />
                        </View>
                        <View>
                            <Text style={styles.summaryLabel}>Income</Text>
                            <Text style={[styles.summaryAmount, { color: '#4CAF50' }]}>
                                +{formatCurrency(totals.income)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.summaryItem}>
                        <View style={[styles.summaryIcon, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
                            <Ionicons name="trending-down" size={16} color="#F44336" />
                        </View>
                        <View>
                            <Text style={styles.summaryLabel}>Expenses</Text>
                            <Text style={[styles.summaryAmount, { color: '#F44336' }]}>
                                -{formatCurrency(totals.expenses)}
                            </Text>
                        </View>
                    </View>
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

            {/* Transactions Header */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Transactions</Text>
                <Text style={styles.countText}>
                    {searchQuery ? `${filteredTransactions.length} of ${transactions.length}` : `${transactions.length} items`}
                </Text>
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
                            {searchQuery ? `No results for "${searchQuery}"` : 'No transactions found for this account'}
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
                                        {selectedTransaction.amount > 0 ? '+' : '-'}{formatCurrency(selectedTransaction.amount)}
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

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Account</Text>
                                    <Text style={styles.detailValue}>{account.name}</Text>
                                </View>

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
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    headerSubtitle: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    headerRight: {
        width: 40,
    },

    // Balance Card
    balanceCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    balanceItem: {},
    balanceLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginBottom: 4,
    },
    balanceAmount: {
        color: COLORS.WHITE,
        fontSize: 28,
        fontWeight: 'bold',
    },
    accountBadge: {
        backgroundColor: COLORS.CARD_BORDER,
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.SMALL,
    },
    accountType: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        textTransform: 'capitalize',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: COLORS.CARD_BORDER,
    },
    summaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    summaryLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
    },
    summaryAmount: {
        fontSize: 14,
        fontWeight: '600',
    },

    // Section Header
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
    },
    countText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
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
        textAlign: 'center',
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

    // Modal
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
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.WHITE,
    },
    modalCloseButton: {
        padding: SPACING.SMALL,
    },
    transactionDetails: {
        marginBottom: SPACING.LARGE,
    },
    detailAmountRow: {
        alignItems: 'center',
        marginBottom: SPACING.XL,
    },
    detailAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: SPACING.SMALL,
    },
    amountBadge: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    amountBadgeText: {
        fontSize: 14,
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
        fontSize: 16,
        color: COLORS.TEXT_SECONDARY,
    },
    detailValue: {
        fontSize: 16,
        color: COLORS.WHITE,
        fontWeight: '500',
        flex: 1,
        textAlign: 'right',
        marginLeft: SPACING.MEDIUM,
    },
    transactionId: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    modalDoneButton: {
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
    },
    modalDoneText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default AccountTransactionsScreen;
