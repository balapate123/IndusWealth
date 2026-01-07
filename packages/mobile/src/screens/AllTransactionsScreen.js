import React, { useEffect, useState, useCallback } from 'react';
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

const AllTransactionsScreen = ({ navigation }) => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const data = await api.getTransactions();

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
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
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
        <View style={styles.transactionItem}>
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
        </View>
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
                <Text style={styles.headerTitle}>All Transactions</Text>
                <View style={styles.headerRight}>
                    <Text style={styles.countText}>{transactions.length} items</Text>
                </View>
            </View>

            {/* Transaction List */}
            <FlatList
                data={transactions}
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
                        <Ionicons name="receipt-outline" size={48} color={COLORS.TEXT_MUTED} />
                        <Text style={styles.emptyText}>No transactions found</Text>
                    </View>
                }
            />
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
    },
});

export default AllTransactionsScreen;
