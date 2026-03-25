import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    Switch,
    StatusBar,
    Alert,
    Modal,
    TextInput,
    ActivityIndicator,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import cache from '../services/cache';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

const ProfileScreen = ({ navigation }) => {
    const [user, setUser] = useState({ name: 'User', email: 'user@example.com' });
    const [profilePicture, setProfilePicture] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [faceIdEnabled, setFaceIdEnabled] = useState(true);
    const [darkThemeEnabled, setDarkThemeEnabled] = useState(true);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [showDeletePassword, setShowDeletePassword] = useState(false);

    // Change password state
    const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
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
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        buttons: []
    });

    // Edit form state
    const [editName, setEditName] = useState('');
    const [editDob, setEditDob] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedYear, setSelectedYear] = useState(2000);
    const [selectedMonth, setSelectedMonth] = useState(1);
    const [selectedDay, setSelectedDay] = useState(1);

    useEffect(() => {
        loadUser();
        loadProfilePicture();
        loadAccounts();
    }, []);

    const showAlert = (title, message, buttons = []) => {
        setAlertConfig({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
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

    // Profile picture - avatar initials with color selection
    const AVATAR_COLORS = ['#C9A227', '#3B82F6', '#EF4444', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
    const [avatarColorModalVisible, setAvatarColorModalVisible] = useState(false);

    const handleChangeProfilePicture = () => {
        setAvatarColorModalVisible(true);
    };

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

    // Change password
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

    const handleLogout = async () => {
        setLogoutModalVisible(true);
    };

    const confirmLogout = async () => {
        setLogoutModalVisible(false);
        await cache.clearUserCache();
        global.CURRENT_USER_ID = undefined;
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
    };

    const handleDeleteAccount = () => {
        setDeletePassword('');
        setShowDeletePassword(false);
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
        const date = new Date(selectedYear, selectedMonth - 1, selectedDay);
        setEditDob(date);
        setShowDatePicker(false);
    };

    // 2FA handlers
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
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch {
            return 'Not set';
        }
    };

    const getLinkedAccountsSummary = () => {
        if (accountsLoading) return 'Loading...';
        if (accounts.length === 0) return 'No accounts linked';
        const names = accounts.map(a => a.institution_name || a.name || a.official_name).filter(Boolean);
        const unique = [...new Set(names)];
        if (unique.length === 0) return `${accounts.length} account${accounts.length > 1 ? 's' : ''} linked`;
        return unique.join(', ');
    };

    const MenuItem = ({ icon, label, subtitle, showToggle, value, onToggle, showBadge, badgeText, onPress }) => (
        <TouchableOpacity style={styles.menuItem} disabled={showToggle && !onPress} onPress={onPress}>
            <View style={styles.menuIconContainer}>
                <Ionicons name={icon} size={22} color={COLORS.WHITE} />
            </View>
            <View style={styles.menuTextContainer}>
                <Text style={styles.menuLabel}>{label}</Text>
                {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
            </View>

            {showToggle ? (
                <Switch
                    trackColor={{ false: "#767577", true: "#4CAF50" }}
                    thumbColor={COLORS.WHITE}
                    ios_backgroundColor="#3e3e3e"
                    onValueChange={onToggle}
                    value={value}
                />
            ) : showBadge ? (
                <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{badgeText}</Text>
                </View>
            ) : (
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
            )}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity onPress={openEditModal}>
                    <Text style={styles.editButton}>Edit</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* User Profile Card */}
                <View style={styles.profileSection}>
                    <View style={styles.avatarContainer}>
                        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: profilePicture || COLORS.GOLD }]}>
                            <Text style={styles.avatarInitials}>{getUserInitials()}</Text>
                        </View>
                        <TouchableOpacity style={styles.editIcon} onPress={handleChangeProfilePicture}>
                            <Ionicons name="camera" size={12} color={COLORS.WHITE} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.userName}>{user.name}</Text>
                    <View style={styles.premiumBadge}>
                        <MaterialCommunityIcons name="shield-check" size={16} color="#FFD700" />
                        <Text style={styles.premiumText}>PREMIUM MEMBER</Text>
                    </View>
                    <Text style={styles.userId}>IndusWealth ID: {user.id ? 8839000 + user.id : '...'}</Text>
                </View>

                {/* Personal & Banking */}
                <Text style={styles.sectionHeader}>PERSONAL & BANKING</Text>
                <View style={styles.sectionCard}>
                    <MenuItem
                        icon="person"
                        label="Personal Information"
                        subtitle={user.email}
                        onPress={openEditModal}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="calendar"
                        label="Date of Birth"
                        subtitle={formatDisplayDate(user.dateOfBirth)}
                        onPress={openEditModal}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="business"
                        label="Linked Accounts"
                        subtitle={getLinkedAccountsSummary()}
                        showBadge
                        badgeText={accountsLoading ? '...' : `${accounts.length} Active`}
                        onPress={() => navigation.navigate('AllAccounts')}
                    />
                </View>

                {/* Security */}
                <Text style={styles.sectionHeader}>SECURITY</Text>
                <View style={styles.sectionCard}>
                    <MenuItem
                        icon="key"
                        label="Change Password"
                        subtitle="Update your account password"
                        onPress={() => {
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmNewPassword('');
                            setShowCurrentPassword(false);
                            setShowNewPassword(false);
                            setChangePasswordModalVisible(true);
                        }}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="shield"
                        label="2-Step Verification"
                        subtitle={twoFAEnabled ? 'Enabled — extra layer of protection' : 'Not enabled'}
                        showBadge
                        badgeText={twoFAEnabled ? 'On' : 'Off'}
                        onPress={handle2FAPress}
                    />
                </View>

                {/* Quick Access */}
                <Text style={styles.sectionHeader}>QUICK ACCESS</Text>
                <View style={styles.sectionCard}>
                    <MenuItem icon="home" label="Home" subtitle="Accounts & transactions overview" onPress={() => navigation.navigate('Main', { screen: 'Home' })} />
                    <View style={styles.divider} />
                    <MenuItem icon="bulb" label="AI Insights" subtitle="Personalized financial insights" onPress={() => navigation.navigate('Main', { screen: 'Insights' })} />
                    <View style={styles.divider} />
                    <MenuItem icon="trending-down" label="Debt Optimizer" subtitle="Debt attack calculator & plans" onPress={() => navigation.navigate('Main', { screen: 'Wealth' })} />
                    <View style={styles.divider} />
                    <MenuItem icon="eye" label="Watchdog" subtitle="Recurring expense tracker" onPress={() => navigation.navigate('Main', { screen: 'Watchdog' })} />
                    <View style={styles.divider} />
                    <MenuItem icon="bar-chart" label="Analytics" subtitle="Spending trends & charts" onPress={() => navigation.navigate('Analytics')} />
                    <View style={styles.divider} />
                    <MenuItem icon="list" label="All Transactions" subtitle="Full transaction history" onPress={() => navigation.navigate('AllTransactions')} />
                    <View style={styles.divider} />
                    <MenuItem icon="wallet" label="All Accounts" subtitle="View all linked accounts" onPress={() => navigation.navigate('AllAccounts')} />
                    <View style={styles.divider} />
                    <MenuItem icon="school" label="Wealth Academy" subtitle="Financial education articles" onPress={() => navigation.navigate('WealthAcademy')} />
                </View>

                {/* Support & Legal */}
                <Text style={styles.sectionHeader}>SUPPORT & LEGAL</Text>
                <View style={styles.sectionCard}>
                    <MenuItem
                        icon="chatbubbles"
                        label="Send Feedback"
                        subtitle="Help us improve IndusWealth"
                        onPress={() => navigation.navigate('Feedback')}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="help-circle"
                        label="Help & Support"
                        subtitle="support@induswealth.com"
                        onPress={() => Linking.openURL('mailto:support@induswealth.com')}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="shield-checkmark"
                        label="Privacy Policy"
                        subtitle="How we protect your data"
                        onPress={() => navigation.navigate('LegalDoc', { docType: 'privacy' })}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="document-text"
                        label="Terms of Service"
                        subtitle="Terms and conditions"
                        onPress={() => navigation.navigate('LegalDoc', { docType: 'terms' })}
                    />
                </View>

                {/* Danger Zone */}
                <Text style={styles.sectionHeader}>ACCOUNT</Text>
                <View style={styles.sectionCard}>
                    <TouchableOpacity style={styles.deleteAccountItem} onPress={handleDeleteAccount}>
                        <View style={[styles.menuIconContainer, styles.deleteIconContainer]}>
                            <Ionicons name="trash" size={22} color="#EF4444" />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.deleteLabel}>Delete Account</Text>
                            <Text style={styles.deleteSubtitle}>Permanently remove your data</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#64748B" />
                    </TouchableOpacity>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>IndusWealth v2.4.0 (Build 104)</Text>
                    <Text style={styles.footerText}>© 2026 IndusWealth Inc.</Text>
                </View>
            </ScrollView>

            {/* Edit Profile Modal */}
            <Modal visible={editModalVisible} transparent={true} animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.editModalContent}>
                        <View style={styles.editModalHeader}>
                            <Text style={styles.modalTitle}>Edit Profile</Text>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setEditModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Name</Text>
                            <TextInput
                                style={styles.textInput}
                                value={editName}
                                onChangeText={setEditName}
                                placeholder="Enter your name"
                                placeholderTextColor={COLORS.TEXT_MUTED}
                                autoCapitalize="words"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Date of Birth</Text>
                            <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
                                <Text style={editDob ? styles.dateText : styles.datePlaceholder}>
                                    {editDob ? editDob.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Select your date of birth'}
                                </Text>
                                <Ionicons name="calendar-outline" size={20} color={COLORS.GOLD} />
                            </TouchableOpacity>
                        </View>

                        {showDatePicker && (
                            <View style={styles.datePickerContainer}>
                                <View style={styles.datePickerRow}>
                                    <View style={styles.pickerColumn}>
                                        <Text style={styles.pickerLabel}>Month</Text>
                                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                            {months.map((month) => (
                                                <TouchableOpacity key={month.value} style={[styles.pickerItem, selectedMonth === month.value && styles.pickerItemSelected]} onPress={() => setSelectedMonth(month.value)}>
                                                    <Text style={[styles.pickerItemText, selectedMonth === month.value && styles.pickerItemTextSelected]}>{month.label.substring(0, 3)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                    <View style={styles.pickerColumn}>
                                        <Text style={styles.pickerLabel}>Day</Text>
                                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                            {days.map((day) => (
                                                <TouchableOpacity key={day} style={[styles.pickerItem, selectedDay === day && styles.pickerItemSelected]} onPress={() => setSelectedDay(day)}>
                                                    <Text style={[styles.pickerItemText, selectedDay === day && styles.pickerItemTextSelected]}>{day}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                    <View style={styles.pickerColumn}>
                                        <Text style={styles.pickerLabel}>Year</Text>
                                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                            {years.map((year) => (
                                                <TouchableOpacity key={year} style={[styles.pickerItem, selectedYear === year && styles.pickerItemSelected]} onPress={() => setSelectedYear(year)}>
                                                    <Text style={[styles.pickerItemText, selectedYear === year && styles.pickerItemTextSelected]}>{year}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                </View>
                                <TouchableOpacity style={styles.datePickerDone} onPress={confirmDateSelection}>
                                    <Text style={styles.datePickerDoneText}>Confirm</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <View style={styles.readOnlyInput}>
                                <Text style={styles.readOnlyText}>{user.email}</Text>
                                <Ionicons name="lock-closed" size={16} color={COLORS.TEXT_MUTED} />
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSaveProfile} disabled={saving}>
                            {saving ? <ActivityIndicator color={COLORS.BACKGROUND} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Change Password Modal */}
            <Modal visible={changePasswordModalVisible} transparent={true} animationType="slide" onRequestClose={() => setChangePasswordModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.editModalContent}>
                        <View style={styles.editModalHeader}>
                            <Text style={styles.modalTitle}>Change Password</Text>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setChangePasswordModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Current Password</Text>
                            <View style={styles.passwordInputContainer}>
                                <TextInput
                                    style={styles.passwordField}
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                    placeholder="Enter current password"
                                    placeholderTextColor={COLORS.TEXT_MUTED}
                                    secureTextEntry={!showCurrentPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                                    <Ionicons name={showCurrentPassword ? "eye-off" : "eye"} size={20} color={COLORS.TEXT_MUTED} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>New Password</Text>
                            <View style={styles.passwordInputContainer}>
                                <TextInput
                                    style={styles.passwordField}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                                    placeholderTextColor={COLORS.TEXT_MUTED}
                                    secureTextEntry={!showNewPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowNewPassword(!showNewPassword)}>
                                    <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={20} color={COLORS.TEXT_MUTED} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Confirm New Password</Text>
                            <TextInput
                                style={styles.textInput}
                                value={confirmNewPassword}
                                onChangeText={setConfirmNewPassword}
                                placeholder="Re-enter new password"
                                placeholderTextColor={COLORS.TEXT_MUTED}
                                secureTextEntry={!showNewPassword}
                                autoCapitalize="none"
                            />
                        </View>

                        <TouchableOpacity style={[styles.saveButton, changingPassword && styles.saveButtonDisabled]} onPress={handleChangePassword} disabled={changingPassword}>
                            {changingPassword ? <ActivityIndicator color={COLORS.BACKGROUND} /> : <Text style={styles.saveButtonText}>Update Password</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Logout Modal */}
            <Modal visible={logoutModalVisible} transparent={true} animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Log Out</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to log out?</Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setLogoutModalVisible(false)}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={confirmLogout}>
                                <Text style={styles.confirmButtonText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Account Modal */}
            <Modal visible={deleteModalVisible} transparent={true} animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.deleteModalContent}>
                        <View style={styles.deleteModalHeader}>
                            <View style={styles.deleteWarningIcon}>
                                <Ionicons name="warning" size={32} color="#EF4444" />
                            </View>
                            <Text style={styles.deleteModalTitle}>Delete Account</Text>
                        </View>
                        <Text style={styles.deleteModalMessage}>
                            This action is permanent and cannot be undone. All your data will be permanently deleted including:
                        </Text>
                        <View style={styles.deleteWarningList}>
                            {['Linked bank accounts', 'Transaction history', 'Debt tracking data', 'All personal information'].map((item) => (
                                <View key={item} style={styles.deleteWarningItem}>
                                    <Ionicons name="close-circle" size={16} color="#EF4444" />
                                    <Text style={styles.deleteWarningText}>{item}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={styles.deleteInputGroup}>
                            <Text style={styles.deleteInputLabel}>Enter your password to confirm</Text>
                            <View style={styles.passwordInputContainer}>
                                <TextInput
                                    style={styles.deletePasswordInput}
                                    value={deletePassword}
                                    onChangeText={setDeletePassword}
                                    placeholder="Enter password"
                                    placeholderTextColor={COLORS.TEXT_MUTED}
                                    secureTextEntry={!showDeletePassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowDeletePassword(!showDeletePassword)}>
                                    <Ionicons name={showDeletePassword ? "eye-off" : "eye"} size={20} color={COLORS.TEXT_MUTED} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.deleteModalActions}>
                            <TouchableOpacity style={styles.deleteCancelButton} onPress={() => setDeleteModalVisible(false)} disabled={deleting}>
                                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.deleteConfirmButton, deleting && styles.deleteButtonDisabled]} onPress={confirmDeleteAccount} disabled={deleting}>
                                {deleting ? <ActivityIndicator color={COLORS.WHITE} size="small" /> : <Text style={styles.deleteConfirmButtonText}>Delete Account</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 2FA Modal */}
            <Modal visible={twoFAModalVisible} transparent={true} animationType="slide" onRequestClose={() => setTwoFAModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.editModalContent}>
                        <View style={styles.editModalHeader}>
                            <Text style={styles.modalTitle}>
                                {twoFAStep === 'disable' ? 'Disable 2FA' : twoFAStep === 'codes' ? 'Recovery Codes' : 'Two-Factor Authentication'}
                            </Text>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setTwoFAModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        {twoFAStep === 'loading' && (
                            <View style={{ alignItems: 'center', padding: 40 }}>
                                <ActivityIndicator color={COLORS.GOLD} size="large" />
                                <Text style={[styles.modalMessage, { marginTop: 16 }]}>Setting up...</Text>
                            </View>
                        )}

                        {twoFAStep === 'setup' && (
                            <ScrollView>
                                <Text style={styles.modalMessage}>
                                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                </Text>
                                {twoFAQrCode && (
                                    <View style={{ alignItems: 'center', marginVertical: 16, backgroundColor: '#FFF', borderRadius: 12, padding: 16, alignSelf: 'center' }}>
                                        <Image source={{ uri: twoFAQrCode }} style={{ width: 200, height: 200 }} />
                                    </View>
                                )}
                                <Text style={[styles.modalMessage, { fontSize: 12 }]}>Or enter this code manually:</Text>
                                <View style={[styles.readOnlyInput, { marginBottom: 16 }]}>
                                    <Text style={{ color: COLORS.GOLD, fontSize: 14, fontFamily: 'monospace', letterSpacing: 2 }}>{twoFASecret}</Text>
                                </View>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Enter the 6-digit code from your app</Text>
                                    <TextInput style={styles.textInput} value={twoFACode} onChangeText={setTwoFACode} placeholder="000000" placeholderTextColor={COLORS.TEXT_MUTED} keyboardType="number-pad" maxLength={6} textAlign="center" />
                                </View>
                                <TouchableOpacity style={[styles.saveButton, twoFALoading && styles.saveButtonDisabled]} onPress={handleVerify2FA} disabled={twoFALoading}>
                                    {twoFALoading ? <ActivityIndicator color={COLORS.BACKGROUND} /> : <Text style={styles.saveButtonText}>Verify & Enable</Text>}
                                </TouchableOpacity>
                            </ScrollView>
                        )}

                        {twoFAStep === 'codes' && (
                            <ScrollView>
                                <Text style={styles.modalMessage}>
                                    Save these recovery codes in a safe place. Each code can only be used once.
                                </Text>
                                <View style={{ backgroundColor: '#2A2A2A', borderRadius: 12, padding: 16, marginVertical: 16 }}>
                                    {recoveryCodes.map((code, index) => (
                                        <Text key={index} style={{ color: COLORS.GOLD, fontSize: 16, fontFamily: 'monospace', textAlign: 'center', paddingVertical: 4, letterSpacing: 2 }}>{code}</Text>
                                    ))}
                                </View>
                                <Text style={[styles.modalMessage, { fontSize: 12, color: '#EF4444' }]}>These codes will not be shown again!</Text>
                                <TouchableOpacity style={styles.saveButton} onPress={() => setTwoFAModalVisible(false)}>
                                    <Text style={styles.saveButtonText}>I've Saved These Codes</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}

                        {twoFAStep === 'disable' && (
                            <View>
                                <Text style={styles.modalMessage}>Enter your password to disable two-factor authentication.</Text>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Password</Text>
                                    <TextInput style={styles.textInput} value={twoFAPassword} onChangeText={setTwoFAPassword} placeholder="Enter your password" placeholderTextColor={COLORS.TEXT_MUTED} secureTextEntry autoCapitalize="none" />
                                </View>
                                <TouchableOpacity style={[styles.deleteConfirmButton, { borderRadius: 12, paddingVertical: 16, marginTop: 8 }, twoFALoading && styles.deleteButtonDisabled]} onPress={handleDisable2FA} disabled={twoFALoading}>
                                    {twoFALoading ? <ActivityIndicator color={COLORS.WHITE} /> : <Text style={[styles.deleteConfirmButtonText, { textAlign: 'center' }]}>Disable 2FA</Text>}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Avatar Color Picker Modal */}
            <Modal visible={avatarColorModalVisible} transparent={true} animationType="fade" onRequestClose={() => setAvatarColorModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Choose Avatar Color</Text>
                        <View style={styles.colorGrid}>
                            {AVATAR_COLORS.map((color) => (
                                <TouchableOpacity
                                    key={color}
                                    style={[styles.colorOption, { backgroundColor: color }, profilePicture === color && styles.colorOptionSelected]}
                                    onPress={() => selectAvatarColor(color)}
                                >
                                    <Text style={styles.colorOptionInitials}>{getUserInitials()}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setAvatarColorModalVisible(false)}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} buttons={alertConfig.buttons} onRequestClose={hideAlert} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: StatusBar.currentHeight || 50,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.MEDIUM,
        marginBottom: 20,
    },
    backButton: { padding: 5 },
    headerTitle: {
        fontSize: 18,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
    },
    editButton: {
        color: '#3B82F6',
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    content: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 40,
    },
    profileSection: {
        alignItems: 'center',
        marginBottom: 30,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: COLORS.CARD_BORDER,
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitials: {
        fontSize: 36,
        fontFamily: FONTS.BOLD,
        color: '#FFFFFF',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 20,
    },
    colorOption: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorOptionSelected: {
        borderWidth: 3,
        borderColor: COLORS.WHITE,
    },
    colorOptionInitials: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
        color: '#FFFFFF',
    },
    editIcon: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.GOLD,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: COLORS.BACKGROUND,
    },
    userName: {
        fontSize: 24,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 8,
    },
    premiumBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    premiumText: {
        color: COLORS.GOLD,
        fontFamily: FONTS.BOLD,
        fontSize: 12,
        marginLeft: 6,
        letterSpacing: 1,
    },
    userId: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
    },
    sectionHeader: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontFamily: FONTS.BOLD,
        marginBottom: 10,
        letterSpacing: 1,
        marginTop: 10,
    },
    sectionCard: {
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 16,
        padding: SPACING.MEDIUM,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    menuIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#2A2A2A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    menuTextContainer: { flex: 1 },
    menuLabel: {
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 2,
    },
    menuSubtitle: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.CARD_BORDER,
        marginVertical: 12,
        marginLeft: 52,
    },
    badgeContainer: {
        backgroundColor: 'rgba(96, 165, 250, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#60A5FA',
        fontSize: 12,
        fontFamily: FONTS.BOLD,
    },
    logoutButton: {
        borderWidth: 1,
        borderColor: '#EF4444',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 30,
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
    },
    logoutText: {
        color: '#F87171',
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    footer: { alignItems: 'center' },
    footerText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginBottom: 4,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 12,
    },
    modalMessage: {
        fontSize: 16,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        marginBottom: 24,
    },
    modalActions: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 8,
    },
    cancelButton: { backgroundColor: 'transparent' },
    cancelButtonText: {
        color: COLORS.TEXT_SECONDARY,
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
    confirmButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderWidth: 1,
        borderColor: '#EF4444',
    },
    confirmButtonText: {
        color: '#F87171',
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
    editModalContent: {
        width: '90%',
        maxHeight: '80%',
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    editModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    closeButton: { padding: 4 },
    inputGroup: { marginBottom: 20 },
    inputLabel: {
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: COLORS.WHITE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    dateInput: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    dateText: { fontSize: 16, color: COLORS.WHITE },
    datePlaceholder: { fontSize: 16, color: COLORS.TEXT_MUTED },
    datePickerContainer: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        marginBottom: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    datePickerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 12,
    },
    pickerColumn: { flex: 1, marginHorizontal: 4 },
    pickerLabel: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 12,
        fontFamily: FONTS.BOLD,
        textAlign: 'center',
        marginBottom: 8,
    },
    pickerScroll: { maxHeight: 150 },
    pickerItem: {
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 8,
        alignItems: 'center',
    },
    pickerItemSelected: { backgroundColor: COLORS.GOLD },
    pickerItemText: { color: COLORS.TEXT_SECONDARY, fontSize: 14 },
    pickerItemTextSelected: { color: COLORS.BACKGROUND, fontFamily: FONTS.BOLD },
    datePickerDone: {
        alignItems: 'center',
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: COLORS.CARD_BORDER,
        backgroundColor: 'rgba(201, 162, 39, 0.1)',
    },
    datePickerDoneText: {
        color: COLORS.GOLD,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    readOnlyInput: {
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    readOnlyText: { fontSize: 16, color: COLORS.TEXT_MUTED },
    saveButton: {
        backgroundColor: COLORS.GOLD,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    // Password input
    passwordInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    passwordField: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: COLORS.WHITE,
    },
    passwordToggle: { padding: 16 },
    // Delete account
    deleteAccountItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    deleteIconContainer: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
    deleteLabel: {
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        color: '#EF4444',
        marginBottom: 2,
    },
    deleteSubtitle: { fontSize: 12, color: COLORS.TEXT_SECONDARY },
    deleteModalContent: {
        width: '90%',
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    deleteModalHeader: { alignItems: 'center', marginBottom: 16 },
    deleteWarningIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    deleteModalTitle: {
        fontSize: 22,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
    },
    deleteModalMessage: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
    },
    deleteWarningList: {
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    deleteWarningItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    deleteWarningText: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        marginLeft: 10,
    },
    deleteInputGroup: { marginBottom: 20 },
    deleteInputLabel: {
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: 8,
    },
    deletePasswordInput: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: COLORS.WHITE,
    },
    deleteModalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    deleteCancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginRight: 8,
        backgroundColor: 'transparent',
    },
    deleteCancelButtonText: {
        color: COLORS.TEXT_SECONDARY,
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
    deleteConfirmButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginLeft: 8,
        backgroundColor: '#EF4444',
    },
    deleteButtonDisabled: { opacity: 0.6 },
    deleteConfirmButtonText: {
        color: COLORS.WHITE,
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
});

export default ProfileScreen;
