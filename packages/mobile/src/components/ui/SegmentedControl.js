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

/**
 * `allowReselect` makes tapping the already-selected segment fire `onChange`
 * again. Off by default, because for six of the seven callers a segment is a
 * value and re-selecting it is nothing. The transaction list's "Custom"
 * segment is the exception: it is selected precisely when a custom date range
 * is set, so without this it could never be tapped — and a segment that is
 * visibly there and does nothing is a dead tap.
 */
const SegmentedControl = ({ options, value, onChange, inset = true, allowReselect = false, style }) => {
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={[styles.track, inset && styles.inset, style]} accessibilityRole="tablist">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <TouchableOpacity
                        key={String(option.value)}
                        style={[styles.segment, active && styles.active]}
                        onPress={() => { if (!active || allowReselect) onChange(option.value); }}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                    >
                        {/* Segments are flex:1, so a sixth option ("Custom" on
                            the transaction list) narrows every one of them.
                            Clipping to one line is the readable failure; a
                            wrapped label makes the whole row taller than the
                            five-option version beside it. */}
                        <Text variant="label" tone={active ? 'onAccent' : 'muted'} numberOfLines={1}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

export default SegmentedControl;
