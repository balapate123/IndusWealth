import React from 'react';
import { Text as RNText } from 'react-native';
import { TYPE } from '../../constants/tokens';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * The only Text in the app.
 *
 * Size and weight come from `variant`, colour from `tone`. Never pass
 * fontWeight — RN on Android drops the custom font family when a weight is set
 * alongside it, which is how half the app ended up in the system typeface.
 *
 * `color` is the escape hatch for genuinely dynamic colour — a category's
 * identity hue, for instance. Anything static belongs in `tone`.
 */

const VARIANTS = {
    hero: TYPE.HERO,
    h1: TYPE.H1,
    h2: TYPE.H2,
    title: TYPE.TITLE,
    body: TYPE.BODY,
    bodyMed: TYPE.BODY_MED,
    num: TYPE.NUM,
    label: TYPE.LABEL,
    meta: TYPE.META,
    overline: TYPE.OVERLINE,
};

const toneColor = (theme, name) => {
    switch (name) {
        case 'secondary': return theme.TEXT_SECONDARY;
        case 'muted': return theme.TEXT_MUTED;
        case 'disabled': return theme.TEXT_DISABLED;
        case 'accent': return theme.ACCENT;
        case 'link': return theme.LINK;
        case 'success': return theme.SUCCESS;
        case 'danger': return theme.DANGER;
        case 'warning': return theme.WARNING;
        case 'info': return theme.INFO;
        case 'onAccent': return theme.TEXT_ON_ACCENT;
        default: return theme.TEXT_PRIMARY;
    }
};

const Text = ({ variant = 'body', tone = 'primary', color, style, children, ...rest }) => {
    const theme = useTheme();
    return (
        <RNText
            style={[VARIANTS[variant] || VARIANTS.body, { color: color || toneColor(theme, tone) }, style]}
            {...rest}
        >
            {children}
        </RNText>
    );
};

export default Text;
