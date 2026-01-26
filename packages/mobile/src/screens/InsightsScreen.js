import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Linking,
    Dimensions,
    Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import api from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.LARGE * 2;

// Priority badge configuration
const PRIORITY_CONFIG = {
    high: {
        color: COLORS.RED,
        bgColor: 'rgba(255, 107, 107, 0.15)',
        icon: 'alert-circle',
        label: 'High Priority',
    },
    medium: {
        color: '#FFA726',
        bgColor: 'rgba(255, 167, 38, 0.15)',
        icon: 'information-circle',
        label: 'Medium Priority',
    },
    low: {
        color: COLORS.GOLD_LIGHT,
        bgColor: 'rgba(229, 192, 72, 0.15)',
        icon: 'checkmark-circle',
        label: 'Low Priority',
    },
};

// Category icon mapping
const CATEGORY_ICONS = {
    'Tax-Advantaged Account Opportunities': 'trending-up',
    'Spending Optimization': 'cut',
    'Debt Payoff Acceleration': 'card',
    'Savings Acceleration': 'wallet',
    'Cash Flow Optimization': 'cash',
    'Investment Readiness': 'bar-chart',
    'Milestone Celebrations': 'trophy',
};

const InsightsScreen = ({ navigation, route }) => {
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState('');
    const [isFromBankConnection, setIsFromBankConnection] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const loadInsights = useCallback(async (forceRefresh = false, isRetry = false) => {
        try {
            setError(null);
            if (!forceRefresh && !isRetry) {
                setLoading(true);
            }

            const response = await api.getInsights(forceRefresh);

            if (response.success && response.data) {
                setInsights(response.data.insights || []);
                setSummary(response.data.summary || '');
                setRetryCount(0); // Reset retry count on success
            }
        } catch (err) {
            console.error('Failed to load insights:', err);

            // If this is from a new bank connection and we have few/no insights, retry
            if (isFromBankConnection && retryCount < 2) {
                console.log(`Retrying insights load (attempt ${retryCount + 1}/2)...`);
                setRetryCount(prev => prev + 1);
                // Wait 3 seconds and retry
                setTimeout(() => {
                    loadInsights(true, true);
                }, 3000);
                return; // Don't set error or stop loading yet
            }

            setError(err.parsedError?.message || 'Failed to load insights');
        } finally {
            if (!isFromBankConnection || retryCount >= 2) {
                setLoading(false);
                setRefreshing(false);
                setIsFromBankConnection(false);
            }
        }
    }, [isFromBankConnection, retryCount]);

    useEffect(() => {
        loadInsights();
    }, [loadInsights]);

    // Handle navigation from bank connection success
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            // Check if we're coming from bank connection
            if (route.params?.forceRefresh && route.params?.fromBankConnection) {
                setIsFromBankConnection(true);
                setLoading(true);
                setRetryCount(0);

                // First fetch transactions to ensure they're synced, then load insights
                const syncAndLoadInsights = async () => {
                    try {
                        console.log('🔄 Syncing transactions before loading insights...');
                        // Force fetch transactions first to populate the database
                        await api.getTransactions('?refresh=true'); // force refresh
                        console.log('✅ Transactions synced, now loading insights...');
                        // Now load insights with the fresh data
                        await loadInsights(true);
                    } catch (err) {
                        console.error('Error during sync and insights load:', err);
                        setError('Failed to sync data. Please try again.');
                        setLoading(false);
                        setIsFromBankConnection(false);
                    }
                };

                syncAndLoadInsights();

                // Clear the params to avoid re-triggering
                navigation.setParams({ forceRefresh: false, fromBankConnection: false });
            }
        });

        return unsubscribe;
    }, [navigation, route.params, loadInsights]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadInsights(true);
    };

    const handleAction = async (action, insightId) => {
        if (!action) return;

        try {
            if (action.type === 'web_link' && action.url) {
                const supported = await Linking.canOpenURL(action.url);
                if (supported) {
                    await Linking.openURL(action.url);
                } else {
                    console.error('Cannot open URL:', action.url);
                }
            } else if (action.type === 'navigate' && action.route) {
                navigation.navigate(action.route, action.params || {});
            }
        } catch (err) {
            console.error('Failed to handle action:', err);
        }
    };

    const handleDismiss = async (insightId) => {
        // Optimistically remove from UI
        setInsights(prev => prev.filter(i => i.id !== insightId));

        try {
            await api.dismissInsight(insightId);
        } catch (err) {
            console.error('Failed to dismiss insight:', err);
            // Reload on error
            loadInsights();
        }
    };

    const renderInsightCard = (insight) => {
        const priority = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
        const categoryIcon = CATEGORY_ICONS[insight.type] || 'bulb';

        return (
            <View key={insight.id} style={styles.insightCard}>
                {/* Priority Badge */}
                <View style={[styles.priorityBadge, { backgroundColor: priority.bgColor }]}>
                    <Ionicons name={priority.icon} size={14} color={priority.color} />
                    <Text style={[styles.priorityText, { color: priority.color }]}>
                        {priority.label}
                    </Text>
                </View>

                {/* Header with Category Icon */}
                <View style={styles.cardHeader}>
                    <View style={styles.categoryIconContainer}>
                        <Ionicons name={categoryIcon} size={24} color={COLORS.GOLD} />
                    </View>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.categoryText}>{insight.type}</Text>
                        <Text style={styles.insightTitle}>{insight.title}</Text>
                    </View>
                </View>

                {/* Description */}
                <Text style={styles.description}>{insight.description}</Text>

                {/* Reasoning (if available) */}
                {insight.reasoning && insight.reasoning.length > 0 && (
                    <View style={styles.reasoningContainer}>
                        <Text style={styles.reasoningLabel}>Why this matters:</Text>
                        {insight.reasoning.slice(0, 3).map((reason, index) => (
                            <View key={index} style={styles.reasoningItem}>
                                <View style={styles.bulletDot} />
                                <Text style={styles.reasoningText}>{reason}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Potential Benefit */}
                {insight.potential_benefit && (
                    <View style={styles.benefitContainer}>
                        <View style={styles.benefitCard}>
                            <Ionicons name="trending-up" size={20} color={COLORS.GREEN} />
                            <View style={styles.benefitTextContainer}>
                                <Text style={styles.benefitLabel}>Potential Savings</Text>
                                <View style={styles.benefitAmounts}>
                                    {insight.potential_benefit.monthly_savings > 0 && (
                                        <Text style={styles.benefitAmount}>
                                            ${insight.potential_benefit.monthly_savings}/mo
                                        </Text>
                                    )}
                                    {insight.potential_benefit.annual_savings > 0 && (
                                        <Text style={styles.benefitAnnual}>
                                            ${insight.potential_benefit.annual_savings.toLocaleString()}/yr
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </View>
                        {insight.potential_benefit.calculation && (
                            <Text style={styles.calculationText}>
                                {insight.potential_benefit.calculation}
                            </Text>
                        )}
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionContainer}>
                    {insight.action?.primary && (
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => handleAction(insight.action.primary, insight.id)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.primaryButtonText}>
                                {insight.action.primary.label}
                            </Text>
                            <Ionicons
                                name={insight.action.primary.type === 'web_link' ? 'open-outline' : 'arrow-forward'}
                                size={18}
                                color={COLORS.BACKGROUND}
                            />
                        </TouchableOpacity>
                    )}

                    {insight.action?.secondary && (
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={() => handleAction(insight.action.secondary, insight.id)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.secondaryButtonText}>
                                {insight.action.secondary.label}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Dismiss Button */}
                {insight.dismissible && (
                    <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={() => handleDismiss(insight.id)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="close-circle-outline" size={16} color={COLORS.TEXT_SECONDARY} />
                        <Text style={styles.dismissText}>Dismiss</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>AI Insights</Text>
                    <Text style={styles.headerSubtitle}>Personalized financial recommendations</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.GOLD} />
                    <Text style={styles.loadingText}>
                        {isFromBankConnection
                            ? retryCount > 0
                                ? 'Waiting for transactions to sync...'
                                : 'Categorizing transactions and generating insights...'
                            : 'Analyzing your finances...'}
                    </Text>
                    {isFromBankConnection && (
                        <Text style={styles.loadingSubtext}>
                            {retryCount > 0
                                ? `Your bank is syncing data (${retryCount}/2)...`
                                : 'This may take a moment as we analyze your financial data'}
                        </Text>
                    )}
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>AI Insights</Text>
                    <Text style={styles.headerSubtitle}>Personalized financial recommendations</Text>
                </View>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={COLORS.RED} />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => loadInsights()}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>AI Insights</Text>
                        <Text style={styles.headerSubtitle}>Personalized financial recommendations</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.infoButton}
                        onPress={() => {/* Show info modal */}}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="information-circle-outline" size={24} color={COLORS.GOLD} />
                    </TouchableOpacity>
                </View>

                {summary && (
                    <View style={styles.summaryCard}>
                        <Ionicons name="sparkles" size={18} color={COLORS.GOLD} />
                        <Text style={styles.summaryText}>{summary}</Text>
                    </View>
                )}
            </View>

            {/* Insights List */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={COLORS.GOLD}
                        colors={[COLORS.GOLD]}
                    />
                }
            >
                {insights.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.GREEN} />
                        <Text style={styles.emptyTitle}>You're all set!</Text>
                        <Text style={styles.emptyText}>
                            No new insights right now. Keep up the great work managing your finances!
                        </Text>
                    </View>
                ) : (
                    insights.map(renderInsightCard)
                )}

                {/* Bottom Spacer for Tab Bar */}
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: COLORS.WHITE,
        marginBottom: SPACING.TINY,
    },
    headerSubtitle: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
    },
    infoButton: {
        padding: SPACING.TINY,
    },
    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(201, 162, 39, 0.3)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    summaryText: {
        flex: 1,
        fontSize: 13,
        color: COLORS.GOLD_LIGHT,
        lineHeight: 18,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.SMALL,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
    },
    loadingText: {
        fontSize: 16,
        color: COLORS.TEXT_SECONDARY,
    },
    loadingSubtext: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        textAlign: 'center',
        maxWidth: '80%',
        marginTop: SPACING.SMALL,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.LARGE,
        gap: SPACING.MEDIUM,
    },
    errorText: {
        fontSize: 16,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
    },
    retryButton: {
        backgroundColor: COLORS.GOLD,
        paddingHorizontal: SPACING.LARGE,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.SMALL,
    },
    retryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.BACKGROUND,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.XL * 2,
        gap: SPACING.MEDIUM,
    },
    emptyTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    emptyText: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        maxWidth: '80%',
        lineHeight: 20,
    },
    insightCard: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        marginBottom: SPACING.LARGE,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: SPACING.TINY,
        borderRadius: BORDER_RADIUS.SMALL,
        gap: SPACING.TINY,
        marginBottom: SPACING.MEDIUM,
    },
    priorityText: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
    },
    categoryIconContainer: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTextContainer: {
        flex: 1,
    },
    categoryText: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.TINY,
    },
    insightTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.WHITE,
        lineHeight: 24,
    },
    description: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        lineHeight: 20,
        marginBottom: SPACING.MEDIUM,
    },
    reasoningContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    reasoningLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        marginBottom: SPACING.SMALL,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    reasoningItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    bulletDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.GOLD,
        marginTop: 6,
    },
    reasoningText: {
        flex: 1,
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        lineHeight: 18,
    },
    benefitContainer: {
        marginBottom: SPACING.MEDIUM,
    },
    benefitCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.3)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
    },
    benefitTextContainer: {
        flex: 1,
    },
    benefitLabel: {
        fontSize: 11,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.TINY,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    benefitAmounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
    },
    benefitAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.GREEN,
    },
    benefitAnnual: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GREEN,
        opacity: 0.8,
    },
    calculationText: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.SMALL,
        lineHeight: 16,
    },
    actionContainer: {
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
        gap: SPACING.SMALL,
    },
    primaryButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.BACKGROUND,
    },
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    secondaryButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GOLD,
    },
    dismissButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.TINY,
        paddingVertical: SPACING.SMALL,
    },
    dismissText: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
    },
    bottomSpacer: {
        height: 120,
    },
});

export default InsightsScreen;
