import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, alpha } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * Period-over-period delta.
 *
 * `goodWhenUp` exists because the two readings genuinely differ: a balance going
 * up is good, spending going up is not. Callers on the spending side must pass
 * `goodWhenUp={false}` — getting this wrong paints an overspend green.
 *
 * The arrow carries the direction independently of the colour, so the meaning
 * survives colour-blindness and greyscale screenshots.
 */

const makeStyles = () => StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: RADIUS.SMALL,
        gap: 2,
    },
});

const ChangeBadge = ({ percent, goodWhenUp = true, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (percent == null || percent === 0) return null;

    const up = percent > 0;
    const good = up === goodWhenUp;
    const color = good ? theme.SUCCESS : theme.DANGER;

    return (
        <View style={[styles.badge, { backgroundColor: alpha(color, 0.16) }, style]}>
            <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={10} color={color} />
            <Text variant="meta" color={color}>{Math.abs(percent)}%</Text>
        </View>
    );
};

export default ChangeBadge;
