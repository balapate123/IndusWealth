import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

const WatchdogScreen = () => {
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalysis();
    }, []);

    const fetchAnalysis = async () => {
        try {
            const response = await fetch('http://localhost:3000/transactions');
            const data = await response.json();
            if (data.success && data.analysis) {
                setAnalysis(data.analysis);
            }
        } catch (error) {
            console.error('Watchdog Fetch Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderAlertCard = (title, items, type) => {
        if (!items || items.length === 0) return null;

        const total = items.reduce((acc, curr) => acc + curr.amount, 0);

        return (
            <View style={styles.alertCard}>
                <View style={styles.alertHeader}>
                    <Text style={styles.alertTitle}>{title}</Text>
                    <Text style={styles.alertTotal}>${total.toFixed(2)}/mo</Text>
                </View>
                <Text style={styles.alertSubtitle}>Potential Annual Loss: ${(total * 12).toFixed(2)}</Text>

                <View style={styles.divider} />

                {items.map((item, index) => (
                    <View key={index} style={styles.leakRow}>
                        <Text style={styles.leakName}>{item.name}</Text>
                        <Text style={styles.leakAmount}>${item.amount.toFixed(2)}</Text>
                    </View>
                ))}

                <TouchableOpacity style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>
                        {type === 'sub' ? 'CANCEL SUBSCRIPTION' : 'DISPUTE FEES'}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <Text style={styles.loadingText}>Scanning for leakage...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Subscription Watchdog</Text>
                <Text style={styles.headerSubtitle}>Active Leakage Verification</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Summary Header */}
                <View style={styles.summaryContainer}>
                    <Text style={styles.totalLeakageLabel}>TOTAL MONTHLY LEAKAGE</Text>
                    <Text style={styles.totalLeakageAmount}>
                        ${analysis?.total_monthly_leakage?.toFixed(2) || '0.00'}
                    </Text>
                </View>

                {renderAlertCard('DETECTED SUBSCRIPTIONS', analysis?.subscriptions, 'sub')}
                {renderAlertCard('HIDDEN BANK FEES', analysis?.fees, 'fee')}

                {!analysis?.subscriptions?.length && !analysis?.fees?.length && (
                    <View style={styles.safeState}>
                        <Text style={styles.safeText}>No leakage detected. You are safe.</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A', // Slate 900
        paddingTop: Platform.OS === 'android' ? 25 : 0,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center'
    },
    loadingText: {
        color: '#FCD34D', // Amber 300
        fontSize: 16
    },
    header: {
        padding: SPACING.MEDIUM,
        backgroundColor: '#0F172A',
    },
    headerTitle: {
        color: '#FCD34D', // Amber 300
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 0.5
    },
    headerSubtitle: {
        color: '#94A3B8', // Slate 400
        fontSize: 14,
    },
    content: {
        padding: SPACING.MEDIUM,
        paddingBottom: 100
    },
    summaryContainer: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: SPACING.MEDIUM
    },
    totalLeakageLabel: {
        color: '#94A3B8',
        fontSize: 12,
        letterSpacing: 2,
        marginBottom: 8
    },
    totalLeakageAmount: {
        color: '#F43F5E', // Rose 500 (Red)
        fontSize: 48,
        fontWeight: 'bold',
        letterSpacing: -2
    },
    alertCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)', // Glass
        borderRadius: 20,
        padding: 24,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(252, 211, 77, 0.3)', // Amber Border
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    alertHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
    },
    alertTitle: {
        color: '#FCD34D', // Amber 300
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
        textTransform: 'uppercase'
    },
    alertTotal: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontWeight: '700'
    },
    alertSubtitle: {
        color: '#94A3B8',
        fontSize: 12,
        marginBottom: 16
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 16
    },
    leakRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12
    },
    leakName: {
        color: '#E2E8F0', // Slate 200
        fontSize: 15
    },
    leakAmount: {
        color: '#E2E8F0',
        fontSize: 15,
        fontWeight: '600'
    },
    actionButton: {
        backgroundColor: '#FCD34D', // Amber 300
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 8
    },
    actionButtonText: {
        color: '#0F172A', // Slate 900
        fontWeight: 'bold',
        fontSize: 12,
        letterSpacing: 1
    },
    safeState: {
        padding: SPACING.LARGE,
        alignItems: 'center',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#22c55e'
    },
    safeText: {
        color: '#4ADE80',
        fontSize: 16,
        fontWeight: '600'
    }
});

export default WatchdogScreen;
