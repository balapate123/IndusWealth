import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Share,
    Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const ArticleWebViewScreen = ({ navigation, route }) => {
    const { url, title, articleId } = route.params;
    const webViewRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [canGoBack, setCanGoBack] = useState(false);
    const [currentUrl, setCurrentUrl] = useState(url);

    const handleGoBack = () => {
        if (canGoBack && webViewRef.current) {
            webViewRef.current.goBack();
        } else {
            navigation.goBack();
        }
    };

    const handleShare = async () => {
        try {
            await Share.share({
                message: `Check out this article: ${title}\n${currentUrl}`,
                url: currentUrl,
                title: title,
            });
        } catch (err) {
            console.error('Failed to share:', err);
        }
    };

    const handleBookmark = async () => {
        if (!articleId) return;

        try {
            if (isBookmarked) {
                await api.removeArticleBookmark(articleId);
            } else {
                await api.addArticleBookmark(articleId);
            }
            setIsBookmarked(!isBookmarked);
        } catch (err) {
            console.error('Failed to update bookmark:', err);
        }
    };

    const handleReload = () => {
        setError(false);
        setLoading(true);
        webViewRef.current?.reload();
    };

    const handleNavigationStateChange = (navState) => {
        setCanGoBack(navState.canGoBack);
        setCurrentUrl(navState.url);
    };

    const handleLoadEnd = () => {
        setLoading(false);
    };

    const handleError = () => {
        setLoading(false);
        setError(true);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={handleGoBack}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={canGoBack ? 'arrow-back' : 'close'}
                        size={24}
                        color={COLORS.WHITE}
                    />
                </TouchableOpacity>

                <View style={styles.titleContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                        {title}
                    </Text>
                </View>

                <View style={styles.headerActions}>
                    {articleId && (
                        <TouchableOpacity
                            style={styles.headerButton}
                            onPress={handleBookmark}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                                size={22}
                                color={isBookmarked ? COLORS.GOLD : COLORS.WHITE}
                            />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={handleShare}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name="share-outline"
                            size={22}
                            color={COLORS.WHITE}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Loading Indicator */}
            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={COLORS.GOLD} />
                    <Text style={styles.loadingText}>Loading article...</Text>
                </View>
            )}

            {/* Error State */}
            {error ? (
                <View style={styles.errorContainer}>
                    <Ionicons name="cloud-offline-outline" size={64} color={COLORS.RED} />
                    <Text style={styles.errorTitle}>Unable to load article</Text>
                    <Text style={styles.errorText}>
                        Please check your internet connection and try again
                    </Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={handleReload}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="refresh" size={18} color={COLORS.BACKGROUND} />
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <WebView
                    ref={webViewRef}
                    source={{ uri: url }}
                    style={styles.webview}
                    onLoadEnd={handleLoadEnd}
                    onError={handleError}
                    onNavigationStateChange={handleNavigationStateChange}
                    startInLoadingState={true}
                    renderLoading={() => null}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    scalesPageToFit={true}
                    showsVerticalScrollIndicator={true}
                    showsHorizontalScrollIndicator={false}
                    originWhitelist={['https://*', 'http://*']}
                    onShouldStartLoadWithRequest={(request) => {
                        // Allow navigation within the same domain or common external links
                        return true;
                    }}
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
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.BACKGROUND,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleContainer: {
        flex: 1,
        paddingHorizontal: SPACING.SMALL,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.WHITE,
        textAlign: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    webview: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.BACKGROUND,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        gap: SPACING.MEDIUM,
    },
    loadingText: {
        fontSize: 16,
        color: COLORS.WHITE,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.LARGE,
        gap: SPACING.MEDIUM,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    errorText: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        maxWidth: '80%',
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.GOLD,
        paddingHorizontal: SPACING.LARGE,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    retryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.BACKGROUND,
    },
});

export default ArticleWebViewScreen;
