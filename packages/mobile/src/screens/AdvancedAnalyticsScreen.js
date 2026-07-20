import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    StatusBar,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import api from '../services/api';

// Time period options (matches AnalyticsScreen)
const TIME_PERIODS = [
    { label: '7D', value: 7 },
    { label: '30D', value: 30 },
    { label: '90D', value: 90 },
    { label: 'YTD', value: 365 },
];

const GREEN_POSITIVE = '#30D158';

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
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

// Spending semantics: an increase is bad (red), a decrease is good (green)
const ChangeBadge = ({ percent }) => {
    if (percent == null || percent === 0) return null;
    const isUp = percent > 0;
    const color = isUp ? COLORS.RED : GREEN_POSITIVE;
    return (
        <View style={[styles.changeBadge, { backgroundColor: `${color}25` }]}>
            <Ionicons name={isUp ? 'arrow-up' : 'arrow-down'} size={10} color={color} />
            <Text style={[styles.changeBadgeText, { color }]}>{Math.abs(percent)}%</Text>
        </View>
    );
};

const StatTile = ({ label, value, sub, subColor }) => (
    <View style={styles.statTile}>
        <Text style={styles.statTileLabel}>{label}</Text>
        <Text style={styles.statTileValue} numberOfLines={1}>{value}</Text>
        {sub ? (
            <Text style={[styles.statTileSub, subColor && { color: subColor }]} numberOfLines={1}>
                {sub}
            </Text>
        ) : null}
    </View>
);

const InsightCard = ({ insight }) => (
    <View style={[styles.insightCard, { borderLeftColor: insight.color || COLORS.GOLD }]}>
        <View style={styles.insightHeader}>
            <View style={[styles.insightIcon, { backgroundColor: `${insight.color || COLORS.GOLD}20` }]}>
                <Ionicons name={insight.icon || 'bulb'} size={14} color={insight.color || COLORS.GOLD} />
            </View>
            <Text style={styles.insightTitle} numberOfLines={1}>{insight.title}</Text>
        </View>
        <Text style={styles.insightDescription}>{insight.description}</Text>
    </View>
);

// Horizontal chip selector: "All" + one chip per category
const CategoryChips = ({ categories, selected, onSelect }) => (
    <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
    >
        <TouchableOpacity
            style={[styles.chip, selected === null && styles.chipActiveAll]}
            onPress={() => onSelect(null)}
            activeOpacity={0.7}
        >
            <Ionicons
                name="apps"
                size={13}
                color={selected === null ? COLORS.BACKGROUND : COLORS.GOLD}
            />
            <Text style={[styles.chipText, selected === null && styles.chipTextActiveAll]}>
                All
            </Text>
        </TouchableOpacity>
        {categories.map((cat) => {
            const isActive = selected === cat.name;
            return (
                <TouchableOpacity
                    key={cat.name}
                    style={[
                        styles.chip,
                        isActive && { backgroundColor: `${cat.color}30`, borderColor: cat.color },
                    ]}
                    onPress={() => onSelect(isActive ? null : cat.name)}
                    activeOpacity={0.7}
                >
                    <Ionicons name={cat.icon || 'wallet-outline'} size={13} color={cat.color} />
                    <Text style={[styles.chipText, isActive && { color: COLORS.WHITE }]}>
                        {cat.name}
                    </Text>
                </TouchableOpacity>
            );
        })}
    </ScrollView>
);

// Ranked horizontal bars — magnitude job, direct labels, color = category identity
const CategoryLeaderboard = ({ categories, onSelect }) => {
    if (categories.length === 0) return null;
    const maxTotal = categories[0].total || 1;

    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Category Leaderboard</Text>
            <Text style={styles.sectionSubtitle}>Tap a category to drill down</Text>
            {categories.map((cat) => (
                <TouchableOpacity
                    key={cat.name}
                    style={styles.leaderRow}
                    onPress={() => onSelect(cat.name)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.leaderIcon, { backgroundColor: `${cat.color}20` }]}>
                        <Ionicons name={cat.icon || 'wallet-outline'} size={15} color={cat.color} />
                    </View>
                    <View style={styles.leaderInfo}>
                        <View style={styles.leaderTopLine}>
                            <Text style={styles.leaderName} numberOfLines={1}>{cat.name}</Text>
                            <View style={styles.leaderAmountRow}>
                                <ChangeBadge percent={cat.changePercent} />
                                <Text style={styles.leaderAmount}>{formatCurrency(cat.total)}</Text>
                            </View>
                        </View>
                        <View style={styles.leaderBarTrack}>
                            <View
                                style={[
                                    styles.leaderBarFill,
                                    { width: `${Math.max((cat.total / maxTotal) * 100, 2)}%`, backgroundColor: cat.color },
                                ]}
                            />
                        </View>
                        <Text style={styles.leaderMeta}>
                            {cat.count} txns · avg {formatCurrency(cat.avgTransaction)} · {cat.percentage.toFixed(1)}% of spend
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    );
};

// Vertical bars Mon–Sun, tap to inspect a day
const DayOfWeekChart = ({ dayOfWeek }) => {
    const [selectedDay, setSelectedDay] = useState(null);
    const maxAmount = Math.max(...dayOfWeek.map((d) => d.amount), 1);
    const selected = selectedDay !== null ? dayOfWeek[selectedDay] : null;

    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Spending by Day of Week</Text>
            <Text style={styles.sectionSubtitle}>
                {selected
                    ? `${selected.day}: ${formatCurrency(selected.amount)} across ${selected.count} transaction${selected.count === 1 ? '' : 's'}`
                    : 'Tap a bar for details'}
            </Text>
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
                            <Text style={styles.dowValue}>{formatCompact(d.amount)}</Text>
                            <View style={styles.dowBarArea}>
                                <View
                                    style={[
                                        styles.dowBar,
                                        {
                                            height: Math.max((d.amount / maxAmount) * 90, 3),
                                            backgroundColor: isActive ? COLORS.GOLD_LIGHT : COLORS.GOLD,
                                            opacity: dimmed ? 0.35 : 1,
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.dowLabel, isActive && styles.dowLabelActive]}>
                                {d.day}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

// Grouped bars, one $ axis, 2 series → legend required
const MonthlyTrendChart = ({ monthlyTrend }) => {
    const [selectedMonth, setSelectedMonth] = useState(null);
    const maxValue = Math.max(
        ...monthlyTrend.map((m) => Math.max(m.spending, m.income)),
        1
    );
    const selected = selectedMonth !== null ? monthlyTrend[selectedMonth] : null;

    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>6-Month Trend</Text>
            <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.GOLD }]} />
                    <Text style={styles.legendText}>Spending</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.TEAL }]} />
                    <Text style={styles.legendText}>Income</Text>
                </View>
            </View>
            <Text style={styles.sectionSubtitle}>
                {selected
                    ? `${formatMonthLabel(selected.month)}: spent ${formatCurrency(selected.spending)} · income ${formatCurrency(selected.income)}`
                    : 'Tap a month for details'}
            </Text>
            <View style={styles.trendChart}>
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
                                <View
                                    style={[
                                        styles.trendBar,
                                        {
                                            height: Math.max((m.spending / maxValue) * 100, 3),
                                            backgroundColor: COLORS.GOLD,
                                        },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.trendBar,
                                        {
                                            height: Math.max((m.income / maxValue) * 100, 3),
                                            backgroundColor: COLORS.TEAL,
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.dowLabel, isActive && styles.dowLabelActive]}>
                                {formatMonthLabel(m.month)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

// Horizontal bars: how many purchases fall in each price band
const SizeHistogram = ({ sizeBuckets }) => {
    const maxCount = Math.max(...sizeBuckets.map((b) => b.count), 1);
    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Transaction Sizes</Text>
            <Text style={styles.sectionSubtitle}>Where your purchases cluster</Text>
            {sizeBuckets.map((bucket) => (
                <View key={bucket.label} style={styles.bucketRow}>
                    <Text style={styles.bucketLabel}>{bucket.label}</Text>
                    <View style={styles.bucketBarTrack}>
                        <View
                            style={[
                                styles.bucketBarFill,
                                { width: `${Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 3 : 0)}%` },
                            ]}
                        />
                    </View>
                    <Text style={styles.bucketValue}>
                        {bucket.count} · {formatCompact(bucket.total)}
                    </Text>
                </View>
            ))}
        </View>
    );
};

const MerchantList = ({ title, merchants, showCategory }) => {
    if (!merchants || merchants.length === 0) return null;
    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {merchants.map((m, index) => (
                <View key={`${m.name}-${index}`} style={styles.merchantRow}>
                    <Text style={styles.merchantRank}>{index + 1}</Text>
                    <View style={styles.merchantInfo}>
                        <Text style={styles.merchantName} numberOfLines={1}>{m.name}</Text>
                        <Text style={styles.merchantMeta}>
                            {m.count} txn{m.count === 1 ? '' : 's'} · avg {formatCurrency(m.avg)}
                            {showCategory && m.category ? ` · ${m.category}` : ''}
                        </Text>
                    </View>
                    <Text style={styles.merchantAmount}>{formatCurrency(m.total)}</Text>
                </View>
            ))}
        </View>
    );
};

// ============ CATEGORY DRILL-DOWN ============

const CategoryHero = ({ category }) => (
    <View style={[styles.sectionCard, { borderColor: `${category.color}40`, borderWidth: 1 }]}>
        <View style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: `${category.color}20` }]}>
                <Ionicons name={category.icon || 'wallet-outline'} size={22} color={category.color} />
            </View>
            <View style={styles.heroTitleBlock}>
                <Text style={styles.heroTitle}>{category.name}</Text>
                <Text style={styles.heroSubtitle}>
                    {category.percentage.toFixed(1)}% of total spending
                </Text>
            </View>
            <ChangeBadge percent={category.changePercent} />
        </View>
        <Text style={styles.heroAmount}>{formatCurrency(category.total)}</Text>
        {category.prevTotal > 0 && (
            <Text style={styles.heroPrev}>
                vs {formatCurrency(category.prevTotal)} previous period
                {category.changeAmount !== 0
                    ? ` (${category.changeAmount > 0 ? '+' : '−'}${formatCurrency(Math.abs(category.changeAmount))})`
                    : ''}
            </Text>
        )}
        <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{category.count}</Text>
                <Text style={styles.heroStatLabel}>Txns</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{formatCurrency(category.avgTransaction)}</Text>
                <Text style={styles.heroStatLabel}>Average</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{formatCurrency(category.minTransaction)}</Text>
                <Text style={styles.heroStatLabel}>Smallest</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{formatCurrency(category.maxTransaction)}</Text>
                <Text style={styles.heroStatLabel}>Largest</Text>
            </View>
        </View>
    </View>
);

const CategoryTrendChart = ({ category }) => {
    const trend = category.monthlyTrend || [];
    if (trend.length === 0) return null;
    const maxAmount = Math.max(...trend.map((m) => m.amount), 1);

    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>6-Month Trend</Text>
            <View style={styles.dowChart}>
                {trend.map((m) => (
                    <View key={m.month} style={styles.dowColumn}>
                        <Text style={styles.dowValue}>{formatCompact(m.amount)}</Text>
                        <View style={styles.dowBarArea}>
                            <View
                                style={[
                                    styles.dowBar,
                                    {
                                        height: Math.max((m.amount / maxAmount) * 90, 3),
                                        backgroundColor: category.color,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={styles.dowLabel}>{formatMonthLabel(m.month)}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

const WeekdaySplit = ({ category }) => {
    const total = category.weekdayTotal + category.weekendTotal;
    if (total <= 0) return null;
    const weekdayPct = Math.round((category.weekdayTotal / total) * 100);
    const weekendPct = 100 - weekdayPct;

    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Weekday vs Weekend</Text>
            <View style={styles.splitBar}>
                {category.weekdayTotal > 0 && (
                    <View
                        style={[
                            styles.splitSegment,
                            styles.splitSegmentLeft,
                            { flex: category.weekdayTotal, backgroundColor: category.color },
                        ]}
                    />
                )}
                {category.weekendTotal > 0 && (
                    <View
                        style={[
                            styles.splitSegment,
                            styles.splitSegmentRight,
                            { flex: category.weekendTotal, backgroundColor: `${category.color}70` },
                        ]}
                    />
                )}
            </View>
            <View style={styles.splitLegend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                    <Text style={styles.legendText}>
                        Weekday · {formatCurrency(category.weekdayTotal)} ({weekdayPct}%)
                    </Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: `${category.color}70` }]} />
                    <Text style={styles.legendText}>
                        Weekend · {formatCurrency(category.weekendTotal)} ({weekendPct}%)
                    </Text>
                </View>
            </View>
        </View>
    );
};

const CategoryTransactions = ({ category }) => {
    const transactions = category.transactions || [];
    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            <Text style={styles.sectionSubtitle}>
                {transactions.length === 100
                    ? 'Showing the 100 most recent'
                    : `${transactions.length} in this period`}
            </Text>
            {transactions.length === 0 ? (
                <View style={styles.emptyBlock}>
                    <Ionicons name="document-text-outline" size={36} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.emptyBlockText}>No transactions in this period</Text>
                </View>
            ) : (
                transactions.map((tx, index) => (
                    <View
                        key={tx.transaction_id || tx.id || `tx-${index}`}
                        style={styles.txRow}
                    >
                        <View style={[styles.txIcon, { backgroundColor: `${category.color}15` }]}>
                            <Ionicons
                                name={category.icon || 'receipt-outline'}
                                size={15}
                                color={category.color}
                            />
                        </View>
                        <View style={styles.txInfo}>
                            <Text style={styles.txName} numberOfLines={1}>
                                {tx.merchant_name || tx.name}
                            </Text>
                            <Text style={styles.txMeta} numberOfLines={1}>
                                {formatDate(tx.date)}
                                {tx.account_name ? ` · ${tx.account_name}` : ''}
                            </Text>
                        </View>
                        <View style={styles.txAmountBlock}>
                            <Text style={styles.txAmount}>-{formatCurrency(tx.amount)}</Text>
                            {tx.pending ? <Text style={styles.txPending}>Pending</Text> : null}
                        </View>
                    </View>
                ))
            )}
        </View>
    );
};

// ============ MAIN SCREEN ============

const AdvancedAnalyticsScreen = ({ navigation }) => {
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
            // Pull-to-refresh asks Plaid for a fresh sync first (same idiom as
            // AnalyticsScreen). This is best-effort: the backend enforces a 10-min
            // refresh cooldown and returns HTTP 429, and the network can fail — but
            // the category analytics below reads from the server cache and stays
            // valid regardless, so a sync failure must NOT abort the load or blank
            // the screen.
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

            // Upgrade rule-based insights to AI ones in the background —
            // the screen stays fully usable if this never resolves
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
            // have data, keep showing that last result rather than wiping the page.
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
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Crunching your numbers...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                >
                    <Ionicons name="chevron-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Advanced Analytics</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.GOLD}
                        colors={[COLORS.GOLD]}
                    />
                }
            >
                {/* Period Toggle */}
                <View style={styles.periodContainer}>
                    {TIME_PERIODS.map((period) => (
                        <TouchableOpacity
                            key={period.value}
                            style={[
                                styles.periodButton,
                                selectedPeriod === period.value && styles.periodButtonActive,
                            ]}
                            onPress={() => {
                                if (selectedPeriod !== period.value) {
                                    setSelectedPeriod(period.value);
                                    setLoading(true);
                                }
                            }}
                        >
                            <Text
                                style={[
                                    styles.periodButtonText,
                                    selectedPeriod === period.value && styles.periodButtonTextActive,
                                ]}
                            >
                                {period.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {error ? (
                    <View style={styles.sectionCard}>
                        <View style={styles.emptyBlock}>
                            <Ionicons name="cloud-offline-outline" size={36} color={COLORS.TEXT_MUTED} />
                            <Text style={styles.emptyBlockText}>{error}</Text>
                        </View>
                    </View>
                ) : !hasData ? (
                    <View style={styles.sectionCard}>
                        <View style={styles.emptyBlock}>
                            <Ionicons name="analytics-outline" size={36} color={COLORS.TEXT_MUTED} />
                            <Text style={styles.emptyBlockText}>
                                No spending found in this period. Try a longer time range or pull down to sync.
                            </Text>
                        </View>
                    </View>
                ) : (
                    <>
                        {/* Overview */}
                        <View style={styles.heroCard}>
                            <View style={styles.heroHeader}>
                                <Text style={styles.heroCardLabel}>TOTAL SPENT</Text>
                                <ChangeBadge percent={summary.spendChangePercent} />
                            </View>
                            <Text style={styles.heroCardAmount}>{formatCurrency(summary.totalSpend)}</Text>
                            <Text style={styles.heroCardSub}>
                                Income {formatCurrency(summary.totalIncome)} · Net{' '}
                                <Text style={{ color: summary.netCashFlow >= 0 ? GREEN_POSITIVE : COLORS.RED }}>
                                    {summary.netCashFlow >= 0 ? '+' : '−'}{formatCurrency(Math.abs(summary.netCashFlow))}
                                </Text>
                            </Text>
                        </View>

                        <View style={styles.statGrid}>
                            <StatTile label="Daily Average" value={formatCurrency(summary.avgDailySpend)} />
                            <StatTile
                                label="Avg Transaction"
                                value={formatCurrency(summary.avgTransaction)}
                                sub={`${summary.expenseCount} purchases`}
                            />
                            <StatTile
                                label="Largest Purchase"
                                value={formatCurrency(summary.largestExpense?.amount || 0)}
                                sub={summary.largestExpense?.name}
                            />
                            <StatTile
                                label="Active Categories"
                                value={`${summary.activeCategories}`}
                                sub={`${Math.round((summary.weekendSpend / (summary.totalSpend || 1)) * 100)}% on weekends`}
                            />
                        </View>

                        {/* Smart Insights — rule-based instantly, upgraded to AI when ready */}
                        {(aiInsights || data.insights)?.length > 0 && (
                            <>
                                <View style={styles.rowHeadingRow}>
                                    <Text style={[styles.rowHeading, styles.rowHeadingInline]}>
                                        SMART INSIGHTS
                                    </Text>
                                    {aiInsights && (
                                        <View style={styles.aiBadge}>
                                            <Ionicons name="sparkles" size={9} color={COLORS.GOLD} />
                                            <Text style={styles.aiBadgeText}>AI</Text>
                                        </View>
                                    )}
                                </View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.insightRow}
                                >
                                    {(aiInsights || data.insights).map((insight, index) => (
                                        <InsightCard key={`${insight.type}-${index}`} insight={insight} />
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {/* Category selector */}
                        <Text style={styles.rowHeading}>CATEGORIES</Text>
                        <CategoryChips
                            categories={categories}
                            selected={selectedCategoryName}
                            onSelect={setSelectedCategoryName}
                        />

                        {selectedCategory ? (
                            <>
                                <CategoryHero category={selectedCategory} />
                                <CategoryTrendChart category={selectedCategory} />
                                <WeekdaySplit category={selectedCategory} />
                                <MerchantList
                                    title={`Top Merchants — ${selectedCategory.name}`}
                                    merchants={selectedCategory.topMerchants}
                                />
                                <CategoryTransactions category={selectedCategory} />
                            </>
                        ) : (
                            <>
                                <CategoryLeaderboard
                                    categories={categories}
                                    onSelect={setSelectedCategoryName}
                                />
                                <DayOfWeekChart dayOfWeek={data.dayOfWeek || []} />
                                <MonthlyTrendChart monthlyTrend={data.monthlyTrend || []} />
                                <SizeHistogram sizeBuckets={data.sizeBuckets || []} />
                                <MerchantList
                                    title="Top Merchants"
                                    merchants={data.topMerchants}
                                    showCategory
                                />
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 50,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: COLORS.TEXT_SECONDARY,
        marginTop: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingBottom: 40,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.MEDIUM,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
        textAlign: 'center',
    },
    headerSpacer: {
        width: 36,
    },

    // Period Toggle
    periodContainer: {
        flexDirection: 'row',
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        borderRadius: BORDER_RADIUS.XL,
        padding: 4,
    },
    periodButton: {
        flex: 1,
        paddingVertical: SPACING.SMALL,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.LARGE,
    },
    periodButtonActive: {
        backgroundColor: COLORS.GOLD,
    },
    periodButtonText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 13,
        fontFamily: FONTS.BOLD,
    },
    periodButtonTextActive: {
        color: COLORS.BACKGROUND,
    },

    // Hero card
    heroCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        borderRadius: BORDER_RADIUS.XL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    heroCardLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        letterSpacing: 1,
    },
    heroCardAmount: {
        color: COLORS.WHITE,
        fontSize: 34,
        fontFamily: FONTS.BOLD,
        marginTop: 4,
    },
    heroCardSub: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginTop: 4,
    },

    // Stat grid
    statGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: SPACING.MEDIUM - 4,
        marginBottom: SPACING.SMALL,
    },
    statTile: {
        width: '50%',
        padding: 4,
    },
    statTileLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginBottom: 2,
    },
    statTileValue: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    statTileSub: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        marginTop: 2,
    },

    // Section headings
    rowHeading: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        letterSpacing: 1,
        marginHorizontal: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    rowHeadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
        gap: 6,
    },
    rowHeadingInline: {
        marginHorizontal: 0,
        marginTop: 0,
        marginBottom: 0,
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.SMALL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        gap: 3,
    },
    aiBadgeText: {
        color: COLORS.GOLD,
        fontSize: 9,
        fontFamily: FONTS.BOLD,
        letterSpacing: 0.5,
    },

    // Insights
    insightRow: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    insightCard: {
        width: 240,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        borderRadius: BORDER_RADIUS.LARGE,
        borderLeftWidth: 3,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    insightIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    insightTitle: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 13,
        fontFamily: FONTS.BOLD,
    },
    insightDescription: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        lineHeight: 17,
    },

    // Category chips
    chipRow: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
        marginBottom: SPACING.MEDIUM,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: BORDER_RADIUS.XL,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        gap: 5,
    },
    chipActiveAll: {
        backgroundColor: COLORS.GOLD,
        borderColor: COLORS.GOLD,
    },
    chipText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontFamily: FONTS.MEDIUM,
    },
    chipTextActiveAll: {
        color: COLORS.BACKGROUND,
    },

    // Section cards
    sectionCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.SURFACE_ELEVATED,
        borderRadius: BORDER_RADIUS.XL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    sectionSubtitle: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginTop: 2,
        marginBottom: SPACING.MEDIUM,
    },

    // Leaderboard
    leaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: SPACING.SMALL + 2,
    },
    leaderIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.SMALL,
        marginTop: 2,
    },
    leaderInfo: {
        flex: 1,
    },
    leaderTopLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    leaderName: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.MEDIUM,
        marginRight: SPACING.SMALL,
    },
    leaderAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    leaderAmount: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    leaderBarTrack: {
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    leaderBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    leaderMeta: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 4,
    },

    // Change badge
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.SMALL,
        gap: 2,
    },
    changeBadgeText: {
        fontSize: 11,
        fontFamily: FONTS.BOLD,
    },

    // Day-of-week / trend bar charts
    dowChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    dowColumn: {
        flex: 1,
        alignItems: 'center',
    },
    dowValue: {
        color: COLORS.TEXT_MUTED,
        fontSize: 9,
        marginBottom: 4,
    },
    dowBarArea: {
        height: 90,
        justifyContent: 'flex-end',
        width: '100%',
        alignItems: 'center',
    },
    dowBar: {
        width: '55%',
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
    },
    dowLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 6,
    },
    dowLabelActive: {
        color: COLORS.WHITE,
        fontFamily: FONTS.BOLD,
    },

    // Monthly trend
    legendRow: {
        flexDirection: 'row',
        gap: SPACING.MEDIUM,
        marginTop: 6,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
    },
    trendChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    trendColumn: {
        flex: 1,
        alignItems: 'center',
    },
    trendBarGroup: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 100,
        gap: 2,
    },
    trendBar: {
        width: 11,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
    },

    // Size histogram
    bucketRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL + 2,
    },
    bucketLabel: {
        width: 80,
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    bucketBarTrack: {
        flex: 1,
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 4,
        overflow: 'hidden',
        marginHorizontal: SPACING.SMALL,
    },
    bucketBarFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: COLORS.TEAL,
    },
    bucketValue: {
        width: 78,
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        textAlign: 'right',
    },

    // Merchants
    merchantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 2,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    merchantRank: {
        width: 24,
        color: COLORS.GOLD,
        fontSize: 13,
        fontFamily: FONTS.BOLD,
    },
    merchantInfo: {
        flex: 1,
        marginRight: SPACING.SMALL,
    },
    merchantName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.MEDIUM,
    },
    merchantMeta: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 2,
    },
    merchantAmount: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },

    // Category hero
    heroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    heroIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.SMALL,
    },
    heroTitleBlock: {
        flex: 1,
    },
    heroTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    heroSubtitle: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginTop: 2,
    },
    heroAmount: {
        color: COLORS.WHITE,
        fontSize: 30,
        fontFamily: FONTS.BOLD,
        marginTop: SPACING.MEDIUM,
    },
    heroPrev: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginTop: 2,
    },
    heroStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
    },
    heroStat: {
        flex: 1,
        alignItems: 'center',
    },
    heroStatDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    heroStatValue: {
        color: COLORS.WHITE,
        fontSize: 13,
        fontFamily: FONTS.BOLD,
    },
    heroStatLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
        marginTop: 2,
    },

    // Weekday/weekend split
    splitBar: {
        flexDirection: 'row',
        height: 20,
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    splitSegment: {
        height: '100%',
    },
    splitSegmentLeft: {
        borderTopLeftRadius: 6,
        borderBottomLeftRadius: 6,
        marginRight: 2,
    },
    splitSegmentRight: {
        borderTopRightRadius: 6,
        borderBottomRightRadius: 6,
    },
    splitLegend: {
        gap: 4,
    },

    // Transactions
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 2,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    txIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.SMALL,
    },
    txInfo: {
        flex: 1,
        marginRight: SPACING.SMALL,
    },
    txName: {
        color: COLORS.WHITE,
        fontSize: 14,
    },
    txMeta: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 2,
    },
    txAmountBlock: {
        alignItems: 'flex-end',
    },
    txAmount: {
        color: COLORS.RED,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    txPending: {
        color: COLORS.GOLD,
        fontSize: 10,
        marginTop: 2,
    },

    // Empty / error states
    emptyBlock: {
        alignItems: 'center',
        paddingVertical: SPACING.XL,
        paddingHorizontal: SPACING.MEDIUM,
    },
    emptyBlockText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 13,
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        lineHeight: 19,
    },
});

export default AdvancedAnalyticsScreen;
