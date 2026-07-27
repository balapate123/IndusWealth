import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * variant: primary — the accent fill. At most one per view.
 *          secondary — a raised control on the nested surface.
 *          ghost — text only, for tertiary actions.
 *          danger — destructive, tinted rather than filled.
 */

const makeStyles = () => StyleSheet.create({
    base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.CONTROL,
        paddingHorizontal: SPACING.MEDIUM,
        gap: 6,
    },
    md: { height: 44 },
    sm: { height: 36, paddingHorizontal: SPACING.SMALL + 4 },
    block: { alignSelf: 'stretch' },
    disabled: { opacity: 0.5 },
});

const useVariant = (variant) => {
    const t = useTheme();
    switch (variant) {
        case 'secondary':
            return { backgroundColor: t.SURFACE_HIGH, fg: t.TEXT_PRIMARY };
        case 'ghost':
            return { backgroundColor: 'transparent', fg: t.LINK };
        case 'danger':
            return { backgroundColor: t.DANGER_DIM, fg: t.DANGER };
        default:
            return { backgroundColor: t.ACCENT, fg: t.TEXT_ON_ACCENT };
    }
};

const Button = ({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    icon,
    loading = false,
    disabled = false,
    block = false,
    style,
    ...rest
}) => {
    const styles = useThemedStyles(makeStyles);
    const { backgroundColor, fg } = useVariant(variant);
    const inert = disabled || loading;

    return (
        <TouchableOpacity
            style={[styles.base, styles[size], { backgroundColor }, block && styles.block, inert && styles.disabled, style]}
            onPress={onPress}
            disabled={inert}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ disabled: inert, busy: loading }}
            {...rest}
        >
            {loading ? (
                <ActivityIndicator size="small" color={fg} />
            ) : (
                <>
                    {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 17} color={fg} /> : null}
                    <Text variant={size === 'sm' ? 'label' : 'bodyMed'} color={fg}>{title}</Text>
                </>
            )}
        </TouchableOpacity>
    );
};

export default Button;
