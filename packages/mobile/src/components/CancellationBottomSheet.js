import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Text, Button } from './ui';

const makeStyles = (t) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.LARGE,
    },
    merchantIcon: {
        width: 48,
        height: 48,
        borderRadius: RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: { flex: 1 },
    sectionTitle: {
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: t.ACCENT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        backgroundColor: t.ACCENT_DIM,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        alignSelf: 'flex-start',
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    pause: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.SMALL,
        backgroundColor: t.INFO_DIM,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    // The most important copy in the feature: it arrives at the moment of
    // intent and cannot be skipped.
    expectation: {
        backgroundColor: t.SURFACE_HIGH,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
        gap: 6,
    },
    confirm: { marginTop: SPACING.LARGE },
    confirmNote: { marginTop: SPACING.SMALL, textAlign: 'center' },
});

const CancellationBottomSheet = ({ visible, expense, guide, onClose, onConfirm }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!guide) return null;

    const openUrl = () => {
        if (guide.directUrl) {
            Linking.openURL(guide.directUrl).catch(() => {});
        }
    };

    const tint = expense?.logoColor || theme.ACCENT;

    return (
        <BottomSheet visible={visible} onClose={onClose}>
            <View style={styles.header}>
                <View style={[styles.merchantIcon, { backgroundColor: alpha(tint, 0.16) }]}>
                    <Text variant="h2" color={tint}>{expense?.name?.charAt(0) || '?'}</Text>
                </View>
                <View style={styles.headerText}>
                    <Text variant="h2">{guide.merchantName || expense?.name}</Text>
                    <Text variant="body" tone="secondary">${expense?.amount?.toFixed(2)}/month</Text>
                </View>
                <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                >
                    <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                </TouchableOpacity>
            </View>

            {/*
              * We cannot cancel anything, and no app can -- there is no API for
              * it. Saying so before the first tap is what stops "I pressed
              * Cancel and got charged anyway", which is a one-star review and a
              * support ticket the user is right to open.
              */}
            <View style={styles.expectation}>
                <Text variant="bodyMed">
                    You&apos;ll do this on {guide.merchantName || expense?.name}&apos;s
                    site — we can&apos;t cancel it for you.
                </Text>
                <Text variant="meta" tone="secondary">
                    {guide.estimatedTime
                        ? `About ${guide.estimatedTime}. Come back and mark it done when you have.`
                        : 'Come back and mark it done when you have.'}
                </Text>
            </View>

            <Text variant="title" style={styles.sectionTitle}>How to cancel</Text>
            {guide.steps?.map((step, index) => (
                <View key={index} style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                        <Text variant="meta" tone="onAccent">{index + 1}</Text>
                    </View>
                    <Text variant="body" style={{ flex: 1 }}>{step}</Text>
                </View>
            ))}

            {guide.directUrl && (
                <Button
                    title="Open cancellation page"
                    icon="open-outline"
                    variant="secondary"
                    onPress={openUrl}
                    block
                />
            )}

            {guide.tips?.length > 0 && (
                <>
                    <Text variant="title" style={styles.sectionTitle}>Tips</Text>
                    {guide.tips.map((tip, index) => (
                        <View key={index} style={styles.tipRow}>
                            <Ionicons name="bulb-outline" size={14} color={theme.ACCENT} />
                            <Text variant="meta" tone="secondary" style={{ flex: 1 }}>{tip}</Text>
                        </View>
                    ))}
                </>
            )}

            {guide.canPause && (
                <View style={styles.pause}>
                    <Ionicons name="pause-circle-outline" size={18} color={theme.INFO} />
                    <Text variant="meta" tone="info" style={{ flex: 1 }}>
                        {guide.pauseNote || 'You can pause this subscription instead of cancelling.'}
                    </Text>
                </View>
            )}

            {/*
              * The Alternatives block is gone on purpose. It hardcoded
              * competitor names and prices that were already going stale in a
              * JSON file, and it was the last place in the app recommending a
              * named product off the user's own spending -- the shape that cost
              * us a Play Store rejection. Someone cancelling Netflix does not
              * need us to list Crave.
              */}

            <Button
                title="I've cancelled this"
                icon="checkmark-circle"
                onPress={onConfirm}
                block
                style={styles.confirm}
            />
            <Text variant="meta" tone="muted" style={styles.confirmNote}>
                We&apos;ll mark it as cancelled here.
            </Text>
        </BottomSheet>
    );
};

export default CancellationBottomSheet;
