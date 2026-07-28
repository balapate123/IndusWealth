import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, TYPE } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

const makeStyles = (t) => StyleSheet.create({
    wrap: { marginBottom: SPACING.MEDIUM },
    label: { marginBottom: 6 },
    field: {
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
    multilineField: {
        height: undefined,
        minHeight: 96,
        alignItems: 'flex-start',
        paddingVertical: 12,
    },
    focused: { borderColor: t.ACCENT_BORDER },
    errored: { borderColor: t.DANGER },
    input: {
        flex: 1,
        color: t.TEXT_PRIMARY,
        ...TYPE.BODY,
        // RN adds vertical padding on Android that breaks the fixed height.
        paddingVertical: 0,
    },
    error: { marginTop: 5 },
});

/**
 * Preset for one-time codes: large, centred, evenly tracked. Pass as `inputStyle`
 * together with a taller `style` height.
 */
export const CODE_INPUT_STYLE = {
    ...TYPE.H1,
    textAlign: 'center',
    letterSpacing: 8,
};

const Input = ({
    label,
    error,
    icon,
    secureTextEntry = false,
    multiline = false,
    onClear,
    value,
    style,
    inputStyle,
    onFocus,
    onBlur,
    ...rest
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(secureTextEntry);

    return (
        <View style={[styles.wrap, style]}>
            {label ? <Text variant="label" tone="secondary" style={styles.label}>{label}</Text> : null}

            <View style={[styles.field, multiline && styles.multilineField, focused && styles.focused, !!error && styles.errored]}>
                {icon ? <Ionicons name={icon} size={18} color={theme.TEXT_MUTED} /> : null}

                <TextInput
                    style={[styles.input, multiline && { textAlignVertical: 'top', height: '100%' }, inputStyle]}
                    placeholderTextColor={theme.TEXT_MUTED}
                    secureTextEntry={hidden}
                    multiline={multiline}
                    value={value}
                    onFocus={(e) => { setFocused(true); onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); onBlur?.(e); }}
                    {...rest}
                />

                {onClear && value ? (
                    <TouchableOpacity
                        onPress={onClear}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear"
                    >
                        <Ionicons name="close-circle" size={18} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                ) : null}

                {secureTextEntry ? (
                    <TouchableOpacity
                        onPress={() => setHidden((v) => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
                    >
                        <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {error ? <Text variant="meta" tone="danger" style={styles.error}>{error}</Text> : null}
        </View>
    );
};

export default Input;
