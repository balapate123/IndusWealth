import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { Screen, ScreenHeader, Card, Text } from '../components/ui';

const PRIVACY_POLICY_SECTIONS = [
    {
        title: '1. Introduction',
        content: 'IndusWealth ("we", "us", "our", or the "Company") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, disclose, store, and protect your information when you use the IndusWealth mobile application and related services (the "Service").\n\nThis Privacy Policy complies with the Personal Information Protection and Electronic Documents Act (PIPEDA, S.C. 2000, c. 5) and applicable provincial privacy legislation.'
    },
    {
        title: '2. Information We Collect',
        content: 'Information You Provide Directly:\n• Email address — Account authentication\n• Password — Stored as a bcrypt hash (never in plaintext)\n• Name — Personalization\n• Date of birth — Age-based financial insights\n• Transaction notes — Personal record-keeping\n• Custom debt entries — Debt payoff calculations\n\nInformation from Plaid (Bank Data):\nWe use Plaid Inc. to connect your bank accounts. Plaid collects your banking credentials directly and we never see or store them. Plaid\'s handling of your information is governed by the Plaid End User Privacy Policy at plaid.com/legal.\n• Account information — names, types, balances, including credit card and loan balances\n• Transaction data — names, amounts, dates, categories\n\nUsage Analytics (Mixpanel):\n• App events (login, screen views, feature usage) tied to a pseudonymous user ID\n• No name, email, or financial data is ever sent to Mixpanel\n\nWe do NOT receive your bank login credentials, full account numbers, SIN, credit score, or PINs.'
    },
    {
        title: '3. How We Use Your Information',
        content: 'Providing the Service:\n• Authenticating your identity and managing your account\n• Displaying bank account balances and transaction history\n• Generating spending analytics and category breakdowns\n• Detecting recurring subscriptions and expenses\n• Calculating debt payoff strategies\n\nAI-Powered Features:\nWhen generating insights, we send an aggregated, anonymized summary to Google Gemini. We do NOT send your name, email, bank account numbers, or any data that directly identifies you.'
    },
    {
        title: '4. How We Share Your Information',
        content: 'Third-Party Service Providers:\n• Plaid Inc. — Bank account aggregation (United States) — see the Plaid End User Privacy Policy at plaid.com/legal\n• Google Gemini AI — Insight generation (United States)\n• Render.com — Application hosting and database (United States)\n• Mixpanel Inc. — Product usage analytics, pseudonymous events only (United States)\n• Resend — Transactional email such as address verification and password resets (United States)\n\nProcessing Outside Canada:\nThe providers above operate in the United States, so your information may be stored and processed outside Canada and may be accessible to foreign courts, law enforcement, or regulatory authorities under the laws of that country. We use only providers that are contractually bound to protect your information to a comparable standard.\n\nWe do NOT:\n• Sell your personal information\n• Share your data with advertisers\n• Provide your data to data brokers\n• Use your financial data for credit decisions'
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
        content: 'Under PIPEDA, you have the right to:\n• Access your personal information\n• Correct inaccurate information\n• Withdraw consent for data processing\n• Request deletion of your data\n• Request data portability (JSON/CSV export)\n• Challenge our compliance\n\nContact: privacy@induswealth.app\nWe will respond within 30 days as required by PIPEDA.'
    },
    {
        title: '8. Contact Us',
        content: 'IndusWealth Privacy Officer\nEmail: privacy@induswealth.app\nGeneral Support: support@induswealth.app\n\nOffice of the Privacy Commissioner of Canada\nWebsite: priv.gc.ca\nToll-free: 1-800-282-1376'
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
        content: 'These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada.\n\nBefore formal dispute resolution, you agree to contact support@induswealth.app and attempt informal resolution for at least 30 days.\n\nDisputes shall be submitted to the courts of Ontario, Canada.'
    },
    {
        title: '9. Contact',
        content: 'Email: support@induswealth.app\nWebsite: induswealth.app\n\nBy using IndusWealth, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.'
    },
];

/**
 * The long-form answer to "why isn't X in my list", which is the question the
 * Watchdog screen itself should not try to answer inline.
 *
 * Written in the same voice as the screen: it states what we cannot do as
 * plainly as what we can.
 */
const WATCHDOG_SECTIONS = [
    {
        title: 'What Watchdog does',
        content: 'Watchdog reads your transaction history looking for payments that repeat — subscriptions, bills, and fixed payments like rent or a loan.\n\nIt cannot cancel anything and it cannot negotiate. Nothing can; there is no way for an app to end a contract on your behalf. What it can do is show you exactly what you are committed to, tell you how to get out of it, and then watch your account to see whether it actually stopped.',
    },
    {
        title: 'Why something is on the list',
        content: 'A payment has to pass four tests before we call it recurring.\n\nWe have seen it at least three times. Twice could be a coincidence — two charges give one gap, and a single gap tells you nothing about whether it repeats.\n\nIt bills the same amount. A subscription charges the same number every time. A gas station never does. This is the test that keeps your fill-ups off the list.\n\nIt lands on the same day. Not "roughly every month" — the 14th, three months running. Statements do not wander.\n\nAnd we have to be reasonably sure. Anything we are only guessing at is left off rather than shown with a caveat.',
    },
    {
        title: 'Why something is missing',
        content: 'The most common reason is that we have only seen it once or twice. Keep the account connected and it will appear.\n\nWeekly payments are not detected at all. That is deliberate: the rule that would catch them also caught every merchant anyone visited twice in a week and a half, which is how gas stations and hardware stores ended up looking like subscriptions. Missing a genuine weekly charge is the better of the two mistakes.\n\nSomething paid by e-transfer to a person is also skipped, along with groceries and restaurants.\n\nAnd if you have just connected an account, we may not have enough history yet. Watchdog looks back about six months.',
    },
    {
        title: 'The three groups',
        content: 'Subscriptions are things you can cancel — streaming, software, a gym, a news site. These get a Cancel button.\n\nBills are things you usually cannot cancel but can often lower: your phone, your internet, your insurance. These get a Negotiate button where we hold a script for that company, and nothing where we do not, because a button with no path behind it is worse than no button.\n\nFixed payments are rent, a mortgage, a car loan. They carry no buttons at all. They are here so you can see and plan around them.',
    },
    {
        title: 'Why a bill shows a range',
        content: 'A hydro or gas bill genuinely changes month to month, so we show what it has ranged between rather than pretending one number is the answer.\n\nSubscriptions never show a range. If you ever see one there, something has gone wrong on our end.',
    },
    {
        title: 'What happens after you tap Cancel',
        content: 'We show you the steps and, where we have one, a direct link. You do the cancelling on the company\'s own site or over the phone.\n\nWhen you come back and mark it done, we note the date your next charge was due and check your account around then. If nothing arrives, we tell you it stopped and count it toward your confirmed savings. If a charge does arrive, we tell you that instead — cancellations sometimes take an extra billing cycle, and if you have a confirmation it may be worth disputing.\n\nThat second message is the reason the feature exists. Anyone can look up how to cancel a subscription. Almost nothing tells you it did not work.',
    },
    {
        title: 'Confirmed savings',
        content: 'The figure at the top counts only what we have watched happen: charges that stopped, and bills that came back smaller.\n\nIt deliberately does not count things you have told us you intend to cancel. A number made of good intentions is not a saving, and once you have seen one of those you stop believing the rest.',
    },
    {
        title: 'What we never do',
        content: 'We do not contact any company on your behalf, and we do not move money — not to cancel something, not to pay a bill, not ever.\n\nWe do not recommend a product based on your spending.\n\nAnd we do not share your transaction data with the merchants on this screen.',
    },
];

/**
 * Every long-form document the app renders in place.
 *
 * Was a pair of ternaries on `isPrivacy`, which silently meant "terms" for any
 * docType that was not 'privacy' -- a third document would have rendered the
 * Terms of Service under its own title.
 */
const DOCS = {
    privacy: {
        title: 'Privacy Policy',
        icon: 'shield-checkmark',
        version: 'Version 1.0 — Effective March 2026',
        footer: 'IndusWealth is committed to protecting your privacy in accordance with Canadian law.',
        sections: PRIVACY_POLICY_SECTIONS,
    },
    terms: {
        title: 'Terms of Service',
        icon: 'document-text',
        version: 'Version 1.0 — Effective March 2026',
        footer: 'By using IndusWealth, you acknowledge that you have read and agree to these Terms.',
        sections: TERMS_OF_SERVICE_SECTIONS,
    },
    watchdog: {
        title: 'How Watchdog works',
        icon: 'eye',
        version: null,
        footer: 'Watchdog reads your transactions. It never moves money and never contacts anyone on your behalf.',
        sections: WATCHDOG_SECTIONS,
    },
};

const LegalDocScreen = ({ navigation, route }) => {
    const docType = route.params?.docType || 'privacy';
    const doc = DOCS[docType] || DOCS.privacy;
    const { title, sections } = doc;

    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    return (
        <Screen
            scroll
            header={<ScreenHeader title={title} onBack={() => navigation.goBack()} />}
            contentContainerStyle={styles.content}
        >
            <View style={styles.docHeader}>
                <Ionicons name={doc.icon} size={40} color={theme.ACCENT} />
                <Text variant="h1" tone="accent" style={styles.docTitle}>IndusWealth</Text>
                <Text variant="title">{title}</Text>
                {doc.version ? (
                    <Text variant="meta" tone="muted" style={styles.docVersion}>{doc.version}</Text>
                ) : null}
            </View>

            {sections.map((section, index) => (
                <Card key={index}>
                    <Text variant="title" tone="accent" style={styles.sectionTitle}>{section.title}</Text>
                    <Text variant="body" tone="secondary" style={styles.sectionBody}>{section.content}</Text>
                </Card>
            ))}

            <View style={styles.footer}>
                <Text variant="meta" tone="muted" style={styles.footerText}>{doc.footer}</Text>
            </View>
        </Screen>
    );
};

const makeStyles = (t) => StyleSheet.create({
    content: { paddingBottom: 120 },
    docHeader: {
        alignItems: 'center',
        paddingVertical: SPACING.LARGE,
        marginHorizontal: SPACING.MEDIUM,
        borderBottomWidth: 1,
        borderBottomColor: t.HAIRLINE,
        marginBottom: SPACING.LARGE,
    },
    docTitle: { marginTop: 12 },
    docVersion: { marginTop: SPACING.SMALL },
    sectionTitle: { marginBottom: 12 },
    // Legal prose needs looser leading than the 20px body default.
    sectionBody: { lineHeight: 22 },
    footer: {
        alignItems: 'center',
        paddingVertical: SPACING.LARGE,
        marginHorizontal: SPACING.MEDIUM,
        borderTopWidth: 1,
        borderTopColor: t.HAIRLINE,
    },
    footerText: {
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default LegalDocScreen;
