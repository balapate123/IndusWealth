import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Horizontal magnitude bar. Anchored to the baseline with rounded ends; a
 * non-zero value always keeps a visible 2% sliver so "small" never reads as
 * "none".
 */

const makeStyles = (t) => StyleSheet.create({
    track: {
        backgroundColor: t.SURFACE_SUNKEN,
        overflow: 'hidden',
        width: '100%',
    },
    fill: { height: '100%' },
});

const BarTrack = ({ value = 0, max = 1, color, height = 8, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const safeMax = max > 0 ? max : 1;
    const ratio = Math.min(Math.max(value / safeMax, 0), 1);
    const width = value > 0 ? `${Math.max(ratio * 100, 2)}%` : '0%';
    const radius = height / 2;

    return (
        <View style={[styles.track, { height, borderRadius: radius }, style]}>
            <View style={[styles.fill, { width, borderRadius: radius, backgroundColor: color || theme.ACCENT }]} />
        </View>
    );
};

export default BarTrack;
