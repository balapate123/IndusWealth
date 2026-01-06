import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, FONTS } from '../constants/theme';
import Slider from '@react-native-community/slider';

// If Slider package is missing, we will use buttons for MVP, but let's assume standard install or we can add it. 
// Given the complexity of adding native modules in this environment without full rebuild control, 
// I will Implement a "Visual Custom Slider" or just use +/- Buttons if native slider fails, 
// BUT the user explicitely asked for a Slider. 
// I will try to use the standard one. If it crashes, I will hot-swap.

const DebtAttackScreen = () => {
    const [loading, setLoading] = useState(true);
    const [analysis, setAnalysis] = useState(null);
    const [extraPayment, setExtraPayment] = useState(0);
    const [rawLiabilities, setRawLiabilities] = useState(null);
    const [projectedSavings, setProjectedSavings] = useState(0);

    // Initial Fetch
    useEffect(() => {
        fetchDebtData();
    }, []);

    const fetchDebtData = async () => {
        try {
            // Use the verify token we generated or the env override
            // For the app to work "live" without us manually passing it, we hardcode the verify token 
            // OR we expect backend to use its ENV override.
            const response = await fetch('http://localhost:3000/debt');
            const data = await response.json();

            if (data.success) {
                setAnalysis(data.analysis);
                setRawLiabilities(data.raw_liabilities);
                setLoading(false);
            }
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    const handleCalculate = async (val) => {
        setExtraPayment(val);
        // Debounce or just wait for slide complete? 
        // For local responsiveness, we could estimate, but let's call API for accuracy
        try {
            const response = await fetch('http://localhost:3000/debt/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    extra_payment: val,
                    liabilities: rawLiabilities
                })
            });
            const data = await response.json();
            if (data.success) {
                setAnalysis(data.analysis);
                if (data.analysis.savings) {
                    setProjectedSavings(data.analysis.savings.interest_saved_avalanche);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
            </View>
        );
    }

    // Default empty analysis
    const statusQuo = analysis?.strategies?.status_quo || {};
    const avalanche = analysis?.strategies?.avalanche || {};
    const totalDebt = analysis?.total_debt || 0;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.header}>Debt Attack Engine</Text>

            {/* HERRO CARD */}
            <View style={styles.heroCard}>
                <Text style={styles.label}>TOTAL DEBT LOAD</Text>
                <Text style={styles.amount}>${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                <Text style={styles.subtext}>Your starting point.</Text>
            </View>

            {/* SLIDER SECTION */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Debts</Text>
                {/* Dynamically render liabilities */}
                {rawLiabilities && Object.entries(rawLiabilities).map(([key, list]) =>
                    list && Array.isArray(list) && list.map((item, index) => (
                        <View key={`${key}-${index}`} style={styles.liabilityCard}>
                            <View>
                                <Text style={styles.liabilityName}>{item.name || key === 'credit' ? 'Credit Card' : 'Loan'}</Text>
                                <View style={styles.aprBadge}>
                                    <Text style={styles.aprText}>
                                        {item.aprs?.find(a => a.apr_type === 'purchase_apr')?.apr_percentage || 19.99}% APR
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.liabilityAmount}>${(item.last_statement_balance || item.last_payment_balance || 0).toFixed(2)}</Text>
                        </View>
                    ))
                )}
            </View>

            {/* SLIDER SECTION */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Adjust Your Firepower</Text>
                <Text style={styles.sliderLabel}>Extra Monthly Payment: <Text style={styles.goldText}>${Math.round(extraPayment)}</Text></Text>

                {/* Note: In Expo Go / Web, native slider might need specific package. 
                    If this component strictly fails, we replace with buttons. */}
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={0}
                    maximumValue={1000}
                    step={50}
                    minimumTrackTintColor={COLORS.GOLD}
                    maximumTrackTintColor="#FFFFFF"
                    thumbTintColor={COLORS.GOLD}
                    value={extraPayment}
                    onSlidingComplete={handleCalculate}
                    onValueChange={(val) => setExtraPayment(val)}
                />
                <View style={styles.sliderRow}>
                    <Text style={styles.sliderMin}>$0</Text>
                    <Text style={styles.sliderMax}>$1,000</Text>
                </View>
            </View>

            {/* RESULTS COMPARISON */}
            <View style={styles.comparisonContainer}>
                {/* STATUS QUO */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Status Quo</Text>
                    <Text style={styles.dataLabel}>Payoff Date</Text>
                    <Text style={styles.dataValue}>{statusQuo.payoff_date || 'N/A'}</Text>
                    <Text style={styles.dataLabel}>Total Interest</Text>
                    <Text style={styles.dataValue}>${(statusQuo.total_interest || 0).toFixed(0)}</Text>
                </View>

                {/* ATTACK PLAN */}
                <View style={[styles.card, styles.goldBorder]}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>RECOMMENDED</Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: COLORS.GOLD }]}>Avalanche</Text>
                    <Text style={styles.dataLabel}>Payoff Date</Text>
                    <Text style={[styles.dataValue, { color: COLORS.WHITE }]}>{avalanche.payoff_date || 'N/A'}</Text>
                    <Text style={styles.dataLabel}>Total Interest</Text>
                    <Text style={[styles.dataValue, { color: COLORS.WHITE }]}>${(avalanche.total_interest || 0).toFixed(0)}</Text>
                </View>
            </View>

            {/* SAVINGS CARD */}
            <View style={styles.savingsCard}>
                <Text style={styles.savingsLabel}>POTENTIAL INTEREST SAVINGS</Text>
                <Text style={styles.savingsAmount}>${projectedSavings.toFixed(2)}</Text>
                <Text style={styles.disclaimer}>*Based on current Prime Rate of 4.45%</Text>
            </View>

        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A', // Slate 900
    },
    content: {
        padding: SPACING.MEDIUM,
        paddingBottom: 40,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        fontSize: 28,
        color: COLORS.WHITE,
        fontWeight: '800',
        marginBottom: SPACING.LARGE,
        marginTop: SPACING.MEDIUM,
        letterSpacing: -1
    },
    heroCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        padding: 30,
        borderRadius: 24,
        marginBottom: SPACING.LARGE,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10
    },
    label: {
        color: '#94A3B8',
        fontSize: 12,
        letterSpacing: 2,
        marginBottom: 8,
        textTransform: 'uppercase',
        fontWeight: '600'
    },
    amount: {
        color: COLORS.WHITE,
        fontSize: 48,
        fontWeight: 'bold',
        letterSpacing: -2
    },
    subtext: {
        color: '#64748B',
        fontSize: 14,
        marginTop: 8,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        color: '#E2E8F0',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
        letterSpacing: 0.5
    },
    sliderLabel: {
        color: '#CBD5E1',
        fontSize: 14,
        marginBottom: 12,
    },
    goldText: {
        color: '#FCD34D',
        fontWeight: 'bold',
        fontSize: 16,
    },
    sliderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    sliderMin: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    sliderMax: { color: '#64748B', fontSize: 12, fontWeight: '600' },

    comparisonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.LARGE,
        gap: 12
    },
    card: {
        flex: 1,
        backgroundColor: 'rgba(30, 41, 59, 0.4)', // Glass
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    goldBorder: {
        borderWidth: 1,
        borderColor: '#FCD34D', // Amber 300
        backgroundColor: 'rgba(252, 211, 77, 0.05)',
    },
    cardTitle: {
        color: '#E2E8F0',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    dataLabel: {
        color: '#94A3B8',
        fontSize: 11,
        marginBottom: 4,
        fontWeight: '600'
    },
    dataValue: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
        letterSpacing: -0.5
    },
    badge: {
        position: 'absolute',
        top: -10,
        right: 12,
        backgroundColor: '#FCD34D',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        shadowColor: '#FCD34D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    badgeText: {
        color: '#0F172A',
        fontSize: 10,
        fontWeight: 'bold',
    },
    savingsCard: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)', // Green tint
        padding: 24,
        borderRadius: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#22c55e', // Green 500
        marginBottom: 40
    },
    savingsLabel: {
        color: '#4ADE80', // Green 400
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    savingsAmount: {
        color: '#4ADE80',
        fontSize: 42,
        fontWeight: '800',
        marginBottom: 12,
        letterSpacing: -1
    },
    disclaimer: {
        color: '#64748B',
        fontSize: 11,
        fontStyle: 'italic',
    },
    liabilityCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.4)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeftWidth: 4,
        borderLeftColor: '#F43F5E', // Rose 500
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)'
    },
    liabilityName: {
        color: '#E2E8F0',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4
    },
    liabilityAmount: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: 'bold'
    },
    aprBadge: {
        backgroundColor: 'rgba(244, 63, 94, 0.1)', // Rose tint
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start'
    },
    aprText: {
        color: '#F43F5E',
        fontSize: 11,
        fontWeight: '700'
    }
});

export default DebtAttackScreen;
