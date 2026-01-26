# 🔧 Deployment Fix - Run These Steps

Your app is working but AI categorization needs to be enabled properly.

## What's Happening Now

✅ **Working**: Transactions showing, analytics working
❌ **Not Working**: AI categorization (tables don't exist yet)

The logs show:
```
Error: relation "merchant_category_cache" does not exist
Error: relation "ai_categorization_log" does not exist
```

## Quick Fix Steps

### Step 1: Deploy the Code Fixes

```bash
cd "C:\Users\atbha\Projects\AntiGravity Projects\IndusWealth"

git add .
git commit -m "fix: Add graceful error handling for AI categorization

- Fix circular dependency in ai_categorization.js
- Add lazy loading for CATEGORY_PATTERNS
- Improve error handling when tables don't exist
- App works fine even if AI features aren't enabled yet"

git push origin main
```

Render will auto-deploy.

### Step 2: Run Migrations on Render

**Option A: Via Render Shell (Recommended)**
1. Go to Render dashboard
2. Click on your backend service
3. Click "Shell" tab
4. Run:
   ```bash
   cd packages/backend
   npm run migrate
   ```

Expected output:
```
✓ Skipping init.sql (already executed)
✓ Skipping add_custom_debts.sql (already executed)
✓ Skipping add_user_dob.sql (already executed)
✓ Skipping add_ai_insights.sql (already executed)
→ Executing migration: add_ai_categorization.sql...
✓ Completed: add_ai_categorization.sql
✓ All migrations completed successfully.
```

**Option B: Trigger via Build**
The migrations should run automatically on build, but might have failed. Check Render logs for:
```
Running database migrations...
```

If you don't see this, the build script isn't running. Make sure `package.json` has:
```json
"scripts": {
  "build": "node scripts/migrate.js"
}
```

### Step 3: Verify Migrations Worked

In Render Shell:
```bash
cd packages/backend
node -e "const { pool } = require('./src/services/db'); pool.query('SELECT COUNT(*) FROM merchant_category_cache').then(r => console.log('Table exists:', r.rows)).catch(e => console.error('Error:', e.message)).finally(() => pool.end());"
```

Should output:
```
Table exists: [ { count: '0' } ]
```

### Step 4: Enable AI Categorization (Optional)

**In Render Dashboard** → Environment → Add:
```
AI_CATEGORIZATION_ENABLED=true
```

Then **restart** the service.

**Note**: You can leave this as `false` for now. The app works fine without it. When you're ready to test AI categorization, flip this to `true`.

### Step 5: Test in Mobile App

1. Pull to refresh transactions
2. Check logs - should NOT see "relation does not exist" errors
3. AI categorization will fail silently (expected if `AI_CATEGORIZATION_ENABLED=false`)

---

## Why This Happened

1. **Build script was added** (`npm run build`) but migrations may not have run on first deploy
2. **Tables were missing** so AI categorization crashed
3. **I added error handling** so app keeps working even if tables don't exist
4. **Circular dependency** between categorization.js ↔ ai_categorization.js caused crashes

## Current State (After Fixes)

✅ App won't crash if AI tables don't exist
✅ App won't crash if imports fail
✅ Transactions/Analytics work without AI
✅ AI categorization fails gracefully in background
⚠️ Need to run migrations to create tables
⚠️ Need to set `AI_CATEGORIZATION_ENABLED=true` to activate

---

## Testing AI Categorization (After Migration)

Once migrations are done and `AI_CATEGORIZATION_ENABLED=true`:

```bash
# In Render Shell
cd packages/backend

# Test the service
node scripts/test_ai_categorization.js
```

Expected output:
```
✓ LYFT → Transportation
✓ WEALTHSIMPLE → Investments
✓ Successfully retrieved from cache
```

Then run backfill (one-time):
```bash
node scripts/backfill_ai_categories.js
```

---

## TL;DR

1. **Push code fixes** (git commit + push)
2. **SSH to Render** → Run `npm run migrate`
3. **Verify** tables exist
4. **Optional**: Set `AI_CATEGORIZATION_ENABLED=true` and restart
5. **Test** in mobile app

Your app should work fine right now even without the migrations. The AI stuff just won't work until you run migrations and enable the feature.
