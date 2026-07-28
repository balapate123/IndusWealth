import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    ChangeBadge,
    Chip,
    ChipRow,
    BarTrack,
    SectionTitle,
    Overline,
    StatTile,
    StatGrid,
    EmptyState,
    LoadingState,
} from '../components/ui';
import { getCategoryMeta } from '../utils/categorization';
import api from '../services/api';

const TIME_PERIODS = [
    { label: '7D', value: 7 },
    { label: '30D', value: 30 },
    { label: '90D', value: 90 },
    { label: 'YTD', value: 365 },
];

const formatCurrency = (amount) => {
    const num = parseFloat(amount || 0);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) {
        return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${num.toFixed(2)}`;
};

const formatCompact = (amount) => {
    const num = parseFloat(amount || 0);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
    return `$${num.toFixed(0)}`;
};

const formatMonthLabel = (monthKey) => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

const formatDate = (dateStr) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });

/**
 * Resolve a category's identity colour through the validated ramp rather than
 * the hex the API happens to send, so both themes stay consistent.
 */
const colorForCategory = (theme, name) => categoryColor(theme, getCategoryMeta(name).colorIndex);

/**
 * Insight types get a stable ramp slot from their own name. Hashing the type —
 * not its position in the list — is what keeps a type the same colour when the
 * set of insights changes.
 */
const colorForInsightType = (theme, type) => {
    if (!type) return theme.ACCENT;
    let hash = 0;
    for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) % 997;
    return categoryColor(theme, hash % theme.CATEGORIES.length);
};

const makeStyles = (t) => StyleSheet.create({
    scrollContent: { paddingBottom: 110 },

    periodRow: {
        flexDirection: 'row',
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.PILL,
        padding: 4,
    },
    periodButton: {
        flex: 1,
        paddingVertical: SPACING.SMALL,
        alignItems: 'center',
        borderRadius: RADIUS.PILL,
    },
    periodActive: { backgroundColor: t.ACCENT },

    heroSub: { marginTop: 4 },
    heroRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },

    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: RADIUS.SMALL,
        backgroundColor: t.ACCENT_DIM,
    },

    insightRow: { paddingHorizontal: SPACING.MEDIUM, gap: SPACING.SMALL },
    insightCard: {
        width: 240,
        padding: SPACING.MEDIUM,
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.LARGE,
        borderLeftWidth: 3,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        ...t.ELEVATION.CARD,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: 6,
    },
    insightIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },

    leaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: SPACING.SMALL + 2,
        gap: SPACING.SMALL,
    },
    leaderIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    leaderInfo: { flex: 1 },
    leaderTopLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
        gap: SPACING.SMALL,
    },
    leaderAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    leaderMeta: { marginTop: 4 },

    dowChart: { flexDirection: 'row', alignItems: 'flex-end' },
    dowColumn: { flex: 1, alignItems: 'center' },
    dowBarArea: { height: 90, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
    dowBar: { width: '55%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    dowLabel: { marginTop: 6 },

    legendRow: { flexDirection: 'row', gap: SPACING.MEDIUM, marginTop: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    trendChart: { flexDirection: 'row', alignItems: 'flex-end' },
    trendColumn: { flex: 1, alignItems: 'center' },
    trendBarGroup: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2 },
    trendBar: { width: 11, borderTopLeftRadius: 4, borderTopRightRadius: 4 },

    bucketRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.SMALL + 2, gap: SPACING.SMALL },
    bucketLabel: { width: 80 },
    bucketValue: { width: 78, textAlign: 'right' },

    merchantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 2,
        gap: SPACING.SMALL,
    },
    merchantDivider: { borderTopWidth: 1, borderTopColor: t.HAIRLINE },
    merchantRank: { width: 20 },
    merchantInfo: { flex: 1 },

    heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.SMALL,
    },
    heroTitleBlock: { flex: 1 },
    heroAmount: { marginTop: SPACING.MEDIUM },
    heroStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatDivider: { width: 1, height: 24, backgroundColor: t.HAIRLINE },

    splitBar: { flexDirection: 'row', height: 20, marginTop: SPACING.MEDIUM, marginBottom: SPACING.SMALL },
    splitSegment: { height: '100%' },
    splitLeft: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, marginRight: 2 },
    splitRight: { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
    splitLegend: { gap: 4 },

    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 2,
        gap: SPACING.SMALL,
    },
    txIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    txInfo: { flex: 1 },
    txAmountBlock: { alignItems: 'flex-end' },
});

// ---------------------------------------------------------------- sub-views

const InsightCard = ({ insight }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const tint = insight.color || colorForInsightType(theme, insight.type);

    return (
        <View style={[styles.insightCard, { borderLeftColor: tint }]}>
            <View style={styles.insightHeader}>
                <View style={[styles.insightIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons name={insight.icon || 'bulb'} size={14} color={tint} />
                </View>
                <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{insight.title}</Text>
            </View>
            <Text variant="meta" tone="secondary">{insight.description}</Text>
        </View>
    );
};

const CategoryLeaderboard = ({ categories, onSelect }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    if (categories.length === 0) return null;
    const maxTotal = categories[0].total || 1;

    return (
        <Card>
            <SectionTitle title="Category leaderboard" subtitle="Tap a category to drill down" />
            {categories.map((cat) => {
                const tint = colorForCategory(theme, cat.name);
                return (
                    <TouchableOpacity
                        key={cat.name}
                        style={styles.leaderRow}
                        onPress={() => onSelect(cat.name)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.leaderIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                            <Ionicons name={cat.icon || 'wallet-outline'} size={15} color={tint} />
                        </View>
                        <View style={styles.leaderInfo}>
                            <View style={styles.leaderTopLine}>
                                <Text variant="bodyMed" style={{ flex: 1 }} numberOfLines={1}>{cat.name}</Text>
                                <View style={styles.leaderAmountRow}>
                                    <ChangeBadge percent={cat.changePercent} goodWhenUp={false} />
                                    <Text variant="num">{formatCurrency(cat.total)}</Text>
                                </View>
                            </View>
                            <BarTrack value={cat.total} max={maxTotal} color={tint} />
                            <Text variant="meta" tone="muted" style={styles.leaderMeta}>
                                {cat.count} txns · avg {formatCurrency(cat.avgTransaction)} · {cat.percentage.toFixed(1)}% of spend
                            </Text>
                        </View>
                    </TouchableOpacity>
                );
            })}
        </Card>
    );
};

const DayOfWeekChart = ({ dayOfWeek }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [selectedDay, setSelectedDay] = useState(null);
    const maxAmount = Math.max(...dayOfWeek.map((d) => d.amount), 1);
    const selected = selectedDay !== null ? dayOfWeek[selectedDay] : null;

    return (
        <Card>
            <SectionTitle
                title="Spending by day of week"
                subtitle={selected
                    ? `${selected.day}: ${formatCurrency(selected.amount)} across ${selected.count} transaction${selected.count === 1 ? '' : 's'}`
                    : 'Tap a bar for details'}
            />
            <View style={styles.dowChart}>
                {dayOfWeek.map((d, index) => {
                    const isActive = selectedDay === index;
                    const dimmed = selectedDay !== null && !isActive;
                    return (
                        <TouchableOpacity
                            key={d.day}
                            style={styles.dowColumn}
                            onPress={() => setSelectedDay(isActive ? null : index)}
                            activeOpacity={0.7}
                        >
                            <Text variant="meta" tone="muted">{formatCompact(d.amount)}</Text>
                            <View style={styles.dowBarArea}>
                                <View style={[styles.dowBar, {
                                    height: Math.max((d.amount / maxAmount) * 90, 3),
                                    backgroundColor: isActive ? theme.ACCENT_LIGHT : theme.ACCENT,
                                    opacity: dimmed ? 0.35 : 1,
                                }]} />
                            </View>
                            <Text
                                variant="meta"
                                tone={isActive ? 'primary' : 'muted'}
                                style={styles.dowLabel}
                            >
                                {d.day}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </Card>
    );
};

const MonthlyTrendChart = ({ monthlyTrend }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const maxValue = Math.max(...monthlyTrend.map((m) => Math.max(m.spending, m.income)), 1);
    const selected = selectedMonth !== null ? monthlyTrend[selectedMonth] : null;

    const spendingColor = theme.ACCENT;
    const incomeColor = categoryColor(theme, 0);

    return (
        <Card>
            <SectionTitle
                title="6-month trend"
                subtitle={selected
                    ? `${formatMonthLabel(selected.month)}: spent ${formatCurrency(selected.spending)} · income ${formatCurrency(selected.income)}`
                    : 'Tap a month for details'}
                spaced={false}
            />
            <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: spendingColor }]} />
                    <Text variant="meta" tone="secondary">Spending</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: incomeColor }]} />
                    <Text variant="meta" tone="secondary">Income</Text>
                </View>
            </View>
            <View style={[styles.trendChart, { marginTop: SPACING.MEDIUM }]}>
                {monthlyTrend.map((m, index) => {
                    const isActive = selectedMonth === index;
                    const dimmed = selectedMonth !== null && !isActive;
                    return (
                        <TouchableOpacity
                            key={m.month}
                            style={styles.trendColumn}
                            onPress={() => setSelectedMonth(isActive ? null : index)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.trendBarGroup, dimmed && { opacity: 0.35 }]}>
                                <View style={[styles.trendBar, {
                                    height: Math.max((m.spending / maxValue) * 100, 3),
                                    backgroundColor: spendingColor,
                                }]} />
                                <View style={[styles.trendBar, {
                                    height: Math.max((m.income / maxValue) * 100, 3),
                                    backgroundColor: incomeColor,
                                }]} />
                            </View>
                            <Text
                                variant="meta"
                                tone={isActive ? 'primary' : 'muted'}
                                style={styles.dowLabel}
                            >
                                {formatMonthLabel(m.month)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </Card>
    );
};

const SizeHistogram = ({ sizeBuckets }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const maxCount = Math.max(...sizeBuckets.map((b) => b.count), 1);

    return (
        <Card>
            <SectionTitle title="Transaction sizes" subtitle="Where your purchases cluster" />
            {sizeBuckets.map((bucket) => (
                <View key={bucket.label} style={styles.bucketRow}>
                    <Text variant="meta" tone="secondary" style={styles.bucketLabel}>{bucket.label}</Text>
                    <View style={{ flex: 1 }}>
                        <BarTrack value={bucket.count} max={maxCount} color={categoryColor(theme, 0)} />
                    </View>
                    <Text variant="meta" tone="muted" style={styles.bucketValue}>
                        {bucket.count} · {formatCompact(bucket.total)}
                    </Text>
                </View>
            ))}
        </Card>
    );
};

const MerchantList = ({ title, merchants, showCategory }) => {
    const styles = useThemedStyles(makeStyles);
    if (!merchants || merchants.length === 0) return null;

    return (
        <Card>
            <SectionTitle title={title} />
            {merchants.map((m, index) => (
                <View
                    key={`${m.name}-${index}`}
                    style={[styles.merchantRow, index > 0 && styles.merchantDivider]}
                >
                    <Text variant="num" tone="accent" style={styles.merchantRank}>{index + 1}</Text>
                    <View style={styles.merchantInfo}>
                        <Text variant="bodyMed" numberOfLines={1}>{m.name}</Text>
                        <Text variant="meta" tone="muted">
                            {m.count} txn{m.count === 1 ? '' : 's'} · avg {formatCurrency(m.avg)}
                            {showCategory && m.category ? ` · ${m.category}` : ''}
                        </Text>
                    </View>
                    <Text variant="num">{formatCurrency(m.total)}</Text>
                </View>
            ))}
        </Card>
    );
};

const CategoryHero = ({ category }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const tint = colorForCategory(theme, category.name);

    return (
        <Card style={{ borderColor: alpha(tint, 0.35), borderWidth: 1 }}>
            <View style={styles.heroHeader}>
                <View style={[styles.heroIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons name={category.icon || 'wallet-outline'} size={22} color={tint} />
                </View>
                <View style={styles.heroTitleBlock}>
                    <Text variant="h2">{category.name}</Text>
                    <Text variant="meta" tone="muted">
                        {category.percentage.toFixed(1)}% of total spending
                    </Text>
                </View>
                <ChangeBadge percent={category.changePercent} goodWhenUp={false} />
            </View>

            <Text variant="hero" style={styles.heroAmount}>{formatCurrency(category.total)}</Text>
            {category.prevTotal > 0 && (
                <Text variant="meta" tone="muted">
                    vs {formatCurrency(category.prevTotal)} previous period
                    {category.changeAmount !== 0
                        ? ` (${category.changeAmount > 0 ? '+' : '−'}${formatCurrency(Math.abs(category.changeAmount))})`
                        : ''}
                </Text>
            )}

            <View style={styles.heroStatsRow}>
                {[
                    { value: `${category.count}`, label: 'Txns' },
                    { value: formatCurrency(category.avgTransaction), label: 'Average' },
                    { value: formatCurrency(category.minTransaction), label: 'Smallest' },
                    { value: formatCurrency(category.maxTransaction), label: 'Largest' },
                ].map((stat, index) => (
                    <React.Fragment key={stat.label}>
                        {index > 0 && <View style={styles.heroStatDivider} />}
                        <View style={styles.heroStat}>
                            <Text variant="num">{stat.value}</Text>
                            <Text variant="meta" tone="muted">{stat.label}</Text>
                        </View>
                    </React.Fragment>
                ))}
            </View>
        </Card>
    );
};

const CategoryTrendChart = ({ category }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const trend = category.monthlyTrend || [];
    if (trend.length === 0) return null;
    const maxAmount = Math.max(...trend.map((m) => m.amount), 1);
    const tint = colorForCategory(theme, category.name);

    return (
        <Card>
            <SectionTitle title="6-month trend" />
            <View style={styles.dowChart}>
                {trend.map((m) => (
                    <View key={m.month} style={styles.dowColumn}>
                        <Text variant="meta" tone="muted">{formatCompact(m.amount)}</Text>
                        <View style={styles.dowBarArea}>
                            <View style={[styles.dowBar, {
                                height: Math.max((m.amount / maxAmount) * 90, 3),
                                backgroundColor: tint,
                            }]} />
                        </View>
                        <Text variant="meta" tone="muted" style={styles.dowLabel}>
                            {formatMonthLabel(m.month)}
                        </Text>
                    </View>
                ))}
            </View>
        </Card>
    );
};

const WeekdaySplit = ({ category }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const total = category.weekdayTotal + category.weekendTotal;
    if (total <= 0) return null;
    const weekdayPct = Math.round((category.weekdayTotal / total) * 100);
    const tint = colorForCategory(theme, category.name);

    return (
        <Card>
            <SectionTitle title="Weekday vs weekend" spaced={false} />
            <View style={styles.splitBar}>
                {category.weekdayTotal > 0 && (
                    <View style={[styles.splitSegment, styles.splitLeft, { flex: category.weekdayTotal, backgroundColor: tint }]} />
                )}
                {category.weekendTotal > 0 && (
                    <View style={[styles.splitSegment, styles.splitRight, { flex: category.weekendTotal, backgroundColor: alpha(tint, 0.45) }]} />
                )}
            </View>
            <View style={styles.splitLegend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: tint }]} />
                    <Text variant="meta" tone="secondary">
                        Weekday · {formatCurrency(category.weekdayTotal)} ({weekdayPct}%)
                    </Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: alpha(tint, 0.45) }]} />
                    <Text variant="meta" tone="secondary">
                        Weekend · {formatCurrency(category.weekendTotal)} ({100 - weekdayPct}%)
                    </Text>
                </View>
            </View>
        </Card>
    );
};

const CategoryTransactions = ({ category }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const transactions = category.transactions || [];
    const tint = colorForCategory(theme, category.name);

    return (
        <Card>
            <SectionTitle
                title="Transactions"
                subtitle={transactions.length === 100
                    ? 'Showing the 100 most recent'
                    : `${transactions.length} in this period`}
            />
            {transactions.length === 0 ? (
                <EmptyState icon="document-text-outline" message="No transactions in this period" />
            ) : (
                transactions.map((tx, index) => (
                    <View
                        key={tx.transaction_id || tx.id || `tx-${index}`}
                        style={[styles.txRow, index > 0 && styles.merchantDivider]}
                    >
                        <View style={[styles.txIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                            <Ionicons name={category.icon || 'receipt-outline'} size={15} color={tint} />
                        </View>
                        <View style={styles.txInfo}>
                            <Text variant="body" numberOfLines={1}>{tx.merchant_name || tx.name}</Text>
                            <Text variant="meta" tone="muted" numberOfLines={1}>
                                {formatDate(tx.date)}{tx.account_name ? ` · ${tx.account_name}` : ''}
                            </Text>
                        </View>
                        <View style={styles.txAmountBlock}>
                            <Text variant="num" tone="danger">−{formatCurrency(tx.amount)}</Text>
                            {tx.pending ? <Text variant="meta" tone="accent">Pending</Text> : null}
                        </View>
                    </View>
                ))
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- screen

const AdvancedAnalyticsScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // Rendered both as a tab ("AnalyticsTab") and as a pushed stack screen
    // ("AdvancedAnalytics"). Only the pushed one has somewhere to go back to.
    const isTab = route?.name === 'AnalyticsTab';

    const [data, setData] = useState(null);
    const [aiInsights, setAiInsights] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [selectedCategoryName, setSelectedCategoryName] = useState(null);

    // Mirror of `data` readable inside async closures without being a fetchData
    // dependency, so the catch handler can tell "initial load" from "refresh".
    const dataRef = useRef(null);
    useEffect(() => { dataRef.current = data; }, [data]);

    const fetchData = useCallback(async (forceRefresh = false) => {
        try {
            setError(null);
            // Pull-to-refresh asks Plaid for a fresh sync first. Best-effort: the
            // backend enforces a 10-min cooldown and returns 429, and the network
            // can fail — but the category analytics below reads from the server
            // cache and stays valid regardless, so a sync failure must NOT abort
            // the load or blank the screen.
            if (forceRefresh) {
                try {
                    await api.getTransactions('?refresh=true&limit=100');
                } catch (syncErr) {
                    console.warn(
                        'Transaction sync skipped during refresh:',
                        syncErr?.parsedError?.message || syncErr?.message
                    );
                }
            }
            const response = await api.getCategoryAnalytics(selectedPeriod);
            if (response?.success) {
                setData(response);
            }

            // Upgrade rule-based insights to AI ones in the background — the
            // screen stays fully usable if this never resolves
            setAiInsights(null);
            api.getCategoryAIInsights(selectedPeriod, forceRefresh)
                .then((aiResponse) => {
                    if (aiResponse?.success && aiResponse.source === 'ai'
                        && Array.isArray(aiResponse.insights) && aiResponse.insights.length > 0) {
                        setAiInsights(aiResponse.insights);
                    }
                })
                .catch(() => { /* keep rule-based insights */ });
        } catch (err) {
            console.error('Error fetching category analytics:', err);
            // Only surface a full-screen error on the initial load. If we already
            // have data, keep showing that rather than wiping the page.
            if (!dataRef.current) {
                setError(err.parsedError?.message || 'Unable to load analytics. Pull down to retry.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedPeriod]);

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData(true);
    }, [fetchData]);

    const categories = data?.categories || [];
    const selectedCategory = useMemo(
        () => categories.find((c) => c.name === selectedCategoryName) || null,
        [categories, selectedCategoryName]
    );

    const summary = data?.summary;
    const hasData = summary && summary.expenseCount > 0;

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Crunching your numbers..." />
            </Screen>
        );
    }

    const header = (
        <ScreenHeader
            title={isTab ? 'Analytics' : 'Advanced Analytics'}
            onBack={isTab ? undefined : () => navigation.goBack()}
        />
    );

    return (
        <Screen
            scroll
            header={header}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.scrollContent}
        >
            {/* Period */}
            <View style={styles.periodRow}>
                {TIME_PERIODS.map((period) => {
                    const active = selectedPeriod === period.value;
                    return (
                        <TouchableOpacity
                            key={period.value}
                            style={[styles.periodButton, active && styles.periodActive]}
                            onPress={() => {
                                if (!active) {
                                    setSelectedPeriod(period.value);
                                    setLoading(true);
                                }
                            }}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                        >
                            <Text variant="label" tone={active ? 'onAccent' : 'muted'}>{period.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {error ? (
                <Card>
                    <EmptyState icon="cloud-offline-outline" message={error} />
                </Card>
            ) : !hasData ? (
                <Card>
                    <EmptyState
                        icon="analytics-outline"
                        message="No spending found in this period. Try a longer time range or pull down to sync."
                    />
                </Card>
            ) : (
                <>
                    <Card>
                        <View style={styles.heroRow}>
                            <Text variant="overline" tone="muted">Total spent</Text>
                            <ChangeBadge percent={summary.spendChangePercent} goodWhenUp={false} />
                        </View>
                        <Text variant="hero">{formatCurrency(summary.totalSpend)}</Text>
                        <Text variant="body" tone="secondary" style={styles.heroSub}>
                            Income {formatCurrency(summary.totalIncome)} · Net{' '}
                            <Text
                                variant="body"
                                tone={summary.netCashFlow >= 0 ? 'success' : 'danger'}
                            >
                                {summary.netCashFlow >= 0 ? '+' : '−'}{formatCurrency(Math.abs(summary.netCashFlow))}
                            </Text>
                        </Text>
                    </Card>

                    <StatGrid>
                        <StatTile label="Daily average" value={formatCurrency(summary.avgDailySpend)} />
                        <StatTile
                            label="Avg transaction"
                            value={formatCurrency(summary.avgTransaction)}
                            sub={`${summary.expenseCount} purchases`}
                        />
                        <StatTile
                            label="Largest purchase"
                            value={formatCurrency(summary.largestExpense?.amount || 0)}
                            sub={summary.largestExpense?.name}
                        />
                        <StatTile
                            label="Active categories"
                            value={`${summary.activeCategories}`}
                            sub={`${Math.round((summary.weekendSpend / (summary.totalSpend || 1)) * 100)}% on weekends`}
                        />
                    </StatGrid>

                    {/* Smart insights — rule-based instantly, upgraded to AI when ready */}
                    {(aiInsights || data.insights)?.length > 0 && (
                        <>
                            <Overline
                                right={aiInsights ? (
                                    <View style={styles.aiBadge}>
                                        <Ionicons name="sparkles" size={9} color={theme.ACCENT} />
                                        <Text variant="overline" tone="accent">AI</Text>
                                    </View>
                                ) : null}
                            >
                                Smart insights
                            </Overline>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.insightRow}
                                style={{ marginBottom: SPACING.MEDIUM }}
                            >
                                {(aiInsights || data.insights).map((insight, index) => (
                                    <InsightCard key={`${insight.type}-${index}`} insight={insight} />
                                ))}
                            </ScrollView>
                        </>
                    )}

                    <Overline>Categories</Overline>
                    <ChipRow style={{ marginBottom: SPACING.MEDIUM }}>
                        <Chip
                            label="All"
                            icon="apps"
                            active={selectedCategoryName === null}
                            onPress={() => setSelectedCategoryName(null)}
                        />
                        {categories.map((cat) => (
                            <Chip
                                key={cat.name}
                                label={cat.name}
                                icon={cat.icon || 'wallet-outline'}
                                color={colorForCategory(theme, cat.name)}
                                active={selectedCategoryName === cat.name}
                                onPress={() => setSelectedCategoryName(
                                    selectedCategoryName === cat.name ? null : cat.name
                                )}
                            />
                        ))}
                    </ChipRow>

                    {selectedCategory ? (
                        <>
                            <CategoryHero category={selectedCategory} />
                            <CategoryTrendChart category={selectedCategory} />
                            <WeekdaySplit category={selectedCategory} />
                            <MerchantList
                                title={`Top merchants — ${selectedCategory.name}`}
                                merchants={selectedCategory.topMerchants}
                            />
                            <CategoryTransactions category={selectedCategory} />
                        </>
                    ) : (
                        <>
                            <CategoryLeaderboard categories={categories} onSelect={setSelectedCategoryName} />
                            <DayOfWeekChart dayOfWeek={data.dayOfWeek || []} />
                            <MonthlyTrendChart monthlyTrend={data.monthlyTrend || []} />
                            <SizeHistogram sizeBuckets={data.sizeBuckets || []} />
                            <MerchantList title="Top merchants" merchants={data.topMerchants} showCategory />
                        </>
                    )}
                </>
            )}
        </Screen>
    );
};

export default AdvancedAnalyticsScreen;
