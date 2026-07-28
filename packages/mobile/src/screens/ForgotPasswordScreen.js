import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { AuthFooter, AuthHero, AuthLayout } from '../components/AuthChrome';
import { Button, Card, Input } from '../components/ui';
import CustomAlert from '../components/CustomAlert';
import useAlert from '../hooks/useAlert';
import { api } from '../services/api';
import { track, EVENTS } from '../services/analytics';

const makeStyles = () => StyleSheet.create({
    card: { padding: SPACING.LARGE },
});

const ForgotPasswordScreen = ({ navigation }) => {
    const styles = useThemedStyles(makeStyles);
    const { showAlert, alertProps } = useAlert();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSendCode = async () => {
        if (!email) {
            showAlert('Error', 'Please enter your email address');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.forgotPassword(email);

            if (response.success) {
                track(EVENTS.PASSWORD_RESET_REQUESTED);
                navigation.navigate('ResetPassword', { email });
            } else {
                showAlert('Error', response.message || 'Could not send reset code');
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            showAlert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout scroll centered onBack={() => navigation.goBack()}>
            <AuthHero
                icon="lock-open-outline"
                title="Forgot password?"
                subtitle="Enter your email and we'll send you a reset code."
            />

            <Card inset={false} padded={false} style={styles.card}>
                <Input
                    label="Email address"
                    placeholder="you@example.com"
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    autoFocus
                />

                <Button
                    title="Send reset code"
                    icon="send"
                    onPress={handleSendCode}
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

export default ForgotPasswordScreen;
