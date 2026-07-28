import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Share, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text, EmptyState, LoadingState } from '../components/ui';
import api from '../services/api';

const makeStyles = (t) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: t.BG,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + SPACING.SMALL : 60,
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: t.HAIRLINE,
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
    title: { textAlign: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    // Articles are third-party pages authored for a white ground; forcing the
    // app surface behind them would show through as a mismatched band.
    webview: {
        flex: 1,
        // eslint-disable-next-line no-restricted-syntax -- the page's own ground, not ours
        backgroundColor: '#FFFFFF',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: t.BG,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
    },
});

const ArticleWebViewScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

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
                title,
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.BG} />

            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={handleGoBack}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={canGoBack ? 'Back' : 'Close'}
                >
                    <Ionicons
                        name={canGoBack ? 'arrow-back' : 'close'}
                        size={24}
                        color={theme.TEXT_PRIMARY}
                    />
                </TouchableOpacity>

                <View style={styles.titleContainer}>
                    <Text variant="title" style={styles.title} numberOfLines={1}>{title}</Text>
                </View>

                <View style={styles.headerActions}>
                    {articleId && (
                        <TouchableOpacity
                            style={styles.headerButton}
                            onPress={handleBookmark}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
                        >
                            <Ionicons
                                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                                size={22}
                                color={isBookmarked ? theme.ACCENT : theme.TEXT_SECONDARY}
                            />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={handleShare}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Share article"
                    >
                        <Ionicons name="share-outline" size={22} color={theme.TEXT_SECONDARY} />
                    </TouchableOpacity>
                </View>
            </View>

            {loading && !error && (
                <View style={styles.loadingOverlay}>
                    <LoadingState message="Loading article..." />
                </View>
            )}

            {error ? (
                <View style={styles.errorContainer}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Unable to load article"
                        message="Check your internet connection and try again."
                        actionLabel="Retry"
                        onAction={handleReload}
                    />
                </View>
            ) : (
                <WebView
                    ref={webViewRef}
                    source={{ uri: url }}
                    style={styles.webview}
                    onLoadEnd={() => setLoading(false)}
                    onError={() => { setLoading(false); setError(true); }}
                    onNavigationStateChange={(navState) => {
                        setCanGoBack(navState.canGoBack);
                        setCurrentUrl(navState.url);
                    }}
                    startInLoadingState
                    renderLoading={() => null}
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    scalesPageToFit
                    showsVerticalScrollIndicator
                    showsHorizontalScrollIndicator={false}
                    originWhitelist={['https://*', 'http://*']}
                />
            )}
        </View>
    );
};

export default ArticleWebViewScreen;
