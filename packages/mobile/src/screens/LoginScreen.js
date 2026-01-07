import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TextInput,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    ActivityIndicator,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { api } from '../services/api';
import cache from '../services/cache';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter email and password');
            return;
        }

        setLoading(true);
        try {
            console.log('Attempting login for:', email);
            const response = await api.auth.login(email, password);

            if (response.success) {
                console.log('Login success:', response.user.email);

                // Save user session
                await cache.setCachedUser(response.user);

                // Set global user ID for API requests
                global.CURRENT_USER_ID = response.user.id;

                // Navigate to Main App
                // We use replace to prevent going back to login
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                Alert.alert('Login Failed', response.message || 'Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background Gradient */}
            <LinearGradient
                colors={[COLORS.BACKGROUND, '#0F172A', '#1E293B']}
                style={StyleSheet.absoluteFillObject}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.content}>
                    {/* Logo Section */}
                    <View style={styles.logoSection}>
                        <View style={styles.logoContainer}>
                            <Image
                                source={require('../../assets/indus-icon.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={styles.appName}>IndusWealth</Text>
                        <Text style={styles.tagline}>M O D E R N   T R U S T</Text>
                    </View>

                    {/* Login Card */}
                    <View style={styles.card}>
                        <Text style={styles.welcomeText}>Welcome Back</Text>
                        <Text style={styles.subtitleText}>Please enter your details to sign in.</Text>

                        {/* Email Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>Email or Username</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="user@example.com"
                                placeholderTextColor="#64748B"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        {/* Password Input */}
                        <View style={styles.inputLabelContainer}>
                            <Text style={styles.inputLabel}>Password</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={[styles.input, { paddingRight: 50 }]}
                                placeholder="••••••••"
                                placeholderTextColor="#64748B"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="#94A3B8"
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.forgotButton}>
                            <Text style={styles.forgotText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        {/* Login Button */}
                        <TouchableOpacity
                            style={styles.loginButtonContainer}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#C5A028']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.loginButton}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#1E293B" />
                                ) : (
                                    <>
                                        <Text style={styles.loginButtonText}>Secure Login</Text>
                                        <Ionicons name="lock-closed" size={18} color="#1E293B" style={{ marginLeft: 8 }} />
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>OR LOGIN WITH</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Social Login Placeholder */}
                        <TouchableOpacity style={styles.socialButton}>
                            <Ionicons name="logo-apple" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>New to IndusWealth? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                            <Text style={styles.footerLink}>Create an account</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
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
    logoSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        width: 80,
        height: 80,
        borderRadius: 20,
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.MEDIUM,
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    logo: {
        width: 50,
        height: 50,
    },
    appName: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.WHITE,
        marginBottom: 8,
    },
    tagline: {
        fontSize: 12,
        color: '#D4AF37', // Gold
        letterSpacing: 3,
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#1E293B', // Slate 800
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
    welcomeText: {
        fontSize: 24,
        fontWeight: '600',
        color: COLORS.WHITE,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitleText: {
        fontSize: 14,
        color: '#94A3B8', // Slate 400
        textAlign: 'center',
        marginBottom: 32,
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
        backgroundColor: '#0F172A', // Slate 900
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 16,
        height: 50,
    },
    input: {
        flex: 1,
        color: COLORS.WHITE,
        paddingHorizontal: 16,
        fontSize: 16,
        height: '100%',
    },
    eyeIcon: {
        padding: 10,
    },
    forgotButton: {
        alignItems: 'flex-end',
        marginBottom: 24,
    },
    forgotText: {
        color: '#D4AF37',
        fontSize: 14,
    },
    loginButtonContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    loginButton: {
        height: 50,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginButtonText: {
        color: '#1E293B',
        fontSize: 16,
        fontWeight: '700',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#334155',
    },
    dividerText: {
        color: '#64748B',
        paddingHorizontal: 16,
        fontSize: 12,
        letterSpacing: 1,
    },
    socialButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#334155',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: '#475569',
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
        color: COLORS.WHITE,
        fontWeight: '600',
        fontSize: 14,
    },
});

export default LoginScreen;
