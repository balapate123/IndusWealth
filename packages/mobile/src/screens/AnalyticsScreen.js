import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
    Animated,
    Modal,
    FlatList,
} from 'react-native';
import { Svg, Circle, G, Path, Defs, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';
import { categorizeTransaction } from '../utils/categorization';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Category colors for donut chart
const CATEGORY_COLORS = [
    '#4ECDC4', // Teal
    '#FF6B6B', // Red
    '#45B7D1', // Blue
    '#96CEB4', // Green
    '#FFEAA7', // Yellow
    '#DDA0DD', // Plum
    '#98D8C8', // Mint
    '#F7DC6F', // Gold
    '#BB8FCE', // Purple
    '#85C1E9', // Light Blue
];

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
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [categoryTransactions, setCategoryTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [accounts, setAccounts] = useState([]);

    // Account colors for transaction color coding
    const ACCOUNT_COLORS = {
        'checking': '#4ECDC4',
        'savings': '#45B7D1',
        'credit': '#FF6B6B',
        'investment': '#96CEB4',
        'default': '#FFEAA7'
    };

    const fetchAnalytics = useCallback(async (forceRefresh = false) => {
        try {
            // If refreshing, first trigger a transactions sync
            if (forceRefresh) {
                console.log('🔄 Force refreshing transactions before analytics...');
                await api.getTransactions('?refresh=true&limit=100');
            }

            // Fetch both analytics and accounts in parallel
            const [analyticsData, accountsData] = await Promise.all([
                api.getAnalytics(selectedPeriod, forceRefresh),
                api.getAccounts()
            ]);

            if (analyticsData?.success) {
                setAnalytics(analyticsData);
            }
            if (accountsData?.success && accountsData?.accounts) {
                setAccounts(accountsData.accounts);
            }
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
        fetchAnalytics(true); // Force refresh when pull-to-refresh
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

    // Normalize category names for comparison (handles "Transfer" vs "Transfers", case differences)
    const normalizeCategory = (cat) => {
        if (!cat) return '';
        return cat.toLowerCase()
            .replace(/s$/, '')  // Remove trailing 's' for singular/plural match
            .replace(/\s+/g, '') // Remove spaces
            .replace(/[&]/g, 'and'); // Normalize '&' to 'and'
    };

    // Handle category click - fetch transactions for that category
    const handleCategoryPress = async (category) => {
        // Prevent double-triggering if already loading
        if (loadingTransactions || categoryModalVisible) return;

        // Clear previous transactions immediately and show modal with loading
        setCategoryTransactions([]);
        setSelectedCategory(category);
        setLoadingTransactions(true);
        setCategoryModalVisible(true);

        try {
            const response = await api.getTransactions(`?limit=500`);
            // Backend returns { success: true, data: [...transactions...] }
            if (response?.success && response?.data) {
                const targetCategory = normalizeCategory(category.category);

                const filtered = response.data.filter(tx => {
                    // Only include expenses (positive amounts in Plaid's convention)
                    if (parseFloat(tx.amount) <= 0) return false;

                    // Get the transaction's category
                    let txCategoryName;
                    if (tx.category && tx.category.length > 0 && tx.category[0]) {
                        txCategoryName = tx.category[0];
                    } else {
                        const categorized = categorizeTransaction(tx);
                        txCategoryName = categorized.category;
                    }

                    // Normalize and compare - handles "Transfer" vs "Transfers" etc.
                    return normalizeCategory(txCategoryName) === targetCategory;
                });

                // Sort by date descending
                filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
                setCategoryTransactions(filtered);
            }
        } catch (err) {
            console.error('Error fetching category transactions:', err);
        } finally {
            setLoadingTransactions(false);
        }
    };

    // Memoize category data to prevent unnecessary re-renders
    const categoryData = useMemo(() => {
        const breakdown = analytics?.charts?.categoryBreakdown || [];
        const total = breakdown.reduce((sum, cat) => sum + cat.amount, 0);

        return breakdown.slice(0, 10).map((cat, index) => ({
            ...cat,
            percentage: total > 0 ? (cat.amount / total * 100) : 0,
            // Always use frontend colors to ensure visibility
            color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        }));
    }, [analytics?.charts?.categoryBreakdown]);

    // Horizontal Stacked Bar Chart - more reliable than SVG
    const CategoryBarChart = ({ data }) => {
        const [activeCategory, setActiveCategory] = useState(null);

        if (!data || data.length === 0) {
            return (
                <View style={styles.emptyChart}>
                    <Ionicons name="bar-chart-outline" size={48} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.emptyChartText}>No spending data</Text>
                </View>
            );
        }

        const total = data.reduce((sum, cat) => sum + cat.amount, 0);

        return (
            <View style={styles.barChartContainer}>
                {/* Stacked horizontal bar */}
                <View style={styles.stackedBar}>
                    {data.map((cat, index) => (
                        <TouchableOpacity
                            key={cat.category}
                            style={[
                                styles.barSegment,
                                {
                                    flex: cat.percentage,
                                    backgroundColor: cat.color,
                                    opacity: activeCategory && activeCategory !== cat.category ? 0.4 : 1,
                                    borderTopLeftRadius: index === 0 ? 8 : 0,
                                    borderBottomLeftRadius: index === 0 ? 8 : 0,
                                    borderTopRightRadius: index === data.length - 1 ? 8 : 0,
                                    borderBottomRightRadius: index === data.length - 1 ? 8 : 0,
                                }
                            ]}
                            onPress={() => setActiveCategory(activeCategory === cat.category ? null : cat.category)}
                            activeOpacity={0.8}
                        />
                    ))}
                </View>

                {/* Selected category tooltip */}
                {activeCategory ? (
                    <View style={[
                        styles.categoryTooltip,
                        { backgroundColor: data.find(c => c.category === activeCategory)?.color || COLORS.GOLD }
                    ]}>
                        <Text style={styles.categoryTooltipText}>
                            {activeCategory}: {formatCompactCurrency(data.find(c => c.category === activeCategory)?.amount || 0)}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.categoryTooltipPlaceholder}>
                        <Text style={styles.categoryTooltipPlaceholderText}>Tap a segment</Text>
                    </View>
                )}

                {/* Total amount */}
                <Text style={styles.barChartTotal}>
                    Total: {formatCurrency(total)}
                </Text>
            </View>
        );
    };

    // Category Breakdown Card with Donut Chart and List
    const CategoryBreakdownCard = () => {
        const total = categoryData.reduce((sum, cat) => sum + cat.amount, 0);

        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Spending by Category</Text>

                {/* Category Bar Chart */}
                <CategoryBarChart data={categoryData} />

                {/* Category List */}
                <View style={styles.categoryList}>
                    {categoryData.map((cat, index) => (
                        <TouchableOpacity
                            key={cat.category}
                            style={styles.categoryRow}
                            onPress={() => handleCategoryPress(cat)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                            <View style={styles.categoryInfo}>
                                <Text style={styles.categoryName}>{cat.category}</Text>
                                <Text style={styles.categoryCount}>{cat.count} transactions</Text>
                            </View>
                            <View style={styles.categoryAmountContainer}>
                                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                                <Text style={styles.categoryPercentage}>{cat.percentage.toFixed(1)}%</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.TEXT_MUTED} />
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        );
    };

    // Category Transactions Modal
    const CategoryTransactionsModal = () => (
        <Modal
            visible={categoryModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setCategoryModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                        <View style={styles.modalTitleRow}>
                            <View style={[
                                styles.modalCategoryDot,
                                { backgroundColor: selectedCategory?.color || COLORS.GOLD }
                            ]} />
                            <Text style={styles.modalTitle}>
                                {selectedCategory?.category || 'Category'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setCategoryModalVisible(false)}
                            style={styles.modalCloseButton}
                        >
                            <Ionicons name="close" size={24} color={COLORS.WHITE} />
                        </TouchableOpacity>
                    </View>

                    {/* Summary */}
                    <View style={styles.modalSummary}>
                        <Text style={styles.modalSummaryAmount}>
                            {formatCurrency(selectedCategory?.amount || 0)}
                        </Text>
                        <Text style={styles.modalSummaryLabel}>
                            {loadingTransactions ? 'Loading...' : `${categoryTransactions.length} transactions in this period`}
                        </Text>
                    </View>

                    {/* Transaction List */}
                    {loadingTransactions ? (
                        <View style={styles.modalLoading}>
                            <ActivityIndicator size="small" color={COLORS.GOLD} />
                        </View>
                    ) : (
                        <FlatList
                            data={categoryTransactions}
                            keyExtractor={(item, index) => item.id?.toString() || item.transaction_id || `tx-${index}`}
                            renderItem={({ item }) => {
                                // Get account color based on account type or id
                                const getAccountColor = () => {
                                    const account = accounts.find(a => a.account_id === item.account_id);
                                    if (account) {
                                        return ACCOUNT_COLORS[account.subtype] ||
                                            ACCOUNT_COLORS[account.type] ||
                                            ACCOUNT_COLORS.default;
                                    }
                                    return ACCOUNT_COLORS.default;
                                };
                                const accountColor = getAccountColor();

                                return (
                                    <View style={styles.transactionRow}>
                                        <View style={[styles.transactionIcon, { borderLeftWidth: 3, borderLeftColor: accountColor }]}>
                                            <Ionicons
                                                name="receipt-outline"
                                                size={16}
                                                color={accountColor}
                                            />
                                        </View>
                                        <View style={styles.transactionInfo}>
                                            <Text style={styles.transactionName} numberOfLines={1}>
                                                {item.merchant_name || item.name}
                                            </Text>
                                            <Text style={styles.transactionDate}>
                                                {new Date(item.date).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </Text>
                                        </View>
                                        <Text style={[styles.transactionAmount, { color: COLORS.RED }]}>
                                            -${Math.abs(item.amount).toFixed(2)}
                                        </Text>
                                    </View>
                                );
                            }}
                            style={styles.transactionList}
                            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
                            showsVerticalScrollIndicator={true}
                            ListEmptyComponent={
                                <View style={styles.emptyTransactions}>
                                    <Ionicons name="document-text-outline" size={40} color={COLORS.TEXT_MUTED} />
                                    <Text style={styles.emptyTransactionsText}>
                                        No transactions found for this category
                                    </Text>
                                </View>
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
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

        // Smooth area chart using SVG with interactive touch points
        const [selectedDataPoint, setSelectedDataPoint] = useState(null);

        const renderAreaChart = () => {
            if (netWorthTrend.length < 2) return null;

            const data = netWorthTrend.slice(-20);
            const values = data.map(d => d.value);
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            const range = maxValue - minValue || 1;

            const chartWidth = 340;
            const chartHeight = 120;
            const tooltipHeight = 25;
            const padding = 10;

            // Generate smooth path points
            const points = data.map((point, index) => {
                const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
                const y = tooltipHeight + chartHeight - padding - ((point.value - minValue) / range) * (chartHeight - 2 * padding);
                return { x, y, value: point.value, date: point.date };
            });

            // Create smooth curve path using quadratic bezier
            let linePath = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const midX = (prev.x + curr.x) / 2;
                linePath += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
            }
            const lastPoint = points[points.length - 1];
            linePath += ` T ${lastPoint.x} ${lastPoint.y}`;

            // Area path (same as line but closes to bottom)
            const areaPath = linePath +
                ` L ${lastPoint.x} ${tooltipHeight + chartHeight} L ${points[0].x} ${tooltipHeight + chartHeight} Z`;

            // Baseline (average line)
            const avgY = tooltipHeight + chartHeight - padding - (0.3 * (chartHeight - 2 * padding));

            return (
                <View style={styles.areaChartContainer}>
                    <Svg width={chartWidth} height={chartHeight + tooltipHeight}>
                        <Defs>
                            <SvgLinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0%" stopColor={COLORS.TEAL} stopOpacity="0.4" />
                                <Stop offset="100%" stopColor={COLORS.TEAL} stopOpacity="0.05" />
                            </SvgLinearGradient>
                        </Defs>

                        {/* Gradient fill area */}
                        <Path
                            d={areaPath}
                            fill="url(#areaGradient)"
                        />

                        {/* Dashed baseline */}
                        <Path
                            d={`M ${padding} ${avgY} L ${chartWidth - padding} ${avgY}`}
                            stroke={COLORS.TEXT_MUTED}
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            fill="none"
                        />

                        {/* Main line */}
                        <Path
                            d={linePath}
                            stroke={COLORS.TEAL}
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* Selected point indicator */}
                        {selectedDataPoint !== null && points[selectedDataPoint] && (
                            <>
                                <Path
                                    d={`M ${points[selectedDataPoint].x} ${points[selectedDataPoint].y} L ${points[selectedDataPoint].x} ${tooltipHeight + chartHeight}`}
                                    stroke={COLORS.TEAL}
                                    strokeWidth="1"
                                    strokeDasharray="3,3"
                                    fill="none"
                                />
                                <Circle
                                    cx={points[selectedDataPoint].x}
                                    cy={points[selectedDataPoint].y}
                                    r={6}
                                    fill={COLORS.TEAL}
                                    stroke={COLORS.WHITE}
                                    strokeWidth={2}
                                />
                            </>
                        )}
                    </Svg>

                    {/* TouchableOpacity overlay for interaction */}
                    {points.map((point, index) => (
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

                    {/* Tooltip above chart */}
                    {selectedDataPoint !== null && points[selectedDataPoint] && (
                        <View style={[styles.chartTooltip, { left: Math.max(10, Math.min(points[selectedDataPoint].x - 50, chartWidth - 110)) }]}>
                            <Text style={styles.chartTooltipAmount}>
                                {formatCompactCurrency(points[selectedDataPoint].value)}
                            </Text>
                            <Text style={styles.chartTooltipDate}>
                                {new Date(points[selectedDataPoint].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                        </View>
                    )}
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

                {renderAreaChart()}

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
                <CategoryBreakdownCard />
                <AiTipCard />
                <SpendingByIntentCard />
                <TopLeakageCard />
                <AiInsightFooter />
            </ScrollView>

            {/* Category Transactions Modal */}
            <CategoryTransactionsModal />
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
    // Area Chart
    areaChartContainer: {
        marginVertical: SPACING.MEDIUM,
        alignItems: 'center',
        overflow: 'visible',
        position: 'relative',
    },
    chartTooltip: {
        position: 'absolute',
        top: 0,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: COLORS.TEAL,
    },
    chartTooltipAmount: {
        color: COLORS.TEAL,
        fontSize: 14,
        fontWeight: 'bold',
    },
    chartTooltipDate: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
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

    // Bar Chart
    barChartContainer: {
        alignItems: 'center',
        marginVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.SMALL,
    },
    stackedBar: {
        flexDirection: 'row',
        width: '100%',
        height: 32,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: COLORS.CARD_BORDER,
    },
    barSegment: {
        height: '100%',
    },
    barChartTotal: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        fontWeight: '600',
        marginTop: SPACING.MEDIUM,
    },
    categoryTooltip: {
        marginTop: SPACING.SMALL,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 100,
        alignItems: 'center',
    },
    categoryTooltipText: {
        color: COLORS.WHITE,
        fontSize: 13,
        fontWeight: '600',
    },
    categoryTooltipPlaceholder: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 100,
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BORDER,
    },
    categoryTooltipPlaceholderText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
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


    // Category List
    categoryList: {
        marginTop: SPACING.SMALL,
    },
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 2,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    categoryDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: SPACING.SMALL,
    },
    categoryInfo: {
        flex: 1,
    },
    categoryName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '500',
    },
    categoryCount: {
        color: COLORS.TEXT_MUTED,
        fontSize: 11,
        marginTop: 2,
    },
    categoryAmountContainer: {
        alignItems: 'flex-end',
        marginRight: SPACING.SMALL,
    },
    categoryAmount: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontWeight: '600',
    },
    categoryPercentage: {
        color: COLORS.GOLD,
        fontSize: 11,
        marginTop: 2,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        maxHeight: '80%',
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalCategoryDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        marginRight: SPACING.SMALL,
    },
    modalTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    modalCloseButton: {
        padding: SPACING.SMALL,
    },
    modalSummary: {
        padding: SPACING.MEDIUM,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    modalSummaryAmount: {
        color: COLORS.WHITE,
        fontSize: 28,
        fontWeight: 'bold',
    },
    modalSummaryLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginTop: 4,
    },
    modalLoading: {
        padding: SPACING.XL,
        alignItems: 'center',
    },
    transactionList: {
        paddingHorizontal: SPACING.MEDIUM,
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 4,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    transactionIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.BACKGROUND,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    transactionInfo: {
        flex: 1,
    },
    transactionName: {
        color: COLORS.WHITE,
        fontSize: 14,
    },
    transactionDate: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginTop: 2,
    },
    transactionAmount: {
        fontSize: 14,
        fontWeight: '600',
    },
    emptyTransactions: {
        padding: SPACING.XL,
        alignItems: 'center',
    },
    emptyTransactionsText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 14,
    },
});

export default AnalyticsScreen;
