import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * A filter chip. When `color` is supplied the active state tints with that
 * identity hue instead of the accent, so a category chip stays recognisably
 * itself when selected.
 */

const makeStyles = (t) => StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: RADIUS.PILL,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: 1,
        borderColor: 'transparent',
        gap: 5,
    },
    row: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
});

export const Chip = ({ label, icon, active = false, color, onPress, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const activeStyle = active
        ? (color
            ? { backgroundColor: alpha(color, 0.19), borderColor: color }
            : { backgroundColor: theme.ACCENT, borderColor: theme.ACCENT })
        : null;

    const iconColor = color || (active ? theme.TEXT_ON_ACCENT : theme.TEXT_MUTED);
    const labelTone = active ? (color ? 'primary' : 'onAccent') : 'secondary';

    return (
        <TouchableOpacity
            style={[styles.chip, activeStyle, style]}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
        >
            {icon ? <Ionicons name={icon} size={13} color={iconColor} /> : null}
            <Text variant="label" tone={labelTone}>{label}</Text>
        </TouchableOpacity>
    );
};

export const ChipRow = ({ children, style }) => {
    const styles = useThemedStyles(makeStyles);
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.row, style]}
        >
            {children}
        </ScrollView>
    );
};

export default Chip;
