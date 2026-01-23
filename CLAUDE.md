# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IndusWealth is a personal finance application with a React Native mobile frontend and Node.js/Express backend. It integrates with Plaid for bank account aggregation and provides debt payoff analysis tools.

## Monorepo Structure

This is an npm workspaces monorepo with two packages:
- `packages/backend` - Express API server
- `packages/mobile` - React Native (Expo) mobile app

## Development Commands

### Database
```bash
docker-compose up -d          # Start PostgreSQL on port 5432
```

### Backend (packages/backend)
```bash
npm run dev:backend           # From root - starts with nodemon
# OR from packages/backend:
npm run dev                   # nodemon index.js
npm run migrate               # Run database migrations
```

### Mobile (packages/mobile)
```bash
npm run dev:mobile            # From root - starts Expo
# OR from packages/mobile:
npx expo start                # Start Expo dev server
npx expo start --android      # Direct Android launch
npx expo start --ios          # Direct iOS launch
```

## Architecture

### Backend API Structure

Routes (`/src/routes/`):
- `/users` - Authentication (login, signup, profile)
- `/plaid` - Plaid Link token creation and token exchange
- `/accounts` - Bank account data
- `/transactions` - Transaction listing with Plaid sync
- `/debt` - Debt overview and payoff calculations
- `/analytics` - Spending analytics
- `/watchdog` - Recurring expense detection

Services (`/src/services/`):
- `db.js` - PostgreSQL connection pool and query helpers
- `plaid.js` - Plaid API client wrapper
- `debt_calculator.js` - Snowball/Avalanche payoff algorithms
- `categorization.js` - Transaction categorization logic

Authentication uses JWT tokens via `middleware/auth.js`. The `authenticateToken` middleware validates Bearer tokens and attaches `req.user`.

### Mobile App Structure

Navigation (`/src/navigation/AppNavigator.js`):
- Auth Stack: Login → Signup → ConnectBank
- Main Tabs: Home, Wealth (Debt), Watchdog, Profile
- Modal Screens: AllTransactions, Analytics, AccountTransactions, AllAccounts

Services (`/src/services/`):
- `api.js` - HTTP client with JWT auth and all API methods
- `cache.js` - AsyncStorage wrapper for offline data caching

Key patterns:
- Two-layer caching: mobile AsyncStorage + server PostgreSQL with 24hr refresh policy
- Global user ID stored in `global.CURRENT_USER_ID` for legacy compatibility
- Theme constants in `/src/constants/theme.js` (dark theme with gold accents)

### Database Schema

Core tables (see `db/init.sql`):
- `users` - Authentication and Plaid credentials
- `accounts` - Linked bank accounts from Plaid
- `transactions` - Synced transactions
- `sync_log` - Tracks last Plaid sync timestamps

## Environment Variables

Backend (`packages/backend/.env`):
```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=induswealth
DB_USER=induswealth
DB_PASSWORD=induswealth123
PLAID_CLIENT_ID=<from Plaid dashboard>
PLAID_SECRET=<from Plaid dashboard>
PLAID_ENV=sandbox
JWT_SECRET=<production secret>
```

Mobile: Set `EXPO_PUBLIC_API_URL` to override the default API endpoint.

## Test Credentials

- App login: `demo@induswealth.com` / `demo123`
- Plaid sandbox: `user_good` / `pass_good`
