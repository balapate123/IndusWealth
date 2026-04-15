import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { api } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { track, EVENTS } from '../services/analytics';

const COOLDOWN_SECONDS = 60;

const EmailVerificationScreen = ({ navigation, route }) => {
    const { email, name } = route.params;
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resending, setResending] = useState(false);
    const intervalRef = useRef(null);

    // Custom Alert state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        title: '',
        message: '',
        buttons: []
    });

    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({
            title,
            message,
            buttons: buttons.length > 0 ? buttons : [{ text: 'OK', onPress: () => setAlertVisible(false) }]
        });
        setAlertVisible(true);
    };

    // Start cooldown timer on mount
    useEffect(() => {
        startCooldown();
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
            const response = await api.auth.verifyEmail(code);

            if (response.success) {
                track(EVENTS.EMAIL_VERIFIED);
                showAlert(
                    'Email Verified',
                    'Your email has been verified successfully!',
                    [{
                        text: 'Continue',
                        onPress: () => {
                            setAlertVisible(false);
                            navigation.navigate('ConnectBank', { isOnboarding: true });
                        }
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
            const response = await api.auth.resendVerification();

            if (response.success) {
                showAlert('Code Sent', 'A new verification code has been sent to your email.');
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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <LinearGradient
                colors={[COLORS.BACKGROUND, '#0F172A', '#1E293B']}
                style={StyleSheet.absoluteFillObject}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.content}>
                    {/* Mail Icon */}
                    <View style={styles.iconContainer}>
                        <Ionicons name="mail-outline" size={80} color="#D4AF37" />
                    </View>

                    <Text style={styles.title}>Check Your Email</Text>
                    <Text style={styles.subtitle}>
                        We've sent a verification code to{'\n'}
                        <Text style={styles.emailText}>{email}</Text>
                    </Text>

                    {/* Verification Card */}
                    <View style={styles.card}>
                        {/* Code Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>Verification Code</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.codeInput}
                                placeholder="000000"
                                placeholderTextColor="#64748B"
                                value={code}
                                onChangeText={setCode}
                                keyboardType="number-pad"
                                maxLength={6}
                                autoFocus
                            />
                        </View>

                        {/* Verify Button */}
                        <TouchableOpacity
                            style={styles.buttonContainer}
                            onPress={handleVerify}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#C5A028']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.button}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#1E293B" />
                                ) : (
                                    <>
                                        <Text style={styles.buttonText}>Verify Email</Text>
                                        <Ionicons name="checkmark-circle" size={20} color="#1E293B" style={{ marginLeft: 8 }} />
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Resend Code */}
                        <TouchableOpacity
                            style={styles.resendButton}
                            onPress={handleResend}
                            disabled={resendCooldown > 0 || resending}
                        >
                            {resending ? (
                                <ActivityIndicator color="#D4AF37" size="small" />
                            ) : (
                                <Text style={[
                                    styles.resendText,
                                    resendCooldown > 0 && styles.resendTextDisabled
                                ]}>
                                    {resendCooldown > 0
                                        ? `Resend in ${resendCooldown}s`
                                        : 'Resend Code'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Wrong email? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.footerLink}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

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
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: SPACING.LARGE,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#94A3B8',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 20,
    },
    emailText: {
        color: '#D4AF37',
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#1E293B',
        borderRadius: 24,
        padding: SPACING.LARGE,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    inputLabelContainer: {
        marginBottom: 8,
    },
    inputLabel: {
        fontSize: 14,
        color: COLORS.WHITE,
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 24,
        height: 50,
    },
    codeInput: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 24,
        height: '100%',
        textAlign: 'center',
        letterSpacing: 8,
    },
    buttonContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    button: {
        height: 50,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#1E293B',
        fontSize: 16,
        fontWeight: '700',
    },
    resendButton: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    resendText: {
        color: '#D4AF37',
        fontSize: 14,
        fontWeight: '700',
    },
    resendTextDisabled: {
        color: '#64748B',
        fontWeight: '400',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 32,
    },
    footerText: {
        color: '#94A3B8',
        fontSize: 14,
    },
    footerLink: {
        color: '#D4AF37',
        fontWeight: '700',
        fontSize: 14,
    },
});

export default EmailVerificationScreen;
