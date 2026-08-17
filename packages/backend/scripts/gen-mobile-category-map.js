/**
 * Regenerates packages/mobile/src/utils/categoryMap.js from the backend map.
 *
 *   node scripts/gen-mobile-category-map.js          # write
 *   node scripts/gen-mobile-category-map.js --check  # verify, exit 1 on drift
 *
 * The two packages cannot import each other at runtime — the mobile bundle is
 * Metro/ESM and the backend is CommonJS — so the table is copied. Copying it by
 * hand is how CATEGORY_PATTERNS drifted; this makes the copy mechanical and
 * `tests/category_map.test.mjs` on mobile fails if anyone edits the copy.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const srcPath = path.join(repoRoot, 'packages/backend/src/services/category_map.js');
const outPath = path.join(repoRoot, 'packages/mobile/src/utils/categoryMap.js');

const OLD_NOTE = [
    ' * Mirrored on mobile in `packages/mobile/src/utils/categoryMap.js` — the two',
    ' * must agree. `tests/category_map.test.js` in each package asserts the shared',
    ' * vocabulary, so a name added to one and not the other fails a test rather than',
    ' * silently reintroducing a duplicate.',
].join('\n');

const NEW_NOTE = [
    ' * GENERATED from `packages/backend/src/services/category_map.js` — edit that',
    ' * file, never this one. `tests/category_map.test.mjs` loads the backend module',
    ' * and deep-compares both tables, so editing one and not the other fails a test',
    ' * rather than silently reintroducing a duplicate vocabulary.',
].join('\n');

const fail = (message) => {
    console.error(`✗ ${message}`);
    process.exit(1);
};

const src = fs.readFileSync(srcPath, 'utf8');

let out = src
    .replace(
        /^const (CANONICAL_CATEGORIES|OTHER_CATEGORY|PLAID_CATEGORY_MAP|canonicalizeCategory|mergeCanonicalRows) =/gm,
        'export const $1 ='
    )
    .replace(/\nmodule\.exports = \{[\s\S]*?\};\n/, '\n');

if (!out.includes(OLD_NOTE)) {
    fail('the header note in category_map.js changed shape — update OLD_NOTE in this script.');
}
out = out.replace(OLD_NOTE, NEW_NOTE);

if (/module\.exports/.test(out)) fail('module.exports survived the transform.');

const exportCount = (out.match(/^export const /gm) || []).length;
if (exportCount !== 5) fail(`expected 5 exports after the transform, found ${exportCount}.`);

out = out.trimEnd() + '\n';

if (process.argv.includes('--check')) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (current !== out) {
        fail('packages/mobile/src/utils/categoryMap.js is stale. Run: node scripts/gen-mobile-category-map.js');
    }
    console.log('✓ mobile category map is in sync');
    process.exit(0);
}

fs.writeFileSync(outPath, out);
console.log(`✓ wrote ${path.relative(repoRoot, outPath)}`);
