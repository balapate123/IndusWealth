/**
 * Every Expo app needs this. Without it, babel-preset-expo is not applied as
 * the project's own config, and the EXPO_PUBLIC_* rewrite it performs — turning
 * `process.env.EXPO_PUBLIC_X` into a lookup on the `expo/virtual/env` module
 * Metro generates — does not get its values populated. The symptom is that
 * every EXPO_PUBLIC_* variable reads as undefined at runtime, so the app
 * silently falls back to whatever default the code specifies, no matter what
 * .env or the eas.json `env` block says.
 */
module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
    };
};
