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
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Time period options
const TIME_PERIODS = [
    { label: '7D', value: 7 },
    { label: '30D', value: 30 },
    { label: '90D', value: 90 },
    { label: 'YTD', value: 365 },
];

const AnalyticsScreen = ({ navigation }) => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState(30);

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
        const num = parseFloat(amount || 0);
        if (num >= 1000000) {
            return `$${(num / 1000000).toFixed(2)}M`;
        }
        if (num >= 1000) {
            return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return `$${num.toFixed(2)}`;
    };

    const formatCompactCurrency = (amount) => {
        const num = parseFloat(amount || 0);
        if (num >= 1000000) {
            return `$${(num / 1000000).toFixed(1)}M`;
        }
        if (num >= 1000) {
            return `$${(num / 1000).toFixed(1)}k`;
        }
        return `$${num.toFixed(0)}`;
    };

    // Header Component
    const Header = () => (
        <View style={styles.header}>
            <View style={styles.headerLeft}>
                <View style={styles.logoContainer}>
                    <Ionicons name="analytics" size={20} color={COLORS.TEAL} />
                </View>
                <Text style={styles.headerTitle}>Wealth Narrative</Text>
            </View>
            <TouchableOpacity style={styles.notificationButton}>
                <Ionicons name="notifications-outline" size={22} color={COLORS.WHITE} />
            </TouchableOpacity>
        </View>
    );

    // Time Period Toggle
    const TimePeriodToggle = () => (
        <View style={styles.periodContainer}>
            {TIME_PERIODS.map((period) => (
                <TouchableOpacity
                    key={period.value}
                    style={[
                        styles.periodButton,
                        selectedPeriod === period.value && styles.periodButtonActive
                    ]}
                    onPress={() => {
                        if (selectedPeriod !== period.value) {
                            setSelectedPeriod(period.value);
                            setLoading(true);
                        }
                    }}
                >
                    <Text style={[
                        styles.periodButtonText,
                        selectedPeriod === period.value && styles.periodButtonTextActive
                    ]}>
                        {period.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    // Net Worth Card with Line Chart
    const NetWorthCard = () => {
        const wealthNarrative = analytics?.wealthNarrative;
        const netWorthTrend = analytics?.charts?.netWorthTrend || [];
        const changePercent = wealthNarrative?.netWorthChange || 0;
        const isPositive = changePercent >= 0;

        // Simple line chart using Views
        const renderLineChart = () => {
            if (netWorthTrend.length < 2) return null;

            const values = netWorthTrend.map(d => d.value);
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            const range = maxValue - minValue || 1;

            return (
                <View style={styles.lineChartContainer}>
                    <View style={styles.lineChart}>
                        {netWorthTrend.slice(-20).map((point, index, arr) => {
                            const height = ((point.value - minValue) / range) * 80 + 10;
                            const prevPoint = arr[index - 1];
                            return (
                                <View key={point.date} style={styles.chartPointWrapper}>
                                    <View
                                        style={[
                                            styles.chartPoint,
                                            { height: height, backgroundColor: COLORS.TEAL }
                                        ]}
                                    />
                                </View>
                            );
                        })}
                    </View>
                    {/* Chart gradient overlay */}
                    <LinearGradient
                        colors={['rgba(78, 205, 196, 0.3)', 'transparent']}
                        style={styles.chartGradient}
                    />
                </View>
            );
        };

        return (
            <View style={styles.netWorthCard}>
                <View style={styles.netWorthHeader}>
                    <Text style={styles.netWorthLabel}>Net Worth</Text>
                    <View style={[
                        styles.changeBadge,
                        { backgroundColor: isPositive ? 'rgba(78, 205, 196, 0.2)' : 'rgba(255, 107, 107, 0.2)' }
                    ]}>
                        <Ionicons
                            name={isPositive ? 'trending-up' : 'trending-down'}
                            size={12}
                            color={isPositive ? COLORS.TEAL : COLORS.RED}
                        />
                        <Text style={[
                            styles.changeBadgeText,
                            { color: isPositive ? COLORS.TEAL : COLORS.RED }
                        ]}>
                            {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
                        </Text>
                    </View>
                </View>

                <Text style={styles.netWorthAmount}>
                    {formatCurrency(wealthNarrative?.netWorth || 0)}
                </Text>

                {renderLineChart()}

                <Text style={styles.narrativeText}>
                    {wealthNarrative?.narrative || 'Loading wealth narrative...'}
                </Text>
            </View>
        );
    };

    // Burn Rate Card
    const BurnRateCard = () => {
        const burnRate = analytics?.burnRate;
        const status = burnRate?.status || 'safe';
        const statusColors = {
            safe: COLORS.GREEN,
            warning: COLORS.GOLD,
            danger: COLORS.RED
        };

        return (
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Burn Rate</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors[status] + '30' }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColors[status] }]}>
                            {status.toUpperCase()}
                        </Text>
                    </View>
                </View>

                {/* Month Progress Bar */}
                <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>MONTH PROGRESS</Text>
                    <Text style={styles.progressValue}>{burnRate?.monthProgress || 0}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                    <View
                        style={[
                            styles.progressBarFill,
                            { width: `${burnRate?.monthProgress || 0}%`, backgroundColor: COLORS.TEXT_SECONDARY }
                        ]}
                    />
                </View>

                {/* Budget Spent Bar */}
                <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>BUDGET SPENT</Text>
                    <Text style={[styles.progressValue, { color: statusColors[status] }]}>
                        {burnRate?.budgetSpent || 0}%
                    </Text>
                </View>
                <View style={styles.progressBarBg}>
                    <View
                        style={[
                            styles.progressBarFill,
                            { width: `${burnRate?.budgetSpent || 0}%`, backgroundColor: statusColors[status] }
                        ]}
                    />
                </View>
            </View>
        );
    };

    // AI Tip Card (Floating Gold Card)
    const AiTipCard = () => {
        const aiTip = analytics?.aiTip;
        if (!aiTip) return null;

        return (
            <LinearGradient
                colors={['rgba(212, 175, 55, 0.95)', 'rgba(180, 140, 30, 0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.aiTipCard}
            >
                <View style={styles.aiTipHeader}>
                    <View style={styles.aiTipIcon}>
                        <Ionicons name="flash" size={16} color={COLORS.GOLD} />
                    </View>
                    <Text style={styles.aiTipTitle}>{aiTip.title}</Text>
                </View>
                <Text style={styles.aiTipDescription}>
                    Move <Text style={styles.aiTipHighlight}>${aiTip.surplus?.toLocaleString()}</Text> to your HISA for an extra{' '}
                    <Text style={styles.aiTipHighlight}>${aiTip.potentialEarnings}/mo</Text> interest.
                </Text>
                <TouchableOpacity style={styles.aiTipButton}>
                    <Text style={styles.aiTipButtonText}>{aiTip.action}</Text>
                    <Ionicons name="flash" size={14} color="#0D0D0D" />
                </TouchableOpacity>
            </LinearGradient>
        );
    };

    // Spending by Intent Card
    const SpendingByIntentCard = () => {
        const spendingByIntent = analytics?.spendingByIntent;
        if (!spendingByIntent) return null;

        const intentItems = [
            {
                key: 'fixedNeeds',
                icon: 'home',
                color: '#FF9500',
                ...spendingByIntent.fixedNeeds
            },
            {
                key: 'growth',
                icon: 'trending-up',
                color: COLORS.GREEN,
                ...spendingByIntent.growth
            },
            {
                key: 'lifestyle',
                icon: 'heart',
                color: '#AF52DE',
                ...spendingByIntent.lifestyle
            },
        ];

        return (
            <View style={styles.sectionCard}>
                {intentItems.map((item) => (
                    <View key={item.key} style={styles.intentRow}>
                        <View style={[styles.intentIcon, { backgroundColor: item.color + '20' }]}>
                            <Ionicons name={item.icon} size={16} color={item.color} />
                        </View>
                        <Text style={styles.intentLabel}>{item.label}</Text>
                        <Text style={styles.intentAmount}>{formatCurrency(item.amount)}</Text>
                    </View>
                ))}
            </View>
        );
    };

    // Top Leakage Card
    const TopLeakageCard = () => {
        const topMerchant = analytics?.topMerchant;
        if (!topMerchant) return null;

        const isUp = topMerchant.changePercent > 0;

        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Top Leakage</Text>

                <View style={styles.merchantRow}>
                    <View style={styles.merchantIcon}>
                        <Text style={styles.merchantInitial}>
                            {topMerchant.name?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                    </View>
                    <View style={styles.merchantInfo}>
                        <Text style={styles.merchantName}>{topMerchant.name}</Text>
                        <Text style={styles.merchantCategory}>{topMerchant.category}</Text>
                    </View>
                    <View style={styles.merchantAmountContainer}>
                        <Text style={styles.merchantAmount}>{formatCurrency(topMerchant.amount)}</Text>
                        <Text style={[
                            styles.merchantChange,
                            { color: isUp ? COLORS.RED : COLORS.GREEN }
                        ]}>
                            {isUp ? '↑' : '↓'} {Math.abs(topMerchant.changePercent)}%
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    // AI Insight Footer
    const AiInsightFooter = () => {
        const aiTip = analytics?.aiTip;

        return (
            <View style={styles.insightFooter}>
                <Text style={styles.insightLabel}>AI INSIGHT</Text>
                <Text style={styles.insightText}>
                    {aiTip?.description || 'Analyzing your spending patterns...'}
                </Text>
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            <Header />

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
                <TimePeriodToggle />
                <NetWorthCard />
                <BurnRateCard />
                <AiTipCard />
                <SpendingByIntentCard />
                <TopLeakageCard />
                <AiInsightFooter />
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
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: COLORS.CARD_BG,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    notificationButton: {
        padding: SPACING.SMALL,
    },

    // Period Toggle
    periodContainer: {
        flexDirection: 'row',
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
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
        backgroundColor: COLORS.CARD_BORDER,
    },
    periodButtonText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 13,
        fontWeight: '600',
    },
    periodButtonTextActive: {
        color: COLORS.WHITE,
    },

    // Net Worth Card
    netWorthCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
    },
    netWorthHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.TINY,
    },
    netWorthLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
    },
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    changeBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    netWorthAmount: {
        color: COLORS.WHITE,
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: SPACING.MEDIUM,
    },
    lineChartContainer: {
        height: 100,
        marginBottom: SPACING.MEDIUM,
        position: 'relative',
    },
    lineChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: '100%',
    },
    chartPointWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    chartPoint: {
        width: 3,
        borderRadius: 2,
    },
    chartGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
    },
    narrativeText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        lineHeight: 18,
    },

    // Section Cards
    sectionCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    statusBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },

    // Progress Bars
    progressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    progressLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        letterSpacing: 0.5,
    },
    progressValue: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: '600',
    },
    progressBarBg: {
        height: 6,
        backgroundColor: COLORS.CARD_BORDER,
        borderRadius: 3,
        marginBottom: SPACING.MEDIUM,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },

    // AI Tip Card
    aiTipCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.XL,
    },
    aiTipHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    aiTipIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    aiTipTitle: {
        color: '#0D0D0D',
        fontSize: 14,
        fontWeight: '600',
    },
    aiTipDescription: {
        color: '#0D0D0D',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: SPACING.MEDIUM,
    },
    aiTipHighlight: {
        fontWeight: '700',
    },
    aiTipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0D0D0D',
        paddingVertical: SPACING.SMALL + 2,
        borderRadius: BORDER_RADIUS.XL,
    },
    aiTipButtonText: {
        color: COLORS.GOLD,
        fontSize: 14,
        fontWeight: '600',
        marginRight: 6,
    },

    // Spending by Intent
    intentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
    },
    intentIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    intentLabel: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 14,
    },
    intentAmount: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '600',
    },

    // Top Leakage
    merchantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
    },
    merchantIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.CARD_BORDER,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    merchantInitial: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
    },
    merchantInfo: {
        flex: 1,
    },
    merchantName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '500',
    },
    merchantCategory: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
    },
    merchantAmountContainer: {
        alignItems: 'flex-end',
    },
    merchantAmount: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '600',
    },
    merchantChange: {
        fontSize: 12,
        fontWeight: '500',
    },

    // AI Insight Footer
    insightFooter: {
        marginHorizontal: SPACING.MEDIUM,
        marginTop: SPACING.SMALL,
        paddingTop: SPACING.MEDIUM,
    },
    insightLabel: {
        color: COLORS.TEXT_MUTED,
        fontSize: 10,
        letterSpacing: 1,
        marginBottom: 4,
    },
    insightText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        lineHeight: 18,
    },
});

export default AnalyticsScreen;
