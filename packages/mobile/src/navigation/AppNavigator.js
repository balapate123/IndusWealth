import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import InsightsScreen from '../screens/InsightsScreen';
import WatchdogScreen from '../screens/WatchdogScreen';
import DebtAttackScreen from '../screens/DebtAttackScreen';
import AllTransactionsScreen from '../screens/AllTransactionsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AdvancedAnalyticsScreen from '../screens/AdvancedAnalyticsScreen';
import AccountTransactionsScreen from '../screens/AccountTransactionsScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ConnectBankScreen from '../screens/ConnectBankScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AllAccountsScreen from '../screens/AllAccountsScreen';
import WealthAcademyScreen from '../screens/WealthAcademyScreen';
import ArticleWebViewScreen from '../screens/ArticleWebViewScreen';
import LegalDocScreen from '../screens/LegalDocScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import ETFListScreen from '../screens/ETFListScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import AppearanceScreen from '../screens/AppearanceScreen';
import { RADIUS } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text as UIText } from '../components/ui';
import cache from '../services/cache';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabBarIcon = ({ focused, name }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const iconMap = {
        'Home': 'home-outline',
        'Insights': 'bulb-outline',
        'Wealth': 'bar-chart-outline',
        'Guard': 'shield-checkmark-outline',
        'Profile': 'person-outline',
    };

    return (
        <View style={[styles.tabItem, focused && styles.tabItemActive]}>
            <Ionicons
                name={iconMap[name]}
                size={22}
                color={focused ? theme.TEXT_ON_ACCENT : theme.TEXT_MUTED}
            />
            <UIText
                variant="meta"
                tone={focused ? 'onAccent' : 'muted'}
                style={styles.tabLabel}
                numberOfLines={1}
            >
                {name}
            </UIText>
        </View>
    );
};

// Tab Navigator (Main App)
const TabNavigator = () => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarShowLabel: false,
                tabBarActiveTintColor: theme.ACCENT,
                tabBarInactiveTintColor: theme.TEXT_MUTED,
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Home" />,
                }}
            />
            <Tab.Screen
                name="Insights"
                component={InsightsScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Insights" />,
                }}
            />
            <Tab.Screen
                name="Wealth"
                component={DebtAttackScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Wealth" />,
                }}
            />
            <Tab.Screen
                name="Guard"
                component={WatchdogScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Guard" />,
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Profile" />,
                }}
            />
        </Tab.Navigator>
    );
};



// Auth Stack Navigator
const AuthStack = () => {
    const theme = useTheme();
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: theme.BG },
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="ConnectBank" component={ConnectBankScreen} />
        </Stack.Navigator>
    );
};

// Main App Navigator (Stack with Tabs + Modal Screens)
const AppNavigator = () => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const checkSession = async () => {
            try {
                // Initialize auth token from storage
                const { initializeAuth } = require('../services/api');
                const token = await initializeAuth();

                // Check for cached user
                const cachedUser = await cache.getCachedUser();
                if (cachedUser && token) {
                    global.CURRENT_USER_ID = cachedUser.id;
                    setUser(cachedUser);
                } else if (cachedUser && !token) {
                    // User cached but no token - clear stale session
                    await cache.clearUserCache();
                }
            } catch (error) {
                console.error('Session check failed:', error);
            } finally {
                setIsLoading(false);
            }
        };
        checkSession();
    }, []);

    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.ACCENT} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    cardStyle: { backgroundColor: theme.BG },
                }}
                initialRouteName={user ? "Main" : "Auth"}
            >
                <Stack.Screen name="Auth" component={AuthStack} />
                <Stack.Screen name="Main" component={TabNavigator} />
                <Stack.Screen
                    name="AllTransactions"
                    component={AllTransactionsScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="ConnectBank"
                    component={ConnectBankScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="Analytics"
                    component={AnalyticsScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="AdvancedAnalytics"
                    component={AdvancedAnalyticsScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="AccountTransactions"
                    component={AccountTransactionsScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="AllAccounts"
                    component={AllAccountsScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="WealthAcademy"
                    component={WealthAcademyScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="ArticleWebView"
                    component={ArticleWebViewScreen}
                    options={{
                        presentation: 'modal',
                    }}
                />
                <Stack.Screen
                    name="LegalDoc"
                    component={LegalDocScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="Feedback"
                    component={FeedbackScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="ETFList"
                    component={ETFListScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
                <Stack.Screen
                    name="Appearance"
                    component={AppearanceScreen}
                    options={{
                        presentation: 'card',
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const makeStyles = (t) => StyleSheet.create({
    // Solid surface with a neutral shadow. The old gold border plus gold glow
    // made a component you touch once per screen the loudest thing on it.
    tabBar: {
        backgroundColor: t.SURFACE,
        borderTopWidth: 0,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.CARD_BORDER,
        height: 66,
        position: 'absolute',
        bottom: 22,
        left: 16,
        right: 16,
        borderRadius: RADIUS.PILL,
        paddingHorizontal: 8,
        paddingTop: 0,
        paddingBottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        ...t.ELEVATION.FLOATING,
    },
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: RADIUS.LARGE + 4,
        flexDirection: 'column',
        minHeight: 48,
    },
    // Horizontal padding must match tabItem exactly. Widening it on activation
    // squeezed the longest label ("Insights") onto a second line the moment it
    // was tapped. The fill alone carries the active state; only the vertical
    // padding grows, which can't reflow text.
    tabItemActive: {
        backgroundColor: t.ACCENT,
        paddingVertical: 8,
    },
    // 10px rather than the 11px meta default: "Insights" is the longest label and
    // at 11px it only cleared its slot by ~3pt, which a 360pt-wide phone doesn't
    // have. Tab labels are the one place a sub-scale size is warranted.
    tabLabel: {
        marginTop: 2,
        fontSize: 10,
        lineHeight: 13,
    },
    container: {
        flex: 1,
        backgroundColor: t.BG,
    },
});

export default AppNavigator;
