import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { RADIUS, SPACING } from '../../constants/tokens';
import { useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * The period toggle (7D / 30D / 90D / 1Y / 2Y) and anything shaped like it.
 * `options` is [{ label, value }]; comparison is by `value`.
 */

const makeStyles = (t) => StyleSheet.create({
    track: {
        flexDirection: 'row',
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.PILL,
        padding: 4,
    },
    inset: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    segment: {
        flex: 1,
        paddingVertical: SPACING.SMALL,
        alignItems: 'center',
        borderRadius: RADIUS.PILL,
    },
    active: {
        backgroundColor: t.ACCENT,
    },
});

const SegmentedControl = ({ options, value, onChange, inset = true, style }) => {
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={[styles.track, inset && styles.inset, style]} accessibilityRole="tablist">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <TouchableOpacity
                        key={String(option.value)}
                        style={[styles.segment, active && styles.active]}
                        onPress={() => { if (!active) onChange(option.value); }}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                    >
                        <Text variant="label" tone={active ? 'onAccent' : 'muted'}>{option.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

export default SegmentedControl;
