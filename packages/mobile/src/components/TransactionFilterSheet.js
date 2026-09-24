import React, { useState } from 'react';
import { Keyboard, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    BottomSheet, Text, Button, Input, Chip, ChipRow, SectionTitle, SegmentedControl, Calendar,
} from './ui';
import {
    DIRECTION,
    EMPTY_FILTERS,
    PRESET_RANGES,
    activeFilterCount,
    draftFromFilters,
    normalizeDraft,
    presetRange,
} from '../utils/transactionFilters';

/**
 * Narrowing a transaction list: an amount range, a date range, a direction.
 *
 * ## Nothing here refetches until Apply
 *
 * The draft lives in this sheet, not in the screen. Typing `1` into the minimum
 * on the way to `100` would otherwise fire a request for everything over a
 * dollar, and on a 500-row account that is a real round trip for a value the
 * user was in the middle of. Apply is the only thing that reaches the screen.
 *
 * The consequence is that dismissing the sheet discards the edit, which is why
 * the body is re-keyed on every open — the fields initialise from props rather
 * than from an effect, so a cancelled edit cannot be sitting there next time.
 * Same reason `FlagEditorSheet` does it.
 *
 * ## Why the dates are picked, not typed
 *
 * The first version had two `YYYY-MM-DD` text fields. On a real phone the
 * numeric keypad covered the bottom half of the sheet — including the second
 * date field and everything under it. Two separate fixes came out of that:
 * `BottomSheet` now measures the keyboard and lifts above it, and the dates
 * stopped needing a keyboard at all.
 *
 * `ui/Calendar` is a plain React Native grid rather than
 * `@react-native-community/datetimepicker`, because that is a native module and
 * adding one means an EAS rebuild before any of this reaches a device — for a
 * feature that is otherwise pure JS and loads straight off Metro.
 *
 * All the rules about what is valid live in `utils/transactionFilters.js`, and
 * all the month arithmetic in `utils/calendar.js`, so both are asserted rather
 * than trusted. This file only renders them.
 */

const DIRECTION_OPTIONS = [
    { value: DIRECTION.ALL, label: 'All' },
    { value: DIRECTION.OUT, label: 'Money out' },
    { value: DIRECTION.IN, label: 'Money in' },
];

const makeStyles = (t) => StyleSheet.create({
    section: { marginTop: SPACING.MEDIUM, gap: SPACING.SMALL },
    pair: { flexDirection: 'row', gap: SPACING.SMALL + 2 },
    half: { flex: 1, marginBottom: 0 },
    // Shaped like `Input`'s field so the two read as the same kind of control,
    // even though one opens a keyboard and the other opens a calendar.
    dateField: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: 'transparent',
        paddingHorizontal: SPACING.MEDIUM - 4,
        height: 48,
        gap: SPACING.SMALL,
    },
    dateFieldActive: { borderColor: t.ACCENT_BORDER },
    dateText: { flex: 1 },
    presets: { marginTop: SPACING.SMALL },
    // ChipRow pads its content by SPACING.MEDIUM for a full-bleed row; inside a
    // sheet that already pads, it would indent twice.
    presetsContent: { paddingHorizontal: 0 },
    hint: { marginTop: 2 },
    error: { marginTop: SPACING.SMALL },
    actions: {
        flexDirection: 'row',
        gap: SPACING.SMALL + 2,
        marginTop: SPACING.LARGE,
    },
    cancel: { marginTop: SPACING.SMALL },
});

/**
 * One end of the date range: a button, not a text field.
 *
 * Typing a date was the first version, and it put a numeric keypad over the
 * bottom half of the sheet — including the other date field. A button opens a
 * calendar inside the sheet instead, so nothing is ever covered by a keyboard
 * that does not need to be there.
 */
const DateField = ({ label, value, active, onPress, onClear }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={value ? `${label}: ${value}` : `${label}: any date`}
            accessibilityState={{ selected: active }}
            style={[styles.dateField, active && styles.dateFieldActive]}
        >
            <Ionicons
                name="calendar-outline"
                size={16}
                color={active ? theme.ACCENT : theme.TEXT_MUTED}
            />
            <View style={styles.dateText}>
                <Text variant="meta" tone="muted">{label}</Text>
                <Text variant="label" tone={value ? 'primary' : 'muted'} numberOfLines={1}>
                    {value || 'Any'}
                </Text>
            </View>
            {value ? (
                <TouchableOpacity
                    onPress={onClear}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${label}`}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="close-circle" size={17} color={theme.TEXT_MUTED} />
                </TouchableOpacity>
            ) : null}
        </TouchableOpacity>
    );
};

const TransactionFilterBody = ({ filters, onApply, onClose }) => {
    const styles = useThemedStyles(makeStyles);
    const [draft, setDraft] = useState(() => draftFromFilters(filters));

    // Which end the calendar is editing, or null when it is closed. Collapsed
    // by default so somebody filtering only by amount is not scrolling past a
    // month grid to reach Apply.
    const [picking, setPicking] = useState(null);
    // Bumped when a preset moves both dates, which is the one case where the
    // grid should jump without the edited field changing. Part of the
    // Calendar's key -- see the note there on why this is a remount and not an
    // effect.
    const [jump, setJump] = useState(0);

    const { ok, errors, filters: parsed } = normalizeDraft(draft);
    const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

    const openPicker = (field) => {
        // The amount fields raise a keypad, and it would otherwise sit over the
        // calendar that just opened underneath it.
        Keyboard.dismiss();
        setPicking((prev) => (prev === field ? null : field));
    };

    const onPickDate = (iso) => {
        set({ [picking]: iso });
        // From, then To, is the order people fill a range in. Advancing saves a
        // tap; it stops at To rather than cycling, because cycling back to From
        // would silently retarget the next tap at the field they just set.
        if (picking === 'startDate' && !draft.endDate) setPicking('endDate');
    };

    const applyPreset = (key) => {
        const { startDate, endDate } = presetRange(key);
        set({ startDate: startDate || '', endDate: endDate || '' });
        setJump((n) => n + 1);
    };

    // Measured on the *parsed* filters rather than on the raw draft, so a field
    // holding unreadable text does not count as a filter that is on.
    const count = activeFilterCount(parsed);

    return (
        <>
            <SectionTitle title="Filter transactions" />

            <View style={styles.section}>
                <Text variant="label" tone="secondary">Amount</Text>
                <View style={styles.pair}>
                    <Input
                        placeholder="Min"
                        icon="cash-outline"
                        value={draft.minAmount}
                        onChangeText={(text) => set({ minAmount: text })}
                        keyboardType="decimal-pad"
                        error={errors.minAmount}
                        style={styles.half}
                    />
                    <Input
                        placeholder="Max"
                        icon="cash-outline"
                        value={draft.maxAmount}
                        onChangeText={(text) => set({ maxAmount: text })}
                        keyboardType="decimal-pad"
                        error={errors.maxAmount}
                        style={styles.half}
                    />
                </View>
                {/* Said plainly, because the sign convention on a credit card
                    makes "over $100" ambiguous otherwise: a $2,400 deposit is
                    over $100 here, and Money in / Money out is how you say
                    which direction you meant. */}
                <Text variant="meta" tone="muted" style={styles.hint}>
                    Matches the size of a transaction, in or out.
                </Text>
                {errors.amountRange ? (
                    <Text variant="meta" tone="danger" style={styles.error}>{errors.amountRange}</Text>
                ) : null}
            </View>

            <View style={styles.section}>
                <Text variant="label" tone="secondary">Date range</Text>
                <View style={styles.pair}>
                    <DateField
                        label="From"
                        value={draft.startDate}
                        active={picking === 'startDate'}
                        onPress={() => openPicker('startDate')}
                        onClear={() => set({ startDate: '' })}
                    />
                    <DateField
                        label="To"
                        value={draft.endDate}
                        active={picking === 'endDate'}
                        onPress={() => openPicker('endDate')}
                        onClear={() => set({ endDate: '' })}
                    />
                </View>

                <ChipRow style={styles.presets} contentContainerStyle={styles.presetsContent}>
                    {PRESET_RANGES.map((preset) => (
                        <Chip
                            key={preset.key}
                            label={preset.label}
                            onPress={() => applyPreset(preset.key)}
                        />
                    ))}
                </ChipRow>

                {picking ? (
                    <Calendar
                        // Remounted when the field being edited changes, or when
                        // a preset moves both dates — that is how the grid is
                        // told to jump, instead of an effect that would drag it
                        // back to the start date the moment you page forward to
                        // pick an end.
                        key={`${picking}:${jump}`}
                        start={draft.startDate || null}
                        end={draft.endDate || null}
                        initialFocus={draft[picking] || draft.startDate || null}
                        onSelect={onPickDate}
                    />
                ) : null}

                {errors.dateRange ? (
                    <Text variant="meta" tone="danger" style={styles.error}>{errors.dateRange}</Text>
                ) : null}
            </View>

            <View style={styles.section}>
                <Text variant="label" tone="secondary">Direction</Text>
                <SegmentedControl
                    options={DIRECTION_OPTIONS}
                    value={draft.direction}
                    onChange={(value) => set({ direction: value })}
                    inset={false}
                />
            </View>

            <View style={styles.actions}>
                {/* Clear applies immediately and closes. Clearing and then
                    having to press Apply reads as though it had not worked. */}
                <Button
                    title="Clear all"
                    variant="secondary"
                    onPress={() => onApply({ ...EMPTY_FILTERS })}
                    disabled={count === 0}
                    style={{ flex: 1 }}
                />
                <Button
                    title="Apply"
                    onPress={() => onApply(parsed)}
                    disabled={!ok}
                    style={{ flex: 1 }}
                />
            </View>

            {/* Explicit, matching CategoryPickerSheet. The backdrop dismisses
                too, but a sheet whose only way out is a tap outside it is one
                people get stuck in. */}
            <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.cancel} />
        </>
    );
};

const TransactionFilterSheet = ({ visible, filters, onApply, onClose }) => (
    <BottomSheet visible={visible} onClose={onClose}>
        {/* Re-keyed on every open so the draft starts from what is currently
            applied. Without this, dismissing a half-typed amount would leave it
            in the fields the next time the sheet opens, looking like a filter
            that is on when it is not. */}
        <TransactionFilterBody
            key={String(visible)}
            filters={filters || EMPTY_FILTERS}
            onApply={onApply}
            onClose={onClose}
        />
    </BottomSheet>
);

export default TransactionFilterSheet;
