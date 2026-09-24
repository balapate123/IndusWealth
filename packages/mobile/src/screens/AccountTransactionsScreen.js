import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Input,
    Chip,
    ChipRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import CategoryPickerSheet from '../components/CategoryPickerSheet';
import TransactionSelectionBar from '../components/TransactionSelectionBar';
import TransactionFilterSheet from '../components/TransactionFilterSheet';
import TransactionFilterButton from '../components/TransactionFilterButton';
import AccountBalanceCard from '../components/AccountBalanceCard';
import useTransactionFlags from '../hooks/useTransactionFlags';
import useTransactionSelection from '../hooks/useTransactionSelection';
import api from '../services/api';
import { categorizeTransaction } from '../utils/categorization';
import {
    EMPTY_FILTERS,
    activeFilterCount,
    describeFilters,
    filterQueryParts,
} from '../utils/transactionFilters';

const formatDate = (dateStr) => {
    // Add T12:00:00 to prevent timezone shift
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const formatCurrency = (amount) =>
    `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** null = every transaction; 'none' = only the ones carrying no flag. */
const ALL_FLAGS = null;
const UNFLAGGED = 'none';
// This screen loads a single large page rather than paginating. The server still
// returns whole-set totals, so the summary stays correct past this many rows —
// unlike the previous client-side sum, which only added up the first 100.
const PAGE_LIMIT = 500;
// Matches the full list. Search runs on the server here too, so each keystroke
// would otherwise be a round trip.
const SEARCH_DEBOUNCE_MS = 350;

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
    totalsScope: {
        marginTop: SPACING.SMALL + 2,
        paddingTop: SPACING.SMALL,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
    },
    search: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    flagRow: { marginBottom: SPACING.SMALL },
    list: { flex: 1 },
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
});

const AccountTransactionsScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // The account arrives as a snapshot from whichever screen linked here, which
    // may itself have painted from cache. Kept in state so it can be refreshed
    // against the server — an older cached copy also predates the credit fields.
    const [account, setAccount] = useState(route.params.account);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    // Income/expenses come from the server over the whole filtered set, not from
    // summing the rows on screen — the device only holds one page.
    const [totals, setTotals] = useState({ income: 0, expenses: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // null = all; a flag id = that flag; 'none' = unflagged. Filtered server-side,
    // so it composes with the account filter and is correct past one page.
    const [flagFilter, setFlagFilter] = useState(ALL_FLAGS);
    // Amount, date range and direction, applied together from the sheet.
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    // The correction sheet for one transaction, opened from the detail sheet.
    // Separate state and a separate busy flag from the selection's, so closing
    // either cannot leave the other half-open over a row it was not about.
    const [singleCategoryOpen, setSingleCategoryOpen] = useState(false);
    const [singleBusy, setSingleBusy] = useState(false);

    const flagState = useTransactionFlags();

    const formatTransactionsData = (rawTransactions) =>
        (rawTransactions || []).map((tx, index) => {
            const categorization = categorizeTransaction(tx);
            return {
                id: tx.transaction_id || index,
                merchant: tx.name,
                category: categorization.category,
                // Carried through so the detail sheet can mark a corrected row
                // and offer the undo, and so the picker can name the merchant.
                // Dropping them here is how a feature ends up working on the
                // server and doing nothing on screen -- which is exactly what
                // happened to the category correction on this screen.
                user_category: tx.user_category ?? null,
                merchantLabel: tx.merchantLabel ?? null,
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

    // Debounce typing so each keystroke is not a round trip. Search moved to the
    // server when the amount and date filters arrived: the Income/Expenses card
    // is computed by db.sumTransactions over everything that matches, so an
    // in-memory search left that card describing the unsearched set — a total
    // and a list that disagree, which is the one thing this screen must not do.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchTransactions = useCallback(async () => {
        // Set inside the fetcher rather than in the effect, so changing the flag
        // filter shows the loader without a synchronous setState in an effect body.
        // The header (and its chips) stay mounted; only the list area swaps.
        setLoading(true);
        try {
            // Same paginated endpoint the full list uses, scoped to this account.
            // Every filter is server-side, so all of them compose with the
            // account scope and all of them are reflected in the totals.
            const parts = [
                `account_id=${encodeURIComponent(account.id)}`,
                `limit=${PAGE_LIMIT}`,
                // No `days` on this screen: there is no preset range control
                // here, so the default window is everything, as it always was.
                ...filterQueryParts(filters),
            ];
            if (debouncedSearch) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
            if (flagFilter !== ALL_FLAGS) parts.push(`flag_id=${encodeURIComponent(flagFilter)}`);
            const data = await api.getTransactions(`?${parts.join('&')}`);

            if (data?.success) {
                setTransactions(formatTransactionsData(data.data));
                // inflow = money in (income); outflow = money out (expenses).
                setTotals({
                    income: data.totals?.inflow ?? 0,
                    expenses: data.totals?.outflow ?? 0,
                });
            }
        } catch (err) {
            console.error('Error fetching account transactions:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [account.id, flagFilter, debouncedSearch, filters]);

    /** Pull this account's balances again, so the header is not a stale snapshot. */
    const refreshAccount = useCallback(async () => {
        try {
            const data = await api.getAccounts();
            if (!data?.success) return;
            const fresh = (data.accounts || []).find((a) => a.id === account.id);
            if (fresh) setAccount((prev) => ({ ...prev, ...fresh }));
        } catch (err) {
            console.error('Error refreshing account:', err);
        }
    }, [account.id]);

    // -----------------------------------------------------------------------
    // Selection
    // -----------------------------------------------------------------------

    // `transactions` IS the visible list now. It was not while search ran in
    // memory -- the hook had to be handed `filteredTransactions`, or the bar
    // read "5 selected" over a total covering rows nobody could see. Moving
    // search to the server removed the distinction rather than managing it.
    //
    // Declared above the effect below, which depends on `clearSelection`:
    // the other order is a temporal dead zone, which is a crash on mount.
    const selection = useTransactionSelection({
        rows: transactions,
        onChanged: fetchTransactions,
        onFlagsChanged: flagState.reload,
    });

    // Stable (useCallback with no deps), so depending on the clear itself
    // rather than on the whole selection object keeps the effect from firing
    // on every tick and wiping the list mid-scroll.
    const { clear: clearSelection } = selection;

    // One effect: refetch when anything the query depends on changes
    // (fetchTransactions closes over all of it) and refresh the balance header
    // alongside it.
    useEffect(() => {
        // The selection goes with it. Keeping it would leave a total counting
        // rows that are no longer on screen. This used to need its own effect
        // keyed on the search text, because the filtering never left the
        // device; now it falls out of the refetch, exactly as on the full list.
        // Selection mode itself stays on — filter, then select, is the useful
        // order.
        clearSelection();
        fetchTransactions();
        refreshAccount();
    }, [fetchTransactions, refreshAccount, clearSelection]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTransactions();
        refreshAccount();
    }, [fetchTransactions, refreshAccount]);

    /**
     * Whether a row still belongs under the active flag filter. Used after a tag
     * change to drop a row that no longer qualifies rather than leaving it under
     * a filter it no longer matches.
     */
    const matchesFlagFilter = useCallback((tx) => {
        if (flagFilter === ALL_FLAGS) return true;
        if (flagFilter === UNFLAGGED) return !tx.flags?.length;
        return !!tx.flags?.some((f) => f.id === flagFilter);
    }, [flagFilter]);

    const applyFilters = (next) => {
        setFilters(next);
        setFilterOpen(false);
    };

    const filterSummary = describeFilters(filters);
    const filterCount = activeFilterCount(filters);

    const onRowPress = (item) => {
        if (!selection.selectMode) {
            openTransactionDetails(item);
            return;
        }
        selection.toggle(item.id);
    };

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setEditNotes(item.notes || '');
        flagState.openFor(item);
        setShowTransactionModal(true);
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
            fetchTransactions();
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
            fetchTransactions();
        } catch (error) {
            console.error('Error removing a category correction:', error);
        } finally {
            setSingleBusy(false);
        }
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

            // Removing the very flag being filtered on leaves a row that no longer
            // belongs, and the totals behind it move too — so refetch rather than
            // patch. Any other edit cannot change membership; patch in place then.
            if (!matchesFlagFilter(updated)) {
                setShowTransactionModal(false);
                fetchTransactions();
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

    const header = (
        <>
            {/* While selecting, the header becomes the way out. Back would
                leave the screen entirely and lose a selection built by hand,
                which is not what somebody reaches for when they want to stop
                selecting. */}
            <ScreenHeader
                title={selection.selectMode
                    ? (selection.summary.count ? `${selection.summary.count} selected` : 'Select transactions')
                    : (account.alias || account.name)}
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
                        {account.mask ? <Text variant="meta" tone="muted">••{account.mask}</Text> : null}
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

            {/* The analytics entry point rides on the balance card rather than
                becoming a fourth header icon: the header already carries the
                mask, Select and Flags, and an unlabelled glyph in a crowded row
                is not something anybody finds. */}
            <AccountBalanceCard
                account={account}
                onOpenAnalytics={() => navigation.navigate('AdvancedAnalytics', { account })}
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

                {/* These figures come from the server over everything the
                    filter matches, so when a filter is on they are about that
                    subset -- and it has to say so. Two big numbers under an
                    account's name, silently describing a slice of it, is a
                    wrong answer with no visible working. */}
                {filterCount || debouncedSearch ? (
                    <Text variant="meta" tone="muted" style={styles.totalsScope} numberOfLines={2}>
                        {[
                            debouncedSearch ? `matching "${debouncedSearch}"` : null,
                            filterSummary,
                        ].filter(Boolean).join(' · ')}
                    </Text>
                ) : null}
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

            {/* Same flag affordance as the full transaction list: a chip per flag
                plus Unflagged, so an account can be sliced by flag right here. */}
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
        </>
    );

    const activeFlag = flagState.flags.find((f) => f.id === flagFilter);
    const filterNote = filterCount ? ` Filtered to ${filterSummary}.` : '';

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
                                icon={debouncedSearch
                                    ? 'search-outline'
                                    : filterCount ? 'filter-outline'
                                        : flagFilter !== ALL_FLAGS ? 'pricetag-outline' : 'receipt-outline'}
                                title={debouncedSearch
                                    ? 'No matches'
                                    : flagFilter !== ALL_FLAGS ? 'Nothing flagged' : 'No transactions yet'}
                                message={debouncedSearch
                                    ? `Nothing matched "${debouncedSearch}".${filterNote}`
                                    : activeFlag
                                        ? `Nothing here is flagged "${activeFlag.name}".${filterNote} Open a transaction to flag it.`
                                        : flagFilter === UNFLAGGED
                                            ? `Everything here carries a flag.${filterNote}`
                                            : filterCount
                                                // Never "no transactions yet" while a filter is on: that
                                                // says the account is empty when it is only narrowed.
                                                ? `Nothing on this account matches ${filterSummary}.`
                                                : 'Transactions for this account will appear here.'}
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
                accountName={account.alias || account.name}
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

export default AccountTransactionsScreen;
