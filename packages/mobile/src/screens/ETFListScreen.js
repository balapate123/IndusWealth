import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Button,
    Chip,
    ChipRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'all_equity', label: 'Equity' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'fixed_income', label: 'Bonds' },
    { key: 'dividend', label: 'Dividend' },
    { key: 'hisa_etf', label: 'HISA' },
];

const makeStyles = (t) => StyleSheet.create({
    disclaimer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        padding: SPACING.MEDIUM - 4,
        backgroundColor: t.SURFACE_SUNKEN,
        borderRadius: RADIUS.SMALL,
    },
    // Without flex:1 the list expands to its content height and squeezes the
    // header's chip row above it.
    list: { flex: 1 },
    listContent: { paddingBottom: 120 },
    highlighted: {
        borderWidth: 2,
        borderColor: t.ACCENT,
    },
    etfHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    etfTitleBlock: { flex: 1 },
    returnBlock: { alignItems: 'flex-end' },
    description: { marginBottom: SPACING.MEDIUM },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    metric: { alignItems: 'center' },
});

const ETFListScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [etfs, setEtfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const highlightTicker = route.params?.highlightTicker;

    const loadETFs = useCallback(async () => {
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
    }, [activeFilter]);

    useEffect(() => {
        loadETFs();
    }, [loadETFs]);

    const handleBuyLink = async (etf) => {
        try {
            await api.trackETFInteraction(etf.ticker, 'clicked_buy_link', 'etf_list');
            await Linking.openURL('https://www.wealthsimple.com/en-ca/invest');
        } catch (e) { /* ignore */ }
    };

    const renderETFCard = ({ item: etf }) => {
        // A return is a status reading, not a series colour.
        const positive = etf.historical_returns.one_year_percent >= 0;
        const returnColor = positive ? theme.SUCCESS : theme.DANGER;
        const isHighlighted = etf.ticker === highlightTicker;

        return (
            <Card style={isHighlighted ? styles.highlighted : undefined}>
                <View style={styles.etfHeader}>
                    <View style={styles.etfTitleBlock}>
                        <Text variant="h1">{etf.ticker}</Text>
                        <Text variant="meta" tone="secondary">{etf.name}</Text>
                        <Text variant="meta" tone="muted">{etf.provider}</Text>
                    </View>
                    <View style={styles.returnBlock}>
                        <Text variant="h1" color={returnColor}>
                            {positive ? '+' : ''}{etf.historical_returns.one_year_percent}%
                        </Text>
                        <Text variant="meta" tone="muted">1yr return</Text>
                    </View>
                </View>

                <Text variant="meta" tone="secondary" style={styles.description}>
                    {etf.description}
                </Text>

                <View style={styles.metricRow}>
                    {[
                        { label: 'MER', value: `${etf.mer_percent}%` },
                        { label: 'Yield', value: `${etf.distribution_yield_percent}%` },
                        { label: '5yr avg', value: `${etf.historical_returns.five_year_annualized_percent}%` },
                        { label: 'Risk', value: etf.risk_level },
                    ].map((metric) => (
                        <View key={metric.label} style={styles.metric}>
                            <Text variant="overline" tone="muted">{metric.label}</Text>
                            <Text variant="num">{metric.value}</Text>
                        </View>
                    ))}
                </View>

                <Button
                    title="Where to buy"
                    icon="open-outline"
                    variant="secondary"
                    onPress={() => handleBuyLink(etf)}
                    block
                />
            </Card>
        );
    };

    const header = (
        <>
            <ScreenHeader title="Canadian ETFs" onBack={() => navigation.goBack()} />

            <View style={styles.disclaimer}>
                <Ionicons name="information-circle" size={14} color={theme.TEXT_MUTED} />
                <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                    A reference list of widely held Canadian ETFs, shown to everyone in the same
                    order — nothing here is selected for you or based on your finances. Education
                    only, not investment advice. Data is approximate and updated quarterly. Past
                    performance does not guarantee future results.
                </Text>
            </View>

            <ChipRow style={{ marginBottom: SPACING.MEDIUM }}>
                {FILTER_TABS.map((tab) => (
                    <Chip
                        key={tab.key}
                        label={tab.label}
                        active={activeFilter === tab.key}
                        onPress={() => setActiveFilter(tab.key)}
                    />
                ))}
            </ChipRow>
        </>
    );

    return (
        <Screen header={header}>
            {loading ? (
                <LoadingState message="Loading ETFs..." />
            ) : (
                <FlatList
                    data={etfs}
                    keyExtractor={(item) => item.ticker}
                    renderItem={renderETFCard}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon="pie-chart-outline"
                            title="No ETFs in this category"
                            message="Try a different filter."
                        />
                    }
                />
            )}
        </Screen>
    );
};

export default ETFListScreen;
