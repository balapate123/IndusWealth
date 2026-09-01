import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Text, Button, Overline } from './ui';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { RADIUS, SPACING, alpha } from '../constants/tokens';

/**
 * The weekly check-in sheet: one thing, one action, and a way out.
 *
 * Never scolds. The user declined to act, or has not got to it — that is their
 * decision, and the copy the server sends is written to state a fact rather
 * than assign fault. The same rule the insight spotlight holds.
 */

// One entry per kind in services/nudges.js NUDGE_KINDS. The fallback below is
// a safety net, not a licence to leave a kind out: tests/checkinNudge.test.mjs
// fails when the two lists disagree.
const ICONS = {
    goal_finish: 'flag',
    goal_stalled: 'time-outline',
    goal_step: 'trending-up',
    goal_relink: 'link-outline',
    // Matches the pace line on GoalCard, which is the same measurement.
    goal_behind: 'speedometer-outline',
    debt_interest: 'card-outline',
};

const makeStyles = (t) => StyleSheet.create({
    icon: {
        width: 44, height: 44, borderRadius: RADIUS.MEDIUM,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: alpha(t.ACCENT, 0.16),
        marginBottom: SPACING.MEDIUM,
    },
    actions: { marginTop: SPACING.LARGE, gap: SPACING.SMALL },
});

const CheckinNudge = ({ nudge, visible, onAct, onDismiss, onMarkSeen, onTurnOff }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // Fires on render, not on fetch. A nudge that was loaded in the background
    // and never shown must not burn the user's one interruption a week.
    useEffect(() => {
        if (visible && nudge) onMarkSeen?.();
    }, [visible, nudge, onMarkSeen]);

    if (!nudge) return null;

    return (
        <BottomSheet visible={visible} onClose={onDismiss}>
            <View style={styles.icon}>
                <Ionicons name={ICONS[nudge.kind] || 'sparkles'} size={22} color={theme.ACCENT} />
            </View>

            <Overline tone="muted">This week</Overline>
            <Text variant="h2" style={{ marginTop: SPACING.TINY }}>{nudge.title}</Text>
            <Text variant="body" tone="secondary" style={{ marginTop: SPACING.SMALL }}>
                {nudge.body}
            </Text>

            <View style={styles.actions}>
                <Button
                    title={nudge.action?.label || 'Open'}
                    onPress={() => onAct?.(nudge)}
                    block
                />
                <Button title="Not now" variant="ghost" onPress={onDismiss} block />
                {/* An easy, permanent way out, in the place someone is most
                    likely to want one. Burying it in Settings is how a weekly
                    nudge becomes the reason an app gets uninstalled. */}
                <Button
                    title="Stop weekly check-ins"
                    variant="ghost"
                    size="sm"
                    onPress={() => { onTurnOff?.(); onDismiss?.(); }}
                    block
                />
            </View>
        </BottomSheet>
    );
};

export default CheckinNudge;
