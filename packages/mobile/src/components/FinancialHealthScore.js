import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text, BarTrack } from './ui';

const CIRCLE_SIZE = 140;
const STROKE_WIDTH = 10;
const ARC_RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

/**
 * A health score is a status encoding, so it uses the reserved semantic colours
 * rather than five bespoke ones. Colour carries severity coarsely; the label
 * below it carries the precision, so nothing depends on colour alone.
 */
const scoreColor = (theme, score) => {
    if (score >= 75) return theme.SUCCESS;
    if (score >= 50) return theme.WARNING;
    return theme.DANGER;
};

const scoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Needs work';
    return 'Critical';
};

const makeStyles = (t) => StyleSheet.create({
    score: { alignItems: 'center' },
    circle: {
        position: 'relative',
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        marginBottom: SPACING.SMALL,
    },
    center: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: { alignItems: 'center', marginBottom: SPACING.SMALL },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    miniBreakdown: {
        flexDirection: 'row',
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        gap: 2,
        marginBottom: SPACING.SMALL,
    },
    miniSegment: { height: '100%', borderRadius: 3 },

    modalOverlay: {
        flex: 1,
        backgroundColor: t.SCRIM,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: t.SURFACE,
        borderTopLeftRadius: RADIUS.CARD,
        borderTopRightRadius: RADIUS.CARD,
        padding: SPACING.LARGE,
        maxHeight: '80%',
        ...t.ELEVATION.SHEET,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    modalScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: SPACING.LARGE,
    },
    breakdownItem: {
        marginBottom: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: t.HAIRLINE,
    },
    breakdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    breakdownDetail: { marginTop: SPACING.TINY + 2 },
});

const FinancialHealthScore = ({ healthScore }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [showBreakdown, setShowBreakdown] = useState(false);

    if (!healthScore) return null;

    const { score, grade, breakdown, trend, previous_score } = healthScore;
    const color = scoreColor(theme, score);
    const strokeDashoffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

    const trendIcon = trend === 'improving' ? 'arrow-up' : trend === 'declining' ? 'arrow-down' : 'remove';
    const trendColor = trend === 'improving'
        ? theme.SUCCESS
        : trend === 'declining' ? theme.DANGER : theme.TEXT_MUTED;
    const trendText = trend === 'improving'
        ? `Up ${previous_score ? score - previous_score : ''} pts`
        : trend === 'declining'
            ? `Down ${previous_score ? previous_score - score : ''} pts`
            : 'Stable';

    return (
        <>
            <Card inset={false} onPress={() => setShowBreakdown(true)} style={{ marginBottom: SPACING.LARGE }}>
                <View style={styles.score}>
                    <View style={styles.circle}>
                        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                            <Circle
                                cx={CIRCLE_SIZE / 2}
                                cy={CIRCLE_SIZE / 2}
                                r={ARC_RADIUS}
                                stroke={theme.SURFACE_SUNKEN}
                                strokeWidth={STROKE_WIDTH}
                                fill="none"
                            />
                            <Circle
                                cx={CIRCLE_SIZE / 2}
                                cy={CIRCLE_SIZE / 2}
                                r={ARC_RADIUS}
                                stroke={color}
                                strokeWidth={STROKE_WIDTH}
                                fill="none"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                rotation="-90"
                                origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
                            />
                        </Svg>
                        <View style={styles.center}>
                            <Text variant="hero" color={color}>{score}</Text>
                            <Text variant="label" tone="muted">{grade}</Text>
                        </View>
                    </View>

                    <View style={styles.label}>
                        <Text variant="h2" color={color}>{scoreLabel(score)}</Text>
                        <View style={styles.trendRow}>
                            <Ionicons name={trendIcon} size={14} color={trendColor} />
                            <Text variant="meta" color={trendColor}>{trendText}</Text>
                        </View>
                    </View>

                    {breakdown && (
                        <View style={styles.miniBreakdown}>
                            {Object.values(breakdown).map((dim, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.miniSegment,
                                        { flex: dim.weight, backgroundColor: scoreColor(theme, dim.score) },
                                    ]}
                                />
                            ))}
                        </View>
                    )}

                    <Text variant="meta" tone="muted">Tap for details</Text>
                </View>
            </Card>

            <Modal
                visible={showBreakdown}
                transparent
                animationType="slide"
                onRequestClose={() => setShowBreakdown(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text variant="h2">Financial health breakdown</Text>
                            <TouchableOpacity
                                onPress={() => setShowBreakdown(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={24} color={theme.TEXT_PRIMARY} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalScoreRow}>
                            <Text variant="hero" color={color}>{score}</Text>
                            <Text variant="h2" tone="muted"> / 100 ({grade})</Text>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {breakdown && Object.entries(breakdown).map(([key, dim]) => (
                                <View key={key} style={styles.breakdownItem}>
                                    <View style={styles.breakdownHeader}>
                                        <Text variant="bodyMed">{dim.label}</Text>
                                        <Text variant="num" color={scoreColor(theme, dim.score)}>
                                            {dim.score}/100
                                        </Text>
                                    </View>
                                    <BarTrack
                                        value={dim.score}
                                        max={100}
                                        color={scoreColor(theme, dim.score)}
                                    />
                                    <Text variant="meta" tone="muted" style={styles.breakdownDetail}>
                                        {dim.detail}
                                    </Text>
                                    <Text variant="meta" tone="disabled">Weight: {dim.weight}%</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
};

export default FinancialHealthScore;
