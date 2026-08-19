import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Card,
    Text,
    Button,
    Chip,
    ChipRow,
    SegmentedControl,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import { hasSeenWatchdogIntro, setWatchdogIntroSeen } from '../services/cache';
import { getCategoryMeta } from '../utils/categorization';
import { syncWatchReminders } from '../services/notifications';
import CancellationBottomSheet from '../components/CancellationBottomSheet';
import NegotiationBottomSheet from '../components/NegotiationBottomSheet';
import AlertBanner from '../components/AlertBanner';

/**
 * The three sections, and the subheads that state each one's action model.
 *
 * Those nine words are the actual training for this screen. Once a section says
 * "Here so you can plan around them", nothing else has to explain why a mortgage
 * carries no buttons.
 */
const SECTIONS = [
    { key: 'subscription', title: 'Subscriptions', subhead: 'You can cancel these.' },
    { key: 'bill', title: 'Bills', subhead: 'You can often lower these.' },
    { key: 'fixed', title: 'Fixed payments', subhead: 'Here so you can plan around them.' },
];

/**
 * What each watch outcome says.
 *
 * The charged-again case leads with the benign explanation on purpose. The user
 * did what we asked; a cancellation that takes an extra cycle is the merchant's
 * doing, and there is no version of this copy that should read as their failure.
 */
const OUTCOME_COPY = {
    confirmed_stopped: (o) => ({
        tone: 'success',
        icon: 'checkmark-circle',
        title: `${o.merchantName} stopped.`,
        body: `No charge on ${formatDay(o.expectedChargeDate)}. That is $${o.savedMonthly.toFixed(2)} `
            + `a month back — $${(o.savedMonthly * 12).toFixed(2)} a year.`,
    }),
    charged_again: (o) => ({
        tone: 'danger',
        icon: 'alert-circle',
        title: `${o.merchantName} charged you again.`,
        body: `You marked this cancelled on ${formatDay(o.startedAt)}, and a `
            + `$${(o.resolvedAmount ?? o.baselineAmount).toFixed(2)} charge landed. Cancellations `
            + 'sometimes take one more billing cycle. If you have a confirmation, it may be worth '
            + 'disputing this one.',
    }),
    reduced: (o) => ({
        tone: 'success',
        icon: 'trending-down',
        title: `${o.merchantName} went down.`,
        body: `Your bill dropped from $${o.baselineAmount.toFixed(2)} to `
            + `$${(o.resolvedAmount ?? 0).toFixed(2)}. That is $${(o.savedMonthly * 12).toFixed(2)} a year.`,
    }),
    unchanged: (o) => ({
        tone: 'muted',
        icon: 'remove-circle-outline',
        title: `${o.merchantName} has not changed.`,
        body: `Still $${(o.resolvedAmount ?? o.baselineAmount).toFixed(2)}. Retention offers sometimes `
            + 'land on the following cycle, so it can be worth calling once more.',
    }),
};

/** '2026-08-14' -> 'Aug 14'. */
const formatDay = (iso) => {
    if (!iso) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [, m, d] = String(iso).slice(0, 10).split('-');
    return `${months[Number(m) - 1]} ${Number(d)}`;
};

const PERIOD_OPTIONS = [
    { label: 'Monthly', value: false },
    { label: 'Annual', value: true },
];

const makeStyles = (t) => StyleSheet.create({
    scrollContent: { paddingBottom: 110 },

    // Intro
    introHead: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: SPACING.SMALL,
        marginBottom: SPACING.SMALL,
    },
    introBody: { marginTop: 6 },
    introActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginTop: SPACING.MEDIUM,
    },

    // Totals
    totalsTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.MEDIUM,
    },
    piggyIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.ACCENT_DIM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadge: {
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: RADIUS.PILL,
    },
    heroAmount: { marginTop: 2 },
    committed: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 5,
        marginTop: SPACING.SMALL,
    },
    outcomeHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL,
        marginBottom: 6,
    },
    outcomeBody: { marginBottom: SPACING.SMALL },
    projection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 5,
        marginTop: SPACING.SMALL,
    },

    // Section headings
    sectionHead: {
        marginTop: SPACING.LARGE,
        marginBottom: SPACING.SMALL,
        marginHorizontal: SPACING.MEDIUM,
    },

    // Rows
    expenseRow: { paddingVertical: SPACING.SMALL + 4 },
    expenseDivider: {
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    expenseTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 3,
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expenseBody: { flex: 1 },
    expenseNameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: SPACING.SMALL,
    },
    expenseName: { flex: 1 },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: SPACING.SMALL,
        marginTop: SPACING.SMALL + 2,
        marginLeft: 40 + SPACING.SMALL + 3,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RADIUS.SMALL,
    },
    keepingPill: { backgroundColor: t.SURFACE_HIGH },
    watchingPill: { backgroundColor: t.INFO_DIM },
});

const WatchdogScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [totals, setTotals] = useState({ monthly: 0, annual: 0, projected: 0, confirmed: 0 });
    const [outcomes, setOutcomes] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [showAnnual, setShowAnnual] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showIntro, setShowIntro] = useState(false);
    const [cancelSheet, setCancelSheet] = useState({ visible: false, expense: null, guide: null });
    const [negotiateSheet, setNegotiateSheet] = useState({ visible: false, expense: null, guide: null });

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getWatchdogAnalysis();

            if (data?.success) {
                setExpenses(data.expenses || []);
                setCategories(data.categories?.length ? data.categories : ['All']);
                setAlerts(data.alerts || []);
                setTotals({
                    monthly: data.analysis?.total_monthly || 0,
                    annual: data.analysis?.total_annual || 0,
                    projected: data.analysis?.potential_savings || 0,
                    confirmed: data.analysis?.confirmed_savings || 0,
                });
            }
        } catch (err) {
            console.error('Error fetching watchdog data:', err);
            setError('Failed to load data. Pull to refresh.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Outcomes are fetched read-only and confirmed separately, so a request
    // that never reaches the screen cannot consume the one chance to tell the
    // user their cancellation failed. Same split as goal milestones.
    const loadWatchState = useCallback(async () => {
        try {
            const data = await api.getWatchOutcomes();
            setOutcomes(data?.outcomes || []);

            // Cancel-then-reschedule from server state, so a watch that has
            // resolved or been withdrawn loses its reminder instead of firing
            // and sending the user to a screen with nothing on it. Serialised
            // through the shared queue -- two overlapping runs interleave as
            // cancel, cancel, schedule, schedule and everything ends up
            // scheduled twice.
            await syncWatchReminders(data?.pending || []);
        } catch {
            // The list still works without them; nothing here is load-bearing
            // for rendering the screen.
        }
    }, []);

    // One load, not two. The list and the watch state are both "open the
    // screen", and refreshAfterAction already treats them as a pair.
    useEffect(() => {
        fetchData();
        loadWatchState();
    }, [fetchData, loadWatchState]);

    useEffect(() => {
        hasSeenWatchdogIntro().then((seen) => setShowIntro(!seen));
    }, []);

    const acknowledgeOutcome = useCallback((id) => {
        setOutcomes((current) => current.filter((o) => o.id !== id));
        api.markWatchSeen(id).catch(() => { /* it will be offered again */ });
    }, []);

    // Acting on a row opens or withdraws a watch, so the reminders have to be
    // rebuilt from what the server now holds rather than guessed at here.
    const refreshAfterAction = useCallback(() => {
        fetchData();
        loadWatchState();
    }, [fetchData, loadWatchState]);

    const dismissIntro = useCallback(() => {
        setShowIntro(false);
        setWatchdogIntroSeen();
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const handleAction = async (expense, action) => {
        try {
            const result = await api.handleExpenseAction(expense.id, action);
            const guide = result?.data?.guide;

            // The server always returns a guide for a cancel now -- merchant
            // steps, category steps, or generic ones. It used to return null for
            // anything outside twelve merchants, and this sheet only opens when a
            // guide comes back, so the button flipped a hidden status and nothing
            // appeared on screen.
            if (guide && action === 'stop') {
                setCancelSheet({ visible: true, expense, guide });
            } else if (guide && action === 'negotiate') {
                setNegotiateSheet({ visible: true, expense, guide });
            }

            refreshAfterAction();
        } catch (err) {
            console.error('Error processing action:', err);
            setError('That did not go through. Pull to refresh and try again.');
        }
    };

    const filtered = selectedCategory === 'All'
        ? expenses
        : expenses.filter((e) => e.category === selectedCategory);

    /**
     * Actions come from the row's class, which is what structurally removes the
     * dead taps: a button with no path behind it is never rendered. Negotiate
     * appears only where the server confirmed a script exists, and a fixed
     * payment -- a mortgage, a car loan -- gets nothing at all.
     */
    const renderActions = (item) => {
        if (item.expenseClass === 'fixed') return null;

        if (item.status === 'cancelling') {
            return (
                <View style={[styles.statusPill, styles.watchingPill]}>
                    <Ionicons name="hourglass-outline" size={14} color={theme.INFO} />
                    <Text variant="label" tone="info">
                        Watching{item.dueDate ? ` · next charge ${item.dueDate}` : ''}
                    </Text>
                </View>
            );
        }

        if (item.status === 'negotiating') {
            return (
                <View style={[styles.statusPill, styles.watchingPill]}>
                    <Ionicons name="call-outline" size={14} color={theme.INFO} />
                    <Text variant="label" tone="info">
                        Negotiating{item.dueDate ? ` · next bill ${item.dueDate}` : ''}
                    </Text>
                </View>
            );
        }

        // The user said they want this one. Saying so and then flagging it again
        // next week is the thing the copy promises not to do.
        if (item.answered) {
            return (
                <TouchableOpacity
                    style={[styles.statusPill, styles.keepingPill]}
                    onPress={() => handleAction(item, 'undo')}
                    accessibilityRole="button"
                    accessibilityLabel={`Stop keeping ${item.name}`}
                >
                    <Ionicons name="checkmark-circle" size={14} color={theme.SUCCESS} />
                    <Text variant="label" tone="secondary">Keeping · undo</Text>
                </TouchableOpacity>
            );
        }

        return (
            <>
                {item.expenseClass === 'subscription' && (
                    <Button
                        title="Cancel…"
                        variant="danger"
                        size="sm"
                        onPress={() => handleAction(item, 'stop')}
                    />
                )}
                {item.hasNegotiation && (
                    <Button
                        title={item.expenseClass === 'bill' ? 'Lower this bill…' : 'Negotiate…'}
                        variant="secondary"
                        size="sm"
                        onPress={() => handleAction(item, 'negotiate')}
                    />
                )}
                <Button
                    title="Keep"
                    variant="ghost"
                    size="sm"
                    onPress={() => handleAction(item, 'keep')}
                />
            </>
        );
    };

    const renderExpense = (item, index) => {
        const meta = getCategoryMeta(item.category);
        // A merchant's own brand colour is data; otherwise the category's
        // identity hue, so the tile means the same thing it means on Analytics.
        const tint = item.logoColor || categoryColor(theme, meta.colorIndex);
        const actions = renderActions(item);

        return (
            <View key={item.id} style={[styles.expenseRow, index > 0 && styles.expenseDivider]}>
                <View style={styles.expenseTop}>
                    <View style={[styles.logo, { backgroundColor: alpha(tint, 0.16) }]}>
                        <Text variant="h2" color={tint}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>

                    <View style={styles.expenseBody}>
                        <View style={styles.expenseNameRow}>
                            <Text variant="bodyMed" style={styles.expenseName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text variant="num">${item.amount.toFixed(2)}</Text>
                        </View>
                        {/*
                          * The evidence line, replacing the '●' and '○'
                          * confidence dots that never had a legend anywhere in
                          * the app. "Charged on the 14th, 4 months running"
                          * needs no explaining, and it shows its working.
                          */}
                        <Text variant="meta" tone="muted" numberOfLines={1}>
                            {item.evidence || item.frequency} · {item.category}
                        </Text>
                    </View>
                </View>

                {actions ? <View style={styles.actions}>{actions}</View> : null}
            </View>
        );
    };

    const renderSection = ({ key, title, subhead }) => {
        const rows = filtered.filter((e) => (e.expenseClass || 'subscription') === key);
        if (rows.length === 0) return null;

        return (
            <View key={key}>
                <View style={styles.sectionHead}>
                    <Text variant="overline" tone="muted">{title}</Text>
                    <Text variant="meta" tone="secondary">{subhead}</Text>
                </View>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    {rows.map(renderExpense)}
                </Card>
            </View>
        );
    };

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Looking for repeating payments…" />
            </Screen>
        );
    }

    const nothingAnywhere = expenses.length === 0;
    const nothingInFilter = !nothingAnywhere && filtered.length === 0;

    return (
        <>
            <Screen
                scroll
                header={
                    <ScreenHeader
                        title="Watchdog"
                        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
                    />
                }
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
            >
                {showIntro && (
                    <Card>
                        <View style={styles.introHead}>
                            <Text variant="title">What Watchdog does</Text>
                            <TouchableOpacity
                                onPress={dismissIntro}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Dismiss"
                            >
                                <Ionicons name="close" size={20} color={theme.TEXT_MUTED} />
                            </TouchableOpacity>
                        </View>
                        <Text variant="body" tone="secondary">
                            We read your transaction history for payments that repeat —
                            subscriptions, bills, and fixed payments like rent or a loan.
                        </Text>
                        <Text variant="body" tone="secondary" style={styles.introBody}>
                            We can&apos;t cancel or renegotiate anything for you. Only you can do
                            that. What we can do is show you exactly what you&apos;re committed to,
                            and how to get out of it.
                        </Text>
                        <View style={styles.introActions}>
                            <Button
                                title="How it works"
                                variant="ghost"
                                size="sm"
                                onPress={() => navigation.navigate('LegalDoc', { docType: 'watchdog' })}
                            />
                            <Button
                                title="Got it"
                                variant="secondary"
                                size="sm"
                                onPress={dismissIntro}
                            />
                        </View>
                    </Card>
                )}

                {/*
                  * Outcomes come first. Someone who was charged for a
                  * subscription they cancelled has a reason to open the app that
                  * outranks anything else on this screen.
                  */}
                {outcomes.map((outcome) => {
                    const copy = OUTCOME_COPY[outcome.status]?.(outcome);
                    if (!copy) return null;
                    return (
                        <Card key={outcome.id}>
                            <View style={styles.outcomeHead}>
                                <Ionicons
                                    name={copy.icon}
                                    size={18}
                                    color={copy.tone === 'danger' ? theme.DANGER
                                        : copy.tone === 'success' ? theme.SUCCESS : theme.TEXT_MUTED}
                                />
                                <Text variant="title" style={{ flex: 1 }}>{copy.title}</Text>
                            </View>
                            <Text variant="body" tone="secondary" style={styles.outcomeBody}>
                                {copy.body}
                            </Text>
                            <Button
                                title="Got it"
                                variant="secondary"
                                size="sm"
                                onPress={() => acknowledgeOutcome(outcome.id)}
                                style={{ alignSelf: 'flex-start' }}
                            />
                        </Card>
                    );
                })}

                {!nothingAnywhere && (
                    <Card>
                        <View style={styles.totalsTop}>
                            <View style={styles.piggyIcon}>
                                <MaterialCommunityIcons name="piggy-bank" size={26} color={theme.ACCENT} />
                            </View>
                            <View style={styles.countBadge}>
                                <Text variant="label" tone="secondary">
                                    {expenses.length} repeating
                                </Text>
                            </View>
                        </View>

                        <SegmentedControl
                            options={PERIOD_OPTIONS}
                            value={showAnnual}
                            onChange={setShowAnnual}
                            inset={false}
                            style={{ marginBottom: SPACING.MEDIUM }}
                        />

                        {/*
                          * Confirmed savings only: charges we watched stop, and
                          * bills we watched shrink. The old hero counted money
                          * nobody had saved -- the amounts of everything marked
                          * for cancellation plus a discount percentage parsed out
                          * of a prose string. That figure survives below, in
                          * small type, labelled as the projection it is.
                          */}
                        <Text variant="overline" tone="muted">Confirmed savings</Text>
                        <Text variant="hero" style={styles.heroAmount}>
                            ${(showAnnual ? totals.confirmed * 12 : totals.confirmed).toFixed(2)}
                        </Text>
                        <Text variant="meta" tone="muted">
                            {totals.confirmed > 0
                                ? `${showAnnual ? 'A year' : 'A month'}, from charges we watched stop.`
                                : 'When you cancel or lower something, we confirm it here once the '
                                  + 'charge actually stops.'}
                        </Text>

                        <View style={styles.committed}>
                            <Ionicons name="repeat-outline" size={14} color={theme.TEXT_MUTED} />
                            <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                                ${(showAnnual ? totals.annual : totals.monthly).toFixed(2)} committed
                                {showAnnual ? ' each year' : ' each month'} across {expenses.length} repeating
                                payment{expenses.length === 1 ? '' : 's'}.
                            </Text>
                        </View>

                        {totals.projected > 0 && (
                            <View style={styles.projection}>
                                <Ionicons name="trending-down-outline" size={14} color={theme.TEXT_MUTED} />
                                <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                                    Up to ${totals.projected.toFixed(2)} a month less, if you follow
                                    through on what you&apos;ve flagged.
                                </Text>
                            </View>
                        )}
                    </Card>
                )}

                {alerts.length > 0 && <AlertBanner alerts={alerts} />}

                {categories.length > 2 && (
                    <ChipRow style={{ marginBottom: SPACING.SMALL }}>
                        {categories.map((name) => {
                            const meta = name === 'All' ? null : getCategoryMeta(name);
                            return (
                                <Chip
                                    key={name}
                                    label={name}
                                    // Chip renders Ionicons only; a category whose
                                    // glyph lives in another set goes without one
                                    // rather than rendering a missing-glyph box.
                                    icon={meta?.library === 'Ionicons' ? meta.icon : undefined}
                                    color={meta ? categoryColor(theme, meta.colorIndex) : undefined}
                                    active={selectedCategory === name}
                                    onPress={() => setSelectedCategory(name)}
                                />
                            );
                        })}
                    </ChipRow>
                )}

                {error && (
                    <Card style={{ backgroundColor: theme.DANGER_DIM, borderColor: theme.DANGER_DIM }}>
                        <Text variant="body" tone="danger">{error}</Text>
                    </Card>
                )}

                {nothingAnywhere && !error && (
                    <Card>
                        <EmptyState
                            icon="shield-outline"
                            title="Not enough history yet"
                            message={
                                'We wait until we have seen a payment at least three times before '
                                + 'calling it recurring. Twice could be a coincidence.\n\n'
                                + 'Keep your account connected and check back next month.'
                            }
                        />
                    </Card>
                )}

                {nothingInFilter && (
                    <Card>
                        <EmptyState icon="funnel-outline" message="Nothing in this category." />
                    </Card>
                )}

                {SECTIONS.map(renderSection)}
            </Screen>

            <CancellationBottomSheet
                visible={cancelSheet.visible}
                expense={cancelSheet.expense}
                guide={cancelSheet.guide}
                onClose={() => setCancelSheet({ visible: false, expense: null, guide: null })}
                onConfirm={() => {
                    setCancelSheet({ visible: false, expense: null, guide: null });
                    refreshAfterAction();
                }}
            />
            <NegotiationBottomSheet
                visible={negotiateSheet.visible}
                expense={negotiateSheet.expense}
                guide={negotiateSheet.guide}
                onClose={() => setNegotiateSheet({ visible: false, expense: null, guide: null })}
                onNegotiated={() => {
                    setNegotiateSheet({ visible: false, expense: null, guide: null });
                    refreshAfterAction();
                }}
            />
        </>
    );
};

export default WatchdogScreen;
