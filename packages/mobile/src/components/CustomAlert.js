import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Platform
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

/**
 * A custom alert component that replaces the native Alert.alert
 * properly styled for the app's theme.
 * 
 * @param {boolean} visible - Whether the alert is visible
 * @param {string} title - Alert title
 * @param {string} message - Alert message body
 * @param {Array} buttons - Array of button objects { text, onPress, style }
 * @param {Function} onRequestClose - Callback when hardware back button is pressed
 */
const CustomAlert = ({
    visible,
    title,
    message,
    buttons = [],
    onRequestClose,
}) => {
    // Default single "OK" button if none provided
    const actions = buttons.length > 0 ? buttons : [
        { text: 'OK', onPress: onRequestClose || (() => { }) }
    ];

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onRequestClose}
            statusBarTranslucent={true}
        >
            <View style={styles.overlay}>
                <View style={styles.alertContainer}>
                    <Text style={styles.title}>{title}</Text>
                    {message ? <Text style={styles.message}>{message}</Text> : null}

                    <View style={[
                        styles.actionsContainer,
                        // Stack buttons vertically if there are more than 2 or if they have long text
                        actions.length > 2 ? styles.verticalActions : styles.horizontalActions
                    ]}>
                        {actions.map((btn, index) => {
                            const isCancel = btn.style === 'cancel';
                            const isDestructive = btn.style === 'destructive';

                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.button,
                                        // Apply specific styles based on button type
                                        isCancel ? styles.cancelButton : styles.defaultButton,
                                        isDestructive && styles.destructiveButton,
                                        // Add margins for spacing
                                        actions.length > 2 || styles.verticalActions // Vertical spacing
                                            ? { marginBottom: index < actions.length - 1 ? 12 : 0 }
                                            : { marginLeft: index > 0 ? 12 : 0 } // Horizontal spacing
                                    ]}
                                    onPress={btn.onPress}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.buttonText,
                                        isCancel ? styles.cancelButtonText : styles.defaultButtonText,
                                        isDestructive && styles.destructiveButtonText
                                    ]}>
                                        {btn.text}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)', // Dimmed backend
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    alertContainer: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: COLORS.CARD_BG, // Dark card background
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        marginBottom: SPACING.SMALL,
        textAlign: 'center',
    },
    message: {
        fontSize: 15,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        marginBottom: SPACING.LARGE,
        lineHeight: 22,
    },
    actionsContainer: {
        width: '100%',
        marginTop: SPACING.SMALL,
    },
    horizontalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    verticalActions: {
        flexDirection: 'column',
    },
    button: {
        flex: 1,
        minWidth: 100,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: BORDER_RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    defaultButton: {
        backgroundColor: 'rgba(212, 175, 55, 0.15)', // Gold tint
        borderWidth: 1,
        borderColor: COLORS.GOLD,
    },
    cancelButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: COLORS.TEXT_MUTED,
    },
    destructiveButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)', // Red tint
        borderColor: '#EF4444',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    defaultButtonText: {
        color: COLORS.GOLD,
    },
    cancelButtonText: {
        color: COLORS.TEXT_SECONDARY,
    },
    destructiveButtonText: {
        color: '#EF4444', // Red
    },
});

export default CustomAlert;
