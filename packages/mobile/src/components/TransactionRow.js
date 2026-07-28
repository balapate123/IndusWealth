import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { ListRow } from './ui';
import FlagDots from './FlagDots';

/**
 * One transaction. Shared by Home, All Transactions and Account Transactions,
 * which previously each had their own copy that had already drifted apart.
 *
 * `accountColor` draws the identity stripe down the left; omit it on screens
 * that are already scoped to a single account, where it would say nothing.
 */

const makeStyles = () => StyleSheet.create({
    leading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
    },
    stripe: {
        width: 3,
        height: 32,
        borderRadius: 2,
    },
    icon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const money = (value) =>
    `$${Math.abs(Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const TransactionRow = ({
    transaction,
    accountColor,
    subtitle,
    meta,
    divider = false,
    onPress,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const isIncome = transaction.amount > 0;
    const tint = categoryColor(theme, transaction.categoryColorIndex);
    const IconSet = transaction.categoryLibrary === 'FontAwesome5' ? FontAwesome5 : Ionicons;

    return (
        <ListRow
            divider={divider}
            onPress={onPress}
            leading={
                <View style={styles.leading}>
                    {accountColor ? (
                        <View style={[styles.stripe, { backgroundColor: accountColor }]} />
                    ) : null}
                    <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                        <IconSet name={transaction.categoryIcon} size={19} color={tint} />
                    </View>
                </View>
            }
            title={transaction.merchant}
            subtitle={subtitle !== undefined ? subtitle : transaction.category}
            subtitleAccessory={
                transaction.flags?.length ? <FlagDots flags={transaction.flags} /> : null
            }
            value={`${isIncome ? '+' : '−'}${money(transaction.amount)}`}
            valueTone={isIncome ? 'success' : 'primary'}
            meta={meta}
        />
    );
};

export { money };
export default TransactionRow;
