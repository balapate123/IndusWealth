/**
 * Run with:  node --test packages/mobile/tests
 *
 * Node 22 detects the module syntax in src/utils, so these import the shipped
 * file directly rather than a copy of it. A copied algorithm keeps passing
 * forever after the original drifts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTreemap, squarify, OTHER_KEY } from '../src/utils/treemap.js';

const BOX = { w: 320, h: 200 };
const EPS = 1e-6;

const area = (r) => r.w * r.h;

/** Two rects overlap if they share interior area; touching edges is fine. */
function overlaps(a, b) {
    return a.x + EPS < b.x + b.w
        && b.x + EPS < a.x + a.w
        && a.y + EPS < b.y + b.h
        && b.y + EPS < a.y + a.h;
}

function assertTiles(tiles, box) {
    for (const t of tiles) {
        assert.ok(t.w > 0 && t.h > 0, `tile ${t.key} has no area: ${JSON.stringify(t)}`);
        assert.ok(t.x >= -EPS && t.y >= -EPS, `tile ${t.key} starts outside the box`);
        assert.ok(
            t.x + t.w <= box.w + EPS && t.y + t.h <= box.h + EPS,
            `tile ${t.key} overflows the box: ${JSON.stringify(t)}`
        );
    }

    for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
            assert.ok(!overlaps(tiles[i], tiles[j]), `${tiles[i].key} overlaps ${tiles[j].key}`);
        }
    }

    const covered = tiles.reduce((acc, t) => acc + area(t), 0);
    assert.ok(
        Math.abs(covered - box.w * box.h) < 0.01,
        `tiles cover ${covered}, box is ${box.w * box.h} — the layout leaks space`
    );
}

const SPEND = [
    { key: 'housing', value: 1450 },
    { key: 'food', value: 612.4 },
    { key: 'transport', value: 305 },
    { key: 'shopping', value: 190 },
    { key: 'health', value: 88 },
    { key: 'subs', value: 43.52 },
];

test('tiles fill the box exactly, without overlap or overflow', () => {
    assertTiles(buildTreemap(SPEND, BOX), BOX);
});

test('area is proportional to value', () => {
    const tiles = buildTreemap(SPEND, BOX);
    const total = SPEND.reduce((acc, s) => acc + s.value, 0);
    const boxArea = BOX.w * BOX.h;

    for (const tile of tiles) {
        const expected = (tile.value / total) * boxArea;
        assert.ok(
            Math.abs(area(tile) - expected) < 0.5,
            `${tile.key}: area ${area(tile).toFixed(2)} but value implies ${expected.toFixed(2)}`
        );
    }
});

test('tiles come back largest first, regardless of input order', () => {
    const shuffled = [SPEND[3], SPEND[0], SPEND[5], SPEND[1], SPEND[4], SPEND[2]];
    const keys = buildTreemap(shuffled, BOX).map((t) => t.key);
    assert.deepEqual(keys, ['housing', 'food', 'transport', 'shopping', 'health', 'subs']);
});

test('share sums to 1', () => {
    const sum = buildTreemap(SPEND, BOX).reduce((acc, t) => acc + t.share, 0);
    assert.ok(Math.abs(sum - 1) < EPS, `shares sum to ${sum}`);
});

test('zero, negative and non-numeric values are dropped, not drawn', () => {
    const tiles = buildTreemap(
        [
            { key: 'a', value: 100 },
            { key: 'zero', value: 0 },
            // A negative total means refunds outweighed spend — not a rectangle.
            { key: 'refunded', value: -40 },
            { key: 'missing', value: null },
            { key: 'nan', value: 'abc' },
            { key: 'b', value: 60 },
        ],
        BOX
    );

    assert.deepEqual(tiles.map((t) => t.key), ['a', 'b']);
    assertTiles(tiles, BOX);
});

test('a single category fills the whole box', () => {
    const [tile] = buildTreemap([{ key: 'only', value: 42 }], BOX);
    assert.equal(tile.w, BOX.w);
    assert.equal(tile.h, BOX.h);
    assert.equal(tile.share, 1);
});

test('no data, or a box with no size, returns nothing rather than NaN tiles', () => {
    assert.deepEqual(buildTreemap([], BOX), []);
    assert.deepEqual(buildTreemap(null, BOX), []);
    assert.deepEqual(buildTreemap(SPEND, { w: 0, h: 200 }), []);
    assert.deepEqual(buildTreemap(SPEND, undefined), []);
});

test('the tail folds into Other once it is more than one category', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, value: 100 - i * 5 }));
    const tiles = buildTreemap(many, BOX);

    assert.equal(tiles.length, 8, 'seven ramp hues plus Other');
    const other = tiles.find((t) => t.key === OTHER_KEY);
    assert.ok(other, 'the tail should be folded');
    assert.equal(other.folded, 5);
    assert.equal(other.value, many.slice(7).reduce((acc, c) => acc + c.value, 0));
    assertTiles(tiles, BOX);
});

test('a tail of exactly one keeps its own name — Other would just be a rename', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, value: 100 - i * 5 }));
    const tiles = buildTreemap(eight, BOX);

    assert.equal(tiles.length, 8);
    assert.ok(!tiles.some((t) => t.key === OTHER_KEY));
});

test('tiles stay squarish — this is the whole reason to squarify', () => {
    // The threshold is measured, not guessed. Laying rows along the LONGER side
    // instead of the shorter one still produces a valid, gap-free, correctly
    // proportioned treemap — it just makes slivers. Measured worst ratios:
    //
    //                     short side (correct)   long side (wrong)
    //   SPEND  320x200           1.65:1                5.52:1
    //   SPEND  200x700           1.96:1               23.92:1
    //   SKEWED 320x200           1.86:1               32.86:1
    //   SKEWED 200x700           2.96:1                7.01:1
    //
    // So 4:1 separates them with room on both sides. A looser bound lets the
    // sliver bug through on the phone-shaped box, which is the one that ships.
    const SKEWED = [
        { key: 'rent', value: 5000 },
        { key: 'b', value: 300 }, { key: 'c', value: 280 }, { key: 'd', value: 150 },
        { key: 'e', value: 90 }, { key: 'f', value: 60 }, { key: 'g', value: 25 },
        { key: 'h', value: 12 },
    ];

    for (const data of [SPEND, SKEWED]) {
        for (const box of [{ w: 320, h: 200 }, { w: 340, h: 180 }, { w: 200, h: 700 }, { w: 700, h: 200 }]) {
            for (const tile of buildTreemap(data, box)) {
                const ratio = Math.max(tile.w / tile.h, tile.h / tile.w);
                assert.ok(
                    ratio < 4,
                    `${tile.key} is a sliver at ${box.w}x${box.h}: ${ratio.toFixed(2)}:1`
                );
            }
        }
    }
});

test('squarify handles a tall box as well as a wide one', () => {
    const tall = { w: 200, h: 700 };
    assertTiles(buildTreemap(SPEND, tall), tall);

    const wide = { w: 700, h: 200 };
    assertTiles(buildTreemap(SPEND, wide), wide);
});

test('squarify covers the box for many equal values', () => {
    const areas = Array.from({ length: 9 }, () => (BOX.w * BOX.h) / 9);
    const rects = squarify(areas, { x: 0, y: 0, w: BOX.w, h: BOX.h });
    assertTiles(rects.map((r, i) => ({ ...r, key: `eq${i}` })), BOX);
});
