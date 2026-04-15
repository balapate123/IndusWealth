import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';

const SEVERITY_COLORS = {
    critical: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', icon: '#EF4444', text: '#FCA5A5' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B', icon: '#F59E0B', text: '#FDE68A' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3B82F6', icon: '#3B82F6', text: '#93C5FD' },
};

const SEVERITY_ICONS = {
    critical: 'alert-circle',
    warning: 'warning',
    info: 'information-circle',
};

const AlertBanner = ({ alerts, onDismiss }) => {
    if (!alerts || alerts.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {alerts.map((alert, index) => {
                    const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
                    const icon = SEVERITY_ICONS[alert.severity] || 'information-circle';

                    return (
                        <View
                            key={alert.id || index}
                            style={[styles.alertCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
                        >
                            <View style={styles.alertHeader}>
                                <Ionicons name={icon} size={16} color={colors.icon} />
                                <Text style={[styles.alertTitle, { color: colors.text }]} numberOfLines={1}>
                                    {alert.title}
                                </Text>
                                {onDismiss && (
                                    <TouchableOpacity onPress={() => onDismiss(alert.id)} style={styles.dismissButton}>
                                        <Ionicons name="close" size={14} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.alertMessage} numberOfLines={2}>
                                {alert.message}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    alertCard: {
        width: 260,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        marginRight: SPACING.SMALL,
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    alertTitle: {
        fontSize: 13,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
        flex: 1,
    },
    dismissButton: {
        padding: 2,
    },
    alertMessage: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        lineHeight: 16,
    },
});

export default AlertBanner;
