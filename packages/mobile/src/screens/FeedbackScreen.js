import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
    Screen,
    ScreenHeader,
    Text,
    Button,
    Input,
    Chip,
    Overline,
    EmptyState,
} from '../components/ui';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

const CATEGORIES = [
    { id: 'general', label: 'General feedback', icon: 'chatbubble-ellipses' },
    { id: 'feature', label: 'Feature request', icon: 'bulb' },
    { id: 'bug', label: 'Bug report', icon: 'bug' },
    { id: 'ui_ux', label: 'Design / UI', icon: 'color-palette' },
    { id: 'performance', label: 'Performance', icon: 'speedometer' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const RATING_LABELS = ['Tap to rate (optional)', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

const makeStyles = () => StyleSheet.create({
    content: {
        paddingHorizontal: SPACING.MEDIUM,
        paddingBottom: 120,
    },
    intro: { marginBottom: SPACING.LARGE },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.SMALL + 2,
        marginBottom: SPACING.LARGE,
    },
    ratingRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginBottom: SPACING.SMALL,
    },
    starButton: { padding: 4 },
    ratingLabel: {
        textAlign: 'center',
        marginBottom: SPACING.LARGE,
    },
    charCount: {
        textAlign: 'right',
        marginTop: -SPACING.SMALL,
        marginBottom: SPACING.LARGE,
    },
    successWrap: {
        flex: 1,
        justifyContent: 'center',
    },
    successActions: {
        paddingHorizontal: SPACING.LARGE,
        gap: SPACING.SMALL,
    },
});

const FeedbackScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const [category, setCategory] = useState(null);
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', buttons: [],
    });

    const showAlert = (title, msg, buttons = []) => {
        setAlertConfig({ visible: true, title, message: msg, buttons });
    };

    const hideAlert = () => setAlertConfig((prev) => ({ ...prev, visible: false }));

    const handleSubmit = async () => {
        if (!category) {
            showAlert('Select a category', 'Please choose what your feedback is about.', [
                { text: 'OK', onPress: hideAlert },
            ]);
            return;
        }
        if (message.trim().length < 10) {
            showAlert('Too short', 'Please provide at least 10 characters of feedback.', [
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
            <Screen header={<ScreenHeader title="Feedback" onBack={() => navigation.goBack()} />}>
                <View style={styles.successWrap}>
                    <EmptyState
                        icon="checkmark-circle"
                        title="Thank you"
                        message="Your feedback has been submitted. We appreciate your input and will use it to improve IndusWealth."
                    />
                    <View style={styles.successActions}>
                        <Button
                            title="Submit more feedback"
                            onPress={() => {
                                setSubmitted(false);
                                setCategory(null);
                                setRating(0);
                                setMessage('');
                            }}
                            block
                        />
                        <Button
                            title="Back to profile"
                            variant="ghost"
                            onPress={() => navigation.goBack()}
                            block
                        />
                    </View>
                </View>
            </Screen>
        );
    }

    return (
        <>
            <Screen header={<ScreenHeader title="Send feedback" onBack={() => navigation.goBack()} />}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Text variant="body" tone="secondary" style={styles.intro}>
                            We'd love to hear from you. Your feedback helps us build a better
                            IndusWealth.
                        </Text>

                        <Overline inset={false}>What's this about?</Overline>
                        <View style={styles.categoryGrid}>
                            {CATEGORIES.map((cat) => (
                                <Chip
                                    key={cat.id}
                                    label={cat.label}
                                    icon={cat.icon}
                                    active={category === cat.id}
                                    onPress={() => setCategory(cat.id)}
                                />
                            ))}
                        </View>

                        <Overline inset={false}>How would you rate your experience?</Overline>
                        <View style={styles.ratingRow}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity
                                    key={star}
                                    onPress={() => setRating(star === rating ? 0 : star)}
                                    style={styles.starButton}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Rate ${star} out of 5`}
                                    accessibilityState={{ selected: star <= rating }}
                                >
                                    <Ionicons
                                        name={star <= rating ? 'star' : 'star-outline'}
                                        size={36}
                                        color={star <= rating ? theme.ACCENT : theme.TEXT_MUTED}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text variant="body" tone="secondary" style={styles.ratingLabel}>
                            {RATING_LABELS[rating]}
                        </Text>

                        <Overline inset={false}>Tell us more</Overline>
                        <Input
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Describe your feedback, suggestion, or issue in detail..."
                            multiline
                            maxLength={2000}
                        />
                        <Text variant="meta" tone="muted" style={styles.charCount}>
                            {message.length}/2000
                        </Text>

                        <Button
                            title="Submit feedback"
                            icon="send"
                            onPress={handleSubmit}
                            loading={submitting}
                            block
                        />
                    </ScrollView>
                </KeyboardAvoidingView>
            </Screen>

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

export default FeedbackScreen;
