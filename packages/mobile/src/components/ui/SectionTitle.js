import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/tokens';
import { useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';

const makeStyles = () => StyleSheet.create({
    head: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: SPACING.SMALL,
    },
    titleBlock: { flex: 1 },
    subtitle: { marginTop: 2 },
    spaced: { marginBottom: SPACING.MEDIUM },
    overline: {
        marginTop: SPACING.MEDIUM,
        marginBottom: SPACING.SMALL,
    },
    overlineInset: { marginHorizontal: SPACING.MEDIUM },
    overlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
    },
});

/** Title for the inside of a Card. `spaced` adds the gap before card content. */
export const SectionTitle = ({ title, subtitle, right, spaced = true, style }) => {
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={[spaced && styles.spaced, style]}>
            <View style={styles.head}>
                <View style={styles.titleBlock}>
                    <Text variant="title">{title}</Text>
                    {subtitle ? <Text variant="meta" tone="muted" style={styles.subtitle}>{subtitle}</Text> : null}
                </View>
                {right}
            </View>
        </View>
    );
};

/** Small uppercase heading that labels a run of cards on the page itself. */
export const Overline = ({ children, right, inset = true, style }) => {
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={[styles.overline, inset && styles.overlineInset, styles.overlineRow, style]}>
            <Text variant="overline" tone="muted">{children}</Text>
            {right}
        </View>
    );
};

export default SectionTitle;
