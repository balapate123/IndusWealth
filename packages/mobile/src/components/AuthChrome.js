import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';

/**
 * Chrome for the signed-out screens.
 *
 * These six screens can't use `ui/Screen` — they need a full-bleed background
 * behind a translucent status bar and a keyboard-avoiding body — so they each
 * grew their own copy of the same container, back button, hero and footer. This
 * is that copy, written once.
 *
 * The background is a wash from the page colour to the card colour rather than
 * the old fixed slate-navy gradient, so it follows the theme: near-black to
 * #111 in Obsidian, warm paper to white in Ledger.
 */

const makeStyles = (t) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: t.BG,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + SPACING.SMALL : 50,
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.SMALL,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: t.SURFACE_HIGH,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Keeps the header's middle slot optically centred when only one side is filled.
    slot: { minWidth: 36 },
    slotEnd: { alignItems: 'flex-end' },
    body: { flex: 1 },
    content: {
        padding: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    // A non-scrolling body always fills the screen, so a screen that manages its
    // own scrolling inside (Connect Bank) has a bounded parent to scroll within.
    fill: { flex: 1 },
    grow: { flexGrow: 1, justifyContent: 'center' },
    centerFill: { justifyContent: 'center' },

    // Hero
    hero: {
        alignItems: 'center',
        marginBottom: SPACING.XL,
    },
    medallion: {
        width: 76,
        height: 76,
        borderRadius: RADIUS.CARD,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: 1,
        borderColor: t.ACCENT_BORDER,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    heroTitle: {
        textAlign: 'center',
        marginBottom: 6,
    },
    heroSubtitle: {
        textAlign: 'center',
        paddingHorizontal: SPACING.MEDIUM,
    },

    // Footer
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: SPACING.XL,
        gap: SPACING.TINY + 1,
    },
});

/**
 * @param {string}  [title]    centred header title
 * @param {func}    [onBack]   renders the back button when supplied
 * @param {node}    [right]    header's right-hand slot (a Skip action, say)
 * @param {node}    [middle]   replaces the title (progress dots, say)
 * @param {boolean} [scroll]   scrolling body; required whenever the keyboard
 *                             can cover a field below the fold
 * @param {boolean} [centered] centre the body vertically
 */
export const AuthLayout = ({
    children,
    title,
    onBack,
    right,
    middle,
    scroll = false,
    centered = false,
    contentContainerStyle,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const hasHeader = !!(onBack || right || title || middle);
    const body = scroll
        ? [styles.content, centered && styles.grow, contentContainerStyle]
        : [styles.content, styles.fill, centered && styles.centerFill, contentContainerStyle];

    return (
        <View style={styles.container}>
            <StatusBar barStyle={theme.statusBarStyle} translucent backgroundColor="transparent" />

            <LinearGradient
                colors={[theme.BG, theme.SURFACE]}
                style={StyleSheet.absoluteFillObject}
            />

            {hasHeader ? (
                <View style={styles.header}>
                    <View style={styles.slot}>
                        {onBack ? (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={onBack}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Go back"
                            >
                                <Ionicons name="chevron-back" size={22} color={theme.TEXT_PRIMARY} />
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {middle || (title ? <Text variant="h2" numberOfLines={1}>{title}</Text> : <View />)}

                    <View style={[styles.slot, styles.slotEnd]}>{right}</View>
                </View>
            ) : null}

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.body}
            >
                {scroll ? (
                    <ScrollView
                        contentContainerStyle={body}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {children}
                    </ScrollView>
                ) : (
                    <View style={body}>{children}</View>
                )}
            </KeyboardAvoidingView>
        </View>
    );
};

/** Medallion + title + subtitle. Pass `children` instead of `icon` for a logo. */
export const AuthHero = ({ icon, title, subtitle, children }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={styles.hero}>
            <View style={styles.medallion}>
                {children || <Ionicons name={icon} size={34} color={theme.ACCENT} />}
            </View>
            {title ? <Text variant="h1" style={styles.heroTitle}>{title}</Text> : null}
            {subtitle ? (
                <Text variant="body" tone="secondary" style={styles.heroSubtitle}>{subtitle}</Text>
            ) : null}
        </View>
    );
};

/** "Already have an account? Log In" */
export const AuthFooter = ({ text, linkText, onPress }) => {
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={styles.footer}>
            <Text variant="body" tone="secondary">{text}</Text>
            <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
                <Text variant="bodyMed" tone="link">{linkText}</Text>
            </TouchableOpacity>
        </View>
    );
};
