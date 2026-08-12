import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    Card, Text, Button, Chip, SectionTitle, BottomSheet, EmptyState, LoadingState,
} from './ui';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { RADIUS, SPACING, alpha } from '../constants/tokens';
import useCardDueDates from '../hooks/useCardDueDates';
import useAlert from '../hooks/useAlert';
import CustomAlert from './CustomAlert';
import { describeCardDueDate, ordinalDay, MAX_DUE_DAY } from '../utils/cardDueReminders';
import { ensureNotificationPermission } from '../services/notifications';

/**
 * Payment due dates for credit cards.
 *
 * The section renders whether or not anything is set up — the empty state is
 * the entry point. Goals shipped with their only entry point gated on already
 * owning a goal, which made the whole feature unreachable; that is not repeated
 * here.
 *
 * Dates are user-entered because Plaid's `liabilities` product is not enabled,
 * so there is nothing to read them from. See db/add_card_due_dates.sql.
 */

const LEAD_CHOICES = [
    { value: 0, label: 'On the day' },
    { value: 1, label: '1 day' },
    { value: 3, label: '3 days' },
    { value: 5, label: '5 days' },
    { value: 7, label: '7 days' },
];

const DAYS = Array.from({ length: MAX_DUE_DAY }, (_, i) => i + 1);

const makeStyles = (t) => StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.MEDIUM - 4,
        gap: SPACING.SMALL + 2,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.HAIRLINE },
    iconTile: {
        width: 34, height: 34, borderRadius: RADIUS.SMALL,
        alignItems: 'center', justifyContent: 'center',
    },
    body: { flex: 1 },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SMALL - 2 },
    dayCell: {
        width: 40, height: 36, borderRadius: RADIUS.SMALL,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.SURFACE_SUNKEN,
    },
    leadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SMALL - 2 },
    targetRow: {
        flexDirection: 'row', alignItems: 'center', gap: SPACING.SMALL,
        paddingVertical: SPACING.SMALL + 2,
    },
    field: { marginTop: SPACING.LARGE },
    warnBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 2,
        borderRadius: RADIUS.PILL,
        marginTop: 2,
    },
});

const CardDueDates = ({ linkedAccounts = [], customDebts = [] }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();
    const { dueDates, options, loading, save, remove } = useCardDueDates();

    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);

    const maxCards = options?.maxCards ?? 10;

    /** Cards that have no reminder yet — what the picker offers. */
    const available = useMemo(() => {
        const takenAccounts = new Set(dueDates.map((d) => d.plaid_account_id).filter(Boolean));
        const takenDebts = new Set(dueDates.map((d) => d.custom_debt_id).filter(Boolean));

        return [
            ...linkedAccounts
                .filter((a) => !takenAccounts.has(a.id))
                .map((a) => ({
                    key: `a:${a.id}`,
                    targetType: 'plaid_account',
                    accountId: a.id,
                    label: a.alias || a.name || a.officialName || 'Card',
                    sub: a.subtype || a.type,
                })),
            ...customDebts
                .filter((d) => d.is_custom && !takenDebts.has(d.id))
                .map((d) => ({
                    key: `d:${d.id}`,
                    targetType: 'custom_debt',
                    customDebtId: d.id,
                    label: d.name || 'Debt',
                    sub: 'Manually added',
                })),
        ];
    }, [dueDates, linkedAccounts, customDebts]);

    const openNew = () => setDraft({
        mode: 'pick',
        dueDay: 1,
        leadDays: options?.defaultLeadDays ?? 3,
        enabled: true,
    });

    const openExisting = (row) => setDraft({
        mode: 'edit',
        id: row.id,
        targetType: row.target_type,
        accountId: row.plaid_account_id,
        customDebtId: row.custom_debt_id,
        label: row.card_name || 'Card',
        dueDay: row.due_day,
        leadDays: row.lead_days,
        enabled: row.enabled,
    });

    const handleSave = async () => {
        if (!draft?.targetType) return;
        setSaving(true);

        try {
            // Asked for here, when a reminder is switched on — never at launch.
            // iOS grants exactly one prompt.
            if (draft.enabled) {
                const { granted, canAskAgain } = await ensureNotificationPermission();
                if (!granted) {
                    showAlert(
                        'Notifications are off',
                        canAskAgain
                            ? 'Your due date will be saved, but reminders will not appear until notifications are allowed.'
                            : 'Your due date will be saved. To get reminders, allow notifications for IndusWealth in Settings.'
                    );
                }
            }

            const response = await save({
                targetType: draft.targetType,
                accountId: draft.targetType === 'plaid_account' ? draft.accountId : undefined,
                customDebtId: draft.targetType === 'custom_debt' ? draft.customDebtId : undefined,
                dueDay: draft.dueDay,
                leadDays: draft.leadDays,
                enabled: draft.enabled,
            });

            if (response?.success) {
                setDraft(null);
            } else {
                showAlert(
                    'Could not save',
                    response?.code === 'CARD_LIMIT_REACHED'
                        ? `You can track due dates for up to ${maxCards} cards.`
                        : response?.message || 'Please try again.'
                );
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        showAlert('Remove this reminder?', 'The due date will be forgotten and reminders will stop.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    await remove(draft.id);
                    setDraft(null);
                },
            },
        ]);
    };

    return (
        <>
            <Card>
                <SectionTitle
                    title="Payment due dates"
                    subtitle="Get reminded before a card payment is due"
                    right={
                        available.length > 0 && dueDates.length < maxCards ? (
                            <TouchableOpacity
                                onPress={openNew}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Add a payment reminder"
                            >
                                <Ionicons name="add-circle" size={24} color={theme.ACCENT} />
                            </TouchableOpacity>
                        ) : null
                    }
                />

                {loading ? (
                    <LoadingState />
                ) : dueDates.length === 0 ? (
                    <EmptyState
                        icon="calendar-outline"
                        title="No due dates set"
                        message={
                            available.length > 0
                                ? 'Add a card and we will remind you before the payment is due.'
                                : 'Link a credit card or add a debt to set a payment reminder.'
                        }
                        actionLabel={available.length > 0 ? 'Add a payment reminder' : undefined}
                        onAction={available.length > 0 ? openNew : undefined}
                    />
                ) : (
                    dueDates.map((row, index) => (
                        <TouchableOpacity
                            key={row.id}
                            style={[styles.row, index > 0 && styles.divider]}
                            onPress={() => openExisting(row)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`${row.card_name || 'Card'}, ${describeCardDueDate(row)}`}
                        >
                            <View style={[styles.iconTile, { backgroundColor: alpha(theme.ACCENT, 0.16) }]}>
                                <Ionicons
                                    name={row.enabled ? 'calendar' : 'calendar-outline'}
                                    size={17}
                                    color={theme.ACCENT}
                                />
                            </View>
                            <View style={styles.body}>
                                <Text variant="bodyMed" numberOfLines={1}>
                                    {row.card_name || 'Card'}
                                    {row.account_mask ? ` ••${row.account_mask}` : ''}
                                </Text>
                                <Text variant="meta" tone="muted">{describeCardDueDate(row)}</Text>
                                {/* The reminder is kept when a card disconnects — the
                                    due date has not changed — but say so, because a
                                    reminder for a card that is not syncing is worth
                                    knowing about. */}
                                {row.needs_relink && (
                                    <View style={[styles.warnBadge, { backgroundColor: alpha(theme.WARNING, 0.16) }]}>
                                        <Text variant="overline" color={theme.WARNING}>Reconnect this card</Text>
                                    </View>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    ))
                )}
            </Card>

            <BottomSheet visible={!!draft} onClose={() => setDraft(null)}>
                <SectionTitle
                    title={draft?.mode === 'edit' ? (draft?.label || 'Payment reminder') : 'Payment reminder'}
                    subtitle={
                        draft?.targetType
                            ? `Remind me before the payment is due`
                            : 'Which card is this for?'
                    }
                    right={
                        <TouchableOpacity
                            onPress={() => setDraft(null)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />

                {/* Step one: pick a card. Skipped when editing. */}
                {draft && !draft.targetType && (
                    available.map((option, index) => (
                        <TouchableOpacity
                            key={option.key}
                            style={[styles.targetRow, index > 0 && styles.divider]}
                            onPress={() => setDraft((d) => ({ ...d, ...option, mode: 'new' }))}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconTile, { backgroundColor: alpha(theme.ACCENT, 0.16) }]}>
                                <Ionicons name="card" size={17} color={theme.ACCENT} />
                            </View>
                            <View style={styles.body}>
                                <Text variant="bodyMed" numberOfLines={1}>{option.label}</Text>
                                <Text variant="meta" tone="muted">{option.sub}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    ))
                )}

                {draft?.targetType && (
                    <>
                        <View style={styles.field}>
                            <Text variant="label" tone="secondary">Payment is due on the</Text>
                            <Text variant="meta" tone="muted" style={{ marginBottom: SPACING.SMALL }}>
                                {/* Not a UI limitation to apologise for: a reminder on
                                    the 30th would never fire in February. */}
                                Days after the {MAX_DUE_DAY}th are not offered — they do not exist in every month.
                            </Text>
                            <View style={styles.dayGrid}>
                                {DAYS.map((day) => {
                                    const active = draft.dueDay === day;
                                    return (
                                        <TouchableOpacity
                                            key={day}
                                            style={[
                                                styles.dayCell,
                                                active && { backgroundColor: theme.ACCENT },
                                            ]}
                                            onPress={() => setDraft((d) => ({ ...d, dueDay: day }))}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: active }}
                                            accessibilityLabel={`Due on the ${ordinalDay(day)}`}
                                        >
                                            <Text variant="label" tone={active ? 'onAccent' : 'secondary'}>
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.field}>
                            <Text variant="label" tone="secondary" style={{ marginBottom: SPACING.SMALL }}>
                                Remind me
                            </Text>
                            <View style={styles.leadRow}>
                                {LEAD_CHOICES.map((choice) => (
                                    <Chip
                                        key={choice.value}
                                        label={choice.label}
                                        active={draft.leadDays === choice.value}
                                        onPress={() => setDraft((d) => ({ ...d, leadDays: choice.value }))}
                                    />
                                ))}
                            </View>
                            <Text variant="meta" tone="muted" style={{ marginTop: SPACING.SMALL }}>
                                {draft.leadDays > 0
                                    ? `A reminder on the ${ordinalDay(draft.dueDay)}, and one ${draft.leadDays} day${draft.leadDays === 1 ? '' : 's'} before.`
                                    : `One reminder, on the ${ordinalDay(draft.dueDay)}.`}
                            </Text>
                        </View>

                        <View style={styles.field}>
                            <Chip
                                label={draft.enabled ? 'Reminders on' : 'Reminders off'}
                                icon={draft.enabled ? 'notifications' : 'notifications-off'}
                                active={draft.enabled}
                                onPress={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
                            />
                        </View>

                        <Button
                            title={saving ? 'Saving…' : 'Save'}
                            onPress={handleSave}
                            disabled={saving}
                            block
                            style={{ marginTop: SPACING.LARGE }}
                        />

                        {draft.mode === 'edit' && (
                            <Button
                                title="Remove reminder"
                                variant="ghost"
                                onPress={handleDelete}
                                disabled={saving}
                                block
                                style={{ marginTop: SPACING.SMALL }}
                            />
                        )}
                    </>
                )}
            </BottomSheet>

            <CustomAlert {...alertProps} />
        </>
    );
};

export default CardDueDates;
