  # Hybrid AI Transaction Categorization System - Implementation Plan

  **Project**: IndusWealth AI-Based Transaction Categorization
  **Date**: 2026-01-25
  **Scope**: Full-stack (Backend + Mobile)
  **Approach**: Async categorization with background updates
  **User Feedback**: Deferred to Phase 2

  ---

  ## Executive Summary

  Transform IndusWealth's transaction categorization from pattern-based matching to a hybrid AI system that:
  - Reduces "Other" category usage from ~30% to <5%
  - Improves analytics and insights quality
  - Costs ~$0.45/month in AI API calls
  - Maintains fast response times (<100ms) with async AI processing
  - Learns and improves over time through merchant-level caching

  **Current System**: Plaid categories → Pattern matching (108 keywords) → "Other"
  **New System**: Plaid categories → Pattern matching → AI cache → AI fresh categorization

  ---

  ## Architecture Overview

  ### Four-Layer Categorization Priority

  ```
  ┌─────────────────────────────────────────────────────┐
  │ Layer 1: Plaid Category (from API)                 │
  │ ✓ Fast, authoritative                              │
  │ ✗ Only ~40% coverage                               │
  └─────────────────────────────────────────────────────┘
  ↓ (if no Plaid category)
  ┌─────────────────────────────────────────────────────┐
  │ Layer 2: Pattern Matching (existing keywords)      │
  │ ✓ Fast (in-memory), no cost                        │
  │ ✗ Limited to 108 predefined keywords               │
  └─────────────────────────────────────────────────────┘
  ↓ (if no pattern match)
  ┌─────────────────────────────────────────────────────┐
  │ Layer 3: AI Cache Lookup (merchant normalization)  │
  │ ✓ Fast (<5ms), no AI cost                          │
  │ ✓ Grows over time (~85% hit rate by Month 6)       │
  └─────────────────────────────────────────────────────┘
  ↓ (if not cached)
  ┌─────────────────────────────────────────────────────┐
  │ Layer 4: Gemini AI Fresh Categorization            │
  │ ✓ High accuracy (~90%+)                             │
  │ ✗ Slower (~200-300ms), costs $0.0003 per 1K txns   │
  │ → Batch process (10-20 merchants per call)         │
  │ → Background async (non-blocking)                   │
  └─────────────────────────────────────────────────────┘
  ```

  ### Data Flow (Async Pattern - User Selected)

  ```
  Mobile App Request
  ↓
  Backend /transactions endpoint
  ↓
  ┌──────────────────────────────────┐
  │ Categorize each transaction:    │
  │ 1. Try Plaid (60-70%)           │
  │ 2. Try Pattern (10-20%)         │
  │ 3. Try AI Cache (10-15%)        │
  │ 4. Mark as pending AI (5-10%)   │
  └──────────────────────────────────┘
  ↓
  Return response immediately (~80-100ms)
  (Pending transactions show "Other" temporarily)
  ↓
  ┌──────────────────────────────────┐
  │ Background async process:        │
  │ 1. Collect pending transactions  │
  │ 2. Normalize merchant names      │
  │ 3. Batch call Gemini AI         │
  │ 4. Store in cache               │
  │ 5. Notify mobile app            │
  └──────────────────────────────────┘
  ↓ (1-2 seconds later)
  Mobile app receives update (WebSocket/polling)
  ↓
  UI updates with AI categories
  ```

  ---

  ## Database Schema

  ### New Table: `merchant_category_cache`

  Stores AI-categorized merchant → category mappings for fast lookup.

  ```sql
  CREATE TABLE IF NOT EXISTS merchant_category_cache (
  id SERIAL PRIMARY KEY,
  merchant_normalized VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  category_icon VARCHAR(50),
  category_color VARCHAR(20),
  confidence_score DECIMAL(3,2),

  -- Metadata
  ai_model_used VARCHAR(50),
  categorized_at TIMESTAMP DEFAULT NOW(),
  cache_expires_at TIMESTAMP,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Learning fields (for Phase 2 user feedback)
  user_override_category VARCHAR(100),
  override_count INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX idx_merchant_category_normalized ON merchant_category_cache(merchant_normalized);
  CREATE INDEX idx_merchant_category_expires ON merchant_category_cache(cache_expires_at);
  CREATE INDEX idx_merchant_category_usage ON merchant_category_cache(times_used DESC);
  ```

  **Key Design Decisions:**
  - `merchant_normalized`: Removes numbers/suffixes ("MCDONALD'S #1234" → "MCDONALD'S")
  - `cache_expires_at`: NULL = never expires (Phase 1 approach)
  - `confidence_score`: AI confidence (0.0-1.0), filter out low-confidence results
  - `user_override_*`: Reserved for Phase 2 feedback mechanism

  ### New Table: `ai_categorization_log`

  Tracks AI API calls for cost monitoring and analytics.

  ```sql
  CREATE TABLE IF NOT EXISTS ai_categorization_log (
  id SERIAL PRIMARY KEY,
  request_id UUID DEFAULT gen_random_uuid(),
  merchant_count INTEGER NOT NULL,
  token_count_input INTEGER,
  token_count_output INTEGER,
  ai_model_used VARCHAR(50),
  generation_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX idx_ai_categorization_date ON ai_categorization_log(created_at DESC);
  ```

  **Usage:**
  - Cost analysis: `SUM(token_count_input + token_count_output) * rate`
  - Performance monitoring: `AVG(generation_time_ms)`
  - Error tracking: `COUNT(*) WHERE error_message IS NOT NULL`

  ---

  ## Merchant Normalization Strategy

  **Goal**: Group similar merchant names to maximize cache hits.

  ### Normalization Rules

  ```javascript
  function normalizeMerchant(rawName) {
  return rawName
  .toUpperCase()                          // Case-insensitive
  .replace(/[#*]\d+/g, '')                // Remove #1234, *5678
  .replace(/\s+\d{4,}/g, '')              // Remove long numbers
  .replace(/\s+(STORE|LOCATION|BRANCH|STN|#)\s*/gi, '')
  .trim()
  .substring(0, 100);
  }
  ```

  ### Examples

  | Raw Merchant Name | Normalized | Category (AI) |
  |------------------|------------|---------------|
  | `MCDONALD'S #1234 TORONTO` | `MCDONALD'S TORONTO` | Restaurants |
  | `SHOPPERS DRUG MART STORE 2345` | `SHOPPERS DRUG MART` | Health & Pharmacy |
  | `CIRCLE K STN 999` | `CIRCLE K` | Gas & Fuel |
  | `NETFLIX.COM *12345678` | `NETFLIX.COM` | Subscriptions |
  | `TIMEX SP 1234` | `TIMEX SP` | Shopping |

  **Cache Hit Rate Projection:**
  - Month 1: ~40% (building cache)
  - Month 3: ~75% (common merchants cached)
  - Month 6: ~85%+ (mature cache)

  ---

  ## AI Service Configuration

  ### Gemini 2.0 Flash Integration

  **Why Gemini Flash?**
  - Already integrated in `packages/backend/src/services/ai_insights.js`
  - Cost-effective: $0.075/1M input tokens, $0.30/1M output tokens
  - Fast: 200-300ms average response time
  - Native JSON mode for structured output

  **Configuration:**
  ```javascript
  const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  generationConfig: {
  temperature: 0.3,          // Lower = more consistent
  topK: 20,
  topP: 0.8,
  maxOutputTokens: 2048,     // Smaller than insights (cost savings)
  responseMimeType: 'application/json'
  }
  });
  ```

  ### AI Prompt Template

  ```javascript
  const systemPrompt = `You are a transaction categorization expert for a Canadian personal finance app.

  TASK: Categorize merchant names into predefined categories.

  AVAILABLE CATEGORIES:
  ${JSON.stringify(Object.keys(CATEGORY_PATTERNS))}

  CATEGORIES INCLUDE:
  - Gas & Fuel
  - Groceries
  - Restaurants
  - Entertainment
  - Subscriptions
  - Shopping
  - Health & Pharmacy
  - Fitness
  - Investments
  - Transfers
  - ATM
  - Fees & Charges
  - Payments
  - Income
  - Alcohol & Bars
  - Software & Tech
  - Transportation

  RULES:
  1. Choose the BEST matching category (exactly as listed above)
  2. Be CONSISTENT (same merchant = same category always)
  3. Consider Canadian context:
  - Tim Hortons, McDonald's = "Restaurants"
  - LCBO, Beer Store = "Alcohol & Bars"
  - Shoppers Drug Mart = "Health & Pharmacy"
  4. Default to "Shopping" if uncertain (NOT "Other")
  5. Return confidence score (0.0-1.0)

  OUTPUT FORMAT (strict JSON):
  {
  "categorizations": [
  {
  "merchant": "SHOPPERS DRUG MART",
  "category": "Health & Pharmacy",
  "confidence": 0.95
  },
  {
  "merchant": "NETFLIX",
  "category": "Subscriptions",
  "confidence": 0.99
  }
  ]
  }

  MERCHANTS TO CATEGORIZE:
  ${JSON.stringify(merchants)}

  Return ONLY valid JSON. No explanations.`;
  ```

  **Batch Size**: 10-20 merchants per request (optimal cost/latency balance)

  ---

  ## Cost Analysis

  ### Pricing Model (Gemini 2.0 Flash)
  - Input: $0.075 per 1M tokens
  - Output: $0.30 per 1M tokens

  ### Token Estimation
  - System prompt: ~400 tokens
  - Per merchant: ~10 tokens input, ~25 tokens output
  - Batch of 20 merchants: ~600 input, ~500 output = ~1,100 total

  ### Cost Projections

  **One-Time Backfill** (10,000 existing transactions):
  - Transactions needing AI: ~4,000 (60% already categorized)
  - Unique merchants: ~800
  - Batches (20/batch): 40 API calls
  - Total tokens: ~44,000
  - **Cost: $0.012**

  **Monthly Ongoing** (1,000 new transactions/month):
  - New merchants needing AI: ~50 (after cache builds)
  - Batches: 2-3 calls/month
  - Total tokens: ~3,300/month
  - **Cost: $0.001/month**

  **Annual Estimate**: ~$0.25-0.50/year

  ---

  ## Implementation Roadmap

  ### Phase 1: Backend Foundation (Week 1)

  **Tasks:**
  1. Create database tables (`merchant_category_cache`, `ai_categorization_log`)
  2. Create `packages/backend/src/services/ai_categorization.js`
  - `normalizeMerchant(rawName)`
  - `batchCategorizeMerchants(merchantNames)`
  - `buildCategorizationPrompt(merchants)`
  3. Update `packages/backend/src/services/db.js`
  - `getMerchantCategory(merchantNormalized)`
  - `storeMerchantCategories(categorizations)`
  - `incrementCacheUsage(merchantNormalized)`
  - `logAICategorization(logData)`
  4. Update `packages/backend/src/services/categorization.js`
  - Make `categorizeTransaction()` async
  - Add Layer 3 (cache lookup)
  - Add `batchCategorizeWithAI()` function
  5. Add environment variables:
  - `AI_CATEGORIZATION_ENABLED=false` (feature flag)
  - `MERCHANT_CACHE_TTL_DAYS=0` (never expire)

  **Verification:**
  - Unit tests pass for merchant normalization
  - Database migrations run cleanly
  - AI service can categorize test batch

  ### Phase 2: Backfill Existing Data (Week 1-2)

  **Tasks:**
  1. Create `packages/backend/scripts/backfill_ai_categories.js`
  2. Query all transactions with category = 'Other'
  3. Extract unique normalized merchants (~800)
  4. Batch categorize with rate limiting (1 req/second)
  5. Validate results (manual spot-check 100 merchants)

  **Verification:**
  - Merchant cache populated with ~800 entries
  - Categorization log shows successful batches
  - Spot-check accuracy >90%

  ### Phase 3: Backend Integration (Week 2)

  **Tasks:**
  1. Update `packages/backend/src/routes/transactions.js`
  - Make categorization async-aware
  - Trigger background AI categorization for pending
  - Return immediate response (don't block)
  2. Update `packages/backend/src/routes/analytics.js`
  - Same async categorization pattern
  3. Add monitoring/logging for AI calls
  4. Enable feature flag in staging: `AI_CATEGORIZATION_ENABLED=true`

  **Verification:**
  - Transactions endpoint returns <100ms (fast path)
  - Background AI categorization completes in 1-2s
  - Cache hit rate visible in logs
  - No errors in categorization flow

  ### Phase 4: Mobile Updates (Week 2-3)

  **Tasks:**
  1. Create WebSocket/polling mechanism for category updates
  - Option A: WebSocket server for real-time push
  - Option B: Polling endpoint (simpler, less infrastructure)
  2. Update `packages/mobile/src/services/api.js`
  - Add category update listener
  3. Update relevant screens:
  - `HomeScreen.js`: Show loading state for pending categories
  - `AllTransactionsScreen.js`: Update categories when received
  - `AnalyticsScreen.js`: Refresh charts on category updates
  4. Update `packages/mobile/src/utils/categorization.js`
  - Match backend async logic for consistency

  **Verification:**
  - Mobile app shows "Categorizing..." for pending transactions
  - Categories update within 1-2 seconds
  - No UI flicker or performance issues

  ### Phase 5: Testing & Rollout (Week 3-4)

  **Tasks:**
  1. Load testing: 1,000 transactions (300 needing AI)
  2. Monitor staging environment for 1 week
  3. Review AI categorization accuracy
  4. Gradual production rollout:
  - 10% of users (canary)
  - 50% of users
  - 100% rollout
  5. Monitor cost, performance, errors

  **Verification:**
  - Zero critical bugs
  - Cost tracking matches projections
  - User feedback positive
  - Analytics show reduced "Other" usage

  ---

  ## Critical Files to Modify

  ### New Files

  1. **packages/backend/db/add_ai_categorization.sql**
  - Database migration for new tables
  - Indexes for performance

  2. **packages/backend/src/services/ai_categorization.js** (NEW)
  - Core AI categorization service
  - Gemini API integration
  - Batch processing logic
  - Merchant normalization
  - Error handling and logging

  3. **packages/backend/scripts/backfill_ai_categories.js** (NEW)
  - One-time migration script
  - Categorizes existing "Other" transactions
  - Populates merchant cache

  ### Modified Files

  4. **packages/backend/src/services/categorization.js**
  - Line 115: Make `categorizeTransaction()` async
  - Add Layer 3: AI cache lookup
  - Add Layer 4: Mark for AI processing
  - Add `batchCategorizeWithAI()` function
  - Export new functions

  5. **packages/backend/src/services/db.js**
  - Add `getMerchantCategory()` function
  - Add `storeMerchantCategories()` bulk insert
  - Add `incrementCacheUsage()` counter
  - Add `logAICategorization()` tracking

  6. **packages/backend/src/routes/transactions.js**
  - Line 103-116: Update to async categorization
  - Add background AI processing (non-blocking)
  - Add logging for AI categorization triggers

  7. **packages/backend/src/routes/analytics.js**
  - Line 251-273: Make categorization async
  - Same background AI pattern as transactions route

  8. **packages/mobile/src/services/api.js**
  - Add category update polling/WebSocket listener
  - Add `subscribeToCategories()` function
  - Handle real-time updates

  9. **packages/mobile/src/screens/HomeScreen.js**
  - Add loading state for pending categories
  - Subscribe to category updates
  - Update UI when categories arrive

  10. **packages/mobile/src/screens/AllTransactionsScreen.js**
  - Add category update listener
  - Refresh transaction list on update

  11. **packages/mobile/src/screens/AnalyticsScreen.js**
  - Subscribe to category updates
  - Refresh charts when categories change

  12. **packages/mobile/src/utils/categorization.js**
  - Match backend async logic
  - Add cache-aware categorization

  ---

  ## Mobile App UX Flow (Async Pattern)

  ### User Experience Timeline

  ```
  T=0ms: User opens transactions screen
  ↓
  T=50ms: API request sent to backend
  ↓
  T=150ms: Backend responds (transactions with categories)
  - 90% have categories (Plaid/Pattern/Cache)
  - 10% show "Other" with pending=true
  ↓
  T=200ms: Mobile app renders list
  - Shows 90% categorized transactions
  - Shows 10% with "Categorizing..." badge
  ↓
  T=500ms: Backend AI categorization starts (background)
  ↓
  T=1500ms: AI categorization completes
  - Categories stored in cache
  - WebSocket/polling notifies mobile
  ↓
  T=1600ms: Mobile app receives update
  ↓
  T=1650ms: UI smoothly updates "Other" → correct category
  - Smooth animation (fade/slide)
  - No full screen refresh
  ```

  ### UI Components

  **Transaction List Item (Pending State):**
  ```jsx
  {transaction.category === 'Other' && transaction.categoryPending ? (
  <View style={styles.pendingBadge}>
  <ActivityIndicator size="small" color="#FFD700" />
  <Text style={styles.pendingText}>Categorizing...</Text>
  </View>
  ) : (
  <CategoryBadge
  category={transaction.category}
  icon={transaction.categoryIcon}
  color={transaction.categoryColor}
  />
  )}
  ```

  **Category Update Animation:**
  ```javascript
  // When category update received
  const animatedValue = new Animated.Value(0);

  Animated.sequence([
  Animated.timing(animatedValue, {
  toValue: 1,
  duration: 200,
  useNativeDriver: true
  }),
  // Update category in state
  Animated.timing(animatedValue, {
  toValue: 0,
  duration: 200,
  useNativeDriver: true
  })
  ]).start();
  ```

  ---

  ## Phase 2 Enhancement: User Feedback Mechanism

  **Deferred to Phase 2** (per user preference), but documented for future implementation.

  ### UI Design

  **Transaction Detail Screen - Category Feedback:**
  ```jsx
  <View style={styles.categorySection}>
  <Text style={styles.categoryLabel}>Category</Text>
  <TouchableOpacity onPress={() => setShowCategoryPicker(true)}>
  <View style={styles.categoryValue}>
  <Icon name={transaction.categoryIcon} />
  <Text>{transaction.category}</Text>
  {transaction.categorySource === 'ai_cache' && (
  <Text style={styles.aiTag}>AI</Text>
  )}
  </View>
  </TouchableOpacity>

  {showIncorrectPrompt && (
  <View style={styles.feedbackPrompt}>
  <Text>Is this category correct?</Text>
  <View style={styles.buttonRow}>
  <Button title="Yes" onPress={handleCorrect} />
  <Button title="No, change it" onPress={() => setShowCategoryPicker(true)} />
  </View>
  </View>
  )}
  </View>
  ```

  ### Backend Changes (Phase 2)

  1. **New endpoint**: `POST /api/transactions/:id/category`
  - Accept user category override
  - Update `merchant_category_cache.user_override_category`
  - Increment `override_count`
  - If `override_count > 5`, update AI category

  2. **Analytics Dashboard**: `/admin/categorization`
  - Show override rate by category
  - Identify merchants with high override rates
  - Manual category correction tool

  ### Learning Algorithm (Phase 2)

  ```javascript
  async function updateCategoryFromFeedback(merchantNormalized, userCategory) {
  const cached = await getMerchantCategory(merchantNormalized);

  if (!cached) return;

  // Increment override counter
  cached.override_count++;

  // If 5+ users override, accept user category as correct
  if (cached.override_count >= 5) {
  await pool.query(
  `UPDATE merchant_category_cache
  SET category = $1,
  user_override_category = $1,
  confidence_score = 1.0,
  updated_at = NOW()
  WHERE merchant_normalized = $2`,
  [userCategory, merchantNormalized]
  );
  } else {
  // Just track the override for now
  await pool.query(
  `UPDATE merchant_category_cache
  SET user_override_category = $1,
  override_count = $2,
  updated_at = NOW()
  WHERE merchant_normalized = $3`,
  [userCategory, cached.override_count, merchantNormalized]
  );
  }
  }
  ```

  ---

  ## Testing Strategy

  ### Unit Tests

  **File**: `packages/backend/tests/ai_categorization.test.js`

  ```javascript
  describe('Merchant Normalization', () => {
  test('removes store numbers', () => {
  expect(normalizeMerchant('MCDONALD\'S #1234')).toBe('MCDONALD\'S');
  });

  test('removes suffixes', () => {
  expect(normalizeMerchant('CIRCLE K STN 999')).toBe('CIRCLE K');
  });

  test('handles special characters', () => {
  expect(normalizeMerchant('NETFLIX.COM *12345678')).toBe('NETFLIX.COM');
  });
  });

  describe('AI Categorization', () => {
  test('batches merchants correctly', async () => {
  const merchants = ['STARBUCKS', 'TIM HORTONS', 'MCDONALD\'S'];
  const results = await batchCategorizeMerchants(merchants);

  expect(results).toHaveLength(3);
  expect(results[0].category).toBe('Restaurants');
  });

  test('handles API errors gracefully', async () => {
  // Mock Gemini failure
  jest.spyOn(genAI, 'generateContent').mockRejectedValue(new Error('API down'));

  const results = await batchCategorizeMerchants(['TEST']);
  expect(results).toHaveLength(0); // Graceful degradation
  });
  });
  ```

  ### Integration Tests

  **File**: `packages/backend/tests/categorization.integration.test.js`

  ```javascript
  describe('Transaction Categorization Integration', () => {
  test('end-to-end categorization flow', async () => {
  const transaction = {
  name: 'UNKNOWN MERCHANT #123',
  amount: 50.00
  };

  // Should try Plaid (none)
  // Should try pattern (none)
  // Should check cache (empty)
  // Should trigger AI categorization

  const result = await categorizeTransaction(transaction);
  expect(result.needsAI).toBe(true);

  // Simulate background AI
  await batchCategorizeWithAI([transaction]);

  // Second call should hit cache
  const result2 = await categorizeTransaction(transaction);
  expect(result2.source).toBe('ai_cache');
  });
  });
  ```

  ### Load Testing

  **Script**: `packages/backend/scripts/load_test_categorization.js`

  ```javascript
  async function loadTest() {
  const transactions = Array(1000).fill(null).map((_, i) => ({
  name: `MERCHANT_${i % 100}`,
  amount: Math.random() * 100
  }));

  const startTime = Date.now();

  const results = await Promise.all(
  transactions.map(tx => categorizeTransaction(tx))
  );

  const endTime = Date.now();

  console.log(`Categorized ${transactions.length} in ${endTime - startTime}ms`);
  console.log(`Average: ${(endTime - startTime) / transactions.length}ms per transaction`);

  const needsAI = results.filter(r => r.needsAI).length;
  console.log(`AI needed: ${needsAI} (${(needsAI/transactions.length*100).toFixed(1)}%)`);
  }
  ```

  **Success Criteria:**
  - 1,000 transactions categorized in <2 seconds
  - <10% need AI categorization (after cache builds)
  - Zero errors/crashes

  ---

  ## Performance Benchmarks

  ### Current System (Pattern Matching Only)

  - **100 transactions**: 15-20ms
  - **1,000 transactions**: 50-80ms
  - **10,000 transactions**: 400-600ms

  ### New System (With AI Cache)

  **Fast Path (90% of requests after cache builds):**
  - **100 transactions**: 20-25ms (+5ms for DB cache lookups)
  - **1,000 transactions**: 80-100ms
  - **10,000 transactions**: 500-700ms

  **With AI Categorization (10% of requests):**
  - **Initial response**: 80-100ms (same as fast path)
  - **Background AI**: +200-500ms (non-blocking)
  - **Total user-perceived latency**: No change (async)

  ### Database Query Performance

  **Cache Lookup** (single merchant):
  ```sql
  SELECT category, category_icon, category_color
  FROM merchant_category_cache
  WHERE merchant_normalized = 'STARBUCKS'
  ```
  - Expected: <1ms (indexed)

  **Batch Cache Lookup** (100 merchants):
  ```sql
  SELECT merchant_normalized, category, category_icon, category_color
  FROM merchant_category_cache
  WHERE merchant_normalized = ANY($1)
  ```
  - Expected: <5ms (indexed, batched)

  ---

  ## Monitoring & Observability

  ### Key Metrics to Track

  1. **Categorization Coverage**
  - % transactions with Plaid categories
  - % transactions with pattern matches
  - % transactions with AI cache hits
  - % transactions needing fresh AI
  - % transactions still "Other"

  2. **AI Performance**
  - AI requests per day/month
  - Average batch size
  - Average response time
  - Error rate
  - Token usage (input + output)

  3. **Cost Tracking**
  - Daily AI cost
  - Cost per transaction
  - Cost per new merchant
  - Projected monthly cost

  4. **Cache Effectiveness**
  - Cache hit rate
  - Cache size (# of merchants)
  - Most used cached merchants
  - Cache misses by merchant

  ### Logging Examples

  **AI Categorization Success:**
  ```javascript
  logger.info('AI categorization completed', {
  requestId: uuid(),
  merchantCount: 15,
  tokensIn: 1200,
  tokensOut: 450,
  timeMs: 285,
  model: 'gemini-2.0-flash-exp',
  cost: 0.000135
  });
  ```

  **Cache Hit:**
  ```javascript
  logger.debug('Merchant cache hit', {
  merchant: 'STARBUCKS',
  category: 'Restaurants',
  timesUsed: 145,
  lastUsed: '2026-01-24T10:30:00Z'
  });
  ```

  **Category Update Notification:**
  ```javascript
  logger.info('Category update pushed to mobile', {
  userId: 123,
  transactionId: 45678,
  oldCategory: 'Other',
  newCategory: 'Restaurants',
  source: 'ai_fresh'
  });
  ```

  ### Admin Dashboard (Future Enhancement)

  **Endpoint**: `GET /api/admin/categorization/stats`

  **Response:**
  ```json
  {
  "coverage": {
  "plaid": 42.3,
  "pattern": 28.1,
  "ai_cache": 24.5,
  "ai_fresh": 3.1,
  "other": 2.0
  },
  "cache": {
  "size": 1247,
  "hit_rate": 82.4,
  "avg_confidence": 0.91
  },
  "ai_usage": {
  "requests_today": 12,
  "merchants_categorized_today": 43,
  "cost_today": 0.0012,
  "cost_month_to_date": 0.023
  }
  }
  ```

  ---

  ## Environment Variables

  Add to `.env` and `.env.example`:

  ```bash
  # AI Categorization Feature
  AI_CATEGORIZATION_ENABLED=false          # Feature flag (enable after testing)
  MERCHANT_CACHE_TTL_DAYS=0                # 0 = never expire, >0 = TTL in days
  AI_CATEGORIZATION_BATCH_SIZE=20          # Merchants per AI request
  AI_CATEGORIZATION_MIN_CONFIDENCE=0.7     # Min confidence to accept AI category

  # Gemini API (already exists)
  GEMINI_API_KEY=your_key_here

  # Mobile App WebSocket (if using real-time updates)
  WEBSOCKET_ENABLED=false                  # true for WebSocket, false for polling
  WEBSOCKET_PORT=3001
  ```

  ---

  ## Risk Mitigation

  ### Risk 1: AI Service Downtime
  **Impact**: New merchants remain as "Other"
  **Mitigation**:
  - Graceful degradation (existing pattern matching continues)
  - Retry logic with exponential backoff
  - Queue uncategorized merchants for next sync
  - Fallback to stale cache if available

  ### Risk 2: Incorrect Categorizations
  **Impact**: Wrong categories affect analytics
  **Mitigation**:
  - Confidence threshold (>0.7 required)
  - Manual review of first 100 AI categorizations
  - Phase 2 user feedback mechanism
  - Admin override tool

  ### Risk 3: Cost Overruns
  **Impact**: Unexpected API bills
  **Mitigation**:
  - Daily spending limit ($1/day max)
  - Alert if >100 AI requests/day
  - Batch size optimization
  - Cache-first strategy

  ### Risk 4: Performance Degradation
  **Impact**: Slower API responses
  **Mitigation**:
  - Async processing (non-blocking)
  - Database query optimization (indexes)
  - Monitor p95 latency
  - Circuit breaker pattern for AI service

  ### Risk 5: Cache Pollution
  **Impact**: Wrong categories cached permanently
  **Mitigation**:
  - Phase 2 user feedback to correct
  - Admin dashboard for manual corrections
  - Confidence score threshold
  - Optional TTL for low-confidence entries

  ---

  ## Success Criteria

  ### Phase 1 (MVP) Goals

  - [ ] "Other" category usage reduced from ~30% to <10%
  - [ ] Transaction endpoint response time <100ms (p95)
  - [ ] AI categorization accuracy >85% (manual validation)
  - [ ] Monthly AI cost <$1
  - [ ] Zero critical bugs in production
  - [ ] Cache hit rate >40% within first month

  ### Phase 2 (Enhanced) Goals

  - [ ] "Other" category usage <5%
  - [ ] Cache hit rate >75% within 3 months
  - [ ] User feedback mechanism live
  - [ ] Category override feature working
  - [ ] Analytics dashboard showing AI performance

  ### Long-term Goals (6 months)

  - [ ] "Other" category usage <2%
  - [ ] Cache hit rate >85%
  - [ ] AI accuracy >90% (with user feedback learning)
  - [ ] Monthly cost stable at <$0.50
  - [ ] 90%+ users satisfied with categorization (survey)

  ---

  ## Technical Debt & Future Improvements

  ### Deferred to Later Phases

  1. **Context-Aware Categorization**
  - Same merchant, different categories based on amount
  - Example: "COSTCO" <$50 = Groceries, >$200 = Shopping

  2. **Multi-Category Support**
  - Return top 3 category probabilities
  - Let user choose in ambiguous cases

  3. **Pattern Learning from AI**
  - Extract new keywords from AI categorizations
  - Auto-update pattern matching rules

  4. **Scheduled Background Jobs**
  - Nightly cron to categorize "Other" transactions
  - Weekly cache cleanup (remove unused entries)

  5. **A/B Testing Framework**
  - Compare pattern-only vs AI-enhanced accuracy
  - Measure impact on user engagement

  6. **Mobile Offline Support**
  - Download merchant cache to mobile
  - Offline categorization using cached mappings

  ---

  ## Conclusion

  This hybrid AI categorization system provides a pragmatic, cost-effective solution to improve transaction categorization accuracy
  while maintaining IndusWealth's fast, responsive user experience.

  **Key Strengths:**
  - Minimal cost (~$0.45/month)
  - Fast response times (async processing)
  - Continuous learning (merchant cache)
  - Graceful degradation (fallback to patterns)
  - Full-stack implementation (backend + mobile)

  **Next Steps:**
  1. Review and approve this plan
  2. Set up development environment
  3. Begin Phase 1 implementation
  4. Track progress via task list

  ---

  **Document Version**: 1.0
  **Last Updated**: 2026-01-25
  **Author**: Claude (AI Assistant)
  **Status**: Ready for implementation


## Task List
√ Task #1 created: Create database migration for AI categorization tables
√ Task #2 created: Create AI categorization service
√ Task #3 created: Add database helper functions for AI categorization
√ Task #4 created: Update categorization service for hybrid approach
√ Task #5 created: Add environment variables for AI categorization
√ Task #6 created: Create backfill script for existing transactions
√ Task #7 created: Update transactions route for async categorization
√ Task #8 created: Update analytics route for async categorization
√ Task #9 created: Test backend AI categorization implementation
