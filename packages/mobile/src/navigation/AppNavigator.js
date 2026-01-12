import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import WatchdogScreen from '../screens/WatchdogScreen';
import DebtAttackScreen from '../screens/DebtAttackScreen';
import AllTransactionsScreen from '../screens/AllTransactionsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AccountTransactionsScreen from '../screens/AccountTransactionsScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ConnectBankScreen from '../screens/ConnectBankScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { COLORS, BORDER_RADIUS } from '../constants/theme';
import cache from '../services/cache';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabBarIcon = ({ focused, name }) => {
    const iconMap = {
        'Home': focused ? 'home' : 'home-outline',
        'Wealth': focused ? 'bar-chart' : 'bar-chart-outline',
        'Watchdog': focused ? 'location' : 'location-outline',
        'Profile': focused ? 'person' : 'person-outline',
    };

    return (
        <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Ionicons
                name={iconMap[name]}
                size={24}
                color={focused ? COLORS.GOLD : COLORS.TEXT_SECONDARY}
            />
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
                tabBarShowLabel: true,
                tabBarLabelStyle: styles.tabBarLabel,
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
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: COLORS.CARD_BG,
        borderTopWidth: 0,
        height: 70,
        paddingBottom: 10,
        paddingTop: 5,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        elevation: 0,
        shadowOpacity: 0,
    },
    tabBarLabel: {
        fontSize: 11,
        marginTop: -2,
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 32,
    },
    iconContainerActive: {
        // No background for cleaner look with labels
    },
});

export default AppNavigator;
