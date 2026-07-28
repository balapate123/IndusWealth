import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Input,
    EmptyState,
    LoadingState,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction } from '../utils/categorization';

const formatDate = (dateStr) => {
    // Add T12:00:00 to prevent timezone shift (UTC midnight -> local = previous day)
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const makeStyles = () => StyleSheet.create({
    search: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    list: { flex: 1 },
    // A dedicated full-screen list reads better as flat rows separated by
    // hairlines than as one card per row. Home groups its five recent
    // transactions into a card because there it is one section among many.
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
});

const AllTransactionsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const formatTransactionsData = (rawTransactions) => {
        return (rawTransactions || []).map((tx, index) => {
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
                account_id: tx.account_id,
                notes: tx.notes || '',
            };
        });
    };

    const fetchData = useCallback(async (forceRefresh = false) => {
        try {
            // STEP 1: Load from cache first (instant display)
            const cachedTransactions = await cache.getCachedTransactions();
            if (cachedTransactions && cachedTransactions.length > 0) {
                setTransactions(formatTransactionsData(cachedTransactions));
                setLoading(false);
            }

            // STEP 2: ALWAYS fetch fresh data from API (keeps this in step with Home)
            const refreshParam = forceRefresh ? '?refresh=true' : '';
            const transactionsData = await api.getTransactions(refreshParam);

            if (transactionsData?.success) {
                setTransactions(formatTransactionsData(transactionsData.data));
                // Update the cache so other screens get the fresh data
                await cache.setCachedTransactions(transactionsData.data);
            }

            // STEP 3: Always fetch accounts for colour coding
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

    // Accounts take identity colours from the same validated ramp as categories.
    const realAccounts = accounts.filter((acc) => acc.id !== 'all' && acc.type !== 'aggregate');
    const getAccountColor = (accountId) => {
        if (!accountId || realAccounts.length === 0) return categoryColor(theme, 0);
        const index = realAccounts.findIndex((acc) => acc.id === accountId);
        return categoryColor(theme, index === -1 ? 0 : index);
    };

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setEditNotes(item.notes || '');
        setShowTransactionModal(true);
    };

    const handleSaveNotes = async () => {
        if (!selectedTransaction) return;

        try {
            setSaving(true);
            await api.updateTransactionNotes(selectedTransaction.id, editNotes.trim());

            setTransactions((prev) => prev.map((tx) =>
                tx.id === selectedTransaction.id ? { ...tx, notes: editNotes.trim() } : tx
            ));
            setSelectedTransaction((prev) => ({ ...prev, notes: editNotes.trim() }));

            setShowTransactionModal(false);
        } catch (error) {
            console.error('Error saving notes:', error);
        } finally {
            setSaving(false);
        }
    };

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

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading transactions..." />
            </Screen>
        );
    }

    const selectedAccount = selectedTransaction
        ? accounts.find((a) => a.id === selectedTransaction.account_id)
        : null;

    const header = (
        <>
            <ScreenHeader
                title="All transactions"
                onBack={() => navigation.goBack()}
                right={
                    <Text variant="meta" tone="muted">
                        {searchQuery
                            ? `${filteredTransactions.length}/${transactions.length}`
                            : `${transactions.length}`}
                    </Text>
                }
            />
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
                            accountColor={getAccountColor(item.account_id)}
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
                            title={searchQuery ? 'No matches' : 'No transactions found'}
                            message={searchQuery
                                ? `Nothing matched "${searchQuery}".`
                                : 'Pull down to sync with your bank.'}
                        />
                    }
                />
            </Screen>

            <TransactionDetailSheet
                visible={showTransactionModal}
                transaction={selectedTransaction}
                accountName={selectedAccount ? (selectedAccount.alias || selectedAccount.name) : null}
                accountColor={selectedTransaction ? getAccountColor(selectedTransaction.account_id) : null}
                notes={editNotes}
                onChangeNotes={setEditNotes}
                saving={saving}
                onSave={handleSaveNotes}
                onClose={() => setShowTransactionModal(false)}
            />
        </>
    );
};

export default AllTransactionsScreen;
