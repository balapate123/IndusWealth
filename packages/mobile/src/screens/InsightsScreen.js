import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';
import ArticleCard from '../components/ArticleCard';
import FinancialHealthScore from '../components/FinancialHealthScore';
import InsightCardV2 from '../components/InsightCardV2';
import InvestmentCorner from '../components/InvestmentCorner';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
    { key: 'all', label: 'All' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

const InsightsScreen = ({ navigation, route }) => {
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState('');
    const [isFromBankConnection, setIsFromBankConnection] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [academyArticles, setAcademyArticles] = useState([]);
    const [academyLoading, setAcademyLoading] = useState(true);
    const [healthScore, setHealthScore] = useState(null);
    const [activeTab, setActiveTab] = useState('all');

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
                setHealthScore(response.data.health_score || null);
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

    // Load Wealth Academy articles
    const loadAcademyArticles = useCallback(async () => {
        try {
            setAcademyLoading(true);
            const response = await api.getEducationalArticles(null, 1, 10);

            if (response.success && response.data) {
                const articles = response.data.articles || [];
                setAcademyArticles(articles);
            }
        } catch (err) {
            console.error('Failed to load academy articles:', err);
        } finally {
            setAcademyLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAcademyArticles();
    }, [loadAcademyArticles]);

    const handleArticlePress = (article) => {
        navigation.navigate('ArticleWebView', {
            url: article.external_url,
            title: article.title,
            articleId: article.id,
        });
    };

    const handleArticleBookmark = async (articleId, shouldBookmark) => {
        try {
            if (shouldBookmark) {
                await api.addArticleBookmark(articleId);
            } else {
                await api.removeArticleBookmark(articleId);
            }
            // Update local state
            setAcademyArticles(prev =>
                prev.map(article =>
                    article.id === articleId
                        ? { ...article, isBookmarked: shouldBookmark }
                        : article
                )
            );
        } catch (err) {
            console.error('Failed to update bookmark:', err);
        }
    };

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
                        console.log('Syncing transactions before loading insights...');
                        // Force fetch transactions first to populate the database
                        await api.getTransactions('?refresh=true'); // force refresh
                        console.log('Transactions synced, now loading insights...');
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

    // Filter insights by active tab
    const filteredInsights = useMemo(() => {
        if (activeTab === 'all') return insights;
        return insights.filter(i => i.priority === activeTab);
    }, [insights, activeTab]);

    // Count insights by priority for tab badges
    const priorityCounts = useMemo(() => ({
        all: insights.length,
        high: insights.filter(i => i.priority === 'high').length,
        medium: insights.filter(i => i.priority === 'medium').length,
        low: insights.filter(i => i.priority === 'low').length,
    }), [insights]);

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
                        onPress={() => {/* Show info modal */ }}
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
                {/* Financial Health Score */}
                <FinancialHealthScore healthScore={healthScore} />

                {/* Priority Tab Bar */}
                {insights.length > 0 && (
                    <View style={styles.tabBar}>
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.key;
                            const count = priorityCounts[tab.key];
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[styles.tab, isActive && styles.activeTab]}
                                    onPress={() => setActiveTab(tab.key)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                                        {tab.label}
                                    </Text>
                                    {count > 0 && (
                                        <View style={[styles.tabBadge, isActive && styles.activeTabBadge]}>
                                            <Text style={[styles.tabBadgeText, isActive && styles.activeTabBadgeText]}>
                                                {count}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* Insight Cards */}
                {filteredInsights.length === 0 && insights.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.GREEN} />
                        <Text style={styles.emptyTitle}>You're all set!</Text>
                        <Text style={styles.emptyText}>
                            No new insights right now. Keep up the great work managing your finances!
                        </Text>
                    </View>
                ) : filteredInsights.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="filter-outline" size={48} color={COLORS.TEXT_MUTED} />
                        <Text style={styles.emptyTitle}>No {activeTab} priority insights</Text>
                        <Text style={styles.emptyText}>
                            Try selecting a different filter to see more insights.
                        </Text>
                    </View>
                ) : (
                    filteredInsights.map((insight) => (
                        <InsightCardV2
                            key={insight.id}
                            insight={insight}
                            onAction={handleAction}
                            onDismiss={handleDismiss}
                        />
                    ))
                )}

                {/* Investment Corner */}
                <InvestmentCorner navigation={navigation} />

                {/* Wealth Academy Section */}
                {academyArticles.length > 0 && (
                    <View style={styles.academySection}>
                        <View style={styles.academySectionHeader}>
                            <View style={styles.academyTitleRow}>
                                <Ionicons name="school-outline" size={22} color={COLORS.GOLD} />
                                <Text style={styles.academySectionTitle}>Wealth Academy</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.viewAllButton}
                                onPress={() => navigation.navigate('WealthAcademy')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.viewAllText}>VIEW ALL</Text>
                                <Ionicons name="chevron-forward" size={14} color={COLORS.GOLD} />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.academySubtitle}>
                            Curated articles to help you grow your financial knowledge
                        </Text>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.academyScrollContent}
                        >
                            {academyArticles.map((article) => (
                                <ArticleCard
                                    key={article.id}
                                    article={article}
                                    variant="horizontal"
                                    onPress={handleArticlePress}
                                    onBookmark={handleArticleBookmark}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Financial Disclaimer */}
                <View style={styles.disclaimerBanner}>
                    <Ionicons name="information-circle-outline" size={14} color="#888" />
                    <Text style={styles.disclaimerText}>
                        AI insights are for informational purposes only and do not constitute financial, investment, or tax advice. ETF data is approximate, updated quarterly, and may not reflect current market conditions. Past performance does not guarantee future results. Consult a qualified financial advisor before making investment decisions.
                    </Text>
                </View>

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
        color: COLORS.GOLD_LIGHT,
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
        color: COLORS.WHITE,
    },
    loadingSubtext: {
        fontSize: 13,
        color: COLORS.GOLD_LIGHT,
        textAlign: 'center',
        maxWidth: '80%',
        marginTop: SPACING.SMALL,
        opacity: 0.8,
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
        color: COLORS.WHITE,
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
    // Tab Bar
    tabBar: {
        flexDirection: 'row',
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.SMALL,
        backgroundColor: 'rgba(255,255,255,0.06)',
        gap: 6,
    },
    activeTab: {
        backgroundColor: COLORS.GOLD,
    },
    tabText: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        fontWeight: '500',
    },
    activeTabText: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
    },
    tabBadge: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    activeTabBadge: {
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    tabBadgeText: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        fontWeight: '600',
    },
    activeTabBadgeText: {
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
        color: COLORS.WHITE,
        textAlign: 'center',
        maxWidth: '80%',
        lineHeight: 20,
        opacity: 0.9,
    },
    bottomSpacer: {
        height: 120,
    },
    disclaimerBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.SMALL,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    disclaimerText: {
        flex: 1,
        fontSize: 11,
        color: '#888',
        lineHeight: 16,
    },
    // Wealth Academy styles
    academySection: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    academySectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.TINY,
    },
    academyTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    academySectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    viewAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.TINY,
    },
    viewAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        letterSpacing: 0.5,
    },
    academySubtitle: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.MEDIUM,
        opacity: 0.8,
    },
    academyScrollContent: {
        paddingRight: SPACING.LARGE,
    },
});

export default InsightsScreen;
