import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import CategoryPickerSheet from '../components/CategoryPickerSheet';
import TransactionSelectionBar from '../components/TransactionSelectionBar';
import TransactionFilterSheet from '../components/TransactionFilterSheet';
import TransactionFilterButton from '../components/TransactionFilterButton';
import TotalsSummary from '../components/TotalsSummary';
import useTransactionFlags from '../hooks/useTransactionFlags';
import useTransactionSelection from '../hooks/useTransactionSelection';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction } from '../utils/categorization';
import {
    EMPTY_FILTERS,
    activeFilterCount,
    describeFilters,
    filterQueryParts,
    hasDateRange,
} from '../utils/transactionFilters';

// Reaches as deep as Plaid is asked for at link time. Anything longer than the
// history a given connection actually holds simply returns fewer rows.
// `label` is what fits in the control; `full` is what reads in a sentence
// ("in the last 30 days"). Five options make the long labels overflow.
const RANGES = [
    { value: 7, label: '7d', full: '7 days' },
    { value: 30, label: '30d', full: '30 days' },
    { value: 90, label: '90d', full: '90 days' },
    { value: 365, label: '1y', full: 'year' },
    { value: 730, label: '2y', full: '2 years' },
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

const buildQuery = ({ days, offset, search, flagFilter, filters, forceRefresh }) => {
    const parts = [
        `limit=${PAGE_SIZE}`,
        `offset=${offset}`,
        // `days` lives in here rather than above it: a custom date range
        // suppresses it, because the two AND on the server and "the last 30
        // days" alongside a window in March is an empty list with no cause
        // visible anywhere on screen.
        ...filterQueryParts(filters, { days }),
    ];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (flagFilter !== ALL_FLAGS) parts.push(`flag_id=${encodeURIComponent(flagFilter)}`);
    if (forceRefresh) parts.push('refresh=true');
    return `?${parts.join('&')}`;
};

const makeStyles = (t) => StyleSheet.create({
    controls: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    range: { marginBottom: SPACING.SMALL + 2 },
    search: { marginBottom: 0 },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
    },
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

const AllTransactionsScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const [totals, setTotals] = useState(null);

    const [range, setRange] = useState(DEFAULT_RANGE);
    // A flag's own screen links here pre-filtered, so arriving from "see them in
    // the list" lands on that flag rather than on everything.
    const [flagFilter, setFlagFilter] = useState(route?.params?.flagId ?? ALL_FLAGS);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Amount, date range and direction. Applied all at once from the sheet, so
    // this changes only when Apply is pressed — a half-typed minimum never
    // reaches a request.
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);

    const flagState = useTransactionFlags();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Busy flag for the single-transaction correction below. The selection has
    // its own, inside the hook -- separate so closing one cannot grey out the
    // other's buttons.
    const [singleBusy, setSingleBusy] = useState(false);

    // The correction sheet for a single transaction, opened from the detail
    // sheet. Separate state from the bulk one so closing either cannot leave
    // the other half-open over a transaction it was not about.
    const [singleCategoryOpen, setSingleCategoryOpen] = useState(false);

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
                // Carried through so the detail sheet can mark a corrected row
                // and offer the undo, and so the picker can name the merchant.
                // Dropping them here is how a feature ends up working on the
                // server and doing nothing on screen.
                user_category: tx.user_category ?? null,
                merchantLabel: tx.merchantLabel ?? null,
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
                buildQuery({ days: range, offset: 0, search: debouncedSearch, flagFilter, filters, forceRefresh })
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
    }, [range, debouncedSearch, flagFilter, filters]);

    /** Append the next page. Offset is the number of rows already held. */
    const loadMore = useCallback(async () => {
        if (loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const response = await api.getTransactions(
                buildQuery({ days: range, offset: transactions.length, search: debouncedSearch, flagFilter, filters })
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
    }, [hasMore, range, debouncedSearch, flagFilter, filters, transactions.length]);

    // -----------------------------------------------------------------------
    // Selection
    // -----------------------------------------------------------------------

    // `transactions` IS the visible list here: the search runs on the server,
    // so every row fetched is a row on screen. The account list filters in
    // memory and has to pass its filtered list instead.
    const selection = useTransactionSelection({
        rows: transactions,
        onChanged: () => loadFirstPage(false),
        onFlagsChanged: flagState.reload,
    });

    // Stable (useCallback with no deps), so naming it here lets the effect
    // below depend on the clear itself rather than on the whole selection
    // object -- which changes on every tick and would wipe the list mid-scroll.
    const { clear: clearSelection } = selection;

    const onRowPress = (item) => {
        if (!selection.selectMode) {
            openTransactionDetails(item);
            return;
        }
        selection.toggle(item.id);
    };

    // Changing the range or the search starts a new list.
    useEffect(() => {
        setLoading(true);
        setTransactions([]);
        setHasMore(false);
        // And drops the selection with it. Keeping it would leave a total
        // counting rows that are no longer on screen -- a figure with no
        // visible working, which is the one thing this app refuses to render.
        // Selection mode itself stays on: filtering and then selecting is the
        // useful order, and it is unaffected.
        clearSelection();
        loadFirstPage(false);
    }, [loadFirstPage, clearSelection]);

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

    // -----------------------------------------------------------------------
    // One transaction
    // -----------------------------------------------------------------------

    const applySingleCategory = async (category, { applyToMerchant }) => {
        if (!selectedTransaction) return;

        try {
            setSingleBusy(true);
            await api.setTransactionCategory(selectedTransaction.id, category, { applyToMerchant });
            setSingleCategoryOpen(false);
            setShowTransactionModal(false);
            loadFirstPage(false);
        } catch (error) {
            console.error('Error correcting a category:', error);
        } finally {
            setSingleBusy(false);
        }
    };

    const clearSingleCategory = async () => {
        if (!selectedTransaction) return;

        try {
            setSingleBusy(true);
            await api.clearTransactionCategory(selectedTransaction.id);
            setSingleCategoryOpen(false);
            setShowTransactionModal(false);
            loadFirstPage(false);
        } catch (error) {
            console.error('Error removing a category correction:', error);
        } finally {
            setSingleBusy(false);
        }
    };

    const selectedAccount = selectedTransaction
        ? accounts.find((a) => a.id === selectedTransaction.account_id)
        : null;

    const rangeLabel = RANGES.find((r) => r.value === range)?.full ?? `${range} days`;

    // -----------------------------------------------------------------------
    // Filters
    // -----------------------------------------------------------------------

    // A custom window overrides the preset control rather than sitting beside
    // it — `filterQueryParts` drops `days`, so a highlighted "30d" over a March
    // list would be the control describing a query nobody ran.
    const customRange = hasDateRange(filters);
    const rangeOptions = customRange ? [...RANGES, { value: 'custom', label: 'Custom' }] : RANGES;

    const onRangeChange = (value) => {
        // Re-tapping Custom reopens the sheet: it is selected whenever a range
        // is set, so it has no other way to be useful.
        if (value === 'custom') {
            setFilterOpen(true);
            return;
        }
        if (customRange) setFilters((prev) => ({ ...prev, startDate: null, endDate: null }));
        setRange(value);
    };

    const applyFilters = (next) => {
        setFilters(next);
        setFilterOpen(false);
    };

    // What is narrowing the list, said in words. Carried into both the totals
    // label and the empty state: a filter left on yesterday, with nothing on
    // screen to name it, turns an empty list into "my transactions are gone".
    const filterSummary = describeFilters(filters);
    const filterCount = activeFilterCount(filters);

    const windowLabel = customRange ? filterSummary : `Last ${rangeLabel}`;

    const activeFlag = flagState.flags.find((f) => f.id === flagFilter);
    const scopeLabel = activeFlag
        ? `${activeFlag.name} · ${windowLabel}`
        : flagFilter === UNFLAGGED
            ? `Unflagged · ${windowLabel}`
            : windowLabel;

    // The date part is already in `windowLabel` when it is custom, so only the
    // rest of the filter is appended — otherwise the range reads twice.
    const nonDateSummary = describeFilters({ ...filters, startDate: null, endDate: null });
    const totalsLabel = customRange
        ? scopeLabel
        : (nonDateSummary ? `${scopeLabel} · ${nonDateSummary}` : scopeLabel);

    // Kept as two sentences rather than one clause inside another. "since Mar 1"
    // reads fine on its own and not at all after "in", and a range that is
    // sometimes a window and sometimes a list of conditions cannot be made
    // grammatical in a single template.
    const windowSentence = customRange ? '' : ` in the last ${rangeLabel}`;
    const filterNote = filterCount ? ` Filtered to ${filterSummary}.` : '';
    // A custom range or an amount bound is not fixed by looking further back.
    const emptyAdvice = filterCount
        ? ' Try clearing a filter.'
        : ' Try a longer range, or pull down to sync.';

    const header = (
        <>
            {/* While selecting, the header becomes the way out. Back would
                leave the screen entirely and lose a selection built by hand,
                which is not what somebody reaches for when they want to stop
                selecting. */}
            <ScreenHeader
                title={selection.selectMode
                    ? (selection.summary.count ? `${selection.summary.count} selected` : 'Select transactions')
                    : 'All transactions'}
                onBack={selection.selectMode ? selection.exit : () => navigation.goBack()}
                right={selection.selectMode ? (
                    <TouchableOpacity
                        onPress={selection.exit}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel selection"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Text variant="label" color={theme.ACCENT}>Cancel</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerRight}>
                        <Text variant="meta" tone="muted">
                            {total > transactions.length
                                ? `${transactions.length}/${total}`
                                : `${total}`}
                        </Text>
                        <TransactionFilterButton
                            filters={filters}
                            onPress={() => setFilterOpen(true)}
                        />
                        <TouchableOpacity
                            onPress={selection.enter}
                            accessibilityRole="button"
                            accessibilityLabel="Select transactions"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="checkmark-circle-outline" size={21} color={theme.ACCENT} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Flags')}
                            accessibilityRole="button"
                            accessibilityLabel="Manage flags"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="pricetags-outline" size={20} color={theme.ACCENT} />
                        </TouchableOpacity>
                    </View>
                )}
            />
            <View style={styles.controls}>
                <SegmentedControl
                    options={rangeOptions}
                    value={customRange ? 'custom' : range}
                    onChange={onRangeChange}
                    allowReselect
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
                                selectable={selection.selectMode}
                                selected={selection.isSelected(item.id)}
                                onPress={() => onRowPress(item)}
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
                                        {(debouncedSearch
                                            ? `${total} ${total === 1 ? 'match' : 'matches'}${windowSentence}`
                                            : `All ${total}${windowSentence ? ` from${windowSentence}` : ''}`)
                                            + (filterCount ? ` · ${filterSummary}` : '')}
                                    </Text>
                                </View>
                            ) : null
                        }
                        ListEmptyComponent={
                            <EmptyState
                                icon={debouncedSearch
                                    ? 'search-outline'
                                    : filterCount ? 'filter-outline'
                                        : flagFilter !== ALL_FLAGS ? 'pricetag-outline' : 'receipt-outline'}
                                title={debouncedSearch ? 'No matches' : flagFilter !== ALL_FLAGS ? 'Nothing flagged' : 'No transactions'}
                                message={debouncedSearch
                                    ? `Nothing matched "${debouncedSearch}"${windowSentence}.${filterNote}`
                                    : activeFlag
                                        ? `Nothing is flagged "${activeFlag.name}"${windowSentence}.${filterNote} Open a transaction to flag it.`
                                        : flagFilter === UNFLAGGED
                                            ? `Everything${windowSentence} carries a flag.${filterNote}`
                                            : `Nothing${windowSentence}.${filterNote}${emptyAdvice}`}
                            />
                        }
                    />
                )}
            </Screen>

            <TransactionSelectionBar selection={selection} flagOptions={flagState.options} />

            <TransactionFilterSheet
                visible={filterOpen}
                filters={filters}
                onApply={applyFilters}
                onClose={() => setFilterOpen(false)}
            />

            <CategoryPickerSheet
                visible={singleCategoryOpen}
                count={1}
                busy={singleBusy}
                current={selectedTransaction?.category ?? null}
                merchantLabel={selectedTransaction?.merchantLabel ?? null}
                onSelect={applySingleCategory}
                onClear={selectedTransaction?.user_category ? clearSingleCategory : null}
                onClose={() => setSingleCategoryOpen(false)}
            />

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
                onEditCategory={() => setSingleCategoryOpen(true)}
                onClose={() => setShowTransactionModal(false)}
            />
        </>
    );
};

export default AllTransactionsScreen;
