import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    FlatList,
} from 'react-native';
import { Svg, Circle, Path, Defs, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    BottomSheet,
    Card,
    Text,
    Button,
    SegmentedControl,
    SectionTitle,
    BarTrack,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction, getCategoryMeta } from '../utils/categorization';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Card is inset 16 each side and padded 16 each side.
const CHART_WIDTH = SCREEN_WIDTH - (SPACING.MEDIUM * 4);

const TIME_PERIODS = [
    { label: '7D', value: 7 },
    { label: '30D', value: 30 },
    { label: '90D', value: 90 },
    { label: 'YTD', value: 365 },
];

const MAX_BAR_SEGMENTS = 8;
const COLLAPSED_CATEGORY_COUNT = 8;

const formatCurrency = (amount) => {
    const num = parseFloat(amount || 0);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) {
        return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${num.toFixed(2)}`;
};

const formatCompactCurrency = (amount) => {
    const num = parseFloat(amount || 0);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
    return `$${num.toFixed(0)}`;
};

// Normalize category names for comparison (handles "Transfer" vs "Transfers", case differences)
const normalizeCategory = (cat) => {
    if (!cat) return '';
    return cat.toLowerCase()
        .replace(/s$/, '')
        .replace(/\s+/g, '')
        .replace(/[&]/g, 'and');
};

const makeStyles = (t) => StyleSheet.create({
    scrollContent: { paddingBottom: 120 },

    // Net worth
    netWorthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: RADIUS.SMALL,
    },
    chartWrap: {
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    tooltip: {
        position: 'absolute',
        top: 0,
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.SMALL,
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 3,
        alignItems: 'center',
    },

    // Burn rate
    progressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
        marginBottom: 5,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: RADIUS.SMALL,
    },

    // Stacked bar
    stackedBar: {
        flexDirection: 'row',
        height: 22,
        marginBottom: SPACING.SMALL + 2,
    },
    // The 2px gap is what keeps two adjacent segments legible when they land on
    // the same ramp hue — colour is the only encoding available in a stacked bar.
    barSegment: { height: '100%', marginRight: 2 },
    barCaption: { minHeight: 20, justifyContent: 'center' },

    // Category list
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: SPACING.SMALL + 2,
    },
    divider: { borderTopWidth: 1, borderTopColor: t.HAIRLINE },
    categoryIconTile: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryInfo: { flex: 1 },
    categoryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    categoryAmountBlock: { alignItems: 'flex-end' },
    showAll: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingTop: SPACING.MEDIUM,
        marginTop: SPACING.SMALL,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },

    // Intent + merchant rows
    intentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: SPACING.SMALL,
    },
    intentIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    merchantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
    },
    merchantIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },
    merchantInfo: { flex: 1 },
    merchantAmountBlock: { alignItems: 'flex-end' },

    // AI tip
    tipHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    tipIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: t.ACCENT_DIM,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Modal
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SMALL },
    modalDot: { width: 10, height: 10, borderRadius: 5 },
    modalStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
        marginBottom: SPACING.SMALL,
    },
    modalStat: { flex: 1, alignItems: 'center' },
    modalStatDivider: { width: 1, height: 24, backgroundColor: t.HAIRLINE },
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: SPACING.SMALL + 2,
    },
    txIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    txInfo: { flex: 1 },
});

const AnalyticsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [categoryTransactions, setCategoryTransactions] = useState([]);
    const [showAllCategories, setShowAllCategories] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [activeSegment, setActiveSegment] = useState(null);
    const [selectedDataPoint, setSelectedDataPoint] = useState(null);

    const fetchAnalytics = useCallback(async (forceRefresh = false) => {
        try {
            if (forceRefresh) {
                await api.getTransactions('?refresh=true&limit=100');
            }

            const [analyticsData, accountsData] = await Promise.all([
                api.getAnalytics(selectedPeriod, forceRefresh),
                api.getAccounts(),
            ]);

            if (analyticsData?.success) setAnalytics(analyticsData);
            if (accountsData?.success && accountsData?.accounts) setAccounts(accountsData.accounts);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedPeriod]);

    useEffect(() => {
        fetchAnalytics(false);
    }, [fetchAnalytics]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAnalytics(true);
    }, [fetchAnalytics]);

    const handleCategoryPress = async (category) => {
        if (loadingTransactions) return;

        setSelectedCategory(category);
        setLoadingTransactions(true);

        try {
            // Use cached transactions when available; fall back to the API so the
            // drill-down still works before the cache is warmed up
            let transactions = await cache.getCachedTransactions();
            if (!transactions || transactions.length === 0) {
                const apiResponse = await api.getTransactions('?limit=500');
                transactions = apiResponse?.data || [];
            }

            if (transactions.length > 0) {
                const targetCategory = normalizeCategory(category.category);

                const dateThreshold = new Date();
                dateThreshold.setDate(new Date().getDate() - selectedPeriod);

                const filtered = transactions.filter((tx) => {
                    // Only include expenses (positive amounts in Plaid's convention)
                    if (parseFloat(tx.amount) <= 0) return false;
                    if (new Date(tx.date) < dateThreshold) return false;

                    const txCategoryName = tx.category?.[0] || categorizeTransaction(tx).category;
                    return normalizeCategory(txCategoryName) === targetCategory;
                });

                filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
                setCategoryTransactions(filtered);
            }
        } catch (err) {
            console.error('Error fetching category transactions:', err);
        } finally {
            setLoadingTransactions(false);
            // Open only after data is loaded — prevents a flicker of empty state
            setCategoryModalVisible(true);
        }
    };

    /**
     * Category colours resolve through the validated ramp by category identity,
     * the same way Home and Advanced Analytics do — not from the hex the API
     * sends, and not by rank, so a category keeps its colour as the ordering
     * changes.
     */
    const categoryData = useMemo(() => {
        const breakdown = analytics?.charts?.categoryBreakdown || [];
        const total = breakdown.reduce((sum, cat) => sum + cat.amount, 0);

        return breakdown.map((cat) => {
            const meta = getCategoryMeta(cat.category);
            return {
                ...cat,
                percentage: total > 0 ? (cat.amount / total * 100) : 0,
                icon: cat.icon || meta.icon,
                color: categoryColor(theme, meta.colorIndex),
            };
        });
    }, [analytics?.charts?.categoryBreakdown, theme]);

    const netWorthTrend = analytics?.charts?.netWorthTrend || [];

    const chartPoints = useMemo(() => {
        if (netWorthTrend.length < 2) return null;

        const data = netWorthTrend.slice(-20);
        const values = data.map((d) => d.value);
        const minValue = Math.min(...values);
        const range = (Math.max(...values) - minValue) || 1;

        const chartHeight = 120;
        const tooltipHeight = 26;
        const padding = 10;

        const points = data.map((point, index) => ({
            x: padding + (index / (data.length - 1)) * (CHART_WIDTH - 2 * padding),
            y: tooltipHeight + chartHeight - padding - ((point.value - minValue) / range) * (chartHeight - 2 * padding),
            value: point.value,
            date: point.date,
        }));

        let linePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const midX = (prev.x + curr.x) / 2;
            linePath += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
        }
        const last = points[points.length - 1];
        linePath += ` T ${last.x} ${last.y}`;

        return {
            points,
            linePath,
            areaPath: `${linePath} L ${last.x} ${tooltipHeight + chartHeight} L ${points[0].x} ${tooltipHeight + chartHeight} Z`,
            chartHeight,
            tooltipHeight,
            padding,
            avgY: tooltipHeight + chartHeight - padding - (0.3 * (chartHeight - 2 * padding)),
        };
    }, [netWorthTrend]);

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading analytics..." />
            </Screen>
        );
    }

    const wealthNarrative = analytics?.wealthNarrative;
    const changePercent = wealthNarrative?.netWorthChange || 0;
    const netWorthUp = changePercent >= 0;
    const trendColor = theme.ACCENT;

    const burnRate = analytics?.burnRate;
    const burnStatus = burnRate?.status || 'safe';
    const burnColor = burnStatus === 'danger'
        ? theme.DANGER
        : burnStatus === 'warning' ? theme.WARNING : theme.SUCCESS;

    const spendingByIntent = analytics?.spendingByIntent;
    const intentItems = spendingByIntent ? [
        { key: 'fixedNeeds', icon: 'home', slot: 1, ...spendingByIntent.fixedNeeds },
        { key: 'growth', icon: 'trending-up', slot: 5, ...spendingByIntent.growth },
        { key: 'lifestyle', icon: 'heart', slot: 4, ...spendingByIntent.lifestyle },
    ] : [];

    const topMerchant = analytics?.topMerchant;
    const aiTip = analytics?.aiTip;

    // Group the long tail into one segment so small categories stay tappable
    let segments = categoryData;
    if (categoryData.length > MAX_BAR_SEGMENTS) {
        const rest = categoryData.slice(MAX_BAR_SEGMENTS - 1);
        segments = [
            ...categoryData.slice(0, MAX_BAR_SEGMENTS - 1),
            {
                category: `${rest.length} more categories`,
                amount: rest.reduce((sum, cat) => sum + cat.amount, 0),
                percentage: rest.reduce((sum, cat) => sum + cat.percentage, 0),
                color: theme.CATEGORY_OTHER,
            },
        ];
    }
    const categoryTotal = categoryData.reduce((sum, cat) => sum + cat.amount, 0);
    const activeSegmentData = segments.find((c) => c.category === activeSegment);

    const visibleCategories = showAllCategories
        ? categoryData
        : categoryData.slice(0, COLLAPSED_CATEGORY_COUNT);
    const hiddenCount = categoryData.length - COLLAPSED_CATEGORY_COUNT;

    const header = (
        <ScreenHeader
            title="Wealth Narrative"
            onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
            right={
                <TouchableOpacity
                    onPress={() => navigation.navigate('AdvancedAnalytics')}
                    accessibilityRole="button"
                >
                    <Text variant="label" tone="link">Advanced</Text>
                </TouchableOpacity>
            }
        />
    );

    return (
        <>
            <Screen
                scroll
                header={header}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
            >
                <SegmentedControl
                    options={TIME_PERIODS}
                    value={selectedPeriod}
                    onChange={(value) => {
                        if (value !== selectedPeriod) {
                            setSelectedPeriod(value);
                            setLoading(true);
                        }
                    }}
                />

                {/* Net worth */}
                <Card>
                    <View style={styles.netWorthHeader}>
                        <Text variant="overline" tone="muted">Net worth</Text>
                        <View style={[
                            styles.changeBadge,
                            { backgroundColor: netWorthUp ? theme.SUCCESS_DIM : theme.DANGER_DIM },
                        ]}>
                            <Ionicons
                                name={netWorthUp ? 'trending-up' : 'trending-down'}
                                size={12}
                                color={netWorthUp ? theme.SUCCESS : theme.DANGER}
                            />
                            <Text variant="meta" tone={netWorthUp ? 'success' : 'danger'}>
                                {netWorthUp ? '+' : ''}{changePercent.toFixed(1)}%
                            </Text>
                        </View>
                    </View>

                    <Text variant="hero">{formatCurrency(wealthNarrative?.netWorth || 0)}</Text>

                    {chartPoints && (
                        <View style={styles.chartWrap}>
                            <Svg width={CHART_WIDTH} height={chartPoints.chartHeight + chartPoints.tooltipHeight}>
                                <Defs>
                                    <SvgLinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                        <Stop offset="0%" stopColor={trendColor} stopOpacity="0.35" />
                                        <Stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
                                    </SvgLinearGradient>
                                </Defs>

                                <Path d={chartPoints.areaPath} fill="url(#areaGradient)" />

                                <Path
                                    d={`M ${chartPoints.padding} ${chartPoints.avgY} L ${CHART_WIDTH - chartPoints.padding} ${chartPoints.avgY}`}
                                    stroke={theme.HAIRLINE_STRONG}
                                    strokeWidth="1"
                                    strokeDasharray="4,4"
                                    fill="none"
                                />

                                <Path
                                    d={chartPoints.linePath}
                                    stroke={trendColor}
                                    strokeWidth="2.5"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />

                                {selectedDataPoint !== null && chartPoints.points[selectedDataPoint] && (
                                    <>
                                        <Path
                                            d={`M ${chartPoints.points[selectedDataPoint].x} ${chartPoints.points[selectedDataPoint].y} L ${chartPoints.points[selectedDataPoint].x} ${chartPoints.tooltipHeight + chartPoints.chartHeight}`}
                                            stroke={trendColor}
                                            strokeWidth="1"
                                            strokeDasharray="3,3"
                                            fill="none"
                                        />
                                        <Circle
                                            cx={chartPoints.points[selectedDataPoint].x}
                                            cy={chartPoints.points[selectedDataPoint].y}
                                            r={6}
                                            fill={trendColor}
                                            stroke={theme.SURFACE}
                                            strokeWidth={2}
                                        />
                                    </>
                                )}
                            </Svg>

                            {chartPoints.points.map((point, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={{
                                        position: 'absolute',
                                        left: point.x - 15,
                                        top: point.y - 15,
                                        width: 30,
                                        height: 30,
                                        borderRadius: 15,
                                    }}
                                    onPress={() => setSelectedDataPoint(selectedDataPoint === index ? null : index)}
                                    activeOpacity={0.7}
                                />
                            ))}

                            {selectedDataPoint !== null && chartPoints.points[selectedDataPoint] && (
                                <View style={[
                                    styles.tooltip,
                                    { left: Math.max(0, Math.min(chartPoints.points[selectedDataPoint].x - 45, CHART_WIDTH - 90)) },
                                ]}>
                                    <Text variant="label">
                                        {formatCompactCurrency(chartPoints.points[selectedDataPoint].value)}
                                    </Text>
                                    <Text variant="meta" tone="muted">
                                        {new Date(`${chartPoints.points[selectedDataPoint].date}T12:00:00`)
                                            .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    <Text variant="body" tone="secondary">
                        {wealthNarrative?.narrative || 'Loading wealth narrative...'}
                    </Text>
                </Card>

                {/* Burn rate */}
                <Card>
                    <SectionTitle
                        title="Burn rate"
                        spaced={false}
                        right={
                            <View style={[styles.statusBadge, { backgroundColor: alpha(burnColor, 0.16) }]}>
                                <Text variant="overline" color={burnColor}>{burnStatus}</Text>
                            </View>
                        }
                    />

                    <View style={styles.progressRow}>
                        <Text variant="overline" tone="muted">Month progress</Text>
                        <Text variant="label" tone="secondary">{burnRate?.monthProgress || 0}%</Text>
                    </View>
                    <BarTrack value={burnRate?.monthProgress || 0} max={100} color={theme.TEXT_MUTED} />

                    <View style={styles.progressRow}>
                        <Text variant="overline" tone="muted">Budget spent</Text>
                        <Text variant="label" color={burnColor}>{burnRate?.budgetSpent || 0}%</Text>
                    </View>
                    <BarTrack value={burnRate?.budgetSpent || 0} max={100} color={burnColor} />
                </Card>

                {/* Spending by category */}
                <Card>
                    <SectionTitle title="Spending by category" />

                    {categoryData.length === 0 ? (
                        <EmptyState icon="bar-chart-outline" message="No spending data in this period" />
                    ) : (
                        <>
                            <View style={styles.stackedBar}>
                                {segments.map((cat, index) => (
                                    <TouchableOpacity
                                        key={cat.category}
                                        style={[
                                            styles.barSegment,
                                            {
                                                flex: Math.max(cat.percentage, 1),
                                                backgroundColor: cat.color,
                                                opacity: activeSegment && activeSegment !== cat.category ? 0.35 : 1,
                                                borderTopLeftRadius: index === 0 ? 6 : 0,
                                                borderBottomLeftRadius: index === 0 ? 6 : 0,
                                                borderTopRightRadius: index === segments.length - 1 ? 6 : 0,
                                                borderBottomRightRadius: index === segments.length - 1 ? 6 : 0,
                                                marginRight: index === segments.length - 1 ? 0 : 2,
                                            },
                                        ]}
                                        onPress={() => setActiveSegment(activeSegment === cat.category ? null : cat.category)}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${cat.category}, ${formatCompactCurrency(cat.amount)}`}
                                    />
                                ))}
                            </View>

                            <View style={styles.barCaption}>
                                {activeSegmentData ? (
                                    <Text variant="label" color={activeSegmentData.color}>
                                        {activeSegmentData.category} · {formatCompactCurrency(activeSegmentData.amount)}
                                    </Text>
                                ) : (
                                    <Text variant="meta" tone="muted">
                                        Tap a segment · total {formatCurrency(categoryTotal)}
                                    </Text>
                                )}
                            </View>

                            {visibleCategories.map((cat, index) => (
                                <TouchableOpacity
                                    key={cat.category}
                                    style={[styles.categoryRow, index > 0 && styles.divider]}
                                    onPress={() => handleCategoryPress(cat)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.categoryIconTile, { backgroundColor: alpha(cat.color, 0.16) }]}>
                                        <Ionicons name={cat.icon || 'wallet'} size={16} color={cat.color} />
                                    </View>
                                    <View style={styles.categoryInfo}>
                                        <Text variant="bodyMed" numberOfLines={1}>{cat.category}</Text>
                                        <View style={styles.categoryMetaRow}>
                                            <Text variant="meta" tone="muted">{cat.count} transactions</Text>
                                            {cat.changePercent != null && cat.changePercent !== 0 && (
                                                <Text
                                                    variant="meta"
                                                    tone={cat.changePercent > 0 ? 'danger' : 'success'}
                                                >
                                                    {cat.changePercent > 0 ? '▲' : '▼'} {Math.abs(cat.changePercent)}%
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <View style={styles.categoryAmountBlock}>
                                        <Text variant="num">{formatCurrency(cat.amount)}</Text>
                                        <Text variant="meta" tone="muted">{cat.percentage.toFixed(1)}%</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={theme.TEXT_MUTED} />
                                </TouchableOpacity>
                            ))}

                            {hiddenCount > 0 && (
                                <TouchableOpacity
                                    style={styles.showAll}
                                    onPress={() => setShowAllCategories(!showAllCategories)}
                                    activeOpacity={0.7}
                                >
                                    <Text variant="label" tone="link">
                                        {showAllCategories ? 'Show less' : `Show all ${categoryData.length} categories`}
                                    </Text>
                                    <Ionicons
                                        name={showAllCategories ? 'chevron-up' : 'chevron-down'}
                                        size={16}
                                        color={theme.LINK}
                                    />
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </Card>

                {/* AI tip */}
                {aiTip && (
                    <Card>
                        <View style={styles.tipHeader}>
                            <View style={styles.tipIcon}>
                                <Ionicons name="flash" size={16} color={theme.ACCENT} />
                            </View>
                            <Text variant="title" style={{ flex: 1 }}>{aiTip.title}</Text>
                        </View>
                        <Text variant="body" tone="secondary">
                            Move <Text variant="bodyMed" tone="accent">${aiTip.surplus?.toLocaleString()}</Text> to
                            your HISA for an extra{' '}
                            <Text variant="bodyMed" tone="accent">${aiTip.potentialEarnings}/mo</Text> interest.
                        </Text>
                        {aiTip.action && (
                            <Button
                                title={aiTip.action}
                                icon="flash"
                                onPress={() => navigation.navigate('AllAccounts')}
                                block
                                style={{ marginTop: SPACING.MEDIUM }}
                            />
                        )}
                    </Card>
                )}

                {/* Spending by intent */}
                {intentItems.length > 0 && (
                    <Card>
                        <SectionTitle title="Spending by intent" />
                        {intentItems.map((item) => {
                            const tint = categoryColor(theme, item.slot);
                            return (
                                <View key={item.key} style={styles.intentRow}>
                                    <View style={[styles.intentIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                                        <Ionicons name={item.icon} size={16} color={tint} />
                                    </View>
                                    <Text variant="body" style={{ flex: 1 }}>{item.label}</Text>
                                    <Text variant="num">{formatCurrency(item.amount)}</Text>
                                </View>
                            );
                        })}
                    </Card>
                )}

                {/* Top leakage */}
                {topMerchant && (
                    <Card>
                        <SectionTitle title="Top leakage" />
                        <View style={styles.merchantRow}>
                            <View style={styles.merchantIcon}>
                                <Text variant="h2" tone="accent">
                                    {topMerchant.name?.charAt(0)?.toUpperCase() || 'U'}
                                </Text>
                            </View>
                            <View style={styles.merchantInfo}>
                                <Text variant="bodyMed" numberOfLines={1}>{topMerchant.name}</Text>
                                <Text variant="meta" tone="muted">{topMerchant.category}</Text>
                            </View>
                            <View style={styles.merchantAmountBlock}>
                                <Text variant="num">{formatCurrency(topMerchant.amount)}</Text>
                                <Text
                                    variant="meta"
                                    tone={topMerchant.changePercent > 0 ? 'danger' : 'success'}
                                >
                                    {topMerchant.changePercent > 0 ? '↑' : '↓'} {Math.abs(topMerchant.changePercent)}%
                                </Text>
                            </View>
                        </View>
                    </Card>
                )}

                {/* AI insight footer */}
                <Card>
                    <Text variant="overline" tone="muted">AI insight</Text>
                    <Text variant="body" tone="secondary" style={{ marginTop: 6 }}>
                        {aiTip?.description || 'Analyzing your spending patterns...'}
                    </Text>
                </Card>
            </Screen>

            {/* Category drill-down */}
            <BottomSheet
                visible={categoryModalVisible}
                onClose={() => setCategoryModalVisible(false)}
                scroll={false}
            >
                <SectionTitle
                    title={selectedCategory?.category || 'Category'}
                    spaced={false}
                    right={
                        <TouchableOpacity
                            onPress={() => setCategoryModalVisible(false)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />

                <Text variant="hero" style={{ marginTop: SPACING.MEDIUM }}>
                    {formatCurrency(selectedCategory?.amount || 0)}
                </Text>
                <Text variant="meta" tone="muted">
                    {loadingTransactions
                        ? 'Loading...'
                        : `${categoryTransactions.length} transactions in this period`}
                </Text>

                <View style={styles.modalStatsRow}>
                    <View style={styles.modalStat}>
                        <Text variant="num">
                            {formatCurrency(selectedCategory?.count > 0
                                ? selectedCategory.amount / selectedCategory.count
                                : 0)}
                        </Text>
                        <Text variant="meta" tone="muted">Avg / txn</Text>
                    </View>
                    <View style={styles.modalStatDivider} />
                    <View style={styles.modalStat}>
                        <Text variant="num">{(selectedCategory?.percentage || 0).toFixed(1)}%</Text>
                        <Text variant="meta" tone="muted">Of total</Text>
                    </View>
                    <View style={styles.modalStatDivider} />
                    <View style={styles.modalStat}>
                        <Text
                            variant="num"
                            tone={selectedCategory?.changePercent == null
                                ? 'primary'
                                : selectedCategory.changePercent > 0 ? 'danger' : 'success'}
                        >
                            {selectedCategory?.changePercent != null
                                ? `${selectedCategory.changePercent > 0 ? '+' : ''}${selectedCategory.changePercent}%`
                                : '—'}
                        </Text>
                        <Text variant="meta" tone="muted">Vs previous</Text>
                    </View>
                </View>

                {loadingTransactions ? (
                    <ActivityIndicator size="small" color={theme.ACCENT} style={{ marginVertical: SPACING.LARGE }} />
                ) : (
                    <FlatList
                        data={categoryTransactions}
                        keyExtractor={(item, index) => item.id?.toString() || item.transaction_id || `tx-${index}`}
                        style={{ maxHeight: 320 }}
                        showsVerticalScrollIndicator
                        renderItem={({ item, index }) => {
                            const tint = selectedCategory?.color || theme.ACCENT;
                            return (
                                <View style={[styles.txRow, index > 0 && styles.divider]}>
                                    <View style={[styles.txIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                                        <Ionicons name="receipt-outline" size={15} color={tint} />
                                    </View>
                                    <View style={styles.txInfo}>
                                        <Text variant="body" numberOfLines={1}>
                                            {item.merchant_name || item.name}
                                        </Text>
                                        <Text variant="meta" tone="muted">
                                            {new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                            })}
                                        </Text>
                                    </View>
                                    <Text variant="num" tone="danger">
                                        −${Math.abs(item.amount).toFixed(2)}
                                    </Text>
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <EmptyState
                                icon="document-text-outline"
                                message="No transactions found for this category"
                            />
                        }
                    />
                )}
            </BottomSheet>
        </>
    );
};

export default AnalyticsScreen;
