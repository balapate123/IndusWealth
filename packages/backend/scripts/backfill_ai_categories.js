/**
 * Backfill AI Categories for Existing Transactions
 *
 * This script:
 * 1. Queries all transactions currently categorized as 'Other'
 * 2. Extracts unique normalized merchant names
 * 3. Batch categorizes with AI (rate-limited)
 * 4. Populates merchant_category_cache
 * 5. Generates report of results
 */

require('dotenv').config();
const { pool } = require('../src/services/db');
const { normalizeMerchant, batchCategorizeMerchants } = require('../src/services/ai_categorization');
const { storeMerchantCategories, logAICategorization } = require('../src/services/db');
const { categorizeTransaction } = require('../src/services/categorization');

// Rate limiting delay (1 second between batches)
const RATE_LIMIT_MS = 1000;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get all transactions that need AI categorization
 */
async function getUncategorizedTransactions() {
    console.log('\n→ Querying transactions needing categorization...');

    const result = await pool.query(`
        SELECT DISTINCT
            name,
            merchant_name,
            COUNT(*) as transaction_count
        FROM transactions
        WHERE user_id IS NOT NULL
        GROUP BY name, merchant_name
        ORDER BY transaction_count DESC
    `);

    console.log(`Found ${result.rows.length} unique merchant names in database`);
    return result.rows;
}

/**
 * Test current categorization to find "Other" merchants
 */
async function findMerchantsNeedingAI(transactions) {
    console.log('\n→ Testing current categorization...');

    const needsAI = [];
    let otherCount = 0;

    for (const tx of transactions) {
        const result = await categorizeTransaction(tx);

        if (result.category === 'Other' || result.needsAI) {
            const normalized = normalizeMerchant(tx.name);
            if (normalized) {
                needsAI.push({
                    normalized,
                    raw: tx.name,
                    count: tx.transaction_count
                });
                otherCount += tx.transaction_count;
            }
        }
    }

    console.log(`Found ${needsAI.length} unique merchants needing AI categorization`);
    console.log(`These represent ${otherCount} transactions currently in "Other"`);

    return needsAI;
}

/**
 * Batch process merchants with AI
 */
async function processMerchantsWithAI(merchants) {
    if (merchants.length === 0) {
        console.log('\n✓ No merchants need AI categorization!');
        return {
            categorized: 0,
            failed: 0,
            totalCost: 0
        };
    }

    console.log('\n→ Starting AI categorization...');

    const batchSize = parseInt(process.env.AI_CATEGORIZATION_BATCH_SIZE || '20');
    const merchantNames = merchants.map(m => m.normalized);

    let totalCategorized = 0;
    let totalFailed = 0;
    let totalTokensInput = 0;
    let totalTokensOutput = 0;

    // Process in batches
    for (let i = 0; i < merchantNames.length; i += batchSize) {
        const batch = merchantNames.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(merchantNames.length / batchSize);

        console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} merchants...`);

        try {
            const result = await batchCategorizeMerchants(batch);

            // Store results
            if (result.results && result.results.length > 0) {
                await storeMerchantCategories(result.results);
                totalCategorized += result.results.length;

                // Show some results
                result.results.slice(0, 3).forEach(cat => {
                    console.log(`  ✓ ${cat.merchant_normalized} → ${cat.category} (${cat.confidence_score})`);
                });
                if (result.results.length > 3) {
                    console.log(`  ... and ${result.results.length - 3} more`);
                }
            }

            const failed = batch.length - (result.results?.length || 0);
            if (failed > 0) {
                console.log(`  ⚠ ${failed} merchants failed categorization`);
                totalFailed += failed;
            }

            // Log metadata
            await logAICategorization(result.metadata);

            totalTokensInput += result.metadata.token_count_input || 0;
            totalTokensOutput += result.metadata.token_count_output || 0;

            console.log(`  Time: ${result.metadata.generation_time_ms}ms`);

            // Rate limiting (except for last batch)
            if (i + batchSize < merchantNames.length) {
                console.log(`  Waiting ${RATE_LIMIT_MS}ms (rate limiting)...`);
                await sleep(RATE_LIMIT_MS);
            }

        } catch (error) {
            console.error(`  ✗ Batch ${batchNum} failed:`, error.message);
            totalFailed += batch.length;

            // Log the error
            await logAICategorization({
                merchant_count: batch.length,
                error_message: error.message
            });
        }
    }

    // Calculate cost (Gemini 2.0 Flash pricing)
    const inputCost = (totalTokensInput / 1000000) * 0.075;
    const outputCost = (totalTokensOutput / 1000000) * 0.30;
    const totalCost = inputCost + outputCost;

    return {
        categorized: totalCategorized,
        failed: totalFailed,
        totalTokensInput,
        totalTokensOutput,
        totalCost
    };
}

/**
 * Generate report
 */
function generateReport(merchants, results) {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Backfill Complete - Summary Report          ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('MERCHANTS PROCESSED:');
    console.log(`  Total unique merchants:      ${merchants.length}`);
    console.log(`  Successfully categorized:    ${results.categorized}`);
    console.log(`  Failed categorization:       ${results.failed}`);
    console.log(`  Success rate:                ${((results.categorized / merchants.length) * 100).toFixed(1)}%`);

    const totalTransactions = merchants.reduce((sum, m) => sum + m.count, 0);
    console.log(`\nTRANSACTIONS IMPACTED:`);
    console.log(`  Total transactions affected: ${totalTransactions}`);

    console.log(`\nAI API USAGE:`);
    console.log(`  Input tokens:                ${results.totalTokensInput.toLocaleString()}`);
    console.log(`  Output tokens:               ${results.totalTokensOutput.toLocaleString()}`);
    console.log(`  Total cost:                  $${results.totalCost.toFixed(4)}`);

    console.log('\nNEXT STEPS:');
    console.log('  1. Verify results with: node scripts/test_ai_categorization.js');
    console.log('  2. Enable feature flag: AI_CATEGORIZATION_ENABLED=true');
    console.log('  3. Restart backend server');
    console.log('  4. Check insights quality in mobile app');
}

/**
 * Main execution
 */
async function main() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   AI Categorization Backfill Script           ║');
    console.log('╚════════════════════════════════════════════════╝');

    // Check prerequisites
    if (!process.env.GEMINI_API_KEY) {
        console.error('\n✗ ERROR: GEMINI_API_KEY not found in environment');
        console.log('Please add GEMINI_API_KEY to your .env file');
        process.exit(1);
    }

    try {
        // Step 1: Get all transactions
        const allTransactions = await getUncategorizedTransactions();

        // Step 2: Find merchants needing AI
        const merchantsNeedingAI = await findMerchantsNeedingAI(allTransactions);

        // Step 3: Confirm before proceeding
        if (merchantsNeedingAI.length > 0) {
            const totalTransactions = merchantsNeedingAI.reduce((sum, m) => sum + m.count, 0);
            console.log(`\n⚠ This will process ${merchantsNeedingAI.length} merchants (${totalTransactions} transactions)`);

            const estimatedBatches = Math.ceil(merchantsNeedingAI.length / 20);
            const estimatedCost = (merchantsNeedingAI.length * 35) / 1000000 * 0.30;
            console.log(`Estimated: ${estimatedBatches} API calls, ~$${estimatedCost.toFixed(4)} cost`);

            console.log('\nStarting in 3 seconds... (Ctrl+C to cancel)');
            await sleep(3000);
        }

        // Step 4: Process with AI
        const results = await processMerchantsWithAI(merchantsNeedingAI);

        // Step 5: Generate report
        generateReport(merchantsNeedingAI, results);

        console.log('\n✓ Backfill completed successfully!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n✗ Backfill failed:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the script
main();
