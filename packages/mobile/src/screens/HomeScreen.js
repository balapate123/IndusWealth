import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
// import { Ionicons } from '@expo/vector-icons'; // Assuming icons available

// Mock Data matching the structure (Fallback)
// Real Data Only

const HomeScreen = () => {
    const [transactions, setTransactions] = useState([]);
    const [totalCash, setTotalCash] = useState(0);

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const response = await fetch('http://localhost:3000/transactions');
                const data = await response.json();
                if (data.success) {
                    setTransactions(data.data);
                    // Calculate total from real data (or fetch balance endpoint in future)
                    const total = data.data.reduce((acc, curr) => acc + curr.amount, 0);
                    setTotalCash(total);
                }
            } catch (error) {
                console.log('Error fetching transactions:', error);
                setTransactions([]);
                setTotalCash(0);
            }
        };

        fetchTransactions();
    }, []);

    const renderTransaction = (item) => (
        <View key={item.id} style={styles.transactionItem}>
            <View style={styles.transactionIcon}>
                <Text style={styles.bankTag}>{item.bank ? item.bank[0] : '?'}</Text>
            </View>
            <View style={styles.transactionContent}>
                <Text style={styles.transactionTitle}>{item.description}</Text>
                <Text style={styles.transactionDate}>{item.date} • {item.bank}</Text>
            </View>
            <Text style={[
                styles.transactionAmount,
                { color: item.amount > 0 ? '#4CAF50' : COLORS.TEXT_PRIMARY }
            ]}>
                {item.amount > 0 ? '+' : ''}${Math.abs(item.amount).toFixed(2)}
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.header}>
                <Text style={styles.greeting}>Good Evening, User</Text>
                <Text style={styles.subtitle}>Financial Overview</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardLabel}>TOTAL LIQUID CASH</Text>
                <Text style={styles.cardAmount}>${totalCash.toLocaleString()}</Text>
                <View style={styles.cardFooter}>
                    <Text style={styles.cardFooterText}>+2.3% this month</Text>
                </View>
            </View>

            <View style={styles.feedContainer}>
                <Text style={styles.feedHeader}>Unified Ledger (Web Safe)</Text>
                <ScrollView contentContainerStyle={styles.listContent}>
                    {transactions.map(item => renderTransaction(item))}
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A', // Slate 900
        paddingTop: Platform.OS === 'android' ? 25 : 0,
    },
    header: {
        padding: SPACING.MEDIUM,
    },
    greeting: {
        color: '#FCD34D', // Amber 300
        fontSize: 18,
        fontWeight: '600',
        letterSpacing: 0.5
    },
    subtitle: {
        color: '#94A3B8', // Slate 400
        fontSize: 14,
    },
    card: {
        // Glassmorphism effect
        backgroundColor: 'rgba(30, 41, 59, 0.7)', // Slate 800 with opacity
        margin: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    cardLabel: {
        color: '#94A3B8', // Slate 400
        fontSize: 12,
        letterSpacing: 1.5,
        marginBottom: SPACING.SMALL,
        textTransform: 'uppercase',
        fontWeight: '600'
    },
    cardAmount: {
        color: COLORS.WHITE,
        fontSize: 42,
        fontWeight: 'bold',
        marginBottom: SPACING.SMALL,
        letterSpacing: -1
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    cardFooterText: {
        color: '#4ADE80', // Green 400
        fontSize: 12,
        fontWeight: '600',
    },
    feedContainer: {
        flex: 1,
        backgroundColor: '#0F172A',
        paddingHorizontal: SPACING.MEDIUM,
    },
    feedHeader: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.SMALL,
        letterSpacing: 0.5
    },
    listContent: {
        paddingBottom: 100,
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.4)', // Slate 800 transparent
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    transactionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(252, 211, 77, 0.1)', // Amber with opacity
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        borderWidth: 1,
        borderColor: 'rgba(252, 211, 77, 0.2)', // Amber border
    },
    bankTag: {
        color: '#FCD34D', // Amber 300
        fontWeight: 'bold',
        fontSize: 18
    },
    transactionContent: {
        flex: 1,
    },
    transactionTitle: {
        color: '#E2E8F0', // Slate 200
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2
    },
    transactionDate: {
        color: '#64748B', // Slate 500
        fontSize: 12,
    },
    transactionAmount: {
        fontSize: 16,
        fontWeight: '700',
    },
});

export default HomeScreen;
