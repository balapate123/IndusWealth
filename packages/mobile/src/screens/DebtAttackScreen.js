import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    StatusBar,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const DebtAttackScreen = () => {
    const [extraPayment, setExtraPayment] = useState(0);
    const [strategy, setStrategy] = useState('snowball');
    const [debts, setDebts] = useState([]);
    const [rawLiabilities, setRawLiabilities] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getDebtOverview();

            if (data?.success) {
                setAnalysis(data.analysis);
                setRawLiabilities(data.raw_liabilities);

                // Extract debts from analysis for display
                if (data.raw_liabilities?.credit) {
                    const formattedDebts = data.raw_liabilities.credit.map((d, index) => ({
                        id: index + 1,
                        name: d.name || 'Credit Card',
                        apr: d.aprs?.find(a => a.apr_type === 'purchase_apr')?.apr_percentage || 19.99,
                        balance: d.last_statement_balance || 0,
                        payoffMonths: 12, // Will be updated by calculation
                    }));
                    setDebts(formattedDebts);
                }
            }
        } catch (err) {
            console.error('Error fetching debt data:', err);
            setError('Failed to load debt data. Pull to refresh.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    // Recalculate when slider changes
    const handleSliderChange = async (value) => {
        setExtraPayment(value);

        if (!rawLiabilities) return;

        setCalculating(true);
        try {
            const data = await api.calculateDebt(value, rawLiabilities);
            if (data?.success) {
                setAnalysis(data.analysis);
            }
        } catch (err) {
            console.error('Error calculating debt:', err);
        } finally {
            setCalculating(false);
        }
    };

    // Get display values from analysis
    const getStrategyData = () => {
        if (!analysis?.strategies) {
            return {
                debtFreeDate: 'N/A',
                monthsSooner: 0,
                interestSaved: 0,
            };
        }

        const strategyData = strategy === 'snowball'
            ? analysis.strategies.snowball
            : analysis.strategies.avalanche;

        const statusQuo = analysis.strategies.status_quo;

        const payoffDate = strategyData?.payoff_date
            ? new Date(strategyData.payoff_date + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : 'N/A';

        return {
            debtFreeDate: payoffDate,
            monthsSooner: statusQuo?.months_to_payoff - strategyData?.months_to_payoff || 0,
            interestSaved: Math.round(statusQuo?.total_interest - strategyData?.total_interest) || 0,
        };
    };

    const { debtFreeDate, monthsSooner, interestSaved } = getStrategyData();
    const basePayment = 400;
    const totalPayment = basePayment + extraPayment;

    const renderDebtItem = (item, index) => (
        <View key={item.id} style={styles.debtItem}>
            <View style={styles.debtRank}>
                <Text style={styles.debtRankText}>#{index + 1}</Text>
            </View>
            <View style={styles.debtContent}>
                <Text style={styles.debtName}>{item.name}</Text>
                <Text style={styles.debtApr}>{item.apr.toFixed(2)}% APR</Text>
            </View>
            <View style={styles.debtRight}>
                <Text style={styles.debtBalance}>${item.balance.toLocaleString()}</Text>
                <Text style={styles.debtPayoff}>Payoff: {item.payoffMonths} mo</Text>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Loading your debt plan...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.BACKGROUND} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Debt Attack Plan</Text>
                <TouchableOpacity style={styles.saveButton}>
                    <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.GOLD}
                        colors={[COLORS.GOLD]}
                    />
                }
            >
                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Main Results Card */}
                <View style={styles.resultsCard}>
                    <View style={styles.debtFreeSection}>
                        <View style={styles.labelRow}>
                            <Ionicons name="calendar" size={16} color="#4ADE80" />
                            <Text style={styles.labelText}>DEBT-FREE DATE</Text>
                        </View>
                        <Text style={styles.debtFreeDate}>{debtFreeDate}</Text>
                        {monthsSooner > 0 && (
                            <View style={styles.soonerBadge}>
                                <Ionicons name="trending-down" size={14} color="#4ADE80" />
                                <Text style={styles.soonerText}>{monthsSooner} months sooner</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.interestSection}>
                        <Text style={styles.interestLabel}>INTEREST SAVED</Text>
                        <View style={styles.interestRow}>
                            <Text style={styles.interestAmount}>
                                ${interestSaved.toLocaleString()}
                            </Text>
                            <View style={styles.trophyIcon}>
                                <MaterialCommunityIcons name="trophy" size={28} color={COLORS.GOLD} />
                            </View>
                        </View>
                    </View>

                    {calculating && (
                        <View style={styles.calculatingOverlay}>
                            <ActivityIndicator size="small" color={COLORS.GOLD} />
                        </View>
                    )}
                </View>

                {/* Payment Slider Card */}
                <View style={styles.sliderCard}>
                    <Text style={styles.sliderLabel}>Extra Monthly Payment</Text>
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentAmount}>+${extraPayment}</Text>
                        <Text style={styles.paymentSuffix}>/mo</Text>
                        <Text style={styles.totalPayment}>Total: ${totalPayment}/mo</Text>
                    </View>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={1000}
                        step={50}
                        value={extraPayment}
                        onSlidingComplete={handleSliderChange}
                        onValueChange={setExtraPayment}
                        minimumTrackTintColor="#3B82F6"
                        maximumTrackTintColor={COLORS.CARD_BORDER}
                        thumbTintColor={COLORS.WHITE}
                    />
                    <View style={styles.sliderLabels}>
                        <Text style={styles.sliderLabelText}>+$0</Text>
                        <Text style={styles.sliderLabelText}>+$1,000</Text>
                    </View>
                </View>

                {/* Strategy Section */}
                <View style={styles.strategySection}>
                    <Text style={styles.sectionTitle}>Strategy</Text>
                    <View style={styles.strategyButtons}>
                        <TouchableOpacity
                            style={[
                                styles.strategyButton,
                                strategy === 'snowball' && styles.strategyButtonActive
                            ]}
                            onPress={() => setStrategy('snowball')}
                        >
                            <MaterialCommunityIcons
                                name="snowflake"
                                size={16}
                                color={strategy === 'snowball' ? COLORS.WHITE : COLORS.TEXT_SECONDARY}
                            />
                            <Text style={[
                                styles.strategyText,
                                strategy === 'snowball' && styles.strategyTextActive
                            ]}>
                                Snowball
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.strategyButton,
                                strategy === 'avalanche' && styles.strategyButtonActive
                            ]}
                            onPress={() => setStrategy('avalanche')}
                        >
                            <MaterialCommunityIcons
                                name="trending-up"
                                size={16}
                                color={strategy === 'avalanche' ? COLORS.WHITE : COLORS.TEXT_SECONDARY}
                            />
                            <Text style={[
                                styles.strategyText,
                                strategy === 'avalanche' && styles.strategyTextActive
                            ]}>
                                Avalanche
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.strategyDescription}>
                        <Text style={styles.strategyMethodLabel}>
                            {strategy === 'snowball' ? 'Snowball method: ' : 'Avalanche method: '}
                        </Text>
                        {strategy === 'snowball'
                            ? 'You pay off the smallest debts first to build momentum.'
                            : 'You pay off highest interest debts first to save money.'}
                    </Text>
                </View>

                {/* Debts List */}
                <View style={styles.debtsSection}>
                    <Text style={styles.sectionTitle}>Your Debts</Text>
                    {debts.length > 0 ? (
                        debts.map((debt, index) => renderDebtItem(debt, index))
                    ) : (
                        <View style={styles.emptyState}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.GREEN} />
                            <Text style={styles.emptyText}>No debts found. You're debt free!</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Bottom Action Button */}
            <View style={styles.bottomAction}>
                <TouchableOpacity style={styles.applyButton}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.WHITE} />
                    <Text style={styles.applyText}>Apply This Plan</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 50,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: COLORS.TEXT_SECONDARY,
        marginTop: SPACING.MEDIUM,
    },
    scrollContent: {
        paddingBottom: 120,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
    },
    backButton: {
        padding: SPACING.SMALL,
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    saveButton: {
        padding: SPACING.SMALL,
    },
    saveText: {
        color: '#3B82F6',
        fontSize: 16,
        fontWeight: '600',
    },

    // Error
    errorContainer: {
        margin: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    errorText: {
        color: '#F44336',
        textAlign: 'center',
    },

    // Results Card
    resultsCard: {
        margin: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        position: 'relative',
    },
    calculatingOverlay: {
        position: 'absolute',
        top: SPACING.SMALL,
        right: SPACING.SMALL,
    },
    debtFreeSection: {
        marginBottom: SPACING.MEDIUM,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    labelText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        letterSpacing: 1,
        marginLeft: SPACING.SMALL,
    },
    debtFreeDate: {
        color: COLORS.WHITE,
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: SPACING.SMALL,
    },
    soonerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    soonerText: {
        color: '#4ADE80',
        fontSize: 14,
        marginLeft: SPACING.TINY,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.CARD_BORDER,
        marginVertical: SPACING.MEDIUM,
    },
    interestSection: {},
    interestLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        letterSpacing: 1,
        marginBottom: SPACING.SMALL,
    },
    interestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    interestAmount: {
        color: '#4ADE80',
        fontSize: 32,
        fontWeight: 'bold',
    },
    trophyIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(201, 162, 39, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Slider Card
    sliderCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
    },
    sliderLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginBottom: SPACING.SMALL,
    },
    paymentRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: SPACING.MEDIUM,
    },
    paymentAmount: {
        color: COLORS.WHITE,
        fontSize: 32,
        fontWeight: 'bold',
    },
    paymentSuffix: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 16,
        marginLeft: SPACING.TINY,
    },
    totalPayment: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginLeft: 'auto',
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    sliderLabelText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
    },

    // Strategy Section
    strategySection: {
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.LARGE,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
        marginBottom: SPACING.MEDIUM,
    },
    strategyButtons: {
        flexDirection: 'row',
        gap: SPACING.SMALL,
        marginBottom: SPACING.MEDIUM,
    },
    strategyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        backgroundColor: COLORS.CARD_BG,
    },
    strategyButtonActive: {
        backgroundColor: '#2563EB',
    },
    strategyText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
        marginLeft: SPACING.SMALL,
    },
    strategyTextActive: {
        color: COLORS.WHITE,
    },
    strategyDescription: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        lineHeight: 20,
    },
    strategyMethodLabel: {
        color: '#3B82F6',
    },

    // Debts Section
    debtsSection: {
        paddingHorizontal: SPACING.MEDIUM,
    },
    debtItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        marginBottom: SPACING.SMALL,
    },
    debtRank: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.CARD_BORDER,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    debtRankText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: '600',
    },
    debtContent: {
        flex: 1,
    },
    debtName: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    debtApr: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    debtRight: {
        alignItems: 'flex-end',
    },
    debtBalance: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    debtPayoff: {
        color: '#3B82F6',
        fontSize: 12,
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        padding: SPACING.XL,
    },
    emptyText: {
        color: COLORS.TEXT_MUTED,
        marginTop: SPACING.MEDIUM,
        textAlign: 'center',
    },

    // Bottom Action
    bottomAction: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: SPACING.MEDIUM,
        paddingBottom: SPACING.LARGE,
        backgroundColor: COLORS.BACKGROUND,
    },
    applyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
    },
    applyText: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '600',
        marginLeft: SPACING.SMALL,
    },
});

export default DebtAttackScreen;
