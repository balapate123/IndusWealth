import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button, Input, Chip, ChipRow, SectionTitle, SegmentedControl } from './ui';
import {
    DIRECTION,
    EMPTY_FILTERS,
    PRESET_RANGES,
    activeFilterCount,
    draftFromFilters,
    maskDateInput,
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
 * ## Why the dates are typed
 *
 * A native date picker is a native module, and adding one means an EAS rebuild
 * before any of this reaches a device — for a feature that is otherwise pure
 * JS and loads straight off Metro. The preset chips are what stop most people
 * from ever typing one; `maskDateInput` puts the dashes in for the rest.
 *
 * All the rules about what is valid live in `utils/transactionFilters.js`, so
 * they are asserted rather than trusted. This file only renders them.
 */

const DIRECTION_OPTIONS = [
    { value: DIRECTION.ALL, label: 'All' },
    { value: DIRECTION.OUT, label: 'Money out' },
    { value: DIRECTION.IN, label: 'Money in' },
];

const makeStyles = () => StyleSheet.create({
    section: { marginTop: SPACING.MEDIUM, gap: SPACING.SMALL },
    pair: { flexDirection: 'row', gap: SPACING.SMALL + 2 },
    half: { flex: 1, marginBottom: 0 },
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

const TransactionFilterBody = ({ filters, onApply, onClose }) => {
    const styles = useThemedStyles(makeStyles);
    const [draft, setDraft] = useState(() => draftFromFilters(filters));

    const { ok, errors, filters: parsed } = normalizeDraft(draft);
    const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

    const applyPreset = (key) => {
        const { startDate, endDate } = presetRange(key);
        set({ startDate: startDate || '', endDate: endDate || '' });
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
                    <Input
                        placeholder="YYYY-MM-DD"
                        icon="calendar-outline"
                        value={draft.startDate}
                        onChangeText={(text) => set({ startDate: maskDateInput(text) })}
                        keyboardType="number-pad"
                        error={errors.startDate}
                        style={styles.half}
                    />
                    <Input
                        placeholder="YYYY-MM-DD"
                        icon="calendar-outline"
                        value={draft.endDate}
                        onChangeText={(text) => set({ endDate: maskDateInput(text) })}
                        keyboardType="number-pad"
                        error={errors.endDate}
                        style={styles.half}
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
