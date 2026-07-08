import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    StatusBar,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../constants/theme';

const PRIVACY_POLICY_SECTIONS = [
    {
        title: '1. Introduction',
        content: 'IndusWealth ("we", "us", "our", or the "Company") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, disclose, store, and protect your information when you use the IndusWealth mobile application and related services (the "Service").\n\nThis Privacy Policy complies with the Personal Information Protection and Electronic Documents Act (PIPEDA, S.C. 2000, c. 5) and applicable provincial privacy legislation.'
    },
    {
        title: '2. Information We Collect',
        content: 'Information You Provide Directly:\n• Email address — Account authentication\n• Password — Stored as a bcrypt hash (never in plaintext)\n• Name — Personalization\n• Date of birth — Age-based financial insights\n• Transaction notes — Personal record-keeping\n• Custom debt entries — Debt payoff calculations\n\nInformation from Plaid (Bank Data):\n• Account information — names, types, balances\n• Transaction data — names, amounts, dates, categories\n• Liability data — credit card and loan balances\n\nUsage Analytics (Mixpanel):\n• App events (login, screen views, feature usage) tied to a pseudonymous user ID\n• No name, email, or financial data is ever sent to Mixpanel\n\nWe do NOT receive your bank login credentials, full account numbers, SIN, credit score, or PINs.'
    },
    {
        title: '3. How We Use Your Information',
        content: 'Providing the Service:\n• Authenticating your identity and managing your account\n• Displaying bank account balances and transaction history\n• Generating spending analytics and category breakdowns\n• Detecting recurring subscriptions and expenses\n• Calculating debt payoff strategies\n\nAI-Powered Features:\nWhen generating insights, we send an aggregated, anonymized summary to Google Gemini. We do NOT send your name, email, bank account numbers, or any data that directly identifies you.'
    },
    {
        title: '4. How We Share Your Information',
        content: 'Third-Party Service Providers:\n• Plaid Inc. — Bank account aggregation (United States)\n• Google Gemini AI — Insight generation (United States)\n• Render.com — Application hosting (United States)\n• Mixpanel Inc. — Product usage analytics, pseudonymous events only (United States)\n\nWe do NOT:\n• Sell your personal information\n• Share your data with advertisers\n• Provide your data to data brokers\n• Use your financial data for credit decisions'
    },
    {
        title: '5. Data Retention & Deletion',
        content: 'We retain your personal information only as long as necessary. When you delete your account, we permanently delete all your data including:\n• User profile and credentials\n• All linked bank accounts\n• All transaction records\n• All AI-generated insights\n• All custom debt entries\n• All educational bookmarks\n\nThis deletion is irreversible.'
    },
    {
        title: '6. Data Security',
        content: '• Encryption in transit — All data encrypted using TLS/HTTPS\n• Encryption at rest — Plaid tokens and 2FA secrets encrypted with AES-256-GCM\n• Password hashing — bcrypt with cost factor 12\n• JWT authentication — Short-lived access tokens with rotating refresh tokens\n• Two-factor authentication — Optional TOTP 2FA with recovery codes\n• Account lockout — Temporary lockout after repeated failed logins\n• Database security — Parameterized queries to prevent SQL injection\n• Rate limiting — IP-based brute force prevention\n• Input validation — Server-side validation of all input'
    },
    {
        title: '7. Your Privacy Rights',
        content: 'Under PIPEDA, you have the right to:\n• Access your personal information\n• Correct inaccurate information\n• Withdraw consent for data processing\n• Request deletion of your data\n• Request data portability (JSON/CSV export)\n• Challenge our compliance\n\nContact: privacy@induswealth.com\nWe will respond within 30 days as required by PIPEDA.'
    },
    {
        title: '8. Contact Us',
        content: 'IndusWealth Privacy Officer\nEmail: privacy@induswealth.com\nGeneral Support: support@induswealth.com\n\nOffice of the Privacy Commissioner of Canada\nWebsite: priv.gc.ca\nToll-free: 1-800-282-1376'
    },
];

const TERMS_OF_SERVICE_SECTIONS = [
    {
        title: '1. Agreement to Terms',
        content: 'By creating an account, accessing, or using the IndusWealth mobile application and related services, you agree to be bound by these Terms of Service. If you do not agree, you must not access or use the Service.\n\nThese Terms constitute a legally binding agreement between you and IndusWealth, operated under the laws of Canada.'
    },
    {
        title: '2. Description of Service',
        content: 'IndusWealth is a personal finance tracking and analytics application that allows you to:\n• Link bank accounts via Plaid to view aggregated balances and transactions\n• View spending analytics and category breakdowns\n• Receive AI-generated financial insights powered by Google Gemini\n• Track and manage debt payoff strategies\n• Detect recurring subscriptions and expenses\n• Access curated educational financial content (Wealth Academy)'
    },
    {
        title: '3. Important Disclaimers',
        content: 'No Financial Advice:\nIndusWealth does NOT provide financial, investment, tax, legal, or accounting advice. All content including AI insights, debt calculations, and educational articles is for informational purposes only.\n\nNo Guarantees on AI Content:\nAI insights are generated by machine learning and may contain errors. They should be independently verified before acting upon them.\n\nAccuracy of Data:\nWe rely on Plaid for bank data and do not guarantee accuracy. Your bank is the authoritative source.'
    },
    {
        title: '4. Eligibility',
        content: 'To use IndusWealth, you must:\n• Be at least 13 years of age\n• Be a resident of Canada\n• Have legal capacity to enter a binding agreement\n• Provide accurate information during registration'
    },
    {
        title: '5. Account Security',
        content: 'You are responsible for:\n• Maintaining the confidentiality of your login credentials\n• All activities that occur under your account\n• Notifying us immediately if you suspect unauthorized access\n\nWe are not liable for loss or damage from failure to protect your credentials.'
    },
    {
        title: '6. Bank Account Linking',
        content: 'IndusWealth uses Plaid Inc. for bank connections. We request read-only access to your financial data.\n\nWe cannot and do not:\n• Initiate transactions or transfers\n• Modify your bank account settings\n• Access your banking credentials\n• Access full account numbers'
    },
    {
        title: '7. Limitation of Liability',
        content: 'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.\n\nWe are not liable for any indirect, incidental, special, consequential, or punitive damages, or any financial losses resulting from decisions made based on information provided by the Service.\n\nTotal aggregate liability shall not exceed CAD $100.00.'
    },
    {
        title: '8. Dispute Resolution',
        content: 'These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada.\n\nBefore formal dispute resolution, you agree to contact support@induswealth.com and attempt informal resolution for at least 30 days.\n\nDisputes shall be submitted to the courts of Ontario, Canada.'
    },
    {
        title: '9. Contact',
        content: 'Email: support@induswealth.com\nWebsite: induswealth.com\n\nBy using IndusWealth, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.'
    },
];

const LegalDocScreen = ({ navigation, route }) => {
    const docType = route.params?.docType || 'privacy';
    const isPrivacy = docType === 'privacy';
    const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
    const sections = isPrivacy ? PRIVACY_POLICY_SECTIONS : TERMS_OF_SERVICE_SECTIONS;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{title}</Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.docHeader}>
                    <Ionicons
                        name={isPrivacy ? 'shield-checkmark' : 'document-text'}
                        size={40}
                        color={COLORS.GOLD}
                    />
                    <Text style={styles.docTitle}>IndusWealth</Text>
                    <Text style={styles.docSubtitle}>{title}</Text>
                    <Text style={styles.docVersion}>Version 1.0 — Effective March 2026</Text>
                </View>

                {sections.map((section, index) => (
                    <View key={index} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionContent}>{section.content}</Text>
                    </View>
                ))}

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        {isPrivacy
                            ? 'IndusWealth is committed to protecting your privacy in accordance with Canadian law.'
                            : 'By using IndusWealth, you acknowledge that you have read and agree to these Terms.'}
                    </Text>
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>
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
    docHeader: {
        alignItems: 'center',
        paddingVertical: 24,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.CARD_BORDER,
        marginBottom: 24,
    },
    docTitle: {
        fontSize: 22,
        fontFamily: FONTS.BOLD,
        color: COLORS.GOLD,
        marginTop: 12,
    },
    docSubtitle: {
        fontSize: 16,
        fontFamily: FONTS.MEDIUM,
        color: COLORS.WHITE,
        marginTop: 4,
    },
    docVersion: {
        fontSize: 12,
        color: COLORS.TEXT_SECONDARY,
        marginTop: 8,
    },
    section: {
        marginBottom: 24,
        backgroundColor: COLORS.CARD_BG,
        borderRadius: 16,
        padding: SPACING.MEDIUM,
        borderWidth: 1,
        borderColor: COLORS.CARD_BORDER,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: FONTS.BOLD,
        color: COLORS.GOLD,
        marginBottom: 12,
    },
    sectionContent: {
        fontSize: 14,
        color: COLORS.TEXT_SECONDARY,
        lineHeight: 22,
    },
    footer: {
        alignItems: 'center',
        paddingVertical: 24,
        borderTopWidth: 1,
        borderTopColor: COLORS.CARD_BORDER,
    },
    footerText: {
        fontSize: 12,
        color: COLORS.TEXT_MUTED,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default LegalDocScreen;
