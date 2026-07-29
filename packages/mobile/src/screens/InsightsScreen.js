import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    Card,
    Text,
    Chip,
    ChipRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import { useAlert } from '../hooks/useAlert';
import CustomAlert from '../components/CustomAlert';
import ArticleCard from '../components/ArticleCard';
import FinancialHealthScore from '../components/FinancialHealthScore';
import InsightCardV2 from '../components/InsightCardV2';
import InvestmentCorner from '../components/InvestmentCorner';

const TABS = [
    { key: 'all', label: 'All' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

const makeStyles = (t) => StyleSheet.create({
    header: {
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.ACCENT_DIM,
        borderRadius: 12,
        padding: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    content: {
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.SMALL,
        paddingBottom: 120,
    },
    tabs: {
        paddingHorizontal: 0,
        marginBottom: SPACING.MEDIUM,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
    },
    academy: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    academyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    academyTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    viewAll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.TINY,
    },
    academyScroll: {
        paddingRight: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    disclaimer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM - 4,
        backgroundColor: t.SURFACE_SUNKEN,
        borderRadius: 8,
    },
});

const InsightsScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

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
    const { showAlert, alertProps } = useAlert();

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
                setRetryCount((prev) => prev + 1);
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
                setAcademyArticles(response.data.articles || []);
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
            setAcademyArticles((prev) =>
                prev.map((article) =>
                    article.id === articleId ? { ...article, isBookmarked: shouldBookmark } : article
                )
            );
        } catch (err) {
            console.error('Failed to update bookmark:', err);
        }
    };

    // Handle navigation from bank connection success
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            if (route.params?.forceRefresh && route.params?.fromBankConnection) {
                setIsFromBankConnection(true);
                setLoading(true);
                setRetryCount(0);

                const syncAndLoadInsights = async () => {
                    try {
                        console.log('Syncing transactions before loading insights...');
                        await api.getTransactions('?refresh=true');
                        console.log('Transactions synced, now loading insights...');
                        await loadInsights(true);
                    } catch (err) {
                        console.error('Error during sync and insights load:', err);
                        setError('Failed to sync data. Please try again.');
                        setLoading(false);
                        setIsFromBankConnection(false);
                    }
                };

                syncAndLoadInsights();

                navigation.setParams({ forceRefresh: false, fromBankConnection: false });
            }
        });

        return unsubscribe;
    }, [navigation, route.params, loadInsights]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadInsights(true);
    };

    const handleAction = async (action) => {
        if (!action) return;

        try {
            if (action.type === 'web_link' && action.url) {
                // Not guarded by canOpenURL: on Android it returns true for any
                // https:// string, so it never caught a bad link — it only hid
                // the real failure. Let openURL throw and say so.
                await Linking.openURL(action.url);
            } else if (action.type === 'navigate' && action.route) {
                navigation.navigate(action.route, action.params || {});
            } else {
                showAlert('Nothing to open', 'This suggestion has no action attached to it yet.');
            }
        } catch (err) {
            console.error('Failed to handle action:', err);
            showAlert(
                "Couldn't open that",
                action.type === 'web_link'
                    ? 'The link would not open. It may have moved — please let us know so we can fix it.'
                    : 'That screen could not be opened.'
            );
        }
    };

    const handleDismiss = async (insightId) => {
        // Optimistically remove from UI
        setInsights((prev) => prev.filter((i) => i.id !== insightId));

        try {
            await api.dismissInsight(insightId);
        } catch (err) {
            console.error('Failed to dismiss insight:', err);
            loadInsights();
        }
    };

    const filteredInsights = useMemo(() => {
        if (activeTab === 'all') return insights;
        return insights.filter((i) => i.priority === activeTab);
    }, [insights, activeTab]);

    const priorityCounts = useMemo(() => ({
        all: insights.length,
        high: insights.filter((i) => i.priority === 'high').length,
        medium: insights.filter((i) => i.priority === 'medium').length,
        low: insights.filter((i) => i.priority === 'low').length,
    }), [insights]);

    const pageHeader = (
        <View style={styles.header}>
            <View style={styles.headerTop}>
                <View style={{ flex: 1 }}>
                    <Text variant="hero">AI Insights</Text>
                    <Text variant="body" tone="secondary">Personalized financial recommendations</Text>
                </View>
            </View>

            {summary ? (
                <View style={styles.summaryCard}>
                    <Ionicons name="sparkles" size={18} color={theme.ACCENT} />
                    <Text variant="meta" tone="secondary" style={{ flex: 1 }}>{summary}</Text>
                </View>
            ) : null}
        </View>
    );

    if (loading) {
        return (
            <Screen header={pageHeader}>
                <View style={styles.centered}>
                    <LoadingState
                        message={
                            isFromBankConnection
                                ? retryCount > 0
                                    ? 'Waiting for transactions to sync...'
                                    : 'Categorizing transactions and generating insights...'
                                : 'Analyzing your finances...'
                        }
                    />
                    {isFromBankConnection && (
                        <Text variant="meta" tone="muted" style={{ textAlign: 'center', paddingHorizontal: SPACING.XL }}>
                            {retryCount > 0
                                ? `Your bank is syncing data (${retryCount}/2)...`
                                : 'This may take a moment as we analyze your financial data'}
                        </Text>
                    )}
                </View>
            </Screen>
        );
    }

    if (error) {
        return (
            <Screen header={pageHeader}>
                <View style={styles.centered}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load insights"
                        message={error}
                        actionLabel="Retry"
                        onAction={() => loadInsights()}
                    />
                </View>
            </Screen>
        );
    }

    return (
        <Screen
            scroll
            header={pageHeader}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.content}
        >
            <FinancialHealthScore healthScore={healthScore} />

            {insights.length > 0 && (
                <ChipRow style={{ marginBottom: SPACING.MEDIUM }} contentContainerStyle={styles.tabs}>
                    {TABS.map((tab) => {
                        const count = priorityCounts[tab.key];
                        return (
                            <Chip
                                key={tab.key}
                                label={count > 0 ? `${tab.label} · ${count}` : tab.label}
                                active={activeTab === tab.key}
                                onPress={() => setActiveTab(tab.key)}
                            />
                        );
                    })}
                </ChipRow>
            )}

            {filteredInsights.length === 0 && insights.length === 0 ? (
                <Card inset={false} style={{ marginBottom: SPACING.MEDIUM }}>
                    <EmptyState
                        icon="checkmark-circle-outline"
                        title="You're all set"
                        message="No new insights right now. Keep up the great work managing your finances."
                    />
                </Card>
            ) : filteredInsights.length === 0 ? (
                <Card inset={false} style={{ marginBottom: SPACING.MEDIUM }}>
                    <EmptyState
                        icon="filter-outline"
                        title={`No ${activeTab} priority insights`}
                        message="Try a different filter to see more."
                    />
                </Card>
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

            <InvestmentCorner navigation={navigation} />

            {academyArticles.length > 0 && (
                <View style={styles.academy}>
                    <View style={styles.academyHeader}>
                        <View style={styles.academyTitleRow}>
                            <Ionicons name="school-outline" size={22} color={theme.ACCENT} />
                            <Text variant="h2">Wealth Academy</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.viewAll}
                            onPress={() => navigation.navigate('WealthAcademy')}
                            activeOpacity={0.7}
                        >
                            <Text variant="label" tone="link">View all</Text>
                            <Ionicons name="chevron-forward" size={14} color={theme.LINK} />
                        </TouchableOpacity>
                    </View>
                    <Text variant="meta" tone="muted">
                        Curated articles to help you grow your financial knowledge
                    </Text>

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.academyScroll}
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

            <View style={styles.disclaimer}>
                <Ionicons name="information-circle-outline" size={14} color={theme.TEXT_MUTED} />
                <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                    AI insights are for informational purposes only and do not constitute financial,
                    investment, or tax advice. ETF data is approximate, updated quarterly, and may not
                    reflect current market conditions. Past performance does not guarantee future
                    results. Consult a qualified financial advisor before making investment decisions.
                </Text>
            </View>

            <CustomAlert {...alertProps} />
        </Screen>
    );
};

export default InsightsScreen;
