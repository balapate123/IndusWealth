/**
 * Link Health
 *
 * `educational_articles.url_status` has existed since add_insights_upgrade.sql
 * and every read query filters on `url_status = 'active'` — but nothing ever
 * wrote 'broken'. The column was a filter over a value that could only be one
 * thing. This is what writes it.
 *
 * Runs a small batch after the curated sync on boot. Deliberately bounded: a
 * few dozen HEAD requests to public pages, oldest-verified first, so it drains
 * the catalog over successive boots instead of hammering anyone.
 */

const { pool } = require('./db');
const { isAllowedUrl } = require('./link_registry');

const TIMEOUT_MS = Number.parseInt(process.env.LINK_HEALTH_TIMEOUT_MS, 10) || 8000;
const BATCH_SIZE = Number.parseInt(process.env.LINK_HEALTH_BATCH, 10) || 25;
const RECHECK_AFTER_DAYS = Number.parseInt(process.env.LINK_HEALTH_RECHECK_DAYS, 10) || 7;
const CONCURRENCY = 4;

// Some publishers 403 an unrecognised agent. Identify honestly rather than
// impersonating a browser — if a site does not want this traffic, the right
// outcome is 'unknown' and a human decision, not evasion.
const USER_AGENT = 'IndusWealth-LinkCheck/1.0 (+https://induswealth.app)';

const STATUS = {
    ACTIVE: 'active',
    BROKEN: 'broken',
    UNKNOWN: 'unknown',
};

/**
 * Probe a single URL.
 *
 * The distinction that matters: a 404 means the page is gone and we should stop
 * showing it. A 403, a 429 or a timeout means we were blocked or unlucky, and
 * marking those 'broken' would quietly empty the catalog over a few weeks.
 *
 * @returns {{status: string, httpStatus: number|null, reason: string}}
 */
async function probeUrl(url, { timeoutMs = TIMEOUT_MS } = {}) {
    // A URL off the allowlist is broken by policy regardless of what it returns.
    // This is the net that catches articles cached back when the AI wrote URLs.
    if (!isAllowedUrl(url)) {
        return { status: STATUS.BROKEN, httpStatus: null, reason: 'not_allowlisted' };
    }

    const request = async (method) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method,
                redirect: 'follow',
                signal: controller.signal,
                headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
            });
        } finally {
            clearTimeout(timer);
        }
    };

    const classify = (httpStatus) => {
        if (httpStatus === 404 || httpStatus === 410) {
            return { status: STATUS.BROKEN, httpStatus, reason: `http_${httpStatus}` };
        }
        if (httpStatus >= 200 && httpStatus < 400) {
            return { status: STATUS.ACTIVE, httpStatus, reason: 'ok' };
        }
        return { status: STATUS.UNKNOWN, httpStatus, reason: `http_${httpStatus}` };
    };

    try {
        const head = await request('HEAD');
        // 403/405/501 usually means "we don't do HEAD" or "we don't like your
        // agent", not "gone" — confirm with a GET before believing it.
        if (head.status === 403 || head.status === 405 || head.status === 501) {
            const get = await request('GET');
            return classify(get.status);
        }
        return classify(head.status);
    } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timeout' : `network_${error?.code || error?.name || 'error'}`;
        return { status: STATUS.UNKNOWN, httpStatus: null, reason };
    }
}

/**
 * Run probes with a fixed number of workers.
 */
async function _mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}

/**
 * Verify a batch of article links and write url_status.
 *
 * @param {{limit?: number, force?: boolean}} options
 *   force - ignore the recheck window and take the oldest `limit` rows
 * @returns {{checked: number, active: number, broken: number, unknown: number, brokenUrls: string[]}}
 */
async function verifyArticleLinks({ limit = BATCH_SIZE, force = false } = {}) {
    const staleClause = force
        ? ''
        : `AND (last_verified_at IS NULL OR last_verified_at < NOW() - INTERVAL '${RECHECK_AFTER_DAYS} days')`;

    const { rows } = await pool.query(
        `SELECT id, external_url, url_status
         FROM educational_articles
         WHERE url_status <> 'broken' ${staleClause}
         ORDER BY last_verified_at ASC NULLS FIRST, id ASC
         LIMIT $1`,
        [limit]
    );

    if (rows.length === 0) {
        return { checked: 0, active: 0, broken: 0, unknown: 0, brokenUrls: [] };
    }

    const probes = await _mapWithConcurrency(rows, CONCURRENCY, async (row) => ({
        row,
        result: await probeUrl(row.external_url),
    }));

    const summary = { checked: rows.length, active: 0, broken: 0, unknown: 0, brokenUrls: [] };

    for (const { row, result } of probes) {
        if (result.status === STATUS.BROKEN) {
            summary.broken++;
            summary.brokenUrls.push(row.external_url);
            await pool.query(
                `UPDATE educational_articles
                 SET url_status = 'broken', last_verified_at = NOW()
                 WHERE id = $1`,
                [row.id]
            );
            console.warn(`[link-health] BROKEN (${result.reason}): ${row.external_url}`);
        } else if (result.status === STATUS.ACTIVE) {
            summary.active++;
            await pool.query(
                `UPDATE educational_articles
                 SET url_status = 'active', last_verified_at = NOW()
                 WHERE id = $1`,
                [row.id]
            );
        } else {
            // Unreachable, not proven gone. Leave the status alone but bump the
            // timestamp so a permanently flaky host cannot monopolise the batch.
            summary.unknown++;
            await pool.query(
                `UPDATE educational_articles SET last_verified_at = NOW() WHERE id = $1`,
                [row.id]
            );
        }
    }

    console.log(
        `[link-health] checked ${summary.checked}: ${summary.active} ok, ${summary.broken} broken, ${summary.unknown} unreachable`
    );
    return summary;
}

module.exports = {
    STATUS,
    probeUrl,
    verifyArticleLinks,
};
