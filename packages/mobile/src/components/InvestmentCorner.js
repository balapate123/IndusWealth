import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text } from './ui';
import api from '../services/api';

const makeStyles = (t) => StyleSheet.create({
    container: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    seeAll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.TINY,
    },
    scroll: {
        paddingRight: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    etfCard: {
        width: 160,
        marginRight: SPACING.MEDIUM,
        marginBottom: 0,
        overflow: 'hidden',
    },
    returnBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
    },
    ticker: { marginTop: SPACING.TINY },
    name: { marginBottom: SPACING.SMALL },
    returnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginBottom: SPACING.TINY,
    },
    riskChip: {
        alignSelf: 'flex-start',
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: RADIUS.SMALL / 2,
    },
    disclaimer: {
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        fontStyle: 'italic',
    },
    loading: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
});

const ETFMiniCard = ({ etf, onPress }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // A return is a status reading, not a series colour.
    const positive = etf.historical_returns.one_year_percent >= 0;
    const returnColor = positive ? theme.SUCCESS : theme.DANGER;

    return (
        <Card inset={false} onPress={() => onPress?.(etf)} style={styles.etfCard}>
            <View style={[styles.returnBar, { backgroundColor: returnColor }]} />
            <Text variant="h2" style={styles.ticker}>{etf.ticker}</Text>
            <Text variant="meta" tone="muted" style={styles.name} numberOfLines={2}>{etf.name}</Text>

            <View style={styles.returnRow}>
                <Ionicons name={positive ? 'arrow-up' : 'arrow-down'} size={14} color={returnColor} />
                <Text variant="h2" color={returnColor}>
                    {etf.historical_returns.one_year_percent}%
                </Text>
            </View>

            <Text variant="meta" tone="muted" style={styles.name}>MER {etf.mer_percent}%</Text>

            <View style={styles.riskChip}>
                <Text variant="meta" tone="muted">
                    {etf.risk_level.charAt(0).toUpperCase() + etf.risk_level.slice(1)}
                </Text>
            </View>
        </Card>
    );
};

const InvestmentCorner = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

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
            <View style={styles.loading}>
                <ActivityIndicator size="small" color={theme.ACCENT} />
            </View>
        );
    }

    if (etfs.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.sectionHeader}>
                <View style={styles.titleRow}>
                    <Ionicons name="pie-chart-outline" size={20} color={categoryColor(theme, 5)} />
                    <Text variant="h2">Investment Corner</Text>
                </View>
                <TouchableOpacity style={styles.seeAll} onPress={handleSeeAll} activeOpacity={0.7}>
                    <Text variant="label" tone="link">See all</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.LINK} />
                </TouchableOpacity>
            </View>

            <Text variant="meta" tone="muted">Based on your {riskProfile} risk profile</Text>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
            >
                {etfs.map((etf) => (
                    <ETFMiniCard key={etf.ticker} etf={etf} onPress={handleETFPress} />
                ))}
            </ScrollView>

            <Text variant="meta" tone="muted" style={styles.disclaimer}>
                Approximate historical data. Not investment advice.
            </Text>
        </View>
    );
};

export default InvestmentCorner;
