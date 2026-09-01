/**
 * Run with:  npm test   (from packages/mobile)
 *
 * CheckinNudge.js imports react-native, so it cannot be loaded here. Its ICONS
 * map is read as source instead — cruder than importing it, and it still fails
 * on the thing that actually goes wrong: the backend gains a nudge kind and
 * this map does not.
 *
 * That failure is silent by design elsewhere. `ICONS[nudge.kind] || 'sparkles'`
 * degrades to a generic icon rather than crashing, which is right at runtime
 * and useless as a signal — nobody notices a sparkle. constants/insights.js had
 * the same shape without the fallback and every insight card rendered a generic
 * bulb with a raw enum string above the title for as long as it shipped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const { NUDGE_KINDS } = require('../../backend/src/services/nudges.js');
const source = readFileSync(join(here, '../src/components/CheckinNudge.js'), 'utf8');

/** The keys of the ICONS object literal, read out of the source. */
const iconKeys = () => {
    const block = source.match(/const ICONS = \{([\s\S]*?)\n\};/);
    assert.ok(block, 'the ICONS map is no longer an object literal named ICONS');
    return [...block[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
};

test('every nudge kind the server can send has an icon', () => {
    const icons = new Set(iconKeys());
    for (const kind of NUDGE_KINDS) {
        assert.ok(icons.has(kind), `no icon for nudge kind "${kind}"`);
    }
});

test('and no icon is mapped to a kind the server never sends', () => {
    // A leftover key is a rename nobody finished. Harmless on screen, and the
    // cheapest possible moment to notice it.
    const declared = new Set(NUDGE_KINDS);
    for (const key of iconKeys()) {
        assert.ok(declared.has(key), `icon mapped to unknown nudge kind "${key}"`);
    }
});

test('there is still a fallback, because a stale build will meet a new kind', () => {
    // Mobile builds lag the server — there is no OTA, so an installed app can
    // be months behind. Rendering nothing, or throwing, would be worse than a
    // generic icon on a nudge whose text is perfectly readable.
    assert.match(source, /ICONS\[nudge\.kind\]\s*\|\|/);
});
