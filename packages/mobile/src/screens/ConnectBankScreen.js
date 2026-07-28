import React, { useState, useEffect, useRef } from 'react';
import {
    FlatList,
    Linking,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { alpha, categoryColor, RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { AuthLayout } from '../components/AuthChrome';
import { BottomSheet, Button, Input, Text } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import { create, open } from '../services/plaidLink';
import { api, getApiTarget } from '../services/api';
import cache from '../services/cache';

/**
 * Institutions carry a slot in the category ramp rather than a brand hex, so each
 * theme resolves its own legible colour. A literal brand colour picked for the
 * dark screen (the old `iconBg: '#3D3200'`) is invisible on the light one.
 */
const FEATURED_BANKS = [
    { id: 'rbc', name: 'RBC Royal Bank', subtitle: 'Instant link', icon: 'bank', colorIndex: 2 },
    { id: 'td', name: 'TD Canada Trust', subtitle: 'Instant link', icon: 'piggy-bank', colorIndex: 5 },
    { id: 'cibc', name: 'CIBC', subtitle: 'Instant link', icon: 'credit-card', colorIndex: 6 },
    { id: 'search', name: 'Find my bank', subtitle: 'Search list', icon: 'magnify', isSearch: true },
];

// All available banks for search
const ALL_BANKS = [
    { id: 'rbc', name: 'RBC Royal Bank' },
    { id: 'td', name: 'TD Canada Trust' },
    { id: 'cibc', name: 'CIBC' },
    { id: 'bmo', name: 'BMO Bank of Montreal' },
    { id: 'scotiabank', name: 'Scotiabank' },
    { id: 'national', name: 'National Bank of Canada' },
    { id: 'desjardins', name: 'Desjardins' },
    { id: 'tangerine', name: 'Tangerine' },
    { id: 'simplii', name: 'Simplii Financial' },
    { id: 'eq', name: 'EQ Bank' },
];

/**
 * The OAuth bounce has to return to the SAME backend that issued the link token.
 * This was hardcoded to the production host, so a build pointed at staging would
 * send the user through production's /plaid/oauth-redirect and back into the
 * wrong environment.
 *
 * Every host this can resolve to must also be registered under Redirect URIs in
 * the Plaid dashboard, alongside the backend's own PLAID_OAUTH_REDIRECT_URI.
 */
const oauthRedirectUri = () => `${getApiTarget().url}/plaid/oauth-redirect`;

const makeStyles = (t) => StyleSheet.create({
    progress: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    progressDot: {
        width: 24,
        height: 4,
        borderRadius: 2,
        backgroundColor: t.SURFACE_SUNKEN,
    },
    progressDotActive: { backgroundColor: t.ACCENT },

    title: { marginBottom: SPACING.SMALL + 4 },
    subtitle: { marginBottom: SPACING.XL },

    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    bankCard: {
        width: '48%',
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.LARGE,
        borderWidth: 1,
        borderColor: t.CARD_BORDER_WIDTH ? t.CARD_BORDER : 'transparent',
        padding: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
        ...t.ELEVATION.CARD,
    },
    bankCardSelected: {
        borderColor: t.ACCENT,
        backgroundColor: t.ACCENT_DIM,
    },
    bankIcon: {
        width: 46,
        height: 46,
        borderRadius: RADIUS.MEDIUM,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.SMALL + 4,
    },
    bankName: { marginBottom: 2 },
    selectedBadge: {
        position: 'absolute',
        top: SPACING.SMALL,
        right: SPACING.SMALL,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: t.ACCENT,
        justifyContent: 'center',
        alignItems: 'center',
    },

    security: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.SMALL,
        backgroundColor: t.SUCCESS_DIM,
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: 10,
        borderRadius: RADIUS.LARGE,
        marginTop: SPACING.SMALL,
        marginBottom: SPACING.LARGE,
    },
    poweredBy: {
        textAlign: 'center',
        marginTop: SPACING.MEDIUM,
    },

    sheetTitle: { marginBottom: SPACING.MEDIUM },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.HAIRLINE,
    },
    searchName: { flex: 1 },
    searchEmpty: {
        textAlign: 'center',
        paddingVertical: SPACING.XL,
    },

    successOverlay: {
        flex: 1,
        backgroundColor: t.SCRIM,
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.LARGE,
    },
    successCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.CARD,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        padding: SPACING.XL,
        alignItems: 'center',
        ...t.ELEVATION.SHEET,
    },
    successIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: t.ACCENT,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.LARGE,
    },
    successMessage: {
        textAlign: 'center',
        marginTop: SPACING.SMALL,
        marginBottom: SPACING.LARGE,
    },
});

const ConnectBankScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [selectedBank, setSelectedBank] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [successVisible, setSuccessVisible] = useState(false);

    // Store the link token so we can resume after an external-browser OAuth redirect
    const linkTokenRef = useRef(null);

    // Detect if we're in onboarding flow or accessed from main app
    const isOnboarding = route?.params?.isOnboarding ?? false;

    // Listen for the deep link that fires when the user returns from an external OAuth browser.
    // Flow: Plaid → bank OAuth (external browser) → https redirect → induswealth:// deep link → here.
    useEffect(() => {
        const handleDeepLink = async ({ url }) => {
            if (!url || !url.startsWith('induswealth://plaid-oauth')) return;
            if (!linkTokenRef.current) return;

            console.log('🔁 Resuming Plaid OAuth from deep link:', url);
            setLoading(true);
            try {
                await create({ token: linkTokenRef.current });
                open({
                    oauthRedirectUri: url,
                    onSuccess: handlePlaidSuccess,
                    onExit: handlePlaidExit,
                });
            } catch (err) {
                console.error('❌ Failed to resume Plaid OAuth:', err);
                setLoading(false);
            }
        };

        const subscription = Linking.addEventListener('url', handleDeepLink);
        return () => subscription.remove();
    }, []);

    const filteredBanks = ALL_BANKS.filter((bank) =>
        bank.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleBankSelect = (bank) => {
        if (bank.isSearch) {
            setSearchVisible(true);
        } else {
            setSelectedBank(bank.id);
        }
    };

    const handleSearchBankSelect = (bank) => {
        setSelectedBank(bank.id);
        setSearchVisible(false);
        setSearchQuery('');
    };

    // Shared success handler — used by both the initial open() and the OAuth resume path
    const handlePlaidSuccess = async (success) => {
        // Don't log the public token — it's a bearer credential (short-lived, but
        // still exchangeable for an access token). Log only that we succeeded.
        console.log('🎉 Plaid Link success — exchanging public token');
        try {
            const exchangeResponse = await api.exchangePublicToken(success.publicToken);

            if (exchangeResponse.success) {
                console.log('✅ Bank connected successfully!');

                const cachedUser = await cache.getCachedUser();
                if (cachedUser) {
                    cachedUser.hasPlaidLinked = true;
                    await cache.setCachedUser(cachedUser);
                }

                await new Promise((resolve) => setTimeout(resolve, 2000));

                if (isOnboarding) {
                    navigation.reset({
                        index: 0,
                        routes: [
                            {
                                name: 'Main',
                                state: {
                                    routes: [
                                        {
                                            name: 'Insights',
                                            params: { forceRefresh: true, fromBankConnection: true },
                                        },
                                    ],
                                    index: 0,
                                },
                            },
                        ],
                    });
                } else {
                    setSuccessVisible(true);
                }
            } else {
                throw new Error(exchangeResponse.message || 'Failed to save bank connection');
            }
        } catch (exchangeError) {
            console.error('Exchange error:', exchangeError);
            showAlert('Connection Error', 'Connected to bank but failed to save. Please try again.');
        }
        setLoading(false);
    };

    // Shared exit handler
    const handlePlaidExit = (exit) => {
        console.log('📤 Plaid Link exited:', JSON.stringify(exit));
        if (exit?.error) {
            console.error('❌ Plaid Link exit error:', exit.error);
            showAlert('Connection Error', exit.error.displayMessage || 'Failed to connect to your bank.');
        }
        setLoading(false);
    };

    const handleContinue = async () => {
        if (!selectedBank) {
            showAlert('Select a Bank', 'Please select your bank to continue.');
            return;
        }

        setLoading(true);

        try {
            // Step 1: Get link_token from backend
            console.log('🔗 Fetching link token from backend...');
            const linkTokenResponse = await api.createLinkToken();

            if (!linkTokenResponse.link_token) {
                console.error('❌ No link token in response:', linkTokenResponse);
                throw new Error('Failed to get link token');
            }

            // Store token so the OAuth deep link resume handler can reuse it
            linkTokenRef.current = linkTokenResponse.link_token;
            console.log('✅ Got link token:', linkTokenResponse.link_token.substring(0, 30) + '...');

            // Step 2: Create Plaid Link configuration
            console.log('🔧 Creating Plaid Link configuration...');
            try {
                await create({ token: linkTokenResponse.link_token });
                console.log('✅ Plaid Link created successfully');
            } catch (createError) {
                console.error('❌ Plaid Link create() failed:', createError);
                throw createError;
            }

            // Step 3: Open Plaid Link
            // No timeout — onSuccess and onExit handle all terminal states.
            // oauthRedirectUri is required for Canadian banks (all use OAuth).
            // The backend /plaid/oauth-redirect endpoint bounces back to the app via deep link.
            console.log('🚀 Opening Plaid Link...');
            try {
                // await so a missing/failed native module (e.g. running in Expo
                // Go, which cannot load Plaid) surfaces as an alert instead of
                // an unhandled rejection and an infinite spinner
                await open({
                    oauthRedirectUri: oauthRedirectUri(),
                    onSuccess: handlePlaidSuccess,
                    onExit: handlePlaidExit,
                });
                console.log('📋 Plaid Link open() called');
            } catch (openError) {
                console.error('❌ Plaid Link open() failed:', openError);
                throw openError;
            }
        } catch (error) {
            console.error('❌ Bank connection error:', error);
            showAlert('Connection Error', error.message || 'Failed to connect to your bank. Please try again.');
            setLoading(false);
        }
    };

    const handleSkip = () => {
        if (!isOnboarding) {
            navigation.goBack();
            return;
        }

        showAlert(
            'Skip bank connection?',
            'You can connect your bank later from Profile settings.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Skip for now',
                    onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }),
                },
            ]
        );
    };

    const renderBankCard = (bank) => {
        const isSelected = selectedBank === bank.id;
        const hue = bank.colorIndex == null ? theme.TEXT_MUTED : categoryColor(theme, bank.colorIndex);

        return (
            <TouchableOpacity
                key={bank.id}
                style={[styles.bankCard, isSelected && styles.bankCardSelected]}
                onPress={() => handleBankSelect(bank)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
            >
                <View style={[styles.bankIcon, { backgroundColor: alpha(hue, 0.14) }]}>
                    <MaterialCommunityIcons name={bank.icon} size={26} color={hue} />
                </View>
                <Text variant="bodyMed" style={styles.bankName} numberOfLines={1}>{bank.name}</Text>
                <Text variant="meta" tone="muted">{bank.subtitle}</Text>

                {isSelected ? (
                    <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={13} color={theme.TEXT_ON_ACCENT} />
                    </View>
                ) : null}
            </TouchableOpacity>
        );
    };

    return (
        <AuthLayout
            onBack={() => navigation.goBack()}
            title={isOnboarding ? undefined : 'Add account'}
            middle={isOnboarding ? (
                <View style={styles.progress}>
                    <View style={[styles.progressDot, styles.progressDotActive]} />
                    <View style={[styles.progressDot, styles.progressDotActive]} />
                    <View style={[styles.progressDot, styles.progressDotActive]} />
                </View>
            ) : undefined}
            right={isOnboarding ? (
                <TouchableOpacity onPress={handleSkip} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text variant="label" tone="secondary">Skip</Text>
                </TouchableOpacity>
            ) : undefined}
        >
            <ScrollView showsVerticalScrollIndicator={false}>
                <Text variant="h1" style={styles.title}>Connect your bank</Text>
                <Text variant="body" tone="secondary" style={styles.subtitle}>
                    Select your primary banking institution to securely link your accounts
                    to <Text variant="bodyMed" tone="accent">IndusWealth</Text>.
                </Text>

                <View style={styles.grid}>
                    {FEATURED_BANKS.map(renderBankCard)}
                </View>

                <View style={styles.security}>
                    <Ionicons name="lock-closed" size={14} color={theme.SUCCESS} />
                    <Text variant="label" tone="success">Bank-grade 256-bit encryption</Text>
                </View>

                <Button
                    title="Continue"
                    onPress={handleContinue}
                    loading={loading}
                    disabled={!selectedBank}
                    block
                />

                <Text variant="overline" tone="muted" style={styles.poweredBy}>Powered by Plaid</Text>
            </ScrollView>

            <BottomSheet
                visible={searchVisible}
                onClose={() => {
                    setSearchVisible(false);
                    setSearchQuery('');
                }}
                scroll={false}
            >
                <Text variant="h2" style={styles.sheetTitle}>Find your bank</Text>

                <Input
                    placeholder="Search banks…"
                    icon="search-outline"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onClear={() => setSearchQuery('')}
                    autoFocus
                />

                <FlatList
                    data={filteredBanks}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.searchRow}
                            onPress={() => handleSearchBankSelect(item)}
                            accessibilityRole="button"
                        >
                            <MaterialCommunityIcons name="bank" size={22} color={theme.TEXT_MUTED} />
                            <Text variant="body" style={styles.searchName}>{item.name}</Text>
                            {selectedBank === item.id ? (
                                <Ionicons name="checkmark-circle" size={20} color={theme.SUCCESS} />
                            ) : null}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <Text variant="body" tone="muted" style={styles.searchEmpty}>No banks found</Text>
                    }
                />
            </BottomSheet>

            <CustomAlert {...alertProps} />

            <Modal
                visible={successVisible}
                animationType="fade"
                transparent
                statusBarTranslucent
                presentationStyle="overFullScreen"
                onRequestClose={() => {
                    setSuccessVisible(false);
                    navigation.goBack();
                }}
            >
                <StatusBar barStyle={theme.statusBarStyle} />
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <View style={styles.successIcon}>
                            <Ionicons name="checkmark" size={36} color={theme.TEXT_ON_ACCENT} />
                        </View>

                        <Text variant="h1">Connected</Text>
                        <Text variant="body" tone="secondary" style={styles.successMessage}>
                            Your bank account has been successfully linked to IndusWealth.
                        </Text>

                        <Button
                            title="Continue"
                            block
                            onPress={() => {
                                setSuccessVisible(false);
                                // Close this screen first, then jump to Insights — navigating
                                // while the modal is still mounted leaves it over the tab.
                                navigation.goBack();
                                setTimeout(() => {
                                    navigation.navigate('Insights', {
                                        forceRefresh: true,
                                        fromBankConnection: true,
                                    });
                                }, 100);
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </AuthLayout>
    );
};

export default ConnectBankScreen;
