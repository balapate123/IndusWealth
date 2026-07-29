import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button } from './ui';
import { insightTypeMeta, SNOOZE_DAYS } from '../constants/insights';

/**
 * One recommendation, raised to a pop-up.
 *
 * Only ever shown for something the user has already been told at least twice
 * and has not acted on — the server enforces that. Interrupting someone with an
 * insight they have never had a chance to read is noise; interrupting them
 * because a condition has persisted for weeks and is quantifiably costing them
 * is the one case where an interruption earns its place.
 *
 * Three ways out, all of them final for at least a week:
 *   - the action, which stops the cost counter server-side;
 *   - "Remind me later", a dated snooze;
 *   - dismiss (button or backdrop), which suppresses the condition outright.
 *
 * There is deliberately no way to close this without answering it in some form,
 * because a pop-up that can be flicked away and immediately returns is worse
 * than no pop-up.
 */

const makeStyles = (t) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: SPACING.MEDIUM,
    },
    headerText: { flex: 1 },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    typeIcon: {
        width: 36,
        height: 36,
        borderRadius: RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { marginBottom: SPACING.SMALL },
    description: { marginBottom: SPACING.MEDIUM },
    ledger: {
        backgroundColor: t.SURFACE_SUNKEN,
        borderRadius: RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    ledgerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACING.MEDIUM,
    },
    actions: { gap: SPACING.SMALL, marginTop: SPACING.TINY },
    secondaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACING.SMALL,
    },
    textButton: { paddingVertical: SPACING.SMALL, paddingHorizontal: SPACING.SMALL },
});

const InsightSpotlight = ({ insight, visible, onAct, onSnooze, onDismiss, onSeen }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // Fires once per insight, on render rather than on fetch. The server starts
    // the user's week-long cooldown from this call, so counting a pop-up that
    // was fetched in the background and never drawn would spend the user's one
    // interruption on nothing.
    const reportedFor = useRef(null);
    useEffect(() => {
        if (!visible || !insight?.persistence?.fingerprint) return;
        if (reportedFor.current === insight.persistence.fingerprint) return;
        reportedFor.current = insight.persistence.fingerprint;
        onSeen?.(insight.persistence.fingerprint);
    }, [visible, insight, onSeen]);

    if (!insight) return null;

    const meta = insightTypeMeta(insight.type);
    const tint = meta.slot == null ? theme.ACCENT : categoryColor(theme, meta.slot);
    const persistence = insight.persistence || {};
    const cost = persistence.cost_of_inaction;
    const annual = insight.potential_benefit?.annual_savings
        || insight.potential_benefit?.annual_growth_estimate
        || 0;

    return (
        <BottomSheet visible={visible} onClose={onDismiss} scroll>
            <View style={styles.header}>
                <View style={styles.headerText}>
                    <Text variant="overline" tone="muted">Still open</Text>
                    <Text variant="h2">A recommendation you have not acted on</Text>
                </View>
            </View>

            <View style={styles.typeRow}>
                <View style={[styles.typeIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons name={meta.icon} size={18} color={tint} />
                </View>
                <Text variant="overline" color={tint}>{meta.label}</Text>
            </View>

            <Text variant="title" style={styles.title}>{insight.title}</Text>
            <Text variant="body" tone="secondary" style={styles.description}>
                {insight.description}
            </Text>

            {/* The ledger. Every figure here is calculated by the server from
                recorded sightings — the model is not allowed to write any of
                them, so there is only ever one version of the number. */}
            <View style={styles.ledger}>
                {persistence.outstanding_days > 0 && (
                    <View style={styles.ledgerRow}>
                        <Text variant="meta" tone="secondary">Outstanding</Text>
                        <Text variant="num">{persistence.outstanding_days} days</Text>
                    </View>
                )}
                {annual > 0 && (
                    <View style={styles.ledgerRow}>
                        <Text variant="meta" tone="secondary">Potential benefit</Text>
                        <Text variant="num" tone="success">${annual.toLocaleString()}/yr</Text>
                    </View>
                )}
                {cost > 0 && (
                    <View style={styles.ledgerRow}>
                        <Text variant="meta" tone="secondary">Of that, so far</Text>
                        <Text variant="num">≈${Math.round(cost).toLocaleString()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.actions}>
                {insight.action?.primary && (
                    <Button
                        title={insight.action.primary.label}
                        icon={insight.action.primary.type === 'web_link' ? 'open-outline' : 'arrow-forward'}
                        onPress={() => onAct?.(insight.action.primary, insight)}
                        block
                    />
                )}

                <View style={styles.secondaryRow}>
                    <TouchableOpacity
                        style={styles.textButton}
                        onPress={() => onSnooze?.(insight)}
                        accessibilityRole="button"
                    >
                        <Text variant="label" tone="link">Remind me in {SNOOZE_DAYS} days</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.textButton}
                        onPress={() => onDismiss?.(insight)}
                        accessibilityRole="button"
                    >
                        <Text variant="label" tone="muted">Not interested</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Text variant="meta" tone="muted" style={{ marginTop: SPACING.MEDIUM }}>
                {"Figures are estimates based on your own accounts. This is information, not financial advice."}
            </Text>
        </BottomSheet>
    );
};

export default InsightSpotlight;
