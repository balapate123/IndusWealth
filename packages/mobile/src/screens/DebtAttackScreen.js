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
    Modal,
    TextInput,
    KeyboardAvoidingView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { create, open } from 'react-native-plaid-link-sdk';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Text as SvgText } from 'react-native-svg';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
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

const DebtAttackScreen = () => {
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
    const [plaidStatus, setPlaidStatus] = useState('unknown'); // 'success', 'login_required', 'no_token', etc.
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
    const [alertConfig, setAlertConfig] = useState({
        title: '',
        message: '',
        buttons: []
    });

    // Form states
    const [formName, setFormName] = useState('');
    const [formBalance, setFormBalance] = useState('');
    const [formApr, setFormApr] = useState('');
    const [formMinPayment, setFormMinPayment] = useState('');
    const [formDebtType, setFormDebtType] = useState('credit_card');
    const [formSubmitting, setFormSubmitting] = useState(false);

    // Helper to show custom alert
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

            // Fetch debt overview and accounts in parallel
            const [data, accountsData] = await Promise.all([
                api.getDebtOverview(),
                api.getAccounts()
            ]);

            if (data?.success) {
                setAnalysis(data.analysis);
                setRawLiabilities(data.raw_liabilities);
                setCustomDebts(data.custom_debts || []);
                setPlaidStatus(data.plaid_status || 'unknown');

                // Combine all debts for display
                const allDebts = data.analysis?.debts || [];
                setDebts(allDebts);
            } else {
                setError('Failed to load debt data.');
            }

            // Store linked accounts (filter for credit accounts)
            if (accountsData?.success && accountsData?.accounts) {
                const creditAccounts = accountsData.accounts.filter(acc =>
                    acc.type === 'credit' ||
                    acc.subtype === 'credit card' ||
                    acc.type === 'loan'
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

    // Recalculate when slider changes
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

    // Open add modal
    const openAddModal = () => {
        setFormName('');
        setFormBalance('');
        setFormApr(DEFAULT_APRS.credit_card.toString());
        setFormMinPayment('');
        setFormDebtType('credit_card');
        setAddModalVisible(true);
    };

    // Open edit modal
    const openEditModal = (debt) => {
        // Extract numeric ID from custom_X format
        const numericId = debt.id.replace('custom_', '');
        setEditingDebt({ ...debt, numericId });
        setFormName(debt.name);
        setFormBalance(debt.balance.toString());
        setFormApr(debt.apr.toString());
        setFormMinPayment(debt.min_payment?.toString() || '');
        setFormDebtType(debt.debt_type || 'other');
        setEditModalVisible(true);
    };

    // Handle debt type change (updates default APR)
    const handleDebtTypeChange = (type) => {
        setFormDebtType(type);
        // Only update APR if it's still set to a default value
        const currentApr = parseFloat(formApr);
        const isDefaultApr = Object.values(DEFAULT_APRS).includes(currentApr);
        if (isDefaultApr || !formApr) {
            setFormApr(DEFAULT_APRS[type].toString());
        }
    };

    // Add new debt
    const handleAddDebt = async () => {
        if (!formName.trim() || !formBalance) {
            showAlert('Error', 'Please enter a name and balance');
            return;
        }

        setFormSubmitting(true);
        try {
            const debt = {
                name: formName.trim(),
                balance: parseFloat(formBalance),
                apr: parseFloat(formApr) || DEFAULT_APRS[formDebtType],
                min_payment: parseFloat(formMinPayment) || 0,
                debt_type: formDebtType,
            };

            const result = await api.addCustomDebt(debt);
            if (result?.success) {
                setAddModalVisible(false);
                fetchData(); // Refresh all data
            } else {
                showAlert('Error', result?.message || 'Failed to add debt');
            }
        } catch (err) {
            showAlert('Error', 'Failed to add debt. Please try again');
        } finally {
            setFormSubmitting(false);
        }
    };

    // Update existing debt
    const handleUpdateDebt = async () => {
        if (!formName.trim() || !formBalance) {
            showAlert('Error', 'Please enter a name and balance');
            return;
        }

        setFormSubmitting(true);
        try {
            const debt = {
                name: formName.trim(),
                balance: parseFloat(formBalance),
                apr: parseFloat(formApr),
                min_payment: parseFloat(formMinPayment) || 0,
                debt_type: formDebtType,
            };

            const result = await api.updateCustomDebt(editingDebt.numericId, debt);
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

    // Delete debt
    const handleDeleteDebt = () => {
        showAlert(
            'Delete Debt',
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

    // Handle Plaid re-authentication - opens Plaid Link in update mode
    const handleReAuthenticate = async () => {
        setReAuthLoading(true);
        try {
            // Get update mode link token from backend
            console.log('🔄 Getting update mode link token...');
            const result = await api.createUpdateLinkToken();

            if (!result?.link_token) {
                console.error('Failed to get update link token');
                setReAuthModalVisible(true);
                return;
            }

            console.log('✅ Got update link token, opening Plaid Link...');

            // Create and open Plaid Link in update mode
            await create({
                token: result.link_token,
            });

            await open({
                onSuccess: async (success) => {
                    console.log('🎉 Plaid Link update success!');
                    // Refresh data after successful re-authentication
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

    // Close re-auth error modal
    const closeReAuthModal = () => {
        setReAuthModalVisible(false);
    };

    // Import a linked account as a custom debt
    const handleImportAccount = async (account) => {
        setFormSubmitting(true);
        try {
            const debt = {
                name: account.name || account.officialName || 'Credit Card',
                balance: Math.abs(account.balance || 0),
                apr: DEFAULT_APRS.credit_card, // Default APR for credit cards
                min_payment: Math.abs(account.balance || 0) * 0.02, // Estimate 2% minimum payment
                debt_type: 'credit_card',
            };

            console.log('📥 Importing account as debt:', debt);
            const result = await api.addCustomDebt(debt);

            if (result?.success) {
                setImportModalVisible(false);
                fetchData(); // Refresh all data
            } else {
                console.error('Failed to import account:', result?.message);
            }
        } catch (err) {
            console.error('Error importing account:', err);
        } finally {
            setFormSubmitting(false);
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

        const interestSavedKey = strategy === 'snowball'
            ? 'interest_saved_snowball'
            : 'interest_saved_avalanche';
        const monthsSavedKey = strategy === 'snowball'
            ? 'months_saved_snowball'
            : 'months_saved_avalanche';

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
                style={styles.debtItem}
                onPress={() => isCustom && openEditModal(item)}
                activeOpacity={isCustom ? 0.7 : 1}
            >
                <View style={styles.debtRank}>
                    <Text style={styles.debtRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.debtContent}>
                    <View style={styles.debtNameRow}>
                        <Text style={styles.debtName}>{item.name}</Text>
                        {isCustom && (
                            <View style={styles.customBadge}>
                                <Text style={styles.customBadgeText}>Manual</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.debtApr}>{item.apr.toFixed(1)}% APR</Text>
                </View>
                <View style={styles.debtRight}>
                    <Text style={styles.debtBalance}>${item.balance.toLocaleString()}</Text>
                    <Text style={styles.debtPayoff}>Payoff: {payoffText}</Text>
                </View>
                {isCustom && (
                    <Ionicons name="chevron-forward" size={16} color={COLORS.TEXT_MUTED} />
                )}
            </TouchableOpacity>
        );
    };

    // Debt form modal content
    const renderFormModal = (isEdit = false) => (
        <Modal
            visible={isEdit ? editModalVisible : addModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => isEdit ? setEditModalVisible(false) : setAddModalVisible(false)}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            {isEdit ? 'Edit Debt' : 'Add New Debt'}
                        </Text>
                        <TouchableOpacity
                            onPress={() => isEdit ? setEditModalVisible(false) : setAddModalVisible(false)}
                        >
                            <Ionicons name="close" size={24} color={COLORS.WHITE} />
                        </TouchableOpacity>
                    </View>

                    {/* Debt Type Selector */}
                    <Text style={styles.inputLabel}>Debt Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelector}>
                        {DEBT_TYPES.map((type) => (
                            <TouchableOpacity
                                key={type.key}
                                style={[
                                    styles.typeButton,
                                    formDebtType === type.key && styles.typeButtonActive
                                ]}
                                onPress={() => handleDebtTypeChange(type.key)}
                            >
                                <Ionicons
                                    name={type.icon}
                                    size={16}
                                    color={formDebtType === type.key ? COLORS.WHITE : COLORS.TEXT_SECONDARY}
                                />
                                <Text style={[
                                    styles.typeButtonText,
                                    formDebtType === type.key && styles.typeButtonTextActive
                                ]}>
                                    {type.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Form Fields */}
                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                        style={styles.input}
                        value={formName}
                        onChangeText={setFormName}
                        placeholder="e.g. Chase Sapphire"
                        placeholderTextColor={COLORS.TEXT_MUTED}
                    />

                    <View style={styles.inputRow}>
                        <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>Balance ($)</Text>
                            <TextInput
                                style={styles.input}
                                value={formBalance}
                                onChangeText={setFormBalance}
                                placeholder="5000"
                                placeholderTextColor={COLORS.TEXT_MUTED}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>APR (%)</Text>
                            <TextInput
                                style={styles.input}
                                value={formApr}
                                onChangeText={setFormApr}
                                placeholder="22.0"
                                placeholderTextColor={COLORS.TEXT_MUTED}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>

                    <Text style={styles.inputLabel}>Min Payment ($/mo) - Optional</Text>
                    <TextInput
                        style={styles.input}
                        value={formMinPayment}
                        onChangeText={setFormMinPayment}
                        placeholder="Auto-calculated if empty"
                        placeholderTextColor={COLORS.TEXT_MUTED}
                        keyboardType="numeric"
                    />

                    {/* Action Buttons */}
                    <View style={styles.modalActions}>
                        {isEdit && (
                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={handleDeleteDebt}
                            >
                                <Ionicons name="trash" size={18} color="#FF4444" />
                                <Text style={styles.deleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.saveButton, formSubmitting && styles.saveButtonDisabled]}
                            onPress={isEdit ? handleUpdateDebt : handleAddDebt}
                            disabled={formSubmitting}
                        >
                            {formSubmitting ? (
                                <ActivityIndicator size="small" color={COLORS.WHITE} />
                            ) : (
                                <>
                                    <Ionicons name="checkmark" size={18} color={COLORS.WHITE} />
                                    <Text style={styles.saveButtonText}>
                                        {isEdit ? 'Update' : 'Add Debt'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
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
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerButton} onPress={() => setImportModalVisible(true)}>
                        <Ionicons name="download-outline" size={22} color={COLORS.TEXT_SECONDARY} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                        <Ionicons name="add" size={24} color={COLORS.GOLD} />
                    </TouchableOpacity>
                </View>
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
                        <Ionicons name="warning" size={20} color="#F44336" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Re-authentication Banner */}
                {plaidStatus === 'login_required' && (
                    <TouchableOpacity
                        style={styles.reAuthBanner}
                        onPress={handleReAuthenticate}
                        disabled={reAuthLoading}
                    >
                        <View style={styles.reAuthContent}>
                            <Ionicons name="alert-circle" size={24} color="#FFA726" />
                            <View style={styles.reAuthTextContainer}>
                                <Text style={styles.reAuthTitle}>Bank Connection Expired</Text>
                                <Text style={styles.reAuthSubtitle}>
                                    Tap to re-authenticate and sync your credit accounts
                                </Text>
                            </View>
                        </View>
                        {reAuthLoading ? (
                            <ActivityIndicator size="small" color="#FFA726" />
                        ) : (
                            <Ionicons name="chevron-forward" size={20} color="#FFA726" />
                        )}
                    </TouchableOpacity>
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
                        <TouchableOpacity
                            style={styles.customPaymentButton}
                            onPress={() => {
                                setCustomPaymentValue(extraPayment.toString());
                                setCustomPaymentModalVisible(true);
                            }}
                        >
                            <Ionicons name="pencil" size={14} color={COLORS.GOLD} />
                            <Text style={styles.customPaymentButtonText}>Custom</Text>
                        </TouchableOpacity>
                        <Text style={styles.totalPayment}>Total: ${Math.round(totalPayment)}/mo</Text>
                    </View>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={5000}
                        step={100}
                        value={extraPayment > 5000 ? 5000 : extraPayment}
                        onSlidingComplete={handleSliderChange}
                        onValueChange={setExtraPayment}
                        minimumTrackTintColor="#3B82F6"
                        maximumTrackTintColor={COLORS.CARD_BORDER}
                        thumbTintColor={COLORS.WHITE}
                    />
                    <View style={styles.sliderLabels}>
                        <Text style={styles.sliderLabelText}>+$0</Text>
                        <Text style={styles.sliderLabelText}>+$5,000</Text>
                    </View>
                </View>

                {/* Payment Trend Chart */}
                {analysis && debts.length > 0 && (
                    <View style={styles.trendChartCard}>
                        <Text style={styles.sectionTitle}>Payment Comparison</Text>
                        <Text style={styles.trendChartSubtitle}>
                            Minimum Payment vs Extra Payment Impact
                        </Text>
                        <View style={styles.trendChartContainer}>
                            <Svg width="100%" height={160} viewBox="0 0 320 160">
                                <Defs>
                                    <LinearGradient id="minPaymentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <Stop offset="0%" stopColor="#EF4444" stopOpacity="0.3" />
                                        <Stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                                    </LinearGradient>
                                    <LinearGradient id="extraPaymentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <Stop offset="0%" stopColor="#4CAF50" stopOpacity="0.3" />
                                        <Stop offset="100%" stopColor="#4CAF50" stopOpacity="0" />
                                    </LinearGradient>
                                </Defs>

                                {/* Minimum Payment Line (slower payoff) */}
                                <Path
                                    d="M 20 30 Q 80 35, 140 50 Q 200 70, 260 100 Q 290 120, 300 140"
                                    stroke="#EF4444"
                                    strokeWidth={2.5}
                                    fill="none"
                                    strokeLinecap="round"
                                />

                                {/* Extra Payment Line (faster payoff) */}
                                <Path
                                    d="M 20 30 Q 60 45, 100 80 Q 140 110, 180 130 Q 200 140, 220 140"
                                    stroke="#4CAF50"
                                    strokeWidth={2.5}
                                    fill="none"
                                    strokeLinecap="round"
                                />

                                {/* End points */}
                                <Circle cx={300} cy={140} r={4} fill="#EF4444" />
                                <Circle cx={220} cy={140} r={4} fill="#4CAF50" />

                                {/* Labels */}
                                <SvgText x={300} y={155} fontSize={10} fill={COLORS.TEXT_MUTED} textAnchor="end">
                                    Min Payment
                                </SvgText>
                                <SvgText x={220} y={155} fontSize={10} fill="#4CAF50" textAnchor="middle">
                                    +Extra
                                </SvgText>
                            </Svg>
                        </View>
                        <View style={styles.trendLegend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                                <Text style={styles.legendText}>Minimum Payment Only</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                                <Text style={styles.legendText}>With +${extraPayment}/mo Extra</Text>
                            </View>
                        </View>
                        {monthsSooner > 0 && (
                            <View style={styles.trendSavings}>
                                <Ionicons name="flash" size={16} color={COLORS.GOLD} />
                                <Text style={styles.trendSavingsText}>
                                    Pay off {monthsSooner} months faster & save ${interestSaved.toLocaleString()} in interest
                                </Text>
                            </View>
                        )}
                    </View>
                )}

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
                    <View style={styles.debtsSectionHeader}>
                        <Text style={styles.sectionTitle}>Your Debts</Text>
                        <Text style={styles.totalDebtLabel}>
                            Total: ${(analysis?.total_debt || 0).toLocaleString()}
                        </Text>
                    </View>
                    {debts.length > 0 ? (
                        debts.map((debt, index) => renderDebtItem(debt, index))
                    ) : (
                        <View style={styles.emptyState}>
                            <Ionicons name="add-circle-outline" size={48} color={COLORS.GOLD} />
                            <Text style={styles.emptyText}>No debts added yet</Text>
                            <TouchableOpacity style={styles.emptyAddButton} onPress={openAddModal}>
                                <Text style={styles.emptyAddButtonText}>Add Your First Debt</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>


            {/* Modals */}
            {renderFormModal(false)}
            {renderFormModal(true)}

            {/* Re-authentication Error Modal */}
            <Modal
                visible={reAuthModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={closeReAuthModal}
            >
                <View style={styles.reAuthModalOverlay}>
                    <View style={styles.reAuthModalContent}>
                        {/* Warning Icon */}
                        <View style={styles.reAuthModalIcon}>
                            <Ionicons name="alert-circle" size={48} color="#FFA726" />
                        </View>

                        {/* Title and Message */}
                        <Text style={styles.reAuthModalTitle}>Re-authentication Failed</Text>
                        <Text style={styles.reAuthModalMessage}>
                            We couldn't refresh your bank connection. Please try again or go to Profile to re-link your account.
                        </Text>

                        {/* Action Buttons */}
                        <View style={styles.reAuthModalButtons}>
                            <TouchableOpacity
                                style={styles.reAuthModalButtonSecondary}
                                onPress={closeReAuthModal}
                            >
                                <Text style={styles.reAuthModalButtonSecondaryText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.reAuthModalButtonPrimary}
                                onPress={() => {
                                    closeReAuthModal();
                                    handleReAuthenticate();
                                }}
                            >
                                <Text style={styles.reAuthModalButtonPrimaryText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Import Accounts Modal */}
            <Modal
                visible={importModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setImportModalVisible(false)}
            >
                <View style={styles.importModalOverlay}>
                    <View style={styles.importModalContent}>
                        <View style={styles.importModalHeader}>
                            <Text style={styles.importModalTitle}>Import Account as Debt</Text>
                            <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.importModalSubtitle}>
                            Select a linked credit account to track as a debt
                        </Text>

                        {linkedAccounts.length > 0 ? (
                            <ScrollView style={styles.importAccountList}>
                                {linkedAccounts.map((account, index) => (
                                    <TouchableOpacity
                                        key={account.id || index}
                                        style={styles.importAccountItem}
                                        onPress={() => handleImportAccount(account)}
                                        disabled={formSubmitting}
                                    >
                                        <View style={styles.importAccountIcon}>
                                            <Ionicons name="card" size={20} color={COLORS.GOLD} />
                                        </View>
                                        <View style={styles.importAccountInfo}>
                                            <Text style={styles.importAccountName}>
                                                {account.name || account.officialName}
                                            </Text>
                                            <Text style={styles.importAccountType}>
                                                {account.subtype || account.type}
                                            </Text>
                                        </View>
                                        <Text style={styles.importAccountBalance}>
                                            ${Math.abs(account.balance || 0).toLocaleString()}
                                        </Text>
                                        {formSubmitting ? (
                                            <ActivityIndicator size="small" color={COLORS.GOLD} />
                                        ) : (
                                            <Ionicons name="add-circle" size={24} color={COLORS.GOLD} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <View style={styles.importEmptyState}>
                                <Ionicons name="card-outline" size={48} color={COLORS.TEXT_MUTED} />
                                <Text style={styles.importEmptyText}>No credit accounts found</Text>
                                <Text style={styles.importEmptySubtext}>
                                    Link a bank with credit cards to import them as debts
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Custom Payment Modal */}
            <Modal
                visible={customPaymentModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setCustomPaymentModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.customPaymentModalOverlay}
                >
                    <View style={styles.customPaymentModalContent}>
                        <Text style={styles.customPaymentModalTitle}>Custom Extra Payment</Text>
                        <Text style={styles.customPaymentModalSubtitle}>
                            Enter an amount above $5,000/month
                        </Text>
                        <View style={styles.customPaymentInputContainer}>
                            <Text style={styles.customPaymentDollarSign}>$</Text>
                            <TextInput
                                style={styles.customPaymentInput}
                                value={customPaymentValue}
                                onChangeText={setCustomPaymentValue}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={COLORS.TEXT_MUTED}
                                autoFocus
                            />
                            <Text style={styles.customPaymentSuffix}>/mo</Text>
                        </View>
                        <View style={styles.customPaymentActions}>
                            <TouchableOpacity
                                style={styles.customPaymentCancelButton}
                                onPress={() => setCustomPaymentModalVisible(false)}
                            >
                                <Text style={styles.customPaymentCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.customPaymentApplyButton}
                                onPress={() => {
                                    const value = parseInt(customPaymentValue) || 0;
                                    setExtraPayment(value);
                                    handleSliderChange(value);
                                    setCustomPaymentModalVisible(false);
                                }}
                            >
                                <Text style={styles.customPaymentApplyText}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Custom Alert */}
            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={() => setAlertVisible(false)}
            />
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
        fontFamily: FONTS.BOLD,
    },
    addButton: {
        padding: SPACING.SMALL,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    headerButton: {
        padding: SPACING.SMALL,
    },

    // Error
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: SPACING.MEDIUM,
        padding: SPACING.MEDIUM,
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        gap: SPACING.SMALL,
    },
    errorText: {
        color: '#F44336',
        flex: 1,
    },

    // Re-authentication Banner
    reAuthBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: SPACING.MEDIUM,
        marginTop: 0,
        padding: SPACING.MEDIUM,
        backgroundColor: 'rgba(255, 167, 38, 0.1)',
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: 'rgba(255, 167, 38, 0.3)',
    },
    reAuthContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    reAuthTextContainer: {
        marginLeft: SPACING.SMALL,
        flex: 1,
    },
    reAuthTitle: {
        color: '#FFA726',
        fontSize: 14,
        fontWeight: '600',
    },
    reAuthSubtitle: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginTop: 2,
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
        fontFamily: FONTS.BOLD,
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
    debtsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    totalDebtLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 14,
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
        fontFamily: FONTS.BOLD,
    },
    debtContent: {
        flex: 1,
    },
    debtNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        flexWrap: 'nowrap',
    },
    debtName: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontFamily: FONTS.BOLD,
        marginBottom: 2,
        flexShrink: 1,
    },
    customBadge: {
        backgroundColor: 'rgba(201, 162, 39, 0.2)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    customBadgeText: {
        color: COLORS.GOLD,
        fontSize: 10,
        fontFamily: FONTS.BOLD,
    },
    debtApr: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    debtRight: {
        alignItems: 'flex-end',
        marginRight: SPACING.SMALL,
    },
    debtBalance: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontFamily: FONTS.BOLD,
        marginBottom: 2,
    },
    debtPayoff: {
        color: COLORS.GOLD,
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
    emptyAddButton: {
        marginTop: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.LARGE,
        backgroundColor: COLORS.GOLD,
        borderRadius: BORDER_RADIUS.LARGE,
    },
    emptyAddButtonText: {
        color: COLORS.BACKGROUND,
        fontFamily: FONTS.BOLD,
    },

    // FAB
    fab: {
        position: 'absolute',
        bottom: 100,
        right: SPACING.MEDIUM,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    modalTitle: {
        color: COLORS.WHITE,
        fontSize: 20,
        fontFamily: FONTS.BOLD,
    },

    // Type Selector
    typeSelector: {
        marginBottom: SPACING.MEDIUM,
    },
    typeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        backgroundColor: COLORS.BACKGROUND,
        marginRight: SPACING.SMALL,
    },
    typeButtonActive: {
        backgroundColor: '#2563EB',
    },
    typeButtonText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 13,
        marginLeft: SPACING.TINY,
    },
    typeButtonTextActive: {
        color: COLORS.WHITE,
    },

    // Form
    inputLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        marginBottom: SPACING.TINY,
        marginTop: SPACING.SMALL,
    },
    input: {
        backgroundColor: COLORS.BACKGROUND,
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        color: COLORS.WHITE,
        fontSize: 16,
    },
    inputRow: {
        flexDirection: 'row',
        gap: SPACING.MEDIUM,
    },
    inputHalf: {
        flex: 1,
    },

    // Modal Actions
    modalActions: {
        flexDirection: 'row',
        marginTop: SPACING.LARGE,
        gap: SPACING.MEDIUM,
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.MEDIUM,
        paddingHorizontal: SPACING.LARGE,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: '#FF4444',
    },
    deleteButtonText: {
        color: '#FF4444',
        marginLeft: SPACING.SMALL,
        fontFamily: FONTS.BOLD,
    },
    saveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        backgroundColor: '#2563EB',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: COLORS.WHITE,
        marginLeft: SPACING.SMALL,
        fontFamily: FONTS.BOLD,
    },

    // Re-Authentication Error Modal
    reAuthModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    reAuthModalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.XL,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: 'rgba(255, 167, 38, 0.3)',
    },
    reAuthModalIcon: {
        marginBottom: SPACING.MEDIUM,
    },
    reAuthModalTitle: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: SPACING.SMALL,
        textAlign: 'center',
    },
    reAuthModalMessage: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: SPACING.LARGE,
    },
    reAuthModalButtons: {
        flexDirection: 'row',
        gap: SPACING.MEDIUM,
        width: '100%',
    },
    reAuthModalButtonSecondary: {
        flex: 1,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        alignItems: 'center',
    },
    reAuthModalButtonSecondaryText: {
        color: COLORS.TEXT_SECONDARY,
        fontFamily: FONTS.BOLD,
    },
    reAuthModalButtonPrimary: {
        flex: 1,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        backgroundColor: '#FFA726',
        alignItems: 'center',
    },
    reAuthModalButtonPrimaryText: {
        color: COLORS.BACKGROUND,
        fontFamily: FONTS.BOLD,
    },

    // Import Modal Styles
    importModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'flex-end',
    },
    importModalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderTopLeftRadius: BORDER_RADIUS.XL,
        borderTopRightRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
        maxHeight: '70%',
    },
    importModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
    },
    importModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    importModalSubtitle: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.LARGE,
    },
    importAccountList: {
        maxHeight: 300,
    },
    importAccountItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.MEDIUM,
        backgroundColor: COLORS.BACKGROUND,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    importAccountIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(212, 175, 55, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.MEDIUM,
    },
    importAccountInfo: {
        flex: 1,
    },
    importAccountName: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.WHITE,
    },
    importAccountType: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
        textTransform: 'capitalize',
    },
    importAccountBalance: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.WHITE,
        marginRight: SPACING.SMALL,
    },
    importEmptyState: {
        alignItems: 'center',
        paddingVertical: SPACING.XL,
    },
    importEmptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.TEXT_SECONDARY,
        marginTop: SPACING.MEDIUM,
    },
    importEmptySubtext: {
        fontSize: 13,
        color: COLORS.TEXT_MUTED,
        textAlign: 'center',
        marginTop: SPACING.SMALL,
    },

    // Custom Payment Button
    customPaymentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        paddingHorizontal: SPACING.SMALL,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginLeft: SPACING.SMALL,
        borderWidth: 1,
        borderColor: COLORS.GOLD,
    },
    customPaymentButtonText: {
        color: COLORS.GOLD,
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },

    // Payment Trend Chart
    trendChartCard: {
        marginHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.LARGE,
    },
    trendChartSubtitle: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: SPACING.MEDIUM,
    },
    trendChartContainer: {
        marginVertical: SPACING.SMALL,
    },
    trendLegend: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: SPACING.MEDIUM,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: SPACING.SMALL,
    },
    legendText: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
    },
    trendSavings: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        padding: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        marginTop: SPACING.MEDIUM,
    },
    trendSavingsText: {
        color: COLORS.WHITE,
        fontSize: 13,
        marginLeft: SPACING.SMALL,
        flex: 1,
    },

    // Custom Payment Modal
    customPaymentModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    customPaymentModalContent: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: BORDER_RADIUS.XL,
        padding: SPACING.XL,
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    customPaymentModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.WHITE,
        textAlign: 'center',
        marginBottom: SPACING.SMALL,
    },
    customPaymentModalSubtitle: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        marginBottom: SPACING.LARGE,
    },
    customPaymentInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.BACKGROUND,
        borderRadius: BORDER_RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.LARGE,
    },
    customPaymentDollarSign: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.GOLD,
        marginRight: SPACING.SMALL,
    },
    customPaymentInput: {
        flex: 1,
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.WHITE,
    },
    customPaymentSuffix: {
        fontSize: 16,
        color: COLORS.TEXT_SECONDARY,
        marginLeft: SPACING.SMALL,
    },
    customPaymentActions: {
        flexDirection: 'row',
        gap: SPACING.MEDIUM,
    },
    customPaymentCancelButton: {
        flex: 1,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        alignItems: 'center',
    },
    customPaymentCancelText: {
        color: COLORS.TEXT_SECONDARY,
        fontWeight: '600',
    },
    customPaymentApplyButton: {
        flex: 1,
        paddingVertical: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.LARGE,
        backgroundColor: COLORS.GOLD,
        alignItems: 'center',
    },
    customPaymentApplyText: {
        color: COLORS.BACKGROUND,
        fontWeight: '700',
    },
});

export default DebtAttackScreen;
