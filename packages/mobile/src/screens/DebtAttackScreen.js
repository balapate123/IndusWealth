import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Platform,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    KeyboardAvoidingView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { create, open } from '../services/plaidLink';
import Svg, { Path, Circle } from 'react-native-svg';
import { RADIUS, SPACING, alpha } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    BottomSheet,
    Card,
    Text,
    Button,
    Input,
    Chip,
    ChipRow,
    SegmentedControl,
    SectionTitle,
    Overline,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

// Default APR by debt type
const DEFAULT_APRS = {
    credit_card: 22.00,
    line_of_credit: 11.00,
    personal_loan: 10.00,
    student_loan: 6.00,
    other: 15.00
};

const DEBT_TYPES = [
    { key: 'credit_card', label: 'Credit Card', icon: 'card' },
    { key: 'line_of_credit', label: 'Line of Credit', icon: 'trending-up' },
    { key: 'personal_loan', label: 'Personal Loan', icon: 'cash' },
    { key: 'student_loan', label: 'Student Loan', icon: 'school' },
    { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const STRATEGY_OPTIONS = [
    { label: 'Snowball', value: 'snowball' },
    { label: 'Avalanche', value: 'avalanche' },
];

const makeStyles = (t) => StyleSheet.create({
    scrollContent: { paddingBottom: 120 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SMALL },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Banners
    banner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SMALL + 2 },
    bannerBody: { flex: 1 },

    // Results
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    soonerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: t.SUCCESS_DIM,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: RADIUS.SMALL,
        marginTop: SPACING.SMALL,
    },
    divider: {
        height: 1,
        backgroundColor: t.HAIRLINE,
        marginVertical: SPACING.MEDIUM,
    },
    interestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    trophy: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.ACCENT_DIM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calculatingOverlay: {
        position: 'absolute',
        top: SPACING.MEDIUM,
        right: SPACING.MEDIUM,
    },

    // Slider
    paymentRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
        marginTop: 2,
    },
    customButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: RADIUS.SMALL,
    },
    slider: { width: '100%', height: 40, marginTop: SPACING.SMALL },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },

    // Trend chart
    chartContainer: { marginVertical: SPACING.SMALL },
    legendRow: { flexDirection: 'row', gap: SPACING.MEDIUM, marginTop: SPACING.SMALL },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    trendSavings: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        backgroundColor: t.ACCENT_DIM,
        padding: SPACING.MEDIUM - 4,
        borderRadius: RADIUS.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },

    // Debt rows
    debtRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: SPACING.SMALL + 4,
    },
    debtDivider: { borderTopWidth: 1, borderTopColor: t.HAIRLINE },
    rank: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },
    debtBody: { flex: 1 },
    debtNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    manualBadge: {
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: RADIUS.SMALL / 2,
    },
    debtRight: { alignItems: 'flex-end' },

    // Form
    inputRow: { flexDirection: 'row', gap: SPACING.MEDIUM },
    inputHalf: { flex: 1 },
    formActions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.SMALL },

    // Centred dialogs
    dialogOverlay: {
        flex: 1,
        backgroundColor: t.SCRIM,
        justifyContent: 'center',
        paddingHorizontal: SPACING.LARGE,
    },
    dialog: {
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.CARD,
        padding: SPACING.LARGE,
        ...t.ELEVATION.SHEET,
    },
    dialogIcon: { alignItems: 'center', marginBottom: SPACING.MEDIUM },
    dialogActions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.LARGE },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginTop: SPACING.MEDIUM,
    },

    // Import list
    importRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
        paddingVertical: SPACING.SMALL + 4,
    },
    importIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.ACCENT_DIM,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const DebtAttackScreen = () => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [extraPayment, setExtraPayment] = useState(0);
    const [strategy, setStrategy] = useState('snowball');
    const [debts, setDebts] = useState([]);
    const [customDebts, setCustomDebts] = useState([]);
    const [rawLiabilities, setRawLiabilities] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [plaidStatus, setPlaidStatus] = useState('unknown');
    const [reAuthLoading, setReAuthLoading] = useState(false);

    // Modal states
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingDebt, setEditingDebt] = useState(null);
    const [reAuthModalVisible, setReAuthModalVisible] = useState(false);
    const [importModalVisible, setImportModalVisible] = useState(false);
    const [linkedAccounts, setLinkedAccounts] = useState([]);
    const [customPaymentModalVisible, setCustomPaymentModalVisible] = useState(false);
    const [customPaymentValue, setCustomPaymentValue] = useState('');

    // Custom Alert state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', message: '', buttons: [] });

    // Form states
    const [formName, setFormName] = useState('');
    const [formBalance, setFormBalance] = useState('');
    const [formApr, setFormApr] = useState('');
    const [formMinPayment, setFormMinPayment] = useState('');
    const [formDebtType, setFormDebtType] = useState('credit_card');
    const [formSubmitting, setFormSubmitting] = useState(false);

    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({
            title,
            message,
            buttons: buttons.length > 0 ? buttons : [{ text: 'OK', onPress: () => setAlertVisible(false) }]
        });
        setAlertVisible(true);
    };

    const fetchData = useCallback(async () => {
        try {
            setError(null);

            const [data, accountsData] = await Promise.all([
                api.getDebtOverview(),
                api.getAccounts()
            ]);

            if (data?.success) {
                setAnalysis(data.analysis);
                setRawLiabilities(data.raw_liabilities);
                setCustomDebts(data.custom_debts || []);
                setPlaidStatus(data.plaid_status || 'unknown');
                setDebts(data.analysis?.debts || []);
            } else {
                setError('Failed to load debt data.');
            }

            if (accountsData?.success && accountsData?.accounts) {
                const creditAccounts = accountsData.accounts.filter((acc) =>
                    acc.type === 'credit' || acc.subtype === 'credit card' || acc.type === 'loan'
                );
                setLinkedAccounts(creditAccounts);
            }
        } catch (err) {
            console.error('Error fetching debt data:', err);
            setError('Unable to connect. Pull to refresh.');
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

    const handleSliderChange = async (value) => {
        setExtraPayment(value);

        setCalculating(true);
        try {
            const data = await api.calculateDebt(value, rawLiabilities, customDebts);
            if (data?.success) {
                setAnalysis(data.analysis);
                if (data.analysis?.debts) {
                    setDebts(data.analysis.debts);
                }
            }
        } catch (err) {
            console.error('Error calculating debt:', err);
        } finally {
            setCalculating(false);
        }
    };

    const openAddModal = () => {
        setFormName('');
        setFormBalance('');
        setFormApr(DEFAULT_APRS.credit_card.toString());
        setFormMinPayment('');
        setFormDebtType('credit_card');
        setAddModalVisible(true);
    };

    const openEditModal = (debt) => {
        const numericId = debt.id.replace('custom_', '');
        setEditingDebt({ ...debt, numericId });
        setFormName(debt.name);
        setFormBalance(debt.balance.toString());
        setFormApr(debt.apr.toString());
        setFormMinPayment(debt.min_payment?.toString() || '');
        setFormDebtType(debt.debt_type || 'other');
        setEditModalVisible(true);
    };

    const handleDebtTypeChange = (type) => {
        setFormDebtType(type);
        // Only update APR if it's still set to a default value
        const currentApr = parseFloat(formApr);
        const isDefaultApr = Object.values(DEFAULT_APRS).includes(currentApr);
        if (isDefaultApr || !formApr) {
            setFormApr(DEFAULT_APRS[type].toString());
        }
    };

    const handleAddDebt = async () => {
        if (!formName.trim() || !formBalance) {
            showAlert('Error', 'Please enter a name and balance');
            return;
        }

        setFormSubmitting(true);
        try {
            const result = await api.addCustomDebt({
                name: formName.trim(),
                balance: parseFloat(formBalance),
                apr: parseFloat(formApr) || DEFAULT_APRS[formDebtType],
                min_payment: parseFloat(formMinPayment) || 0,
                debt_type: formDebtType,
            });
            if (result?.success) {
                setAddModalVisible(false);
                fetchData();
            } else {
                showAlert('Error', result?.message || 'Failed to add debt');
            }
        } catch (err) {
            showAlert('Error', 'Failed to add debt. Please try again');
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleUpdateDebt = async () => {
        if (!formName.trim() || !formBalance) {
            showAlert('Error', 'Please enter a name and balance');
            return;
        }

        setFormSubmitting(true);
        try {
            const result = await api.updateCustomDebt(editingDebt.numericId, {
                name: formName.trim(),
                balance: parseFloat(formBalance),
                apr: parseFloat(formApr),
                min_payment: parseFloat(formMinPayment) || 0,
                debt_type: formDebtType,
            });
            if (result?.success) {
                setEditModalVisible(false);
                fetchData();
            } else {
                showAlert('Error', result?.message || 'Failed to update debt');
            }
        } catch (err) {
            showAlert('Error', 'Failed to update debt. Please try again');
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleDeleteDebt = () => {
        showAlert(
            'Delete debt',
            `Are you sure you want to delete "${editingDebt?.name}"?`,
            [
                { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setAlertVisible(false);
                        try {
                            const result = await api.deleteCustomDebt(editingDebt.numericId);
                            if (result?.success) {
                                setEditModalVisible(false);
                                fetchData();
                            }
                        } catch (err) {
                            showAlert('Error', 'Failed to delete debt');
                        }
                    },
                },
            ]
        );
    };

    const handleReAuthenticate = async () => {
        setReAuthLoading(true);
        try {
            console.log('🔄 Getting update mode link token...');
            const result = await api.createUpdateLinkToken();

            if (!result?.link_token) {
                console.error('Failed to get update link token');
                setReAuthModalVisible(true);
                return;
            }

            console.log('✅ Got update link token, opening Plaid Link...');
            await create({ token: result.link_token });

            await open({
                onSuccess: async () => {
                    console.log('🎉 Plaid Link update success!');
                    fetchData();
                    setReAuthLoading(false);
                },
                onExit: (exit) => {
                    console.log('📤 Plaid Link exited:', exit?.error?.displayMessage || 'User cancelled');
                    if (exit?.error) {
                        setReAuthModalVisible(true);
                    }
                    setReAuthLoading(false);
                },
            });
        } catch (err) {
            console.error('Re-auth error:', err);
            setReAuthModalVisible(true);
            setReAuthLoading(false);
        }
    };

    const handleImportAccount = async (account) => {
        setFormSubmitting(true);
        try {
            const debt = {
                name: account.alias || account.name || account.officialName || 'Credit Card',
                balance: Math.abs(account.balance || 0),
                apr: DEFAULT_APRS.credit_card,
                min_payment: Math.abs(account.balance || 0) * 0.02, // Estimate 2% minimum payment
                debt_type: 'credit_card',
            };

            console.log('📥 Importing account as debt:', debt);
            const result = await api.addCustomDebt(debt);

            if (result?.success) {
                setImportModalVisible(false);
                fetchData();
            } else {
                console.error('Failed to import account:', result?.message);
            }
        } catch (err) {
            console.error('Error importing account:', err);
        } finally {
            setFormSubmitting(false);
        }
    };

    const getStrategyData = () => {
        if (!analysis?.strategies) {
            return { debtFreeDate: 'N/A', monthsSooner: 0, interestSaved: 0 };
        }

        const strategyData = strategy === 'snowball'
            ? analysis.strategies.snowball
            : analysis.strategies.avalanche;

        const payoffDate = strategyData?.payoff_date
            ? new Date(`${strategyData.payoff_date}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : 'N/A';

        const interestSavedKey = strategy === 'snowball' ? 'interest_saved_snowball' : 'interest_saved_avalanche';
        const monthsSavedKey = strategy === 'snowball' ? 'months_saved_snowball' : 'months_saved_avalanche';

        return {
            debtFreeDate: payoffDate,
            monthsSooner: analysis.savings?.[monthsSavedKey] || 0,
            interestSaved: analysis.savings?.[interestSavedKey] || 0,
        };
    };

    const { debtFreeDate, monthsSooner, interestSaved } = getStrategyData();
    const totalMinPayment = analysis?.total_min_payment || 0;
    const totalPayment = totalMinPayment + extraPayment;

    const renderDebtItem = (item, index) => {
        const isCustom = item.is_custom;
        const payoffText = item.solo_payoff_months === 999
            ? 'Never (at min)'
            : `${item.solo_payoff_months} mo`;

        return (
            <TouchableOpacity
                key={item.id}
                style={[styles.debtRow, index > 0 && styles.debtDivider]}
                onPress={() => isCustom && openEditModal(item)}
                activeOpacity={isCustom ? 0.7 : 1}
            >
                <View style={styles.rank}>
                    <Text variant="label" tone="accent">{index + 1}</Text>
                </View>

                <View style={styles.debtBody}>
                    <View style={styles.debtNameRow}>
                        <Text variant="bodyMed" numberOfLines={1}>{item.name}</Text>
                        {isCustom && (
                            <View style={styles.manualBadge}>
                                <Text variant="meta" tone="muted">Manual</Text>
                            </View>
                        )}
                    </View>
                    <Text variant="meta" tone="muted">{item.apr.toFixed(1)}% APR</Text>
                </View>

                <View style={styles.debtRight}>
                    <Text variant="num">${item.balance.toLocaleString()}</Text>
                    <Text variant="meta" tone="muted">Payoff: {payoffText}</Text>
                </View>

                {isCustom && <Ionicons name="chevron-forward" size={16} color={theme.TEXT_MUTED} />}
            </TouchableOpacity>
        );
    };

    const renderFormSheet = (isEdit) => (
        <BottomSheet
            visible={isEdit ? editModalVisible : addModalVisible}
            onClose={() => (isEdit ? setEditModalVisible(false) : setAddModalVisible(false))}
        >
            <SectionTitle
                title={isEdit ? 'Edit debt' : 'Add new debt'}
                right={
                    <TouchableOpacity
                        onPress={() => (isEdit ? setEditModalVisible(false) : setAddModalVisible(false))}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    >
                        <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                }
            />

            <Overline inset={false}>Debt type</Overline>
            <ChipRow
                style={{ marginBottom: SPACING.MEDIUM }}
                contentContainerStyle={{ paddingHorizontal: 0 }}
            >
                {DEBT_TYPES.map((type) => (
                    <Chip
                        key={type.key}
                        label={type.label}
                        icon={type.icon}
                        active={formDebtType === type.key}
                        onPress={() => handleDebtTypeChange(type.key)}
                    />
                ))}
            </ChipRow>

            <Input
                label="Name"
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Chase Sapphire"
            />

            <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                    <Input
                        label="Balance ($)"
                        value={formBalance}
                        onChangeText={setFormBalance}
                        placeholder="5000"
                        keyboardType="numeric"
                    />
                </View>
                <View style={styles.inputHalf}>
                    <Input
                        label="APR (%)"
                        value={formApr}
                        onChangeText={setFormApr}
                        placeholder="22.0"
                        keyboardType="numeric"
                    />
                </View>
            </View>

            <Input
                label="Min payment ($/mo) — optional"
                value={formMinPayment}
                onChangeText={setFormMinPayment}
                placeholder="Auto-calculated if empty"
                keyboardType="numeric"
            />

            <View style={styles.formActions}>
                {isEdit && (
                    <Button
                        title="Delete"
                        icon="trash"
                        variant="danger"
                        onPress={handleDeleteDebt}
                        style={{ flex: 1 }}
                    />
                )}
                <Button
                    title={isEdit ? 'Update' : 'Add debt'}
                    icon="checkmark"
                    onPress={isEdit ? handleUpdateDebt : handleAddDebt}
                    loading={formSubmitting}
                    style={{ flex: 1 }}
                />
            </View>
        </BottomSheet>
    );

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading your debt plan..." />
            </Screen>
        );
    }

    const header = (
        <ScreenHeader
            title="Debt Attack Plan"
            right={
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => setImportModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Import account as debt"
                    >
                        <Ionicons name="download-outline" size={19} color={theme.TEXT_SECONDARY} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={openAddModal}
                        accessibilityRole="button"
                        accessibilityLabel="Add debt"
                    >
                        <Ionicons name="add" size={22} color={theme.ACCENT} />
                    </TouchableOpacity>
                </View>
            }
        />
    );

    return (
        <>
            <Screen
                scroll
                header={header}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
            >
                {error && (
                    <Card style={{ backgroundColor: theme.DANGER_DIM, borderColor: theme.DANGER_DIM }}>
                        <View style={styles.banner}>
                            <Ionicons name="warning" size={20} color={theme.DANGER} />
                            <Text variant="body" tone="danger" style={styles.bannerBody}>{error}</Text>
                        </View>
                    </Card>
                )}

                {plaidStatus === 'login_required' && (
                    <Card
                        onPress={reAuthLoading ? undefined : handleReAuthenticate}
                        style={{ backgroundColor: theme.WARNING_DIM, borderColor: theme.WARNING_DIM }}
                    >
                        <View style={styles.banner}>
                            <Ionicons name="alert-circle" size={24} color={theme.WARNING} />
                            <View style={styles.bannerBody}>
                                <Text variant="bodyMed">Bank connection expired</Text>
                                <Text variant="meta" tone="secondary">
                                    Tap to re-authenticate and sync your credit accounts
                                </Text>
                            </View>
                            {reAuthLoading
                                ? <ActivityIndicator size="small" color={theme.WARNING} />
                                : <Ionicons name="chevron-forward" size={20} color={theme.WARNING} />}
                        </View>
                    </Card>
                )}

                {/* Headline result */}
                <Card>
                    <View style={styles.labelRow}>
                        <Ionicons name="calendar" size={14} color={theme.SUCCESS} />
                        <Text variant="overline" tone="muted">Debt-free date</Text>
                    </View>
                    <Text variant="hero">{debtFreeDate}</Text>
                    {monthsSooner > 0 && (
                        <View style={styles.soonerBadge}>
                            <Ionicons name="trending-down" size={13} color={theme.SUCCESS} />
                            <Text variant="meta" tone="success">{monthsSooner} months sooner</Text>
                        </View>
                    )}

                    <View style={styles.divider} />

                    <Text variant="overline" tone="muted">Interest saved</Text>
                    <View style={styles.interestRow}>
                        <Text variant="hero" tone="success">${interestSaved.toLocaleString()}</Text>
                        <View style={styles.trophy}>
                            <MaterialCommunityIcons name="trophy" size={26} color={theme.ACCENT} />
                        </View>
                    </View>

                    {calculating && (
                        <View style={styles.calculatingOverlay}>
                            <ActivityIndicator size="small" color={theme.ACCENT} />
                        </View>
                    )}
                </Card>

                {/* Extra payment */}
                <Card>
                    <Text variant="overline" tone="muted">Extra monthly payment</Text>
                    <View style={styles.paymentRow}>
                        <Text variant="h1">+${extraPayment}</Text>
                        <Text variant="body" tone="muted">/mo</Text>
                        <TouchableOpacity
                            style={styles.customButton}
                            onPress={() => {
                                setCustomPaymentValue(extraPayment.toString());
                                setCustomPaymentModalVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Enter a custom amount"
                        >
                            <Ionicons name="pencil" size={13} color={theme.ACCENT} />
                            <Text variant="meta" tone="accent">Custom</Text>
                        </TouchableOpacity>
                    </View>
                    <Text variant="meta" tone="muted">
                        Total: ${Math.round(totalPayment)}/mo including minimums
                    </Text>

                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={5000}
                        step={100}
                        value={extraPayment > 5000 ? 5000 : extraPayment}
                        onSlidingComplete={handleSliderChange}
                        onValueChange={setExtraPayment}
                        minimumTrackTintColor={theme.ACCENT}
                        maximumTrackTintColor={theme.SURFACE_SUNKEN}
                        thumbTintColor={theme.ACCENT}
                    />
                    <View style={styles.sliderLabels}>
                        <Text variant="meta" tone="muted">+$0</Text>
                        <Text variant="meta" tone="muted">+$5,000</Text>
                    </View>
                </Card>

                {/* Payoff comparison — illustrative shape, see note below */}
                {analysis && debts.length > 0 && (
                    <Card>
                        <SectionTitle
                            title="Payment comparison"
                            subtitle="Illustrative shape of minimum-only versus extra payments"
                        />
                        <View style={styles.chartContainer}>
                            <Svg width="100%" height={160} viewBox="0 0 320 160">
                                <Path
                                    d="M 20 30 Q 80 35, 140 50 Q 200 70, 260 100 Q 290 120, 300 140"
                                    stroke={theme.DANGER}
                                    strokeWidth={2.5}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <Path
                                    d="M 20 30 Q 60 45, 100 80 Q 140 110, 180 130 Q 200 140, 220 140"
                                    stroke={theme.SUCCESS}
                                    strokeWidth={2.5}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <Circle cx={300} cy={140} r={4} fill={theme.DANGER} />
                                <Circle cx={220} cy={140} r={4} fill={theme.SUCCESS} />
                            </Svg>
                        </View>
                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: theme.DANGER }]} />
                                <Text variant="meta" tone="secondary">Minimum only</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: theme.SUCCESS }]} />
                                <Text variant="meta" tone="secondary">With +${extraPayment}/mo</Text>
                            </View>
                        </View>
                        {monthsSooner > 0 && (
                            <View style={styles.trendSavings}>
                                <Ionicons name="flash" size={16} color={theme.ACCENT} />
                                <Text variant="meta" tone="secondary" style={{ flex: 1 }}>
                                    Pay off {monthsSooner} months faster and save $
                                    {interestSaved.toLocaleString()} in interest
                                </Text>
                            </View>
                        )}
                    </Card>
                )}

                {/* Strategy */}
                <Card>
                    <SectionTitle title="Strategy" />
                    <SegmentedControl
                        options={STRATEGY_OPTIONS}
                        value={strategy}
                        onChange={setStrategy}
                        inset={false}
                        style={{ marginBottom: SPACING.MEDIUM }}
                    />
                    <Text variant="meta" tone="secondary">
                        <Text variant="meta" tone="primary">
                            {strategy === 'snowball' ? 'Snowball method: ' : 'Avalanche method: '}
                        </Text>
                        {strategy === 'snowball'
                            ? 'you pay off the smallest debts first to build momentum.'
                            : 'you pay off highest interest debts first to save money.'}
                    </Text>
                </Card>

                {/* Debts */}
                <Overline
                    right={
                        <Text variant="label" tone="secondary">
                            Total: ${(analysis?.total_debt || 0).toLocaleString()}
                        </Text>
                    }
                >
                    Your debts
                </Overline>

                {debts.length > 0 ? (
                    <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                        {debts.map((debt, index) => renderDebtItem(debt, index))}
                    </Card>
                ) : (
                    <Card>
                        <EmptyState
                            icon="add-circle-outline"
                            title="No debts added yet"
                            message="Add a debt manually or import a linked credit account."
                            actionLabel="Add your first debt"
                            onAction={openAddModal}
                        />
                    </Card>
                )}
            </Screen>

            {renderFormSheet(false)}
            {renderFormSheet(true)}

            {/* Re-authentication failed */}
            <Modal
                visible={reAuthModalVisible}
                animationType="fade"
                transparent
                statusBarTranslucent
                presentationStyle="overFullScreen"
                onRequestClose={() => setReAuthModalVisible(false)}
            >
                <View style={styles.dialogOverlay}>
                    <View style={styles.dialog}>
                        <View style={styles.dialogIcon}>
                            <Ionicons name="alert-circle" size={44} color={theme.WARNING} />
                        </View>
                        <Text variant="h2" style={{ textAlign: 'center' }}>Re-authentication failed</Text>
                        <Text variant="body" tone="secondary" style={{ textAlign: 'center', marginTop: SPACING.SMALL }}>
                            We couldn't refresh your bank connection. Try again, or go to Profile to
                            re-link your account.
                        </Text>
                        <View style={styles.dialogActions}>
                            <Button
                                title="Cancel"
                                variant="secondary"
                                onPress={() => setReAuthModalVisible(false)}
                                style={{ flex: 1 }}
                            />
                            <Button
                                title="Try again"
                                onPress={() => {
                                    setReAuthModalVisible(false);
                                    handleReAuthenticate();
                                }}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Import a linked account */}
            <BottomSheet visible={importModalVisible} onClose={() => setImportModalVisible(false)}>
                <SectionTitle
                    title="Import account as debt"
                    subtitle="Select a linked credit account to track as a debt"
                    right={
                        <TouchableOpacity
                            onPress={() => setImportModalVisible(false)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />

                {linkedAccounts.length > 0 ? (
                    linkedAccounts.map((account, index) => (
                        <TouchableOpacity
                            key={account.id || index}
                            style={[styles.importRow, index > 0 && styles.debtDivider]}
                            onPress={() => handleImportAccount(account)}
                            disabled={formSubmitting}
                            activeOpacity={0.7}
                        >
                            <View style={styles.importIcon}>
                                <Ionicons name="card" size={19} color={theme.ACCENT} />
                            </View>
                            <View style={styles.debtBody}>
                                <Text variant="bodyMed" numberOfLines={1}>
                                    {account.alias || account.name || account.officialName}
                                </Text>
                                <Text variant="meta" tone="muted">{account.subtype || account.type}</Text>
                            </View>
                            <Text variant="num">
                                ${Math.abs(account.balance || 0).toLocaleString()}
                            </Text>
                            {formSubmitting
                                ? <ActivityIndicator size="small" color={theme.ACCENT} />
                                : <Ionicons name="add-circle" size={22} color={theme.ACCENT} />}
                        </TouchableOpacity>
                    ))
                ) : (
                    <EmptyState
                        icon="card-outline"
                        title="No credit accounts found"
                        message="Link a bank with credit cards to import them as debts."
                    />
                )}
            </BottomSheet>

            {/* Custom extra payment */}
            <Modal
                visible={customPaymentModalVisible}
                animationType="fade"
                transparent
                statusBarTranslucent
                presentationStyle="overFullScreen"
                onRequestClose={() => setCustomPaymentModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.dialogOverlay}
                >
                    <View style={styles.dialog}>
                        <Text variant="h2">Custom extra payment</Text>
                        <Text variant="meta" tone="muted">Enter an amount above $5,000/month</Text>

                        <View style={styles.amountInputRow}>
                            <Text variant="h1" tone="muted">$</Text>
                            <View style={{ flex: 1 }}>
                                <Input
                                    value={customPaymentValue}
                                    onChangeText={setCustomPaymentValue}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    autoFocus
                                    style={{ marginBottom: 0 }}
                                />
                            </View>
                            <Text variant="body" tone="muted">/mo</Text>
                        </View>

                        <View style={styles.dialogActions}>
                            <Button
                                title="Cancel"
                                variant="secondary"
                                onPress={() => setCustomPaymentModalVisible(false)}
                                style={{ flex: 1 }}
                            />
                            <Button
                                title="Apply"
                                onPress={() => {
                                    const value = parseInt(customPaymentValue, 10) || 0;
                                    setExtraPayment(value);
                                    handleSliderChange(value);
                                    setCustomPaymentModalVisible(false);
                                }}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={() => setAlertVisible(false)}
            />
        </>
    );
};

export default DebtAttackScreen;
