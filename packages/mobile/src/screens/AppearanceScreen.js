import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles, useThemeMode } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    SectionTitle,
    SegmentedControl,
    ChangeBadge,
    ListRow,
} from '../components/ui';

const MODE_OPTIONS = [
    { label: 'System', value: 'system' },
    { label: 'Dark', value: 'dark' },
    { label: 'Light', value: 'light' },
];

const makeStyles = (t) => StyleSheet.create({
    previewHead: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    previewButtons: {
        flexDirection: 'row',
        gap: SPACING.SMALL,
        marginTop: SPACING.MEDIUM,
    },
    fakeButton: {
        flex: 1,
        height: 36,
        borderRadius: RADIUS.CONTROL,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fakePrimary: { backgroundColor: t.ACCENT },
    fakeSecondary: { backgroundColor: t.SURFACE_HIGH },
    swatches: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.SMALL,
    },
    swatch: {
        width: 30,
        height: 30,
        borderRadius: RADIUS.SMALL,
    },
    note: {
        marginTop: SPACING.SMALL,
    },
});

const AppearanceScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { mode, resolved, setMode } = useThemeMode();

    const ramp = [...theme.CATEGORIES, theme.CATEGORY_OTHER];

    return (
        <Screen
            scroll
            header={<ScreenHeader title="Appearance" onBack={() => navigation.goBack()} />}
        >
            <Card>
                <SectionTitle
                    title="Theme"
                    subtitle={
                        mode === 'system'
                            ? `Following your device — currently ${resolved}`
                            : `Always ${mode}`
                    }
                />
                <SegmentedControl
                    options={MODE_OPTIONS}
                    value={mode}
                    onChange={setMode}
                    inset={false}
                />
            </Card>

            {/* Live preview — the point of this screen is seeing the change, not reading about it */}
            <Card>
                <View style={styles.previewHead}>
                    <View>
                        <Text variant="overline" tone="muted">Total liquid cash</Text>
                        <Text variant="h1">$12,480.65</Text>
                    </View>
                    <ChangeBadge percent={2.4} />
                </View>

                <View style={styles.previewButtons}>
                    <View style={[styles.fakeButton, styles.fakePrimary]}>
                        <Text variant="label" tone="onAccent">Primary</Text>
                    </View>
                    <View style={[styles.fakeButton, styles.fakeSecondary]}>
                        <Text variant="label">Secondary</Text>
                    </View>
                </View>

                <ListRow
                    icon="cart-outline"
                    iconColor={categoryColor(theme, 5)}
                    title="Loblaws"
                    subtitle="Groceries"
                    value="−$86.42"
                    meta="Jul 27"
                />
                <ListRow
                    divider
                    icon="cash"
                    iconColor={categoryColor(theme, 5)}
                    title="Payroll Deposit"
                    subtitle="Income"
                    value="+$2,410.00"
                    valueTone="success"
                    meta="Jul 26"
                />
            </Card>

            <Card>
                <SectionTitle
                    title="Category colours"
                    subtitle="Each theme uses its own ramp — the dark one is unreadable on white"
                />
                <View style={styles.swatches}>
                    {ramp.map((color) => (
                        <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
                    ))}
                </View>
            </Card>

            <Card>
                <View style={{ flexDirection: 'row', gap: SPACING.SMALL + 2 }}>
                    <Ionicons name="information-circle-outline" size={20} color={theme.TEXT_MUTED} />
                    <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                        Some screens are still being moved onto the new theme and will stay dark for
                        now. They will follow this setting as they are updated.
                    </Text>
                </View>
            </Card>
        </Screen>
    );
};

export default AppearanceScreen;
