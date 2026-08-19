import React, { useState, useEffect, useRef } from 'react';
import {
    AccessibilityInfo,
    Animated,
    Easing,
    Linking,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { alpha, RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { AuthLayout } from '../components/AuthChrome';
import { Button, Text } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import { create, open } from '../services/plaidLink';
import { api, getApiTarget } from '../services/api';
import cache from '../services/cache';

/**
 * There is deliberately no institution picker on this screen.
 *
 * It used to show a grid of four featured banks plus a searchable list of ten,
 * and then discard the choice: handleContinue checked that `selectedBank` was
 * truthy and called createLinkToken() without it. Plaid asks for the
 * institution anyway, so the user picked their bank twice and the first pick
 * changed nothing.
 *
 * The list being hardcoded made it worse than redundant. Plaid covers credit
 * unions and smaller institutions that were not among those ten, and Continue
 * stayed disabled until something was selected — so anyone banking outside the
 * list searched, got "No banks found", and could not proceed at all.
 *
 * What replaces it is a handoff card that sets the expectation Plaid is about
 * to take over, and answers the question actually on someone's mind at the
 * moment they hand over bank credentials: what do you get, and can you move my
 * money.
 */

/** The three nodes of the handoff, in the order the user will experience them. */
const HANDOFF_NODES = [
    { key: 'app', icon: 'wallet-outline', label: 'IndusWealth' },
    { key: 'plaid', icon: 'shield-check-outline', label: 'Plaid' },
    { key: 'bank', icon: 'bank-outline', label: 'Your bank' },
];

const WHAT_HAPPENS = [
    'Plaid opens in a secure window.',
    'You choose your institution and sign in there — never here.',
    'We receive read-only balances and transactions. Nothing else.',
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

    // The handoff diagram: three nodes, two runs of travelling dots between them.
    handoff: {
        backgroundColor: t.SURFACE,
        borderRadius: RADIUS.CARD,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        paddingVertical: SPACING.LARGE,
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: SPACING.LARGE,
        ...t.ELEVATION.CARD,
    },
    handoffRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    node: { alignItems: 'center', width: 84 },
    nodeCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.SMALL,
    },
    nodeLabel: { textAlign: 'center' },
    wire: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        // Lift the dots to the vertical centre of the circles above the labels.
        marginBottom: 22,
    },
    wireDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: t.ACCENT,
    },

    steps: { marginBottom: SPACING.LARGE },
    step: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.MEDIUM,
        marginBottom: SPACING.MEDIUM,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: t.ACCENT_DIM,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 1,
    },
    stepText: { flex: 1 },

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

/**
 * One run of travelling dots along the handoff wire.
 *
 * `progress` is a single shared 0..1 loop and each dot reads a staggered slice
 * of it, so the whole diagram animates off one driver. Opacity only, so it runs
 * on the native thread; the caller leaves the driver at 0 when Reduce Motion is
 * on, which renders the dots dim and still.
 */
const Wire = ({ progress, offset, styles }) => (
    <View style={styles.wire}>
        {[0, 1, 2].map((i) => {
            const start = 0.05 + offset + i * 0.16;
            return (
                <Animated.View
                    key={i}
                    style={[
                        styles.wireDot,
                        {
                            opacity: progress.interpolate({
                                inputRange: [0, start, start + 0.1, start + 0.2, 1],
                                outputRange: [0.2, 0.2, 1, 0.2, 0.2],
                                extrapolate: 'clamp',
                            }),
                        },
                    ]}
                />
            );
        })}
    </View>
);

const ConnectBankScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [loading, setLoading] = useState(false);
    const [successVisible, setSuccessVisible] = useState(false);

    // Store the link token so we can resume after an external-browser OAuth redirect
    const linkTokenRef = useRef(null);

    // One driver for every dot on the wire. Lazily created through useState
    // rather than useRef: each Wire reads this value during render to build its
    // interpolation, and reading a ref during render is exactly what
    // react-hooks/refs forbids. The initialiser runs once, so it is still a
    // single stable Animated.Value for the life of the screen.
    const [progress] = useState(() => new Animated.Value(0));

    // Detect if we're in onboarding flow or accessed from main app
    const isOnboarding = route?.params?.isOnboarding ?? false;

    // Respect Reduce Motion. A looping animation behind a bank-credentials
    // handoff is decoration, and decoration is what that setting is for.
    useEffect(() => {
        let loop;
        let cancelled = false;

        AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotion) => {
                if (cancelled || reduceMotion) return;
                loop = Animated.loop(
                    Animated.timing(progress, {
                        toValue: 1,
                        duration: 2200,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    })
                );
                loop.start();
            })
            .catch(() => { /* no accessibility service — leave the dots static */ });

        return () => {
            cancelled = true;
            loop?.stop();
        };
    }, [progress]);

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

    // Us, the custodian, and the bank we do not know yet. The hues carry that
    // meaning rather than decorating the row.
    const nodeColor = { app: theme.ACCENT, plaid: theme.SUCCESS, bank: theme.INFO };

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
                <Text variant="h1" style={styles.title}>Next stop: your bank</Text>
                <Text variant="body" tone="secondary" style={styles.subtitle}>
                    <Text variant="bodyMed" tone="accent">IndusWealth</Text> hands off to Plaid,
                    which handles the sign-in. You pick your institution there — credit unions and
                    smaller banks included.
                </Text>

                <View
                    style={styles.handoff}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel="IndusWealth connects to your bank through Plaid"
                >
                    <View style={styles.handoffRow}>
                        {HANDOFF_NODES.map((node, i) => (
                            <React.Fragment key={node.key}>
                                {i > 0 ? (
                                    <Wire progress={progress} offset={(i - 1) * 0.28} styles={styles} />
                                ) : null}
                                <View style={styles.node}>
                                    <View
                                        style={[
                                            styles.nodeCircle,
                                            { backgroundColor: alpha(nodeColor[node.key], 0.14) },
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name={node.icon}
                                            size={28}
                                            color={nodeColor[node.key]}
                                        />
                                    </View>
                                    <Text variant="meta" tone="secondary" style={styles.nodeLabel}>
                                        {node.label}
                                    </Text>
                                </View>
                            </React.Fragment>
                        ))}
                    </View>
                </View>

                <View style={styles.steps}>
                    {WHAT_HAPPENS.map((line, i) => (
                        <View key={line} style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text variant="meta" tone="accent">{i + 1}</Text>
                            </View>
                            <Text variant="body" tone="secondary" style={styles.stepText}>{line}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.security}>
                    <Ionicons name="lock-closed" size={14} color={theme.SUCCESS} />
                    <Text variant="label" tone="success">Read-only. We can never move your money.</Text>
                </View>

                <Button
                    title="Continue to Plaid"
                    onPress={handleContinue}
                    loading={loading}
                    block
                />

                <Text variant="overline" tone="muted" style={styles.poweredBy}>Powered by Plaid</Text>
            </ScrollView>

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
