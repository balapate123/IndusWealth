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
    Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '../constants/theme';
import cache from '../services/cache';
import api from '../services/api';

const ProfileScreen = ({ navigation }) => {
    const [user, setUser] = useState({ name: 'User', email: 'user@example.com' });
    const [faceIdEnabled, setFaceIdEnabled] = useState(true);
    const [darkThemeEnabled, setDarkThemeEnabled] = useState(true);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [editName, setEditName] = useState('');
    const [editDob, setEditDob] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        // Try cache first
        const cachedUser = await cache.getCachedUser();
        if (cachedUser) {
            setUser(cachedUser);
        }

        // Fetch fresh data from API
        try {
            const response = await api.auth.me();
            if (response.success && response.user) {
                setUser(response.user);
                await cache.setCachedUser(response.user);
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
        }
    };

    const handleLogout = async () => {
        setLogoutModalVisible(true);
    };

    const confirmLogout = async () => {
        setLogoutModalVisible(false);
        // Clear session
        await cache.clearUserCache();
        // Reset Global User ID
        global.CURRENT_USER_ID = undefined;
        // Navigate to Auth Stack
        navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
        });
    };

    const openEditModal = () => {
        setEditName(user.name || '');
        // Parse existing DOB if available
        if (user.dateOfBirth) {
            setEditDob(new Date(user.dateOfBirth));
        } else {
            setEditDob(null);
        }
        setEditModalVisible(true);
    };

    const handleSaveProfile = async () => {
        if (!editName.trim()) {
            Alert.alert('Error', 'Please enter your name');
            return;
        }

        setSaving(true);
        try {
            const updateData = { name: editName.trim() };
            if (editDob) {
                // Format date as YYYY-MM-DD
                updateData.dateOfBirth = editDob.toISOString().split('T')[0];
            }

            const response = await api.auth.updateProfile(updateData);
            if (response.success) {
                // Update local state
                const updatedUser = {
                    ...user,
                    name: editName.trim(),
                    dateOfBirth: editDob ? editDob.toISOString().split('T')[0] : user.dateOfBirth
                };
                setUser(updatedUser);
                await cache.setCachedUser(updatedUser);
                setEditModalVisible(false);
                Alert.alert('Success', 'Profile updated successfully');
            }
        } catch (error) {
            console.error('Failed to update profile:', error);
            Alert.alert('Error', error.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleDateChange = (event, selectedDate) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setEditDob(selectedDate);
        }
    };

    const formatDisplayDate = (dateString) => {
        if (!dateString) return 'Not set';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return 'Not set';
        }
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
                    trackColor={{ false: "#767577", true: "#4CAF50" }} // Green for ON
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
                        {/* Placeholder Avatar */}
                        <Image
                            source={{ uri: 'https://i.pravatar.cc/300?img=5' }}
                            style={styles.avatar}
                        />
                        <TouchableOpacity style={styles.editIcon} onPress={openEditModal}>
                            <Ionicons name="pencil" size={12} color={COLORS.WHITE} />
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
                        subtitle="RBC Royal Bank, TD Canada..."
                        showBadge
                        badgeText="2 Active"
                    />
                </View>

                {/* Security */}
                <Text style={styles.sectionHeader}>SECURITY</Text>
                <View style={styles.sectionCard}>
                    <MenuItem
                        icon="refresh"
                        label="Change Password"
                        subtitle="Last updated 30 days ago"
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="scan"
                        label="Face ID Login"
                        subtitle="Secure biometric access"
                        showToggle
                        value={faceIdEnabled}
                        onToggle={setFaceIdEnabled}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="shield"
                        label="2-Step Verification"
                        subtitle="Extra layer of protection"
                        showBadge // Mocking the "On" text as a pseudo-badge/text
                        badgeText="On"
                    />
                </View>

                {/* Preferences */}
                <Text style={styles.sectionHeader}>PREFERENCES</Text>
                <View style={styles.sectionCard}>
                    <MenuItem
                        icon="notifications"
                        label="Notifications"
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="moon"
                        label="Dark Theme"
                        showToggle
                        value={darkThemeEnabled}
                        onToggle={setDarkThemeEnabled}
                    />
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
            <Modal
                visible={editModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.editModalContent}>
                        <View style={styles.editModalHeader}>
                            <Text style={styles.modalTitle}>Edit Profile</Text>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={() => setEditModalVisible(false)}
                            >
                                <Ionicons name="close" size={24} color={COLORS.WHITE} />
                            </TouchableOpacity>
                        </View>

                        {/* Name Input */}
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

                        {/* Date of Birth Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Date of Birth</Text>
                            <TouchableOpacity
                                style={styles.dateInput}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Text style={editDob ? styles.dateText : styles.datePlaceholder}>
                                    {editDob ? editDob.toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    }) : 'Select your date of birth'}
                                </Text>
                                <Ionicons name="calendar-outline" size={20} color={COLORS.GOLD} />
                            </TouchableOpacity>
                        </View>

                        {/* Date Picker */}
                        {showDatePicker && (
                            <View style={styles.datePickerContainer}>
                                <DateTimePicker
                                    value={editDob || new Date(2000, 0, 1)}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={handleDateChange}
                                    maximumDate={new Date()}
                                    minimumDate={new Date(1900, 0, 1)}
                                    textColor={COLORS.WHITE}
                                    themeVariant="dark"
                                />
                                {Platform.OS === 'ios' && (
                                    <TouchableOpacity
                                        style={styles.datePickerDone}
                                        onPress={() => setShowDatePicker(false)}
                                    >
                                        <Text style={styles.datePickerDoneText}>Done</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Email (read-only) */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <View style={styles.readOnlyInput}>
                                <Text style={styles.readOnlyText}>{user.email}</Text>
                                <Ionicons name="lock-closed" size={16} color={COLORS.TEXT_MUTED} />
                            </View>
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                            onPress={handleSaveProfile}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color={COLORS.BACKGROUND} />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Custom Logout Modal */}
            <Modal
                visible={logoutModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setLogoutModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Log Out</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to log out?</Text>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setLogoutModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={confirmLogout}
                            >
                                <Text style={styles.confirmButtonText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
    },
    editButton: {
        color: '#3B82F6', // Blue
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
        borderColor: COLORS.CARD_BG,
    },
    editIcon: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#3B82F6',
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
        backgroundColor: '#2A2A2A', // Slightly lighter than card
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    menuTextContainer: {
        flex: 1,
    },
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
        marginLeft: 52, // Align with text start
    },
    badgeContainer: {
        backgroundColor: 'rgba(96, 165, 250, 0.2)', // Light Blue tint
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#60A5FA', // Light Blue
        fontSize: 12,
        fontFamily: FONTS.BOLD,
    },
    logoutButton: {
        borderWidth: 1,
        borderColor: '#EF4444', // Red border
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 30,
        backgroundColor: 'rgba(239, 68, 68, 0.05)', // Tiny tint
    },
    logoutText: {
        color: '#F87171', // Red text
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    footer: {
        alignItems: 'center',
    },
    footerText: {
        color: COLORS.TEXT_MUTED,
        fontSize: 12,
        marginBottom: 4,
    },
    // Modal Styles
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
    cancelButton: {
        backgroundColor: 'transparent',
    },
    cancelButtonText: {
        color: COLORS.TEXT_SECONDARY,
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
    confirmButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.05)', // Tiny tint
        borderWidth: 1,
        borderColor: '#EF4444', // Red border
    },
    confirmButtonText: {
        color: '#F87171', // Red
        fontFamily: FONTS.BOLD,
        fontSize: 16,
    },
    // Edit Modal Styles
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
    closeButton: {
        padding: 4,
    },
    inputGroup: {
        marginBottom: 20,
    },
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
    dateText: {
        fontSize: 16,
        color: COLORS.WHITE,
    },
    datePlaceholder: {
        fontSize: 16,
        color: COLORS.TEXT_MUTED,
    },
    datePickerContainer: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        marginBottom: 20,
        overflow: 'hidden',
    },
    datePickerDone: {
        alignItems: 'center',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.CARD_BORDER,
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
    readOnlyText: {
        fontSize: 16,
        color: COLORS.TEXT_MUTED,
    },
    saveButton: {
        backgroundColor: COLORS.GOLD,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
});

export default ProfileScreen;
