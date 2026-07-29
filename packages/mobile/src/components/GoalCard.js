import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text, BarTrack } from './ui';
import { money } from './TransactionRow';

/**
 * One goal: what it is, how far along, and what it needs next.
 *
 * Shared by the Goals list and the Home summary so the two cannot drift into
 * showing the same goal differently.
 *
 * `progress_percent` is null — not zero — when the goal follows an account that
 * has been disconnected. Those are two very different states and the card says
 * so, because "0% saved" would read as a real measurement of nothing.
 */

const makeStyles = (t) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    icon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titles: { flex: 1 },
    amounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginTop: SPACING.MEDIUM,
        marginBottom: 6,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: SPACING.SMALL,
    },
    warning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: SPACING.SMALL,
        padding: SPACING.SMALL,
        borderRadius: RADIUS.CHIP,
        backgroundColor: alpha(t.WARNING, 0.12),
    },
});

/** Days between now and a target date; negative once it has passed. */
const daysUntil = (dateString) => {
    if (!dateString) return null;
    const target = new Date(dateString);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
};

const deadlineLabel = (goal) => {
    const days = daysUntil(goal.target_date);
    if (days === null) return null;
    if (goal.status === 'achieved') return null;
    if (days < 0) return `${Math.abs(days)} days past target`;
    if (days === 0) return 'Target is today';
    if (days === 1) return '1 day left';
    if (days < 45) return `${days} days left`;
    const months = Math.round(days / 30);
    return `${months} months left`;
};

const GoalCard = ({ goal, onPress, compact = false }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const tint = categoryColor(theme, goal.color_index);
    const achieved = goal.status === 'achieved';
    const disconnected = goal.needs_relink || goal.progress_percent === null;

    const saved = Number(goal.saved_amount) || 0;
    const target = Number(goal.target_amount) || 0;
    const percent = disconnected ? 0 : Math.round(Number(goal.progress_percent) || 0);
    const remaining = Math.max(target - saved, 0);
    const deadline = deadlineLabel(goal);

    return (
        <Card inset={false} onPress={onPress} style={{ marginBottom: SPACING.MEDIUM }}>
            <View style={styles.header}>
                <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Ionicons
                        name={achieved ? 'checkmark-circle' : goal.icon || 'flag'}
                        size={18}
                        color={tint}
                    />
                </View>

                <View style={styles.titles}>
                    <Text variant="body" numberOfLines={1}>{goal.name}</Text>
                    <Text variant="meta" tone="muted" numberOfLines={1}>
                        {achieved
                            ? 'Reached'
                            : goal.tracking_mode === 'account'
                                ? goal.account_name || 'Linked account'
                                : 'Tracked by hand'}
                    </Text>
                </View>

                {!compact && (
                    <Text variant="label" color={achieved ? theme.SUCCESS : tint}>
                        {disconnected ? '—' : `${percent}%`}
                    </Text>
                )}
            </View>

            {disconnected ? (
                <View style={styles.warning}>
                    <Ionicons name="unlink-outline" size={14} color={theme.WARNING} />
                    <Text variant="meta" color={theme.WARNING} style={{ flex: 1 }}>
                        The account this goal followed is no longer connected. Reconnect it to
                        see progress again.
                    </Text>
                </View>
            ) : (
                <>
                    <View style={styles.amounts}>
                        <Text variant="body">{money(saved)}</Text>
                        <Text variant="meta" tone="muted">of {money(target)}</Text>
                    </View>

                    <BarTrack
                        value={percent}
                        max={100}
                        color={achieved ? theme.SUCCESS : tint}
                        height={8}
                    />

                    {!compact && (
                        <View style={styles.footer}>
                            <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                                {achieved ? 'Target reached' : `${money(remaining)} to go`}
                            </Text>
                            {deadline && <Text variant="meta" tone="muted">{deadline}</Text>}
                        </View>
                    )}
                </>
            )}
        </Card>
    );
};

export default GoalCard;
export { deadlineLabel, daysUntil };
