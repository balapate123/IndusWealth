import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Text } from './ui';
import { activeFilterCount } from '../utils/transactionFilters';

/**
 * The funnel in a transaction list's header, with a count when filters are on.
 *
 * The badge is the whole point of the component existing. A filter that
 * narrows the list with nothing visible to say so turns "no transactions" into
 * a claim that data is missing — and in an app about somebody's money, that is
 * a genuinely alarming thing to imply when it is not true. The badge says it
 * from the header; `describeFilters` says it again in the empty state.
 *
 * Shared by `AllTransactionsScreen` and `AccountTransactionsScreen` so the two
 * cannot drift the way the selection code was about to before the hook.
 */

const BADGE = 15;

const makeStyles = (t) => StyleSheet.create({
    wrap: { justifyContent: 'center' },
    badge: {
        position: 'absolute',
        top: -6,
        right: -8,
        minWidth: BADGE,
        height: BADGE,
        borderRadius: BADGE / 2,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.ACCENT,
    },
    count: { lineHeight: BADGE },
});

const TransactionFilterButton = ({ filters, onPress }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const count = activeFilterCount(filters);
    const active = count > 0;

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.wrap}
            accessibilityRole="button"
            // Spoken rather than implied by a tinted glyph, which a screen
            // reader cannot see and a colour-blind reader may not distinguish.
            accessibilityLabel={active
                ? `Filters, ${count} active`
                : 'Filter transactions'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <Ionicons
                name={active ? 'filter' : 'filter-outline'}
                size={20}
                color={theme.ACCENT}
            />
            {active ? (
                <View style={styles.badge}>
                    <Text variant="meta" tone="onAccent" style={styles.count}>{count}</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
};

export default TransactionFilterButton;
