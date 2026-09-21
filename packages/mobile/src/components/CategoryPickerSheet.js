import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button, Input } from './ui';
import { CANONICAL_CATEGORIES } from '../utils/categoryMap';
import { getCategoryMeta } from '../utils/categorization';

/**
 * Pick a category, for one transaction or for a selection.
 *
 * One component for both entry points, so there is one way to choose a category
 * and the two cannot drift into offering different lists.
 *
 * The list is the app's closed vocabulary. There is no free text and no "add
 * your own": a category is what every chart groups by, and a user-invented one
 * would be a second vocabulary — the thing category_map.js exists to prevent.
 * Flags are the escape hatch for a grouping the vocabulary does not carry.
 *
 * `Other` is absent on purpose. It is the fallback the app lands on when it
 * cannot tell, not a choice — picking it would be indistinguishable from having
 * no correction, so the way back is `onClear`, which removes the correction.
 */

const makeStyles = (t) => StyleSheet.create({
    search: { marginBottom: SPACING.SMALL },
    list: { marginTop: SPACING.SMALL },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: 11,
        paddingHorizontal: SPACING.SMALL,
        borderRadius: RADIUS.CHIP,
    },
    rowActive: { backgroundColor: alpha(t.ACCENT, 0.12) },
    icon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    merchantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginTop: SPACING.MEDIUM,
        padding: SPACING.SMALL + 2,
        borderRadius: RADIUS.CHIP,
        backgroundColor: t.SURFACE_SUNKEN,
    },
    merchantCopy: { flex: 1 },
    actions: { marginTop: SPACING.MEDIUM, gap: SPACING.SMALL },
    empty: { paddingVertical: SPACING.LARGE, alignItems: 'center' },
});

const CategoryPickerSheet = ({
    visible,
    onClose,
    onSelect,
    // Omit and the sheet shows no undo — the bulk case has nothing to revert to.
    onClear = null,
    current = null,
    // Present only for a single transaction we can name a merchant for.
    merchantLabel = null,
    count = 1,
    busy = false,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [query, setQuery] = useState('');
    const [applyToMerchant, setApplyToMerchant] = useState(false);

    const categories = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return CANONICAL_CATEGORIES;
        return CANONICAL_CATEGORIES.filter((name) => name.toLowerCase().includes(term));
    }, [query]);

    const close = () => {
        setQuery('');
        // Reset rather than remember: the toggle rewrites history for a whole
        // merchant, so it has to be asked for each time rather than inherited
        // from whatever the last edit happened to be.
        setApplyToMerchant(false);
        onClose?.();
    };

    const choose = (category) => {
        onSelect?.(category, { applyToMerchant: Boolean(merchantLabel) && applyToMerchant });
        setQuery('');
        setApplyToMerchant(false);
    };

    return (
        <BottomSheet visible={visible} onClose={close}>
            <Text variant="title">
                {count > 1 ? `Category for ${count} transactions` : 'Category'}
            </Text>
            <Text variant="meta" tone="muted">
                {count > 1
                    ? 'This replaces the category on every one you selected.'
                    : 'Pick what this really is. It only changes how it is grouped.'}
            </Text>

            {CANONICAL_CATEGORIES.length > 12 ? (
                <Input
                    icon="search"
                    placeholder="Search categories..."
                    value={query}
                    onChangeText={setQuery}
                    onClear={() => setQuery('')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.search}
                />
            ) : null}

            <View style={styles.list}>
                {categories.map((name) => {
                    const meta = getCategoryMeta(name);
                    const tint = categoryColor(theme, meta.colorIndex);
                    const active = current === name;

                    return (
                        <TouchableOpacity
                            key={name}
                            style={[styles.row, active && styles.rowActive]}
                            onPress={() => choose(name)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Set category to ${name}`}
                        >
                            <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                                <Ionicons name={meta.icon} size={17} color={tint} />
                            </View>
                            <Text variant="body" style={{ flex: 1 }}>{name}</Text>
                            {active ? (
                                <Ionicons name="checkmark" size={18} color={theme.ACCENT} />
                            ) : null}
                        </TouchableOpacity>
                    );
                })}

                {categories.length === 0 ? (
                    <View style={styles.empty}>
                        <Text variant="meta" tone="muted">No category matches that.</Text>
                    </View>
                ) : null}
            </View>

            {/* Off by default, and only offered where a merchant can be named.
                The safe answer is the one that needs no thought: this
                transaction. One tap widens it, and the confirmation afterwards
                says how many rows moved. */}
            {merchantLabel ? (
                <TouchableOpacity
                    style={styles.merchantRow}
                    onPress={() => setApplyToMerchant((on) => !on)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: applyToMerchant }}
                    accessibilityLabel={`Also apply to all ${merchantLabel}`}
                >
                    <Ionicons
                        name={applyToMerchant ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={applyToMerchant ? theme.ACCENT : theme.TEXT_MUTED}
                    />
                    <View style={styles.merchantCopy}>
                        <Text variant="body">Also apply to all {merchantLabel}</Text>
                        <Text variant="meta" tone="muted">
                            Past and future charges, not just this one.
                        </Text>
                    </View>
                </TouchableOpacity>
            ) : null}

            <View style={styles.actions}>
                {onClear ? (
                    <Button
                        title="Remove correction"
                        variant="ghost"
                        onPress={onClear}
                        disabled={busy}
                    />
                ) : null}
                <Button title="Cancel" variant="secondary" onPress={close} disabled={busy} />
            </View>
        </BottomSheet>
    );
};

export default CategoryPickerSheet;
