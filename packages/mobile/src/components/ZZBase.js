import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { BottomSheet, Card, Text, Button } from './ui';

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
    discountBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        backgroundColor: t.SUCCESS_DIM,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    callButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        backgroundColor: t.SURFACE_HIGH,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.CONTROL,
        marginBottom: SPACING.MEDIUM,
    },
    callBody: { flex: 1 },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: SPACING.MEDIUM,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    expectation: {
        backgroundColor: t.SURFACE_HIGH,
        padding: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
        gap: 6,
    },
    confirm: { marginTop: SPACING.LARGE },
});

const NegotiationBottomSheet = ({ visible, expense, guide, onClose, onNegotiated }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!guide) return null;

    const callRetention = () => {
        if (guide.retentionNumber) {
            const phoneUrl = Platform.OS === 'ios'
                ? `telprompt:${guide.retentionNumber}`
                : `tel:${guide.retentionNumber}`;
            Linking.openURL(phoneUrl).catch(() => {});
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
                    <Text variant="body" tone="secondary">
                        Current: ${expense?.amount?.toFixed(2)}/month
                    </Text>
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
              * Same rule as the cancel sheet: we cannot do this for them, and
              * pretending otherwise is the whole reason the buttons felt dead.
              */}
            <View style={styles.expectation}>
                <Text variant="bodyMed">
                    You&apos;ll need to call them — we can&apos;t negotiate for you.
                </Text>
                <Text variant="meta" tone="secondary">
                    Ask for &quot;retention&quot; or &quot;cancellations&quot;. Those agents can
                    approve discounts front-line support cannot. Expect 15–20 minutes.
                </Text>
            </View>

            {guide.expectedDiscount && (
                <View style={styles.discountBanner}>
                    <Ionicons name="trending-down" size={18} color={theme.SUCCESS} />
                    <Text variant="bodyMed" tone="success" style={{ flex: 1 }}>
                        {/*
                          * "Expected discount" is a promise we do not control.
                          * A target is something the user can aim at and miss
                          * without us having lied to them.
                          */}
                        What to aim for: {guide.expectedDiscount}
                    </Text>
                </View>
            )}

            {guide.negotiationScript && (
                <>
                    <Text variant="title" style={styles.sectionTitle}>Your negotiation script</Text>
                    <Card inset={false} tone="high">
                        <Text variant="body" tone="secondary">
                            {guide.negotiationScript.replace(/\$X/g, `$${expense?.amount?.toFixed(2) || 'XX'}`)}
                        </Text>
                    </Card>
                </>
            )}

            {guide.retentionNumber && (
                <TouchableOpacity
                    style={styles.callButton}
                    onPress={callRetention}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Call retention on ${guide.retentionNumber}`}
                >
                    <Ionicons name="call" size={18} color={theme.ACCENT} />
                    <View style={styles.callBody}>
                        <Text variant="bodyMed">Call retention</Text>
                        <Text variant="meta" tone="secondary">{guide.retentionNumber}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.TEXT_MUTED} />
                </TouchableOpacity>
            )}

            {guide.bestTimeToCall && (
                <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={14} color={theme.TEXT_MUTED} />
                    <Text variant="meta" tone="muted">Best time to call: {guide.bestTimeToCall}</Text>
                </View>
            )}

            {guide.tips?.length > 0 && (
                <>
                    <Text variant="title" style={styles.sectionTitle}>Negotiation tips</Text>
                    {guide.tips.map((tip, index) => (
                        <View key={index} style={styles.tipRow}>
                            <Ionicons name="checkmark-circle" size={14} color={theme.SUCCESS} />
                            <Text variant="meta" tone="secondary" style={{ flex: 1 }}>{tip}</Text>
                        </View>
                    ))}
                </>
            )}

            <Button
                title="I've negotiated"
                icon="checkmark-circle"
                onPress={onNegotiated}
                block
                style={styles.confirm}
            />
        </BottomSheet>
    );
};

export default NegotiationBottomSheet;
