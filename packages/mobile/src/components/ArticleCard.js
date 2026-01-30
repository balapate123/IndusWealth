import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

// Category colors matching backend
const CATEGORY_COLORS = {
    budgeting: '#3B82F6',
    investing: '#10B981',
    debt: '#F59E0B',
    taxes: '#8B5CF6',
    savings: '#06B6D4',
    general: '#C9A227',
};

/**
 * ArticleCard - Reusable component for displaying educational articles
 *
 * @param {Object} article - Article data object
 * @param {string} variant - 'horizontal' for scroll list, 'vertical' for full-width list
 * @param {Function} onPress - Callback when card is pressed
 * @param {Function} onBookmark - Callback when bookmark button is pressed
 */
const ArticleCard = ({
    article,
    variant = 'horizontal',
    onPress,
    onBookmark,
}) => {
    const {
        id,
        title,
        description,
        image_url,
        source_name,
        category,
        read_time_minutes,
        isBookmarked,
    } = article;

    const categoryColor = article.categoryColor || CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
    const isHorizontal = variant === 'horizontal';

    const handleBookmarkPress = (e) => {
        e.stopPropagation?.();
        if (onBookmark) {
            onBookmark(id, !isBookmarked);
        }
    };

    // Get first letter of source for avatar
    const sourceInitial = source_name ? source_name.charAt(0).toUpperCase() : 'A';

    return (
        <TouchableOpacity
            style={[
                styles.container,
                isHorizontal ? styles.horizontalContainer : styles.verticalContainer
            ]}
            onPress={() => onPress?.(article)}
            activeOpacity={0.8}
        >
            {/* Thumbnail */}
            <View style={[
                styles.thumbnailContainer,
                isHorizontal ? styles.horizontalThumbnail : styles.verticalThumbnail
            ]}>
                {image_url ? (
                    <Image
                        source={{ uri: image_url }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={[styles.placeholderGradient, { backgroundColor: categoryColor + '30' }]}>
                        <Ionicons name="book-outline" size={32} color={categoryColor} />
                    </View>
                )}

                {/* Category and read time badges */}
                <View style={styles.badgeContainer}>
                    <View style={[styles.badge, { backgroundColor: categoryColor }]}>
                        <Text style={styles.badgeText}>
                            {category?.toUpperCase() || 'GENERAL'}
                        </Text>
                    </View>
                    <View style={styles.readTimeBadge}>
                        <Ionicons name="time-outline" size={10} color="#FFF" />
                        <Text style={styles.readTimeText}>
                            {read_time_minutes || 5} min
                        </Text>
                    </View>
                </View>
            </View>

            {/* Content */}
            <View style={styles.contentContainer}>
                <Text
                    style={styles.title}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                >
                    {title}
                </Text>

                {description && (
                    <Text
                        style={styles.description}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                    >
                        {description}
                    </Text>
                )}

                {/* Footer: Source and Bookmark */}
                <View style={styles.footer}>
                    <View style={styles.sourceContainer}>
                        <View style={[styles.sourceAvatar, { backgroundColor: categoryColor + '40' }]}>
                            <Text style={[styles.sourceInitial, { color: categoryColor }]}>
                                {sourceInitial}
                            </Text>
                        </View>
                        <Text style={styles.sourceName} numberOfLines={1}>
                            {source_name || 'Unknown Source'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.bookmarkButton}
                        onPress={handleBookmarkPress}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons
                            name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                            size={20}
                            color={isBookmarked ? COLORS.GOLD : COLORS.TEXT_SECONDARY}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        overflow: 'hidden',
    },
    horizontalContainer: {
        width: 280,
        marginRight: SPACING.MEDIUM,
    },
    verticalContainer: {
        width: '100%',
        marginBottom: SPACING.MEDIUM,
    },
    thumbnailContainer: {
        position: 'relative',
        overflow: 'hidden',
    },
    horizontalThumbnail: {
        height: 140,
    },
    verticalThumbnail: {
        height: 160,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    placeholderGradient: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeContainer: {
        position: 'absolute',
        bottom: SPACING.SMALL,
        left: SPACING.SMALL,
        flexDirection: 'row',
        gap: SPACING.TINY,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    readTimeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 4,
        gap: 3,
    },
    readTimeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '500',
    },
    contentContainer: {
        padding: SPACING.MEDIUM,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        marginBottom: SPACING.TINY,
        lineHeight: 22,
    },
    description: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        opacity: 0.7,
        marginBottom: SPACING.SMALL,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACING.TINY,
    },
    sourceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    sourceAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.SMALL,
    },
    sourceInitial: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    sourceName: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
        flex: 1,
    },
    bookmarkButton: {
        padding: SPACING.TINY,
    },
});

export default ArticleCard;
