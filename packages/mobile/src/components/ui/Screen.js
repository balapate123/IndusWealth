import React from 'react';
import { Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Screen container: background, status bar, and the top inset every screen was
 * previously re-deriving by hand.
 *
 * Pass `scroll` for a ScrollView body; `onRefresh` adds pull-to-refresh with the
 * accent-tinted spinner.
 */

const makeStyles = (t) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: t.BG,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 50,
    },
    content: {
        paddingBottom: 40,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});

const Screen = ({
    children,
    header,
    scroll = false,
    centered = false,
    refreshing = false,
    onRefresh,
    contentContainerStyle,
    style,
    ...rest
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <View style={[styles.container, centered && styles.centered, style]} {...rest}>
            <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.BG} />
            {header}
            {scroll ? (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.content, contentContainerStyle]}
                    refreshControl={
                        onRefresh ? (
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={theme.ACCENT}
                                colors={[theme.ACCENT]}
                                progressBackgroundColor={theme.SURFACE}
                            />
                        ) : undefined
                    }
                >
                    {children}
                </ScrollView>
            ) : (
                children
            )}
        </View>
    );
};

export default Screen;
