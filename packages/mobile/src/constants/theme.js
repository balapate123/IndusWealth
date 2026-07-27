/**
 * DEPRECATED — legacy static palette, kept so un-migrated screens keep compiling.
 *
 * Values here are frozen at their pre-revamp state on purpose: importing this
 * module must not change how any existing screen looks. Because it is a static
 * import it cannot react to the user switching themes, so anything using it
 * always renders Obsidian.
 *
 * New code must use `useTheme()` from src/theme/ThemeProvider.js and the tokens
 * in src/constants/tokens.js. This file is deleted at the end of Phase 4.
 * See docs/superpowers/specs/2026-07-27-app-theme-revamp-design.md.
 */
export const COLORS = {
    // Primary backgrounds
    BACKGROUND: '#000000',        // Pure black main background
    CARD_BG: '#000000',           // Pure black card background
    CARD_BORDER: 'rgba(201, 162, 39, 0.2)',  // Gold-tinted border

    // Brand colors
    GOLD: '#C9A227',              // Gold accent for active states
    GOLD_LIGHT: '#E5C048',        // Lighter gold for highlights
    GREEN: '#4CAF50',             // Positive amounts
    GREEN_DARK: '#2D6B30',        // Dark green for badges
    TEAL: '#4ECDC4',              // Teal for charts
    RED: '#FF6B6B',               // Negative/expense amounts

    // Text colors
    WHITE: '#FFFFFF',
    TEXT_PRIMARY: '#FFFFFF',
    TEXT_SECONDARY: '#E5C048',    // Gold light for secondary text
    TEXT_MUTED: '#C9A227',        // Gold for muted text

    // Health Score colors
    HEALTH_EXCELLENT: '#4CAF50',
    HEALTH_GOOD: '#8BC34A',
    HEALTH_FAIR: '#FFC107',
    HEALTH_POOR: '#FF9800',
    HEALTH_CRITICAL: '#F44336',

    // Investment Corner
    ETF_POSITIVE: '#4CAF50',
    ETF_NEGATIVE: '#FF6B6B',

    // Category accent colors (for insight types)
    CAT_TAX: '#8B5CF6',
    CAT_ETF: '#10B981',
    CAT_DEBT: '#F59E0B',
    CAT_SAVINGS: '#06B6D4',
    CAT_SPENDING: '#FF6B6B',
    CAT_CASHFLOW: '#3B82F6',
    CAT_INVEST: '#22C55E',
    CAT_MILESTONE: '#E5C048',
    CAT_COMPARATIVE: '#EC4899',
    CAT_OPPORTUNITY: '#F97316',
    CAT_SEASONAL: '#14B8A6',
    CAT_WEALTH: '#6366F1',

    // Surface colors for cards
    SURFACE_ELEVATED: '#111111',
    SURFACE_OVERLAY: 'rgba(255, 255, 255, 0.05)',

    // Legacy (kept for backward compatibility)
    NAVY: '#000000',
    GRAY_LIGHT: '#F0F0F0',
    GRAY_DARK: '#333333',
};

export const FONTS = {
    BOLD: 'SpaceGrotesk_700Bold',
    REGULAR: 'SpaceGrotesk_400Regular',
    MEDIUM: 'SpaceGrotesk_500Medium',
};

export const SPACING = {
    TINY: 4,
    SMALL: 8,
    MEDIUM: 16,
    LARGE: 24,
    XL: 32,
};

export const BORDER_RADIUS = {
    SMALL: 8,
    MEDIUM: 12,
    LARGE: 16,
    XL: 24,
    ROUND: 50,
};
