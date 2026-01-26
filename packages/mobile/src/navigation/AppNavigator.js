import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import InsightsScreen from '../screens/InsightsScreen';
import WatchdogScreen from '../screens/WatchdogScreen';
import DebtAttackScreen from '../screens/DebtAttackScreen';
import AllTransactionsScreen from '../screens/AllTransactionsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AccountTransactionsScreen from '../screens/AccountTransactionsScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ConnectBankScreen from '../screens/ConnectBankScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AllAccountsScreen from '../screens/AllAccountsScreen';
import { COLORS, BORDER_RADIUS, SPACING } from '../constants/theme';
import cache from '../services/cache';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabBarIcon = ({ focused, name, label }) => {
    const iconMap = {
        'Home': 'home-outline',
        'Insights': 'bulb-outline',
        'Wealth': 'bar-chart-outline',
        'Watchdog': 'location-outline',
        'Profile': 'person-outline',
    };

    return (
        <View style={[styles.tabItem, focused && styles.tabItemActive]}>
            <Ionicons
                name={iconMap[name]}
                size={22}
                color={focused ? COLORS.BACKGROUND : COLORS.GOLD}
            />
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                {name}
            </Text>
        </View>
    );
};

// Tab Navigator (Main App)
const TabNavigator = () => {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarShowLabel: false,
                tabBarActiveTintColor: COLORS.GOLD,
                tabBarInactiveTintColor: COLORS.TEXT_SECONDARY,
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
                name="Watchdog"
                component={WatchdogScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} name="Watchdog" />,
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
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: COLORS.BACKGROUND },
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="ConnectBank" component={ConnectBankScreen} />
        </Stack.Navigator>
    );
};

// Main App Navigator (Stack with Tabs + Modal Screens)
const AppNavigator = () => {
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
                <ActivityIndicator size="large" color={COLORS.GOLD} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    cardStyle: { backgroundColor: COLORS.BACKGROUND },
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
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: '#000000',
        borderTopWidth: 0,
        height: 70,
        position: 'absolute',
        bottom: 25,
        left: 16,
        right: 16,
        borderRadius: 35,
        borderWidth: 1.5,
        borderColor: 'rgba(201, 162, 39, 0.4)',
        elevation: 8,
        shadowColor: COLORS.GOLD,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        paddingHorizontal: 8,
        paddingTop: 0,
        paddingBottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        flexDirection: 'column',
        minHeight: 50,
    },
    tabItemActive: {
        backgroundColor: COLORS.GOLD,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    tabLabel: {
        fontSize: 10,
        color: COLORS.GOLD,
        fontWeight: '500',
        marginTop: 2,
    },
    tabLabelActive: {
        color: COLORS.BACKGROUND,
        fontWeight: '600',
    },
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
    },
});

export default AppNavigator;
