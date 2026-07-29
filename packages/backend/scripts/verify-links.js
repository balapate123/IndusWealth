#!/usr/bin/env node
/**
 * Verify every URL the app can hand a user.
 *
 *   node scripts/verify-links.js              # destinations only, no DB needed
 *   node scripts/verify-links.js --articles   # also verify the article catalog
 *
 * Run this after editing link_registry.js. A destination that fails here is a
 * dead link in production — that is the whole failure mode this change exists
 * to stop, so the script exits non-zero if any destination is broken.
 */

require('dotenv').config();

const { DESTINATIONS } = require('../src/services/link_registry');
const { probeUrl, verifyArticleLinks, STATUS } = require('../src/services/link_health');

const CONCURRENCY = 4;

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                results[index] = await worker(items[index]);
            }
        })
    );
    return results;
}

async function checkDestinations() {
    const entries = Object.entries(DESTINATIONS);
    console.log(`Checking ${entries.length} registry destinations...\n`);

    const results = await mapWithConcurrency(entries, CONCURRENCY, async ([key, entry]) => ({
        key,
        url: entry.url,
        result: await probeUrl(entry.url),
    }));

    let broken = 0;
    let unknown = 0;

    for (const { key, url, result } of results.sort((a, b) => a.key.localeCompare(b.key))) {
        if (result.status === STATUS.BROKEN) {
            broken++;
            console.log(`  BROKEN  ${key.padEnd(24)} ${result.reason.padEnd(12)} ${url}`);
        } else if (result.status === STATUS.UNKNOWN) {
            unknown++;
            console.log(`  ?       ${key.padEnd(24)} ${result.reason.padEnd(12)} ${url}`);
        } else {
            console.log(`  ok      ${key.padEnd(24)} ${String(result.httpStatus).padEnd(12)} ${url}`);
        }
    }

    console.log(`\n${entries.length - broken - unknown} ok, ${broken} broken, ${unknown} unreachable`);
    return broken;
}

async function main() {
    const broken = await checkDestinations();

    if (process.argv.includes('--articles')) {
        console.log('\nChecking article catalog...\n');
        const summary = await verifyArticleLinks({ limit: 500, force: true });
        if (summary.brokenUrls.length > 0) {
            console.log('\nBroken article URLs (now marked in the database):');
            summary.brokenUrls.forEach((url) => console.log(`  ${url}`));
        }
    }

    // Unreachable is not a failure — a publisher blocking our agent is not a
    // dead link, and failing the build on it would make this script useless.
    process.exit(broken > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
