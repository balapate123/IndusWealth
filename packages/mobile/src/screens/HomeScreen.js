import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { create, open } from '../services/plaidLink';
import { SPACING, RADIUS, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    Card,
    Text,
    Button,
    Input,
    ChangeBadge,
    Chip,
    ChipRow,
    Overline,
    EmptyState,
    LoadingState,
} from '../components/ui';
import TransactionRow from '../components/TransactionRow';
import TransactionDetailSheet from '../components/TransactionDetailSheet';
import GoalCard from '../components/GoalCard';
import InsightSpotlight from '../components/InsightSpotlight';
import CheckinNudge from '../components/CheckinNudge';
import useTransactionFlags from '../hooks/useTransactionFlags';
import useGoals from '../hooks/useGoals';
import useInsightSpotlight from '../hooks/useInsightSpotlight';
import useCheckinNudge from '../hooks/useCheckinNudge';
import { presentMilestones } from '../services/notifications';
import api from '../services/api';
import cache from '../services/cache';
import { categorizeTransaction } from '../utils/categorization';

// Mini balance sparkline. Colour is passed in so it follows the theme accent.
const BalanceChart = ({ width = 120, height = 40, color }) => {
    const dataPoints = [0.3, 0.4, 0.35, 0.5, 0.45, 0.6, 0.7, 0.65, 0.8, 0.85, 0.9];

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = dataPoints.map((point, index) => {
        const x = padding + (index / (dataPoints.length - 1)) * chartWidth;
        const y = padding + (1 - point) * chartHeight;
        return { x, y };
    });

    const linePath = points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const prev = points[index - 1];
        const cpX = (prev.x + point.x) / 2;
        return `${path} Q ${cpX} ${prev.y} ${point.x} ${point.y}`;
    }, '');

    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    const last = points[points.length - 1];

    return (
        <Svg width={width} height={height}>
            <Defs>
                <LinearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <Stop offset="100%" stopColor={color} stopOpacity="0" />
                </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#areaGradient)" />
            <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* Emphasised endpoint — the value the number above refers to */}
            <Path d={`M ${last.x} ${last.y} l 0 0.01`} stroke={color} strokeWidth={5} strokeLinecap="round" />
        </Svg>
    );
};

const money = (value) =>
    `$${Math.abs(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isDateToday = (dateStr) => dateStr === new Date().toISOString().slice(0, 10);
const isDateYesterday = (dateStr) =>
    dateStr === new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const formatTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(`${dateStr}T12:00:00`);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        return 'N/A';
    }
};

const makeStyles = (t) => StyleSheet.create({
    scrollContent: {
        // Clears the floating tab bar.
        paddingBottom: 110,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.MEDIUM,
        paddingTop: SPACING.SMALL + 4,
        paddingBottom: SPACING.MEDIUM,
    },
    identity: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },
    onlineDot: {
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: t.SUCCESS,
        borderWidth: 2,
        borderColor: t.BG,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Balance card
    balanceTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    balanceAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    balanceRight: {
        alignItems: 'flex-end',
        gap: 5,
    },
    savingsRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 5,
    },
    actions: {
        flexDirection: 'row',
        gap: 9,
        marginTop: SPACING.MEDIUM,
    },

    // Transaction rows
    listCard: {
        paddingHorizontal: SPACING.MEDIUM - 2,
        paddingVertical: 0,
    },

    // Banners
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 2,
    },
    bannerBody: { flex: 1 },

    moreIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 5,
        marginTop: SPACING.SMALL,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: t.HAIRLINE_STRONG,
    },

    goalsEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
    },
    goalsEmptyIcon: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.MEDIUM,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.ACCENT_DIM,
    },
    goalsEmptyBody: { flex: 1 },

});

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [totalCash, setTotalCash] = useState(0);
    const [changePercent, setChangePercent] = useState(0);
    const [monthlySavings, setMonthlySavings] = useState(0);
    const [showBalance, setShowBalance] = useState(true);
    const [selectedAccount, setSelectedAccount] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [userName, setUserName] = useState('User');
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [plaidStatus, setPlaidStatus] = useState('unknown');
    const [reAuthLoading, setReAuthLoading] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const flagState = useTransactionFlags();

    // Home is the first screen after login, so this is also where the device's
    // reminders get reconciled with the server — the hook reschedules whenever
    // the list loads, which covers a goal changed on another device.
    const { goals: activeGoals, load: loadGoals } = useGoals({ status: 'active' });

    // Reload on focus. useGoals holds its state per instance, and Home and the
    // Goals list each have their own — so deleting a goal over there refetched
    // that copy and left this one intact. Home is a tab: it does not remount
    // when you navigate back to it, so without this the deleted goal sat on the
    // dashboard until the app restarted. Same for a goal created, renamed, or
    // contributed to elsewhere. Silent: the cards are already on screen and
    // blanking them to a spinner on every tab switch would be worse.
    useFocusEffect(
        useCallback(() => { loadGoals({ silent: true }); }, [loadGoals])
    );

    // The pop-up recommendation. Gated on having accounts: a user who has not
    // connected a bank has nothing to be reminded about, and the first thing
    // they should meet is the connect flow, not a sheet over the top of it.
    const spotlight = useInsightSpotlight({ enabled: !loading && accounts.length > 0 });

    // The spotlight has first claim on the interruption. Two pop-ups on one app
    // open is not two chances to help, it is an app that interrupts twice.
    const checkin = useCheckinNudge({
        enabled: !loading,
        suppressed: spotlight.visible || !!spotlight.spotlight,
    });

    const handleCheckinAct = useCallback((nudge) => {
        checkin.dismiss();
        if (nudge?.action?.type === 'goal') {
            navigation.navigate('GoalDetail', { goalId: nudge.action.goalId });
        } else if (nudge?.action?.type === 'debt') {
            navigation.navigate('Debt');
        }
    }, [checkin, navigation]);

    const handleSpotlightAct = useCallback((action, insight) => {
        spotlight.act(insight);
        if (action?.type === 'web_link' && action.url) {
            Linking.openURL(action.url).catch((err) => {
                console.error('Failed to open spotlight link:', err);
            });
        } else if (action?.type === 'navigate' && action.route) {
            navigation.navigate(action.route, action.params || {});
        }
    }, [spotlight, navigation]);

    // Milestones cannot be scheduled ahead: crossing 50% depends on a balance
    // the device does not know until it asks. So it asks once per app open.
    //
    // Ask, present, then confirm only what was presented. The check is
    // read-only, so a milestone the device could not show (no notification
    // permission) stays pending rather than being consumed by having been
    // asked about — which is how the first version lost them permanently.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await api.checkGoalMilestones();
                if (cancelled || !response?.success || !response.data?.length) return;

                const shown = await presentMilestones(response.data);
                if (cancelled || shown.length === 0) return;

                await Promise.all(shown.map((crossing) =>
                    api.markGoalMilestones(crossing.goal_id, crossing.milestones)
                        .catch((err) => {
                            // Unconfirmed means it repeats on the next open. A
                            // duplicate celebration is a far better failure than
                            // a lost one.
                            console.warn('Could not confirm a milestone:', err?.message || err);
                        })
                ));
            } catch (err) {
                // A goal celebration is not worth interrupting the dashboard for.
                console.warn('Could not check goal milestones:', err?.message || err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Format transactions for display
    const formatTransactions = (rawTransactions) => {
        return (rawTransactions || []).map((tx, index) => {
            const isToday = isDateToday(tx.date);
            const isYesterday = isDateYesterday(tx.date);
            const categorization = categorizeTransaction(tx);

            return {
                id: tx.transaction_id || index,
                merchant: tx.name,
                category: categorization.category,
                categoryIcon: categorization.icon,
                categoryLibrary: categorization.library,
                categoryColorIndex: categorization.colorIndex,
                amount: tx.amount * -1,
                time: formatTime(tx.date),
                rawDate: tx.date,
                dateGroup: isToday ? 'today' : isYesterday ? 'yesterday' : 'older',
                account_id: tx.account_id,
                notes: tx.notes || '',
                flags: tx.flags || [],
            };
        });
    };

    // Load from cache first, then fetch fresh data
    const loadData = useCallback(async (forceRefresh = false) => {
        try {
            setError(null);

            // STEP 1: Load from cache first (instant display)
            if (!forceRefresh) {
                const [cachedAccounts, cachedTransactions, cachedUser] = await Promise.all([
                    cache.getCachedAccounts(),
                    cache.getCachedTransactions(),
                    cache.getCachedUser(),
                ]);

                if (cachedUser?.name) {
                    setUserName(cachedUser.name.split(' ')[0]); // Use first name
                }

                if (cachedAccounts) {
                    setAccounts(cachedAccounts.accounts || []);
                    // Liquid cash only — never fall back to total_balance. `||`
                    // treats a real $0 as missing, so a spent-out chequing
                    // account used to display whatever the fallback held.
                    setTotalCash(cachedAccounts.liquid_cash ?? 0);
                    setChangePercent(cachedAccounts.change_percent || 0);
                    setMonthlySavings(cachedAccounts.monthly_savings || 0);
                }

                if (cachedTransactions) {
                    setTransactions(formatTransactions(cachedTransactions));
                    setLoading(false); // Show cached data immediately
                }
            }

            // STEP 2: Fetch fresh data from API
            const refreshParam = forceRefresh ? '?refresh=true' : '';
            const [accountsData, transactionsData, userData] = await Promise.all([
                api.getAccounts().catch(() => null),
                api.getTransactions(refreshParam).catch(() => null),
                api.auth.me().catch(() => null),
            ]);

            if (userData?.user?.name) {
                setUserName(userData.user.name.split(' ')[0]); // Use first name
                await cache.setCachedUser(userData.user);
            }

            if (accountsData?.success) {
                setAccounts(accountsData.accounts || []);
                // Liquid cash only — see the note on the cached branch above.
                setTotalCash(accountsData.liquid_cash ?? 0);
                setChangePercent(accountsData.change_percent || 0);
                setMonthlySavings(accountsData.monthly_savings || 0);
                // Cache the accounts data
                await cache.setCachedAccounts(accountsData);
            }

            if (transactionsData?.success) {
                setTransactions(formatTransactions(transactionsData.data));
                // Cache the raw transactions data
                await cache.setCachedTransactions(transactionsData.data);
                // Track Plaid status for re-auth banner
                if (transactionsData.plaid_status) {
                    setPlaidStatus(transactionsData.plaid_status);
                }
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setError('Failed to load data. Pull to refresh.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData(false); // Initial load from cache
    }, [loadData]);

    const [lastPullTime, setLastPullTime] = useState(0);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        const now = Date.now();
        // 3 seconds threshold for double-pull
        if (now - lastPullTime < 3000) {
            // Double pull detected - FORCE refresh from Plaid
            loadData(true);
        } else {
            // Single pull - Refresh from backend cache (cheap)
            // Backend will only sync if cache is stale (>24h)
            loadData(false);
            setLastPullTime(now);
        }
    }, [loadData, lastPullTime]);

    // Handle Plaid re-authentication - opens Plaid Link in update mode
    const handleReAuthenticate = async () => {
        setReAuthLoading(true);
        try {
            console.log('🔄 Getting update mode link token...');
            const result = await api.createUpdateLinkToken();

            if (!result?.link_token) {
                console.error('Failed to get update link token');
                setReAuthLoading(false);
                return;
            }

            console.log('✅ Got update link token, opening Plaid Link...');

            await create({ token: result.link_token });

            await open({
                onSuccess: async () => {
                    console.log('🎉 Plaid Link update success!');
                    setPlaidStatus('success');
                    loadData(true);
                    setReAuthLoading(false);
                },
                onExit: (exit) => {
                    console.log('📤 Plaid Link exited:', exit?.error?.displayMessage || 'User cancelled');
                    setReAuthLoading(false);
                },
            });
        } catch (err) {
            console.error('Re-auth error:', err);
            setReAuthLoading(false);
        }
    };

    const todayTransactions = transactions.filter((t) => t.dateGroup === 'today');
    const yesterdayTransactions = transactions.filter((t) => t.dateGroup === 'yesterday');
    const olderTransactions = transactions.filter((t) => t.dateGroup === 'older');

    // Accounts get an identity colour from the same validated ramp the
    // categories use, so the two colour systems can't drift apart.
    const realAccounts = accounts.filter((acc) => acc.id !== 'all' && acc.type !== 'aggregate');
    const getAccountColor = (accountId) => {
        if (!accountId || realAccounts.length === 0) return categoryColor(theme, 0);
        const index = realAccounts.findIndex((acc) => acc.id === accountId);
        return categoryColor(theme, index === -1 ? 0 : index);
    };

    const openTransactionDetails = (item) => {
        setSelectedTransaction(item);
        setEditNotes(item.notes || '');
        flagState.openFor(item);
        setShowTransactionModal(true);
    };

    const handleSaveDetails = async () => {
        if (!selectedTransaction) return;

        try {
            setSaving(true);
            const notes = editNotes.trim();
            const [, nextFlags] = await Promise.all([
                api.updateTransactionNotes(selectedTransaction.id, notes),
                flagState.save(selectedTransaction.id),
            ]);

            const updated = { ...selectedTransaction, notes, flags: nextFlags };
            setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? updated : tx)));
            setSelectedTransaction(updated);

            setShowTransactionModal(false);
        } catch (err) {
            console.error('Error saving transaction details:', err);
            setError('Could not save your changes. Try again.');
        } finally {
            setSaving(false);
        }
    };

    const renderTransaction = (item, index) => (
        <TransactionRow
            key={item.id}
            transaction={item}
            accountColor={getAccountColor(item.account_id)}
            meta={item.time}
            divider={index > 0}
            onPress={() => openTransactionDetails(item)}
        />
    );

    const renderTransactionGroup = (title, items, showSeeAll = false) => {
        if (items.length === 0) return null;
        return (
            <View>
                <Overline
                    right={showSeeAll ? (
                        <TouchableOpacity onPress={() => navigation.navigate('AllTransactions')}>
                            <Text variant="label" tone="link">See all</Text>
                        </TouchableOpacity>
                    ) : null}
                >
                    {title}
                </Overline>
                <Card padded={false} style={styles.listCard}>
                    {items.map((item, index) => renderTransaction(item, index))}
                </Card>
            </View>
        );
    };

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading your finances..." />
            </Screen>
        );
    }

    const header = (
        <View style={styles.header}>
            <View style={styles.identity}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('Profile')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Open profile"
                >
                    <View style={styles.avatar}>
                        <Ionicons name="person" size={22} color={theme.TEXT_SECONDARY} />
                    </View>
                    <View style={styles.onlineDot} />
                </TouchableOpacity>
                <View>
                    <Text variant="meta" tone="muted">Welcome back,</Text>
                    <Text variant="h2">{userName}</Text>
                </View>
            </View>

            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Notifications">
                <Ionicons name="notifications-outline" size={21} color={theme.TEXT_SECONDARY} />
            </TouchableOpacity>
        </View>
    );

    const selectedAccountName = (() => {
        if (!selectedTransaction?.account_id) return null;
        const account = accounts.find((a) => a.id === selectedTransaction.account_id);
        return account ? (account.alias || account.name) : 'N/A';
    })();

    return (
        <>
        <Screen
            scroll
            header={header}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.scrollContent}
        >
            {/* Balance */}
            <Card>
                <View style={styles.balanceTop}>
                    <View>
                        <Text variant="overline" tone="muted">Total liquid cash</Text>
                        <View style={styles.balanceAmountRow}>
                            <Text variant="hero">{showBalance ? money(totalCash) : '••••••'}</Text>
                            <TouchableOpacity
                                onPress={() => setShowBalance((v) => !v)}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                accessibilityRole="button"
                                accessibilityLabel={showBalance ? 'Hide balance' : 'Show balance'}
                            >
                                <Ionicons
                                    name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                                    size={18}
                                    color={theme.TEXT_MUTED}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.balanceRight}>
                        <ChangeBadge percent={changePercent} />
                        <BalanceChart width={92} height={34} color={theme.ACCENT} />
                    </View>
                </View>

                <View style={styles.savingsRow}>
                    <Text variant="num" tone={monthlySavings >= 0 ? 'success' : 'danger'}>
                        {monthlySavings >= 0 ? '+' : '−'}{money(monthlySavings)}
                    </Text>
                    <Text variant="body" tone="secondary">
                        {monthlySavings >= 0 ? ' in savings this month' : ' overspent this month'}
                    </Text>
                </View>

                <View style={styles.actions}>
                    <Button
                        title="Add account"
                        icon="add"
                        onPress={() => navigation.navigate('ConnectBank')}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title="Analytics"
                        icon="analytics-outline"
                        variant="secondary"
                        onPress={() => navigation.navigate('Analytics')}
                        style={{ flex: 1 }}
                    />
                </View>
            </Card>

            {/* Goals — only the ones still in progress, newest target first.
                Capped at two: this is a summary, and the full list is one tap
                away. A Home screen that lists everything stops being a summary.

                The empty branch is not decoration. This section used to render
                only when a goal already existed, and the "Manage" link inside it
                was the single route to the Goals screen — so the only door to
                where you create your first goal was hidden until you had one.
                Someone with no goals could not reach the feature at all. */}
            <View>
                <Overline
                    right={activeGoals.length > 0 ? (
                        <TouchableOpacity onPress={() => navigation.navigate('Goals')}>
                            <Text variant="label" tone="link">
                                {activeGoals.length > 2 ? `All ${activeGoals.length}` : 'Manage'}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                >
                    Goals
                </Overline>

                {activeGoals.length > 0 ? (
                    activeGoals.slice(0, 2).map((goal) => (
                        <GoalCard
                            key={goal.id}
                            goal={goal}
                            compact
                            onPress={() => navigation.navigate('GoalDetail', { goalId: goal.id, name: goal.name })}
                        />
                    ))
                ) : (
                    <Card onPress={() => navigation.navigate('Goals')}>
                        <View style={styles.goalsEmpty}>
                            <View style={styles.goalsEmptyIcon}>
                                <Ionicons name="flag" size={20} color={theme.ACCENT} />
                            </View>
                            <View style={styles.goalsEmptyBody}>
                                <Text variant="bodyMed">Set a savings goal</Text>
                                <Text variant="meta" tone="secondary">
                                    Track what you are saving toward, with a reminder to keep at it.
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.TEXT_MUTED} />
                        </View>
                    </Card>
                )}
            </View>

            {/* Accounts */}
            {realAccounts.length > 0 ? (
                <View>
                    <Overline
                        right={
                            <TouchableOpacity onPress={() => navigation.navigate('AllAccounts')}>
                                <Text variant="label" tone="link">Manage</Text>
                            </TouchableOpacity>
                        }
                    >
                        Accounts
                    </Overline>
                    <ChipRow style={{ marginBottom: SPACING.MEDIUM }}>
                        {realAccounts.map((account) => {
                            const accentColor = getAccountColor(account.id);
                            return (
                                <Chip
                                    key={account.id}
                                    label={account.alias || account.name}
                                    active={selectedAccount === account.id}
                                    color={accentColor}
                                    onPress={() => {
                                        setSelectedAccount(account.id);
                                        navigation.navigate('AccountTransactions', { account });
                                    }}
                                />
                            );
                        })}
                    </ChipRow>
                </View>
            ) : (
                <Card>
                    <EmptyState
                        icon="link-outline"
                        title="No accounts connected"
                        message="Connect a bank account to see your balance and transactions."
                        actionLabel="Connect account"
                        onAction={() => navigation.navigate('ConnectBank')}
                    />
                </Card>
            )}

            {/* Bank connection expired */}
            {plaidStatus === 'login_required' && (
                <Card
                    onPress={reAuthLoading ? undefined : handleReAuthenticate}
                    style={{ backgroundColor: theme.WARNING_DIM, borderColor: theme.WARNING_DIM }}
                >
                    <View style={styles.banner}>
                        <Ionicons name="alert-circle" size={24} color={theme.WARNING} />
                        <View style={styles.bannerBody}>
                            <Text variant="bodyMed">Bank connection expired</Text>
                            <Text variant="meta" tone="secondary">
                                Tap to re-authenticate and sync your latest transactions
                            </Text>
                        </View>
                        {reAuthLoading
                            ? <ActivityIndicator size="small" color={theme.WARNING} />
                            : <Ionicons name="chevron-forward" size={20} color={theme.WARNING} />}
                    </View>
                </Card>
            )}

            {/* Error */}
            {error && (
                <Card style={{ backgroundColor: theme.DANGER_DIM, borderColor: theme.DANGER_DIM }}>
                    <View style={styles.banner}>
                        <Ionicons name="cloud-offline-outline" size={20} color={theme.DANGER} />
                        <Text variant="body" tone="danger" style={styles.bannerBody}>{error}</Text>
                    </View>
                </Card>
            )}

            {/* Transactions — "See all" sits on the first group that has rows */}
            {renderTransactionGroup('Today', todayTransactions, todayTransactions.length > 0)}
            {renderTransactionGroup('Yesterday', yesterdayTransactions,
                todayTransactions.length === 0 && yesterdayTransactions.length > 0)}
            {renderTransactionGroup('Recent', olderTransactions.slice(0, 20),
                todayTransactions.length === 0 && yesterdayTransactions.length === 0)}

            {transactions.length === 0 && !error && realAccounts.length > 0 && (
                <Card>
                    <EmptyState
                        icon="receipt-outline"
                        title="No transactions yet"
                        message="Pull down to sync with your bank."
                    />
                </Card>
            )}

            {transactions.length > 0 && (
                <View style={styles.moreIndicator}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                </View>
            )}

        </Screen>

        <TransactionDetailSheet
            visible={showTransactionModal}
            transaction={selectedTransaction}
            accountName={selectedAccountName}
            accountColor={selectedTransaction ? getAccountColor(selectedTransaction.account_id) : null}
            notes={editNotes}
            onChangeNotes={setEditNotes}
            flags={flagState.flags}
            selectedFlagIds={flagState.selected}
            onToggleFlag={flagState.toggle}
            saving={saving}
            onSave={handleSaveDetails}
            onClose={() => setShowTransactionModal(false)}
        />

        <InsightSpotlight
            insight={spotlight.spotlight}
            visible={spotlight.visible}
            onSeen={spotlight.markSeen}
            onAct={handleSpotlightAct}
            onSnooze={spotlight.snooze}
            onDismiss={spotlight.dismiss}
        />

        <CheckinNudge
            nudge={checkin.nudge}
            visible={checkin.visible}
            onMarkSeen={checkin.markSeen}
            onAct={handleCheckinAct}
            onDismiss={checkin.dismiss}
            onTurnOff={() => checkin.setEnabled(false)}
        />
        </>
    );
};

export default HomeScreen;
