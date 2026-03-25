import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    StatusBar,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../constants/theme';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

const CATEGORIES = [
    { id: 'general', label: 'General Feedback', icon: 'chatbubble-ellipses' },
    { id: 'feature', label: 'Feature Request', icon: 'bulb' },
    { id: 'bug', label: 'Bug Report', icon: 'bug' },
    { id: 'ui_ux', label: 'Design / UI', icon: 'color-palette' },
    { id: 'performance', label: 'Performance', icon: 'speedometer' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const FeedbackScreen = ({ navigation }) => {
    const [category, setCategory] = useState(null);
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        buttons: [],
    });

    const showAlert = (title, msg, buttons = []) => {
        setAlertConfig({ visible: true, title, message: msg, buttons });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const handleSubmit = async () => {
        if (!category) {
            showAlert('Select Category', 'Please select a feedback category.', [
                { text: 'OK', onPress: hideAlert },
            ]);
            return;
        }
        if (message.trim().length < 10) {
            showAlert('Too Short', 'Please provide at least 10 characters of feedback.', [
                { text: 'OK', onPress: hideAlert },
            ]);
            return;
        }

        setSubmitting(true);
        try {
            await api.submitFeedback({
                category,
                rating: rating > 0 ? rating : null,
                message: message.trim(),
            });
            setSubmitted(true);
        } catch (error) {
            showAlert('Error', error.message || 'Failed to submit feedback. Please try again.', [
                { text: 'OK', onPress: hideAlert },
            ]);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Feedback</Text>
                    <View style={{ width: 34 }} />
                </View>
                <View style={styles.successContainer}>
                    <View style={styles.successIcon}>
                        <Ionicons name="checkmark-circle" size={64} color={COLORS.GREEN} />
                    </View>
                    <Text style={styles.successTitle}>Thank You!</Text>
                    <Text style={styles.successMessage}>
                        Your feedback has been submitted successfully. We appreciate your input and will use it to improve IndusWealth.
                    </Text>
                    <TouchableOpacity
                        style={styles.submitButton}
                        onPress={() => {
                            setSubmitted(false);
                            setCategory(null);
                            setRating(0);
                            setMessage('');
                        }}
                    >
                        <Text style={styles.submitButtonText}>Submit More Feedback</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.backToProfileButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.backToProfileText}>Back to Profile</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Send Feedback</Text>
                <View style={{ width: 34 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <Text style={styles.introText}>
                        We'd love to hear from you! Your feedback helps us build a better IndusWealth.
                    </Text>

                    {/* Category Selection */}
                    <Text style={styles.sectionLabel}>What's this about?</Text>
                    <View style={styles.categoryGrid}>
                        {CATEGORIES.map((cat) => (
                            <TouchableOpacity
                                key={cat.id}
                                style={[
                                    styles.categoryChip,
                                    category === cat.id && styles.categoryChipSelected,
                                ]}
                                onPress={() => setCategory(cat.id)}
                            >
                                <Ionicons
                                    name={cat.icon}
                                    size={18}
                                    color={category === cat.id ? COLORS.BACKGROUND : COLORS.GOLD}
                                />
                                <Text
                                    style={[
                                        styles.categoryChipText,
                                        category === cat.id && styles.categoryChipTextSelected,
                                    ]}
                                >
                                    {cat.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Rating */}
                    <Text style={styles.sectionLabel}>How would you rate your experience?</Text>
                    <View style={styles.ratingRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity
                                key={star}
                                onPress={() => setRating(star === rating ? 0 : star)}
                                style={styles.starButton}
                            >
                                <Ionicons
                                    name={star <= rating ? 'star' : 'star-outline'}
                                    size={36}
                                    color={star <= rating ? '#FFD700' : COLORS.TEXT_MUTED}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.ratingLabel}>
                        {rating === 0 ? 'Tap to rate (optional)' :
                         rating === 1 ? 'Poor' :
                         rating === 2 ? 'Fair' :
                         rating === 3 ? 'Good' :
                         rating === 4 ? 'Great' : 'Excellent'}
                    </Text>

                    {/* Message */}
                    <Text style={styles.sectionLabel}>Tell us more</Text>
                    <TextInput
                        style={styles.messageInput}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Describe your feedback, suggestion, or issue in detail..."
                        placeholderTextColor={COLORS.TEXT_MUTED}
                        multiline
                        numberOfLines={6}
                        textAlignVertical="top"
                        maxLength={2000}
                    />
                    <Text style={styles.charCount}>{message.length}/2000</Text>

                    {/* Submit */}
                    <TouchableOpacity
                        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                        onPress={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color={COLORS.BACKGROUND} />
                        ) : (
                            <>
                                <Ionicons name="send" size={18} color={COLORS.BACKGROUND} style={{ marginRight: 8 }} />
                                <Text style={styles.submitButtonText}>Submit Feedback</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={{ height: 120 }} />
                </ScrollView>
            </KeyboardAvoidingView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onRequestClose={hideAlert}
            />
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
        marginBottom: 10,
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
    },
    content: {
        paddingHorizontal: SPACING.MEDIUM,
    },
    introText: {
        fontSize: 15,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: 24,
        lineHeight: 22,
    },
    sectionLabel: {
        fontSize: 14,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 12,
        marginTop: 8,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 24,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        backgroundColor: COLORS.CARD_BG,
    },
    categoryChipSelected: {
        backgroundColor: COLORS.GOLD,
        borderColor: COLORS.GOLD,
    },
    categoryChipText: {
        fontSize: 13,
        color: COLORS.TEXT_SECONDARY,
        marginLeft: 6,
        fontFamily: FONTS.MEDIUM,
    },
    categoryChipTextSelected: {
        color: COLORS.BACKGROUND,
        fontFamily: FONTS.BOLD,
    },
    ratingRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 8,
    },
    starButton: {
        padding: 4,
    },
    ratingLabel: {
        textAlign: 'center',
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        marginBottom: 24,
    },
    messageInput: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        padding: 16,
        fontSize: 15,
        color: COLORS.WHITE,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
        minHeight: 140,
    },
    charCount: {
        textAlign: 'right',
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
        marginTop: 4,
        marginBottom: 24,
    },
    submitButton: {
        backgroundColor: COLORS.GOLD,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: COLORS.BACKGROUND,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
    // Success state
    successContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    successIcon: {
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 24,
        fontFamily: FONTS.BOLD,
        color: COLORS.WHITE,
        marginBottom: 12,
    },
    successMessage: {
        fontSize: 15,
        color: COLORS.TEXT_SECONDARY,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    backToProfileButton: {
        marginTop: 16,
        paddingVertical: 14,
    },
    backToProfileText: {
        color: COLORS.TEXT_SECONDARY,
        fontSize: 16,
        fontFamily: FONTS.BOLD,
    },
});

export default FeedbackScreen;
