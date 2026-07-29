import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import AccountBalanceCard from '../components/AccountBalanceCard';
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

/** null = every transaction; 'none' = only the ones carrying no flag. */
const ALL_FLAGS = null;
const UNFLAGGED = 'none';
// This screen loads a single large page rather than paginating. The server still
// returns whole-set totals, so the summary stays correct past this many rows —
// unlike the previous client-side sum, which only added up the first 100.
const PAGE_LIMIT = 500;

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
    // null = all; a flag id = that flag; 'none' = unflagged. Filtered server-side,
    // so it composes with the account filter and is correct past one page.
    const [flagFilter, setFlagFilter] = useState(ALL_FLAGS);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const flagState = useTransactionFlags();

    const formatTransactionsData = (rawTransactions) =>
        (rawTransactions || []).map((tx, index) => {
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

    const fetchTransactions = useCallback(async () => {
        // Set inside the fetcher rather than in the effect, so changing the flag
        // filter shows the loader without a synchronous setState in an effect body.
        // The header (and its chips) stay mounted; only the list area swaps.
        setLoading(true);
        try {
            // Same paginated endpoint the full list uses, scoped to this account.
            // flag_id filters server-side; totals come back for the whole set.
            const parts = [`account_id=${encodeURIComponent(account.id)}`, `limit=${PAGE_LIMIT}`];
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
    }, [account.id, flagFilter]);

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

    // One effect, matching the original: refetch when the account or the flag
    // filter changes (fetchTransactions closes over both) and refresh the
    // balance header alongside it.
    useEffect(() => {
        fetchTransactions();
        refreshAccount();
    }, [fetchTransactions, refreshAccount]);

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
            <ScreenHeader
                title={account.alias || account.name}
                onBack={() => navigation.goBack()}
                right={
                    <View style={styles.headerRight}>
                        {account.mask ? <Text variant="meta" tone="muted">••{account.mask}</Text> : null}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Flags')}
                            accessibilityRole="button"
                            accessibilityLabel="Manage flags"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="pricetags-outline" size={20} color={theme.ACCENT} />
                        </TouchableOpacity>
                    </View>
                }
            />

            <AccountBalanceCard account={account} />

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

    return (
        <>
            <Screen header={header}>
                {loading ? (
                    <LoadingState message="Loading transactions..." />
                ) : (
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
                                icon={searchQuery
                                    ? 'search-outline'
                                    : flagFilter !== ALL_FLAGS ? 'pricetag-outline' : 'receipt-outline'}
                                title={searchQuery
                                    ? 'No matches'
                                    : flagFilter !== ALL_FLAGS ? 'Nothing flagged' : 'No transactions yet'}
                                message={searchQuery
                                    ? `Nothing matched "${searchQuery}".`
                                    : activeFlag
                                        ? `Nothing here is flagged "${activeFlag.name}". Open a transaction to flag it.`
                                        : flagFilter === UNFLAGGED
                                            ? 'Everything here carries a flag.'
                                            : 'Transactions for this account will appear here.'}
                            />
                        }
                    />
                )}
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
