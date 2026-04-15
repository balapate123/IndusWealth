const { pool } = require('./db');
const { createLogger } = require('./logger');
const merchantAliases = require('../data/merchant_aliases.json');
const merchantCategories = require('../data/merchant_categories.json');
const cancellationGuides = require('../data/cancellation_guides.json');

const logger = createLogger('WATCHDOG');

// Current algorithm version - bump to force re-analysis for all users
const ANALYSIS_VERSION = 1;

// Exclusion lists
const EXCLUDED_CATEGORIES = [
    'Food and Drink',
    'Transfer',
    'Payment',
    'Loan',
];

const EXCLUDED_MERCHANTS = [
    'ATM', 'INTERAC', 'E-TRANSFER', 'PAYROLL',
    'WALMART', 'COSTCO', 'LOBLAWS', 'METRO', 'SOBEYS',
    'NO FRILLS', 'FOOD BASICS', 'FRESHCO',
    'TIM HORTONS', 'STARBUCKS', 'MCDONALD',
];

// Build a reverse lookup: merchant name -> category
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
     * Determine the category for a normalized merchant name.
     */
    classifyCategory(merchantName) {
        return merchantToCategoryMap[merchantName] || 'Other';
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
     * Classify frequency from average interval in days.
     * Returns frequency string or 'irregular' if no pattern matches.
     */
    classifyFrequency(avgInterval) {
        if (avgInterval >= 0 && avgInterval <= 10) return 'weekly';
        if (avgInterval > 10 && avgInterval <= 18) return 'bi-weekly';
        if (avgInterval >= 25 && avgInterval <= 35) return 'monthly';
        if (avgInterval >= 80 && avgInterval <= 100) return 'quarterly';
        if (avgInterval >= 340 && avgInterval <= 395) return 'annual';
        return 'irregular';
    }

    /**
     * Get the expected interval in days for a frequency.
     */
    expectedIntervalDays(frequency) {
        switch (frequency) {
            case 'weekly': return 7;
            case 'bi-weekly': return 14;
            case 'monthly': return 30;
            case 'quarterly': return 90;
            case 'annual': return 365;
            default: return 30;
        }
    }

    /**
     * Calculate standard deviation of an array of numbers.
     */
    standardDeviation(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const sqDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
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
     * Analyze recurrence pattern for a group of transactions from the same merchant.
     */
    analyzeRecurrencePattern(transactions) {
        // Sort chronologically
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const amounts = sorted.map(t => parseFloat(t.amount));
        const dates = sorted.map(t => t.date);

        if (dates.length < 2) {
            return { isRecurring: false };
        }

        // Calculate intervals between consecutive charges
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
            intervals.push(this.daysBetween(dates[i - 1], dates[i]));
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const intervalStdDev = this.standardDeviation(intervals);

        // Determine frequency
        const frequency = this.classifyFrequency(avgInterval);

        if (frequency === 'irregular') {
            return { isRecurring: false };
        }

        // Calculate amount consistency
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariation = Math.max(...amounts) - Math.min(...amounts);
        const amountVariationPct = avgAmount > 0 ? amountVariation / avgAmount : 1;

        // Confidence scoring
        let amountScore = 'low';
        if (amountVariationPct < 0.05) amountScore = 'high';
        else if (amountVariationPct < 0.15) amountScore = 'medium';

        let intervalScore = 'low';
        if (intervalStdDev < 3) intervalScore = 'high';
        else if (intervalStdDev < 7) intervalScore = 'medium';

        let occurrenceScore = 'low';
        if (sorted.length >= 4) occurrenceScore = 'high';
        else if (sorted.length >= 3) occurrenceScore = 'medium';

        // Check if merchant has a known alias (boosts confidence)
        const rawName = (sorted[0].merchant_name || sorted[0].name || '').toUpperCase().trim();
        const hasKnownAlias = !!merchantAliases[rawName];

        // Final confidence: all high = high, any low caps at medium
        let confidence = 'low';
        const scores = [amountScore, intervalScore, occurrenceScore];
        if (scores.every(s => s === 'high') || (hasKnownAlias && scores.filter(s => s === 'high').length >= 2)) {
            confidence = 'high';
        } else if (!scores.includes('low') || (hasKnownAlias && scores.filter(s => s !== 'low').length >= 2)) {
            confidence = 'medium';
        }

        // Predict next charge date
        const lastDate = new Date(dates[dates.length - 1]);
        const nextExpected = new Date(lastDate);
        nextExpected.setDate(nextExpected.getDate() + this.expectedIntervalDays(frequency));

        return {
            isRecurring: true,
            frequency,
            intervalDays: Math.round(avgInterval),
            amount: amounts[amounts.length - 1],
            amountHistory: amounts.slice(-6),
            confidence,
            firstSeen: dates[0],
            lastSeen: dates[dates.length - 1],
            nextExpected: nextExpected.toISOString().split('T')[0],
            transactionIds: sorted.map(t => t.transaction_id || t.plaid_transaction_id).filter(Boolean),
        };
    }

    /**
     * Detect recurring expenses from a set of transactions.
     */
    detectRecurringExpenses(transactions) {
        const today = new Date();
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

        // Step 1: Filter to last 180 days, exclude pending, only charges (positive amounts)
        const recentTxns = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= sixMonthsAgo
                && !tx.pending
                && parseFloat(tx.amount) > 0;
        });

        // Step 2: Group by normalized merchant name
        const merchantGroups = {};
        for (const tx of recentTxns) {
            const rawName = tx.merchant_name || tx.name;
            const normalized = this.normalizeMerchantName(rawName);
            if (!normalized) continue;

            // Check exclusions
            if (this.isExcluded(tx, normalized)) continue;

            if (!merchantGroups[normalized]) {
                merchantGroups[normalized] = [];
            }
            merchantGroups[normalized].push(tx);
        }

        // Step 3: Filter to merchants with 2+ charges
        const results = [];
        for (const [merchant, txns] of Object.entries(merchantGroups)) {
            if (txns.length < 2) continue;

            // Step 4: Analyze each candidate
            const analysis = this.analyzeRecurrencePattern(txns);
            if (analysis.isRecurring) {
                const category = this.classifyCategory(merchant);
                const guide = cancellationGuides[merchant];

                results.push({
                    merchantName: merchant,
                    rawNames: [...new Set(txns.map(t => t.merchant_name || t.name))],
                    category,
                    logoColor: guide?.logoColor || null,
                    ...analysis,
                });
            }
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
                const guide = cancellationGuides[expense.merchantName];
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
                const guide = cancellationGuides[expense.merchantName];
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
        if (['Telecom', 'Utilities'].includes(expense.category) && cancellationGuides[expense.merchantName]?.negotiation) {
            return 'negotiate';
        }

        // No charges in 60+ days for a monthly subscription
        if (expense.frequency === 'monthly') {
            const daysSinceLastSeen = this.daysBetween(expense.lastSeen, new Date().toISOString().split('T')[0]);
            if (daysSinceLastSeen >= 60) {
                return 'stop';
            }
        }

        return 'active';
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
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
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
                    JSON.stringify({ intervalStdDev: expense.intervalStdDev }),
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
             ORDER BY amount DESC`,
            [userId]
        );

        const expenses = expensesResult.rows.map(row => ({
            id: row.id,
            name: row.merchant_name,
            amount: parseFloat(row.amount),
            currency: row.currency,
            frequency: row.frequency,
            category: row.category,
            confidence: row.confidence,
            status: row.status,
            action: row.action || 'active',
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            nextExpected: row.next_expected,
            dueDate: this.formatDueDate(row.next_expected),
            logoColor: cancellationGuides[row.merchant_name]?.logoColor || null,
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
        const totalMonthly = activeExpenses.reduce((sum, e) => {
            switch (e.frequency) {
                case 'weekly': return sum + e.amount * 4.33;
                case 'bi-weekly': return sum + e.amount * 2.17;
                case 'monthly': return sum + e.amount;
                case 'quarterly': return sum + e.amount / 3;
                case 'annual': return sum + e.amount / 12;
                default: return sum + e.amount;
            }
        }, 0);

        const potentialSavings = this.calculatePotentialSavings(expenses, alerts);
        const flagsFound = alerts.filter(a => a.severity === 'warning' || a.severity === 'critical').length;

        // Category breakdown
        const categoryBreakdown = {};
        for (const expense of activeExpenses) {
            if (!categoryBreakdown[expense.category]) categoryBreakdown[expense.category] = 0;
            let monthlyEquiv = expense.amount;
            if (expense.frequency === 'weekly') monthlyEquiv = expense.amount * 4.33;
            else if (expense.frequency === 'bi-weekly') monthlyEquiv = expense.amount * 2.17;
            else if (expense.frequency === 'quarterly') monthlyEquiv = expense.amount / 3;
            else if (expense.frequency === 'annual') monthlyEquiv = expense.amount / 12;
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
                newStatus = 'active';
                newAction = 'active';
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

        // Get guide data if applicable
        let guide = null;
        const merchantName = expense.merchant_name;
        const guideData = cancellationGuides[merchantName];

        if (action === 'stop' && guideData) {
            guide = {
                merchantName: guideData.displayName,
                steps: guideData.cancellation.steps,
                directUrl: guideData.cancellation.url,
                estimatedTime: `${guideData.cancellation.estimatedMinutes} minutes`,
                tips: guideData.cancellation.tips,
                canPause: guideData.cancellation.canPause,
                pauseNote: guideData.cancellation.pauseNote,
                alternatives: guideData.alternatives,
                negotiationScript: null,
            };
        } else if (action === 'negotiate' && guideData?.negotiation) {
            guide = {
                merchantName: guideData.displayName,
                steps: guideData.cancellation.steps,
                directUrl: guideData.cancellation.url,
                estimatedTime: `${guideData.cancellation.estimatedMinutes} minutes`,
                tips: guideData.negotiation.tips,
                canPause: false,
                pauseNote: null,
                alternatives: guideData.alternatives,
                negotiationScript: guideData.negotiation.script,
                retentionNumber: guideData.negotiation.retentionNumber,
                expectedDiscount: guideData.negotiation.expectedDiscount,
                bestTimeToCall: guideData.negotiation.bestTimeToCall,
            };
        }

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
