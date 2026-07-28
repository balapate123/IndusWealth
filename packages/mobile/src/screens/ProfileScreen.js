import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha } from '../constants/tokens';
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
} from '../components/ui';
import cache from '../services/cache';
import api, { getApiTarget } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const makeStyles = (t) => StyleSheet.create({
    content: { paddingBottom: 120 },

    // Identity
    identity: {
        alignItems: 'center',
        paddingVertical: SPACING.LARGE,
    },
    avatarWrap: { position: 'relative' },
    avatar: {
        width: 84,
        height: 84,
        borderRadius: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarEdit: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: t.SURFACE_HIGH,
        borderWidth: 2,
        borderColor: t.BG,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: { marginTop: SPACING.MEDIUM },
    premiumBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: t.ACCENT_DIM,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: RADIUS.PILL,
        marginTop: SPACING.SMALL,
    },

    // Menu
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.MEDIUM,
        paddingVertical: SPACING.SMALL + 4,
    },
    menuDivider: { borderTopWidth: 1, borderTopColor: t.HAIRLINE },
    menuIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: t.SURFACE_HIGH,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuBody: { flex: 1 },
    badge: {
        backgroundColor: t.SURFACE_HIGH,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: RADIUS.SMALL,
    },

    footer: {
        alignItems: 'center',
        gap: 2,
        marginTop: SPACING.LARGE,
    },
    envBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: SPACING.SMALL,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: RADIUS.PILL,
        backgroundColor: t.WARNING_DIM,
    },

    // Date picker
    pickerRow: { flexDirection: 'row', gap: SPACING.SMALL },
    pickerColumn: { flex: 1 },
    pickerScroll: {
        height: 150,
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        marginTop: 4,
    },
    pickerItem: {
        paddingVertical: 9,
        alignItems: 'center',
        borderRadius: RADIUS.SMALL,
    },
    pickerItemSelected: { backgroundColor: t.ACCENT },
    dateField: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        paddingHorizontal: SPACING.MEDIUM - 4,
        height: 48,
    },
    readOnly: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        paddingHorizontal: SPACING.MEDIUM - 4,
        height: 48,
    },
    fieldGroup: { marginBottom: SPACING.MEDIUM },

    // 2FA
    qrFrame: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#FFFFFF', // a QR code is only scannable on white
        borderRadius: RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginVertical: SPACING.MEDIUM,
    },
    codeBlock: {
        backgroundColor: t.SURFACE_HIGH,
        borderRadius: RADIUS.MEDIUM,
        padding: SPACING.MEDIUM,
        marginVertical: SPACING.MEDIUM,
    },
    mono: {
        fontFamily: 'monospace',
        letterSpacing: 2,
        textAlign: 'center',
        paddingVertical: 3,
    },

    // Delete
    warnList: { gap: SPACING.SMALL, marginVertical: SPACING.MEDIUM },
    warnItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SMALL },
    dialogActions: { flexDirection: 'row', gap: SPACING.SMALL + 2, marginTop: SPACING.MEDIUM },

    // Avatar picker
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.MEDIUM,
        justifyContent: 'center',
        marginVertical: SPACING.MEDIUM,
    },
    colorOption: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorOptionSelected: {
        borderWidth: 3,
        borderColor: t.TEXT_PRIMARY,
    },
});

const ProfileScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [user, setUser] = useState({ name: 'User', email: 'user@example.com' });
    const [profilePicture, setProfilePicture] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');

    // Change password state
    const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // 2FA state
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [twoFAModalVisible, setTwoFAModalVisible] = useState(false);
    const [twoFAStep, setTwoFAStep] = useState('loading');
    const [twoFAQrCode, setTwoFAQrCode] = useState(null);
    const [twoFASecret, setTwoFASecret] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [twoFAPassword, setTwoFAPassword] = useState('');
    const [twoFALoading, setTwoFALoading] = useState(false);

    // Alert state
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', buttons: [] });

    // Edit form state
    const [editName, setEditName] = useState('');
    const [editDob, setEditDob] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedYear, setSelectedYear] = useState(2000);
    const [selectedMonth, setSelectedMonth] = useState(1);
    const [selectedDay, setSelectedDay] = useState(1);

    const [avatarColorModalVisible, setAvatarColorModalVisible] = useState(false);

    const apiTarget = getApiTarget();

    // Avatar options come from the validated ramp plus the brand accent, so the
    // picker can't introduce a colour the rest of the app never uses.
    const AVATAR_COLORS = [theme.ACCENT, ...theme.CATEGORIES];

    useEffect(() => {
        loadUser();
        loadProfilePicture();
        loadAccounts();
    }, []);

    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
    };

    const loadUser = async () => {
        const cachedUser = await cache.getCachedUser();
        if (cachedUser) setUser(cachedUser);

        try {
            const response = await api.auth.me();
            if (response.success && response.user) {
                setUser(response.user);
                await cache.setCachedUser(response.user);
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
        }

        try {
            const status = await api.twoFactor.getStatus();
            setTwoFAEnabled(status.enabled);
        } catch (error) {
            console.error('Failed to check 2FA status:', error);
        }
    };

    const loadProfilePicture = async () => {
        const uri = await cache.getProfilePicture();
        if (uri) setProfilePicture(uri);
    };

    const loadAccounts = async () => {
        setAccountsLoading(true);
        try {
            const cachedAccounts = await cache.getCachedAccounts();
            if (cachedAccounts?.accounts) {
                setAccounts(cachedAccounts.accounts);
            }
            const response = await api.getAccounts();
            if (response.success && response.accounts) {
                setAccounts(response.accounts);
            }
        } catch (error) {
            console.error('Failed to load accounts:', error);
        } finally {
            setAccountsLoading(false);
        }
    };

    const handleChangeProfilePicture = () => setAvatarColorModalVisible(true);

    const selectAvatarColor = async (color) => {
        setProfilePicture(color);
        await cache.setProfilePicture(color);
        setAvatarColorModalVisible(false);
    };

    const getUserInitials = () => {
        if (!user.name) return '?';
        const parts = user.name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0][0].toUpperCase();
    };

    const handleChangePassword = async () => {
        if (!currentPassword.trim()) {
            showAlert('Error', 'Please enter your current password.', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }
        if (newPassword.length < 8) {
            showAlert('Error', 'New password must be at least 8 characters.', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }
        if (newPassword !== confirmNewPassword) {
            showAlert('Error', 'New passwords do not match.', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }

        setChangingPassword(true);
        try {
            const response = await api.auth.changePassword(currentPassword, newPassword);
            if (response.success) {
                setChangePasswordModalVisible(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                setTimeout(() => {
                    showAlert('Success', 'Password changed successfully.', [{ text: 'OK', onPress: hideAlert }]);
                }, 500);
            }
        } catch (error) {
            showAlert('Error', error.message || 'Failed to change password.', [{ text: 'OK', onPress: hideAlert }]);
        } finally {
            setChangingPassword(false);
        }
    };

    const handleLogout = () => setLogoutModalVisible(true);

    const confirmLogout = async () => {
        setLogoutModalVisible(false);
        await cache.clearUserCache();
        global.CURRENT_USER_ID = undefined;
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
    };

    const handleDeleteAccount = () => {
        setDeletePassword('');
        setDeleteModalVisible(true);
    };

    const confirmDeleteAccount = async () => {
        if (!deletePassword.trim()) {
            showAlert('Error', 'Please enter your password to confirm deletion', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }

        setDeleting(true);
        try {
            const response = await api.auth.deleteAccount(deletePassword);
            if (response.success) {
                setDeleteModalVisible(false);
                await cache.clearUserCache();
                global.CURRENT_USER_ID = undefined;
                navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
            }
        } catch (error) {
            showAlert('Error', error.message || 'Failed to delete account.', [{ text: 'OK', onPress: hideAlert }]);
        } finally {
            setDeleting(false);
        }
    };

    const openEditModal = () => {
        setEditName(user.name || '');
        if (user.dateOfBirth) {
            const date = new Date(user.dateOfBirth);
            setEditDob(date);
            setSelectedYear(date.getFullYear());
            setSelectedMonth(date.getMonth() + 1);
            setSelectedDay(date.getDate());
        } else {
            setEditDob(null);
            setSelectedYear(2000);
            setSelectedMonth(1);
            setSelectedDay(1);
        }
        setEditModalVisible(true);
    };

    const handleSaveProfile = async () => {
        if (!editName.trim()) {
            showAlert('Error', 'Please enter your name', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }

        setSaving(true);
        try {
            const updateData = { name: editName.trim() };
            if (editDob) {
                updateData.dateOfBirth = editDob.toISOString().split('T')[0];
            }

            const response = await api.auth.updateProfile(updateData);
            if (response.success) {
                const updatedUser = {
                    ...user,
                    name: editName.trim(),
                    dateOfBirth: editDob ? editDob.toISOString().split('T')[0] : user.dateOfBirth
                };
                setUser(updatedUser);
                await cache.setCachedUser(updatedUser);
                setEditModalVisible(false);
                setTimeout(() => {
                    showAlert('Success', 'Profile updated successfully', [{ text: 'OK', onPress: hideAlert }]);
                }, 500);
            }
        } catch (error) {
            showAlert('Error', error.message || 'Failed to update profile', [{ text: 'OK', onPress: hideAlert }]);
        } finally {
            setSaving(false);
        }
    };

    const confirmDateSelection = () => {
        setEditDob(new Date(selectedYear, selectedMonth - 1, selectedDay));
        setShowDatePicker(false);
    };

    const handle2FAPress = async () => {
        setTwoFAModalVisible(true);
        setTwoFACode('');
        setTwoFAPassword('');
        setRecoveryCodes([]);

        if (twoFAEnabled) {
            setTwoFAStep('disable');
        } else {
            setTwoFAStep('loading');
            setTwoFALoading(true);
            try {
                const response = await api.twoFactor.setup();
                if (response.success) {
                    setTwoFAQrCode(response.qrCode);
                    setTwoFASecret(response.secret);
                    setTwoFAStep('setup');
                }
            } catch (error) {
                showAlert('Error', error.message || 'Failed to start 2FA setup', [{ text: 'OK', onPress: hideAlert }]);
                setTwoFAModalVisible(false);
            } finally {
                setTwoFALoading(false);
            }
        }
    };

    const handleVerify2FA = async () => {
        if (!twoFACode.trim() || twoFACode.length !== 6) {
            showAlert('Error', 'Please enter a valid 6-digit code', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }
        setTwoFALoading(true);
        try {
            const response = await api.twoFactor.verify(twoFACode);
            if (response.success) {
                setRecoveryCodes(response.recoveryCodes || []);
                setTwoFAStep('codes');
                setTwoFAEnabled(true);
            }
        } catch (error) {
            showAlert('Error', error.message || 'Invalid code. Please try again.', [{ text: 'OK', onPress: hideAlert }]);
            setTwoFACode('');
        } finally {
            setTwoFALoading(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!twoFAPassword.trim()) {
            showAlert('Error', 'Please enter your password', [{ text: 'OK', onPress: hideAlert }]);
            return;
        }
        setTwoFALoading(true);
        try {
            const response = await api.twoFactor.disable(twoFAPassword);
            if (response.success) {
                setTwoFAEnabled(false);
                setTwoFAModalVisible(false);
                setTimeout(() => {
                    showAlert('Success', 'Two-factor authentication has been disabled', [{ text: 'OK', onPress: hideAlert }]);
                }, 500);
            }
        } catch (error) {
            showAlert('Error', error.message || 'Failed to disable 2FA.', [{ text: 'OK', onPress: hideAlert }]);
        } finally {
            setTwoFALoading(false);
        }
    };

    // Helpers
    const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
    const months = [
        { value: 1, label: 'January' }, { value: 2, label: 'February' },
        { value: 3, label: 'March' }, { value: 4, label: 'April' },
        { value: 5, label: 'May' }, { value: 6, label: 'June' },
        { value: 7, label: 'July' }, { value: 8, label: 'August' },
        { value: 9, label: 'September' }, { value: 10, label: 'October' },
        { value: 11, label: 'November' }, { value: 12, label: 'December' },
    ];
    const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
    const days = Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1);

    const formatDisplayDate = (dateString) => {
        if (!dateString) return 'Not set';
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
            });
        } catch {
            return 'Not set';
        }
    };

    const getLinkedAccountsSummary = () => {
        if (accountsLoading) return 'Loading...';
        if (accounts.length === 0) return 'No accounts linked';
        const names = accounts.map((a) => a.institution_name || a.name || a.official_name).filter(Boolean);
        const unique = [...new Set(names)];
        if (unique.length === 0) return `${accounts.length} account${accounts.length > 1 ? 's' : ''} linked`;
        return unique.join(', ');
    };

    const MenuItem = ({ icon, label, subtitle, badgeText, onPress, first, danger }) => (
        <TouchableOpacity
            style={[styles.menuItem, !first && styles.menuDivider]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.menuIcon, danger && { backgroundColor: theme.DANGER_DIM }]}>
                <Ionicons name={icon} size={19} color={danger ? theme.DANGER : theme.TEXT_SECONDARY} />
            </View>
            <View style={styles.menuBody}>
                <Text variant="bodyMed" tone={danger ? 'danger' : 'primary'}>{label}</Text>
                {subtitle ? <Text variant="meta" tone="muted" numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            {badgeText ? (
                <View style={styles.badge}>
                    <Text variant="meta" tone="secondary">{badgeText}</Text>
                </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={theme.TEXT_MUTED} />
        </TouchableOpacity>
    );

    const avatarColor = profilePicture || theme.ACCENT;

    return (
        <>
            <Screen
                scroll
                header={
                    <ScreenHeader
                        title="Profile"
                        right={
                            <TouchableOpacity onPress={openEditModal} accessibilityRole="button">
                                <Text variant="label" tone="link">Edit</Text>
                            </TouchableOpacity>
                        }
                    />
                }
                contentContainerStyle={styles.content}
            >
                {/* Identity */}
                <View style={styles.identity}>
                    <View style={styles.avatarWrap}>
                        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                            <Text variant="hero" color={theme.TEXT_ON_CATEGORY}>{getUserInitials()}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.avatarEdit}
                            onPress={handleChangeProfilePicture}
                            accessibilityRole="button"
                            accessibilityLabel="Change avatar colour"
                        >
                            <Ionicons name="color-palette" size={14} color={theme.TEXT_SECONDARY} />
                        </TouchableOpacity>
                    </View>

                    <Text variant="h1" style={styles.name}>{user.name}</Text>
                    <View style={styles.premiumBadge}>
                        <MaterialCommunityIcons name="shield-check" size={14} color={theme.ACCENT} />
                        <Text variant="overline" tone="accent">Premium member</Text>
                    </View>
                    <Text variant="meta" tone="muted" style={{ marginTop: 6 }}>
                        IndusWealth ID: {user.id ? 8839000 + user.id : '...'}
                    </Text>
                </View>

                <Overline>Personal &amp; banking</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem first icon="person" label="Personal information" subtitle={user.email} onPress={openEditModal} />
                    <MenuItem icon="calendar" label="Date of birth" subtitle={formatDisplayDate(user.dateOfBirth)} onPress={openEditModal} />
                    <MenuItem
                        icon="business"
                        label="Linked accounts"
                        subtitle={getLinkedAccountsSummary()}
                        badgeText={accountsLoading ? '...' : `${accounts.length} active`}
                        onPress={() => navigation.navigate('AllAccounts')}
                    />
                </Card>

                <Overline>Security</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem
                        first
                        icon="key"
                        label="Change password"
                        subtitle="Update your account password"
                        onPress={() => {
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmNewPassword('');
                            setChangePasswordModalVisible(true);
                        }}
                    />
                    <MenuItem
                        icon="shield"
                        label="2-step verification"
                        subtitle={twoFAEnabled ? 'Enabled — extra layer of protection' : 'Not enabled'}
                        badgeText={twoFAEnabled ? 'On' : 'Off'}
                        onPress={handle2FAPress}
                    />
                </Card>

                <Overline>Preferences</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem
                        first
                        icon="contrast"
                        label="Appearance"
                        subtitle="Theme and colours"
                        onPress={() => navigation.navigate('Appearance')}
                    />
                </Card>

                <Overline>Quick access</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem first icon="home" label="Home" subtitle="Accounts & transactions overview" onPress={() => navigation.navigate('Main', { screen: 'Home' })} />
                    <MenuItem icon="bulb" label="AI Insights" subtitle="Personalized financial insights" onPress={() => navigation.navigate('Main', { screen: 'Insights' })} />
                    <MenuItem icon="trending-down" label="Debt optimizer" subtitle="Debt attack calculator & plans" onPress={() => navigation.navigate('Main', { screen: 'Wealth' })} />
                    <MenuItem icon="eye" label="Watchdog" subtitle="Recurring expense tracker" onPress={() => navigation.navigate('Watchdog')} />
                    <MenuItem icon="bar-chart" label="Analytics" subtitle="Spending trends & charts" onPress={() => navigation.navigate('Analytics')} />
                    <MenuItem icon="list" label="All transactions" subtitle="Full transaction history" onPress={() => navigation.navigate('AllTransactions')} />
                    <MenuItem icon="wallet" label="All accounts" subtitle="View all linked accounts" onPress={() => navigation.navigate('AllAccounts')} />
                    <MenuItem icon="school" label="Wealth Academy" subtitle="Financial education articles" onPress={() => navigation.navigate('WealthAcademy')} />
                </Card>

                <Overline>Support &amp; legal</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem first icon="chatbubbles" label="Send feedback" subtitle="Help us improve IndusWealth" onPress={() => navigation.navigate('Feedback')} />
                    <MenuItem icon="help-circle" label="Help & support" subtitle="support@induswealth.app" onPress={() => Linking.openURL('mailto:support@induswealth.app')} />
                    <MenuItem icon="shield-checkmark" label="Privacy policy" subtitle="How we protect your data" onPress={() => navigation.navigate('LegalDoc', { docType: 'privacy' })} />
                    <MenuItem icon="document-text" label="Terms of service" subtitle="Terms and conditions" onPress={() => navigation.navigate('LegalDoc', { docType: 'terms' })} />
                </Card>

                <Overline>Account</Overline>
                <Card padded={false} style={{ paddingHorizontal: SPACING.MEDIUM - 2 }}>
                    <MenuItem
                        first
                        danger
                        icon="trash"
                        label="Delete account"
                        subtitle="Permanently remove your data"
                        onPress={handleDeleteAccount}
                    />
                </Card>

                <Button
                    title="Log out"
                    variant="secondary"
                    onPress={handleLogout}
                    style={{ marginHorizontal: SPACING.MEDIUM, marginTop: SPACING.SMALL }}
                />

                <View style={styles.footer}>
                    <Text variant="meta" tone="muted">IndusWealth v2.4.0 (Build 104)</Text>
                    <Text variant="meta" tone="muted">© 2026 IndusWealth Inc.</Text>
                    {/* Only on non-production builds, so testers can see at a glance
                        which backend they are actually hitting. */}
                    {!apiTarget.isProduction && (
                        <View style={styles.envBadge}>
                            <Ionicons name="server-outline" size={11} color={theme.WARNING} />
                            <Text variant="meta" tone="warning">{apiTarget.host}</Text>
                        </View>
                    )}
                </View>
            </Screen>

            {/* Edit profile */}
            <BottomSheet visible={editModalVisible} onClose={() => setEditModalVisible(false)}>
                <SectionTitle
                    title="Edit profile"
                    right={
                        <TouchableOpacity onPress={() => setEditModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />

                <Input label="Name" value={editName} onChangeText={setEditName} placeholder="Enter your name" autoCapitalize="words" />

                <View style={styles.fieldGroup}>
                    <Text variant="label" tone="secondary" style={{ marginBottom: 6 }}>Date of birth</Text>
                    <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(true)}>
                        <Text variant="body" tone={editDob ? 'primary' : 'muted'}>
                            {editDob
                                ? editDob.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                                : 'Select your date of birth'}
                        </Text>
                        <Ionicons name="calendar-outline" size={20} color={theme.TEXT_MUTED} />
                    </TouchableOpacity>
                </View>

                {showDatePicker && (
                    <View style={styles.fieldGroup}>
                        <View style={styles.pickerRow}>
                            {[
                                { label: 'Month', items: months.map((m) => ({ key: m.value, text: m.label.substring(0, 3) })), selected: selectedMonth, set: setSelectedMonth },
                                { label: 'Day', items: days.map((d) => ({ key: d, text: String(d) })), selected: selectedDay, set: setSelectedDay },
                                { label: 'Year', items: years.map((y) => ({ key: y, text: String(y) })), selected: selectedYear, set: setSelectedYear },
                            ].map((col) => (
                                <View key={col.label} style={styles.pickerColumn}>
                                    <Text variant="meta" tone="muted">{col.label}</Text>
                                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                        {col.items.map((item) => (
                                            <TouchableOpacity
                                                key={item.key}
                                                style={[styles.pickerItem, col.selected === item.key && styles.pickerItemSelected]}
                                                onPress={() => col.set(item.key)}
                                            >
                                                <Text variant="meta" tone={col.selected === item.key ? 'onAccent' : 'secondary'}>
                                                    {item.text}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            ))}
                        </View>
                        <Button title="Confirm" onPress={confirmDateSelection} block style={{ marginTop: SPACING.MEDIUM }} />
                    </View>
                )}

                <View style={styles.fieldGroup}>
                    <Text variant="label" tone="secondary" style={{ marginBottom: 6 }}>Email</Text>
                    <View style={styles.readOnly}>
                        <Text variant="body" tone="secondary">{user.email}</Text>
                        <Ionicons name="lock-closed" size={16} color={theme.TEXT_MUTED} />
                    </View>
                </View>

                <Button title="Save changes" onPress={handleSaveProfile} loading={saving} block />
            </BottomSheet>

            {/* Change password */}
            <BottomSheet visible={changePasswordModalVisible} onClose={() => setChangePasswordModalVisible(false)}>
                <SectionTitle
                    title="Change password"
                    right={
                        <TouchableOpacity onPress={() => setChangePasswordModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />
                <Input label="Current password" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Enter current password" secureTextEntry autoCapitalize="none" />
                <Input label="New password" value={newPassword} onChangeText={setNewPassword} placeholder="Min 8 chars, 1 uppercase, 1 number" secureTextEntry autoCapitalize="none" />
                <Input label="Confirm new password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} placeholder="Re-enter new password" secureTextEntry autoCapitalize="none" />
                <Button title="Update password" onPress={handleChangePassword} loading={changingPassword} block />
            </BottomSheet>

            {/* Two-factor */}
            <BottomSheet visible={twoFAModalVisible} onClose={() => setTwoFAModalVisible(false)}>
                <SectionTitle
                    title={twoFAStep === 'disable' ? 'Disable 2FA' : twoFAStep === 'codes' ? 'Recovery codes' : 'Two-factor authentication'}
                    right={
                        <TouchableOpacity onPress={() => setTwoFAModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={theme.TEXT_MUTED} />
                        </TouchableOpacity>
                    }
                />

                {twoFAStep === 'loading' && (
                    <View style={{ alignItems: 'center', paddingVertical: SPACING.XL }}>
                        <ActivityIndicator color={theme.ACCENT} size="large" />
                        <Text variant="body" tone="secondary" style={{ marginTop: SPACING.MEDIUM }}>Setting up...</Text>
                    </View>
                )}

                {twoFAStep === 'setup' && (
                    <>
                        <Text variant="body" tone="secondary">
                            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                        </Text>
                        {twoFAQrCode && (
                            <View style={styles.qrFrame}>
                                <Image source={{ uri: twoFAQrCode }} style={{ width: 200, height: 200 }} />
                            </View>
                        )}
                        <Text variant="meta" tone="muted">Or enter this code manually:</Text>
                        <View style={styles.codeBlock}>
                            <Text variant="body" tone="accent" style={styles.mono}>{twoFASecret}</Text>
                        </View>
                        <Input
                            label="Enter the 6-digit code from your app"
                            value={twoFACode}
                            onChangeText={setTwoFACode}
                            placeholder="000000"
                            keyboardType="number-pad"
                            maxLength={6}
                            textAlign="center"
                        />
                        <Button title="Verify & enable" onPress={handleVerify2FA} loading={twoFALoading} block />
                    </>
                )}

                {twoFAStep === 'codes' && (
                    <>
                        <Text variant="body" tone="secondary">
                            Save these recovery codes somewhere safe. Each code can only be used once.
                        </Text>
                        <View style={styles.codeBlock}>
                            {recoveryCodes.map((code, index) => (
                                <Text key={index} variant="bodyMed" tone="accent" style={styles.mono}>{code}</Text>
                            ))}
                        </View>
                        <Text variant="meta" tone="danger">These codes will not be shown again.</Text>
                        <Button
                            title="I've saved these codes"
                            onPress={() => setTwoFAModalVisible(false)}
                            block
                            style={{ marginTop: SPACING.MEDIUM }}
                        />
                    </>
                )}

                {twoFAStep === 'disable' && (
                    <>
                        <Text variant="body" tone="secondary" style={{ marginBottom: SPACING.MEDIUM }}>
                            Enter your password to disable two-factor authentication.
                        </Text>
                        <Input
                            label="Password"
                            value={twoFAPassword}
                            onChangeText={setTwoFAPassword}
                            placeholder="Enter your password"
                            secureTextEntry
                            autoCapitalize="none"
                        />
                        <Button title="Disable 2FA" variant="danger" onPress={handleDisable2FA} loading={twoFALoading} block />
                    </>
                )}
            </BottomSheet>

            {/* Delete account */}
            <BottomSheet visible={deleteModalVisible} onClose={() => setDeleteModalVisible(false)}>
                <SectionTitle title="Delete account" subtitle="This action is permanent and cannot be undone." />

                <Text variant="body" tone="secondary">All of the following will be permanently deleted:</Text>
                <View style={styles.warnList}>
                    {['Linked bank accounts', 'Transaction history', 'Debt tracking data', 'All personal information'].map((item) => (
                        <View key={item} style={styles.warnItem}>
                            <Ionicons name="close-circle" size={16} color={theme.DANGER} />
                            <Text variant="body" tone="secondary">{item}</Text>
                        </View>
                    ))}
                </View>

                <Input
                    label="Enter your password to confirm"
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    placeholder="Enter password"
                    secureTextEntry
                    autoCapitalize="none"
                />

                <View style={styles.dialogActions}>
                    <Button title="Cancel" variant="secondary" onPress={() => setDeleteModalVisible(false)} disabled={deleting} style={{ flex: 1 }} />
                    <Button title="Delete account" variant="danger" onPress={confirmDeleteAccount} loading={deleting} style={{ flex: 1 }} />
                </View>
            </BottomSheet>

            {/* Log out */}
            <CustomAlert
                visible={logoutModalVisible}
                title="Log out"
                message="Are you sure you want to log out?"
                buttons={[
                    { text: 'Cancel', style: 'cancel', onPress: () => setLogoutModalVisible(false) },
                    { text: 'Log out', onPress: confirmLogout },
                ]}
                onRequestClose={() => setLogoutModalVisible(false)}
            />

            {/* Avatar colour */}
            <BottomSheet visible={avatarColorModalVisible} onClose={() => setAvatarColorModalVisible(false)} scroll={false}>
                <SectionTitle title="Choose avatar colour" />
                <View style={styles.colorGrid}>
                    {AVATAR_COLORS.map((color) => (
                        <TouchableOpacity
                            key={color}
                            style={[
                                styles.colorOption,
                                { backgroundColor: color },
                                profilePicture === color && styles.colorOptionSelected,
                            ]}
                            onPress={() => selectAvatarColor(color)}
                            accessibilityRole="button"
                        >
                            <Text variant="title" color={theme.TEXT_ON_CATEGORY}>{getUserInitials()}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Button title="Cancel" variant="secondary" onPress={() => setAvatarColorModalVisible(false)} block />
            </BottomSheet>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={hideAlert}
            />
        </>
    );
};

export default ProfileScreen;
