import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Linking,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';

const CancellationBottomSheet = ({ visible, expense, guide, onClose, onConfirm }) => {
    if (!guide) return null;

    const openUrl = () => {
        if (guide.directUrl) {
            Linking.openURL(guide.directUrl).catch(() => {});
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.merchantIcon, { backgroundColor: expense?.logoColor ? `${expense.logoColor}20` : COLORS.CARD_BORDER }]}>
                                <Text style={[styles.merchantInitial, { color: expense?.logoColor || COLORS.WHITE }]}>
                                    {expense?.name?.charAt(0) || '?'}
                                </Text>
                            </View>
                            <View style={styles.headerText}>
                                <Text style={styles.merchantName}>{guide.merchantName || expense?.name}</Text>
                                <Text style={styles.amountText}>${expense?.amount?.toFixed(2)}/month</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={COLORS.TEXT_SECONDARY} />
                            </TouchableOpacity>
                        </View>

                        {/* How to Cancel */}
                        <Text style={styles.sectionTitle}>How to Cancel</Text>
                        <View style={styles.stepsContainer}>
                            {guide.steps?.map((step, index) => (
                                <View key={index} style={styles.stepRow}>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>{index + 1}</Text>
                                    </View>
                                    <Text style={styles.stepText}>{step}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Estimated Time */}
                        {guide.estimatedTime && (
                            <View style={styles.timeBadge}>
                                <Ionicons name="time-outline" size={14} color={COLORS.GOLD} />
                                <Text style={styles.timeText}>Estimated time: {guide.estimatedTime}</Text>
                            </View>
                        )}

                        {/* Direct Link */}
                        {guide.directUrl && (
                            <TouchableOpacity style={styles.linkButton} onPress={openUrl}>
                                <Ionicons name="open-outline" size={16} color={COLORS.WHITE} />
                                <Text style={styles.linkButtonText}>Open Cancellation Page</Text>
                            </TouchableOpacity>
                        )}

                        {/* Tips */}
                        {guide.tips && guide.tips.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Tips</Text>
                                {guide.tips.map((tip, index) => (
                                    <View key={index} style={styles.tipRow}>
                                        <Ionicons name="bulb-outline" size={14} color={COLORS.GOLD} />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Pause Option */}
                        {guide.canPause && (
                            <View style={styles.pauseContainer}>
                                <Ionicons name="pause-circle-outline" size={18} color="#3B82F6" />
                                <Text style={styles.pauseText}>{guide.pauseNote || 'You can pause this subscription instead of cancelling.'}</Text>
                            </View>
                        )}

                        {/* Alternatives */}
                        {guide.alternatives && guide.alternatives.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Alternatives</Text>
                                {guide.alternatives.map((alt, index) => (
                                    <View key={index} style={styles.altRow}>
                                        <Text style={styles.altName}>{alt.name}</Text>
                                        {alt.price !== null && <Text style={styles.altPrice}>${alt.price}/mo</Text>}
                                        {alt.note && <Text style={styles.altNote}>{alt.note}</Text>}
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Confirm Button */}
                        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.WHITE} />
                            <Text style={styles.confirmText}>I've Cancelled This</Text>
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
        backgroundColor: '#1A1A1A',
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        maxHeight: '85%',
        paddingHorizontal: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#555',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingBottom: SPACING.LARGE,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    merchantIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
    },
    merchantInitial: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
    },
    headerText: {
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    merchantName: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontFamily: FONTS.BOLD,
    },
    amountText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginTop: 2,
    },
    closeButton: {
        padding: SPACING.SMALL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    stepsContainer: {
        marginBottom: SPACING.MEDIUM,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.MEDIUM,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: COLORS.GOLD,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    stepNumberText: {
        color: '#000',
        fontSize: 12,
        fontFamily: FONTS.BOLD,
    },
    stepText: {
        color: COLORS.WHITE,
        fontSize: 14,
        flex: 1,
        lineHeight: 20,
    },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        alignSelf: 'flex-start',
    },
    timeText: {
        color: COLORS.GOLD,
        fontSize: 12,
        marginLeft: SPACING.SMALL,
    },
    linkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    linkButtonText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.SMALL,
    },
    tipText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        flex: 1,
        marginLeft: SPACING.SMALL,
        lineHeight: 18,
    },
    pauseContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    pauseText: {
        color: '#93C5FD',
        fontSize: 13,
        flex: 1,
        marginLeft: SPACING.SMALL,
        lineHeight: 18,
    },
    altRow: {
        backgroundColor: COLORS.CARD_BG,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    altName: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    altPrice: {
        color: COLORS.GREEN,
        fontSize: 13,
        marginTop: 2,
    },
    altNote: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#16A34A',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.LARGE,
    },
    confirmText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
});

export default CancellationBottomSheet;
