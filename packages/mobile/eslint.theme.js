/**
 * The two rules that protect the theme system.
 *
 * Kept separate from eslint.config.js so they can run as a standalone gate:
 *
 *   npm run lint:theme    only these rules — must stay clean
 *   npm run lint          these plus the full Expo config
 *
 * Both encode a bug this codebase actually shipped, so both are errors.
 */

// #RGB / #RGBA / #RRGGBB / #RRGGBBAA, plus rgb()/rgba() — the old palette used
// both, and both are equally unable to follow the mode.
const LITERAL_COLOUR = String.raw`^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]*\))$`;

const THEME_RULES = [
    'error',
    {
        selector: `Literal[value=/${LITERAL_COLOUR}/]`,
        message:
            'No literal colours. A hex or rgba() string cannot follow the light/dark mode, which '
            + 'is how Ledger first rendered all-white. Use a token from useTheme() — alpha(token, n) '
            + 'for a tint, categoryColor(theme, i) for category identity. If the colour genuinely '
            + 'must not follow the theme (a QR code, a third-party white page), disable this rule '
            + 'on the line and say why.',
    },
    {
        selector: 'Property[key.name="fontWeight"], Property[key.value="fontWeight"]',
        message:
            'No fontWeight. React Native on Android drops a custom font family when a weight is '
            + 'set alongside it, silently reverting the text to the system typeface. Weight comes '
            + 'from the family: use a TYPE preset, or <Text variant="..." />.',
    },
];

module.exports = [
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
            'no-restricted-syntax': THEME_RULES,
        },
    },
    {
        // The one file allowed to name colours: it *is* the palette. Both ramps
        // are validated against their own card surface (OKLCH lightness band,
        // chroma floor, CVD separation, WCAG contrast) rather than by eye.
        files: ['src/constants/tokens.js'],
        rules: {
            'no-restricted-syntax': 'off',
        },
    },
];
