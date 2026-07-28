const expoConfig = require('eslint-config-expo/flat');
const themeConfig = require('./eslint.theme');

/**
 * `npm run lint` — the Expo config plus the theme rules.
 *
 * The Expo config currently reports pre-existing findings unrelated to the
 * theme work (mostly react-hooks). They are left visible rather than switched
 * off; `npm run lint:theme` is the gate that has to stay clean.
 */
module.exports = [
    {
        ignores: ['dist/**', 'android/**', '.expo/**', 'node_modules/**'],
    },
    ...expoConfig,
    ...themeConfig,
];
