import React, { useEffect, useState, useCallback } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

const CATEGORIES = [
    { id: 'all', name: 'All', icon: null },
    { id: 'streaming', name: 'Streaming', icon: 'tv' },
    { id: 'utilities', name: 'Utilities', icon: 'flash' },
    { id: 'other', name: 'Other', icon: 'construct' },
];

const WatchdogScreen = () => {
    const [expenses, setExpenses] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [flagsFound, setFlagsFound] = useState(0);
    const [potentialSavings, setPotentialSavings] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getWatchdogAnalysis();

            if (data?.success) {
                setExpenses(data.expenses || []);
                setPotentialSavings(data.analysis?.potential_savings || 0);
                setFlagsFound(data.analysis?.flags_found || 0);
            }
        } catch (err) {
            console.error('Error fetching watchdog data:', err);
            setError('Failed to load data. Pull to refresh.');
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

    const handleAction = async (expenseId, action) => {
        try {
            await api.handleExpenseAction(expenseId, action);
            // Refresh data after action
            fetchData();
        } catch (err) {
            console.error('Error processing action:', err);
        }
    };

    const filteredExpenses = selectedCategory === 'all'
        ? expenses
        : expenses.filter(e => e.category.toLowerCase().includes(selectedCategory));

    const renderExpenseItem = (item) => {
        const getActionButton = () => {
            switch (item.action) {
                case 'negotiate':
                    return (
                        <TouchableOpacity
                            style={styles.negotiateButton}
                            onPress={() => handleAction(item.id, 'negotiate')}
                        >
                            <Text style={styles.negotiateText}>Negotiate</Text>
                        </TouchableOpacity>
                    );
                case 'stop':
                    return (
                        <TouchableOpacity
                            style={styles.stopButton}
                            onPress={() => handleAction(item.id, 'stop')}
                        >
                            <Ionicons name="close-circle" size={14} color="#EF4444" />
                            <Text style={styles.stopText}>Stop</Text>
                        </TouchableOpacity>
                    );
                case 'active':
                    return (
                        <View style={styles.activeButton}>
                            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                            <Text style={styles.activeText}>Active</Text>
                        </View>
                    );
                default:
                    return null;
            }
        };

        const renderLogo = () => {
            const initial = item.name.charAt(0).toUpperCase();
            const bgColor = item.logoColor ? `${item.logoColor}20` : COLORS.CARD_BORDER;

            if (item.category === 'Music') {
                return (
                    <View style={[styles.expenseLogo, { backgroundColor: '#191414' }]}>
                        <Ionicons name="musical-notes" size={20} color="#1DB954" />
                    </View>
                );
            }
            return (
                <View style={[styles.expenseLogo, { backgroundColor: bgColor }]}>
                    <Text style={[styles.logoText, { color: item.logoColor || COLORS.WHITE }]}>
                        {initial}
                    </Text>
                </View>
            );
        };

        return (
            <View key={item.id} style={styles.expenseItem}>
                {renderLogo()}
                <View style={styles.expenseContent}>
                    <View style={styles.expenseRow}>
                        <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.expenseRow}>
                        <Text style={styles.expenseDetails}>Due {item.dueDate} • {item.category}</Text>
                        {getActionButton()}
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={COLORS.GOLD} />
                <Text style={styles.loadingText}>Analyzing your expenses...</Text>
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
                <Text style={styles.headerTitle}>Watchdog</Text>
                <TouchableOpacity style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={24} color={COLORS.WHITE} />
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
                {/* Savings Card */}
                <View style={styles.savingsCard}>
                    <View style={styles.savingsCardGlow} />
                    <View style={styles.savingsCardContent}>
                        <View style={styles.piggyContainer}>
                            <View style={styles.piggyIcon}>
                                <MaterialCommunityIcons name="piggy-bank" size={28} color={COLORS.GOLD} />
                            </View>
                            <View style={styles.flagsBadge}>
                                <Text style={styles.flagsText}>{flagsFound} Flags Found</Text>
                            </View>
                        </View>

                        <Text style={styles.savingsLabel}>POTENTIAL MONTHLY SAVINGS</Text>
                        <Text style={styles.savingsAmount}>${potentialSavings.toFixed(2)}</Text>

                        <View style={styles.infoRow}>
                            <Ionicons name="information-circle-outline" size={14} color={COLORS.TEXT_SECONDARY} />
                            <Text style={styles.infoText}>Based on your recurring expense analysis</Text>
                        </View>
                    </View>
                </View>

                {/* Category Filters */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryFilters}
                    contentContainerStyle={styles.categoryFiltersContent}
                >
                    {CATEGORIES.map((category) => (
                        <TouchableOpacity
                            key={category.id}
                            style={[
                                styles.categoryTab,
                                selectedCategory === category.id && styles.categoryTabActive
                            ]}
                            onPress={() => setSelectedCategory(category.id)}
                        >
                            {category.icon && (
                                <Ionicons
                                    name={category.icon}
                                    size={16}
                                    color={selectedCategory === category.id ? COLORS.WHITE : COLORS.TEXT_SECONDARY}
                                    style={styles.categoryIcon}
                                />
                            )}
                            <Text style={[
                                styles.categoryTabText,
                                selectedCategory === category.id && styles.categoryTabTextActive
                            ]}>
                                {category.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Recurring Expenses */}
                <View style={styles.expensesSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recurring Expenses</Text>
                        <TouchableOpacity>
                            <Text style={styles.viewAllText}>View all</Text>
                        </TouchableOpacity>
                    </View>

                    {filteredExpenses.map(item => renderExpenseItem(item))}

                    {filteredExpenses.length === 0 && !error && (
                        <View style={styles.emptyState}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.GREEN} />
                            <Text style={styles.emptyText}>No flagged expenses in this category</Text>
                        </View>
                    )}
                </View>
            </ScrollView>
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
        paddingBottom: 100,
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
    settingsButton: {
        padding: SPACING.SMALL,
    },

    // Savings Card
    savingsCard: {
        margin: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.XL,
        backgroundColor: COLORS.CARD_BG,
        overflow: 'hidden',
        position: 'relative',
    },
    savingsCardGlow: {
        position: 'absolute',
        top: -50,
        right: -50,
        width: 150,
        height: 150,
        backgroundColor: COLORS.GOLD,
        opacity: 0.1,
        borderRadius: 75,
    },
    savingsCardContent: {
        padding: SPACING.LARGE,
    },
    piggyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    piggyIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    flagsBadge: {
        marginLeft: 'auto',
        backgroundColor: '#0D9488',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        borderRadius: BORDER_RADIUS.LARGE,
    },
    flagsText: {
        color: COLORS.WHITE,
        fontSize: 12,
        fontWeight: '600',
    },
    savingsLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 11,
        letterSpacing: 1,
        marginBottom: SPACING.SMALL,
    },
    savingsAmount: {
        color: '#4ADE80',
        fontSize: 42,
        fontWeight: 'bold',
        marginBottom: SPACING.SMALL,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginLeft: SPACING.TINY,
    },

    // Category Filters
    categoryFilters: {
        marginBottom: SPACING.MEDIUM,
    },
    categoryFiltersContent: {
        paddingHorizontal: SPACING.MEDIUM,
        gap: SPACING.SMALL,
    },
    categoryTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.XL,
        backgroundColor: COLORS.CARD_BG,
        marginRight: SPACING.SMALL,
    },
    categoryTabActive: {
        backgroundColor: '#2563EB',
    },
    categoryIcon: {
        marginRight: SPACING.TINY,
    },
    categoryTabText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
    },
    categoryTabTextActive: {
        color: COLORS.WHITE,
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

    // Expenses Section
    expensesSection: {
        paddingHorizontal: SPACING.MEDIUM,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    sectionTitle: {
        color: COLORS.WHITE,
        fontSize: 18,
        fontWeight: '600',
    },
    viewAllText: {
        color: '#3B82F6',
        fontSize: 14,
    },

    // Expense Item
    expenseItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CARD_BG,
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        marginBottom: SPACING.SMALL,
    },
    expenseLogo: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    logoText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    expenseContent: {
        flex: 1,
    },
    expenseRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    expenseName: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
    },
    expenseAmount: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
    },
    expenseDetails: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },

    // Action Buttons
    negotiateButton: {
        backgroundColor: '#2563EB',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    negotiateText: {
        color: COLORS.WHITE,
        fontSize: 12,
        fontWeight: '600',
    },
    stopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EF4444',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
    },
    stopText: {
        color: '#EF4444',
        fontSize: 12,
        marginLeft: 4,
    },
    activeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
    },
    activeText: {
        color: '#4CAF50',
        fontSize: 12,
        marginLeft: 4,
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
});

export default WatchdogScreen;
