const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const plaidService = require('../services/plaid');
const db = require('../services/db');
const { createLogger } = require('../services/logger');

const logger = createLogger('PLAID_WEBHOOK');

// JWK public key cache — refreshed every 5 minutes
const jwkCache = new Map();
const JWK_CACHE_TTL_MS = 5 * 60 * 1000;

async function getVerificationKey(kid) {
    const cached = jwkCache.get(kid);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.key;
    }

    const jwk = await plaidService.getWebhookVerificationKey(kid);
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    jwkCache.set(kid, { key, expiresAt: Date.now() + JWK_CACHE_TTL_MS });
    return key;
}

async function verifySignature(req) {
    const token = req.headers['plaid-verification'];
    if (!token) {
        throw new Error('Missing Plaid-Verification header');
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header?.kid) {
        throw new Error('Invalid verification JWT — missing kid');
    }

    const key = await getVerificationKey(decoded.header.kid);

    // Throws if signature is invalid or token is expired
    const payload = jwt.verify(token, key, { algorithms: ['ES256'] });

    // Verify the body hash matches
    const rawBody = req.rawBody;
    if (!rawBody) {
        throw new Error('Raw body not captured — cannot verify signature');
    }

    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (payload.request_body_sha256 !== bodyHash) {
        throw new Error('Body hash mismatch — request may be tampered');
    }
}

// POST /plaid/webhook
// Receives Plaid webhook events — no auth middleware, verified via Plaid signature
router.post('/', async (req, res) => {
    // Always respond 200 quickly so Plaid doesn't retry
    res.sendStatus(200);

    try {
        await verifySignature(req);
    } catch (err) {
        logger.warn('Webhook signature verification failed', { error: err.message });
        return; // Already sent 200, but don't process unverified events
    }

    const { webhook_type, webhook_code, item_id, error } = req.body;
    logger.info('Webhook received', { webhook_type, webhook_code, item_id });

    try {
        switch (webhook_type) {
            case 'TRANSACTIONS': {
                if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
                    // New transactions are available for sync.
                    // In production, trigger a background sync job here.
                    logger.info('New transactions available for sync', { item_id });
                }
                break;
            }

            case 'ITEM': {
                if (webhook_code === 'ITEM_LOGIN_REQUIRED') {
                    // The user's bank credentials have changed — re-auth needed.
                    // Mark the item as needing update so the app can prompt the user.
                    logger.warn('Bank re-authentication required', { item_id });
                    try {
                        await db.query(
                            `UPDATE accounts SET needs_reauth = true
                             WHERE plaid_item_id = $1`,
                            [item_id]
                        );
                    } catch (dbErr) {
                        // Column may not exist yet — log and continue
                        logger.warn('Could not update reauth flag (run migration?)', { error: dbErr.message });
                    }
                } else if (webhook_code === 'PENDING_EXPIRATION') {
                    logger.warn('Plaid access token pending expiration', { item_id });
                } else if (webhook_code === 'ERROR') {
                    logger.error('Plaid item error', { item_id, error });
                } else if (webhook_code === 'WEBHOOK_UPDATE_ACKNOWLEDGED') {
                    logger.info('Webhook URL update acknowledged by Plaid', { item_id });
                }
                break;
            }

            case 'INCOME': {
                logger.info('Income webhook', { webhook_code, item_id });
                break;
            }

            default:
                logger.info('Unhandled webhook type', { webhook_type, webhook_code });
        }
    } catch (handlerErr) {
        logger.error('Webhook handler error', { webhook_type, webhook_code, error: handlerErr.message });
    }
});

module.exports = router;
