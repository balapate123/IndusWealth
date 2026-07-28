import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { AuthFooter, AuthHero, AuthLayout } from '../components/AuthChrome';
import { Button, Card, Input, Text, CODE_INPUT_STYLE } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import { api } from '../services/api';
import cache from '../services/cache';
import { identify, track, EVENTS } from '../services/analytics';

const COOLDOWN_SECONDS = 60;

const makeStyles = () => StyleSheet.create({
    card: { padding: SPACING.LARGE },
    resend: {
        alignItems: 'center',
        paddingVertical: SPACING.SMALL,
        marginTop: SPACING.SMALL + 2,
    },
});

const EmailVerificationScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    // codeJustSent is set when arriving straight from signup, where the server
    // has only just sent one. Arriving from a blocked sign-in, whatever code
    // they have may be long expired, so don't make them wait to ask for another.
    const { email, codeJustSent = false } = route.params;
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resending, setResending] = useState(false);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (codeJustSent) startCooldown();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const startCooldown = () => {
        setResendCooldown(COOLDOWN_SECONDS);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(() => {
            setResendCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleVerify = async () => {
        if (!code || code.length < 6) {
            showAlert('Error', 'Please enter the 6-digit verification code');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.verifyEmail(email, code);

            if (response.success) {
                identify(response.user.id.toString());
                track(EVENTS.EMAIL_VERIFIED);

                // Verification is what mints the session, so this is the first
                // point at which the app may consider itself signed in.
                await cache.setCachedUser(response.user);
                global.CURRENT_USER_ID = response.user.id;

                showAlert(
                    'Email verified',
                    'Your email has been verified successfully.',
                    [{
                        text: 'Continue',
                        onPress: () => navigation.navigate('ConnectBank', { isOnboarding: true }),
                    }]
                );
            } else {
                showAlert('Verification Failed', response.message || 'Invalid verification code');
            }
        } catch (error) {
            console.error('Verification error:', error);
            showAlert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;

        setResending(true);
        try {
            const response = await api.auth.resendVerification(email);

            if (response.success) {
                showAlert('Code sent', 'A new verification code has been sent to your email.');
                startCooldown();
            } else {
                showAlert('Error', response.message || 'Could not resend verification code');
            }
        } catch (error) {
            console.error('Resend error:', error);
            showAlert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout scroll centered>
            <AuthHero
                icon="mail-outline"
                title="Check your email"
                subtitle={(
                    <>
                        We've sent a verification code to{'\n'}
                        <Text variant="bodyMed" tone="accent">{email}</Text>
                    </>
                )}
            />

            <Card inset={false} padded={false} style={styles.card}>
                <Input
                    label="Verification code"
                    placeholder="000000"
                    value={code}
                    onChangeText={setCode}
                    inputStyle={CODE_INPUT_STYLE}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                />

                <Button
                    title="Verify email"
                    icon="checkmark-circle"
                    onPress={handleVerify}
                    loading={loading}
                    block
                />

                <TouchableOpacity
                    style={styles.resend}
                    onPress={handleResend}
                    disabled={resendCooldown > 0 || resending}
                    accessibilityRole="button"
                >
                    {resending ? (
                        <ActivityIndicator size="small" color={theme.ACCENT} />
                    ) : (
                        <Text variant="label" tone={resendCooldown > 0 ? 'muted' : 'link'}>
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                        </Text>
                    )}
                </TouchableOpacity>
            </Card>

            <AuthFooter
                text="Wrong email?"
                linkText="Back to sign in"
                onPress={() => navigation.navigate('Login')}
            />

            <CustomAlert {...alertProps} />
        </AuthLayout>
    );
};

export default EmailVerificationScreen;
