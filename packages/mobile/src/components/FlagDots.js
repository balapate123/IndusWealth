import React from 'react';
import { View, StyleSheet } from 'react-native';
import { categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';

/**
 * The flags on a transaction, as coloured dots.
 *
 * Caps at two so a heavily-tagged row cannot push its own subtitle off the
 * screen; the rest become "+N". A dot is deliberately the whole treatment here —
 * names belong in the detail sheet, and a row of pills would compete with the
 * merchant for the eye.
 *
 * Colour comes from the ramp index, so the same flag reads correctly in both
 * themes without storing two hexes.
 */

const MAX_DOTS = 2;

const makeStyles = (t) => StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    // A hairline ring keeps two adjacent dots readable when their hues are
    // close, and separates a dot from whatever sits behind it.
    ring: {
        borderWidth: 1,
        borderColor: t.SURFACE,
    },
});

const FlagDots = ({ flags, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!flags || flags.length === 0) return null;

    const shown = flags.slice(0, MAX_DOTS);
    const extra = flags.length - shown.length;

    return (
        <View style={[styles.row, style]}>
            {shown.map((flag) => (
                <View
                    key={flag.id}
                    style={[
                        styles.dot,
                        styles.ring,
                        { backgroundColor: categoryColor(theme, flag.color_index) },
                    ]}
                />
            ))}
            {extra > 0 ? <Text variant="meta" tone="muted">+{extra}</Text> : null}
        </View>
    );
};

export default FlagDots;
