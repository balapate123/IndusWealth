import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    LayoutAnimation,
    UIManager,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PRIORITY_CONFIG = {
    high: {
        color: COLORS.RED,
        bgColor: 'rgba(255, 107, 107, 0.15)',
        icon: 'alert-circle',
        label: 'High Priority',
    },
    medium: {
        color: '#FFA726',
        bgColor: 'rgba(255, 167, 38, 0.15)',
        icon: 'information-circle',
        label: 'Medium',
    },
    low: {
        color: COLORS.GOLD_LIGHT,
        bgColor: 'rgba(229, 192, 72, 0.15)',
        icon: 'checkmark-circle',
        label: 'Low',
    },
};

const CATEGORY_ICONS = {
    'Tax-Advantaged Account Opportunities': { icon: 'trending-up', color: COLORS.CAT_TAX },
    'Spending Optimization': { icon: 'cut', color: COLORS.CAT_SPENDING },
    'Debt Payoff Acceleration': { icon: 'card', color: COLORS.CAT_DEBT },
    'Savings Acceleration': { icon: 'wallet', color: COLORS.CAT_SAVINGS },
    'Cash Flow Optimization': { icon: 'cash', color: COLORS.CAT_CASHFLOW },
    'Investment Readiness': { icon: 'bar-chart', color: COLORS.CAT_INVEST },
    'Milestone Celebrations': { icon: 'trophy', color: COLORS.CAT_MILESTONE },
    'ETF/Investment Recommendations': { icon: 'pie-chart', color: COLORS.CAT_ETF },
    'Tax Optimization': { icon: 'receipt', color: COLORS.CAT_TAX },
    'Wealth Building Strategies': { icon: 'diamond', color: COLORS.CAT_WEALTH },
    'Comparative Analysis': { icon: 'stats-chart', color: COLORS.CAT_COMPARATIVE },
    'Opportunity Cost Insights': { icon: 'swap-horizontal', color: COLORS.CAT_OPPORTUNITY },
    'Seasonal/Timely Insights': { icon: 'calendar', color: COLORS.CAT_SEASONAL },
};

const InsightCardV2 = ({ insight, onAction, onDismiss, maxAnnualSavings = 5000 }) => {
    const [expanded, setExpanded] = useState(false);

    const priority = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
    const categoryConfig = CATEGORY_ICONS[insight.type] || { icon: 'bulb', color: COLORS.GOLD };
    const annualSavings = insight.potential_benefit?.annual_savings || insight.potential_benefit?.annual_growth_estimate || 0;
    const impactPercent = Math.min(100, (annualSavings / maxAnnualSavings) * 100);

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    const handleAction = async (action) => {
        if (onAction) onAction(action, insight.id);
        if (action?.type === 'web_link' && action?.url) {
            try {
                await Linking.openURL(action.url);
            } catch (err) {
                console.error('Failed to open URL:', err);
            }
        }
    };

    const isHighPriority = insight.priority === 'high';

    return (
        <TouchableOpacity
            style={[
                styles.card,
                isHighPriority && styles.highPriorityCard,
            ]}
            onPress={toggleExpand}
            activeOpacity={0.85}
        >
            {/* Top Row: Priority + Dismiss */}
            <View style={styles.topRow}>
                <View style={[styles.priorityBadge, { backgroundColor: priority.bgColor }]}>
                    <Ionicons name={priority.icon} size={12} color={priority.color} />
                    <Text style={[styles.priorityText, { color: priority.color }]}>
                        {priority.label}
                    </Text>
                </View>
                {insight.dismissible && (
                    <TouchableOpacity
                        onPress={() => onDismiss?.(insight.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close" size={18} color={COLORS.TEXT_MUTED} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Category + Title */}
            <View style={styles.headerRow}>
                <View style={[styles.categoryIcon, { backgroundColor: categoryConfig.color + '20' }]}>
                    <Ionicons name={categoryConfig.icon} size={20} color={categoryConfig.color} />
                </View>
                <View style={styles.headerText}>
                    <Text style={[styles.categoryLabel, { color: categoryConfig.color }]}>
                        {insight.type}
                    </Text>
                    <Text style={styles.title} numberOfLines={expanded ? 0 : 2}>
                        {insight.title}
                    </Text>
                </View>
            </View>

            {/* Description (collapsed: 2 lines, expanded: full) */}
            <Text style={styles.description} numberOfLines={expanded ? 0 : 2}>
                {insight.description}
            </Text>

            {/* Impact Meter (always visible) */}
            {annualSavings > 0 && (
                <View style={styles.impactContainer}>
                    <Text style={styles.impactLabel}>
                        ${annualSavings.toLocaleString()}/yr potential {insight.potential_benefit?.annual_growth_estimate ? 'growth' : 'savings'}
                    </Text>
                    <View style={styles.impactBar}>
                        <View style={[styles.impactFill, { width: `${impactPercent}%` }]} />
                    </View>
                </View>
            )}

            {/* Expand indicator */}
            {!expanded && (
                <View style={styles.expandHint}>
                    <Ionicons name="chevron-down" size={16} color={COLORS.TEXT_MUTED} />
                    <Text style={styles.expandText}>Tap for details</Text>
                </View>
            )}

            {/* Expanded Content */}
            {expanded && (
                <View style={styles.expandedContent}>
                    {/* Reasoning */}
                    {insight.reasoning && insight.reasoning.length > 0 && (
                        <View style={styles.reasoningContainer}>
                            <Text style={styles.reasoningLabel}>Why this matters:</Text>
                            {insight.reasoning.map((reason, index) => (
                                <View key={index} style={styles.reasoningItem}>
                                    <View style={[styles.bulletDot, { backgroundColor: categoryConfig.color }]} />
                                    <Text style={styles.reasoningText}>{reason}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Benefit Card */}
                    {insight.potential_benefit && (
                        <View style={styles.benefitCard}>
                            <Ionicons name="trending-up" size={20} color={COLORS.GREEN} />
                            <View style={styles.benefitTextContainer}>
                                <Text style={styles.benefitLabel}>Potential Benefit</Text>
                                <View style={styles.benefitAmounts}>
                                    {insight.potential_benefit.monthly_savings > 0 && (
                                        <Text style={styles.benefitAmount}>
                                            ${insight.potential_benefit.monthly_savings}/mo
                                        </Text>
                                    )}
                                    {(insight.potential_benefit.annual_savings > 0 || insight.potential_benefit.annual_growth_estimate > 0) && (
                                        <Text style={styles.benefitAnnual}>
                                            ${(insight.potential_benefit.annual_savings || insight.potential_benefit.annual_growth_estimate || 0).toLocaleString()}/yr
                                        </Text>
                                    )}
                                </View>
                                {insight.potential_benefit.calculation && (
                                    <Text style={styles.calculationText}>
                                        {insight.potential_benefit.calculation}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionContainer}>
                        {insight.action?.primary && (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={() => handleAction(insight.action.primary)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>
                                    {insight.action.primary.label}
                                </Text>
                                <Ionicons
                                    name={insight.action.primary.type === 'web_link' ? 'open-outline' : 'arrow-forward'}
                                    size={16}
                                    color={COLORS.BACKGROUND}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    highPriorityCard: {
        borderColor: 'rgba(255, 107, 107, 0.3)',
        shadowColor: COLORS.RED,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.SMALL,
        gap: 4,
    },
    priorityText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    categoryIcon: {
        width: 40,
        height: 40,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
    },
    categoryLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.WHITE,
        lineHeight: 22,
    },
    description: {
        fontSize: 14,
        color: COLORS.WHITE,
        lineHeight: 20,
        opacity: 0.85,
        marginBottom: SPACING.SMALL,
    },
    impactContainer: {
        marginBottom: SPACING.SMALL,
    },
    impactLabel: {
        fontSize: 12,
        color: COLORS.GREEN,
        fontWeight: '600',
        marginBottom: 4,
    },
    impactBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    impactFill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: COLORS.GREEN,
    },
    expandHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingTop: SPACING.TINY,
    },
    expandText: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
    },
    expandedContent: {
        marginTop: SPACING.SMALL,
    },
    reasoningContainer: {
        backgroundColor: 'rgba(201, 162, 39, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(201, 162, 39, 0.15)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    reasoningLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        marginBottom: SPACING.SMALL,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    reasoningItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    bulletDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 6,
    },
    reasoningText: {
        flex: 1,
        fontSize: 13,
        color: COLORS.WHITE,
        lineHeight: 18,
        opacity: 0.85,
    },
    benefitCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.3)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    benefitTextContainer: {
        flex: 1,
    },
    benefitLabel: {
        fontSize: 11,
        color: COLORS.GREEN,
        marginBottom: SPACING.TINY,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    benefitAmounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
    },
    benefitAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.GREEN,
    },
    benefitAnnual: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GREEN,
        opacity: 0.8,
    },
    calculationText: {
        fontSize: 11,
        color: COLORS.GOLD_LIGHT,
        marginTop: SPACING.SMALL,
        lineHeight: 16,
        opacity: 0.7,
    },
    actionContainer: {
        gap: SPACING.SMALL,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.GOLD,
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
        gap: SPACING.SMALL,
    },
    primaryButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.BACKGROUND,
    },
});

export default InsightCardV2;
