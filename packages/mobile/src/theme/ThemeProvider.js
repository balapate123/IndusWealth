import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, DEFAULT_THEME } from '../constants/tokens';

/**
 * Theme plumbing.
 *
 * `mode` is what the user chose — 'system' | 'dark' | 'light' — and is persisted.
 * `resolved` is what that means right now once the OS preference is applied.
 *
 * Screens that have not been migrated yet still import the frozen COLORS object
 * from constants/theme.js, so they render Obsidian regardless of mode. That is
 * expected during the migration: a screen becomes theme-aware when it moves onto
 * useTheme(). See docs/superpowers/specs/2026-07-27-app-theme-revamp-design.md.
 */

const STORAGE_KEY = '@induswealth_theme_mode';
const MODES = ['system', 'dark', 'light'];

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
    const systemScheme = useColorScheme(); // 'dark' | 'light' | null
    const [mode, setModeState] = useState('system');
    // Until the stored preference loads we render the default rather than
    // flashing the wrong theme and then correcting it.
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;
        AsyncStorage.getItem(STORAGE_KEY)
            .then((stored) => {
                if (!cancelled && MODES.includes(stored)) setModeState(stored);
            })
            .catch(() => { /* fall back to 'system' */ })
            .finally(() => { if (!cancelled) setHydrated(true); });
        return () => { cancelled = true; };
    }, []);

    const setMode = useCallback((next) => {
        if (!MODES.includes(next)) return;
        setModeState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => { /* non-fatal */ });
    }, []);

    // Anything other than an explicit 'light' resolves to dark, so a null or
    // unrecognised OS value can never leave us without a theme.
    const resolved = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
    const theme = resolved === 'light' ? THEMES.ledger : THEMES.obsidian;

    const value = useMemo(
        () => ({ theme, mode, resolved, setMode, hydrated }),
        [theme, mode, resolved, setMode, hydrated]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/** The active token set. Safe outside a provider — falls back to Obsidian. */
export const useTheme = () => useContext(ThemeContext)?.theme ?? DEFAULT_THEME;

/** `{ mode, resolved, setMode, hydrated }` — for the settings switcher. */
export const useThemeMode = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error('useThemeMode must be used inside a ThemeProvider');
    }
    const { theme: _theme, ...rest } = ctx;
    return rest;
};

/**
 * Build a themed StyleSheet.
 *
 * Define the factory at module scope so its identity is stable — a factory
 * declared inside the component body rebuilds the sheet on every render.
 *
 *   const makeStyles = (t) => StyleSheet.create({ card: { backgroundColor: t.SURFACE } });
 *   const styles = useThemedStyles(makeStyles);
 */
export const useThemedStyles = (factory) => {
    const theme = useTheme();
    return useMemo(() => factory(theme), [factory, theme]);
};

export { MODES as THEME_MODES };
