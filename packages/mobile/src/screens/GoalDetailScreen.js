import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Button,
    Input,
    BottomSheet,
    BarTrack,
    ListRow,
    StatTile,
    StatGrid,
    SectionTitle,
    EmptyState,
    LoadingState,
} from '../components/ui';
import { money } from '../components/TransactionRow';
import GoalEditorSheet from '../components/GoalEditorSheet';
import CustomAlert from '../components/CustomAlert';
import { useAlert } from '../hooks/useAlert';
import { describeReminder } from '../utils/goalReminders';
import { deadlineLabel } from '../components/GoalCard';
import { syncGoalReminders } from '../services/notifications';
import api from '../services/api';

/**
 * One goal: how far along, what it is tracked against, and its history.
 *
 * Editing, relinking and deleting live here rather than on the list, because
 * this is where the number you are about to affect is on display.
 */

const makeStyles = (t) => StyleSheet.create({
    content: { paddingHorizontal: SPACING.MEDIUM, paddingBottom: 120 },
    hero: { alignItems: 'center', paddingVertical: SPACING.MEDIUM },
    heroIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.SMALL,
    },
    bar: { marginTop: SPACING.MEDIUM, marginBottom: SPACING.SMALL },
    amounts: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },
    warning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.CARD,
        backgroundColor: alpha(t.WARNING, 0.12),
        marginBottom: SPACING.MEDIUM,
    },
    section: { marginTop: SPACING.LARGE },
    sheetField: { marginTop: SPACING.MEDIUM },
    sheetActions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.LARGE },
    addRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});

const GoalDetailScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const goalId = route.params?.goalId;

    const [goal, setGoal] = useState(null);
    const [contributions, setContributions] = useState([]);
    const [options, setOptions] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState(null);

    const [contributeOpen, setContributeOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [contributing, setContributing] = useState(false);

    const load = useCallback(async () => {
        try {
            const response = await api.getGoal(goalId);
            if (response?.success) {
                setGoal(response.data);
                setContributions(response.contributions || []);
                if (response.options) setOptions(response.options);
            }
        } catch (err) {
            console.error('Error loading goal:', err);
        } finally {
            setLoading(false);
        }
    }, [goalId]);

    const loadAccounts = useCallback(async () => {
        try {
            const response = await api.getAccounts();
            const all = response?.accounts || [];
            setAccounts(all.filter((a) => a.type === 'depository'));
        } catch {
            // The relink option simply will not be offered.
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); loadAccounts(); }, [load, loadAccounts]));

    /** Reminders follow the server's active list, so a change here reschedules. */
    const resyncReminders = useCallback(async () => {
        try {
            const response = await api.getGoals('active');
            if (response?.success) await syncGoalReminders(response.data || []);
        } catch (err) {
            console.warn('Could not sync goal reminders:', err?.message || err);
        }
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const handleSave = async (payload) => {
        setSaving(true);
        setEditorError(null);
        try {
            const response = await api.updateGoal(goalId, payload);
            if (response?.success) {
                setGoal(response.data);
                setEditorOpen(false);
                await resyncReminders();
            } else {
                setEditorError(response?.message || 'Could not save that.');
            }
        } catch (err) {
            setEditorError(err?.responseData?.message || 'Could not save that.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        setEditorOpen(false);
        showAlert(
            'Delete this goal?',
            'Its contributions go with it. Nothing happens to your accounts or transactions.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.deleteGoal(goalId);
                            await resyncReminders();
                            navigation.goBack();
                        } catch {
                            showAlert('Could not delete', 'Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleContribute = async () => {
        const value = Number.parseFloat(amount);
        if (!Number.isFinite(value) || value === 0) return;

        setContributing(true);
        try {
            const response = await api.addGoalContribution(goalId, {
                amount: value,
                note: note.trim() || null,
            });
            if (response?.success) {
                setContributeOpen(false);
                setAmount('');
                setNote('');
                await load();
                // A contribution can cross a milestone; ask right away rather
                // than waiting for the next cold start.
                api.checkGoalMilestones().catch(() => {});
            } else {
                showAlert('Could not add that', response?.message || 'Please try again.');
            }
        } catch (err) {
            showAlert('Could not add that', err?.responseData?.message || 'Please try again.');
        } finally {
            setContributing(false);
        }
    };

    const relink = () => {
        if (accounts.length === 0) {
            showAlert('No accounts connected', 'Connect a bank account first, then link this goal to it.');
            return;
        }
        setEditorOpen(true);
    };

    if (loading) {
        return (
            <Screen>
                <ScreenHeader title={route.params?.name || 'Goal'} onBack={() => navigation.goBack()} />
                <LoadingState message="Loading" />
            </Screen>
        );
    }

    if (!goal) {
        return (
            <Screen>
                <ScreenHeader title="Goal" onBack={() => navigation.goBack()} />
                <EmptyState icon="alert-circle-outline" title="Goal not found" message="It may have been deleted." />
            </Screen>
        );
    }

    const tint = categoryColor(theme, goal.color_index);
    const achieved = goal.status === 'achieved';
    const disconnected = goal.needs_relink || goal.progress_percent === null;
    const saved = Number(goal.saved_amount) || 0;
    const target = Number(goal.target_amount) || 0;
    const percent = disconnected ? 0 : Math.round(Number(goal.progress_percent) || 0);
    const remaining = Math.max(target - saved, 0);
    const deadline = deadlineLabel(goal);

    return (
        <Screen>
            <ScreenHeader
                title={goal.name}
                onBack={() => navigation.goBack()}
                right={(
                    <TouchableOpacity
                        onPress={() => { setEditorError(null); setEditorOpen(true); }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Edit goal"
                    >
                        <Text variant="label" color={theme.ACCENT}>Edit</Text>
                    </TouchableOpacity>
                )}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ACCENT} />
                }
            >
                {disconnected && (
                    <TouchableOpacity style={styles.warning} onPress={relink} activeOpacity={0.8} accessibilityRole="button">
                        <Ionicons name="unlink-outline" size={18} color={theme.WARNING} />
                        <Text variant="meta" style={{ flex: 1 }}>
                            The account this goal followed is no longer connected, so progress cannot
                            be measured. Tap to link another one.
                        </Text>
                    </TouchableOpacity>
                )}

                <Card inset={false}>
                    <View style={styles.hero}>
                        <View style={[styles.heroIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                            <Ionicons
                                name={achieved ? 'checkmark-circle' : goal.icon || 'flag'}
                                size={26}
                                color={achieved ? theme.SUCCESS : tint}
                            />
                        </View>
                        <Text variant="h1">{disconnected ? '—' : `${percent}%`}</Text>
                        <Text variant="meta" tone="muted">
                            {achieved ? 'Target reached' : disconnected ? 'Not tracking' : `${money(remaining)} to go`}
                        </Text>
                    </View>

                    <BarTrack
                        value={percent}
                        max={100}
                        color={achieved ? theme.SUCCESS : tint}
                        height={10}
                        style={styles.bar}
                    />

                    <View style={styles.amounts}>
                        <Text variant="body">{disconnected ? '—' : money(saved)}</Text>
                        <Text variant="meta" tone="muted">of {money(target)}</Text>
                    </View>
                </Card>

                <StatGrid style={styles.section}>
                    <StatTile
                        label="Tracked by"
                        value={goal.tracking_mode === 'account' ? 'Account' : 'By hand'}
                        sub={goal.tracking_mode === 'account'
                            ? (goal.account_name || 'Disconnected')
                            : `${contributions.length} entries`}
                    />
                    <StatTile
                        label="Target date"
                        value={goal.target_date ? new Date(goal.target_date).toLocaleDateString('en-CA') : 'None'}
                        sub={deadline || 'No deadline'}
                    />
                </StatGrid>

                <Card inset={false} style={styles.section}>
                    <ListRow
                        icon={goal.reminder_cadence ? 'notifications-outline' : 'notifications-off-outline'}
                        iconColor={goal.reminder_cadence ? tint : theme.TEXT_MUTED}
                        title="Reminder"
                        subtitle={describeReminder(goal)}
                        onPress={() => { setEditorError(null); setEditorOpen(true); }}
                        chevron
                    />
                    {goal.tracking_mode === 'account' && (
                        <ListRow
                            icon="business-outline"
                            iconColor={tint}
                            title="Linked account"
                            subtitle={goal.account_name
                                ? `${goal.account_name}${goal.account_mask ? ` ••${goal.account_mask}` : ''}`
                                : 'Disconnected'}
                            value={goal.account_balance != null ? money(goal.account_balance) : '—'}
                            divider
                        />
                    )}
                    {goal.tracking_mode === 'account' && goal.baseline_amount > 0 && (
                        <ListRow
                            icon="flag-outline"
                            iconColor={theme.TEXT_MUTED}
                            title="Counting from"
                            subtitle="The balance when you linked this account"
                            value={money(goal.baseline_amount)}
                            divider
                        />
                    )}
                </Card>

                {goal.tracking_mode === 'manual' && (
                    <View style={styles.section}>
                        <SectionTitle
                            title="Contributions"
                            right={(
                                <TouchableOpacity
                                    style={styles.addRow}
                                    onPress={() => setContributeOpen(true)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel="Add contribution"
                                >
                                    <Ionicons name="add" size={18} color={theme.ACCENT} />
                                    <Text variant="label" color={theme.ACCENT}>Add</Text>
                                </TouchableOpacity>
                            )}
                        />

                        {contributions.length === 0 ? (
                            <EmptyState
                                icon="wallet-outline"
                                title="Nothing logged yet"
                                message="Add what you put aside and it counts toward this goal."
                                actionLabel="Add the first one"
                                onAction={() => setContributeOpen(true)}
                            />
                        ) : (
                            <Card inset={false}>
                                {contributions.map((entry, index) => (
                                    <ListRow
                                        key={entry.id}
                                        icon={entry.amount < 0 ? 'remove-circle-outline' : 'add-circle-outline'}
                                        iconColor={entry.amount < 0 ? theme.DANGER : theme.SUCCESS}
                                        title={entry.note || (entry.amount < 0 ? 'Withdrawal' : 'Contribution')}
                                        subtitle={new Date(entry.occurred_on).toLocaleDateString('en-CA')}
                                        value={`${entry.amount < 0 ? '−' : '+'}${money(entry.amount)}`}
                                        valueColor={entry.amount < 0 ? theme.DANGER : theme.SUCCESS}
                                        divider={index > 0}
                                    />
                                ))}
                            </Card>
                        )}
                    </View>
                )}
            </ScrollView>

            <GoalEditorSheet
                visible={editorOpen}
                goal={goal}
                options={options}
                accounts={accounts}
                saving={saving}
                error={editorError}
                onSave={handleSave}
                onDelete={handleDelete}
                onClose={() => setEditorOpen(false)}
            />

            <BottomSheet visible={contributeOpen} onClose={() => setContributeOpen(false)}>
                <SectionTitle title="Add a contribution" />
                <View style={styles.sheetField}>
                    <Input
                        label="Amount"
                        placeholder="50"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        editable={!contributing}
                    />
                </View>
                <View style={styles.sheetField}>
                    <Input
                        label="Note (optional)"
                        placeholder="Tax refund"
                        value={note}
                        onChangeText={setNote}
                        maxLength={140}
                        editable={!contributing}
                    />
                </View>
                <Text variant="meta" tone="muted" style={styles.sheetField}>
                    Use a negative amount to record money taken back out.
                </Text>
                <View style={styles.sheetActions}>
                    <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setContributeOpen(false)}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title="Add"
                        onPress={handleContribute}
                        loading={contributing}
                        disabled={!Number.isFinite(Number.parseFloat(amount)) || Number.parseFloat(amount) === 0}
                        style={{ flex: 1 }}
                    />
                </View>
            </BottomSheet>

            <CustomAlert {...alertProps} />
        </Screen>
    );
};

export default GoalDetailScreen;
