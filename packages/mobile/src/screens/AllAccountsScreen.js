import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SPACING, alpha, categoryColor } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    BottomSheet,
    Card,
    Text,
    Button,
    Input,
    SectionTitle,
    Overline,
    EmptyState,
    LoadingState,
} from '../components/ui';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

const ACCOUNT_ICONS = {
    checking: 'card-outline',
    savings: 'wallet-outline',
    credit: 'card',
    investment: 'trending-up',
    brokerage: 'trending-up',
    loan: 'home-outline',
    mortgage: 'home-outline',
};

// Account types take identity from the validated ramp, by slot, so they line up
// with the colours categories use elsewhere.
const ACCOUNT_SLOTS = {
    checking: 5,
    savings: 2,
    credit: 1,
    investment: 4,
    brokerage: 4,
    loan: 6,
    mortgage: 6,
};

const formatBalance = (balance) =>
    `$${Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const makeStyles = (t) => StyleSheet.create({
    content: { paddingBottom: 120 },
    summaryRow: { flexDirection: 'row', alignItems: 'center' },
    summaryItem: { flex: 1 },
    summaryDivider: {
        width: 1,
        height: 34,
        backgroundColor: t.HAIRLINE,
        marginHorizontal: SPACING.MEDIUM,
    },
    debtRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.MEDIUM,
        paddingTop: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    countBadge: {
        alignSelf: 'flex-start',
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        marginTop: SPACING.MEDIUM,
    },

    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.SMALL + 3,
        paddingVertical: SPACING.SMALL + 4,
    },
    divider: { borderTopWidth: 1, borderTopColor: t.HAIRLINE },
    accountIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accountInfo: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    balanceBlock: { alignItems: 'flex-end' },
    actions: { gap: SPACING.SMALL, marginTop: SPACING.MEDIUM, marginHorizontal: SPACING.MEDIUM },
    dialogIcon: { alignItems: 'center', marginBottom: SPACING.MEDIUM },
    dialogActions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.MEDIUM },
});

const AllAccountsScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [accounts, setAccounts] = useState([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [totalDebt, setTotalDebt] = useState(0);
    const [netWorth, setNetWorth] = useState(0);
    const [liquidCash, setLiquidCash] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState(null);
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [showEditAliasModal, setShowEditAliasModal] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState(null);
    const [aliasInput, setAliasInput] = useState('');
    const [savingAlias, setSavingAlias] = useState(false);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', message: '', buttons: [] });

    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({
            title,
            message,
            buttons: buttons.length > 0 ? buttons : [{ text: 'OK', onPress: () => setAlertVisible(false) }],
        });
        setAlertVisible(true);
    };

    const loadAccounts = useCallback(async () => {
        try {
            const response = await api.getAccounts();
            if (response?.success) {
                // Filter out aggregate accounts
                const realAccounts = (response.accounts || []).filter((acc) => acc.type !== 'aggregate');
                setAccounts(realAccounts);
                // `??` not `||`: a real zero is a valid balance, and coalescing
                // it away is what made the old fallback show debt as cash.
                setTotalBalance(response.total_balance ?? 0);
                setTotalDebt(response.total_debt ?? 0);
                setNetWorth(response.net_worth ?? 0);
                setLiquidCash(response.liquid_cash ?? 0);
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAccounts();
        }, [loadAccounts])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadAccounts();
    }, [loadAccounts]);

    const handleDisconnectAll = async () => {
        setDisconnecting(true);
        try {
            const response = await api.disconnectBank();
            if (response?.success) {
                setShowDisconnectModal(false);
                setAccounts([]);
                setTotalBalance(0);
                setLiquidCash(0);
                showAlert('Success', 'All accounts have been disconnected.', [{
                    text: 'OK',
                    onPress: () => {
                        setAlertVisible(false);
                        navigation.navigate('Home');
                    },
                }]);
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            showAlert('Error', 'Failed to disconnect accounts. Please try again.');
        } finally {
            setDisconnecting(false);
        }
    };

    const handleDeleteAccount = (account) => {
        setAccountToDelete(account);
        setShowDeleteAccountModal(true);
    };

    const handleEditAlias = (account) => {
        setAccountToEdit(account);
        setAliasInput(account.alias || '');
        setShowEditAliasModal(true);
    };

    const saveAlias = async () => {
        if (!accountToEdit) return;

        setSavingAlias(true);
        try {
            const accountId = accountToEdit.id;
            const response = await api.updateAccountAlias(accountId, aliasInput.trim());

            if (response?.success) {
                setAccounts((prev) => prev.map((a) =>
                    a.id === accountId ? { ...a, alias: aliasInput.trim() } : a
                ));
                setShowEditAliasModal(false);
                setAccountToEdit(null);
                setAliasInput('');
            }
        } catch (error) {
            console.error('Error saving alias:', error);
            showAlert('Error', 'Failed to save alias. Please try again.');
        } finally {
            setSavingAlias(false);
        }
    };

    const confirmDeleteAccount = async () => {
        if (!accountToDelete) return;

        setDeletingAccount(true);
        try {
            const accountId = accountToDelete.plaid_account_id || accountToDelete.id;
            const response = await api.disconnectAccount(accountId);
            if (response?.success) {
                setAccounts((prev) => prev.filter((a) => a.id !== accountToDelete.id));
                setTotalBalance((prev) => prev - (accountToDelete.balance || 0));
                if (accountToDelete.type === 'depository') {
                    setLiquidCash((prev) => prev - (accountToDelete.balance || 0));
                }
                setShowDeleteAccountModal(false);
                setAccountToDelete(null);
            }
        } catch (error) {
            console.error('Error removing account:', error);
        } finally {
            setDeletingAccount(false);
        }
    };

    const renderAccount = (account, index) => {
        const key = account.subtype || account.type;
        const tint = ACCOUNT_SLOTS[key] == null
            ? theme.ACCENT
            : categoryColor(theme, ACCOUNT_SLOTS[key]);
        const isNegative = account.balance < 0;

        return (
            <View key={account.id} style={[styles.accountRow, index > 0 && styles.divider]}>
                <TouchableOpacity
                    style={[styles.accountIcon, { backgroundColor: alpha(tint, 0.16) }]}
                    onPress={() => navigation.navigate('AccountTransactions', { account })}
                    activeOpacity={0.7}
                >
                    <Ionicons name={ACCOUNT_ICONS[key] || 'cash-outline'} size={20} color={tint} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.accountInfo}
                    onPress={() => navigation.navigate('AccountTransactions', { account })}
                    activeOpacity={0.7}
                >
                    <View style={styles.nameRow}>
                        <Text variant="bodyMed" numberOfLines={1}>
                            {account.alias || account.name}
                        </Text>
                        <TouchableOpacity
                            onPress={() => handleEditAlias(account)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Rename account"
                        >
                            <Ionicons name="pencil" size={13} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    </View>
                    <Text variant="meta" tone="muted">
                        {account.subtype || account.type}
                        {account.mask ? ` · ••${account.mask}` : ''}
                    </Text>
                </TouchableOpacity>

                <View style={styles.balanceBlock}>
                    <Text variant="num" tone={isNegative ? 'danger' : 'primary'}>
                        {isNegative ? '−' : ''}{formatBalance(account.balance)}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => handleDeleteAccount(account)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove account"
                >
                    <Ionicons name="close-circle-outline" size={20} color={theme.TEXT_MUTED} />
                </TouchableOpacity>
            </View>
        );
    };

    if (loading) {
        return (
            <Screen centered>
                <LoadingState message="Loading accounts..." />
            </Screen>
        );
    }

    return (
        <>
            <Screen
                scroll
                header={<ScreenHeader title="My accounts" onBack={() => navigation.goBack()} />}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.content}
            >
                <Card>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text variant="overline" tone="muted">Total assets</Text>
                            <Text variant="h1">{formatBalance(totalBalance)}</Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryItem}>
                            <Text variant="overline" tone="muted">Liquid cash</Text>
                            <Text variant="h1">{formatBalance(liquidCash)}</Text>
                        </View>
                    </View>
                    {/* "Total assets" no longer quietly includes what is owed,
                        so the debt has to be shown somewhere or the card tells
                        half the story. Hidden entirely when there is none. */}
                    {totalDebt !== 0 ? (
                        <View style={styles.debtRow}>
                            <View style={styles.summaryItem}>
                                <Text variant="overline" tone="muted">
                                    {totalDebt > 0 ? 'You owe' : 'Credit balance'}
                                </Text>
                                <Text variant="h2" tone={totalDebt > 0 ? 'danger' : 'success'}>
                                    {formatBalance(Math.abs(totalDebt))}
                                </Text>
                            </View>
                            <View style={styles.summaryDivider} />
                            <View style={styles.summaryItem}>
                                <Text variant="overline" tone="muted">Net worth</Text>
                                <Text variant="h2" tone={netWorth < 0 ? 'danger' : 'primary'}>
                                    {netWorth < 0 ? '−' : ''}{formatBalance(Math.abs(netWorth))}
                                </Text>
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.countBadge}>
                        <Text variant="meta" tone="secondary">
                            {accounts.length} account{accounts.length === 1 ? '' : 's'} connected
                        </Text>
                    </View>
                </Card>

                {accounts.length > 0 ? (
                    <>
                        <Overline>Connected accounts</Overline>
                        <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                            {accounts.map((account, index) => renderAccount(account, index))}
                        </Card>
                    </>
                ) : (
                    <Card>
                        <EmptyState
                            icon="wallet-outline"
                            title="No accounts connected"
                            message="Connect a bank to see your balances and transactions here."
                        />
                    </Card>
                )}

                <View style={styles.actions}>
                    <Button
                        title="Connect new account"
                        icon="add"
                        onPress={() => navigation.navigate('ConnectBank')}
                        block
                    />
                    {accounts.length > 0 && (
                        <Button
                            title="Disconnect all accounts"
                            variant="danger"
                            onPress={() => setShowDisconnectModal(true)}
                            block
                        />
                    )}
                </View>
            </Screen>

            {/* Disconnect everything */}
            <BottomSheet
                visible={showDisconnectModal}
                onClose={() => setShowDisconnectModal(false)}
                scroll={false}
            >
                <View style={styles.dialogIcon}>
                    <Ionicons name="warning" size={44} color={theme.DANGER} />
                </View>
                <SectionTitle
                    title="Disconnect all accounts?"
                    subtitle="This removes every linked bank account and its transaction history from IndusWealth. You can reconnect at any time."
                />
                <View style={styles.dialogActions}>
                    <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowDisconnectModal(false)}
                        disabled={disconnecting}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title="Disconnect all"
                        variant="danger"
                        onPress={handleDisconnectAll}
                        loading={disconnecting}
                        style={{ flex: 1 }}
                    />
                </View>
            </BottomSheet>

            {/* Remove one account */}
            <BottomSheet
                visible={showDeleteAccountModal}
                onClose={() => setShowDeleteAccountModal(false)}
                scroll={false}
            >
                <SectionTitle
                    title="Remove this account?"
                    subtitle={accountToDelete
                        ? `${accountToDelete.alias || accountToDelete.name} will be removed along with its transactions.`
                        : undefined}
                />
                <View style={styles.dialogActions}>
                    <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowDeleteAccountModal(false)}
                        disabled={deletingAccount}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title="Remove"
                        variant="danger"
                        onPress={confirmDeleteAccount}
                        loading={deletingAccount}
                        style={{ flex: 1 }}
                    />
                </View>
            </BottomSheet>

            {/* Rename */}
            <BottomSheet
                visible={showEditAliasModal}
                onClose={() => setShowEditAliasModal(false)}
                scroll={false}
            >
                <SectionTitle
                    title="Rename account"
                    subtitle={accountToEdit ? accountToEdit.name : undefined}
                />
                <Input
                    label="Display name"
                    value={aliasInput}
                    onChangeText={setAliasInput}
                    placeholder="e.g. Everyday chequing"
                    autoCapitalize="words"
                />
                <View style={styles.dialogActions}>
                    <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowEditAliasModal(false)}
                        disabled={savingAlias}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title="Save"
                        onPress={saveAlias}
                        loading={savingAlias}
                        style={{ flex: 1 }}
                    />
                </View>
            </BottomSheet>

            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={() => setAlertVisible(false)}
            />
        </>
    );
};

export default AllAccountsScreen;
