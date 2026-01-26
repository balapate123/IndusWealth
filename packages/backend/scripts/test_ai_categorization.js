/**
 * Test script for AI categorization
 * Verifies merchant normalization and AI categorization work correctly
 */

require('dotenv').config();
const { normalizeMerchant, batchCategorizeMerchants } = require('../src/services/ai_categorization');
const { getMerchantCategory, storeMerchantCategories } = require('../src/services/db');

// Test cases based on user's reported issues
const TEST_MERCHANTS = [
    'LYFT *RIDE 12345',
    'LYFT   *RIDE AUX6YN',
    'UBER *TRIP',
    'WEALTHSIMPLE INVEST 001',
    'WEALTHSIMPLE TRADE',
    'QUESTRADE INC',
    'STARBUCKS #1234',
    'TIM HORTONS STORE 5678',
    'MCDONALD\'S #9012',
    'SHOPPERS DRUG MART STORE 2345',
    'LCBO #0123',
    'NETFLIX.COM *12345678',
    'SPOTIFY *PREMIUM',
    'CIRCLE K STN 999',
    'PETRO-CANADA #1234',
    'SUBZI MANDI',
    'LOBLAWS SUPERSTORE',
    'CINEPLEX THEATRE',
    'GOODLIFE FITNESS',
    'REXALL PHARMACY'
];

async function testNormalization() {
    console.log('\n=== Testing Merchant Normalization ===\n');

    TEST_MERCHANTS.forEach(merchant => {
        const normalized = normalizeMerchant(merchant);
        console.log(`${merchant.padEnd(40)} → ${normalized}`);
    });
}

async function testAICategorization() {
    console.log('\n=== Testing AI Categorization ===\n');

    // Normalize merchants
    const normalizedMerchants = TEST_MERCHANTS.map(m => normalizeMerchant(m));
    const uniqueMerchants = [...new Set(normalizedMerchants)].filter(Boolean);

    console.log(`Testing ${uniqueMerchants.length} unique merchants...\n`);

    try {
        const result = await batchCategorizeMerchants(uniqueMerchants);

        console.log(`\n✓ AI categorized ${result.results?.length || 0} merchants\n`);
        console.log('Metadata:', JSON.stringify(result.metadata, null, 2));

        // Display results
        console.log('\n=== Categorization Results ===\n');
        if (result.results && result.results.length > 0) {
            result.results.forEach(cat => {
                console.log(`${cat.merchant_normalized.padEnd(30)} → ${cat.category.padEnd(20)} (confidence: ${cat.confidence_score})`);
            });

            // Check critical merchants
            console.log('\n=== Verification ===\n');
            const lyft = result.results.find(r => r.merchant_normalized === 'LYFT');
            const wealthsimple = result.results.find(r => r.merchant_normalized === 'WEALTHSIMPLE');

            if (lyft) {
                if (lyft.category === 'Transportation') {
                    console.log('✓ Lyft correctly categorized as Transportation');
                } else {
                    console.log(`✗ ERROR: Lyft categorized as "${lyft.category}" instead of "Transportation"`);
                }
            } else {
                console.log('✗ ERROR: Lyft not categorized');
            }

            if (wealthsimple) {
                if (wealthsimple.category === 'Investments') {
                    console.log('✓ Wealthsimple correctly categorized as Investments');
                } else {
                    console.log(`✗ ERROR: Wealthsimple categorized as "${wealthsimple.category}" instead of "Investments"`);
                }
            } else {
                console.log('✗ ERROR: Wealthsimple not categorized');
            }
        } else {
            console.log('No results returned from AI');
        }
    } catch (error) {
        console.error('✗ AI categorization failed:', error.message);
        console.error(error);
    }
}

async function testCacheStorage() {
    console.log('\n=== Testing Cache Storage ===\n');

    try {
        // Test storing a merchant
        const testData = [{
            merchant_normalized: 'TEST MERCHANT',
            category: 'Shopping',
            category_icon: 'bag-outline',
            category_color: '#FF2D92',
            confidence_score: 0.95,
            ai_model_used: 'gemini-2.0-flash-exp'
        }];

        await storeMerchantCategories(testData);
        console.log('✓ Stored test merchant in cache');

        // Test retrieving
        const cached = await getMerchantCategory('TEST MERCHANT');
        if (cached && cached.category === 'Shopping') {
            console.log('✓ Successfully retrieved from cache:', cached);
        } else {
            console.log('✗ Failed to retrieve from cache');
        }
    } catch (error) {
        console.error('✗ Cache test failed:', error.message);
    }
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   AI Categorization Test Suite                 ║');
    console.log('╚════════════════════════════════════════════════╝');

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
        console.error('\n✗ ERROR: GEMINI_API_KEY not found in environment');
        console.log('Please add GEMINI_API_KEY to your .env file');
        process.exit(1);
    }

    try {
        await testNormalization();
        await testAICategorization();
        await testCacheStorage();

        console.log('\n╔════════════════════════════════════════════════╗');
        console.log('║   All tests completed!                         ║');
        console.log('╚════════════════════════════════════════════════╝\n');

        process.exit(0);
    } catch (error) {
        console.error('\n✗ Test suite failed:', error);
        process.exit(1);
    }
}

// Run tests
runAllTests();
