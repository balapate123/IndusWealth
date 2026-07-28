import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Input,
    EmptyState,
    LoadingState,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import useTransactionFlags from '../hooks/useTransactionFlags';
import api from '../services/api';
import { categorizeTransaction } from '../utils/categorization';

const formatDate = (dateStr) => {
    // Add T12:00:00 to prevent timezone shift
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const formatCurrency = (amount) =>
    `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const makeStyles = (t) => StyleSheet.create({
    summaryRow: { flexDirection: 'row' },
    summaryItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
    },
    summaryIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryDivider: {
        width: 1,
        backgroundColor: t.HAIRLINE,
        marginHorizontal: SPACING.MEDIUM,
    },
    search: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    list: { flex: 1 },
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
});

const AccountTransactionsScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const { account } = route.params;
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [totals, setTotals] = useState({ income: 0, expenses: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const flagState = useTransactionFlags();

    const fetchTransactions = useCallback(async () => {
        try {
            const data = await api.getAccountTransactions(account.id);

            if (data?.success) {
                const formattedTransactions = (data.data || []).map((tx, index) => {
                    const categorization = categorizeTransaction(tx);
                    return {
                        id: tx.transaction_id || index,
                        merchant: tx.name,
                        category: categorization.category,
                        categoryIcon: categorization.icon,
                        categoryLibrary: categorization.library,
                        categoryColorIndex: categorization.colorIndex,
                        amount: tx.amount * -1,
                        date: tx.date,
                        formattedDate: formatDate(tx.date),
                        notes: tx.notes || '',
                        flags: tx.flags || [],
                    };
                });
                setTransactions(formattedTransactions);

                const income = formattedTransactions
                    .filter((t) => t.amount > 0)
                    .reduce((sum, t) => sum + t.amount, 0);
                const expenses = formattedTransactions
                    .filter((t) => t.amount < 0)
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

    const filteredTransactions = useMemo(() => {
        let result = [...transactions];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter((tx) =>
                tx.merchant?.toLowerCase().includes(query) ||
                tx.category?.toLowerCase().includes(query) ||
                tx.notes?.toLowerCase().includes(query) ||
                Math.abs(tx.amount).toFixed(2).includes(query)
            );
        }

        result.sort((a, b) => new Date(b.date) - new Date(a.date));
        return result;
    }, [transactions, searchQuery]);

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setEditNotes(item.notes || '');
        flagState.openFor(item);
        setShowTransactionModal(true);
    };

    const handleSaveDetails = async () => {
        if (!selectedTransaction) return;

        try {
            setSaving(true);
            const notes = editNotes.trim();
            const [, nextFlags] = await Promise.all([
                api.updateTransactionNotes(selectedTransaction.id, notes),
                flagState.save(selectedTransaction.id),
            ]);

            const updated = { ...selectedTransaction, notes, flags: nextFlags };
            setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? updated : tx)));
            setSelectedTransaction(updated);

            setShowTransactionModal(false);
        } catch (error) {
            console.error('Error saving transaction details:', error);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading transactions..." />
            </Screen>
        );
    }

    const header = (
        <>
            <ScreenHeader
                title={account.alias || account.name}
                onBack={() => navigation.goBack()}
                right={account.mask ? <Text variant="meta" tone="muted">••{account.mask}</Text> : null}
            />

            <Card>
                <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                        <View style={[styles.summaryIcon, { backgroundColor: theme.SUCCESS_DIM }]}>
                            <Ionicons name="arrow-down" size={18} color={theme.SUCCESS} />
                        </View>
                        <View>
                            <Text variant="meta" tone="muted">Income</Text>
                            <Text variant="num" tone="success">{formatCurrency(totals.income)}</Text>
                        </View>
                    </View>

                    <View style={styles.summaryDivider} />

                    <View style={styles.summaryItem}>
                        <View style={[styles.summaryIcon, { backgroundColor: theme.DANGER_DIM }]}>
                            <Ionicons name="arrow-up" size={18} color={theme.DANGER} />
                        </View>
                        <View>
                            <Text variant="meta" tone="muted">Expenses</Text>
                            <Text variant="num" tone="danger">{formatCurrency(totals.expenses)}</Text>
                        </View>
                    </View>
                </View>
            </Card>

            <Input
                icon="search"
                placeholder="Search transactions..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery('')}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.search}
            />
        </>
    );

    return (
        <>
            <Screen header={header}>
                <FlatList
                    data={filteredTransactions}
                    renderItem={({ item, index }) => (
                        <TransactionRow
                            transaction={item}
                            subtitle={`${item.category} · ${item.formattedDate}`}
                            divider={index > 0}
                            onPress={() => openTransactionDetails(item)}
                        />
                    )}
                    keyExtractor={(item) => item.id.toString()}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.ACCENT}
                            colors={[theme.ACCENT]}
                            progressBackgroundColor={theme.SURFACE}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            icon={searchQuery ? 'search-outline' : 'receipt-outline'}
                            title={searchQuery ? 'No matches' : 'No transactions yet'}
                            message={searchQuery
                                ? `Nothing matched "${searchQuery}".`
                                : 'Transactions for this account will appear here.'}
                        />
                    }
                />
            </Screen>

            <TransactionDetailSheet
                visible={showTransactionModal}
                transaction={selectedTransaction}
                accountName={account.alias || account.name}
                notes={editNotes}
                onChangeNotes={setEditNotes}
                flags={flagState.flags}
                selectedFlagIds={flagState.selected}
                onToggleFlag={flagState.toggle}
                saving={saving}
                onSave={handleSaveDetails}
                onClose={() => setShowTransactionModal(false)}
            />
        </>
    );
};

export default AccountTransactionsScreen;
