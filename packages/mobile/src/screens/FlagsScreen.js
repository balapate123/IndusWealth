import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    ListRow,
    EmptyState,
    LoadingState,
} from '../components/ui';
import { money } from '../components/TransactionRow';
import FlagEditorSheet from '../components/FlagEditorSheet';
import api from '../services/api';

/**
 * Every flag the user has, with what each one adds up to.
 *
 * Totals are the server's, over every transaction carrying the flag — not over
 * anything this screen has loaded, which is nothing.
 */

const makeStyles = () => StyleSheet.create({
    intro: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: SPACING.SMALL,
    },
    content: { paddingBottom: 120 },
    icon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    add: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});

const FlagsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [flags, setFlags] = useState([]);
    const [options, setOptions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Creation only. Renaming, recolouring and deleting live on the flag's own
    // screen, where the count you are about to affect is on display.
    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState(null);

    const load = useCallback(async () => {
        try {
            const response = await api.getFlags();
            if (response?.success) {
                setFlags(response.data || []);
                if (response.options) setOptions(response.options);
            }
        } catch (err) {
            console.error('Error loading flags:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Totals change whenever a transaction is tagged elsewhere, so refresh on
    // focus rather than only on mount.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const openEditor = () => {
        setEditorError(null);
        setEditorOpen(true);
    };

    const handleCreate = async ({ name, colorIndex, icon }) => {
        setSaving(true);
        setEditorError(null);
        try {
            const response = await api.createFlag({ name, colorIndex, icon });
            if (response?.success) {
                setEditorOpen(false);
                load();
            } else {
                // A duplicate name is the one failure the user can act on, so it
                // is shown in the sheet rather than swallowed.
                setEditorError(response?.message || 'Could not save that flag.');
            }
        } catch (err) {
            setEditorError(err?.message || 'Could not save that flag.');
        } finally {
            setSaving(false);
        }
    };

    const header = (
        <>
            <ScreenHeader
                title="Flags"
                onBack={() => navigation.goBack()}
                right={
                    <TouchableOpacity
                        style={styles.add}
                        onPress={openEditor}
                        accessibilityRole="button"
                        accessibilityLabel="New flag"
                    >
                        <Ionicons name="add" size={18} color={theme.ACCENT} />
                        <Text variant="label" color={theme.ACCENT}>New</Text>
                    </TouchableOpacity>
                }
            />
            <View style={styles.intro}>
                <Text variant="meta" tone="muted">
                    Group transactions your own way — a shared apartment, a trip, a side project —
                    and see what each one costs.
                </Text>
            </View>
        </>
    );

    if (loading) {
        return (
            <Screen header={header}>
                <LoadingState message="Loading flags..." />
            </Screen>
        );
    }

    return (
        <>
            <Screen header={header}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); load(); }}
                            tintColor={theme.ACCENT}
                            colors={[theme.ACCENT]}
                            progressBackgroundColor={theme.SURFACE}
                        />
                    }
                >
                    {flags.length === 0 ? (
                        <EmptyState
                            icon="pricetags-outline"
                            title="No flags yet"
                            message="Create one to start grouping transactions — Home, Work, or anything else."
                        />
                    ) : (
                        <Card>
                            {flags.map((flag, index) => {
                                const tint = categoryColor(theme, flag.color_index);
                                const count = flag.transaction_count || 0;
                                return (
                                    <ListRow
                                        key={flag.id}
                                        divider={index > 0}
                                        leading={
                                            <View style={[styles.icon, { backgroundColor: alpha(tint, 0.16) }]}>
                                                <Ionicons name={flag.icon} size={19} color={tint} />
                                            </View>
                                        }
                                        title={flag.name}
                                        subtitle={count === 0
                                            ? 'Nothing flagged yet'
                                            : `${count} ${count === 1 ? 'transaction' : 'transactions'}`}
                                        value={count === 0 ? null : money(flag.net)}
                                        meta={flag.inflow > 0 ? `${money(flag.inflow)} back` : null}
                                        chevron
                                        onPress={() => navigation.navigate('FlagDetail', { flag })}
                                    />
                                );
                            })}
                        </Card>
                    )}
                </ScrollView>
            </Screen>

            <FlagEditorSheet
                visible={editorOpen}
                flag={null}
                options={options}
                saving={saving}
                error={editorError}
                onSave={handleCreate}
                onClose={() => setEditorOpen(false)}
            />
        </>
    );
};

export default FlagsScreen;
