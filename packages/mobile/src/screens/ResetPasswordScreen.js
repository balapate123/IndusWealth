import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { AuthFooter, AuthHero, AuthLayout } from '../components/AuthChrome';
import { Button, Card, Input, Text, CODE_INPUT_STYLE } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import PasswordStrength from '../components/PasswordStrength';
import useAlert from '../hooks/useAlert';
import { api } from '../services/api';
import { track, EVENTS } from '../services/analytics';

const makeStyles = () => StyleSheet.create({
    card: { padding: SPACING.LARGE },
});

const ResetPasswordScreen = ({ navigation, route }) => {
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const { email } = route.params;
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

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
                    'Password reset',
                    'Your password has been reset successfully.',
                    [{
                        text: 'Back to sign in',
                        onPress: () => navigation.navigate('Login'),
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
        <AuthLayout scroll onBack={() => navigation.goBack()}>
            <AuthHero
                icon="key-outline"
                title="Reset password"
                subtitle={(
                    <>
                        Enter the code sent to{' '}
                        <Text variant="bodyMed" tone="accent">{email}</Text>
                        {' '}and your new password.
                    </>
                )}
            />

            <Card inset={false} padded={false} style={styles.card}>
                <Input
                    label="Reset code"
                    placeholder="000000"
                    value={code}
                    onChangeText={setCode}
                    inputStyle={CODE_INPUT_STYLE}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                />

                <Input
                    label="New password"
                    placeholder="Enter new password"
                    icon="lock-closed-outline"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    autoComplete="new-password"
                    secureTextEntry
                />

                <PasswordStrength password={newPassword} />

                <Input
                    label="Confirm password"
                    placeholder="Confirm new password"
                    icon="repeat-outline"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoComplete="new-password"
                    secureTextEntry
                    error={
                        confirmPassword && confirmPassword !== newPassword
                            ? 'Passwords do not match'
                            : undefined
                    }
                />

                <Button
                    title="Reset password"
                    icon="shield-checkmark"
                    onPress={handleResetPassword}
                    loading={loading}
                    block
                />
            </Card>

            <AuthFooter
                text="Remember your password?"
                linkText="Back to sign in"
                onPress={() => navigation.navigate('Login')}
            />

            <CustomAlert {...alertProps} />
        </AuthLayout>
    );
};

export default ResetPasswordScreen;
