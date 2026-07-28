import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { AuthFooter, AuthHero, AuthLayout } from '../components/AuthChrome';
import { Button, Card, Input, Text } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import PasswordStrength from '../components/PasswordStrength';
import useAlert from '../hooks/useAlert';
import { api } from '../services/api';
import cache from '../services/cache';
import { identify, track, EVENTS } from '../services/analytics';

const makeStyles = (t) => StyleSheet.create({
    card: { padding: SPACING.LARGE },
    terms: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.LARGE,
        gap: SPACING.SMALL + 2,
    },
    // Unchecked has to read as unchecked. The old checkbox was filled gold
    // regardless of state, so the only cue was a checkmark glyph that most
    // people never noticed missing before hitting "please agree to the terms".
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: RADIUS.SMALL - 2,
        borderWidth: 1.5,
        borderColor: t.HAIRLINE_STRONG,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 1,
    },
    checkboxOn: {
        backgroundColor: t.ACCENT,
        borderColor: t.ACCENT,
    },
    termsText: { flex: 1 },
    security: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: SPACING.LARGE,
        gap: 6,
    },
});

const SignupScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);

    const handleSignup = async () => {
        if (!name || !email || !password || !confirmPassword) {
            showAlert('Error', 'Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            showAlert('Error', 'Passwords do not match');
            return;
        }

        if (!agreeTerms) {
            showAlert('Error', 'Please agree to Terms and Conditions');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.signup(name, email, password);

            if (response.success) {
                // Track signup event — pseudonymous ID only, no PII to Mixpanel
                identify(response.user.id.toString());
                track(EVENTS.SIGNUP);

                // Auto login after signup
                await cache.setCachedUser(response.user);

                // Set global user ID
                global.CURRENT_USER_ID = response.user.id;

                // Navigate to email verification
                navigation.navigate('EmailVerification', {
                    email: email,
                    name: name,
                });
            } else {
                showAlert('Signup Failed', response.message || 'Could not create account');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showAlert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout scroll onBack={() => navigation.goBack()}>
            <AuthHero
                icon="person-add-outline"
                title="Create your account"
                subtitle="Start building your wealth today."
            />

            <Card inset={false} padded={false} style={styles.card}>
                <Input
                    label="Full name"
                    placeholder="Jane Doe"
                    icon="person-outline"
                    value={name}
                    onChangeText={setName}
                    autoComplete="name"
                />

                <Input
                    label="Email address"
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
                    autoComplete="new-password"
                    secureTextEntry
                />

                <PasswordStrength password={password} />

                <Input
                    label="Confirm password"
                    placeholder="••••••••"
                    icon="repeat-outline"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoComplete="new-password"
                    secureTextEntry
                    error={
                        confirmPassword && confirmPassword !== password
                            ? 'Passwords do not match'
                            : undefined
                    }
                />

                <View style={styles.terms}>
                    <TouchableOpacity
                        onPress={() => setAgreeTerms((v) => !v)}
                        style={[styles.checkbox, agreeTerms && styles.checkboxOn]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: agreeTerms }}
                        accessibilityLabel="Agree to the Terms and Privacy Policy"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        {agreeTerms ? (
                            <Ionicons name="checkmark" size={15} color={theme.TEXT_ON_ACCENT} />
                        ) : null}
                    </TouchableOpacity>

                    <Text variant="meta" tone="secondary" style={styles.termsText}>
                        By signing up, you agree to our{' '}
                        <Text
                            variant="meta"
                            tone="link"
                            onPress={() => navigation.navigate('LegalDoc', { docType: 'terms' })}
                        >
                            Terms and Conditions
                        </Text>
                        {' '}and{' '}
                        <Text
                            variant="meta"
                            tone="link"
                            onPress={() => navigation.navigate('LegalDoc', { docType: 'privacy' })}
                        >
                            Privacy Policy
                        </Text>.
                    </Text>
                </View>

                <Button
                    title="Create account"
                    icon="arrow-forward"
                    onPress={handleSignup}
                    loading={loading}
                    block
                />
            </Card>

            <AuthFooter
                text="Already have an account?"
                linkText="Sign in"
                onPress={() => navigation.navigate('Login')}
            />

            <View style={styles.security}>
                <Ionicons name="shield-checkmark-outline" size={13} color={theme.TEXT_MUTED} />
                <Text variant="overline" tone="muted">Bank-grade security</Text>
            </View>

            <CustomAlert {...alertProps} />
        </AuthLayout>
    );
};

export default SignupScreen;
