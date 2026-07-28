import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Chip,
    ChipRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import ArticleCard from '../components/ArticleCard';

// Slots match ArticleCard's CATEGORY_SLOTS so a category is the same colour on
// the filter chip and on the cards it filters to.
const CATEGORY_TABS = [
    { id: 'all', label: 'All', icon: 'grid-outline', slot: null },
    { id: 'budgeting', label: 'Budgeting', icon: 'calculator-outline', slot: 2 },
    { id: 'investing', label: 'Investing', icon: 'trending-up-outline', slot: 5 },
    { id: 'debt', label: 'Debt', icon: 'card-outline', slot: 1 },
    { id: 'taxes', label: 'Taxes', icon: 'receipt-outline', slot: 4 },
    { id: 'savings', label: 'Savings', icon: 'wallet-outline', slot: 0 },
    { id: 'bookmarks', label: 'Saved', icon: 'bookmark', slot: null },
];

const makeStyles = (t) => StyleSheet.create({
    listContent: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
    loadingMore: {
        paddingVertical: SPACING.MEDIUM,
        alignItems: 'center',
    },
    disclaimer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: SPACING.MEDIUM,
        padding: SPACING.MEDIUM - 4,
        backgroundColor: t.SURFACE_SUNKEN,
        borderRadius: RADIUS.SMALL,
    },
    centered: { flex: 1, justifyContent: 'center' },
});

const WealthAcademyScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadArticles = useCallback(async (category, pageNum = 1, isRefresh = false) => {
        try {
            setError(null);

            if (pageNum === 1 && !isRefresh) {
                setLoading(true);
            }

            const response = category === 'bookmarks'
                ? await api.getArticleBookmarks(pageNum)
                : await api.getEducationalArticles(category === 'all' ? null : category, pageNum);

            if (response.success && response.data) {
                const newArticles = response.data.articles || [];
                const pagination = response.data.pagination;

                if (pageNum === 1) {
                    setArticles(newArticles);
                } else {
                    setArticles((prev) => [...prev, ...newArticles]);
                }

                setHasMore(pagination && pagination.page < pagination.totalPages);
                setPage(pageNum);
            }
        } catch (err) {
            console.error('Failed to load articles:', err);
            setError(err.parsedError?.message || 'Failed to load articles');
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        loadArticles(selectedCategory, 1);
    }, [selectedCategory, loadArticles]);

    const handleRefresh = () => {
        setRefreshing(true);
        setPage(1);
        loadArticles(selectedCategory, 1, true);
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMore && !loading) {
            setLoadingMore(true);
            loadArticles(selectedCategory, page + 1);
        }
    };

    const handleCategoryChange = (categoryId) => {
        if (categoryId !== selectedCategory) {
            setSelectedCategory(categoryId);
            setPage(1);
            setArticles([]);
        }
    };

    const handleArticlePress = (article) => {
        navigation.navigate('ArticleWebView', {
            url: article.external_url,
            title: article.title,
            articleId: article.id,
        });
    };

    const handleBookmark = async (articleId, shouldBookmark) => {
        try {
            if (shouldBookmark) {
                await api.addArticleBookmark(articleId);
            } else {
                await api.removeArticleBookmark(articleId);
            }

            setArticles((prev) =>
                prev
                    .map((article) =>
                        article.id === articleId ? { ...article, isBookmarked: shouldBookmark } : article
                    )
                    .filter((article) => {
                        // If on bookmarks tab and unbookmarked, remove from list
                        if (selectedCategory === 'bookmarks' && article.id === articleId && !shouldBookmark) {
                            return false;
                        }
                        return true;
                    })
            );
        } catch (err) {
            console.error('Failed to update bookmark:', err);
        }
    };

    const header = (
        <>
            <ScreenHeader title="Wealth Academy" onBack={() => navigation.goBack()} />
            <ChipRow style={{ marginBottom: SPACING.MEDIUM }}>
                {CATEGORY_TABS.map((tab) => (
                    <Chip
                        key={tab.id}
                        label={tab.label}
                        icon={tab.icon}
                        color={tab.slot == null ? undefined : categoryColor(theme, tab.slot)}
                        active={selectedCategory === tab.id}
                        onPress={() => handleCategoryChange(tab.id)}
                    />
                ))}
            </ChipRow>
        </>
    );

    if (error) {
        return (
            <Screen header={header}>
                <View style={styles.centered}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load articles"
                        message={error}
                        actionLabel="Retry"
                        onAction={() => loadArticles(selectedCategory, 1)}
                    />
                </View>
            </Screen>
        );
    }

    return (
        <Screen header={header}>
            {loading ? (
                <LoadingState message="Loading articles..." />
            ) : (
                <FlatList
                    data={articles}
                    renderItem={({ item }) => (
                        <ArticleCard
                            article={item}
                            variant="vertical"
                            onPress={handleArticlePress}
                            onBookmark={handleBookmark}
                        />
                    )}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.ACCENT}
                            colors={[theme.ACCENT]}
                            progressBackgroundColor={theme.SURFACE}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            icon={selectedCategory === 'bookmarks' ? 'bookmark-outline' : 'book-outline'}
                            title={selectedCategory === 'bookmarks' ? 'No saved articles' : 'No articles found'}
                            message={selectedCategory === 'bookmarks'
                                ? 'Save articles to read them later.'
                                : 'Check back soon for new content.'}
                        />
                    }
                    ListFooterComponent={
                        <>
                            {loadingMore && (
                                <View style={styles.loadingMore}>
                                    <ActivityIndicator size="small" color={theme.ACCENT} />
                                </View>
                            )}
                            <View style={styles.disclaimer}>
                                <Ionicons name="information-circle-outline" size={14} color={theme.TEXT_MUTED} />
                                <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                                    Articles are for educational purposes only and do not constitute
                                    financial, investment, legal, or tax advice. Consult a qualified
                                    professional before making financial decisions.
                                </Text>
                            </View>
                        </>
                    }
                />
            )}
        </Screen>
    );
};

export default WealthAcademyScreen;
