import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Platform,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';
import ArticleCard from '../components/ArticleCard';

// Category configuration
const CATEGORY_TABS = [
    { id: 'all', label: 'All', icon: 'grid-outline' },
    { id: 'budgeting', label: 'Budgeting', icon: 'calculator-outline', color: '#3B82F6' },
    { id: 'investing', label: 'Investing', icon: 'trending-up-outline', color: '#10B981' },
    { id: 'debt', label: 'Debt', icon: 'card-outline', color: '#F59E0B' },
    { id: 'taxes', label: 'Taxes', icon: 'receipt-outline', color: '#8B5CF6' },
    { id: 'savings', label: 'Savings', icon: 'wallet-outline', color: '#06B6D4' },
    { id: 'bookmarks', label: 'Saved', icon: 'bookmark', color: COLORS.GOLD },
];

const WealthAcademyScreen = ({ navigation }) => {
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

            let response;
            if (category === 'bookmarks') {
                response = await api.getArticleBookmarks(pageNum);
            } else {
                response = await api.getEducationalArticles(category === 'all' ? null : category, pageNum);
            }

            if (response.success && response.data) {
                const newArticles = response.data.articles || [];
                const pagination = response.data.pagination;

                if (pageNum === 1) {
                    setArticles(newArticles);
                } else {
                    setArticles(prev => [...prev, ...newArticles]);
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

            // Update local state
            setArticles(prev =>
                prev.map(article =>
                    article.id === articleId
                        ? { ...article, isBookmarked: shouldBookmark }
                        : article
                ).filter(article => {
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

    const renderCategoryTab = (category) => {
        const isSelected = selectedCategory === category.id;

        return (
            <TouchableOpacity
                key={category.id}
                style={[
                    styles.categoryTab,
                    isSelected && styles.categoryTabSelected,
                    isSelected && category.color && { borderColor: category.color }
                ]}
                onPress={() => handleCategoryChange(category.id)}
                activeOpacity={0.7}
            >
                <Ionicons
                    name={category.icon}
                    size={16}
                    color={isSelected ? (category.color || COLORS.GOLD) : COLORS.TEXT_SECONDARY}
                />
                <Text style={[
                    styles.categoryTabText,
                    isSelected && styles.categoryTabTextSelected,
                    isSelected && category.color && { color: category.color }
                ]}>
                    {category.label}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderArticle = ({ item }) => (
        <ArticleCard
            article={item}
            variant="vertical"
            onPress={handleArticlePress}
            onBookmark={handleBookmark}
        />
    );

    const renderFooter = () => {
        return (
            <>
                {loadingMore && (
                    <View style={styles.loadingMore}>
                        <ActivityIndicator size="small" color={COLORS.GOLD} />
                    </View>
                )}
                <View style={styles.disclaimerBanner}>
                    <Ionicons name="information-circle-outline" size={14} color="#888" />
                    <Text style={styles.disclaimerText}>
                        Articles are for educational purposes only and do not constitute financial, investment, legal, or tax advice. Consult a qualified professional before making financial decisions.
                    </Text>
                </View>
            </>
        );
    };

    const renderEmpty = () => {
        if (loading) return null;

        return (
            <View style={styles.emptyContainer}>
                <Ionicons
                    name={selectedCategory === 'bookmarks' ? 'bookmark-outline' : 'book-outline'}
                    size={64}
                    color={COLORS.GOLD}
                    style={{ opacity: 0.5 }}
                />
                <Text style={styles.emptyTitle}>
                    {selectedCategory === 'bookmarks' ? 'No saved articles' : 'No articles found'}
                </Text>
                <Text style={styles.emptyText}>
                    {selectedCategory === 'bookmarks'
                        ? 'Save articles to read them later'
                        : 'Check back soon for new content'}
                </Text>
            </View>
        );
    };

    if (error) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Wealth Academy</Text>
                    <View style={styles.headerSpacer} />
                </View>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={COLORS.RED} />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => loadArticles(selectedCategory, 1)}
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
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Wealth Academy</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Category Tabs */}
            <View style={styles.categoryContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryScroll}
                >
                    {CATEGORY_TABS.map(renderCategoryTab)}
                </ScrollView>
            </View>

            {/* Articles List */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.GOLD} />
                    <Text style={styles.loadingText}>Loading articles...</Text>
                </View>
            ) : (
                <FlatList
                    data={articles}
                    renderItem={renderArticle}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={COLORS.GOLD}
                            colors={[COLORS.GOLD]}
                        />
                    }
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={renderEmpty}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(201, 162, 39, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    headerSpacer: {
        width: 40,
    },
    categoryContainer: {
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    categoryScroll: {
        paddingHorizontal: SPACING.LARGE,
        paddingVertical: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    categoryTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.ROUND,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        marginRight: SPACING.SMALL,
        gap: SPACING.TINY,
    },
    categoryTabSelected: {
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        borderColor: COLORS.GOLD,
    },
    categoryTabText: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        fontWeight: '500',
    },
    categoryTabTextSelected: {
        color: COLORS.GOLD,
        fontWeight: '600',
    },
    listContent: {
        padding: SPACING.LARGE,
        paddingBottom: 100,
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
    loadingMore: {
        paddingVertical: SPACING.LARGE,
        alignItems: 'center',
    },
    disclaimerBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        margin: SPACING.LARGE,
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
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.XL * 2,
        gap: SPACING.MEDIUM,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    emptyText: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        maxWidth: '80%',
    },
});

export default WealthAcademyScreen;
