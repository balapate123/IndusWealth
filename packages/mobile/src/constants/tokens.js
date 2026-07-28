/**
 * IndusWealth design tokens.
 *
 * Two themes, one geometry: `obsidian` (dark) and `ledger` (light) differ only in
 * colour and elevation technique. Sizes, radii and type are shared, so switching
 * themes never reflows a screen.
 *
 * Consume these through `useTheme()` (src/theme/ThemeProvider.js), never by
 * importing a theme object directly — a direct import can't react to the user
 * changing modes.
 *
 * See docs/superpowers/specs/2026-07-27-app-theme-revamp-design.md.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `alpha('#C9A227', 0.15)` -> '#C9A22726'. RN understands 8-digit hex. */
export const alpha = (hex, a) => {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
    const aa = Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, '0');
    return `#${full}${aa}`;
};

const shadow = (opacity, radius, y, elevation) => ({
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: y },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
});

// ---------------------------------------------------------------------------
// Shared: geometry and type
// ---------------------------------------------------------------------------

export const SPACING = {
    TINY: 4,
    SMALL: 8,
    MEDIUM: 16,
    LARGE: 24,
    XL: 32,
};

export const RADIUS = {
    SMALL: 8,
    MEDIUM: 12,
    CONTROL: 14,
    LARGE: 16,
    CARD: 24,
    PILL: 999,
};

export const FONTS = {
    REGULAR: 'SpaceGrotesk_400Regular',
    MEDIUM: 'SpaceGrotesk_500Medium',
    BOLD: 'SpaceGrotesk_700Bold',
};

/**
 * Type presets. Weight comes from the family — never set `fontWeight` alongside
 * these, because RN on Android drops the custom face when both are present.
 */
export const TYPE = {
    HERO: { fontFamily: FONTS.BOLD, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
    H1: { fontFamily: FONTS.BOLD, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
    H2: { fontFamily: FONTS.BOLD, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
    TITLE: { fontFamily: FONTS.BOLD, fontSize: 16, lineHeight: 22 },
    BODY: { fontFamily: FONTS.REGULAR, fontSize: 14, lineHeight: 20 },
    BODY_MED: { fontFamily: FONTS.MEDIUM, fontSize: 14, lineHeight: 20 },
    NUM: { fontFamily: FONTS.BOLD, fontSize: 14, lineHeight: 20 },
    LABEL: { fontFamily: FONTS.MEDIUM, fontSize: 12, lineHeight: 16 },
    META: { fontFamily: FONTS.REGULAR, fontSize: 11, lineHeight: 15 },
    OVERLINE: {
        fontFamily: FONTS.MEDIUM,
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
};

// ---------------------------------------------------------------------------
// Category identity ramps
// ---------------------------------------------------------------------------

/**
 * Fixed-order categorical ramps, one per mode. Both pass the four palette checks
 * (OKLCH lightness band, chroma floor, adjacent-pair CVD separation, and WCAG
 * contrast) against their own card surface — dark against #111111, light against
 * #FFFFFF. The dark ramp is NOT legible on white, which is why light gets its own.
 *
 * Assignment follows category identity and is fixed: a filter that changes which
 * categories are visible must never repaint the survivors. Never more than these
 * 7 plus OTHER on screen at once — beyond that, fold into OTHER.
 *
 * Every use pairs the colour with the category's icon, which is the secondary
 * encoding that keeps two same-hue categories distinguishable.
 */
const RAMP_DARK = ['#00A8AD', '#CB8100', '#4D90FF', '#84A200', '#9B76FF', '#00B14F', '#FF269D'];
const RAMP_LIGHT = ['#0089A1', '#A96B00', '#096EFF', '#6D8600', '#8745FF', '#009340', '#DA0083'];

// ---------------------------------------------------------------------------
// Obsidian — dark
// ---------------------------------------------------------------------------

const GOLD = '#C9A227';

const obsidian = {
    key: 'obsidian',
    mode: 'dark',
    statusBarStyle: 'light-content',

    // Surfaces. Elevation reads as a lighter surface, so cards carry no border.
    BG: '#000000',
    SURFACE: '#111111',
    SURFACE_HIGH: '#1C1C1E',
    SURFACE_SUNKEN: 'rgba(255,255,255,0.06)',
    HAIRLINE: 'rgba(255,255,255,0.06)',
    HAIRLINE_STRONG: 'rgba(255,255,255,0.12)',
    CARD_BORDER: 'transparent',
    CARD_BORDER_WIDTH: 0,
    SCRIM: 'rgba(0,0,0,0.75)',
    // A chip sitting on top of arbitrary photography. Fixed in BOTH themes:
    // the ground is always dark, so the text on it must always be light —
    // using TEXT_PRIMARY here puts near-black text on a dark badge in Ledger.
    OVERLAY_BG: 'rgba(0,0,0,0.62)',
    TEXT_ON_OVERLAY: '#FFFFFF',

    // Text
    TEXT_PRIMARY: '#FFFFFF',
    TEXT_SECONDARY: '#A1A1AA',
    TEXT_MUTED: '#71717A',
    TEXT_DISABLED: '#52525B',
    TEXT_ON_ACCENT: '#000000',
    // Text sitting ON a category colour. The two ramps sit on opposite sides of
    // mid-lightness, so this flips between modes.
    TEXT_ON_CATEGORY: '#000000',

    // Accent — the only gold in the app. Appears on interactive things only.
    ACCENT: GOLD,
    ACCENT_LIGHT: '#E5C048',
    ACCENT_DIM: alpha(GOLD, 0.15),
    ACCENT_BORDER: alpha(GOLD, 0.35),
    LINK: GOLD,

    // Semantic. Reserved — never reused as a series colour, and always shipped
    // with a sign, arrow or label so meaning never rests on colour alone.
    SUCCESS: '#30D158',
    SUCCESS_DIM: alpha('#30D158', 0.16),
    DANGER: '#FF453A',
    DANGER_DIM: alpha('#FF453A', 0.16),
    WARNING: '#FF9F0A',
    WARNING_DIM: alpha('#FF9F0A', 0.16),
    INFO: '#0A84FF',
    INFO_DIM: alpha('#0A84FF', 0.16),

    CATEGORIES: RAMP_DARK,
    CATEGORY_OTHER: '#8A8A8E',

    ELEVATION: {
        CARD: {},
        FLOATING: shadow(0.55, 16, 8, 12),
        SHEET: shadow(0.6, 24, -4, 16),
    },
};

// ---------------------------------------------------------------------------
// Ledger — light
// ---------------------------------------------------------------------------

const ledger = {
    key: 'ledger',
    mode: 'light',
    statusBarStyle: 'dark-content',

    // On a light page the dark-mode trick inverts: a card can't be "lighter" than
    // a near-white ground, so separation comes from a hairline plus a tight
    // contact shadow, against a page deliberately deeper than the card.
    BG: '#EAE7DC',
    SURFACE: '#FFFFFF',
    SURFACE_HIGH: '#F1EEE4',
    SURFACE_SUNKEN: 'rgba(23,21,15,0.08)',
    HAIRLINE: 'rgba(23,21,15,0.10)',
    HAIRLINE_STRONG: 'rgba(23,21,15,0.18)',
    CARD_BORDER: 'rgba(23,21,15,0.10)',
    CARD_BORDER_WIDTH: 1,
    SCRIM: 'rgba(23,21,15,0.45)',
    OVERLAY_BG: 'rgba(0,0,0,0.62)',
    TEXT_ON_OVERLAY: '#FFFFFF',

    TEXT_PRIMARY: '#17150F',
    TEXT_SECONDARY: '#5F5B51',
    TEXT_MUTED: '#8B867A',
    TEXT_DISABLED: '#AEA99B',
    TEXT_ON_ACCENT: '#1A1505',
    TEXT_ON_CATEGORY: '#FFFFFF',

    // Gold survives as a fill, but as *text* on white it fails contrast, so links
    // and accent text use a darkened step.
    ACCENT: GOLD,
    ACCENT_LIGHT: '#E5C048',
    ACCENT_DIM: alpha(GOLD, 0.18),
    ACCENT_BORDER: alpha(GOLD, 0.45),
    LINK: '#8A6D0B',

    SUCCESS: '#12874A',
    SUCCESS_DIM: alpha('#12874A', 0.12),
    DANGER: '#C2352B',
    DANGER_DIM: alpha('#C2352B', 0.12),
    WARNING: '#A86A00',
    WARNING_DIM: alpha('#A86A00', 0.12),
    INFO: '#0B5FD0',
    INFO_DIM: alpha('#0B5FD0', 0.12),

    CATEGORIES: RAMP_LIGHT,
    CATEGORY_OTHER: '#6E6A62',

    ELEVATION: {
        CARD: shadow(0.06, 3, 1, 1),
        FLOATING: shadow(0.12, 10, 4, 6),
        SHEET: shadow(0.16, 20, -2, 12),
    },
};

export const THEMES = { obsidian, ledger };
export const DEFAULT_THEME = obsidian;

/** Pick a stable identity colour for a category by its index in the ramp. */
export const categoryColor = (theme, index) =>
    index == null || index < 0
        ? theme.CATEGORY_OTHER
        : theme.CATEGORIES[index % theme.CATEGORIES.length];
