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
    Alert,
    KeyboardAvoidingView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import api from '../services/api';

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

    // Modal states
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingDebt, setEditingDebt] = useState(null);

    // Form states
    const [formName, setFormName] = useState('');
    const [formBalance, setFormBalance] = useState('');
    const [formApr, setFormApr] = useState('');
    const [formMinPayment, setFormMinPayment] = useState('');
    const [formDebtType, setFormDebtType] = useState('credit_card');
    const [formSubmitting, setFormSubmitting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getDebtOverview();

            if (data?.success) {
                setAnalysis(data.analysis);
                setRawLiabilities(data.raw_liabilities);
                setCustomDebts(data.custom_debts || []);

                // Combine all debts for display
                const allDebts = data.analysis?.debts || [];
                setDebts(allDebts);
            } else {
                setError('Failed to load debt data.');
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
            Alert.alert('Error', 'Please enter a name and balance');
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
                Alert.alert('Error', result?.message || 'Failed to add debt');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to add debt. Please try again.');
        } finally {
            setFormSubmitting(false);
        }
    };

    // Update existing debt
    const handleUpdateDebt = async () => {
        if (!formName.trim() || !formBalance) {
            Alert.alert('Error', 'Please enter a name and balance');
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
                Alert.alert('Error', result?.message || 'Failed to update debt');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to update debt. Please try again.');
        } finally {
            setFormSubmitting(false);
        }
    };

    // Delete debt
    const handleDeleteDebt = () => {
        Alert.alert(
            'Delete Debt',
            `Are you sure you want to delete "${editingDebt?.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const result = await api.deleteCustomDebt(editingDebt.numericId);
                            if (result?.success) {
                                setEditModalVisible(false);
                                fetchData();
                            }
                        } catch (err) {
                            Alert.alert('Error', 'Failed to delete debt');
                        }
                    },
                },
            ]
        );
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
                <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                    <Ionicons name="add" size={24} color={COLORS.GOLD} />
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
                        <Ionicons name="warning" size={20} color="#F44336" />
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
                        <Text style={styles.totalPayment}>Total: ${Math.round(totalPayment)}/mo</Text>
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

            {/* Add Debt FAB */}
            <TouchableOpacity style={styles.fab} onPress={openAddModal}>
                <Ionicons name="add" size={28} color={COLORS.WHITE} />
            </TouchableOpacity>

            {/* Modals */}
            {renderFormModal(false)}
            {renderFormModal(true)}
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
    addButton: {
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
        fontWeight: '600',
    },
    debtContent: {
        flex: 1,
    },
    debtNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    debtName: {
        color: COLORS.WHITE,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    customBadge: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    customBadgeText: {
        color: '#3B82F6',
        fontSize: 10,
        fontWeight: '600',
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
    emptyAddButton: {
        marginTop: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL,
        paddingHorizontal: SPACING.LARGE,
        backgroundColor: COLORS.GOLD,
        borderRadius: BORDER_RADIUS.LARGE,
    },
    emptyAddButtonText: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
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
        fontWeight: '600',
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
        fontWeight: '600',
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
        fontWeight: '600',
    },
});

export default DebtAttackScreen;
