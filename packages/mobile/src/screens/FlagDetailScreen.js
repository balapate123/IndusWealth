import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Button,
    BarTrack,
    SectionTitle,
    SegmentedControl,
    StatTile,
    StatGrid,
    EmptyState,
    LoadingState,
} from '../components/ui';
import { money } from '../components/TransactionRow';
import TotalsSummary from '../components/TotalsSummary';
import FlagEditorSheet from '../components/FlagEditorSheet';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import api from '../services/api';

/**
 * What one flag adds up to, and where the money went.
 *
 * Every number here is computed server-side over every transaction carrying the
 * flag. Nothing is derived from a page of rows, so the figures do not depend on
 * how much of the list happens to be loaded.
 */

const RANGES = [
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: null, label: 'All time' },
];
const DEFAULT_RANGE = 90;

/** 'YYYY-MM' -> 'Jul 26'. Parsed as local noon to dodge the UTC day shift. */
const formatMonth = (month) => {
    const date = new Date(`${month}-01T12:00:00`);
    if (Number.isNaN(date.getTime())) return month;
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const makeStyles = () => StyleSheet.create({
    controls: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    content: { paddingBottom: 140 },
    section: { marginTop: SPACING.MEDIUM },
    bar: { marginTop: SPACING.SMALL + 2 },
    barHead: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: SPACING.SMALL,
        marginBottom: 5,
    },
    barLabel: { flexShrink: 1 },
    actions: {
        paddingHorizontal: SPACING.MEDIUM,
        marginTop: SPACING.LARGE,
        gap: SPACING.SMALL + 2,
    },
    edit: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});

/** One labelled magnitude bar. */
const Bar = ({ label, amount, count, max, color, styles }) => (
    <View style={styles.bar}>
        <View style={styles.barHead}>
            <Text variant="body" style={styles.barLabel} numberOfLines={1}>{label}</Text>
            <Text variant="num">{money(amount)}</Text>
        </View>
        <BarTrack value={Math.abs(amount)} max={max} color={color} />
        {count != null ? (
            <Text variant="meta" tone="muted">
                {count} {count === 1 ? 'transaction' : 'transactions'}
            </Text>
        ) : null}
    </View>
);

const FlagDetailScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    // The row that was tapped, so the header has a name before the fetch lands.
    const [flag, setFlag] = useState(route.params.flag);
    const [analytics, setAnalytics] = useState(null);
    const [range, setRange] = useState(DEFAULT_RANGE);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState(null);

    const tint = categoryColor(theme, flag.color_index);

    const load = useCallback(async () => {
        try {
            const response = await api.getFlagAnalytics(flag.id, range);
            if (response?.success) {
                setAnalytics(response);
                // The server echoes the flag, so a rename made elsewhere shows
                // up here without going back to the list first.
                if (response.flag) setFlag((prev) => ({ ...prev, ...response.flag }));
            }
        } catch (err) {
            console.error('Error loading flag analytics:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [flag.id, range]);

    // Refetch on focus: returning from the transaction picker means the numbers
    // have just changed.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const handleSaveFlag = async ({ name, colorIndex, icon }) => {
        setSaving(true);
        setEditorError(null);
        try {
            const response = await api.updateFlag(flag.id, { name, colorIndex, icon });
            if (response?.success) {
                setFlag((prev) => ({ ...prev, ...response.data }));
                setEditorOpen(false);
            } else {
                setEditorError(response?.message || 'Could not save that flag.');
            }
        } catch (err) {
            setEditorError(err?.message || 'Could not save that flag.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        const count = analytics?.totals?.count || 0;
        showAlert(
            `Delete "${flag.name}"?`,
            count > 0
                ? `${count} ${count === 1 ? 'transaction is' : 'transactions are'} flagged. They stay in your history — only the flag goes away.`
                : 'This flag has nothing attached to it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.deleteFlag(flag.id);
                            setEditorOpen(false);
                            navigation.goBack();
                        } catch (err) {
                            console.error('Error deleting flag:', err);
                        }
                    },
                },
            ]
        );
    };

    const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? 'All time';
    const totals = analytics?.totals;
    const count = totals?.count || 0;
    const average = count > 0 ? totals.outflow / count : 0;
    const topMerchant = analytics?.top_merchants?.[0];

    const maxOf = (rows) => Math.max(1, ...(rows || []).map((r) => Math.abs(r.amount ?? r.net ?? 0)));

    const header = (
        <>
            <ScreenHeader
                title={flag.name}
                onBack={() => navigation.goBack()}
                right={
                    <TouchableOpacity
                        style={styles.edit}
                        onPress={() => { setEditorError(null); setEditorOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel="Edit flag"
                    >
                        <Ionicons name={flag.icon} size={16} color={tint} />
                        <Text variant="label" color={theme.ACCENT}>Edit</Text>
                    </TouchableOpacity>
                }
            />
            <View style={styles.controls}>
                <SegmentedControl
                    options={RANGES}
                    value={range}
                    onChange={setRange}
                    inset={false}
                />
            </View>
        </>
    );

    if (loading) {
        return (
            <Screen header={header}>
                <LoadingState message="Loading..." />
            </Screen>
        );
    }

    return (
        <>
            <Screen header={header}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); load(); }}
                            tintColor={theme.ACCENT}
                            colors={[theme.ACCENT]}
                            progressBackgroundColor={theme.SURFACE}
                        />
                    }
                >
                    <TotalsSummary totals={totals} label={`${flag.name} · ${rangeLabel}`} />

                    {count === 0 ? (
                        <EmptyState
                            icon="pricetag-outline"
                            title="Nothing flagged yet"
                            message={range
                                ? `Nothing carries this flag in the last ${rangeLabel.toLowerCase()}. Try a longer range, or add transactions below.`
                                : 'Add the transactions that belong to this flag and their total appears here.'}
                        />
                    ) : (
                        <>
                            <StatGrid style={styles.section}>
                                <StatTile
                                    label="Transactions"
                                    value={String(count)}
                                    sub={rangeLabel}
                                />
                                <StatTile
                                    label="Average"
                                    value={money(average)}
                                    sub="per transaction"
                                />
                                <StatTile
                                    label="Spent"
                                    value={money(totals.outflow)}
                                    sub={totals.inflow > 0 ? `${money(totals.inflow)} came back` : 'nothing came back'}
                                />
                                <StatTile
                                    label="Top merchant"
                                    value={topMerchant ? money(topMerchant.amount) : '—'}
                                    sub={topMerchant?.merchant || 'none'}
                                />
                            </StatGrid>

                            {analytics.monthly?.length > 1 ? (
                                <Card style={styles.section}>
                                    <SectionTitle title="By month" />
                                    {analytics.monthly.map((row) => (
                                        <Bar
                                            key={row.month}
                                            label={formatMonth(row.month)}
                                            amount={row.net}
                                            max={maxOf(analytics.monthly)}
                                            color={tint}
                                            styles={styles}
                                        />
                                    ))}
                                </Card>
                            ) : null}

                            {analytics.categories?.length ? (
                                <Card style={styles.section}>
                                    <SectionTitle title="Where it went" />
                                    {analytics.categories.map((row) => (
                                        <Bar
                                            key={row.category}
                                            label={row.category}
                                            amount={row.amount}
                                            count={row.count}
                                            max={maxOf(analytics.categories)}
                                            color={tint}
                                            styles={styles}
                                        />
                                    ))}
                                </Card>
                            ) : null}

                            {analytics.top_merchants?.length ? (
                                <Card style={styles.section}>
                                    <SectionTitle title="Top merchants" />
                                    {analytics.top_merchants.map((row) => (
                                        <Bar
                                            key={row.merchant}
                                            label={row.merchant}
                                            amount={row.amount}
                                            count={row.count}
                                            max={maxOf(analytics.top_merchants)}
                                            color={tint}
                                            styles={styles}
                                        />
                                    ))}
                                </Card>
                            ) : null}

                            {analytics.accounts?.length > 1 ? (
                                <Card style={styles.section}>
                                    <SectionTitle title="By account" />
                                    {analytics.accounts.map((row) => (
                                        <Bar
                                            key={row.account}
                                            label={row.account}
                                            amount={row.amount}
                                            count={row.count}
                                            max={maxOf(analytics.accounts)}
                                            color={tint}
                                            styles={styles}
                                        />
                                    ))}
                                </Card>
                            ) : null}
                        </>
                    )}

                    <View style={styles.actions}>
                        <Button
                            title="Add or remove transactions"
                            icon="checkbox-outline"
                            onPress={() => navigation.navigate('FlagTransactionPicker', { flag })}
                        />
                        <Button
                            title="See them in the list"
                            variant="secondary"
                            onPress={() => navigation.navigate('AllTransactions', { flagId: flag.id })}
                        />
                    </View>
                </ScrollView>
            </Screen>

            <FlagEditorSheet
                visible={editorOpen}
                flag={flag}
                saving={saving}
                error={editorError}
                onSave={handleSaveFlag}
                onDelete={handleDelete}
                onClose={() => setEditorOpen(false)}
            />

            <CustomAlert {...alertProps} />
        </>
    );
};

export default FlagDetailScreen;
