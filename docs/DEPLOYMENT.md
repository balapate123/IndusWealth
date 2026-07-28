# IndusWealth — Environments & Deployment

Two fully-isolated backend environments on the **same** GitHub repo
(`balapate123/IndusWealth`). Staging exists so changes can be tested against a
real deploy + real Plaid **before** they reach production users on the Play Store.

## Environments

| | 🟢 Production | 🟡 Staging |
|---|---|---|
| Git branch | `feature/web-export-fix` | `dev` |
| Render service | `IndusWealth` (created manually) | `induswealth-staging` (Blueprint: `render.yaml`) |
| Backend URL | https://induswealth.onrender.com | https://induswealth-staging.onrender.com |
| Database | prod Postgres | **separate** staging Postgres (`induswealth-staging-db`) |
| Plaid | production | production (real connections) |
| Mobile EAS profile | `production` (AAB → Play) | `preview` (internal APK) and `development` (dev client) |
| Auto-deploy trigger | push to `feature/web-export-fix` | push to `dev` |
| Region / build | ohio · root `packages/backend` · `npm install` · `node index.js` |

> Config parity: staging mirrors prod's env keys (`NODE_ENV=production`,
> `PLAID_ENV=production`, `JWT_EXPIRES_IN`, `INSIGHTS_CACHE_HOURS`,
> `AI_CATEGORIZATION_ENABLED=false`, plus the secrets). `CORS_ORIGINS` is unset
> in both, so both allow all origins (fine for a native app + a test box).

## Everyday workflow

```
feature/*  ──merge──▶  dev  ──auto-deploy──▶  staging  (test here)
                        │
                        └──merge/PR──▶  feature/web-export-fix  ──auto-deploy──▶  production
```

1. Branch new work off `dev`.
2. Merge into `dev` and push → Render auto-deploys staging.
3. Build a staging APK and test on a device:
   ```bash
   cd packages/mobile
   eas build --profile preview --platform android
   ```
   (The `preview` profile points `EXPO_PUBLIC_API_URL` at the staging backend.)
4. When it's solid, merge `dev` → `feature/web-export-fix` → prod auto-deploys.
5. Build the production AAB and submit to Play:
   ```bash
   eas build --profile production --platform android
   eas submit --profile production --platform android
   ```

## One-time staging setup (Render Blueprint)

1. **Render Dashboard → New → Blueprint.**
2. Select repo `balapate123/IndusWealth`, branch **`dev`**. Render reads
   `render.yaml` and shows the service `induswealth-staging` + database
   `induswealth-staging-db`.
3. It will prompt for the secret env vars (`sync: false`). Paste:
   - `ENCRYPTION_KEY` — the fresh 64-hex key (generated during setup; **not** the prod key)
   - `JWT_SECRET` — the fresh generated value
   - `PLAID_CLIENT_ID`, `PLAID_SECRET` — **same** production values as the prod service
   - `GEMINI_API_KEY`, `RESEND_API_KEY` — same as prod
   - `ADMIN_SECRET` — same as prod (or a new value)
4. **Apply.** Render creates the DB, wires `DATABASE_URL`, and deploys. On first
   boot the backend auto-runs all migrations against the empty staging DB.
5. Verify: `https://induswealth-staging.onrender.com/health` → `{"status":"ok"}`.
6. If Render assigns a URL other than `induswealth-staging.onrender.com` (name
   collision), update `EXPO_PUBLIC_API_URL` in `packages/mobile/eas.json`
   (`preview` profile) to the real URL.

### Caveats (free tier)
- Free web service spins down after ~15 min idle (first request cold-starts ~30s).
- Free Postgres is deleted after **30 days**. To recreate: provision a new
  staging DB and update `DATABASE_URL` (migrations re-run on boot). For a
  persistent box, bump the `plan:` values in `render.yaml` to a paid tier.

## Which backend is a build talking to?

Every EAS profile now sets `EXPO_PUBLIC_API_URL` explicitly — `development`
and `preview` at staging, `production` at production. This matters: a profile
with no `env` block falls back to `packages/mobile/.env`, which points at
**production**, so a build you believe is on staging can quietly be on prod.
The only symptom is confusing errors from the wrong server.

As a second line of defence, Profile's footer shows the API host on any build
not pointed at production. If you see no host there, you are on production.

## Secrets
Never commit real secret values. `ENCRYPTION_KEY` / `JWT_SECRET` for staging are
generated locally and pasted straight into Render. They are independent of prod —
because the staging database is separate, a different `ENCRYPTION_KEY` is correct
and safe (there is no prod-encrypted data for staging to read).
