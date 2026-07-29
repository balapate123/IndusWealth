import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Card, Text } from './ui';

/**
 * An entry point to the ETF reference list — deliberately not a recommendation.
 *
 * This used to call GET /etfs/recommended, rank the catalogue against the
 * user's stored risk tolerance, and present the top five under the heading
 * "Based on your moderate risk profile". That is a personalized securities
 * recommendation, and IndusWealth is not a registered adviser. The endpoint is
 * gone and so is the carousel.
 *
 * What remains is a door to an educational reference list, identical for every
 * user, with no ranking and nothing derived from their finances.
 */

const makeStyles = (t) => StyleSheet.create({
    container: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.MEDIUM,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
    },
    icon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: { flex: 1 },
    disclaimer: {
        marginTop: SPACING.MEDIUM,
        paddingTop: SPACING.SMALL,
        borderTopWidth: 1,
        borderTopColor: t.DIVIDER,
    },
    note: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: SPACING.SMALL,
        padding: SPACING.SMALL,
        borderRadius: RADIUS.CHIP,
        backgroundColor: t.SURFACE_HIGH,
    },
});

const InvestmentCorner = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const tint = categoryColor(theme, 5);

    return (
        <View style={styles.container}>
            <Card
                inset={false}
                onPress={() => navigation?.navigate('ETFList')}
                accessibilityRole="button"
                accessibilityLabel="Learn about ETFs"
            >
                <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                        <Ionicons name="school-outline" size={22} color={tint} />
                    </View>
                    <View style={styles.body}>
                        <Text variant="title">Learn about ETFs</Text>
                        <Text variant="meta" tone="muted">
                            A reference list of widely held Canadian ETFs, with what each one holds
                            and what it costs.
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.TEXT_MUTED} />
                </View>

                <View style={styles.note}>
                    <Ionicons name="information-circle-outline" size={14} color={theme.TEXT_MUTED} />
                    <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                        Education only. IndusWealth does not recommend investments and nothing here
                        is tailored to you — speak to a registered advisor before investing.
                    </Text>
                </View>
            </Card>
        </View>
    );
};

export default InvestmentCorner;
