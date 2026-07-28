import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Input,
    SegmentedControl,
    EmptyState,
    LoadingState,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction } from '../utils/categorization';

const RANGES = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
];
const DEFAULT_RANGE = 30;
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

const formatDate = (dateStr) => {
    // Add T12:00:00 to prevent timezone shift (UTC midnight -> local = previous day)
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const buildQuery = ({ days, offset, search, forceRefresh }) => {
    const parts = [
        `days=${days}`,
        `limit=${PAGE_SIZE}`,
        `offset=${offset}`,
    ];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (forceRefresh) parts.push('refresh=true');
    return `?${parts.join('&')}`;
};

const makeStyles = () => StyleSheet.create({
    controls: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    range: { marginBottom: SPACING.SMALL + 2 },
    search: { marginBottom: 0 },
    list: { flex: 1 },
    // A dedicated full-screen list reads better as flat rows separated by
    // hairlines than as one card per row. Home groups its five recent
    // transactions into a card because there it is one section among many.
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
    footer: {
        paddingVertical: SPACING.LARGE,
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
});

const AllTransactionsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const [range, setRange] = useState(DEFAULT_RANGE);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    // Guards a second page request while one is already in flight — FlatList
    // fires onEndReached more than once as the list settles.
    const loadingMoreRef = useRef(false);
    // Cached rows may only be used for the very first paint. Once the server has
    // answered once, they are stale and windowed to the wrong range — painting
    // them over an empty result would show rows the current filter excludes.
    const allowCachePaintRef = useRef(true);

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

    // Debounce typing so each keystroke is not a round trip.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    /** Load the first page for the current range and search. */
    const loadFirstPage = useCallback(async (forceRefresh = false) => {
        try {
            const response = await api.getTransactions(
                buildQuery({ days: range, offset: 0, search: debouncedSearch, forceRefresh })
            );

            if (response?.success) {
                setTransactions(formatTransactionsData(response.data));
                setTotal(response.pagination?.total ?? response.data?.length ?? 0);
                setHasMore(!!response.pagination?.hasMore);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            allowCachePaintRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    }, [range, debouncedSearch]);

    /** Append the next page. Offset is the number of rows already held. */
    const loadMore = useCallback(async () => {
        if (loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const response = await api.getTransactions(
                buildQuery({ days: range, offset: transactions.length, search: debouncedSearch })
            );

            if (response?.success) {
                const next = formatTransactionsData(response.data);
                // Merge by id: a row arriving in a later page that is already
                // held (a sync between requests can shift the window) would
                // otherwise render twice and break the keyExtractor.
                setTransactions((prev) => {
                    const seen = new Set(prev.map((tx) => tx.id));
                    return [...prev, ...next.filter((tx) => !seen.has(tx.id))];
                });
                setTotal(response.pagination?.total ?? 0);
                setHasMore(!!response.pagination?.hasMore);
            }
        } catch (err) {
            console.error('Error loading more transactions:', err);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [hasMore, range, debouncedSearch, transactions.length]);

    // Changing the range or the search starts a new list.
    useEffect(() => {
        setLoading(true);
        setTransactions([]);
        setHasMore(false);
        loadFirstPage(false);
    }, [loadFirstPage]);

    // Accounts are only needed for row colouring, and never change per page.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const accountsData = await api.getAccounts();
                if (!cancelled && accountsData?.success) {
                    setAccounts(accountsData.accounts || []);
                }
            } catch (err) {
                console.error('Error fetching accounts:', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Paint something immediately on a cold open, windowed to the default range
    // so it does not briefly show rows the filter excludes. Deliberately does
    // not write back: what this screen holds is a filtered page, and the cache
    // is shared with Home, which expects the unfiltered list.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const cached = await cache.getCachedTransactions();
            if (cancelled || !cached?.length || !allowCachePaintRef.current) return;

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (DEFAULT_RANGE - 1));
            const windowed = cached.filter((tx) => new Date(`${tx.date}T12:00:00`) >= cutoff);
            if (!windowed.length) return;

            setTransactions((prev) => (prev.length ? prev : formatTransactionsData(windowed)));
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadFirstPage(true);
    }, [loadFirstPage]);

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

    const selectedAccount = selectedTransaction
        ? accounts.find((a) => a.id === selectedTransaction.account_id)
        : null;

    const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? `${range} days`;

    const header = (
        <>
            <ScreenHeader
                title="All transactions"
                onBack={() => navigation.goBack()}
                right={
                    <Text variant="meta" tone="muted">
                        {total > transactions.length
                            ? `${transactions.length}/${total}`
                            : `${total}`}
                    </Text>
                }
            />
            <View style={styles.controls}>
                <SegmentedControl
                    options={RANGES}
                    value={range}
                    onChange={setRange}
                    inset={false}
                    style={styles.range}
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
            </View>
        </>
    );

    return (
        <>
            <Screen header={header}>
                {loading ? (
                    <LoadingState message="Loading transactions..." />
                ) : (
                    <FlatList
                        data={transactions}
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
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.5}
                        keyboardShouldPersistTaps="handled"
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={theme.ACCENT}
                                colors={[theme.ACCENT]}
                                progressBackgroundColor={theme.SURFACE}
                            />
                        }
                        ListFooterComponent={
                            loadingMore ? (
                                <View style={styles.footer}>
                                    <ActivityIndicator size="small" color={theme.ACCENT} />
                                </View>
                            ) : (!hasMore && transactions.length > 0) ? (
                                <View style={styles.footer}>
                                    <Text variant="meta" tone="muted">
                                        {debouncedSearch
                                            ? `${total} ${total === 1 ? 'match' : 'matches'} in the last ${rangeLabel}`
                                            : `All ${total} from the last ${rangeLabel}`}
                                    </Text>
                                </View>
                            ) : null
                        }
                        ListEmptyComponent={
                            <EmptyState
                                icon={debouncedSearch ? 'search-outline' : 'receipt-outline'}
                                title={debouncedSearch ? 'No matches' : 'No transactions'}
                                message={debouncedSearch
                                    ? `Nothing matched "${debouncedSearch}" in the last ${rangeLabel}.`
                                    : `Nothing in the last ${rangeLabel}. Try a longer range, or pull down to sync.`}
                            />
                        }
                    />
                )}
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
