import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING, RADIUS } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { Text, Button } from './ui';
import CategoryPickerSheet from './CategoryPickerSheet';
import FlagEditorSheet from './FlagEditorSheet';
import { MAX_SELECTION, formatSelectionTotal } from '../utils/transactionSelection';

/**
 * The running total of a selection, and the two things that can be done with it.
 *
 * Pinned above the list, the same shape `FlagTransactionPickerScreen` already
 * uses: the total and the actions stay reachable without scrolling back up to a
 * header.
 *
 * Takes the return value of `useTransactionSelection` wholesale, so a screen
 * wires selection up in two lines and cannot accidentally show one screen's
 * total over another screen's buttons.
 *
 * The bulk category sheet and the group sheet live here because both act on the
 * selection. The single-transaction category sheet does not — it belongs to the
 * detail sheet's open row.
 */

const makeStyles = (t) => StyleSheet.create({
    bar: {
        position: 'absolute',
        left: SPACING.MEDIUM,
        right: SPACING.MEDIUM,
        bottom: SPACING.MEDIUM,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: RADIUS.CARD,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
    },
    summary: { flex: 1 },
});

const TransactionSelectionBar = ({ selection, flagOptions }) => {
    const styles = useThemedStyles(makeStyles);

    const {
        selectMode, summary, atCap, busy,
        categoryOpen, openCategory, closeCategory,
        groupOpen, groupError, openGroup, closeGroup,
        applyCategory, createGroup,
    } = selection;

    return (
        <>
            {/* Rendered only once something is selected: an empty bar is a
                permanent strip of nothing covering the last row. */}
            {selectMode && summary.count > 0 ? (
                <View style={styles.bar}>
                    <View style={styles.summary}>
                        <Text variant="bodyMed">{formatSelectionTotal(summary.net)}</Text>
                        <Text variant="meta" tone="muted">
                            {summary.count} selected
                            {summary.hasInflow ? ' · includes money in' : ''}
                            {atCap ? ` · max ${MAX_SELECTION}` : ''}
                        </Text>
                    </View>
                    <Button
                        title="Category"
                        variant="secondary"
                        size="sm"
                        onPress={openCategory}
                        disabled={busy}
                    />
                    <Button
                        title="Group"
                        size="sm"
                        onPress={openGroup}
                        disabled={busy}
                    />
                </View>
            ) : null}

            {/* Bulk correction is per-transaction and never creates a merchant
                rule: a selection spans merchants, so inferring one would be
                guessing on the user's behalf. */}
            <CategoryPickerSheet
                visible={categoryOpen}
                count={summary.count}
                busy={busy}
                onSelect={applyCategory}
                onClose={closeCategory}
            />

            {/* The group IS a flag, so naming one looks exactly like naming a
                flag — same sheet, same colour ramp, same icon allowlist. */}
            <FlagEditorSheet
                visible={groupOpen}
                flag={null}
                options={flagOptions}
                saving={busy}
                error={groupError}
                onSave={createGroup}
                onClose={closeGroup}
            />
        </>
    );
};

export default TransactionSelectionBar;
