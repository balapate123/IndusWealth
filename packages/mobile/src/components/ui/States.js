import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';
import Button from './Button';

const makeStyles = () => StyleSheet.create({
    block: {
        alignItems: 'center',
        paddingVertical: SPACING.XL,
        paddingHorizontal: SPACING.MEDIUM,
    },
    title: { marginTop: SPACING.SMALL + 2 },
    message: {
        textAlign: 'center',
        marginTop: 4,
    },
    action: { marginTop: SPACING.MEDIUM },
    loadingText: { marginTop: SPACING.MEDIUM },
});

export const EmptyState = ({ icon = 'file-tray-outline', title, message, actionLabel, onAction, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={[styles.block, style]}>
            <Ionicons name={icon} size={36} color={theme.TEXT_MUTED} />
            {title ? <Text variant="title" style={styles.title}>{title}</Text> : null}
            {message ? <Text variant="body" tone="muted" style={styles.message}>{message}</Text> : null}
            {actionLabel && onAction ? (
                <Button title={actionLabel} onPress={onAction} size="sm" style={styles.action} />
            ) : null}
        </View>
    );
};

export const LoadingState = ({ message, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={[styles.block, style]}>
            <ActivityIndicator size="large" color={theme.ACCENT} />
            {message ? <Text variant="body" tone="secondary" style={styles.loadingText}>{message}</Text> : null}
        </View>
    );
};
