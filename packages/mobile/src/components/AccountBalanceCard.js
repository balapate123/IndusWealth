import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text, BarTrack } from './ui';

/**
 * The balance panel at the top of an account.
 *
 * A chequing account has one number worth showing. A credit card has three, and
 * the one people actually look for is how much room is left — so credit leads
 * with available credit and shows what is used against the limit.
 *
 * Anything the bank did not report stays hidden rather than being inferred: a
 * card whose limit Plaid does not expose shows no bar and no percentage, which
 * is honest, where a guessed limit would quietly be wrong.
 */

const money = (value, currency = 'CAD') =>
    `${value < 0 ? '−' : ''}$${Math.abs(Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}${currency && currency !== 'CAD' ? ` ${currency}` : ''}`;

const makeStyles = () => StyleSheet.create({
    label: { marginBottom: 2 },
    amount: { marginBottom: 2 },
    bar: { marginTop: SPACING.MEDIUM },
    barFoot: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: SPACING.SMALL,
        marginTop: SPACING.SMALL,
    },
    split: {
        flexDirection: 'row',
        marginTop: SPACING.MEDIUM,
    },
    splitItem: { flex: 1 },
});

/** Conventional credit-utilisation bands, used only to colour the bar. */
const utilisationTone = (theme, ratio) => {
    if (ratio >= 0.7) return theme.DANGER;
    if (ratio >= 0.3) return theme.WARNING;
    return theme.SUCCESS;
};

const AccountBalanceCard = ({ account, style }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    if (!account) return null;

    const currency = account.currency || 'CAD';
    const balance = Number(account.balance) || 0;
    const available = account.available == null ? null : Number(account.available);
    const limit = account.limit == null ? null : Number(account.limit);
    const used = account.used == null ? null : Number(account.used);
    const ratio = account.utilization == null ? null : Number(account.utilization);

    if (!account.isCredit) {
        // A depository account: the balance is the whole story. `available`
        // only earns a line when it differs — otherwise it is the same number
        // printed twice.
        const showAvailable = available != null && Math.abs(available - balance) >= 0.01;

        return (
            <Card style={style}>
                <Text variant="meta" tone="muted" style={styles.label}>Current balance</Text>
                <Text variant="hero" style={styles.amount}>{money(balance, currency)}</Text>
                {showAvailable ? (
                    <Text variant="meta" tone="muted">
                        {money(available, currency)} available to spend now
                    </Text>
                ) : null}
            </Card>
        );
    }

    const clamped = ratio == null ? null : Math.min(Math.max(ratio, 0), 1);

    return (
        <Card style={style}>
            <Text variant="meta" tone="muted" style={styles.label}>
                {available != null ? 'Available credit' : 'Current balance'}
            </Text>
            <Text variant="hero" style={styles.amount}>
                {money(available != null ? available : balance, currency)}
            </Text>
            <Text variant="meta" tone="muted">
                {money(balance, currency)} owed
            </Text>

            {clamped != null && limit != null ? (
                <View style={styles.bar}>
                    <BarTrack
                        value={clamped}
                        max={1}
                        color={utilisationTone(theme, clamped)}
                        height={10}
                    />
                    <View style={styles.barFoot}>
                        <Text variant="meta" tone="muted">
                            {money(used ?? balance, currency)} of {money(limit, currency)} used
                        </Text>
                        <Text variant="num" color={utilisationTone(theme, clamped)}>
                            {Math.round(clamped * 100)}%
                        </Text>
                    </View>
                </View>
            ) : limit != null ? (
                <View style={styles.split}>
                    <View style={styles.splitItem}>
                        <Text variant="meta" tone="muted">Limit</Text>
                        <Text variant="num">{money(limit, currency)}</Text>
                    </View>
                </View>
            ) : null}
        </Card>
    );
};

export default AccountBalanceCard;
