import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button, Input, SectionTitle, Chip, ChipRow } from './ui';
import {
    GOAL_ICONS,
    GOAL_RAMP_SIZE,
    GOAL_TYPES,
    CADENCE_OPTIONS,
    WEEKDAYS,
} from '../constants/goals';

/**
 * Create or edit a goal: what it is, how much, how it is tracked, and whether
 * it nudges you.
 *
 * Colour comes from the theme's validated ramp by index, never a hex, so dark
 * and light each resolve their own legible hue. The icon is the secondary
 * encoding once goals outnumber the seven hues.
 *
 * `options` comes from GET /goals and is authoritative; the local constants are
 * the fallback before that response lands.
 */

const SWATCH = 34;
const ICON_TILE = 44;

const makeStyles = (t) => StyleSheet.create({
    body: { maxHeight: 520 },
    field: { marginTop: SPACING.MEDIUM, gap: SPACING.SMALL },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SMALL + 2 },
    swatch: {
        width: SWATCH,
        height: SWATCH,
        borderRadius: SWATCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // The ring sits outside the fill so the hue is never dimmed by selection —
    // you are picking a colour, so it has to stay true.
    swatchOn: { borderWidth: 2, borderColor: t.TEXT_PRIMARY },
    icons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SMALL },
    iconTile: {
        width: ICON_TILE,
        height: ICON_TILE,
        borderRadius: RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: SPACING.SMALL + 2,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    note: { marginTop: 4 },
    hours: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SMALL },
    hourTile: {
        paddingVertical: 6,
        paddingHorizontal: SPACING.SMALL + 2,
        borderRadius: RADIUS.CHIP,
        backgroundColor: t.SURFACE_HIGH,
    },
    actions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.LARGE },
    danger: { marginTop: SPACING.SMALL },
    error: { marginTop: SPACING.SMALL },
});

/** Reminder hours worth offering. A full 0-23 picker is noise. */
const HOURS = [7, 8, 9, 12, 17, 18, 20, 21];
const hourLabel = (hour) => {
    const suffix = hour < 12 ? 'am' : 'pm';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${suffix}`;
};

/**
 * The form. Split out so the sheet can re-key it on every open: fields then
 * initialise straight from props, and editing one goal after another cannot
 * carry the first one's values across without an effect writing state on the
 * way in.
 */
const GoalEditorBody = ({
    goal, options, accounts, saving, error, onSave, onDelete, onClose,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const isEdit = !!goal?.id;

    const [name, setName] = useState(goal?.name || '');
    const [goalType, setGoalType] = useState(goal?.goal_type || 'savings');
    const [targetAmount, setTargetAmount] = useState(
        goal?.target_amount != null ? String(goal.target_amount) : ''
    );
    const [colorIndex, setColorIndex] = useState(goal?.color_index ?? 0);
    const [icon, setIcon] = useState(goal?.icon || 'flag');
    const [accountId, setAccountId] = useState(goal?.account_id ?? null);
    const [countExisting, setCountExisting] = useState(goal ? goal.baseline_amount === 0 : false);
    const [cadence, setCadence] = useState(goal?.reminder_cadence ?? null);
    const [reminderDay, setReminderDay] = useState(goal?.reminder_day ?? 1);
    const [reminderHour, setReminderHour] = useState(goal?.reminder_hour ?? 9);
    const [reminderAmount, setReminderAmount] = useState(
        goal?.reminder_amount != null ? String(goal.reminder_amount) : ''
    );

    const icons = options?.icons?.length ? options.icons : GOAL_ICONS;
    const rampSize = options?.rampSize || GOAL_RAMP_SIZE;
    const types = options?.types?.length
        ? GOAL_TYPES.filter((t) => options.types.includes(t.value))
        : GOAL_TYPES;

    const tint = categoryColor(theme, colorIndex);
    const trimmed = name.trim();
    const amount = Number.parseFloat(targetAmount);
    const valid = trimmed.length > 0 && Number.isFinite(amount) && amount > 0;

    const submit = () => {
        const payload = {
            name: trimmed,
            goalType,
            targetAmount: amount,
            colorIndex,
            icon,
            reminderCadence: cadence,
            reminderHour: cadence ? reminderHour : undefined,
            reminderDay: cadence === 'weekly' || cadence === 'monthly' ? reminderDay : undefined,
            reminderAmount: cadence && Number.parseFloat(reminderAmount) > 0
                ? Number.parseFloat(reminderAmount)
                : null,
        };

        // trackingMode is only sent on create; changing it later goes through
        // the relink action on the detail screen, which re-snapshots the
        // baseline so progress is not measured against another account.
        if (!isEdit) {
            payload.trackingMode = accountId ? 'account' : 'manual';
            if (accountId) {
                payload.accountId = accountId;
                payload.countExistingBalance = countExisting;
            }
        }

        onSave(payload);
    };

    return (
        <>
            <SectionTitle title={isEdit ? 'Edit goal' : 'New goal'} />

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.field}>
                    <Input
                        label="Name"
                        placeholder="Emergency fund, New laptop..."
                        value={name}
                        onChangeText={setName}
                        maxLength={60}
                        autoCapitalize="words"
                        editable={!saving}
                    />
                </View>

                <View style={styles.field}>
                    <Input
                        label="Target amount"
                        placeholder="5000"
                        value={targetAmount}
                        onChangeText={setTargetAmount}
                        keyboardType="decimal-pad"
                        editable={!saving}
                    />
                </View>

                <View style={styles.field}>
                    <Text variant="label" tone="secondary">Type</Text>
                    <ChipRow>
                        {types.map((type) => (
                            <Chip
                                key={type.value}
                                label={type.label}
                                active={goalType === type.value}
                                onPress={() => {
                                    setGoalType(type.value);
                                    // Only follow the type's icon while the user
                                    // has not chosen one of their own.
                                    if (!isEdit && icon === 'flag') setIcon(type.icon);
                                }}
                            />
                        ))}
                    </ChipRow>
                </View>

                {!isEdit && (
                    <View style={styles.field}>
                        <Text variant="label" tone="secondary">How should we track it?</Text>

                        <TouchableOpacity
                            onPress={() => setAccountId(null)}
                            activeOpacity={0.7}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: accountId === null }}
                            style={[
                                styles.accountRow,
                                accountId === null && { borderColor: tint, backgroundColor: alpha(tint, 0.1) },
                            ]}
                        >
                            <View style={{ flex: 1 }}>
                                {/* A JS string, not JSX text: React Native does not
                                    decode HTML entities, so &apos; would render
                                    literally on the device. */}
                                <Text variant="body">{"I'll add contributions myself"}</Text>
                                <Text variant="meta" tone="muted">Log each amount as you save it</Text>
                            </View>
                            {accountId === null && <Ionicons name="checkmark-circle" size={20} color={tint} />}
                        </TouchableOpacity>

                        {(accounts || []).map((account) => {
                            const active = accountId === account.id;
                            return (
                                <TouchableOpacity
                                    key={account.id}
                                    onPress={() => setAccountId(account.id)}
                                    activeOpacity={0.7}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: active }}
                                    style={[
                                        styles.accountRow,
                                        active && { borderColor: tint, backgroundColor: alpha(tint, 0.1) },
                                    ]}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text variant="body" numberOfLines={1}>{account.name}</Text>
                                        <Text variant="meta" tone="muted">
                                            {"Follows this account's balance"}
                                        </Text>
                                    </View>
                                    {active && <Ionicons name="checkmark-circle" size={20} color={tint} />}
                                </TouchableOpacity>
                            );
                        })}

                        {accountId !== null && (
                            <>
                                <ChipRow>
                                    <Chip
                                        label="Start from zero"
                                        active={!countExisting}
                                        onPress={() => setCountExisting(false)}
                                    />
                                    <Chip
                                        label="Count what's already there"
                                        active={countExisting}
                                        onPress={() => setCountExisting(true)}
                                    />
                                </ChipRow>
                                <Text variant="meta" tone="muted" style={styles.note}>
                                    {countExisting
                                        ? "The balance you have today counts toward this goal."
                                        : "Only money added from today counts toward this goal."}
                                </Text>
                            </>
                        )}
                    </View>
                )}

                <View style={styles.field}>
                    <Text variant="label" tone="secondary">Remind me</Text>
                    <ChipRow>
                        {CADENCE_OPTIONS.map((option) => (
                            <Chip
                                key={String(option.value)}
                                label={option.label}
                                active={cadence === option.value}
                                onPress={() => setCadence(option.value)}
                            />
                        ))}
                    </ChipRow>
                </View>

                {cadence === 'weekly' && (
                    <View style={styles.field}>
                        <Text variant="label" tone="secondary">Day</Text>
                        <ChipRow>
                            {WEEKDAYS.map((day) => (
                                <Chip
                                    key={day.value}
                                    label={day.label}
                                    active={reminderDay === day.value}
                                    onPress={() => setReminderDay(day.value)}
                                />
                            ))}
                        </ChipRow>
                    </View>
                )}

                {cadence === 'monthly' && (
                    <View style={styles.field}>
                        <Text variant="label" tone="secondary">Day of month</Text>
                        <ChipRow>
                            {[1, 5, 10, 15, 20, 25, 28].map((day) => (
                                <Chip
                                    key={day}
                                    label={String(day)}
                                    active={reminderDay === day}
                                    onPress={() => setReminderDay(day)}
                                />
                            ))}
                        </ChipRow>
                        <Text variant="meta" tone="muted" style={styles.note}>
                            Capped at the 28th so a reminder never skips February.
                        </Text>
                    </View>
                )}

                {cadence && (
                    <>
                        <View style={styles.field}>
                            <Text variant="label" tone="secondary">Time</Text>
                            <View style={styles.hours}>
                                {HOURS.map((hour) => {
                                    const active = reminderHour === hour;
                                    return (
                                        <TouchableOpacity
                                            key={hour}
                                            onPress={() => setReminderHour(hour)}
                                            activeOpacity={0.7}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: active }}
                                            style={[
                                                styles.hourTile,
                                                active && { backgroundColor: alpha(tint, 0.19) },
                                            ]}
                                        >
                                            <Text variant="meta" color={active ? tint : theme.TEXT_MUTED}>
                                                {hourLabel(hour)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.field}>
                            <Input
                                label="Amount to nudge (optional)"
                                placeholder="25"
                                value={reminderAmount}
                                onChangeText={setReminderAmount}
                                keyboardType="decimal-pad"
                                editable={!saving}
                            />
                            <Text variant="meta" tone="muted">
                                {`The reminder will say "Move ${
                                    Number.parseFloat(reminderAmount) > 0 ? `$${Number.parseFloat(reminderAmount)}` : '$25'
                                } toward ${trimmed || 'this goal'}".`}
                            </Text>
                        </View>
                    </>
                )}

                <View style={styles.field}>
                    <Text variant="label" tone="secondary">Colour</Text>
                    <View style={styles.swatches}>
                        {Array.from({ length: rampSize }, (_, index) => {
                            const swatchColor = categoryColor(theme, index);
                            const active = index === colorIndex;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => setColorIndex(index)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Colour ${index + 1}`}
                                    accessibilityState={{ selected: active }}
                                    style={[styles.swatch, { backgroundColor: swatchColor }, active && styles.swatchOn]}
                                >
                                    {active ? <Ionicons name="checkmark" size={18} color={theme.BG} /> : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.field}>
                    <Text variant="label" tone="secondary">Icon</Text>
                    <View style={styles.icons}>
                        {icons.map((iconName) => {
                            const active = iconName === icon;
                            return (
                                <TouchableOpacity
                                    key={iconName}
                                    onPress={() => setIcon(iconName)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={iconName}
                                    accessibilityState={{ selected: active }}
                                    style={[
                                        styles.iconTile,
                                        active && { backgroundColor: alpha(tint, 0.19), borderColor: tint },
                                    ]}
                                >
                                    <Ionicons name={iconName} size={20} color={active ? tint : theme.TEXT_MUTED} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {error ? <Text variant="meta" tone="danger" style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button
                    title={isEdit ? 'Save' : 'Create'}
                    onPress={submit}
                    loading={saving}
                    disabled={!valid}
                    style={{ flex: 1 }}
                />
            </View>

            {isEdit && onDelete ? (
                <Button title="Delete goal" variant="danger" onPress={onDelete} style={styles.danger} />
            ) : null}
        </>
    );
};

const GoalEditorSheet = ({
    visible, goal, options, accounts, saving = false, error, onSave, onDelete, onClose,
}) => (
    <BottomSheet visible={visible} onClose={onClose}>
        {/* Keyed on both the goal and the open state, so every open remounts the
            form with fresh values — including reopening the same goal after
            cancelling a half-finished edit. */}
        <GoalEditorBody
            key={`${goal?.id ?? 'new'}:${visible}`}
            goal={goal}
            options={options}
            accounts={accounts}
            saving={saving}
            error={error}
            onSave={onSave}
            onDelete={onDelete}
            onClose={onClose}
        />
    </BottomSheet>
);

export default GoalEditorSheet;
