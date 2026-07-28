import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Input,
    Button,
    ListRow,
    SegmentedControl,
    EmptyState,
    LoadingState,
} from '../components/ui';
import { money } from '../components/TransactionRow';
import api from '../services/api';
import { categorizeTransaction } from '../utils/categorization';

/**
 * Pick the transactions that belong to a flag.
 *
 * Rows already carrying the flag arrive checked, so the screen is equally the
 * way to remove one. Everything the user changes is sent as a single diff when
 * they save — a request per checkbox would be dozens of round trips for the
 * "four roommates, one apartment" case this exists for.
 *
 * Only what the user actually unchecks is detached. A transaction outside the
 * loaded window was never shown, so it is never in the diff and cannot be
 * silently dropped from the flag by saving a narrow view.
 */

const RANGES = [
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
];
const DEFAULT_RANGE = 90;
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

const formatDate = (dateStr) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });

const makeStyles = (t) => StyleSheet.create({
    controls: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    range: { marginBottom: SPACING.SMALL + 2 },
    search: { marginBottom: 0 },
    list: { flex: 1 },
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 160,
    },
    leading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    icon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingVertical: SPACING.LARGE,
        alignItems: 'center',
    },
    // Pinned above the list so the running total and Save are reachable without
    // scrolling to the end of what can be hundreds of rows.
    bar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACING.MEDIUM,
        paddingHorizontal: SPACING.MEDIUM,
        paddingTop: SPACING.SMALL + 4,
        paddingBottom: SPACING.LARGE + SPACING.SMALL,
        backgroundColor: t.SURFACE,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    barText: { flexShrink: 1 },
    save: { minWidth: 116 },
});

const FlagTransactionPickerScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { flag } = route.params;
    const tint = categoryColor(theme, flag.color_index);

    const [transactions, setTransactions] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [range, setRange] = useState(DEFAULT_RANGE);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [saving, setSaving] = useState(false);

    // What is ticked now, and what arrived already attached. The difference
    // between the two is exactly what gets sent.
    //
    // `attached` is state rather than a ref because the footer counts the
    // pending changes against it on every render; a ref would not re-render when
    // a later page added to it, so the count could sit stale.
    const [selected, setSelected] = useState(() => new Set());
    const [attached, setAttached] = useState(() => new Set());
    const loadingMoreRef = useRef(false);

    const format = useCallback((rows) => (rows || []).map((tx, index) => {
        const categorization = categorizeTransaction(tx);
        return {
            id: tx.transaction_id || String(index),
            merchant: tx.name,
            category: categorization.category,
            categoryIcon: categorization.icon,
            categoryColorIndex: categorization.colorIndex,
            // Kept in the API's sign convention (positive = money out) so the
            // running total matches what the server will report afterwards.
            amount: Number(tx.amount) || 0,
            formattedDate: formatDate(tx.date),
            carriesFlag: !!tx.flags?.some((f) => f.id === flag.id),
        };
    }), [flag.id]);

    /** Anything arriving already attached is ticked and remembered as such. */
    const absorb = useCallback((rows) => {
        const incoming = rows.filter((tx) => tx.carriesFlag).map((tx) => tx.id);
        if (!incoming.length) return;

        const merge = (prev) => {
            const next = new Set(prev);
            incoming.forEach((id) => next.add(id));
            return next;
        };
        setAttached(merge);
        setSelected(merge);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const query = useCallback((offset) => {
        const parts = [`days=${range}`, `limit=${PAGE_SIZE}`, `offset=${offset}`];
        if (debouncedSearch) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
        return `?${parts.join('&')}`;
    }, [range, debouncedSearch]);

    const loadFirstPage = useCallback(async () => {
        try {
            const response = await api.getTransactions(query(0));
            if (response?.success) {
                const rows = format(response.data);
                setTransactions(rows);
                setHasMore(!!response.pagination?.hasMore);
                absorb(rows);
            }
        } catch (err) {
            console.error('Error loading transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [query, format, absorb]);

    const loadMore = useCallback(async () => {
        if (loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const response = await api.getTransactions(query(transactions.length));
            if (response?.success) {
                const rows = format(response.data);
                setTransactions((prev) => {
                    const seen = new Set(prev.map((tx) => tx.id));
                    return [...prev, ...rows.filter((tx) => !seen.has(tx.id))];
                });
                setHasMore(!!response.pagination?.hasMore);
                absorb(rows);
            }
        } catch (err) {
            console.error('Error loading more transactions:', err);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [hasMore, query, transactions.length, format, absorb]);

    // Changing the range or the search restarts the list. Ticks are kept: a
    // selection made under one filter must survive changing the filter, or
    // building a flag across two searches would be impossible.
    useEffect(() => {
        setLoading(true);
        setTransactions([]);
        setHasMore(false);
        loadFirstPage();
    }, [loadFirstPage]);

    const toggle = useCallback((id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const handleSave = async () => {
        const add = [...selected].filter((id) => !attached.has(id));
        const remove = [...attached].filter((id) => !selected.has(id));

        if (!add.length && !remove.length) {
            navigation.goBack();
            return;
        }

        setSaving(true);
        try {
            await api.setFlagTransactions(flag.id, { add, remove });
            navigation.goBack();
        } catch (err) {
            console.error('Error saving flag assignments:', err);
            setSaving(false);
        }
    };

    // Sums the ticked rows this screen has actually loaded. Labelled as the
    // selection, not as the flag's total — the flag's own screen has that, over
    // everything attached rather than everything on screen.
    const selectionNet = transactions.reduce(
        (sum, tx) => (selected.has(tx.id) ? sum + tx.amount : sum),
        0
    );

    const changeCount =
        [...selected].filter((id) => !attached.has(id)).length +
        [...attached].filter((id) => !selected.has(id)).length;

    const header = (
        <>
            <ScreenHeader
                title={`Flag as ${flag.name}`}
                onBack={() => navigation.goBack()}
                right={
                    <Text variant="meta" tone="muted">
                        {selected.size} selected
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
        <Screen header={header}>
            {loading ? (
                <LoadingState message="Loading transactions..." />
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item, index }) => {
                        const checked = selected.has(item.id);
                        const categoryTint = categoryColor(theme, item.categoryColorIndex);
                        return (
                            <ListRow
                                divider={index > 0}
                                onPress={() => toggle(item.id)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                                leading={
                                    <View style={styles.leading}>
                                        <Ionicons
                                            name={checked ? 'checkbox' : 'square-outline'}
                                            size={22}
                                            color={checked ? tint : theme.TEXT_MUTED}
                                        />
                                        <View style={[styles.icon, { backgroundColor: alpha(categoryTint, 0.16) }]}>
                                            <Ionicons name={item.categoryIcon} size={16} color={categoryTint} />
                                        </View>
                                    </View>
                                }
                                title={item.merchant}
                                subtitle={`${item.category} · ${item.formattedDate}`}
                                value={`${item.amount > 0 ? '−' : '+'}${money(item.amount)}`}
                                valueTone={item.amount > 0 ? 'primary' : 'success'}
                            />
                        );
                    }}
                    ListFooterComponent={
                        loadingMore ? (
                            <View style={styles.footer}>
                                <ActivityIndicator size="small" color={theme.ACCENT} />
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        <EmptyState
                            icon={debouncedSearch ? 'search-outline' : 'receipt-outline'}
                            title={debouncedSearch ? 'No matches' : 'No transactions'}
                            message={debouncedSearch
                                ? `Nothing matched "${debouncedSearch}".`
                                : 'Nothing in this range. Try a longer one.'}
                        />
                    }
                />
            )}

            <View style={styles.bar}>
                <View style={styles.barText}>
                    <Text variant="h2" numberOfLines={1}>{money(selectionNet)}</Text>
                    <Text variant="meta" tone="muted" numberOfLines={1}>
                        {selected.size} selected
                        {changeCount > 0 ? ` · ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : ''}
                    </Text>
                </View>
                <Button
                    title={changeCount > 0 ? 'Save' : 'Done'}
                    onPress={handleSave}
                    loading={saving}
                    style={styles.save}
                />
            </View>
        </Screen>
    );
};

export default FlagTransactionPickerScreen;
