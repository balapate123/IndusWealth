import React from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '../../constants/tokens';
import { useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Bottom sheet chrome: scrim, tap-to-dismiss backdrop, grab handle, and a
 * surface anchored flush to the bottom edge.
 *
 * `statusBarTranslucent` + `presentationStyle="overFullScreen"` are what stop
 * the sheet falling short of the screen edges and leaving the content behind it
 * visible below the buttons, and the safe-area padding fills the home-indicator
 * area with the sheet's own surface. Every sheet in the app goes through here so
 * that fix can't be forgotten in one of them.
 */

const makeStyles = (t) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: t.SCRIM,
    },
    sheet: {
        backgroundColor: t.SURFACE,
        borderTopLeftRadius: RADIUS.CARD,
        borderTopRightRadius: RADIUS.CARD,
        maxHeight: '88%',
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
        ...t.ELEVATION.SHEET,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: t.HAIRLINE_STRONG,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: SPACING.MEDIUM,
    },
});

const BottomSheet = ({ visible, onClose, children, scroll = true, style }) => {
    const styles = useThemedStyles(makeStyles);
    const insets = useSafeAreaInsets();

    const bottomPad = Math.max(insets.bottom, SPACING.MEDIUM) + SPACING.SMALL;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            statusBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={styles.backdrop}
                    onPress={onClose}
                    activeOpacity={1}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                />
                <View style={[styles.sheet, { paddingBottom: bottomPad }, style]}>
                    <View style={styles.handle} />
                    {scroll ? (
                        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
                    ) : (
                        children
                    )}
                </View>
            </View>
        </Modal>
    );
};

export default BottomSheet;
