import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Button,
    Chip,
    ChipRow,
    SegmentedControl,
    Overline,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import CancellationBottomSheet from '../components/CancellationBottomSheet';
import NegotiationBottomSheet from '../components/NegotiationBottomSheet';
import AlertBanner from '../components/AlertBanner';

const CATEGORIES = [
    { id: 'all', name: 'All', icon: 'apps' },
    { id: 'streaming', name: 'Streaming', icon: 'tv' },
    { id: 'music', name: 'Music', icon: 'musical-notes' },
    { id: 'telecom', name: 'Telecom', icon: 'call' },
    { id: 'utilities', name: 'Utilities', icon: 'flash' },
    { id: 'health', name: 'Health', icon: 'fitness' },
    { id: 'software', name: 'Software', icon: 'laptop' },
    { id: 'insurance', name: 'Insurance', icon: 'shield-checkmark' },
    { id: 'other', name: 'Other', icon: 'construct' },
];

const PERIOD_OPTIONS = [
    { label: 'Monthly', value: false },
    { label: 'Annual', value: true },
];

const makeStyles = (t) => StyleSheet.create({
    scrollContent: { paddingBottom: 110 },

    // Savings card
    savingsTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    piggyIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.ACCENT_DIM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flagsBadge: {
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: RADIUS.PILL,
    },
    savingsAmount: { marginTop: 2 },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: SPACING.SMALL,
    },

    // Expense rows
    expenseRow: {
        paddingVertical: SPACING.SMALL + 4,
    },
    expenseDivider: {
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    expenseTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 3,
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expenseBody: { flex: 1 },
    expenseNameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
    },
    expenseName: { flex: 1 },
    actions: {
        flexDirection: 'row',
        gap: SPACING.SMALL,
        marginTop: SPACING.SMALL + 2,
        marginLeft: 40 + SPACING.SMALL + 3,
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        backgroundColor: t.SUCCESS_DIM,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RADIUS.SMALL,
    },
});

const WatchdogScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [expenses, setExpenses] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [flagsFound, setFlagsFound] = useState(0);
    const [potentialSavings, setPotentialSavings] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [totalMonthly, setTotalMonthly] = useState(0);
    const [totalAnnual, setTotalAnnual] = useState(0);
    const [showAnnual, setShowAnnual] = useState(false);
    const [cancelSheet, setCancelSheet] = useState({ visible: false, expense: null, guide: null });
    const [negotiateSheet, setNegotiateSheet] = useState({ visible: false, expense: null, guide: null });

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getWatchdogAnalysis();

            if (data?.success) {
                setExpenses(data.expenses || []);
                setPotentialSavings(data.analysis?.potential_savings || 0);
                setFlagsFound(data.analysis?.flags_found || 0);
                setTotalMonthly(data.analysis?.total_monthly || 0);
                setTotalAnnual(data.analysis?.total_annual || 0);
                setAlerts(data.alerts || []);
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
            const result = await api.handleExpenseAction(expenseId, action);

            // If the action returned a guide, show the appropriate bottom sheet
            if (result?.success && result?.data?.guide) {
                const expense = expenses.find((e) => e.id === expenseId);
                if (action === 'stop') {
                    setCancelSheet({ visible: true, expense, guide: result.data.guide });
                } else if (action === 'negotiate') {
                    setNegotiateSheet({ visible: true, expense, guide: result.data.guide });
                }
            }

            fetchData();
        } catch (err) {
            console.error('Error processing action:', err);
        }
    };

    const filteredExpenses = selectedCategory === 'all'
        ? expenses
        : expenses.filter((e) => e.category.toLowerCase().includes(selectedCategory));

    const renderActions = (item) => {
        switch (item.action) {
            case 'negotiate':
                return (
                    <Button
                        title="Negotiate"
                        variant="secondary"
                        size="sm"
                        onPress={() => handleAction(item.id, 'negotiate')}
                    />
                );
            case 'stop':
                return (
                    <Button
                        title="Stop"
                        variant="danger"
                        size="sm"
                        icon="close-circle"
                        onPress={() => handleAction(item.id, 'stop')}
                    />
                );
            case 'active':
                return (
                    <View style={styles.statusChip}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.SUCCESS} />
                        <Text variant="label" tone="success">Active</Text>
                    </View>
                );
            default:
                return (
                    <>
                        <Button
                            title="Cancel"
                            variant="danger"
                            size="sm"
                            icon="close-circle"
                            onPress={() => handleAction(item.id, 'stop')}
                        />
                        <Button
                            title="Negotiate"
                            variant="secondary"
                            size="sm"
                            onPress={() => handleAction(item.id, 'negotiate')}
                        />
                    </>
                );
        }
    };

    const renderExpenseItem = (item, index) => {
        const initial = item.name.charAt(0).toUpperCase();
        // Merchant-supplied colour is data; otherwise fall back to the ramp so
        // every logo tile still reads as part of one system.
        const tint = item.logoColor || categoryColor(theme, index);

        return (
            <View key={item.id} style={[styles.expenseRow, index > 0 && styles.expenseDivider]}>
                <View style={styles.expenseTop}>
                    <View style={[styles.logo, { backgroundColor: alpha(tint, 0.16) }]}>
                        {item.category === 'Music' ? (
                            <Ionicons name="musical-notes" size={20} color={tint} />
                        ) : (
                            <Text variant="h2" color={tint}>{initial}</Text>
                        )}
                    </View>

                    <View style={styles.expenseBody}>
                        <View style={styles.expenseNameRow}>
                            <Text variant="bodyMed" style={styles.expenseName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text variant="num">${item.amount.toFixed(2)}</Text>
                        </View>
                        <Text variant="meta" tone="muted">
                            {item.dueDate ? `Due ${item.dueDate}` : item.frequency} · {item.category}
                            {item.confidence === 'high' ? ' ●' : item.confidence === 'medium' ? ' ○' : ''}
                        </Text>
                    </View>
                </View>

                <View style={styles.actions}>{renderActions(item)}</View>
            </View>
        );
    };

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Analyzing your expenses..." />
            </Screen>
        );
    }

    return (
        <>
            <Screen
                scroll
                header={
                    <ScreenHeader
                        title="Watchdog"
                        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
                    />
                }
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Savings overview */}
                <Card>
                    <View style={styles.savingsTop}>
                        <View style={styles.piggyIcon}>
                            <MaterialCommunityIcons name="piggy-bank" size={26} color={theme.ACCENT} />
                        </View>
                        <View style={styles.flagsBadge}>
                            <Text variant="label" tone="secondary">
                                {flagsFound} flag{flagsFound === 1 ? '' : 's'} found
                            </Text>
                        </View>
                    </View>

                    <SegmentedControl
                        options={PERIOD_OPTIONS}
                        value={showAnnual}
                        onChange={setShowAnnual}
                        inset={false}
                        style={{ marginBottom: SPACING.MEDIUM }}
                    />

                    <Text variant="overline" tone="muted">
                        {showAnnual ? 'Total annual subscriptions' : 'Potential monthly savings'}
                    </Text>
                    <Text variant="hero" style={styles.savingsAmount}>
                        ${showAnnual ? totalAnnual.toFixed(2) : potentialSavings.toFixed(2)}
                    </Text>

                    <View style={styles.infoRow}>
                        <Ionicons name="information-circle-outline" size={14} color={theme.TEXT_MUTED} />
                        <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                            {showAnnual
                                ? `$${totalMonthly.toFixed(2)}/month across all subscriptions`
                                : 'Based on your recurring expense analysis'}
                        </Text>
                    </View>
                </Card>

                {alerts.length > 0 && <AlertBanner alerts={alerts} />}

                <ChipRow style={{ marginBottom: SPACING.MEDIUM }}>
                    {CATEGORIES.map((category) => (
                        <Chip
                            key={category.id}
                            label={category.name}
                            icon={category.icon}
                            active={selectedCategory === category.id}
                            onPress={() => setSelectedCategory(category.id)}
                        />
                    ))}
                </ChipRow>

                {error && (
                    <Card style={{ backgroundColor: theme.DANGER_DIM, borderColor: theme.DANGER_DIM }}>
                        <Text variant="body" tone="danger">{error}</Text>
                    </Card>
                )}

                <Overline>Recurring expenses</Overline>

                {filteredExpenses.length > 0 ? (
                    <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                        {filteredExpenses.map((item, index) => renderExpenseItem(item, index))}
                    </Card>
                ) : !error ? (
                    <Card>
                        {expenses.length === 0 ? (
                            <EmptyState
                                icon="shield-outline"
                                title="Connect your bank to activate Watchdog"
                                message="We need at least 2 months of transaction history to detect recurring expenses."
                            />
                        ) : (
                            <EmptyState
                                icon="checkmark-circle-outline"
                                message="No flagged expenses in this category"
                            />
                        )}
                    </Card>
                ) : null}
            </Screen>

            <CancellationBottomSheet
                visible={cancelSheet.visible}
                expense={cancelSheet.expense}
                guide={cancelSheet.guide}
                onClose={() => setCancelSheet({ visible: false, expense: null, guide: null })}
                onConfirm={() => {
                    setCancelSheet({ visible: false, expense: null, guide: null });
                    fetchData();
                }}
            />
            <NegotiationBottomSheet
                visible={negotiateSheet.visible}
                expense={negotiateSheet.expense}
                guide={negotiateSheet.guide}
                onClose={() => setNegotiateSheet({ visible: false, expense: null, guide: null })}
                onNegotiated={() => {
                    setNegotiateSheet({ visible: false, expense: null, guide: null });
                    fetchData();
                }}
            />
        </>
    );
};

export default WatchdogScreen;
