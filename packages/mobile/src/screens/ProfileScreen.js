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
    Modal
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import cache from '../services/cache';

const ProfileScreen = ({ navigation }) => {
    const [user, setUser] = useState({ name: 'User', email: 'user@example.com' });
    const [faceIdEnabled, setFaceIdEnabled] = useState(true);
    const [darkThemeEnabled, setDarkThemeEnabled] = useState(true);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);

    useEffect(() => {
        const loadUser = async () => {
            const cachedUser = await cache.getCachedUser();
            if (cachedUser) {
                setUser(cachedUser);
            }
        };
        loadUser();
    }, []);

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

    const MenuItem = ({ icon, label, subtitle, showToggle, value, onToggle, showBadge, badgeText }) => (
        <TouchableOpacity style={styles.menuItem} disabled={showToggle}>
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
                <TouchableOpacity>
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
                        <View style={styles.editIcon}>
                            <Ionicons name="pencil" size={12} color={COLORS.WHITE} />
                        </View>
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
                        badgeText="On ✓"
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
        fontWeight: 'bold',
        color: COLORS.WHITE,
    },
    editButton: {
        color: '#3B82F6', // Blue
        fontSize: 16,
        fontWeight: '600',
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
        fontWeight: 'bold',
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
        fontWeight: '700',
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
        fontWeight: '700',
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
        fontWeight: '600',
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
        fontWeight: '600',
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
        fontWeight: '600',
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
        fontWeight: 'bold',
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
        fontWeight: '600',
        fontSize: 16,
    },
    confirmButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.05)', // Tiny tint
        borderWidth: 1,
        borderColor: '#EF4444', // Red border
    },
    confirmButtonText: {
        color: '#F87171', // Red
        fontWeight: '700',
        fontSize: 16,
    }
});

export default ProfileScreen;
