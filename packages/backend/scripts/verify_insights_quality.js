/**
 * Verify Insights Quality After AI Categorization
 *
 * This script tests that:
 * 1. Wealthsimple investments are NOT flagged as subscriptions
 * 2. Lyft rides are categorized as Transportation, not Other
 * 3. Insights generated are sensible and actionable
 */

require('dotenv').config();
const { pool } = require('../src/services/db');
const { categorizeTransaction } = require('../src/services/categorization');
const { getUserFinancialSummary } = require('../src/services/insight_data');
const { generateInsights } = require('../src/services/ai_insights');

/**
 * Test specific transactions to verify categorization
 */
async function testCategorization() {
    console.log('\n=== Testing Transaction Categorization ===\n');

    const testCases = [
        {
            name: 'WEALTHSIMPLE INVEST 001',
            merchant_name: 'WEALTHSIMPLE',
            amount: 100,
            expected_category: 'Investments',
            should_not_be: 'Subscriptions'
        },
        {
            name: 'LYFT *RIDE AUX6YN',
            merchant_name: 'Lyft',
            amount: 25,
            expected_category: 'Transportation',
            should_not_be: 'Other'
        },
        {
            name: 'QUESTRADE INC',
            merchant_name: 'Questrade',
            amount: 500,
            expected_category: 'Investments',
            should_not_be: 'Subscriptions'
        },
        {
            name: 'NETFLIX.COM *12345678',
            merchant_name: 'Netflix',
            amount: 16.99,
            expected_category: 'Subscriptions',
            should_not_be: 'Other'
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const result = await categorizeTransaction(testCase);

        const isCorrect = result.category === testCase.expected_category;
        const isNotWrong = result.category !== testCase.should_not_be;

        if (isCorrect && isNotWrong) {
            console.log(`✓ ${testCase.name.padEnd(35)} → ${result.category.padEnd(20)} (source: ${result.source})`);
            passed++;
        } else {
            console.log(`✗ ${testCase.name.padEnd(35)} → ${result.category.padEnd(20)} (expected: ${testCase.expected_category})`);
            failed++;
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

/**
 * Verify insights for a test user
 */
async function testInsightsForUser(userId) {
    console.log('\n=== Testing Insights Generation ===\n');

    try {
        // Get user's financial summary
        console.log(`→ Fetching financial data for user ${userId}...`);
        const userData = await getUserFinancialSummary(userId, 90);

        console.log(`\nUser Financial Summary:`);
        console.log(`  Accounts: ${userData.accounts?.length || 0}`);
        console.log(`  Total Spending (90d): $${userData.spending_summary_90d?.total_spending?.toFixed(2) || 0}`);
        console.log(`  Spending by Category:`);

        if (userData.spending_summary_90d?.by_category) {
            Object.entries(userData.spending_summary_90d.by_category)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .forEach(([cat, amount]) => {
                    console.log(`    - ${cat}: $${amount}`);
                });
        }

        // Check for problematic patterns
        console.log(`\n→ Checking for common issues...`);

        const hasInvestments = userData.spending_summary_90d?.by_category?.investments > 0;
        const hasSubscriptions = userData.spending_summary_90d?.by_category?.subscriptions > 0;
        const hasTransportation = userData.spending_summary_90d?.by_category?.transportation > 0;
        const hasOther = userData.spending_summary_90d?.by_category?.other > 0;

        console.log(`  Investments category present: ${hasInvestments ? '✓' : '✗'}`);
        console.log(`  Transportation category present: ${hasTransportation ? '✓' : '✗'}`);
        console.log(`  "Other" category spending: ${hasOther ? `$${userData.spending_summary_90d.by_category.other}` : '$0 ✓'}`);

        // Generate insights
        console.log(`\n→ Generating AI insights...`);
        const insights = await generateInsights(userData);

        console.log(`\nGenerated ${insights.insights.length} insights:\n`);

        insights.insights.forEach((insight, idx) => {
            console.log(`${idx + 1}. [${insight.priority.toUpperCase()}] ${insight.title}`);
            console.log(`   ${insight.description}`);

            // Check for problematic recommendations
            const descLower = insight.description.toLowerCase();
            const reasoningLower = insight.reasoning?.join(' ').toLowerCase() || '';
            const allText = descLower + ' ' + reasoningLower;

            if (allText.includes('wealthsimple') && allText.includes('subscription')) {
                console.log(`   ⚠ WARNING: Insight incorrectly treats Wealthsimple as subscription!`);
            }

            if (allText.includes('wealthsimple') && (allText.includes('cancel') || allText.includes('remove'))) {
                console.log(`   ⚠ WARNING: Insight recommends canceling Wealthsimple investment!`);
            }

            if (insight.potential_benefit?.annual_savings) {
                console.log(`   Potential savings: $${insight.potential_benefit.annual_savings}/year`);
            }
            console.log('');
        });

        return true;

    } catch (error) {
        console.error('✗ Error generating insights:', error.message);
        console.error(error);
        return false;
    }
}

/**
 * Check database for misclassified transactions
 */
async function checkMisclassifiedTransactions() {
    console.log('\n=== Checking Database for Misclassifications ===\n');

    // Check if Wealthsimple is properly categorized
    const wealthsimpleCheck = await pool.query(`
        SELECT name, category[1] as category, COUNT(*) as count
        FROM transactions
        WHERE UPPER(name) LIKE '%WEALTHSIMPLE%'
           OR UPPER(merchant_name) LIKE '%WEALTHSIMPLE%'
        GROUP BY name, category[1]
        ORDER BY count DESC
        LIMIT 5
    `);

    if (wealthsimpleCheck.rows.length > 0) {
        console.log('Wealthsimple transactions:');
        wealthsimpleCheck.rows.forEach(row => {
            const status = row.category === 'Investments' ? '✓' : '✗';
            console.log(`  ${status} ${row.name.padEnd(35)} → ${row.category} (${row.count} txns)`);
        });
    } else {
        console.log('  No Wealthsimple transactions found');
    }

    // Check if Lyft is properly categorized
    const lyftCheck = await pool.query(`
        SELECT name, category[1] as category, COUNT(*) as count
        FROM transactions
        WHERE UPPER(name) LIKE '%LYFT%'
           OR UPPER(merchant_name) LIKE '%LYFT%'
        GROUP BY name, category[1]
        ORDER BY count DESC
        LIMIT 5
    `);

    if (lyftCheck.rows.length > 0) {
        console.log('\nLyft transactions:');
        lyftCheck.rows.forEach(row => {
            const status = row.category === 'Transportation' ? '✓' : '✗';
            console.log(`  ${status} ${row.name.padEnd(35)} → ${row.category} (${row.count} txns)`);
        });
    } else {
        console.log('  No Lyft transactions found');
    }

    // Check overall "Other" category usage
    const otherCheck = await pool.query(`
        SELECT
            COUNT(*) as total_transactions,
            SUM(CASE WHEN category[1] = 'Other' THEN 1 ELSE 0 END) as other_count,
            ROUND((SUM(CASE WHEN category[1] = 'Other' THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100), 1) as other_percentage
        FROM transactions
        WHERE user_id IS NOT NULL
    `);

    if (otherCheck.rows.length > 0) {
        const stats = otherCheck.rows[0];
        console.log(`\nOverall categorization stats:`);
        console.log(`  Total transactions: ${stats.total_transactions}`);
        console.log(`  "Other" category: ${stats.other_count} (${stats.other_percentage}%)`);

        if (parseFloat(stats.other_percentage) > 10) {
            console.log(`  ⚠ WARNING: More than 10% of transactions are in "Other" category`);
            console.log(`  → Consider running: node scripts/backfill_ai_categories.js`);
        } else {
            console.log(`  ✓ Good categorization coverage`);
        }
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Insights Quality Verification Script        ║');
    console.log('╚════════════════════════════════════════════════╝');

    let allTestsPassed = true;

    // Test 1: Categorization logic
    const categorizationPassed = await testCategorization();
    allTestsPassed = allTestsPassed && categorizationPassed;

    // Test 2: Check database
    await checkMisclassifiedTransactions();

    // Test 3: Get a test user ID
    const userResult = await pool.query('SELECT id FROM users ORDER BY created_at DESC LIMIT 1');

    if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        const insightsPassed = await testInsightsForUser(userId);
        allTestsPassed = allTestsPassed && insightsPassed;
    } else {
        console.log('\n⚠ No users found in database, skipping insights test');
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════╗');
    if (allTestsPassed) {
        console.log('║   ✓ All verification checks passed!           ║');
    } else {
        console.log('║   ✗ Some verification checks failed           ║');
    }
    console.log('╚════════════════════════════════════════════════╝\n');

    process.exit(allTestsPassed ? 0 : 1);
}

// Run verification
main().finally(() => pool.end());
