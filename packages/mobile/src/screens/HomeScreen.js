import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
// import { Ionicons } from '@expo/vector-icons'; // Assuming icons available

// Mock Data matching the structure (Fallback)
const MOCK_TRANSACTIONS = [
    { id: '1', description: 'Uber Trip', amount: -24.50, date: 'Today', bank: 'RBC' },
    { id: '2', description: 'Starbucks', amount: -6.75, date: 'Today', bank: 'TD' },
    { id: '3', description: 'Payroll Deposit', amount: 3200.00, date: 'Yesterday', bank: 'CIBC' },
    { id: '4', description: 'Amazon.ca', amount: -154.20, date: 'Yesterday', bank: 'RBC' },
    { id: '5', description: 'Hydro Bill', amount: -120.00, date: 'Dec 22', bank: 'TD' },
];

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
                    // Calculate total mock cash
                    const total = data.data.reduce((acc, curr) => acc + curr.amount, 10000); // Start with base
                    setTransactions(data.data);
                    setTotalCash(total);
                } else {
                    setTransactions(MOCK_TRANSACTIONS);
                    setTotalCash(12450.00);
                }
            } catch (error) {
                console.log('Error fetching transactions, using mock:', error);
                setTransactions(MOCK_TRANSACTIONS);
                setTotalCash(12450.00);
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
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? 25 : 0,
    },
    header: {
        padding: SPACING.MEDIUM,
    },
    greeting: {
        color: COLORS.GOLD,
        fontSize: 18,
        fontWeight: '600',
    },
    subtitle: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
    },
    card: {
        backgroundColor: COLORS.CARD_BG,
        margin: SPACING.MEDIUM,
        padding: SPACING.LARGE,
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.GOLD,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    cardLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        letterSpacing: 1.5,
        marginBottom: SPACING.SMALL,
        textTransform: 'uppercase',
    },
    cardAmount: {
        color: COLORS.WHITE,
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: SPACING.SMALL,
    },
    cardFooterText: {
        color: '#4CAF50',
        fontSize: 12,
    },
    feedContainer: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingHorizontal: SPACING.MEDIUM,
    },
    feedHeader: {
        color: COLORS.TEXT_PRIMARY,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: SPACING.MEDIUM,
        marginTop: SPACING.SMALL,
    },
    listContent: {
        paddingBottom: SPACING.LARGE,
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG, // Or transparent depending on design
        padding: SPACING.MEDIUM,
        borderRadius: 12,
        marginBottom: SPACING.SMALL,
    },
    transactionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.GOLD,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.MEDIUM,
    },
    bankTag: {
        color: COLORS.NAVY,
        fontWeight: 'bold',
    },
    transactionContent: {
        flex: 1,
    },
    transactionTitle: {
        color: COLORS.WHITE,
        fontSize: 16,
        fontWeight: '500',
    },
    transactionDate: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 4,
    },
    transactionAmount: {
        fontSize: 16,
        fontWeight: '600',
    },
});

export default HomeScreen;
