import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, alpha } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * One row of a list: transaction, account, merchant, setting.
 *
 * Pass `divider` on every row after the first — the hairline sits on top so the
 * card's own padding isn't split by a trailing rule.
 */

const makeStyles = (t) => StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL + 3,
        gap: SPACING.SMALL + 3,
    },
    divider: {
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    icon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: { flex: 1, minWidth: 0 },
    subtitle: { marginTop: 1 },
    // The subtitle line becomes a row when an accessory rides along with it.
    // The text shrinks so a long merchant name truncates rather than pushing
    // the accessory off the edge.
    subtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 1,
    },
    subtitleText: { flexShrink: 1 },
    right: { alignItems: 'flex-end' },
    meta: { marginTop: 1 },
});

const ListRow = ({
    icon,
    iconColor,
    leading,
    title,
    subtitle,
    subtitleAccessory,
    value,
    valueTone = 'primary',
    valueColor,
    meta,
    chevron = false,
    divider = false,
    onPress,
    style,
    ...rest
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const tint = iconColor || theme.ACCENT;

    const content = (
        <>
            {leading || (icon ? (
                <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons name={icon} size={20} color={tint} />
                </View>
            ) : null)}

            <View style={styles.body}>
                <Text variant="body" numberOfLines={1}>{title}</Text>
                {subtitleAccessory ? (
                    <View style={styles.subtitleRow}>
                        {subtitle ? (
                            <Text variant="meta" tone="muted" style={styles.subtitleText} numberOfLines={1}>{subtitle}</Text>
                        ) : null}
                        {subtitleAccessory}
                    </View>
                ) : subtitle ? (
                    <Text variant="meta" tone="muted" style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                ) : null}
            </View>

            {value != null || meta ? (
                <View style={styles.right}>
                    {value != null ? <Text variant="num" tone={valueTone} color={valueColor}>{value}</Text> : null}
                    {meta ? <Text variant="meta" tone="muted" style={styles.meta}>{meta}</Text> : null}
                </View>
            ) : null}

            {chevron ? <Ionicons name="chevron-forward" size={18} color={theme.TEXT_MUTED} /> : null}
        </>
    );

    const composed = [styles.row, divider && styles.divider, style];

    if (onPress) {
        return (
            <TouchableOpacity style={composed} onPress={onPress} activeOpacity={0.7} {...rest}>
                {content}
            </TouchableOpacity>
        );
    }
    return <View style={composed} {...rest}>{content}</View>;
};

export default ListRow;
