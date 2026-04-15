import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const ETFMiniCard = ({ etf, onPress }) => {
    const returnPositive = etf.historical_returns.one_year_percent >= 0;
    const returnColor = returnPositive ? COLORS.ETF_POSITIVE : COLORS.ETF_NEGATIVE;

    return (
        <TouchableOpacity style={styles.etfCard} onPress={() => onPress?.(etf)} activeOpacity={0.8}>
            <View style={[styles.etfCategoryBar, { backgroundColor: returnColor }]} />
            <Text style={styles.etfTicker}>{etf.ticker}</Text>
            <Text style={styles.etfName} numberOfLines={2}>{etf.name}</Text>
            <View style={styles.etfReturnRow}>
                <Ionicons
                    name={returnPositive ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={returnColor}
                />
                <Text style={[styles.etfReturn, { color: returnColor }]}>
                    {etf.historical_returns.one_year_percent}%
                </Text>
            </View>
            <Text style={styles.etfMer}>MER {etf.mer_percent}%</Text>
            <View style={styles.etfRiskChip}>
                <Text style={styles.etfRiskText}>
                    {etf.risk_level.charAt(0).toUpperCase() + etf.risk_level.slice(1)}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const InvestmentCorner = ({ navigation }) => {
    const [etfs, setEtfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [riskProfile, setRiskProfile] = useState('moderate');

    useEffect(() => {
        loadRecommendedETFs();
    }, []);

    const loadRecommendedETFs = async () => {
        try {
            const response = await api.getRecommendedETFs();
            if (response.success && response.data) {
                setEtfs(response.data.etfs || []);
                setRiskProfile(response.data.risk_profile || 'moderate');
            }
        } catch (err) {
            console.error('Failed to load recommended ETFs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleETFPress = async (etf) => {
        try {
            await api.trackETFInteraction(etf.ticker, 'viewed', 'investment_corner');
        } catch (e) { /* ignore tracking errors */ }

        // Navigate to ETF list screen if available, otherwise open Wealthsimple
        if (navigation) {
            navigation.navigate('ETFList', { highlightTicker: etf.ticker });
        }
    };

    const handleSeeAll = () => {
        if (navigation) {
            navigation.navigate('ETFList');
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="small" color={COLORS.GOLD} />
            </View>
        );
    }

    if (etfs.length === 0) return null;

    return (
        <View style={styles.container}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
                <View style={styles.titleRow}>
                    <Ionicons name="pie-chart-outline" size={20} color={COLORS.CAT_ETF} />
                    <Text style={styles.sectionTitle}>Investment Corner</Text>
                </View>
                <TouchableOpacity style={styles.seeAllButton} onPress={handleSeeAll}>
                    <Text style={styles.seeAllText}>SEE ALL</Text>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.GOLD} />
                </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>
                Based on your {riskProfile} risk profile
            </Text>

            {/* ETF Scroll */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.etfScroll}
            >
                {etfs.map((etf) => (
                    <ETFMiniCard key={etf.ticker} etf={etf} onPress={handleETFPress} />
                ))}
            </ScrollView>

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>
                Approximate historical data. Not investment advice.
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.TINY,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    seeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.TINY,
    },
    seeAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.GOLD,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.MEDIUM,
        opacity: 0.8,
    },
    etfScroll: {
        paddingRight: SPACING.LARGE,
    },
    etfCard: {
        width: 160,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.MEDIUM,
        marginRight: SPACING.MEDIUM,
        overflow: 'hidden',
    },
    etfCategoryBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
    },
    etfTicker: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.WHITE,
        marginTop: SPACING.TINY,
    },
    etfName: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        marginBottom: SPACING.SMALL,
        lineHeight: 15,
    },
    etfReturnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginBottom: SPACING.TINY,
    },
    etfReturn: {
        fontSize: 20,
        fontWeight: '700',
    },
    etfMer: {
        fontSize: 11,
        color: COLORS.TEXT_MUTED,
        marginBottom: SPACING.SMALL,
    },
    etfRiskChip: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    etfRiskText: {
        fontSize: 10,
        color: COLORS.TEXT_MUTED,
        fontWeight: '600',
    },
    disclaimer: {
        fontSize: 10,
        color: '#666',
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        fontStyle: 'italic',
    },
});

export default InvestmentCorner;
