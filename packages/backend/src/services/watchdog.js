const { pool } = require('./db');
const { createLogger } = require('./logger');
const merchantAliases = require('../data/merchant_aliases.json');
const merchantCategories = require('../data/merchant_categories.json');
const cancellationGuides = require('../data/cancellation_guides.json');
const { analyzeRecurrence, evidenceLine } = require('./recurrence');
const {
    guideKeyFor, logoColorFor, findGuide, displayNameFor, hasNegotiationScript, buildGuide,
} = require('./merchant_guides');
const { canonicalizeCategory, OTHER_CATEGORY } = require('./category_map');

const logger = createLogger('WATCHDOG');

// Current algorithm version - bump to force re-analysis for all users
// Bumped to 2 for the detector rewrite: getCacheFreshness discards any cache
// written by an older version, so every stored analysis re-runs itself on the
// first read after deploy rather than leaving old false positives on screen.
const ANALYSIS_VERSION = 2;

// Exclusion lists
// 'Payment' and 'Loan' used to be here, which filtered out precisely the
// commitments this feature exists to show -- a car loan and rent are the
// clearest recurring obligations a person has. They now land in the Fixed
// payments section, which carries no action buttons.
//
// 'Transfer' stays: an e-transfer to a person is not a subscription, and the
// merchants that matter (utilities, insurance) arrive under Service.
const EXCLUDED_CATEGORIES = [
    'Food and Drink',
    'Transfer',
];

const EXCLUDED_MERCHANTS = [
    'ATM', 'INTERAC', 'E-TRANSFER', 'PAYROLL',
    'WALMART', 'COSTCO', 'LOBLAWS', 'METRO', 'SOBEYS',
    'NO FRILLS', 'FOOD BASICS', 'FRESHCO',
    'TIM HORTONS', 'STARBUCKS', 'MCDONALD',
];

/** Nominal days per cycle, for the stored interval_days column. */
const FREQUENCY_DAYS = {
    'bi-weekly': 14,
    monthly: 30,
    quarterly: 90,
    'semi-annual': 182,
    annual: 365,
};

/** How many of a cycle fit in a month, for the monthly totals. */
const MONTHLY_EQUIVALENT = {
    'bi-weekly': 2.17,
    monthly: 1,
    quarterly: 1 / 3,
    'semi-annual': 1 / 6,
    annual: 1 / 12,
};

/**
 * The old Watchdog vocabulary, translated into canonical names.
 *
 * Used only when Plaid gives us no category to canonicalise. Mapping on the way
 * out is what keeps merchant_categories.json from being a second vocabulary
 * again -- nothing downstream ever sees 'Streaming' or 'Telecom'.
 */
const LEGACY_CATEGORY_TO_CANONICAL = {
    Streaming: 'Subscriptions',
    Music: 'Subscriptions',
    News: 'Subscriptions',
    Software: 'Software & Tech',
    Telecom: 'Utilities',
    Utilities: 'Utilities',
    Insurance: 'Insurance',
    Health: 'Fitness',
};

// Build a reverse lookup: merchant name -> guide category (internal only)
const merchantToCategoryMap = {};
for (const [category, merchants] of Object.entries(merchantCategories)) {
    for (const merchant of merchants) {
        merchantToCategoryMap[merchant] = category;
    }
}

class WatchdogService {
    /**
     * Normalize a raw merchant/transaction name to a canonical form.
     */
    normalizeMerchantName(rawName) {
        if (!rawName) return null;

        let name = rawName.toUpperCase().trim();

        // Strip common suffixes
        name = name.replace(/(\.COM|\.CA|INC\.?|LLC|LTD|CORP|CO\.)$/g, '');

        // Strip transaction prefixes
        name = name.replace(/^(POS |PREAUTHORIZED |PAD |EFT |RECURRING |MONTHLY |ANNUAL )/g, '');

        // Strip trailing reference numbers
        name = name.replace(/\s*#?\d{4,}$/, '');

        // Strip trailing asterisks and codes (e.g., "SPOTIFY *FAMILY")
        name = name.replace(/\s*\*.*$/, '');

        name = name.trim();

        // Apply known merchant aliases
        return merchantAliases[name] || name;
    }

    /**
     * Check if a transaction should be excluded from subscription detection.
     */
    isExcluded(tx, normalizedName) {
        // Check excluded Plaid categories
        if (tx.category && Array.isArray(tx.category)) {
            for (const cat of tx.category) {
                if (EXCLUDED_CATEGORIES.some(exc => cat && cat.toLowerCase().includes(exc.toLowerCase()))) {
                    return true;
                }
            }
        }

        // Check excluded merchants
        const upperName = (normalizedName || '').toUpperCase();
        for (const exc of EXCLUDED_MERCHANTS) {
            if (upperName.includes(exc)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate days between two date strings.
     */
    daysBetween(dateA, dateB) {
        const a = new Date(dateA);
        const b = new Date(dateB);
        return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
    }

    /**
     * The category the user sees -- canonical, the same vocabulary as every
     * other screen in the app.
     *
     * Watchdog used to keep its own list (Streaming, Music, Telecom, News...)
     * and it disagreed with Analytics on every row that mattered: Netflix was
     * Streaming here and Subscriptions there, GoodLife was Health here and
     * Fitness there, and Rogers, Pioneer, Esso and Intact were all 'Other'
     * because the lookup only knew the 41 display names hardcoded in
     * merchant_categories.json. That is the same defect commit 0d42375 fixed
     * for transactions, in a third vocabulary.
     *
     * That list survives only as a fallback for when Plaid hands us nothing to
     * canonicalise -- and its values are mapped into canonical names on the way
     * out, so it cannot reintroduce a second vocabulary.
     */
    resolveCategory(plaidCategory, normalizedName) {
        const canonical = canonicalizeCategory(plaidCategory);
        if (canonical && canonical !== OTHER_CATEGORY) return canonical;

        const legacy = merchantToCategoryMap[normalizedName];
        return LEGACY_CATEGORY_TO_CANONICAL[legacy] || OTHER_CATEGORY;
    }

    /**
     * Detect recurring obligations from a set of transactions.
     *
     * The gates themselves live in services/recurrence.js, which is pure and
     * has no database import, so they can be asserted directly rather than
     * inspected on a screen. What is left here is the part that genuinely needs
     * the app around it: grouping by merchant, resolving the category, and
     * attaching the guide.
     */
    detectRecurringExpenses(transactions) {
        const today = new Date();
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

        const recentTxns = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= sixMonthsAgo
                && !tx.pending
                && parseFloat(tx.amount) > 0;
        });

        // Group by normalized merchant name.
        const merchantGroups = {};
        for (const tx of recentTxns) {
            const rawName = tx.merchant_name || tx.name;
            const normalized = this.normalizeMerchantName(rawName);
            if (!normalized) continue;
            if (this.isExcluded(tx, normalized)) continue;

            if (!merchantGroups[normalized]) merchantGroups[normalized] = [];
            merchantGroups[normalized].push(tx);
        }

        const results = [];
        for (const [merchant, txns] of Object.entries(merchantGroups)) {
            // The most recent transaction carries the category we classify on:
            // Plaid re-categorises merchants over time and the newest label is
            // the one the rest of the app is showing for this merchant today.
            const latest = txns.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b));
            const category = this.resolveCategory(latest.category, merchant);

            const analysis = analyzeRecurrence(txns, { merchantCategory: category });
            if (!analysis.isRecurring) continue;

            results.push({
                merchantName: merchant,
                rawNames: [...new Set(txns.map(t => t.merchant_name || t.name))],
                category,
                expenseClass: analysis.expenseClass,
                guideKey: guideKeyFor(merchant),
                evidence: evidenceLine(analysis),
                logoColor: logoColorFor(merchant),
                frequency: analysis.frequency,
                intervalDays: FREQUENCY_DAYS[analysis.frequency] || null,
                amount: analysis.amount,
                amountHistory: analysis.amountHistory,
                confidence: analysis.confidence,
                sameAmountRatio: analysis.sameAmountRatio,
                dayOfMonth: analysis.dayOfMonth,
                firstSeen: analysis.firstSeen,
                lastSeen: analysis.lastSeen,
                nextExpected: analysis.nextExpected,
                transactionIds: txns
                    .map(t => t.transaction_id || t.plaid_transaction_id)
                    .filter(Boolean),
            });
        }

        return results;
    }

    /**
     * Generate smart alerts from detected expenses.
     */
    generateAlerts(expenses) {
        const alerts = [];

        // 1. PRICE INCREASE DETECTION
        for (const expense of expenses) {
            if (expense.amountHistory && expense.amountHistory.length >= 2) {
                const previous = expense.amountHistory[expense.amountHistory.length - 2];
                const current = expense.amountHistory[expense.amountHistory.length - 1];
                if (current > previous) {
                    const pctIncrease = ((current - previous) / previous) * 100;
                    if (pctIncrease >= 5) {
                        alerts.push({
                            type: 'price_increase',
                            merchantName: expense.merchantName,
                            title: `${expense.merchantName} price increased`,
                            message: `${expense.merchantName} went from $${previous.toFixed(2)} to $${current.toFixed(2)} (${pctIncrease.toFixed(0)}% increase)`,
                            severity: pctIncrease >= 20 ? 'critical' : 'warning',
                            data: { previous, current, pctIncrease },
                        });
                    }
                }
            }
        }

        // 2. DUPLICATE CATEGORY DETECTION
        const categoryGroups = {};
        for (const expense of expenses) {
            if (!categoryGroups[expense.category]) categoryGroups[expense.category] = [];
            categoryGroups[expense.category].push(expense);
        }
        for (const [category, items] of Object.entries(categoryGroups)) {
            if (items.length >= 3 && ['Streaming', 'Music', 'Software'].includes(category)) {
                const totalCost = items.reduce((sum, i) => sum + i.amount, 0);
                alerts.push({
                    type: 'duplicate_category',
                    title: `${items.length} ${category} services`,
                    message: `You're spending $${totalCost.toFixed(2)}/mo on ${items.map(i => i.merchantName).join(', ')}. Consider consolidating.`,
                    severity: 'info',
                    data: { category, services: items.map(i => i.merchantName), totalCost },
                });
            }
        }

        // 3. NEW SUBSCRIPTION DETECTION
        const today = new Date();
        for (const expense of expenses) {
            const daysSinceFirstSeen = this.daysBetween(expense.firstSeen, today.toISOString().split('T')[0]);
            if (daysSinceFirstSeen <= 45 && expense.amountHistory && expense.amountHistory.length <= 2) {
                alerts.push({
                    type: 'new_subscription',
                    merchantName: expense.merchantName,
                    title: `New: ${expense.merchantName}`,
                    message: `${expense.merchantName} ($${expense.amount.toFixed(2)}/mo) was first detected ${daysSinceFirstSeen} days ago`,
                    severity: 'info',
                    data: { firstSeen: expense.firstSeen },
                });
            }
        }

        // 4. ANNUAL SAVINGS OPPORTUNITY
        for (const expense of expenses) {
            if (expense.frequency === 'monthly') {
                const guide = findGuide(expense.merchantName);
                if (guide?.annualOption) {
                    const monthlySavings = expense.amount - guide.annualOption.monthlyEquivalent;
                    if (monthlySavings > 0) {
                        alerts.push({
                            type: 'annual_savings',
                            merchantName: expense.merchantName,
                            title: `Save on ${expense.merchantName}`,
                            message: `Switch to annual billing and save $${(monthlySavings * 12).toFixed(2)}/year`,
                            severity: 'info',
                            data: { currentMonthly: expense.amount, annualEquivalent: guide.annualOption.monthlyEquivalent },
                        });
                    }
                }
            }
        }

        return alerts;
    }

    /**
     * Calculate potential monthly savings based on actions and alerts.
     */
    calculatePotentialSavings(expenses, alerts) {
        let savings = 0;

        // Expenses flagged as "stop"
        for (const expense of expenses) {
            if (expense.action === 'stop' || expense.status === 'cancelling') {
                savings += expense.amount;
            }
        }

        // Negotiation savings (estimated low end of discount range)
        for (const expense of expenses) {
            if (expense.action === 'negotiate' || expense.status === 'negotiating') {
                const guide = findGuide(expense.merchantName);
                if (guide?.negotiation?.expectedDiscount) {
                    const match = guide.negotiation.expectedDiscount.match(/(\d+)/);
                    const discountPct = match ? parseInt(match[1], 10) / 100 : 0.15;
                    savings += expense.amount * discountPct;
                }
            }
        }

        // Annual billing savings from alerts
        for (const alert of alerts) {
            if (alert.type === 'annual_savings' && alert.data) {
                savings += alert.data.currentMonthly - alert.data.annualEquivalent;
            }
        }

        return Math.round(savings * 100) / 100;
    }

    /**
     * Determine auto-suggested action for an expense.
     */
    suggestAction(expense, alerts) {
        // The user already answered. "Kept. We'll stop flagging it." is a
        // promise the copy makes, and re-suggesting on the next analysis breaks
        // it -- which is what happened to every utility with a guide, because
        // 'keep' used to be stored as 'active' and 'active' reads as "no answer".
        if (expense.action === 'keep') return 'keep';

        // Check for charge after cancel
        if (expense.status === 'cancelling') {
            return 'stop';
        }

        // Check for large price increase
        const priceAlert = alerts.find(a => a.type === 'price_increase' && a.merchantName === expense.merchantName && a.data?.pctIncrease >= 20);
        if (priceAlert) {
            return 'negotiate';
        }

        // Telecom/Utility with known negotiation path
        // Canonical categories now, so a phone bill is 'Utilities' here exactly
        // as it is on Analytics.
        if (expense.category === 'Utilities' && hasNegotiationScript(expense.merchantName)) {
            return 'negotiate';
        }

        // No charges in 60+ days for a monthly subscription
        if (expense.frequency === 'monthly') {
            const daysSinceLastSeen = this.daysBetween(expense.lastSeen, new Date().toISOString().split('T')[0]);
            if (daysSinceLastSeen >= 60) {
                return 'stop';
            }
        }

        return null;
    }

    /**
     * Format a date string as "MMM DD" for the mobile UI.
     */
    formatDueDate(dateString) {
        if (!dateString) return null;
        const date = new Date(dateString);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    /**
     * Check if the analysis cache is still fresh for a user.
     * Returns the cache row if fresh, null if stale.
     */
    async getCacheFreshness(userId) {
        try {
            const cacheResult = await pool.query(
                `SELECT wac.*,
                    (SELECT MAX(t.date) FROM transactions t WHERE t.user_id = $1) as latest_tx_date,
                    (SELECT COUNT(*) FROM transactions t WHERE t.user_id = $1) as current_tx_count
                 FROM watchdog_analysis_cache wac
                 WHERE wac.user_id = $1`,
                [userId]
            );

            if (cacheResult.rows.length === 0) return null;

            const cache = cacheResult.rows[0];

            // Check algorithm version
            if (cache.analysis_version < ANALYSIS_VERSION) return null;

            // Check if new transactions have arrived
            if (cache.latest_tx_date && cache.last_transaction_date) {
                if (new Date(cache.latest_tx_date) > new Date(cache.last_transaction_date)) return null;
            }

            // Check if transaction count changed
            if (cache.current_tx_count !== cache.transaction_count) return null;

            // Cache is fresh if analyzed within last 6 hours
            const hoursSince = (Date.now() - new Date(cache.last_analyzed_at).getTime()) / (1000 * 60 * 60);
            if (hoursSince > 6) return null;

            return cache;
        } catch (error) {
            logger.error('Error checking cache freshness', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Main entry point: analyze for a user, using cache when possible.
     */
    async analyzeForUser(userId, forceRefresh = false) {
        const ctx = { userId };

        // Check cache unless force refresh
        if (!forceRefresh) {
            const cache = await this.getCacheFreshness(userId);
            if (cache) {
                logger.debug('Returning cached watchdog analysis', ctx);
                return await this.loadFromDatabase(userId, true, cache.last_analyzed_at);
            }
        }

        logger.info('Running fresh watchdog analysis', ctx);

        // Fetch transactions from database
        const txResult = await pool.query(
            `SELECT t.plaid_transaction_id as transaction_id, t.name, t.merchant_name,
                    t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending,
                    t.iso_currency_code
             FROM transactions t
             WHERE t.user_id = $1
             ORDER BY t.date DESC`,
            [userId]
        );

        const transactions = txResult.rows;

        if (transactions.length === 0) {
            return {
                expenses: [],
                analysis: {
                    total_monthly: 0,
                    total_annual: 0,
                    potential_savings: 0,
                    flags_found: 0,
                    category_breakdown: {},
                },
                alerts: [],
                categories: ['All'],
                needs_transaction_history: true,
            };
        }

        // Check if user has at least 60 days of history
        const dates = transactions.map(t => new Date(t.date));
        const oldestDate = new Date(Math.min(...dates));
        const newestDate = new Date(Math.max(...dates));
        const historyDays = this.daysBetween(oldestDate.toISOString(), newestDate.toISOString());

        // Run detection
        const detected = this.detectRecurringExpenses(transactions);

        // Generate alerts
        const alerts = this.generateAlerts(detected);

        // Load existing user actions from database
        const existingExpenses = await pool.query(
            `SELECT id, merchant_name, status, action, snoozed_until FROM recurring_expenses WHERE user_id = $1`,
            [userId]
        );
        const existingMap = {};
        for (const row of existingExpenses.rows) {
            existingMap[row.merchant_name] = row;
        }

        // Upsert detected expenses into recurring_expenses table
        const upsertedExpenses = [];
        for (const expense of detected) {
            const existing = existingMap[expense.merchantName];

            // Preserve user-set status and action if they exist
            let status = existing?.status || 'active';
            let action = existing?.action || null;

            // If snoozed and snooze has expired, revert to active
            if (status === 'snoozed' && existing?.snoozed_until) {
                if (new Date(existing.snoozed_until) < new Date()) {
                    status = 'active';
                    action = null;
                }
            }

            // Auto-suggest action if user hasn't set one
            if (!action || action === 'active') {
                action = this.suggestAction({ ...expense, status }, alerts);
            }

            // Check for charge_after_cancel
            if (status === 'cancelling') {
                const cancelAction = await pool.query(
                    `SELECT created_at FROM subscription_actions
                     WHERE recurring_expense_id = $1 AND action = 'stop'
                     ORDER BY created_at DESC LIMIT 1`,
                    [existing?.id]
                );
                if (cancelAction.rows.length > 0) {
                    const cancelDate = cancelAction.rows[0].created_at;
                    if (new Date(expense.lastSeen) > new Date(cancelDate)) {
                        alerts.push({
                            type: 'charge_after_cancel',
                            merchantName: expense.merchantName,
                            title: `${expense.merchantName} still charging`,
                            message: `You marked ${expense.merchantName} for cancellation, but a charge of $${expense.amount.toFixed(2)} was detected on ${expense.lastSeen}`,
                            severity: 'critical',
                            data: { chargeDate: expense.lastSeen, amount: expense.amount },
                        });
                    }
                }
            }

            const upsertResult = await pool.query(
                `INSERT INTO recurring_expenses (
                    user_id, merchant_name, merchant_raw_names, amount, amount_history, currency,
                    frequency, interval_days, confidence, category, status, action,
                    first_seen, last_seen, next_expected, flags, plaid_transaction_ids, detection_metadata,
                    expense_class, guide_key, evidence, day_of_month,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
                ON CONFLICT (user_id, merchant_name) DO UPDATE SET
                    merchant_raw_names = $3,
                    amount = $4,
                    amount_history = $5,
                    frequency = $7,
                    interval_days = $8,
                    confidence = $9,
                    category = $10,
                    status = CASE
                        WHEN recurring_expenses.status IN ('cancelling', 'cancelled', 'snoozed', 'negotiating')
                        THEN recurring_expenses.status
                        ELSE $11
                    END,
                    action = CASE
                        WHEN recurring_expenses.action IS NOT NULL AND recurring_expenses.action != 'active'
                        THEN recurring_expenses.action
                        ELSE $12
                    END,
                    last_seen = $14,
                    next_expected = $15,
                    flags = $16,
                    plaid_transaction_ids = $17,
                    detection_metadata = $18,
                    expense_class = $19,
                    guide_key = $20,
                    evidence = $21,
                    day_of_month = $22,
                    updated_at = NOW()
                RETURNING *`,
                [
                    userId,
                    expense.merchantName,
                    expense.rawNames,
                    expense.amount,
                    expense.amountHistory,
                    'CAD',
                    expense.frequency,
                    expense.intervalDays,
                    expense.confidence,
                    expense.category,
                    status,
                    action,
                    expense.firstSeen,
                    expense.lastSeen,
                    expense.nextExpected,
                    JSON.stringify(this.buildFlags(expense, alerts)),
                    expense.transactionIds,
                    JSON.stringify({ sameAmountRatio: expense.sameAmountRatio }),
                    expense.expenseClass,
                    expense.guideKey,
                    expense.evidence,
                    expense.dayOfMonth,
                ]
            );

            upsertedExpenses.push(upsertResult.rows[0]);
        }

        // Persist alerts
        await this.persistAlerts(userId, alerts, upsertedExpenses);

        // Update cache
        await pool.query(
            `INSERT INTO watchdog_analysis_cache (user_id, last_analyzed_at, last_transaction_date, transaction_count, analysis_version, updated_at)
             VALUES ($1, NOW(), $2, $3, $4, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                last_analyzed_at = NOW(),
                last_transaction_date = $2,
                transaction_count = $3,
                analysis_version = $4,
                updated_at = NOW()`,
            [userId, newestDate.toISOString().split('T')[0], transactions.length, ANALYSIS_VERSION]
        );

        return await this.loadFromDatabase(userId, false, new Date().toISOString());
    }

    /**
     * Build flags array for an expense based on alerts.
     */
    buildFlags(expense, alerts) {
        const flags = [];
        for (const alert of alerts) {
            if (alert.merchantName === expense.merchantName) {
                flags.push({
                    type: alert.type,
                    detail: alert.message,
                    severity: alert.severity,
                });
            }
        }
        return flags;
    }

    /**
     * Persist alerts to the subscription_alerts table with deduplication.
     */
    async persistAlerts(userId, alerts, expenses) {
        const expenseMap = {};
        for (const exp of expenses) {
            expenseMap[exp.merchant_name] = exp.id;
        }

        for (const alert of alerts) {
            const expenseId = alert.merchantName ? expenseMap[alert.merchantName] : null;

            // Check for existing non-dismissed alert of same type
            const existing = await pool.query(
                `SELECT id FROM subscription_alerts
                 WHERE user_id = $1
                   AND alert_type = $2
                   AND ($3::INTEGER IS NULL OR recurring_expense_id = $3)
                   AND is_dismissed = false`,
                [userId, alert.type, expenseId]
            );

            if (existing.rows.length > 0) {
                // Update existing alert
                await pool.query(
                    `UPDATE subscription_alerts SET title = $1, message = $2, severity = $3, data = $4
                     WHERE id = $5`,
                    [alert.title, alert.message, alert.severity, JSON.stringify(alert.data || {}), existing.rows[0].id]
                );
            } else {
                // Insert new alert
                await pool.query(
                    `INSERT INTO subscription_alerts (user_id, recurring_expense_id, alert_type, title, message, severity, data)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [userId, expenseId, alert.type, alert.title, alert.message, alert.severity, JSON.stringify(alert.data || {})]
                );
            }
        }
    }

    /**
     * Load watchdog data from database tables (after analysis or from cache).
     */
    async loadFromDatabase(userId, cached, lastAnalyzedAt) {
        // Load expenses (exclude snoozed whose snooze hasn't expired)
        const expensesResult = await pool.query(
            `SELECT * FROM recurring_expenses
             WHERE user_id = $1
               AND (status != 'snoozed' OR snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE)
             ORDER BY
                CASE expense_class
                    WHEN 'subscription' THEN 1
                    WHEN 'bill' THEN 2
                    ELSE 3
                END,
                amount DESC`,
            [userId]
        );

        const expenses = expensesResult.rows.map(row => ({
            id: row.id,
            // merchant_name is the upsert key and stays as the bank sent it;
            // this is the presentable form.
            name: displayNameFor(row.merchant_name),
            amount: parseFloat(row.amount),
            currency: row.currency,
            frequency: row.frequency,
            category: row.category,
            expenseClass: row.expense_class || 'subscription',
            evidence: row.evidence || null,
            dayOfMonth: row.day_of_month || null,
            guideKey: row.guide_key || null,
            hasNegotiation: hasNegotiationScript(row.merchant_name),
            confidence: row.confidence,
            status: row.status,
            // 'keep' is stored so suggestAction can tell an answer from silence,
            // but it reaches the device as 'active' -- the shipped build renders
            // the Active chip off that value and there is no OTA to update it.
            action: row.action === 'keep' ? 'active' : (row.action || null),
            answered: row.action === 'keep',
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            nextExpected: row.next_expected,
            dueDate: this.formatDueDate(row.next_expected),
            logoColor: logoColorFor(row.merchant_name),
            flags: row.flags || [],
            amountHistory: row.amount_history || [],
        }));

        // Load active alerts
        const alertsResult = await pool.query(
            `SELECT id, alert_type as type, title, message, severity, data
             FROM subscription_alerts
             WHERE user_id = $1 AND is_dismissed = false
             ORDER BY
                CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                created_at DESC`,
            [userId]
        );

        const alerts = alertsResult.rows;

        // Calculate analysis summary
        const activeExpenses = expenses.filter(e => e.status !== 'cancelled');
        const totalMonthly = activeExpenses.reduce(
            (sum, e) => sum + e.amount * (MONTHLY_EQUIVALENT[e.frequency] ?? 1),
            0
        );

        const potentialSavings = this.calculatePotentialSavings(expenses, alerts);
        const flagsFound = alerts.filter(a => a.severity === 'warning' || a.severity === 'critical').length;

        // Category breakdown
        const categoryBreakdown = {};
        for (const expense of activeExpenses) {
            if (!categoryBreakdown[expense.category]) categoryBreakdown[expense.category] = 0;
            const monthlyEquiv = expense.amount * (MONTHLY_EQUIVALENT[expense.frequency] ?? 1);
            categoryBreakdown[expense.category] += Math.round(monthlyEquiv * 100) / 100;
        }

        // Build categories list from detected expenses
        const detectedCategories = [...new Set(expenses.map(e => e.category))].sort();
        const categories = ['All', ...detectedCategories];

        // Transaction count for meta
        const txCountResult = await pool.query(
            `SELECT COUNT(*) as count FROM transactions WHERE user_id = $1`,
            [userId]
        );

        return {
            expenses,
            analysis: {
                total_monthly: Math.round(totalMonthly * 100) / 100,
                total_annual: Math.round(totalMonthly * 12 * 100) / 100,
                potential_savings: potentialSavings,
                flags_found: flagsFound,
                category_breakdown: categoryBreakdown,
            },
            alerts,
            categories,
            needs_transaction_history: expenses.length === 0,
            meta: {
                cached,
                lastAnalyzedAt,
                transactionsAnalyzed: parseInt(txCountResult.rows[0].count, 10),
            },
        };
    }

    /**
     * Record a user action on an expense.
     * Returns the updated expense and optional guide data.
     */
    async recordAction(userId, expenseId, action, notes = null, snoozeUntil = null) {
        // Verify expense belongs to user
        const expenseResult = await pool.query(
            `SELECT * FROM recurring_expenses WHERE id = $1 AND user_id = $2`,
            [expenseId, userId]
        );

        if (expenseResult.rows.length === 0) {
            return null;
        }

        const expense = expenseResult.rows[0];
        const previousStatus = expense.status;

        // Determine new status based on action
        let newStatus;
        let newAction;
        switch (action) {
            case 'negotiate':
                newStatus = 'negotiating';
                newAction = 'negotiate';
                break;
            case 'stop':
                newStatus = 'cancelling';
                newAction = 'stop';
                break;
            case 'keep':
                // Stored as 'keep', not 'active'. analyzeForUser treats a null
                // or 'active' action as "no answer yet" and overwrites it with a
                // fresh suggestion, so storing 'active' here meant a kept row
                // came straight back on the next refresh.
                newStatus = 'active';
                newAction = 'keep';
                break;
            case 'snooze':
                newStatus = 'snoozed';
                newAction = null;
                break;
            case 'undo':
                newStatus = 'active';
                newAction = null;
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        // Update the expense
        await pool.query(
            `UPDATE recurring_expenses
             SET status = $1, action = $2, snoozed_until = $3, updated_at = NOW()
             WHERE id = $4`,
            [newStatus, newAction, snoozeUntil, expenseId]
        );

        // Record in audit trail
        await pool.query(
            `INSERT INTO subscription_actions (user_id, recurring_expense_id, action, previous_status, notes, snooze_until)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, expenseId, action, previousStatus, notes, snoozeUntil]
        );

        // A guide is always produced for a cancel. It used to be null for any
        // merchant outside the twelve in cancellation_guides.json -- and, because
        // the file was keyed on a display name while the detector emits an
        // uppercase one, for five of those twelve as well. The mobile sheet only
        // opens `if (result?.data?.guide)`, so the button flipped a hidden status
        // and nothing appeared on screen.
        const guide = buildGuide({
            merchantName: expense.merchant_name,
            displayName: displayNameFor(expense.merchant_name),
            action,
            category: expense.category,
        });

        return {
            expenseId,
            newStatus,
            action,
            guide,
        };
    }

    /**
     * Get summary stats for dashboard widget.
     */
    async getSummary(userId) {
        const result = await pool.query(
            `SELECT
                COUNT(*) as subscription_count,
                COALESCE(SUM(amount), 0) as total_monthly
             FROM recurring_expenses
             WHERE user_id = $1 AND status NOT IN ('cancelled', 'snoozed')`,
            [userId]
        );

        const flagsResult = await pool.query(
            `SELECT COUNT(*) as count FROM subscription_alerts
             WHERE user_id = $1 AND is_dismissed = false AND severity IN ('warning', 'critical')`,
            [userId]
        );

        // Get top flag
        const topFlagResult = await pool.query(
            `SELECT sa.title as reason, sa.severity, re.merchant_name as name, re.amount
             FROM subscription_alerts sa
             LEFT JOIN recurring_expenses re ON sa.recurring_expense_id = re.id
             WHERE sa.user_id = $1 AND sa.is_dismissed = false
             ORDER BY CASE sa.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
             LIMIT 1`,
            [userId]
        );

        const stats = result.rows[0];
        const flagsCount = parseInt(flagsResult.rows[0].count, 10);
        const topFlag = topFlagResult.rows[0] || null;

        // Calculate potential savings
        const savingsResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as savings
             FROM recurring_expenses
             WHERE user_id = $1 AND action IN ('stop', 'negotiate')`,
            [userId]
        );

        return {
            total_monthly: parseFloat(stats.total_monthly),
            subscription_count: parseInt(stats.subscription_count, 10),
            flags_found: flagsCount,
            potential_savings: parseFloat(savingsResult.rows[0].savings),
            top_flag: topFlag ? {
                name: topFlag.name,
                reason: topFlag.reason,
                amount: parseFloat(topFlag.amount),
            } : null,
        };
    }

    /**
     * Invalidate the analysis cache for a user (called after transaction sync).
     */
    async invalidateCache(userId) {
        await pool.query(
            `DELETE FROM watchdog_analysis_cache WHERE user_id = $1`,
            [userId]
        );
        logger.debug('Watchdog cache invalidated', { userId });
    }

    /**
     * Legacy method for backward compatibility with transactions route.
     * Returns a simple leakage analysis.
     */
    analyze(transactions) {
        const detected = this.detectRecurringExpenses(transactions);
        const alerts = this.generateAlerts(detected);

        const leakage = {
            subscriptions: detected.map(d => ({
                name: d.merchantName,
                amount: d.amount,
                category: d.category,
                frequency: d.frequency,
            })),
            fees: [],
            total_monthly_leakage: detected.reduce((sum, d) => sum + d.amount, 0),
        };

        return leakage;
    }
}

module.exports = new WatchdogService();
