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
    Chip,
    ChipRow,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import TotalsSummary from '../components/TotalsSummary';
import useTransactionFlags from '../hooks/useTransactionFlags';
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

/** null = every transaction; 'none' = only the ones carrying no flag. */
const ALL_FLAGS = null;
const UNFLAGGED = 'none';

const buildQuery = ({ days, offset, search, flagFilter, forceRefresh }) => {
    const parts = [
        `days=${days}`,
        `limit=${PAGE_SIZE}`,
        `offset=${offset}`,
    ];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (flagFilter !== ALL_FLAGS) parts.push(`flag_id=${encodeURIComponent(flagFilter)}`);
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
    flagRow: { marginTop: SPACING.SMALL + 2 },
    totals: { marginTop: SPACING.SMALL + 2, marginBottom: SPACING.SMALL },
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

    const [totals, setTotals] = useState(null);

    const [range, setRange] = useState(DEFAULT_RANGE);
    const [flagFilter, setFlagFilter] = useState(ALL_FLAGS);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const flagState = useTransactionFlags();

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
                flags: tx.flags || [],
            };
        });
    };

    /**
     * Whether a row still belongs in the list under the active flag filter.
     * Used after a tag change to drop a row that no longer qualifies, rather
     * than leaving it visible under a filter it no longer matches.
     */
    const matchesFlagFilter = useCallback((tx) => {
        if (flagFilter === ALL_FLAGS) return true;
        if (flagFilter === UNFLAGGED) return !tx.flags?.length;
        return !!tx.flags?.some((f) => f.id === flagFilter);
    }, [flagFilter]);

    // Debounce typing so each keystroke is not a round trip.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    /** Load the first page for the current range and search. */
    const loadFirstPage = useCallback(async (forceRefresh = false) => {
        try {
            const response = await api.getTransactions(
                buildQuery({ days: range, offset: 0, search: debouncedSearch, flagFilter, forceRefresh })
            );

            if (response?.success) {
                setTransactions(formatTransactionsData(response.data));
                setTotal(response.pagination?.total ?? response.data?.length ?? 0);
                setHasMore(!!response.pagination?.hasMore);
                setTotals(response.totals ?? null);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            allowCachePaintRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    }, [range, debouncedSearch, flagFilter]);

    /** Append the next page. Offset is the number of rows already held. */
    const loadMore = useCallback(async () => {
        if (loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const response = await api.getTransactions(
                buildQuery({ days: range, offset: transactions.length, search: debouncedSearch, flagFilter })
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
    }, [hasMore, range, debouncedSearch, flagFilter, transactions.length]);

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

            // Removing the very flag being filtered on leaves a row that no
            // longer belongs in the list — and the totals behind it move too, so
            // reload rather than patch. Any other edit cannot change membership,
            // and patching in place keeps the scroll position.
            if (!matchesFlagFilter(updated)) {
                setShowTransactionModal(false);
                loadFirstPage(false);
                return;
            }

            setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? updated : tx)));
            setSelectedTransaction(updated);
            setShowTransactionModal(false);
        } catch (error) {
            console.error('Error saving transaction details:', error);
        } finally {
            setSaving(false);
        }
    };

    const selectedAccount = selectedTransaction
        ? accounts.find((a) => a.id === selectedTransaction.account_id)
        : null;

    const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? `${range} days`;

    const activeFlag = flagState.flags.find((f) => f.id === flagFilter);
    const totalsLabel = activeFlag
        ? `${activeFlag.name} · last ${rangeLabel}`
        : flagFilter === UNFLAGGED
            ? `Unflagged · last ${rangeLabel}`
            : `Last ${rangeLabel}`;

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

            {/* Outside `controls`: ChipRow carries its own horizontal padding,
                and nesting it inside would indent the chips twice. */}
            {flagState.flags.length ? (
                <ChipRow style={styles.flagRow}>
                    <Chip
                        label="All"
                        active={flagFilter === ALL_FLAGS}
                        onPress={() => setFlagFilter(ALL_FLAGS)}
                    />
                    {flagState.flags.map((flag) => {
                        const active = flagFilter === flag.id;
                        return (
                            <Chip
                                key={flag.id}
                                label={flag.name}
                                icon={flag.icon}
                                active={active}
                                color={active ? categoryColor(theme, flag.color_index) : undefined}
                                // Tapping the active chip clears it, so there is
                                // always a way back without hunting for "All".
                                onPress={() => setFlagFilter(active ? ALL_FLAGS : flag.id)}
                            />
                        );
                    })}
                    <Chip
                        label="Unflagged"
                        icon="ellipse-outline"
                        active={flagFilter === UNFLAGGED}
                        onPress={() => setFlagFilter(flagFilter === UNFLAGGED ? ALL_FLAGS : UNFLAGGED)}
                    />
                </ChipRow>
            ) : null}

            <TotalsSummary totals={totals} label={totalsLabel} style={styles.totals} />
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
                                icon={debouncedSearch ? 'search-outline' : flagFilter !== ALL_FLAGS ? 'pricetag-outline' : 'receipt-outline'}
                                title={debouncedSearch ? 'No matches' : flagFilter !== ALL_FLAGS ? 'Nothing flagged' : 'No transactions'}
                                message={debouncedSearch
                                    ? `Nothing matched "${debouncedSearch}" in the last ${rangeLabel}.`
                                    : activeFlag
                                        ? `Nothing is flagged "${activeFlag.name}" in the last ${rangeLabel}. Open a transaction to flag it.`
                                        : flagFilter === UNFLAGGED
                                            ? `Everything in the last ${rangeLabel} carries a flag.`
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

export default AllTransactionsScreen;
