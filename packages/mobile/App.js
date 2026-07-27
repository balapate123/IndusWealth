import React, { useEffect } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { initAnalytics } from './src/services/analytics';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { DEFAULT_THEME } from './src/constants/tokens';

// Keeps the Android system navigation bar in step with the active theme.
// Lives inside the provider so it re-runs when the user switches modes.
const SystemChrome = ({ children }) => {
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const NavigationBar = require('expo-navigation-bar');
    NavigationBar.setBackgroundColorAsync(theme.BG);
    NavigationBar.setButtonStyleAsync(theme.mode === 'dark' ? 'light' : 'dark');
  }, [theme]);

  return <>{children}</>;
};

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initAnalytics();
  }, []);

  // The stored theme preference hasn't been read yet at this point, so the
  // pre-font splash uses the default rather than risking a flash of the wrong
  // theme and then correcting it.
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: DEFAULT_THEME.BG, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={DEFAULT_THEME.ACCENT} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <SystemChrome>
        <SafeAreaProvider>
          <AppNavigator />
        </SafeAreaProvider>
      </SystemChrome>
    </ThemeProvider>
  );
}
