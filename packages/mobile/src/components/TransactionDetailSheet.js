import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button, Input, SectionTitle, Chip } from './ui';
import { money } from './TransactionRow';

/**
 * Transaction details with editable notes. Shared by Home, All Transactions and
 * Account Transactions — the three had near-identical copies of this modal.
 */

const makeStyles = (t) => StyleSheet.create({
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: RADIUS.SMALL,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL + 2,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    value: { flex: 1, textAlign: 'right' },
    accountValue: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        flex: 1,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    flags: {
        marginTop: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    flagWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.SMALL,
    },
    notes: { marginTop: SPACING.MEDIUM },
    categoryValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    correctedTag: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: RADIUS.CHIP,
        backgroundColor: t.SURFACE_SUNKEN,
    },
    counter: { textAlign: 'right', marginTop: -SPACING.SMALL },
    actions: {
        flexDirection: 'row',
        gap: SPACING.SMALL + 2,
        marginTop: SPACING.MEDIUM,
    },
});

const formatLongDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
    } catch {
        return 'N/A';
    }
};

const TransactionDetailSheet = ({
    visible,
    transaction,
    accountName,
    accountColor,
    notes,
    onChangeNotes,
    // Omit `flags` and the sheet simply has no flag section — the screens that
    // have not been wired for it still show notes exactly as before.
    flags,
    selectedFlagIds,
    onToggleFlag,
    saving = false,
    onSave,
    onClose,
    // Omit and the Category row stays exactly as it was: plain text, no tap.
    // Same opt-in shape as `flags` above, so screens that have not been wired
    // for corrections are unaffected.
    onEditCategory = null,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const isIncome = transaction?.amount > 0;

    return (
        <BottomSheet visible={visible} onClose={onClose}>
            <SectionTitle title="Transaction details" />

            {transaction && (
                <>
                    <View style={styles.amountRow}>
                        <Text variant="h1" tone={isIncome ? 'success' : 'primary'}>
                            {isIncome ? '+' : '−'}{money(transaction.amount)}
                        </Text>
                        <View style={[
                            styles.badge,
                            { backgroundColor: isIncome ? theme.SUCCESS_DIM : theme.SURFACE_HIGH },
                        ]}>
                            <Text variant="label" tone={isIncome ? 'success' : 'secondary'}>
                                {isIncome ? 'Income' : 'Expense'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <Text variant="body" tone="muted">Merchant</Text>
                        <Text variant="bodyMed" style={styles.value} numberOfLines={2}>
                            {transaction.merchant}
                        </Text>
                    </View>

                    {/* Tappable only where the screen passes a handler. The
                        "Corrected" marker is what makes the undo discoverable:
                        without it, a user who set a category by mistake has no
                        way of telling it apart from one the app worked out, and
                        no reason to look for a way back. */}
                    <TouchableOpacity
                        style={styles.row}
                        onPress={onEditCategory || undefined}
                        disabled={!onEditCategory}
                        accessibilityRole={onEditCategory ? 'button' : 'text'}
                        accessibilityLabel={onEditCategory
                            ? `Category, ${transaction.category}. Tap to change.`
                            : undefined}
                    >
                        <Text variant="body" tone="muted">Category</Text>
                        <View style={styles.categoryValue}>
                            {transaction.user_category ? (
                                <View style={styles.correctedTag}>
                                    <Text variant="meta" tone="muted">Corrected</Text>
                                </View>
                            ) : null}
                            <Text variant="bodyMed">{transaction.category}</Text>
                            {onEditCategory ? (
                                <Ionicons name="chevron-forward" size={15} color={theme.TEXT_MUTED} />
                            ) : null}
                        </View>
                    </TouchableOpacity>

                    <View style={styles.row}>
                        <Text variant="body" tone="muted">Date</Text>
                        <Text variant="bodyMed" style={styles.value}>
                            {formatLongDate(transaction.rawDate || transaction.date)}
                        </Text>
                    </View>

                    {accountName ? (
                        <View style={styles.row}>
                            <Text variant="body" tone="muted">Account</Text>
                            <View style={styles.accountValue}>
                                {accountColor ? (
                                    <View style={[styles.dot, { backgroundColor: accountColor }]} />
                                ) : null}
                                <Text variant="bodyMed" numberOfLines={1}>{accountName}</Text>
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.row}>
                        <Text variant="body" tone="muted">Transaction ID</Text>
                        <Text variant="meta" tone="muted" style={styles.value} numberOfLines={1}>
                            {transaction.id}
                        </Text>
                    </View>

                    {flags?.length ? (
                        <View style={styles.flags}>
                            <Text variant="label" tone="secondary">Flags</Text>
                            {/* Wraps rather than scrolls: in a sheet a hidden
                                horizontal overflow reads as "that's all of
                                them", and a user can't tag what they can't see. */}
                            <View style={styles.flagWrap}>
                                {flags.map((flag) => {
                                    const active = selectedFlagIds?.includes(flag.id);
                                    return (
                                        <Chip
                                            key={flag.id}
                                            label={flag.name}
                                            icon={flag.icon}
                                            active={active}
                                            color={active ? categoryColor(theme, flag.color_index) : undefined}
                                            onPress={() => onToggleFlag?.(flag.id)}
                                        />
                                    );
                                })}
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.notes}>
                        <Input
                            label="Notes"
                            placeholder="Add notes about this transaction..."
                            value={notes}
                            onChangeText={onChangeNotes}
                            multiline
                            maxLength={500}
                            editable={!saving}
                        />
                        <Text variant="meta" tone="muted" style={styles.counter}>
                            {(notes || '').length}/500
                        </Text>
                    </View>
                </>
            )}

            <View style={styles.actions}>
                <Button title="Done" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button title="Save" onPress={onSave} loading={saving} style={{ flex: 1 }} />
            </View>
        </BottomSheet>
    );
};

export default TransactionDetailSheet;
