import React, { useEffect, useState, useCallback } from 'react';
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
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Category colors for charts
const CATEGORY_COLORS = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#96CEB4', // Green
    '#FFEAA7', // Yellow
    '#DDA0DD', // Plum
    '#98D8C8', // Mint
    '#F7DC6F', // Gold
    '#BB8FCE', // Purple
    '#85C1E9', // Light Blue
];

const AnalyticsScreen = ({ navigation }) => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [selectedCategory, setSelectedCategory] = useState(null);

    const fetchAnalytics = useCallback(async () => {
        try {
            const data = await api.getAnalytics(selectedPeriod);
            if (data?.success) {
                setAnalytics(data);
            }
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedPeriod]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAnalytics();
    }, [fetchAnalytics]);

    const formatCurrency = (amount) => {
        return `$${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const formatCompactCurrency = (amount) => {
        const num = parseFloat(amount || 0);
        if (num >= 1000) {
            return `$${(num / 1000).toFixed(1)}k`;
        }
        return `$${num.toFixed(0)}`;
    };

    // Calculate percentages for donut chart
    const getCategoryPercentages = () => {
        if (!analytics?.charts?.categoryBreakdown) return [];
        const total = analytics.charts.categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0);
        return analytics.charts.categoryBreakdown.map((cat, index) => ({
            ...cat,
            percentage: total > 0 ? (cat.amount / total * 100) : 0,
            color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        }));
    };

    // Circular Progress Ring using Views (no SVG needed)
    const DonutChart = ({ data, size = 180 }) => {
        if (!data || data.length === 0) {
            return (
                <View style={styles.emptyChart}>
                    <Ionicons name="pie-chart-outline" size={48} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.emptyChartText}>No spending data</Text>
                </View>
            );
        }

        const total = data.reduce((sum, cat) => sum + cat.amount, 0);
        const selectedData = selectedCategory
            ? data.find(d => d.category === selectedCategory)
            : null;
        const displayAmount = selectedData ? selectedData.amount : total;
        const displayLabel = selectedData ? selectedData.category : 'Total';

        return (
            <View style={styles.donutContainer}>
                {/* Donut visualization using stacked horizontal bars */}
                <View style={styles.donutVisualContainer}>
                    <View style={[styles.donutRing, { width: size, height: size }]}>
                        {/* Outer ring with colored segments */}
                        <View style={styles.donutSegments}>
                            {data.slice(0, 8).map((cat, index) => (
                                <View
                                    key={cat.category}
                                    style={[
                                        styles.donutSegment,
                                        {
                                            backgroundColor: cat.color,
                                            width: `${cat.percentage}%`,
                                            opacity: selectedCategory && selectedCategory !== cat.category ? 0.3 : 1,
                                        }
                                    ]}
                                />
                            ))}
                        </View>

                        {/* Center content */}
                        <View style={styles.donutCenter}>
                            <Text style={styles.donutCenterAmount}>
                                {formatCompactCurrency(displayAmount)}
                            </Text>
                            <Text style={styles.donutCenterLabel} numberOfLines={1}>
                                {displayLabel}
                            </Text>
                            {selectedData && (
                                <Text style={styles.donutCenterPercentage}>
                                    {selectedData.percentage.toFixed(1)}%
                                </Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Category Legend - Interactive */}
                <View style={styles.donutLegend}>
                    {data.slice(0, 6).map((cat, index) => (
                        <TouchableOpacity
                            key={cat.category}
                            style={[
                                styles.legendItem,
                                selectedCategory === cat.category && styles.legendItemActive
                            ]}
                            onPress={() => setSelectedCategory(
                                selectedCategory === cat.category ? null : cat.category
                            )}
                        >
                            <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                            <View style={styles.legendTextContainer}>
                                <Text style={styles.legendCategory} numberOfLines={1}>
                                    {cat.category}
                                </Text>
                                <Text style={styles.legendAmount}>
                                    {formatCurrency(cat.amount)}
                                </Text>
                            </View>
                            <Text style={styles.legendPercentage}>
                                {cat.percentage.toFixed(0)}%
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        );
    };

    // Spending Trend Component
    const SpendingTrend = () => {
        const spendingChange = analytics?.summary?.spendingChange || 0;
        const isUp = spendingChange > 0;
        const isDown = spendingChange < 0;

        return (
            <View style={styles.trendCard}>
                <View style={styles.trendHeader}>
                    <Text style={styles.trendTitle}>Spending Trend</Text>
                    <Text style={styles.trendPeriod}>vs previous {selectedPeriod} days</Text>
                </View>

                <View style={styles.trendContent}>
                    <View style={[
                        styles.trendBadge,
                        isUp ? styles.trendBadgeUp : isDown ? styles.trendBadgeDown : styles.trendBadgeNeutral
                    ]}>
                        <Ionicons
                            name={isUp ? 'trending-up' : isDown ? 'trending-down' : 'remove'}
                            size={24}
                            color={isUp ? '#FF6B6B' : isDown ? '#4CAF50' : COLORS.TEXT_SECONDARY}
                        />
                    </View>

                    <View style={styles.trendDetails}>
                        <Text style={[
                            styles.trendPercentage,
                            { color: isUp ? '#FF6B6B' : isDown ? '#4CAF50' : COLORS.WHITE }
                        ]}>
                            {isUp ? '+' : ''}{spendingChange.toFixed(1)}%
                        </Text>
                        <Text style={styles.trendDescription}>
                            {isUp
                                ? `You're spending more than the previous period`
                                : isDown
                                    ? `Great! You've reduced your spending`
                                    : 'Spending is consistent'
                            }
                        </Text>
                    </View>
                </View>

                {/* Visual trend bar */}
                <View style={styles.trendBarContainer}>
                    <View style={styles.trendBarBackground}>
                        <View
                            style={[
                                styles.trendBarFill,
                                {
                                    width: `${Math.min(Math.abs(spendingChange) * 2 + 50, 100)}%`,
                                    backgroundColor: isUp ? '#FF6B6B' : isDown ? '#4CAF50' : COLORS.GOLD,
                                }
                            ]}
                        />
                    </View>
                    <View style={styles.trendBarLabels}>
                        <Text style={styles.trendBarLabel}>Less</Text>
                        <Text style={styles.trendBarLabel}>Same</Text>
                        <Text style={styles.trendBarLabel}>More</Text>
                    </View>
                </View>
            </View>
        );
    };

    // Daily Spending Chart
    const renderBarChart = () => {
        const dailyData = analytics?.charts?.dailySpending || [];
        if (dailyData.length === 0) {
            return (
                <View style={styles.emptyChart}>
                    <Ionicons name="bar-chart-outline" size={48} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.emptyChartText}>No daily data</Text>
                </View>
            );
        }

        const maxAmount = Math.max(...dailyData.map(d => d.amount), 1);
        const last14Days = dailyData.slice(-14);
        const avgAmount = last14Days.reduce((sum, d) => sum + d.amount, 0) / last14Days.length;

        return (
            <View style={styles.barChartContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.barsRow}>
                        {last14Days.map((day, index) => {
                            const height = (day.amount / maxAmount) * 100;
                            const date = new Date(day.date);
                            const dayLabel = date.getDate();
                            const isAboveAvg = day.amount > avgAmount;

                            return (
                                <View key={day.date} style={styles.barWrapper}>
                                    <Text style={styles.barValue}>
                                        {formatCompactCurrency(day.amount)}
                                    </Text>
                                    <View style={styles.barContainer}>
                                        <View
                                            style={[
                                                styles.bar,
                                                {
                                                    height: `${Math.max(height, 5)}%`,
                                                    backgroundColor: isAboveAvg ? '#FF6B6B' : COLORS.GOLD,
                                                }
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.barLabel}>{dayLabel}</Text>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>

                {/* Average indicator */}
                <View style={styles.avgIndicator}>
                    <View style={styles.avgDot} />
                    <Text style={styles.avgText}>Avg: {formatCompactCurrency(avgAmount)}/day</Text>
                </View>
            </View>
        );
    };

    // Income vs Expenses comparison
    const renderIncomeExpenses = () => {
        const income = analytics?.charts?.incomeVsExpenses?.income || 0;
        const expenses = analytics?.charts?.incomeVsExpenses?.expenses || 0;
        const total = Math.max(income + expenses, 1);
        const incomePercent = (income / total) * 100;
        const expensePercent = (expenses / total) * 100;
        const netCashFlow = income - expenses;
        const savingsRate = income > 0 ? ((income - expenses) / income * 100).toFixed(1) : 0;

        return (
            <View style={styles.incomeExpensesContainer}>
                <View style={styles.ieRow}>
                    <View style={styles.ieItem}>
                        <View style={styles.ieIconContainer}>
                            <Ionicons name="arrow-down-circle" size={24} color="#4CAF50" />
                        </View>
                        <View style={styles.ieTextContainer}>
                            <Text style={styles.ieLabel}>Income</Text>
                            <Text style={[styles.ieAmount, { color: '#4CAF50' }]}>
                                {formatCurrency(income)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.ieItem}>
                        <View style={[styles.ieIconContainer, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
                            <Ionicons name="arrow-up-circle" size={24} color="#FF6B6B" />
                        </View>
                        <View style={styles.ieTextContainer}>
                            <Text style={styles.ieLabel}>Expenses</Text>
                            <Text style={[styles.ieAmount, { color: '#FF6B6B' }]}>
                                {formatCurrency(expenses)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Visual comparison bars */}
                <View style={styles.comparisonBars}>
                    <View style={styles.comparisonBarRow}>
                        <Text style={styles.comparisonLabel}>Income</Text>
                        <View style={styles.comparisonBarBg}>
                            <View style={[styles.comparisonBarFill, styles.incomeBar, { width: `${incomePercent}%` }]} />
                        </View>
                        <Text style={styles.comparisonPercent}>{incomePercent.toFixed(0)}%</Text>
                    </View>
                    <View style={styles.comparisonBarRow}>
                        <Text style={styles.comparisonLabel}>Expenses</Text>
                        <View style={styles.comparisonBarBg}>
                            <View style={[styles.comparisonBarFill, styles.expenseBar, { width: `${expensePercent}%` }]} />
                        </View>
                        <Text style={styles.comparisonPercent}>{expensePercent.toFixed(0)}%</Text>
                    </View>
                </View>

                {/* Net Cash Flow & Savings Rate */}
                <View style={styles.netStatsRow}>
                    <View style={styles.netStatItem}>
                        <Text style={styles.netStatLabel}>Net Cash Flow</Text>
                        <Text style={[
                            styles.netStatAmount,
                            { color: netCashFlow >= 0 ? '#4CAF50' : '#FF6B6B' }
                        ]}>
                            {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                        </Text>
                    </View>
                    <View style={styles.netStatDivider} />
                    <View style={styles.netStatItem}>
                        <Text style={styles.netStatLabel}>Savings Rate</Text>
                        <Text style={[
                            styles.netStatAmount,
                            { color: savingsRate >= 0 ? '#4CAF50' : '#FF6B6B' }
                        ]}>
                            {savingsRate}%
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    // Quick Stats Cards
    const renderQuickStats = () => {
        const avgDaily = analytics?.summary?.avgDailySpending || 0;
        const transactionCount = analytics?.charts?.categoryBreakdown?.reduce((sum, c) => sum + c.count, 0) || 0;
        const categoryCount = analytics?.charts?.categoryBreakdown?.length || 0;

        return (
            <View style={styles.quickStatsRow}>
                <View style={styles.quickStatCard}>
                    <Ionicons name="calendar-outline" size={20} color={COLORS.GOLD} />
                    <Text style={styles.quickStatValue}>{formatCurrency(avgDaily)}</Text>
                    <Text style={styles.quickStatLabel}>Daily Avg</Text>
                </View>
                <View style={styles.quickStatCard}>
                    <Ionicons name="receipt-outline" size={20} color={COLORS.GOLD} />
                    <Text style={styles.quickStatValue}>{transactionCount}</Text>
                    <Text style={styles.quickStatLabel}>Transactions</Text>
                </View>
                <View style={styles.quickStatCard}>
                    <Ionicons name="grid-outline" size={20} color={COLORS.GOLD} />
                    <Text style={styles.quickStatValue}>{categoryCount}</Text>
                    <Text style={styles.quickStatLabel}>Categories</Text>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Loading analytics...</Text>
            </View>
        );
    }

    const categories = getCategoryPercentages();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Analytics</Text>
                <View style={styles.headerRight} />
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
                {/* Period Selector */}
                <View style={styles.periodSelector}>
                    {[7, 30, 90].map((period) => (
                        <TouchableOpacity
                            key={period}
                            style={[
                                styles.periodButton,
                                selectedPeriod === period && styles.periodButtonActive
                            ]}
                            onPress={() => {
                                setSelectedPeriod(period);
                                setSelectedCategory(null);
                                setLoading(true);
                            }}
                        >
                            <Text style={[
                                styles.periodButtonText,
                                selectedPeriod === period && styles.periodButtonTextActive
                            ]}>
                                {period === 7 ? '7 Days' : period === 30 ? '30 Days' : '90 Days'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Total Spending Hero */}
                <View style={styles.heroCard}>
                    <Text style={styles.heroLabel}>Total Spending</Text>
                    <Text style={styles.heroAmount}>
                        {formatCurrency(analytics?.summary?.totalSpending)}
                    </Text>
                    <View style={styles.heroPeriodBadge}>
                        <Text style={styles.heroPeriodText}>Last {selectedPeriod} days</Text>
                    </View>
                </View>

                {/* Quick Stats */}
                {renderQuickStats()}

                {/* Spending Trend */}
                <SpendingTrend />

                {/* Category Breakdown */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Spending by Category</Text>
                    <DonutChart data={categories} size={180} />
                </View>

                {/* Daily Spending Bar Chart */}
                <View style={styles.chartCard}>
                    <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>Daily Spending</Text>
                        <View style={styles.chartLegendSmall}>
                            <View style={[styles.chartLegendDot, { backgroundColor: COLORS.GOLD }]} />
                            <Text style={styles.chartLegendText}>Below avg</Text>
                            <View style={[styles.chartLegendDot, { backgroundColor: '#FF6B6B', marginLeft: 8 }]} />
                            <Text style={styles.chartLegendText}>Above avg</Text>
                        </View>
                    </View>
                    {renderBarChart()}
                </View>

                {/* Income vs Expenses */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Income vs Expenses</Text>
                    {renderIncomeExpenses()}
                </View>

                {/* Top Category Insight */}
                {analytics?.summary?.topCategory && (
                    <View style={styles.insightCard}>
                        <View style={styles.insightIcon}>
                            <Ionicons name="bulb" size={24} color={COLORS.GOLD} />
                        </View>
                        <View style={styles.insightContent}>
                            <Text style={styles.insightTitle}>Spending Insight</Text>
                            <Text style={styles.insightText}>
                                Your top spending category is{' '}
                                <Text style={styles.insightHighlight}>{analytics.summary.topCategory.name}</Text>
                                {' '}at{' '}
                                <Text style={styles.insightHighlight}>
                                    {formatCurrency(analytics.summary.topCategory.amount)}
                                </Text>
                                {' '}({((analytics.summary.topCategory.amount / analytics.summary.totalSpending) * 100).toFixed(0)}% of total)
                            </Text>
                        </View>
                    </View>
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
        paddingBottom: 100,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.MEDIUM,
    },
    backButton: {
        padding: SPACING.SMALL,
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontWeight: '700',
    },
    headerRight: {
        width: 40,
    },

    // Period Selector
    periodSelector: {
        flexDirection: 'row',
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        padding: 4,
    },
    periodButton: {
        flex: 1,
        paddingVertical: SPACING.SMALL + 2,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    periodButtonActive: {
        backgroundColor: COLORS.GOLD,
    },
    periodButtonText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        fontWeight: '600',
    },
    periodButtonTextActive: {
        color: COLORS.BACKGROUND,
    },

    // Hero Card
    heroCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        alignItems: 'center',
    },
    heroLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginBottom: 4,
    },
    heroAmount: {
        color: COLORS.WHITE,
        fontSize: 36,
        fontWeight: 'bold',
    },
    heroPeriodBadge: {
        marginTop: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: 4,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    heroPeriodText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },

    // Quick Stats
    quickStatsRow: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    quickStatCard: {
        flex: 1,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        padding: SPACING.MEDIUM,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    quickStatValue: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: SPACING.SMALL,
    },
    quickStatLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 2,
    },

    // Trend Card
    trendCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    trendHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    trendTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
    },
    trendPeriod: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
    },
    trendContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    trendBadge: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    trendBadgeUp: {
        backgroundColor: 'rgba(255, 107, 107, 0.15)',
    },
    trendBadgeDown: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
    },
    trendBadgeNeutral: {
        backgroundColor: COLORS.CARD_BORDER,
    },
    trendDetails: {
        flex: 1,
    },
    trendPercentage: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    trendDescription: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginTop: 2,
    },
    trendBarContainer: {
        marginTop: SPACING.SMALL,
    },
    trendBarBackground: {
        height: 8,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: 4,
        overflow: 'hidden',
    },
    trendBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    trendBarLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    trendBarLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
    },

    // Chart Cards
    chartCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.MEDIUM,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    chartTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: SPACING.SMALL,
    },
    chartLegendSmall: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    chartLegendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 4,
    },
    chartLegendText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
    },
    emptyChart: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.XL,
    },
    emptyChartText: {
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.SMALL,
    },

    // Donut Chart (View-based)
    donutContainer: {
        alignItems: 'center',
    },
    donutVisualContainer: {
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    donutRing: {
        borderRadius: 100,
        backgroundColor: COLORS.CARD_BORDER,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    donutSegments: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        height: 20,
        borderRadius: 10,
        overflow: 'hidden',
    },
    donutSegment: {
        height: '100%',
    },
    donutCenter: {
        backgroundColor: COLORS.CARD_BG,
        width: '70%',
        height: '70%',
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    donutCenterAmount: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontWeight: 'bold',
    },
    donutCenterLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    donutCenterPercentage: {
        color: COLORS.GOLD,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 2,
    },
    donutLegend: {
        width: '100%',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: 4,
    },
    legendItemActive: {
        backgroundColor: COLORS.CARD_BORDER,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: SPACING.SMALL,
    },
    legendTextContainer: {
        flex: 1,
    },
    legendCategory: {
        color: COLORS.WHITE,
        fontSize: 14,
    },
    legendAmount: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
    },
    legendPercentage: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        fontWeight: '600',
        minWidth: 40,
        textAlign: 'right',
    },

    // Bar Chart
    barChartContainer: {
        marginTop: SPACING.SMALL,
    },
    barsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 140,
        paddingRight: SPACING.MEDIUM,
    },
    barWrapper: {
        alignItems: 'center',
        marginRight: 8,
        width: 32,
    },
    barValue: {
        color: COLORS.TEXT_MUTED,
        fontSize: 8,
        marginBottom: 2,
    },
    barContainer: {
        width: 20,
        height: 100,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: BORDER_RADIUS.SMALL,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    bar: {
        width: '100%',
        borderRadius: BORDER_RADIUS.SMALL,
    },
    barLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
        marginTop: 4,
    },
    avgIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: SPACING.SMALL,
    },
    avgDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.GOLD,
        marginRight: 6,
    },
    avgText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },

    // Income vs Expenses
    incomeExpensesContainer: {
        marginTop: SPACING.SMALL,
    },
    ieRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    ieItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ieIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    ieTextContainer: {},
    ieLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    ieAmount: {
        fontSize: 18,
        fontWeight: '700',
    },
    comparisonBars: {
        marginBottom: SPACING.MEDIUM,
    },
    comparisonBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    comparisonLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        width: 60,
    },
    comparisonBarBg: {
        flex: 1,
        height: 12,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: 6,
        overflow: 'hidden',
        marginHorizontal: SPACING.SMALL,
    },
    comparisonBarFill: {
        height: '100%',
        borderRadius: 6,
    },
    incomeBar: {
        backgroundColor: '#4CAF50',
    },
    expenseBar: {
        backgroundColor: '#FF6B6B',
    },
    comparisonPercent: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: '600',
        width: 35,
        textAlign: 'right',
    },
    netStatsRow: {
        flexDirection: 'row',
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: COLORS.CARD_BORDER,
    },
    netStatItem: {
        flex: 1,
        alignItems: 'center',
    },
    netStatDivider: {
        width: 1,
        backgroundColor: COLORS.CARD_BORDER,
    },
    netStatLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginBottom: 4,
    },
    netStatAmount: {
        fontSize: 18,
        fontWeight: 'bold',
    },

    // Insight Card
    insightCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        flexDirection: 'row',
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.MEDIUM,
        borderWidth: 1,
        borderColor: COLORS.GOLD + '40',
    },
    insightIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.GOLD + '20',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    insightContent: {
        flex: 1,
    },
    insightTitle: {
        color: COLORS.GOLD,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    insightText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        lineHeight: 18,
    },
    insightHighlight: {
        color: COLORS.WHITE,
        fontWeight: '600',
    },
});

export default AnalyticsScreen;
