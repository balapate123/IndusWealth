import React, { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { AuthFooter, AuthHero, AuthLayout } from '../components/AuthChrome';
import { Button, Card, Input, Text } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import { api } from '../services/api';
import cache from '../services/cache';
import { identify, track, EVENTS } from '../services/analytics';

const makeStyles = () => StyleSheet.create({
    logo: { width: 46, height: 46 },
    brand: { textAlign: 'center', marginBottom: 4 },
    tagline: { textAlign: 'center' },
    card: { padding: SPACING.LARGE },
    welcome: { textAlign: 'center' },
    subtitle: {
        textAlign: 'center',
        marginTop: 6,
        marginBottom: SPACING.LARGE,
    },
    forgot: {
        alignSelf: 'flex-end',
        marginTop: -SPACING.SMALL,
        marginBottom: SPACING.LARGE,
    },
    twoFactor: { marginBottom: SPACING.LARGE },
    twoFactorToggle: { alignSelf: 'flex-start', marginTop: -SPACING.SMALL },
});

const LoginScreen = ({ navigation }) => {
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // 2FA state
    const [needs2FA, setNeeds2FA] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            showAlert('Error', 'Please enter email and password');
            return;
        }

        // If 2FA is required, validate code
        if (needs2FA && !twoFactorCode.trim()) {
            showAlert('Error', 'Please enter your authentication code');
            return;
        }

        setLoading(true);
        try {
            console.log('Attempting login for:', email);
            const codeParam = needs2FA ? twoFactorCode.trim() : null;
            const recoveryParam = (needs2FA && useRecoveryCode) ? codeParam : null;
            const totpParam = (needs2FA && !useRecoveryCode) ? codeParam : null;

            const response = await api.auth.login(email, password, totpParam, recoveryParam);

            // Handle 2FA required
            if (response.code === '2FA_REQUIRED') {
                setNeeds2FA(true);
                setTwoFactorCode('');
                return;
            }

            // The password was right but the address was never confirmed. The
            // server issued no session; send them to finish the step they left,
            // rather than showing an error they cannot act on.
            if (response.code === 'EMAIL_NOT_VERIFIED') {
                navigation.navigate('EmailVerification', {
                    email: response.email || email,
                });
                return;
            }

            if (response.success) {
                console.log('Login success');

                // Track login event — pseudonymous ID only, no PII to Mixpanel
                identify(response.user.id.toString());
                track(EVENTS.LOGIN);

                // Save user session
                await cache.setCachedUser(response.user);

                // Set global user ID for API requests
                global.CURRENT_USER_ID = response.user.id;

                // Navigate to Main App
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                showAlert('Login Failed', response.message || 'Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            const errorCode = error.responseData?.code || error.parsedError?.code;

            if (errorCode === 'ACCOUNT_LOCKED') {
                showAlert('Account Locked', error.message || 'Too many failed attempts. Please try again later.');
            } else if (errorCode === 'INVALID_2FA') {
                showAlert('Invalid Code', 'The authentication code was incorrect. Please try again.');
                setTwoFactorCode('');
            } else {
                showAlert('Error', error.message || 'Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout scroll centered>
            <AuthHero>
                <Image
                    source={require('../../assets/indus-icon.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </AuthHero>

            <Text variant="h1" style={styles.brand}>IndusWealth</Text>
            <Text variant="overline" tone="accent" style={styles.tagline}>Modern Trust</Text>

            <Card inset={false} padded={false} style={styles.card}>
                <Text variant="h2" style={styles.welcome}>Welcome back</Text>
                <Text variant="body" tone="secondary" style={styles.subtitle}>
                    Please enter your details to sign in.
                </Text>

                <Input
                    label="Email"
                    placeholder="you@example.com"
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                />

                <Input
                    label="Password"
                    placeholder="••••••••"
                    icon="lock-closed-outline"
                    value={password}
                    onChangeText={setPassword}
                    autoComplete="password"
                    secureTextEntry
                />

                <TouchableOpacity
                    style={styles.forgot}
                    onPress={() => navigation.navigate('ForgotPassword')}
                    accessibilityRole="button"
                >
                    <Text variant="label" tone="link">Forgot password?</Text>
                </TouchableOpacity>

                {needs2FA ? (
                    <View style={styles.twoFactor}>
                        <Input
                            label={useRecoveryCode ? 'Recovery code' : 'Authentication code'}
                            placeholder={useRecoveryCode ? 'Enter recovery code' : 'Enter 6-digit code'}
                            icon="shield-checkmark-outline"
                            value={twoFactorCode}
                            onChangeText={setTwoFactorCode}
                            autoCapitalize="none"
                            keyboardType={useRecoveryCode ? 'default' : 'number-pad'}
                            maxLength={useRecoveryCode ? 8 : 6}
                            autoFocus
                        />
                        <TouchableOpacity
                            style={styles.twoFactorToggle}
                            onPress={() => {
                                setUseRecoveryCode((v) => !v);
                                setTwoFactorCode('');
                            }}
                            accessibilityRole="button"
                        >
                            <Text variant="label" tone="link">
                                {useRecoveryCode ? 'Use authenticator app instead' : 'Use a recovery code'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                <Button
                    title="Sign in"
                    icon="lock-closed"
                    onPress={handleLogin}
                    loading={loading}
                    block
                />
            </Card>

            <AuthFooter
                text="New to IndusWealth?"
                linkText="Create an account"
                onPress={() => navigation.navigate('Signup')}
            />

            <CustomAlert {...alertProps} />
        </AuthLayout>
    );
};

export default LoginScreen;
