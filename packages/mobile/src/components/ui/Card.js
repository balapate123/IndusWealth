import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { RADIUS, SPACING } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * The app's card.
 *
 * Elevation is a token concern, not a caller concern: in Obsidian the card is
 * simply a lighter surface, in Ledger it additionally carries a hairline and a
 * contact shadow. Both arrive through CARD_BORDER_WIDTH and ELEVATION.CARD, so
 * nothing here branches on mode.
 *
 * `tone="high"` is for a card nested inside another card, where SURFACE would
 * disappear into its parent.
 */

const makeStyles = (t) => StyleSheet.create({
    base: {
        borderRadius: RADIUS.CARD,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        ...t.ELEVATION.CARD,
    },
    padded: {
        padding: SPACING.MEDIUM,
    },
    inset: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
});

const Card = ({
    children,
    padded = true,
    inset = true,
    tone = 'surface',
    onPress,
    style,
    ...rest
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const composed = [
        styles.base,
        { backgroundColor: tone === 'high' ? theme.SURFACE_HIGH : theme.SURFACE },
        padded && styles.padded,
        inset && styles.inset,
        style,
    ];

    if (onPress) {
        return (
            <TouchableOpacity style={composed} onPress={onPress} activeOpacity={0.7} {...rest}>
                {children}
            </TouchableOpacity>
        );
    }

    return <View style={composed} {...rest}>{children}</View>;
};

export default Card;
