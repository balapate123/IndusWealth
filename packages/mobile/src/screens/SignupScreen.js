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
    Alert,
    ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { api } from '../services/api';
import cache from '../services/cache';

const SignupScreen = ({ navigation }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);

    const handleSignup = async () => {
        if (!name || !email || !password || !confirmPassword) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        if (!agreeTerms) {
            Alert.alert('Error', 'Please agree to Terms and Conditions');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.signup(name, email, password);

            if (response.success) {
                // Auto login after signup
                // Save user session
                await cache.setCachedUser(response.user);

                // Set global user ID
                global.CURRENT_USER_ID = response.user.id;

                // Show success and navigate to bank connection
                Alert.alert(
                    'Welcome!',
                    'Your account has been created successfully. Let\'s connect your bank.',
                    [{
                        text: 'Connect Bank',
                        onPress: () => navigation.navigate('ConnectBank', { isOnboarding: true })
                    }]
                );
            } else {
                Alert.alert('Signup Failed', response.message || 'Could not create account');
            }
        } catch (error) {
            console.error('Signup error:', error);
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
                    <View style={styles.iconContainer}>
                        <Ionicons name="airplane" size={40} color="#D4AF37" />
                    </View>

                    <Text style={styles.title}>Create your account</Text>
                    <Text style={styles.subtitle}>Start building your wealth today with modern trust.</Text>

                    {/* Full Name */}
                    <Text style={styles.label}>Full Name</Text>
                    <View style={styles.inputContainer}>
                        <Ionicons name="person" size={20} color="#64748B" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="John Doe"
                            placeholderTextColor="#64748B"
                            value={name}
                            onChangeText={setName}
                        />
                    </View>

                    {/* Email */}
                    <Text style={styles.label}>Email Address</Text>
                    <View style={styles.inputContainer}>
                        <Ionicons name="mail" size={20} color="#64748B" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="name@example.com"
                            placeholderTextColor="#64748B"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    {/* Password */}
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed" size={20} color="#64748B" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor="#64748B"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#64748B" />
                        </TouchableOpacity>
                    </View>

                    {/* Confirm Password */}
                    <Text style={styles.label}>Confirm Password</Text>
                    <View style={styles.inputContainer}>
                        <Ionicons name="repeat" size={20} color="#64748B" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor="#64748B"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showPassword}
                        />
                    </View>

                    {/* Terms */}
                    <View style={styles.termsContainer}>
                        <TouchableOpacity onPress={() => setAgreeTerms(!agreeTerms)} style={styles.checkbox}>
                            {agreeTerms && <Ionicons name="checkmark" size={16} color="#0F172A" />}
                        </TouchableOpacity>
                        <Text style={styles.termsText}>
                            By signing up, you agree to our <Text style={styles.linkText}>Terms and Conditions</Text> and <Text style={styles.linkText}>Privacy Policy</Text>.
                        </Text>
                    </View>

                    {/* Signup Button */}
                    <TouchableOpacity
                        style={styles.buttonContainer}
                        onPress={handleSignup}
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
                                    <Text style={styles.buttonText}>Create Account</Text>
                                    <Ionicons name="arrow-forward" size={20} color="#1E293B" style={{ marginLeft: 8 }} />
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.dividerContainer}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>Or sign up with</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Social Buttons */}
                    <View style={styles.socialContainer}>
                        <TouchableOpacity style={styles.socialBtn}>
                            <Ionicons name="logo-google" size={20} color="#FFF" />
                            <Text style={styles.socialText}>Google</Text>
                        </TouchableOpacity>
                        <View style={{ width: 16 }} />
                        <TouchableOpacity style={styles.socialBtn}>
                            <Ionicons name="logo-apple" size={20} color="#FFF" />
                            <Text style={styles.socialText}>Apple</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.footerLink}>Log In</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.securityBadge}>
                        <Ionicons name="shield-checkmark" size={14} color="#64748B" />
                        <Text style={styles.securityText}>BANK GRADE SECURITY</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
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
        backgroundColor: 'rgba(30, 41, 59, 0.5)', // Slate 800 with opacity
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.3)', // Gold border
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
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    label: {
        color: COLORS.WHITE,
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E293B', // Slate 800
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
    termsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: '#D4AF37', // Checked by default for UI, visual logic handled by state
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        marginTop: 2,
    },
    termsText: {
        flex: 1,
        color: '#94A3B8',
        fontSize: 13,
        lineHeight: 20,
    },
    linkText: {
        color: '#D4AF37',
        fontWeight: '600',
    },
    buttonContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 32,
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
        fontSize: 14,
    },
    socialContainer: {
        flexDirection: 'row',
        marginBottom: 32,
    },
    socialBtn: {
        flex: 1,
        height: 50,
        backgroundColor: '#1E293B',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    socialText: {
        color: COLORS.WHITE,
        marginLeft: 8,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 32,
    },
    footerText: {
        color: '#94A3B8',
    },
    footerLink: {
        color: '#D4AF37',
        fontWeight: '700',
    },
    securityBadge: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    securityText: {
        color: '#64748B',
        fontSize: 10,
        marginLeft: 6,
        letterSpacing: 1,
        fontWeight: '600',
    },
});

export default SignupScreen;
