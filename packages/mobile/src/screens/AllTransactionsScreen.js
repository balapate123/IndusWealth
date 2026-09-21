import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Button,
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
import FlagEditorSheet from '../components/FlagEditorSheet';
import {
    MAX_SELECTION,
    toggleSelection,
    summarizeSelection,
    formatSelectionTotal,
} from '../utils/transactionSelection';
import TotalsSummary from '../components/TotalsSummary';
import useTransactionFlags from '../hooks/useTransactionFlags';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction } from '../utils/categorization';

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

const makeStyles = (t) => StyleSheet.create({
    controls: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    range: { marginBottom: SPACING.SMALL + 2 },
    search: { marginBottom: 0 },
    selectionBar: {
        position: 'absolute',
        left: SPACING.MEDIUM,
        right: SPACING.MEDIUM,
        bottom: SPACING.MEDIUM,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: RADIUS.CARD,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
    },
    selectionSummary: { flex: 1 },
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

    const flagState = useTransactionFlags();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Selection mode. Entered from an explicit control rather than a long-press:
    // nothing is hidden behind a gesture, and it cannot be triggered by accident
    // on a list people scroll through every day.
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
    const [groupOpen, setGroupOpen] = useState(false);
    const [groupError, setGroupError] = useState(null);
    const [bulkBusy, setBulkBusy] = useState(false);

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
        // And drops the selection with it. Keeping it would leave a total
        // counting rows that are no longer on screen -- a figure with no
        // visible working, which is the one thing this app refuses to render.
        // Selection mode itself stays on: filtering and then selecting is the
        // useful order, and it is unaffected.
        setSelected(new Set());
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

    // -----------------------------------------------------------------------
    // Selection
    // -----------------------------------------------------------------------

    // Count and total from the visible rows, so the two always describe the
    // same set. Summed on the device, which is the one place that is correct:
    // a selection IS rows already in memory, unlike the list totals, which come
    // from the server because the device only ever holds a page.
    const selection = summarizeSelection(transactions, selected);
    const atSelectionCap = selection.count >= MAX_SELECTION;

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelected(new Set());
    };

    const onRowPress = (item) => {
        if (!selectMode) {
            openTransactionDetails(item);
            return;
        }
        // Silently refusing a tap at the cap would read as a broken row, so an
        // already-selected one can always be tapped off.
        if (atSelectionCap && !selected.has(item.id)) return;
        setSelected((prev) => toggleSelection(prev, item.id));
    };

    const applyBulkCategory = async (category) => {
        const ids = transactions.filter((tx) => selected.has(tx.id)).map((tx) => tx.id);
        if (ids.length === 0) return;

        try {
            setBulkBusy(true);
            await api.setTransactionCategories(ids, category);
            setBulkCategoryOpen(false);
            exitSelectMode();
            // Reload rather than patch: a category change moves the totals bar
            // and can move rows out of a category-derived view later. Patching
            // would leave the header disagreeing with the rows beneath it.
            loadFirstPage(false);
        } catch (error) {
            console.error('Error setting categories:', error);
        } finally {
            setBulkBusy(false);
        }
    };

    const createGroupFromSelection = async ({ name, colorIndex, icon }) => {
        // item.id is the PLAID transaction id -- GET /transactions aliases the
        // numeric key away before the device sees it -- which is exactly what
        // both the flag endpoint and the category endpoint expect.
        const ids = transactions.filter((tx) => selected.has(tx.id)).map((tx) => tx.id);
        if (ids.length === 0) return;

        try {
            setBulkBusy(true);
            setGroupError(null);
            const created = await api.createFlag({ name, colorIndex, icon });
            const flagId = created?.data?.id ?? created?.id;
            if (!flagId) throw new Error('flag id missing from the create response');

            await api.setFlagTransactions(flagId, { add: ids });
            setGroupOpen(false);
            exitSelectMode();
            await flagState.reload();
            loadFirstPage(false);
        } catch (error) {
            console.error('Error creating a group:', error);
            // Surfaced in the sheet rather than swallowed: a duplicate name is
            // a 409 the user can fix, and a silent failure here loses a
            // selection they built by hand.
            setGroupError(error?.message || 'Could not create that group.');
        } finally {
            setBulkBusy(false);
        }
    };

    // -----------------------------------------------------------------------
    // One transaction
    // -----------------------------------------------------------------------

    const applySingleCategory = async (category, { applyToMerchant }) => {
        if (!selectedTransaction) return;

        try {
            setBulkBusy(true);
            await api.setTransactionCategory(selectedTransaction.id, category, { applyToMerchant });
            setSingleCategoryOpen(false);
            setShowTransactionModal(false);
            loadFirstPage(false);
        } catch (error) {
            console.error('Error correcting a category:', error);
        } finally {
            setBulkBusy(false);
        }
    };

    const clearSingleCategory = async () => {
        if (!selectedTransaction) return;

        try {
            setBulkBusy(true);
            await api.clearTransactionCategory(selectedTransaction.id);
            setSingleCategoryOpen(false);
            setShowTransactionModal(false);
            loadFirstPage(false);
        } catch (error) {
            console.error('Error removing a category correction:', error);
        } finally {
            setBulkBusy(false);
        }
    };

    const selectedAccount = selectedTransaction
        ? accounts.find((a) => a.id === selectedTransaction.account_id)
        : null;

    const rangeLabel = RANGES.find((r) => r.value === range)?.full ?? `${range} days`;

    const activeFlag = flagState.flags.find((f) => f.id === flagFilter);
    const totalsLabel = activeFlag
        ? `${activeFlag.name} · last ${rangeLabel}`
        : flagFilter === UNFLAGGED
            ? `Unflagged · last ${rangeLabel}`
            : `Last ${rangeLabel}`;

    const header = (
        <>
            {/* While selecting, the header becomes the way out. Back would
                leave the screen entirely and lose a selection built by hand,
                which is not what somebody reaches for when they want to stop
                selecting. */}
            <ScreenHeader
                title={selectMode
                    ? (selection.count ? `${selection.count} selected` : 'Select transactions')
                    : 'All transactions'}
                onBack={selectMode ? exitSelectMode : () => navigation.goBack()}
                right={selectMode ? (
                    <TouchableOpacity
                        onPress={exitSelectMode}
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
                        <TouchableOpacity
                            onPress={() => setSelectMode(true)}
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
                                selectable={selectMode}
                                selected={selected.has(item.id)}
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

            {/* Pinned above the list, the same shape FlagTransactionPickerScreen
                already uses: the running total and the actions stay reachable
                without scrolling back to a header. Rendered only once something
                is selected, because an empty bar is a permanent strip of
                nothing covering the last row. */}
            {selectMode && selection.count > 0 ? (
                <View style={styles.selectionBar}>
                    <View style={styles.selectionSummary}>
                        <Text variant="bodyMed">
                            {formatSelectionTotal(selection.net)}
                        </Text>
                        <Text variant="meta" tone="muted">
                            {selection.count} selected
                            {selection.hasInflow ? ' · includes money in' : ''}
                            {atSelectionCap ? ` · max ${MAX_SELECTION}` : ''}
                        </Text>
                    </View>
                    <Button
                        title="Category"
                        variant="secondary"
                        size="sm"
                        onPress={() => setBulkCategoryOpen(true)}
                        disabled={bulkBusy}
                    />
                    <Button
                        title="Group"
                        size="sm"
                        onPress={() => { setGroupError(null); setGroupOpen(true); }}
                        disabled={bulkBusy}
                    />
                </View>
            ) : null}

            <CategoryPickerSheet
                visible={bulkCategoryOpen}
                count={selection.count}
                busy={bulkBusy}
                onSelect={applyBulkCategory}
                onClose={() => setBulkCategoryOpen(false)}
            />

            {/* The group IS a flag, so naming one looks exactly like naming a
                flag -- same sheet, same colour ramp, same icon allowlist. */}
            <FlagEditorSheet
                visible={groupOpen}
                flag={null}
                options={flagState.options}
                saving={bulkBusy}
                error={groupError}
                onSave={createGroupFromSelection}
                onClose={() => setGroupOpen(false)}
            />

            <CategoryPickerSheet
                visible={singleCategoryOpen}
                count={1}
                busy={bulkBusy}
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
