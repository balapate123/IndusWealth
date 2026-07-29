import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    LayoutAnimation,
    UIManager,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text, Button, BarTrack } from './ui';
import { insightTypeMeta } from '../constants/insights';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Priority is a status encoding, so it uses the reserved semantic colours and
// always ships with an icon and a word — never colour alone.
const priorityConfig = (theme, priority) => {
    switch (priority) {
        case 'high':
            return { color: theme.DANGER, bg: theme.DANGER_DIM, icon: 'alert-circle', label: 'High priority' };
        case 'low':
            return { color: theme.INFO, bg: theme.INFO_DIM, icon: 'checkmark-circle', label: 'Low' };
        default:
            return { color: theme.WARNING, bg: theme.WARNING_DIM, icon: 'information-circle', label: 'Medium' };
    }
};

// Icon, label and ramp slot per insight type. Shared with the spotlight pop-up
// so a type never looks like two different things in two places.
//
// These used to be keyed on long human strings the model wrote freehand
// ("Tax-Advantaged Account Opportunities"), which meant a near certain miss:
// every card fell back to a generic bulb and printed the raw type above the
// title. The type is a closed enum now.

const makeStyles = (t) => StyleSheet.create({
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.SMALL + 2,
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 3,
        borderRadius: RADIUS.SMALL,
        gap: 4,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL + 2,
    },
    typeIcon: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: { flex: 1 },
    typeLabel: { marginBottom: 2 },
    description: { marginBottom: SPACING.SMALL + 2 },
    impact: { marginBottom: SPACING.SMALL + 2 },
    impactLabel: { marginBottom: 5 },
    expandHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingTop: SPACING.TINY,
    },
    expanded: { marginTop: SPACING.SMALL + 2 },
    reasoning: {
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    reasoningLabel: { marginBottom: SPACING.SMALL },
    reasoningItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    bullet: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 8,
    },
    benefit: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: t.SUCCESS_DIM,
        borderRadius: RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    benefitBody: { flex: 1 },
    benefitAmounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
        marginTop: 2,
    },
    calculation: { marginTop: SPACING.SMALL },
    persistence: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: SPACING.SMALL + 2,
    },
});

/**
 * How long this has been outstanding, and roughly what of the quoted benefit has
 * gone by in that time.
 *
 * Sits directly under the "$X/yr potential" bar on purpose — "about $73 so far"
 * only means anything next to the annual figure it is a slice of. The number is
 * calculated by the server from recorded sightings; the model is forbidden from
 * writing one, so there is only ever one version of it.
 *
 * Deliberately not styled as a warning. The user declined to act, which is their
 * decision to make; this states the position, it does not prosecute it.
 */
const PersistenceNote = ({ persistence, styles, theme }) => {
    if (!persistence?.summary || !persistence.is_recurring) return null;

    const cost = persistence.cost_of_inaction;
    const costText = cost > 0
        ? ` — about $${Math.round(cost).toLocaleString()} of that so far`
        : '';

    return (
        <View style={styles.persistence}>
            <Ionicons name="time-outline" size={13} color={theme.TEXT_MUTED} />
            <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                {persistence.summary}{costText}
            </Text>
        </View>
    );
};

const InsightCardV2 = ({ insight, onAction, onDismiss, maxAnnualSavings = 5000 }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [expanded, setExpanded] = useState(false);

    const priority = priorityConfig(theme, insight.priority);
    const meta = insightTypeMeta(insight.type);
    const tint = meta.slot == null ? theme.ACCENT : categoryColor(theme, meta.slot);

    const annualSavings =
        insight.potential_benefit?.annual_savings ||
        insight.potential_benefit?.annual_growth_estimate || 0;

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((v) => !v);
    };

    // Delegate only. This used to call onAction AND open the URL itself, so
    // every web_link opened the browser twice — the screen already handles it,
    // and it owns the navigation object that in-app routes need.
    // The whole insight goes back, not just the id: the caller needs the
    // fingerprint to tell the server which condition was acted on.
    const handleAction = (action) => {
        onAction?.(action, insight);
    };

    const isHigh = insight.priority === 'high';

    return (
        <Card
            inset={false}
            onPress={toggleExpand}
            style={[
                { marginBottom: SPACING.MEDIUM },
                // High priority earns a coloured edge rather than a red glow.
                isHigh && { borderLeftWidth: 3, borderLeftColor: theme.DANGER },
            ]}
        >
            <View style={styles.topRow}>
                <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                    <Ionicons name={priority.icon} size={12} color={priority.color} />
                    <Text variant="overline" color={priority.color}>{priority.label}</Text>
                </View>
                {insight.dismissible && (
                    <TouchableOpacity
                        onPress={() => onDismiss?.(insight)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss insight"
                    >
                        <Ionicons name="close" size={18} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.headerRow}>
                <View style={[styles.typeIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons name={meta.icon} size={20} color={tint} />
                </View>
                <View style={styles.headerText}>
                    <Text variant="overline" color={tint} style={styles.typeLabel}>{meta.label}</Text>
                    <Text variant="title" numberOfLines={expanded ? 0 : 2}>{insight.title}</Text>
                </View>
            </View>

            <Text variant="body" tone="secondary" style={styles.description} numberOfLines={expanded ? 0 : 2}>
                {insight.description}
            </Text>

            {annualSavings > 0 && (
                <View style={styles.impact}>
                    <Text variant="label" tone="success" style={styles.impactLabel}>
                        ${annualSavings.toLocaleString()}/yr potential{' '}
                        {insight.potential_benefit?.annual_growth_estimate ? 'growth' : 'savings'}
                    </Text>
                    <BarTrack value={annualSavings} max={maxAnnualSavings} color={theme.SUCCESS} height={6} />
                </View>
            )}

            <PersistenceNote persistence={insight.persistence} styles={styles} theme={theme} />

            {!expanded && (
                <View style={styles.expandHint}>
                    <Ionicons name="chevron-down" size={16} color={theme.TEXT_MUTED} />
                    <Text variant="meta" tone="muted">Tap for details</Text>
                </View>
            )}

            {expanded && (
                <View style={styles.expanded}>
                    {insight.reasoning?.length > 0 && (
                        <View style={styles.reasoning}>
                            <Text variant="overline" tone="muted" style={styles.reasoningLabel}>
                                Why this matters
                            </Text>
                            {insight.reasoning.map((reason, index) => (
                                <View key={index} style={styles.reasoningItem}>
                                    <View style={[styles.bullet, { backgroundColor: tint }]} />
                                    <Text variant="body" tone="secondary" style={{ flex: 1 }}>{reason}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {insight.potential_benefit && (
                        <View style={styles.benefit}>
                            <Ionicons name="trending-up" size={20} color={theme.SUCCESS} />
                            <View style={styles.benefitBody}>
                                <Text variant="overline" tone="success">Potential benefit</Text>
                                <View style={styles.benefitAmounts}>
                                    {insight.potential_benefit.monthly_savings > 0 && (
                                        <Text variant="h2" tone="success">
                                            ${insight.potential_benefit.monthly_savings}/mo
                                        </Text>
                                    )}
                                    {(insight.potential_benefit.annual_savings > 0
                                        || insight.potential_benefit.annual_growth_estimate > 0) && (
                                        <Text variant="bodyMed" tone="success">
                                            ${(insight.potential_benefit.annual_savings
                                                || insight.potential_benefit.annual_growth_estimate
                                                || 0).toLocaleString()}/yr
                                        </Text>
                                    )}
                                </View>
                                {insight.potential_benefit.calculation && (
                                    <Text variant="meta" tone="muted" style={styles.calculation}>
                                        {insight.potential_benefit.calculation}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {insight.action?.primary && (
                        <Button
                            title={insight.action.primary.label}
                            icon={insight.action.primary.type === 'web_link' ? 'open-outline' : 'arrow-forward'}
                            onPress={() => handleAction(insight.action.primary)}
                            block
                        />
                    )}
                </View>
            )}
        </Card>
    );
};

export default InsightCardV2;
