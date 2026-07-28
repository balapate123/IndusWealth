import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text } from './ui';

// Article categories draw from the same validated ramp as everything else, by
// slot index so each theme resolves its own. `general` falls back to the accent.
const CATEGORY_SLOTS = {
    budgeting: 2,
    investing: 5,
    debt: 1,
    taxes: 4,
    savings: 0,
    general: null,
};

const makeStyles = (t) => StyleSheet.create({
    container: {
        overflow: 'hidden',
        marginBottom: 0,
    },
    horizontal: {
        width: 280,
        marginRight: SPACING.MEDIUM,
    },
    vertical: {
        width: '100%',
        marginBottom: SPACING.MEDIUM,
    },
    thumbnailContainer: {
        position: 'relative',
        overflow: 'hidden',
        borderTopLeftRadius: RADIUS.CARD - 1,
        borderTopRightRadius: RADIUS.CARD - 1,
    },
    horizontalThumbnail: { height: 140 },
    verticalThumbnail: { height: 160 },
    thumbnail: { width: '100%', height: '100%' },
    placeholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badges: {
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
    // Sits over an arbitrary photo, so it needs its own opaque ground rather
    // than a translucent tint of the surface.
    readTimeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.SCRIM,
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 4,
        gap: 3,
    },
    content: { padding: SPACING.MEDIUM },
    title: { marginBottom: SPACING.TINY },
    description: { marginBottom: SPACING.SMALL },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACING.TINY,
    },
    source: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: SPACING.SMALL,
    },
    sourceAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bookmark: { padding: SPACING.TINY },
});

/**
 * ArticleCard - Reusable component for displaying educational articles
 *
 * @param {Object} article - Article data object
 * @param {string} variant - 'horizontal' for scroll list, 'vertical' for full-width list
 * @param {Function} onPress - Callback when card is pressed
 * @param {Function} onBookmark - Callback when bookmark button is pressed
 */
const ArticleCard = ({ article, variant = 'horizontal', onPress, onBookmark }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

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

    const slot = CATEGORY_SLOTS[category];
    const tint = article.categoryColor
        || (slot == null ? theme.ACCENT : categoryColor(theme, slot));
    const isHorizontal = variant === 'horizontal';

    const handleBookmarkPress = (e) => {
        e.stopPropagation?.();
        if (onBookmark) {
            onBookmark(id, !isBookmarked);
        }
    };

    const sourceInitial = source_name ? source_name.charAt(0).toUpperCase() : 'A';

    return (
        <Card
            inset={false}
            padded={false}
            onPress={() => onPress?.(article)}
            style={[styles.container, isHorizontal ? styles.horizontal : styles.vertical]}
        >
            <View style={[
                styles.thumbnailContainer,
                isHorizontal ? styles.horizontalThumbnail : styles.verticalThumbnail,
            ]}>
                {image_url ? (
                    <Image source={{ uri: image_url }} style={styles.thumbnail} resizeMode="cover" />
                ) : (
                    <View style={[styles.placeholder, { backgroundColor: alpha(tint, 0.18) }]}>
                        <Ionicons name="book-outline" size={32} color={tint} />
                    </View>
                )}

                <View style={styles.badges}>
                    <View style={[styles.badge, { backgroundColor: tint }]}>
                        <Text variant="overline" color={theme.TEXT_ON_CATEGORY}>
                            {category || 'General'}
                        </Text>
                    </View>
                    <View style={styles.readTimeBadge}>
                        <Ionicons name="time-outline" size={10} color={theme.TEXT_PRIMARY} />
                        <Text variant="meta">{read_time_minutes || 5} min</Text>
                    </View>
                </View>
            </View>

            <View style={styles.content}>
                <Text variant="title" style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                    {title}
                </Text>

                {description ? (
                    <Text
                        variant="meta"
                        tone="secondary"
                        style={styles.description}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                    >
                        {description}
                    </Text>
                ) : null}

                <View style={styles.footer}>
                    <View style={styles.source}>
                        <View style={[styles.sourceAvatar, { backgroundColor: alpha(tint, 0.25) }]}>
                            <Text variant="label" color={tint}>{sourceInitial}</Text>
                        </View>
                        <Text variant="meta" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                            {source_name || 'Unknown source'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.bookmark}
                        onPress={handleBookmarkPress}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
                    >
                        <Ionicons
                            name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                            size={20}
                            color={isBookmarked ? theme.ACCENT : theme.TEXT_MUTED}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </Card>
    );
};

export default ArticleCard;
