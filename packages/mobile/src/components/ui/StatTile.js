import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/tokens';
import { useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

const makeStyles = () => StyleSheet.create({
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: SPACING.MEDIUM - 4,
        marginBottom: SPACING.SMALL,
    },
    tile: {
        width: '50%',
        padding: 4,
    },
    value: { marginTop: 2 },
    sub: { marginTop: 2 },
});

export const StatTile = ({ label, value, sub, subTone = 'secondary', subColor, style }) => {
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={[styles.tile, style]}>
            <Text variant="meta" tone="muted">{label}</Text>
            <Text variant="h2" style={styles.value} numberOfLines={1}>{value}</Text>
            {sub ? (
                <Text variant="meta" tone={subTone} color={subColor} style={styles.sub} numberOfLines={1}>{sub}</Text>
            ) : null}
        </View>
    );
};

export const StatGrid = ({ children, style }) => {
    const styles = useThemedStyles(makeStyles);
    return <View style={[styles.grid, style]}>{children}</View>;
};

export default StatTile;
