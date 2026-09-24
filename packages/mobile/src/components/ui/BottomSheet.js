import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
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
 *
 * ## The keyboard
 *
 * A sheet is anchored to the bottom, which is exactly where the keyboard
 * appears — so anything below the focused field is simply covered. It hid the
 * whole date section of the filter sheet, and it was covering the buttons of
 * every other sheet with a text field in it.
 *
 * Measured rather than delegated. `KeyboardAvoidingView` behaves differently
 * per platform and, inside a `Modal` with a translucent status bar, Android's
 * `adjustResize` does not reach it at all — which is why nothing moved. The
 * keyboard's own reported height, applied as a bottom margin, is the one number
 * that is true on both platforms.
 *
 * `maxHeight` shrinks by the same amount, in pixels rather than as a
 * percentage: a percentage is of the full screen, so the sheet would grow past
 * the top of the visible area instead of scrolling inside it.
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
    const { height: screenHeight } = useWindowDimensions();

    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        // iOS reports "will" ahead of the animation, so the sheet travels with
        // the keyboard instead of after it. Android only emits "did".
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onShow = Keyboard.addListener(showEvent, (event) => {
            setKeyboardHeight(event?.endCoordinates?.height ?? 0);
        });
        const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

        return () => {
            onShow.remove();
            onHide.remove();
        };
    }, []);

    // While the keyboard is up it already covers the home indicator, so adding
    // the safe-area inset on top of it would leave a band of surface below the
    // content for no reason.
    const bottomPad = keyboardHeight > 0
        ? SPACING.MEDIUM
        : Math.max(insets.bottom, SPACING.MEDIUM) + SPACING.SMALL;

    const maxHeight = Math.max(200, screenHeight * 0.88 - keyboardHeight);

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
                <View
                    style={[
                        styles.sheet,
                        { paddingBottom: bottomPad, marginBottom: keyboardHeight, maxHeight },
                        style,
                    ]}
                >
                    <View style={styles.handle} />
                    {scroll ? (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            // So a tap on a button below the focused field acts
                            // on the button rather than being swallowed by the
                            // keyboard dismissing.
                            keyboardShouldPersistTaps="handled"
                        >
                            {children}
                        </ScrollView>
                    ) : (
                        children
                    )}
                </View>
            </View>
        </Modal>
    );
};

export default BottomSheet;
