import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';

// Severity is a status encoding, so it uses the reserved semantic colours and
// always ships with an icon and a title — never colour alone.
const severityStyle = (theme, severity) => {
    switch (severity) {
        case 'critical':
            return { color: theme.DANGER, bg: theme.DANGER_DIM, icon: 'alert-circle' };
        case 'warning':
            return { color: theme.WARNING, bg: theme.WARNING_DIM, icon: 'warning' };
        default:
            return { color: theme.INFO, bg: theme.INFO_DIM, icon: 'information-circle' };
    }
};

const makeStyles = () => StyleSheet.create({
    container: { marginBottom: SPACING.MEDIUM },
    scrollContent: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    alertCard: {
        width: 260,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: 5,
    },
    title: { flex: 1 },
});

const AlertBanner = ({ alerts, onDismiss }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!alerts || alerts.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {alerts.map((alert, index) => {
                    const severity = severityStyle(theme, alert.severity);

                    return (
                        <View
                            key={alert.id || index}
                            style={[styles.alertCard, { backgroundColor: severity.bg }]}
                        >
                            <View style={styles.alertHeader}>
                                <Ionicons name={severity.icon} size={16} color={severity.color} />
                                <Text variant="label" color={severity.color} style={styles.title} numberOfLines={1}>
                                    {alert.title}
                                </Text>
                                {onDismiss && (
                                    <TouchableOpacity
                                        onPress={() => onDismiss(alert.id)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Dismiss alert"
                                    >
                                        <Ionicons name="close" size={14} color={severity.color} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text variant="meta" tone="secondary" numberOfLines={2}>
                                {alert.message}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

export default AlertBanner;
