import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
    Alert, // Keeping generic Alert as fallback if needed, but primarily using CustomAlert
    ActivityIndicator,
    TextInput,
    Modal,
    FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { create, open, dismissLink, LinkSuccess, LinkExit } from 'react-native-plaid-link-sdk';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import { api } from '../services/api';
import cache from '../services/cache';
import CustomAlert from '../components/CustomAlert';

// Canadian Banks Data
const FEATURED_BANKS = [
    {
        id: 'rbc',
        name: 'RBC Royal Bank',
        subtitle: 'Instant Link',
        icon: 'bank',
        iconColor: '#FFD700',
        iconBg: '#3D3200',
    },
    {
        id: 'td',
        name: 'TD Canada Trust',
        subtitle: 'Instant Link',
        icon: 'piggy-bank',
        iconColor: '#4CAF50',
        iconBg: '#1B3D1B',
    },
    {
        id: 'cibc',
        name: 'CIBC',
        subtitle: 'Instant Link',
        icon: 'credit-card',
        iconColor: '#E53935',
        iconBg: '#3D1B1B',
    },
    {
        id: 'search',
        name: 'Find my bank',
        subtitle: 'Search list',
        icon: 'magnify',
        iconColor: '#94A3B8',
        iconBg: '#1E293B',
        isSearch: true,
    },
];

// All available banks for search
const ALL_BANKS = [
    { id: 'rbc', name: 'RBC Royal Bank', plaidInstitutionId: 'ins_39' },
    { id: 'td', name: 'TD Canada Trust', plaidInstitutionId: 'ins_40' },
    { id: 'cibc', name: 'CIBC', plaidInstitutionId: 'ins_41' },
    { id: 'bmo', name: 'BMO Bank of Montreal', plaidInstitutionId: 'ins_42' },
    { id: 'scotiabank', name: 'Scotiabank', plaidInstitutionId: 'ins_43' },
    { id: 'national', name: 'National Bank of Canada', plaidInstitutionId: 'ins_44' },
    { id: 'desjardins', name: 'Desjardins', plaidInstitutionId: 'ins_45' },
    { id: 'tangerine', name: 'Tangerine', plaidInstitutionId: 'ins_46' },
    { id: 'simplii', name: 'Simplii Financial', plaidInstitutionId: 'ins_47' },
    { id: 'eq', name: 'EQ Bank', plaidInstitutionId: 'ins_48' },
];

const ConnectBankScreen = ({ navigation, route }) => {
    const [selectedBank, setSelectedBank] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [successModalVisible, setSuccessModalVisible] = useState(false);

    // Custom Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        title: '',
        message: '',
        buttons: []
    });

    // Detect if we're in onboarding flow or accessed from main app
    const isOnboarding = route?.params?.isOnboarding ?? false;

    const filteredBanks = ALL_BANKS.filter(bank =>
        bank.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Helper to show custom alert
    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({
            title,
            message,
            buttons
        });
        setAlertVisible(true);
    };

    const handleBankSelect = (bank) => {
        if (bank.isSearch) {
            setSearchModalVisible(true);
        } else {
            setSelectedBank(bank.id);
        }
    };

    const handleSearchBankSelect = (bank) => {
        setSelectedBank(bank.id);
        setSearchModalVisible(false);
        setSearchQuery('');
    };

    const handleContinue = async () => {
        if (!selectedBank) {
            showAlert('Select a Bank', 'Please select your bank to continue.');
            return;
        }

        setLoading(true);

        // Timeout fallback - if Plaid Link doesn't respond in 15 seconds, stop loading
        const timeoutId = setTimeout(() => {
            console.log('⏱️ Plaid Link timeout - resetting loading state');
            setLoading(false);
            showAlert(
                'Connection Timeout',
                'Plaid Link did not open. Please try again. If the issue persists, you may need to use a development build instead of Expo Go.',
                [{ text: 'OK', onPress: () => setAlertVisible(false) }]
            );
        }, 15000);

        try {
            // Step 1: Get link_token from backend
            console.log('🔗 Fetching link token from backend...');
            const linkTokenResponse = await api.createLinkToken();

            if (!linkTokenResponse.link_token) {
                console.error('❌ No link token in response:', linkTokenResponse);
                clearTimeout(timeoutId);
                throw new Error('Failed to get link token');
            }

            console.log('✅ Got link token:', linkTokenResponse.link_token.substring(0, 30) + '...');

            // Step 2: Create Plaid Link configuration
            console.log('🔧 Creating Plaid Link configuration...');
            try {
                await create({
                    token: linkTokenResponse.link_token,
                });
                console.log('✅ Plaid Link created successfully');
            } catch (createError) {
                console.error('❌ Plaid Link create() failed:', createError);
                clearTimeout(timeoutId);
                throw createError;
            }

            // Step 3: Open Plaid Link
            console.log('🚀 Opening Plaid Link...');
            try {
                open({
                    onSuccess: async (success) => {
                        clearTimeout(timeoutId);
                        console.log('🎉 Plaid Link success:', success.publicToken);
                        try {
                            // Exchange public_token for access_token via backend
                            const exchangeResponse = await api.exchangePublicToken(success.publicToken);

                            if (exchangeResponse.success) {
                                console.log('✅ Bank connected successfully!');

                                // Update cached user to reflect Plaid linked status
                                const cachedUser = await cache.getCachedUser();
                                if (cachedUser) {
                                    cachedUser.hasPlaidLinked = true;
                                    await cache.setCachedUser(cachedUser);
                                }

                                // Navigate based on context
                                if (isOnboarding) {
                                    navigation.reset({
                                        index: 0,
                                        routes: [{ name: 'Main' }],
                                    });
                                } else {
                                    // Show custom success modal
                                    setSuccessModalVisible(true);
                                }
                            } else {
                                throw new Error(exchangeResponse.message || 'Failed to save bank connection');
                            }
                        } catch (exchangeError) {
                            console.error('Exchange error:', exchangeError);
                            showAlert('Connection Error', 'Connected to bank but failed to save. Please try again.');
                        }
                        setLoading(false);
                    },
                    onExit: (exit) => {
                        clearTimeout(timeoutId);
                        console.log('📤 Plaid Link exited:', JSON.stringify(exit));
                        if (exit?.error) {
                            console.error('❌ Plaid Link exit error:', exit.error);
                            showAlert('Connection Error', exit.error.displayMessage || 'Failed to connect to your bank.');
                        }
                        setLoading(false);
                    },
                });
                console.log('📋 Plaid Link open() called');
            } catch (openError) {
                console.error('❌ Plaid Link open() failed:', openError);
                clearTimeout(timeoutId);
                throw openError;
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('❌ Bank connection error:', error);
            showAlert('Connection Error', error.message || 'Failed to connect to your bank. Please try again.');
            setLoading(false);
        }
    };

    const handleSkip = () => {
        if (isOnboarding) {
            showAlert(
                'Skip Bank Connection?',
                'You can connect your bank later from the Profile settings.',
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => setAlertVisible(false)
                    },
                    {
                        text: 'Skip for Now',
                        onPress: () => {
                            setAlertVisible(false);
                            navigation.reset({
                                index: 0,
                                routes: [{ name: 'Main' }],
                            });
                        },
                    },
                ]
            );
        } else {
            navigation.goBack();
        }
    };

    const renderBankCard = (bank) => {
        const isSelected = selectedBank === bank.id;

        return (
            <TouchableOpacity
                key={bank.id}
                style={[
                    styles.bankCard,
                    isSelected && styles.bankCardSelected,
                ]}
                onPress={() => handleBankSelect(bank)}
                activeOpacity={0.7}
            >
                <View style={[styles.bankIconContainer, { backgroundColor: bank.iconBg }]}>
                    <MaterialCommunityIcons
                        name={bank.icon}
                        size={28}
                        color={bank.iconColor}
                    />
                </View>
                <Text style={styles.bankName}>{bank.name}</Text>
                <Text style={styles.bankSubtitle}>{bank.subtitle}</Text>
                {isSelected && (
                    <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background Gradient */}
            <LinearGradient
                colors={[COLORS.BACKGROUND, '#0F172A', '#1E293B']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>

                {/* Progress Indicator - only show during onboarding */}
                {isOnboarding ? (
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressDot, styles.progressDotActive]} />
                        <View style={[styles.progressDot, styles.progressDotActive]} />
                        <View style={[styles.progressDot, styles.progressDotActive]} />
                    </View>
                ) : (
                    <Text style={styles.headerTitle}>Add Account</Text>
                )}

                {/* Skip Button - only show during onboarding */}
                {isOnboarding ? (
                    <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Title Section */}
                <Text style={styles.title}>Connect your funding source</Text>
                <Text style={styles.subtitle}>
                    Select your primary banking institution to verify your identity and fund your{' '}
                    <Text style={styles.brandText}>IndusWealth</Text> account instantly.
                </Text>

                {/* Bank Cards Grid */}
                <View style={styles.bankGrid}>
                    {FEATURED_BANKS.map(renderBankCard)}
                </View>

                {/* Security Badge */}
                <View style={styles.securityBadge}>
                    <Ionicons name="lock-closed" size={14} color="#4CAF50" />
                    <Text style={styles.securityText}>Bank-grade 256-bit Encryption</Text>
                </View>

                {/* Continue Button */}
                <TouchableOpacity
                    style={[styles.buttonContainer, !selectedBank && styles.buttonDisabled]}
                    onPress={handleContinue}
                    disabled={loading || !selectedBank}
                >
                    <LinearGradient
                        colors={selectedBank ? ['#2196F3', '#1976D2'] : ['#334155', '#334155']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.button}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={styles.buttonText}>Continue</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                {/* Powered By Footer */}
                <Text style={styles.poweredBy}>POWERED BY PLAID</Text>
            </ScrollView>

            {/* Search Modal */}
            <Modal
                visible={searchModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSearchModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Find your bank</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setSearchModalVisible(false);
                                    setSearchQuery('');
                                }}
                            >
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchInputContainer}>
                            <Ionicons name="search" size={20} color="#64748B" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search banks..."
                                placeholderTextColor="#64748B"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus
                            />
                        </View>

                        <FlatList
                            data={filteredBanks}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.searchBankItem}
                                    onPress={() => handleSearchBankSelect(item)}
                                >
                                    <MaterialCommunityIcons
                                        name="bank"
                                        size={24}
                                        color="#94A3B8"
                                    />
                                    <Text style={styles.searchBankName}>{item.name}</Text>
                                    {selectedBank === item.id && (
                                        <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    )}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>No banks found</Text>
                            }
                        />
                    </View>
                </View>
            </Modal>

            {/* Custom Alert */}
            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={() => setAlertVisible(false)}
            />

            {/* Success Modal */}
            <Modal
                visible={successModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => {
                    setSuccessModalVisible(false);
                    navigation.goBack();
                }}
            >
                <View style={styles.successModalOverlay}>
                    <View style={styles.successModalContent}>
                        {/* Success Icon */}
                        <View style={styles.successIconContainer}>
                            <LinearGradient
                                colors={['#D4AF37', '#C5A028']}
                                style={styles.successIconGradient}
                            >
                                <Ionicons name="checkmark" size={40} color="#0A0A0A" />
                            </LinearGradient>
                        </View>

                        {/* Success Text */}
                        <Text style={styles.successTitle}>Connected!</Text>
                        <Text style={styles.successMessage}>
                            Your bank account has been successfully linked to IndusWealth.
                        </Text>

                        {/* Continue Button */}
                        <TouchableOpacity
                            style={styles.successButton}
                            onPress={() => {
                                setSuccessModalVisible(false);
                                navigation.goBack();
                            }}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#C5A028']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.successButtonGradient}
                            >
                                <Text style={styles.successButtonText}>Continue</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.MEDIUM,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    progressDot: {
        width: 24,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#334155',
    },
    progressDotActive: {
        backgroundColor: '#D4AF37',
    },
    skipButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    skipText: {
        color: '#94A3B8',
        fontSize: 14,
        fontFamily: FONTS.MEDIUM,
    },
    headerTitle: {
        color: COLORS.WHITE,
        fontSize: 17,
        fontFamily: FONTS.BOLD,
    },
    content: {
        padding: SPACING.LARGE,
        paddingTop: SPACING.MEDIUM,
    },
    title: {
        fontSize: 28,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 15,
        color: '#94A3B8',
        lineHeight: 22,
        marginBottom: 32,
    },
    brandText: {
        color: '#D4AF37',
        fontFamily: FONTS.BOLD,
    },
    bankGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    bankCard: {
        width: '48%',
        backgroundColor: '#1E293B',
        borderRadius: BORDER_RADIUS.LARGE,
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        borderWidth: 1,
        borderColor: '#334155',
    },
    bankCardSelected: {
        borderColor: '#D4AF37',
        backgroundColor: 'rgba(212, 175, 55, 0.1)',
    },
    bankIconContainer: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    bankName: {
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 4,
    },
    bankSubtitle: {
        fontSize: 12,
        color: '#64748B',
    },
    selectedBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#D4AF37',
        justifyContent: 'center',
        alignItems: 'center',
    },
    securityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.LARGE,
        marginBottom: 24,
    },
    securityText: {
        color: '#4CAF50',
        fontSize: 13,
        fontFamily: FONTS.MEDIUM,
        marginLeft: 8,
    },
    buttonContainer: {
        borderRadius: BORDER_RADIUS.MEDIUM,
        overflow: 'hidden',
        marginBottom: 24,
        shadowColor: '#2196F3',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    buttonDisabled: {
        shadowOpacity: 0,
        elevation: 0,
    },
    button: {
        height: 54,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    poweredBy: {
        textAlign: 'center',
        color: '#64748B',
        fontSize: 11,
        letterSpacing: 1.5,
        fontFamily: FONTS.MEDIUM,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 34,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: SPACING.LARGE,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    modalTitle: {
        fontSize: 18,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        margin: SPACING.MEDIUM,
        paddingHorizontal: SPACING.MEDIUM,
        borderRadius: BORDER_RADIUS.MEDIUM,
        borderWidth: 1,
        borderColor: '#334155',
    },
    searchInput: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 16,
        paddingVertical: 14,
        marginLeft: 10,
    },
    searchBankItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: SPACING.LARGE,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    searchBankName: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 15,
        marginLeft: 12,
    },
    emptyText: {
        color: '#64748B',
        textAlign: 'center',
        paddingVertical: 32,
        fontSize: 15,
    },
    // Success Modal Styles
    successModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    successModalContent: {
        backgroundColor: '#1E293B',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.3)',
    },
    successIconContainer: {
        marginBottom: 24,
    },
    successIconGradient: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    successTitle: {
        fontSize: 28,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 12,
    },
    successMessage: {
        fontSize: 15,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    successButton: {
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
    },
    successButtonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    successButtonText: {
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        color: '#0A0A0A',
    },
});

export default ConnectBankScreen;
