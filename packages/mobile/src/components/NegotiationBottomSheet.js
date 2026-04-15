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

const NegotiationBottomSheet = ({ visible, expense, guide, onClose, onNegotiated }) => {
    if (!guide) return null;

    const callRetention = () => {
        if (guide.retentionNumber) {
            const phoneUrl = Platform.OS === 'ios'
                ? `telprompt:${guide.retentionNumber}`
                : `tel:${guide.retentionNumber}`;
            Linking.openURL(phoneUrl).catch(() => {});
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
                                <Text style={styles.amountText}>Current: ${expense?.amount?.toFixed(2)}/month</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={COLORS.TEXT_SECONDARY} />
                            </TouchableOpacity>
                        </View>

                        {/* Expected Discount */}
                        {guide.expectedDiscount && (
                            <View style={styles.discountBanner}>
                                <Ionicons name="trending-down" size={18} color="#4ADE80" />
                                <Text style={styles.discountText}>
                                    Expected discount: {guide.expectedDiscount}
                                </Text>
                            </View>
                        )}

                        {/* Negotiation Script */}
                        {guide.negotiationScript && (
                            <>
                                <Text style={styles.sectionTitle}>Your Negotiation Script</Text>
                                <View style={styles.scriptCard}>
                                    <Text style={styles.scriptText}>
                                        {guide.negotiationScript.replace(/\$X/g, `$${expense?.amount?.toFixed(2) || 'XX'}`)}
                                    </Text>
                                </View>
                            </>
                        )}

                        {/* Retention Number */}
                        {guide.retentionNumber && (
                            <TouchableOpacity style={styles.callButton} onPress={callRetention}>
                                <Ionicons name="call" size={18} color={COLORS.WHITE} />
                                <View style={styles.callButtonText}>
                                    <Text style={styles.callLabel}>Call Retention</Text>
                                    <Text style={styles.callNumber}>{guide.retentionNumber}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        )}

                        {/* Best Time to Call */}
                        {guide.bestTimeToCall && (
                            <View style={styles.infoRow}>
                                <Ionicons name="calendar-outline" size={14} color={COLORS.GOLD} />
                                <Text style={styles.infoText}>Best time to call: {guide.bestTimeToCall}</Text>
                            </View>
                        )}

                        {/* Tips */}
                        {guide.tips && guide.tips.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Negotiation Tips</Text>
                                {guide.tips.map((tip, index) => (
                                    <View key={index} style={styles.tipRow}>
                                        <Ionicons name="checkmark-circle" size={14} color={COLORS.GREEN} />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {/* Alternatives */}
                        {guide.alternatives && guide.alternatives.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Competitor Options</Text>
                                {guide.alternatives.map((alt, index) => (
                                    <View key={index} style={styles.altRow}>
                                        <Text style={styles.altName}>{alt.name}</Text>
                                        {alt.note && <Text style={styles.altNote}>{alt.note}</Text>}
                                    </View>
                                ))}
                            </>
                        )}

                        {/* I Negotiated Button */}
                        <TouchableOpacity style={styles.negotiatedButton} onPress={onNegotiated}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.WHITE} />
                            <Text style={styles.negotiatedText}>I've Negotiated</Text>
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
    discountBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    discountText: {
        color: '#4ADE80',
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    scriptCard: {
        backgroundColor: 'rgba(201, 162, 39, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(201, 162, 39, 0.3)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    scriptText: {
        color: COLORS.WHITE,
        fontSize: 14,
        lineHeight: 22,
        fontStyle: 'italic',
    },
    callButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#16A34A',
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    callButtonText: {
        flex: 1,
        marginLeft: SPACING.MEDIUM,
    },
    callLabel: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
    },
    callNumber: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    infoText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
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
    altNote: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
    },
    negotiatedButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.LARGE,
    },
    negotiatedText: {
        color: COLORS.WHITE,
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        marginLeft: SPACING.SMALL,
    },
});

export default NegotiationBottomSheet;
