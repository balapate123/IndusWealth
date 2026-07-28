import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button, Input, SectionTitle } from './ui';
import { FLAG_ICONS, FLAG_RAMP_SIZE } from '../constants/flags';

/**
 * Create or rename a flag: name, one of the ramp's hues, one of the allowed
 * icons.
 *
 * The colours offered are the theme's validated categorical ramp rather than a
 * free picker. Seven is the whole palette — a user with more flags than that
 * reuses a hue, and the icon is what keeps the two apart, which is also what
 * keeps the set legible to a colour-blind reader.
 *
 * `options` comes from GET /flags and is authoritative; the local constants are
 * only the fallback before that response lands.
 */

const SWATCH = 34;
const ICON_TILE = 44;

const makeStyles = (t) => StyleSheet.create({
    field: { marginTop: SPACING.MEDIUM, gap: SPACING.SMALL },
    swatches: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.SMALL + 2,
    },
    swatch: {
        width: SWATCH,
        height: SWATCH,
        borderRadius: SWATCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // The ring sits outside the fill so the hue itself is never dimmed by the
    // selection state — you are picking a colour, so it has to stay true.
    swatchOn: {
        borderWidth: 2,
        borderColor: t.TEXT_PRIMARY,
    },
    icons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.SMALL,
    },
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
    actions: {
        flexDirection: 'row',
        gap: SPACING.SMALL + 2,
        marginTop: SPACING.LARGE,
    },
    danger: { marginTop: SPACING.SMALL },
    error: { marginTop: SPACING.SMALL },
});

/**
 * The form itself. Split out so the sheet can re-key it on every open: the
 * fields then initialise straight from props and editing one flag after another
 * cannot carry the first one's values across, without an effect that writes
 * state synchronously on the way in.
 */
const FlagEditorBody = ({ flag, options, saving, error, onSave, onDelete, onClose }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [name, setName] = useState(flag?.name || '');
    const [colorIndex, setColorIndex] = useState(flag?.color_index ?? 0);
    const [icon, setIcon] = useState(flag?.icon || 'pricetag');

    const isEdit = !!flag?.id;
    const icons = options?.icons?.length ? options.icons : FLAG_ICONS;
    const rampSize = options?.rampSize || FLAG_RAMP_SIZE;

    const trimmed = name.trim();
    const tint = categoryColor(theme, colorIndex);

    return (
        <>
            <SectionTitle title={isEdit ? 'Edit flag' : 'New flag'} />

            <View style={styles.field}>
                <Input
                    label="Name"
                    placeholder="Home, Work, Trip to Montreal..."
                    value={name}
                    onChangeText={setName}
                    maxLength={40}
                    autoCapitalize="words"
                    editable={!saving}
                />
            </View>

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
                                style={[
                                    styles.swatch,
                                    { backgroundColor: swatchColor },
                                    active && styles.swatchOn,
                                ]}
                            >
                                {active ? (
                                    <Ionicons name="checkmark" size={18} color={theme.BG} />
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View style={styles.field}>
                <Text variant="label" tone="secondary">Icon</Text>
                <View style={styles.icons}>
                    {icons.map((name_) => {
                        const active = name_ === icon;
                        return (
                            <TouchableOpacity
                                key={name_}
                                onPress={() => setIcon(name_)}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={name_}
                                accessibilityState={{ selected: active }}
                                style={[
                                    styles.iconTile,
                                    active && { backgroundColor: alpha(tint, 0.19), borderColor: tint },
                                ]}
                            >
                                <Ionicons
                                    name={name_}
                                    size={20}
                                    color={active ? tint : theme.TEXT_MUTED}
                                />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {error ? (
                <Text variant="meta" tone="danger" style={styles.error}>{error}</Text>
            ) : null}

            <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button
                    title={isEdit ? 'Save' : 'Create'}
                    onPress={() => onSave({ name: trimmed, colorIndex, icon })}
                    loading={saving}
                    disabled={!trimmed}
                    style={{ flex: 1 }}
                />
            </View>

            {isEdit && onDelete ? (
                <Button
                    title="Delete flag"
                    variant="danger"
                    onPress={onDelete}
                    style={styles.danger}
                />
            ) : null}
        </>
    );
};

const FlagEditorSheet = ({ visible, flag, options, saving = false, error, onSave, onDelete, onClose }) => (
    <BottomSheet visible={visible} onClose={onClose}>
        {/* Keyed on both the flag and the open state, so every open remounts the
            form with fresh values — including reopening the same flag after
            cancelling a half-finished edit. */}
        <FlagEditorBody
            key={`${flag?.id ?? 'new'}:${visible}`}
            flag={flag}
            options={options}
            saving={saving}
            error={error}
            onSave={onSave}
            onDelete={onDelete}
            onClose={onClose}
        />
    </BottomSheet>
);

export default FlagEditorSheet;
