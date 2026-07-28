import React from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { RADIUS, SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { Text, Button } from './ui';

/**
 * Replaces the native Alert.alert so dialogs follow the app's theme.
 *
 * @param {boolean} visible - Whether the alert is visible
 * @param {string} title - Alert title
 * @param {string} message - Alert message body
 * @param {Array} buttons - Array of button objects { text, onPress, style }
 * @param {Function} onRequestClose - Callback when hardware back button is pressed
 */

const makeStyles = (t) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: t.SCRIM,
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    dialog: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.CARD,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        padding: SPACING.LARGE,
        ...t.ELEVATION.SHEET,
    },
    title: { textAlign: 'center' },
    message: {
        textAlign: 'center',
        marginTop: SPACING.SMALL,
    },
    actions: {
        marginTop: SPACING.LARGE,
        gap: SPACING.SMALL + 2,
    },
    horizontal: { flexDirection: 'row' },
    vertical: { flexDirection: 'column' },
});

// Cancel reads as the quiet option, destructive as the loud one, and anything
// else is the single accent action.
const variantFor = (style) => {
    if (style === 'cancel') return 'secondary';
    if (style === 'destructive') return 'danger';
    return 'primary';
};

const CustomAlert = ({ visible, title, message, buttons = [], onRequestClose }) => {
    const styles = useThemedStyles(makeStyles);

    const actions = buttons.length > 0
        ? buttons
        : [{ text: 'OK', onPress: onRequestClose || (() => {}) }];

    // Three or more buttons never fit side by side at this width.
    const stacked = actions.length > 2;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={onRequestClose}
        >
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <Text variant="h2" style={styles.title}>{title}</Text>
                    {message ? (
                        <Text variant="body" tone="secondary" style={styles.message}>{message}</Text>
                    ) : null}

                    <View style={[styles.actions, stacked ? styles.vertical : styles.horizontal]}>
                        {actions.map((btn, index) => (
                            <Button
                                key={index}
                                title={btn.text}
                                variant={variantFor(btn.style)}
                                onPress={btn.onPress}
                                style={stacked ? undefined : { flex: 1 }}
                            />
                        ))}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default CustomAlert;
