import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'all_equity', label: 'Equity' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'fixed_income', label: 'Bonds' },
    { key: 'dividend', label: 'Dividend' },
    { key: 'hisa_etf', label: 'HISA' },
];

const ETFListScreen = ({ navigation, route }) => {
    const [etfs, setEtfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const highlightTicker = route.params?.highlightTicker;

    useEffect(() => {
        loadETFs();
    }, [activeFilter]);

    const loadETFs = async () => {
        try {
            setLoading(true);
            const params = activeFilter !== 'all' ? { category: activeFilter } : {};
            const response = await api.getETFs(params);
            if (response.success && response.data) {
                setEtfs(response.data.etfs || []);
            }
        } catch (err) {
            console.error('Failed to load ETFs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleBuyLink = async (etf) => {
        try {
            await api.trackETFInteraction(etf.ticker, 'clicked_buy_link', 'etf_list');
            await Linking.openURL('https://www.wealthsimple.com/en-ca/invest');
        } catch (e) { /* ignore */ }
    };

    const renderETFCard = ({ item: etf }) => {
        const returnPositive = etf.historical_returns.one_year_percent >= 0;
        const returnColor = returnPositive ? COLORS.ETF_POSITIVE : COLORS.ETF_NEGATIVE;
        const isHighlighted = etf.ticker === highlightTicker;

        return (
            <View style={[styles.etfCard, isHighlighted && styles.highlightedCard]}>
                <View style={styles.etfHeader}>
                    <View>
                        <Text style={styles.etfTicker}>{etf.ticker}</Text>
                        <Text style={styles.etfName}>{etf.name}</Text>
                        <Text style={styles.etfProvider}>{etf.provider}</Text>
                    </View>
                    <View style={styles.returnContainer}>
                        <Text style={[styles.returnValue, { color: returnColor }]}>
                            {returnPositive ? '+' : ''}{etf.historical_returns.one_year_percent}%
                        </Text>
                        <Text style={styles.returnLabel}>1yr return</Text>
                    </View>
                </View>

                <Text style={styles.etfDescription}>{etf.description}</Text>

                <View style={styles.metricRow}>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>MER</Text>
                        <Text style={styles.metricValue}>{etf.mer_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Yield</Text>
                        <Text style={styles.metricValue}>{etf.distribution_yield_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>5yr Avg</Text>
                        <Text style={styles.metricValue}>{etf.historical_returns.five_year_annualized_percent}%</Text>
                    </View>
                    <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Risk</Text>
                        <Text style={styles.metricValue}>{etf.risk_level}</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.buyButton} onPress={() => handleBuyLink(etf)}>
                    <Text style={styles.buyButtonText}>Where to Buy</Text>
                    <Ionicons name="open-outline" size={14} color={COLORS.GOLD} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Canadian ETFs</Text>
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
                <Ionicons name="information-circle" size={14} color="#888" />
                <Text style={styles.disclaimerText}>
                    Educational purposes only. Data is approximate and updated quarterly. Not investment advice. Past performance does not guarantee future results.
                </Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                {FILTER_TABS.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.filterTab, activeFilter === tab.key && styles.activeFilterTab]}
                        onPress={() => setActiveFilter(tab.key)}
                    >
                        <Text style={[styles.filterTabText, activeFilter === tab.key && styles.activeFilterText]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ETF List */}
            {loading ? (
                <ActivityIndicator size="large" color={COLORS.GOLD} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={etfs}
                    keyExtractor={(item) => item.ticker}
                    renderItem={renderETFCard}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: SPACING.MEDIUM,
        gap: SPACING.MEDIUM,
    },
    backButton: {
        padding: SPACING.TINY,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    disclaimerBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginHorizontal: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.SMALL,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    disclaimerText: {
        flex: 1,
        fontSize: 11,
        color: '#888',
        lineHeight: 16,
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
        gap: SPACING.SMALL,
        flexWrap: 'wrap',
    },
    filterTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.SMALL,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    activeFilterTab: {
        backgroundColor: COLORS.GOLD,
    },
    filterTabText: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        fontWeight: '500',
    },
    activeFilterText: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: SPACING.LARGE,
        paddingBottom: 120,
    },
    etfCard: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        padding: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    highlightedCard: {
        borderColor: COLORS.GOLD,
        borderWidth: 2,
    },
    etfHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    etfTicker: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    etfName: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        maxWidth: 200,
    },
    etfProvider: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    returnContainer: {
        alignItems: 'flex-end',
    },
    returnValue: {
        fontSize: 24,
        fontWeight: '700',
    },
    returnLabel: {
        fontSize: 11,
        color: '#666',
    },
    etfDescription: {
        fontSize: 13,
        color: COLORS.WHITE,
        opacity: 0.7,
        lineHeight: 18,
        marginBottom: SPACING.MEDIUM,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    metric: {
        alignItems: 'center',
    },
    metricLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.WHITE,
    },
    buyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.GOLD,
        borderRadius: BORDER_RADIUS.MEDIUM,
        paddingVertical: SPACING.SMALL,
        gap: SPACING.SMALL,
    },
    buyButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.GOLD,
    },
});

export default ETFListScreen;
