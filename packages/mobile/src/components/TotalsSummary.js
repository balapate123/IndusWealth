import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '../constants/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';
import { money } from './TransactionRow';

/**
 * What the current filter adds up to.
 *
 * The server computes this over every matching row, not the page on screen, so
 * the number does not change as you scroll.
 *
 * `net` is spent minus refunded. The out/back line only appears when money came
 * back, because for most filters it would just be "out $x · back $0". That
 * second line is the whole point for a shared-expense flag: you fronted $1,020
 * and a roommate returned $300, so the number that matters is $720.
 */

const makeStyles = (t) => StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL + 2,
        marginHorizontal: SPACING.MEDIUM,
        borderRadius: RADIUS.MEDIUM,
        backgroundColor: t.SURFACE,
        borderWidth: t.CARD_BORDER_WIDTH,
        borderColor: t.HAIRLINE,
        gap: SPACING.SMALL,
    },
    label: { flexShrink: 1 },
    right: { alignItems: 'flex-end' },
    split: { marginTop: 1 },
});

const TotalsSummary = ({ totals, label = 'Total', style }) => {
    const styles = useThemedStyles(makeStyles);

    if (!totals) return null;

    const net = Number(totals.net) || 0;
    const inflow = Number(totals.inflow) || 0;
    const outflow = Number(totals.outflow) || 0;
    const count = Number(totals.count) || 0;

    // A negative net means more came back than went out — worth reading as
    // income rather than as a minus sign on a spending figure.
    const isNetInflow = net < 0;

    return (
        <View style={[styles.bar, style]}>
            <View style={styles.label}>
                <Text variant="label" tone="secondary" numberOfLines={1}>{label}</Text>
                <Text variant="meta" tone="muted" style={styles.split}>
                    {count} {count === 1 ? 'transaction' : 'transactions'}
                </Text>
            </View>

            <View style={styles.right}>
                <Text variant="h2" tone={isNetInflow ? 'success' : 'primary'}>
                    {isNetInflow ? '+' : ''}{money(net)}
                </Text>
                {inflow > 0 ? (
                    <Text variant="meta" tone="muted" style={styles.split}>
                        {money(outflow)} out · {money(inflow)} back
                    </Text>
                ) : null}
            </View>
        </View>
    );
};

export default TotalsSummary;
