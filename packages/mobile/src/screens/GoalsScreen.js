import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, alpha } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Chip,
    ChipRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import GoalCard from '../components/GoalCard';
import GoalEditorSheet from '../components/GoalEditorSheet';
import CustomAlert from '../components/CustomAlert';
import { useAlert } from '../hooks/useAlert';
import useGoals from '../hooks/useGoals';
import { ensureNotificationPermission, getNotificationPermission } from '../services/notifications';
import api from '../services/api';

/**
 * Every goal the user has, with how far along each one is.
 *
 * Progress is the server's — computed from a live account balance or from
 * logged contributions — never summed from anything this screen holds.
 */

const FILTERS = [
    { value: 'active', label: 'Active' },
    { value: 'all', label: 'All' },
];

const makeStyles = (t) => StyleSheet.create({
    content: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
    intro: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.SMALL,
    },
    add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.CARD,
        backgroundColor: alpha(t.ACCENT, 0.12),
    },
});

const GoalsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [filter, setFilter] = useState('active');
    const { goals, options, loading, load, create } = useGoals({ status: filter });

    const [refreshing, setRefreshing] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState(null);
    const [needsPermission, setNeedsPermission] = useState(false);

    // Only depository accounts make sense as a savings target — pointing a goal
    // at a credit card would count a growing debt as progress.
    const loadAccounts = useCallback(async () => {
        try {
            const response = await api.getAccounts();
            const all = response?.accounts || response?.data || [];
            setAccounts(all.filter((a) => a.type === 'depository'));
        } catch (err) {
            // The editor simply offers manual tracking only.
            console.warn('Could not load accounts for the goal editor:', err?.message || err);
        }
    }, []);

    const refreshPermissionBanner = useCallback(async () => {
        try {
            const { granted } = await getNotificationPermission();
            const anyReminders = goals.some((g) => g.reminder_cadence);
            setNeedsPermission(anyReminders && !granted);
        } catch {
            setNeedsPermission(false);
        }
    }, [goals]);

    useFocusEffect(
        useCallback(() => {
            load({ silent: true });
            loadAccounts();
        }, [load, loadAccounts])
    );

    useFocusEffect(
        useCallback(() => { refreshPermissionBanner(); }, [refreshPermissionBanner])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await load({ silent: true });
        setRefreshing(false);
    };

    const handleCreate = async (payload) => {
        setSaving(true);
        setEditorError(null);
        try {
            const response = await create(payload);
            if (response?.success) {
                setEditorOpen(false);
                // Ask for permission only now, when a reminder was actually
                // requested. iOS grants one prompt, and spending it at launch
                // is how an app ends up permanently unable to notify anyone.
                if (payload.reminderCadence) {
                    const { granted, canAskAgain } = await ensureNotificationPermission();
                    if (!granted) {
                        setNeedsPermission(true);
                        showAlert(
                            'Reminder saved, notifications off',
                            canAskAgain
                                ? 'Your goal is saved. Turn on notifications to get the nudge.'
                                : 'Your goal is saved, but notifications are turned off for IndusWealth. You can enable them in your device settings.'
                        );
                    } else {
                        // Permission just arrived — reload so the hook schedules.
                        await load({ silent: true });
                    }
                }
            } else {
                setEditorError(response?.message || 'Could not create that goal.');
            }
        } catch (err) {
            setEditorError(err?.responseData?.message || 'Could not create that goal.');
        } finally {
            setSaving(false);
        }
    };

    const enableNotifications = async () => {
        const { granted, canAskAgain } = await ensureNotificationPermission();
        if (granted) {
            await load({ silent: true });
            setNeedsPermission(false);
        } else if (!canAskAgain) {
            showAlert(
                'Notifications are off',
                'IndusWealth cannot ask again from inside the app. You can turn notifications on in your device settings.'
            );
        }
    };

    const header = (
        <ScreenHeader
            title="Goals"
            onBack={() => navigation.goBack()}
            right={(
                <TouchableOpacity
                    style={styles.add}
                    onPress={() => { setEditorError(null); setEditorOpen(true); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="New goal"
                >
                    <Ionicons name="add" size={20} color={theme.ACCENT} />
                    <Text variant="label" color={theme.ACCENT}>New</Text>
                </TouchableOpacity>
            )}
        />
    );

    if (loading && goals.length === 0) {
        return (
            <Screen>
                {header}
                <LoadingState message="Loading your goals" />
            </Screen>
        );
    }

    return (
        <Screen>
            {header}

            <View style={styles.intro}>
                <Text variant="meta" tone="muted">
                    Set a target, then either link an account or log what you put aside.
                </Text>
            </View>

            <ChipRow>
                {FILTERS.map((option) => (
                    <Chip
                        key={option.value}
                        label={option.label}
                        active={filter === option.value}
                        onPress={() => setFilter(option.value)}
                    />
                ))}
            </ChipRow>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ACCENT} />
                }
            >
                {needsPermission && (
                    <TouchableOpacity
                        style={styles.banner}
                        onPress={enableNotifications}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                    >
                        <Ionicons name="notifications-off-outline" size={18} color={theme.ACCENT} />
                        <Text variant="meta" style={{ flex: 1 }}>
                            You have reminders set, but notifications are off. Tap to turn them on.
                        </Text>
                    </TouchableOpacity>
                )}

                {goals.length === 0 ? (
                    <EmptyState
                        icon="flag-outline"
                        title="No goals yet"
                        message={
                            filter === 'active'
                                ? 'An emergency fund is the usual first one — three months of expenses, somewhere you can reach it.'
                                : 'Nothing here yet.'
                        }
                        actionLabel="Create a goal"
                        onAction={() => { setEditorError(null); setEditorOpen(true); }}
                    />
                ) : (
                    goals.map((goal) => (
                        <GoalCard
                            key={goal.id}
                            goal={goal}
                            onPress={() => navigation.navigate('GoalDetail', { goalId: goal.id, name: goal.name })}
                        />
                    ))
                )}
            </ScrollView>

            <GoalEditorSheet
                visible={editorOpen}
                options={options}
                accounts={accounts}
                saving={saving}
                error={editorError}
                onSave={handleCreate}
                onClose={() => setEditorOpen(false)}
            />

            <CustomAlert {...alertProps} />
        </Screen>
    );
};

export default GoalsScreen;
