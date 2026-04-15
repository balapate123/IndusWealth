import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

const CIRCLE_SIZE = 140;
const STROKE_WIDTH = 10;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const getScoreColor = (score) => {
    if (score >= 90) return COLORS.HEALTH_EXCELLENT;
    if (score >= 75) return COLORS.HEALTH_GOOD;
    if (score >= 60) return COLORS.HEALTH_FAIR;
    if (score >= 40) return COLORS.HEALTH_POOR;
    return COLORS.HEALTH_CRITICAL;
};

const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Needs Work';
    return 'Critical';
};

const FinancialHealthScore = ({ healthScore }) => {
    const [showBreakdown, setShowBreakdown] = useState(false);

    if (!healthScore) return null;

    const { score, grade, breakdown, trend, previous_score } = healthScore;
    const scoreColor = getScoreColor(score);
    const strokeDashoffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

    const trendIcon = trend === 'improving' ? 'arrow-up' : trend === 'declining' ? 'arrow-down' : 'remove';
    const trendColor = trend === 'improving' ? COLORS.GREEN : trend === 'declining' ? COLORS.RED : COLORS.TEXT_MUTED;
    const trendText = trend === 'improving'
        ? `Up ${previous_score ? score - previous_score : ''} pts`
        : trend === 'declining'
            ? `Down ${previous_score ? previous_score - score : ''} pts`
            : 'Stable';

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.scoreContainer}
                onPress={() => setShowBreakdown(true)}
                activeOpacity={0.8}
            >
                {/* Circular Progress */}
                <View style={styles.circleContainer}>
                    <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                        {/* Background circle */}
                        <Circle
                            cx={CIRCLE_SIZE / 2}
                            cy={CIRCLE_SIZE / 2}
                            r={RADIUS}
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={STROKE_WIDTH}
                            fill="none"
                        />
                        {/* Score arc */}
                        <Circle
                            cx={CIRCLE_SIZE / 2}
                            cy={CIRCLE_SIZE / 2}
                            r={RADIUS}
                            stroke={scoreColor}
                            strokeWidth={STROKE_WIDTH}
                            fill="none"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            rotation="-90"
                            origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
                        />
                    </Svg>
                    {/* Score number in center */}
                    <View style={styles.scoreCenter}>
                        <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
                        <Text style={styles.gradeText}>{grade}</Text>
                    </View>
                </View>

                {/* Label and Trend */}
                <View style={styles.labelContainer}>
                    <Text style={[styles.scoreLabel, { color: scoreColor }]}>
                        {getScoreLabel(score)}
                    </Text>
                    <View style={styles.trendRow}>
                        <Ionicons name={trendIcon} size={14} color={trendColor} />
                        <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
                    </View>
                </View>

                {/* Mini breakdown bar */}
                {breakdown && (
                    <View style={styles.miniBreakdown}>
                        {Object.values(breakdown).map((dim, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.miniSegment,
                                    {
                                        flex: dim.weight,
                                        backgroundColor: getScoreColor(dim.score),
                                        opacity: 0.7 + (dim.score / 100) * 0.3,
                                    },
                                ]}
                            />
                        ))}
                    </View>
                )}

                <Text style={styles.tapHint}>Tap for details</Text>
            </TouchableOpacity>

            {/* Breakdown Modal */}
            <Modal
                visible={showBreakdown}
                transparent
                animationType="slide"
                onRequestClose={() => setShowBreakdown(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Financial Health Breakdown</Text>
                            <TouchableOpacity onPress={() => setShowBreakdown(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalScoreRow}>
                            <Text style={[styles.modalScore, { color: scoreColor }]}>{score}</Text>
                            <Text style={styles.modalGrade}> / 100 ({grade})</Text>
                        </View>

                        <ScrollView style={styles.breakdownList}>
                            {breakdown && Object.entries(breakdown).map(([key, dim]) => (
                                <View key={key} style={styles.breakdownItem}>
                                    <View style={styles.breakdownHeader}>
                                        <Text style={styles.breakdownLabel}>{dim.label}</Text>
                                        <Text style={[styles.breakdownScore, { color: getScoreColor(dim.score) }]}>
                                            {dim.score}/100
                                        </Text>
                                    </View>
                                    <View style={styles.breakdownBar}>
                                        <View
                                            style={[
                                                styles.breakdownFill,
                                                {
                                                    width: `${dim.score}%`,
                                                    backgroundColor: getScoreColor(dim.score),
                                                },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.breakdownDetail}>{dim.detail}</Text>
                                    <Text style={styles.breakdownWeight}>Weight: {dim.weight}%</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.LARGE,
    },
    scoreContainer: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        alignItems: 'center',
    },
    circleContainer: {
        position: 'relative',
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        marginBottom: SPACING.SMALL,
    },
    scoreCenter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreNumber: {
        fontSize: 36,
        fontWeight: '700',
    },
    gradeText: {
        fontSize: 14,
        color: COLORS.TEXT_MUTED,
        fontWeight: '600',
    },
    labelContainer: {
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    scoreLabel: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: SPACING.TINY,
    },
    trendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    trendText: {
        fontSize: 13,
        fontWeight: '500',
    },
    miniBreakdown: {
        flexDirection: 'row',
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        gap: 2,
        marginBottom: SPACING.SMALL,
    },
    miniSegment: {
        height: '100%',
        borderRadius: 3,
    },
    tapHint: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        opacity: 0.6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#111',
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    modalScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: SPACING.LARGE,
    },
    modalScore: {
        fontSize: 42,
        fontWeight: '700',
    },
    modalGrade: {
        fontSize: 18,
        color: COLORS.TEXT_MUTED,
    },
    breakdownList: {
        marginBottom: SPACING.LARGE,
    },
    breakdownItem: {
        marginBottom: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    breakdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    breakdownLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.WHITE,
    },
    breakdownScore: {
        fontSize: 15,
        fontWeight: '700',
    },
    breakdownBar: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: SPACING.TINY,
    },
    breakdownFill: {
        height: '100%',
        borderRadius: 4,
    },
    breakdownDetail: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.TINY,
    },
    breakdownWeight: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        marginTop: 2,
    },
});

export default FinancialHealthScore;
