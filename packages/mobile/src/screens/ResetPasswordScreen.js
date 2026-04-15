import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { api } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { track, EVENTS } from '../services/analytics';

const getPasswordScore = (pw) => {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(4, Math.floor(score * 4 / 6));
};

const getStrengthLabel = (pw) => {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return labels[getPasswordScore(pw)];
};

const getStrengthColor = (pw) => {
    const colors = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#10B981'];
    return colors[getPasswordScore(pw)];
};

const ResetPasswordScreen = ({ navigation, route }) => {
    const { email } = route.params;
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    const handleResetPassword = async () => {
        if (!code || code.length < 6) {
            showAlert('Error', 'Please enter the 6-digit reset code');
            return;
        }

        if (!newPassword) {
            showAlert('Error', 'Please enter a new password');
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert('Error', 'Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            showAlert('Error', 'Password must be at least 8 characters');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.resetPassword(code, newPassword);

            if (response.success) {
                track(EVENTS.PASSWORD_RESET_COMPLETED);
                showAlert(
                    'Password Reset',
                    'Your password has been reset successfully.',
                    [{
                        text: 'Back to Login',
                        onPress: () => {
                            setAlertVisible(false);
                            navigation.navigate('Login');
                        }
                    }]
                );
            } else {
                showAlert('Error', response.message || 'Could not reset password');
            }
        } catch (error) {
            console.error('Reset password error:', error);
            showAlert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <LinearGradient
                colors={[COLORS.BACKGROUND, '#0F172A', '#1E293B']}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    {/* Icon */}
                    <View style={styles.iconContainer}>
                        <Ionicons name="key-outline" size={40} color="#D4AF37" />
                    </View>

                    <Text style={styles.title}>Reset Password</Text>
                    <Text style={styles.subtitle}>
                        Enter the code sent to{' '}
                        <Text style={styles.emailText}>{email}</Text>
                        {' '}and your new password.
                    </Text>

                    {/* Card */}
                    <View style={styles.card}>
                        {/* Reset Code Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>Reset Code</Text>
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
                            />
                        </View>

                        {/* New Password Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>New Password</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <Ionicons name="lock-closed" size={20} color="#64748B" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Enter new password"
                                placeholderTextColor="#64748B"
                                value={newPassword}
                                onChangeText={setNewPassword}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                <Ionicons
                                    name={showPassword ? 'eye-off' : 'eye'}
                                    size={20}
                                    color="#64748B"
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Password Strength Indicator */}
                        {newPassword.length > 0 && (
                            <View style={styles.strengthContainer}>
                                <View style={styles.strengthBarRow}>
                                    {[0, 1, 2, 3].map((i) => {
                                        const strength = getPasswordScore(newPassword);
                                        const colors = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#10B981'];
                                        return (
                                            <View
                                                key={i}
                                                style={[
                                                    styles.strengthSegment,
                                                    { backgroundColor: i <= strength ? colors[strength] : '#334155' }
                                                ]}
                                            />
                                        );
                                    })}
                                </View>
                                <Text style={[styles.strengthLabel, { color: getStrengthColor(newPassword) }]}>
                                    {getStrengthLabel(newPassword)}
                                </Text>
                                {newPassword.length > 0 && newPassword.length < 8 && (
                                    <Text style={styles.strengthHint}>Min 8 characters, 1 uppercase, 1 number</Text>
                                )}
                            </View>
                        )}

                        {/* Confirm Password Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>Confirm Password</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <Ionicons name="repeat" size={20} color="#64748B" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Confirm new password"
                                placeholderTextColor="#64748B"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showConfirmPassword}
                            />
                            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                <Ionicons
                                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                                    size={20}
                                    color="#64748B"
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Reset Password Button */}
                        <TouchableOpacity
                            style={styles.buttonContainer}
                            onPress={handleResetPassword}
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
                                        <Text style={styles.buttonText}>Reset Password</Text>
                                        <Ionicons name="shield-checkmark" size={18} color="#1E293B" style={{ marginLeft: 8 }} />
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Remember your password? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.footerLink}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
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
    header: {
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
        paddingHorizontal: SPACING.MEDIUM,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        padding: SPACING.LARGE,
        paddingTop: 0,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 25,
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        alignSelf: 'center',
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
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
        paddingHorizontal: 20,
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
        marginBottom: 20,
        height: 50,
        paddingHorizontal: 12,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 16,
        height: '100%',
    },
    codeInput: {
        flex: 1,
        color: COLORS.WHITE,
        fontSize: 24,
        height: '100%',
        textAlign: 'center',
        letterSpacing: 8,
    },
    strengthContainer: {
        marginTop: -12,
        marginBottom: 20,
    },
    strengthBarRow: {
        flexDirection: 'row',
        gap: 4,
        marginBottom: 6,
    },
    strengthSegment: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#334155',
    },
    strengthLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    strengthHint: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 2,
    },
    buttonContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 4,
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
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 32,
        marginBottom: 32,
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

export default ResetPasswordScreen;
