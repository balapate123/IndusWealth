import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

/**
 * Centred title with an optional back button and a right-hand slot. The spacer
 * keeps the title optically centred whether or not a right slot is supplied.
 */

const makeStyles = (t) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.MEDIUM,
    },
    button: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: t.SURFACE_HIGH,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        flex: 1,
        textAlign: 'center',
    },
    slot: {
        minWidth: 36,
        alignItems: 'flex-end',
    },
});

const ScreenHeader = ({ title, onBack, right }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={styles.header}>
            {onBack ? (
                <TouchableOpacity style={styles.button} onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
                    <Ionicons name="chevron-back" size={24} color={theme.TEXT_PRIMARY} />
                </TouchableOpacity>
            ) : (
                <View style={styles.slot} />
            )}
            <Text variant="h2" style={styles.title} numberOfLines={1}>{title}</Text>
            <View style={styles.slot}>{right}</View>
        </View>
    );
};

export default ScreenHeader;
