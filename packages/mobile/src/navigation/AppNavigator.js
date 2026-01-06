import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import WatchdogScreen from '../screens/WatchdogScreen';
import DebtAttackScreen from '../screens/DebtAttackScreen';
import { COLORS } from '../constants/theme';
import { View, Text } from 'react-native';

const Tab = createBottomTabNavigator();

// Simple Icon component fallback since we might not have vector icons setup perfectly
const TabIcon = ({ focused, name }) => (
    <View style={{
        alignItems: 'center',
        justifyContent: 'center',
        top: 4,
        borderTopWidth: focused ? 2 : 0,
        borderTopColor: COLORS.GOLD,
        paddingTop: 4
    }}>
        <Text style={{
            color: focused ? COLORS.GOLD : COLORS.TEXT_SECONDARY,
            fontSize: 12,
            fontWeight: focused ? 'bold' : 'normal'
        }}>
            {name}
        </Text>
    </View>
);

const AppNavigator = () => {
    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: COLORS.NAVY,
                        borderTopColor: COLORS.GRAY_DARK,
                        height: 60,
                        paddingBottom: 8
                    },
                    tabBarShowLabel: false,
                }}
            >
                <Tab.Screen
                    name="Ledger"
                    component={HomeScreen}
                    options={{
                        tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="LEDGER" />
                    }}
                />
                <Tab.Screen
                    name="Debt"
                    component={DebtAttackScreen}
                    options={{
                        tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="DEBT" />
                    }}
                />
                <Tab.Screen
                    name="Watchdog"
                    component={WatchdogScreen}
                    options={{
                        tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="WATCHDOG" />
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
