import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';

/**
 * Password strength meter, shared by Signup and Reset Password — the two screens
 * had identical copies of the scoring, the labels and the colour ramp.
 *
 * Colour is deliberately redundant here: the label always names the level, so a
 * user who can't separate the amber from the green still gets the message. That
 * also lets the five levels collapse onto the three semantic tokens instead of
 * inventing a private five-colour palette, which is what the old copies did.
 */

const LABELS = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
const SEGMENTS = 4;

/** 0–4, mirroring the backend's rules in utils/passwordValidator.js. */
export const getPasswordScore = (pw) => {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(4, Math.floor(score * 4 / 6));
};

const toneFor = (score) => {
    if (score <= 1) return 'danger';
    if (score === 2) return 'warning';
    return 'success';
};

const fillFor = (theme, score) => {
    if (score <= 1) return theme.DANGER;
    if (score === 2) return theme.WARNING;
    return theme.SUCCESS;
};

const makeStyles = (t) => StyleSheet.create({
    wrap: {
        marginTop: -SPACING.SMALL,
        marginBottom: SPACING.MEDIUM,
    },
    track: {
        flexDirection: 'row',
        gap: SPACING.TINY,
        marginBottom: 6,
    },
    segment: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: t.SURFACE_SUNKEN,
    },
    hint: { marginTop: 2 },
});

const PasswordStrength = ({ password }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!password) return null;

    const score = getPasswordScore(password);
    const fill = fillFor(theme, score);

    return (
        <View style={styles.wrap}>
            {/* Filled count equals the score, so every level looks different. The
                old version filled `i <= score` across four segments, which drew
                "Strong" and "Very Strong" identically. */}
            <View style={styles.track}>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                    <View
                        key={i}
                        style={[styles.segment, i < score && { backgroundColor: fill }]}
                    />
                ))}
            </View>

            <Text variant="label" tone={toneFor(score)}>{LABELS[score]}</Text>

            {password.length < 8 ? (
                <Text variant="meta" tone="muted" style={styles.hint}>
                    Min 8 characters, 1 uppercase, 1 number
                </Text>
            ) : null}
        </View>
    );
};

export default PasswordStrength;
