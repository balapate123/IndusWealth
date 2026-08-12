/**
 * Squarified treemap layout — pure geometry, no expo, no react-native, no device.
 *
 * Split out like utils/goalReminders.js so it can be exercised in plain Node.
 * The reason it is worth testing rather than eyeballing: a treemap that is
 * subtly wrong still *looks* like a treemap. Tiles that overflow the container
 * by a fraction of a pixel, or areas that drift from their values, read as a
 * plausible chart while misstating the numbers — which is worse than a chart
 * that obviously fails to render.
 *
 * Algorithm is Bruls, Huizing & van Wijk (2000): lay each row along the shorter
 * side of the space that is left, extending the row while the worst aspect
 * ratio in it keeps improving. Naive slice-and-dice instead produces long thin
 * slivers whose areas are impossible to compare, which is the whole point of
 * using a treemap over a bar.
 */

/** Tiles beyond this fold into "Other" — the ramp rule in constants/tokens.js. */
export const DEFAULT_MAX_TILES = 7;

export const OTHER_KEY = '__other__';

/**
 * Worst aspect ratio in a row of `sum` total area laid along `side`.
 *
 * A tile of area `a` in that row measures (a/thickness) x thickness, where
 * thickness = sum/side. The extremes of the ratio are always the largest and
 * smallest tiles, so the whole row is judged by those two.
 */
function worstRatio(sum, min, max, side) {
    if (sum <= 0 || side <= 0 || min <= 0) return Infinity;
    const sideSq = side * side;
    const sumSq = sum * sum;
    return Math.max((sideSq * max) / sumSq, sumSq / (sideSq * min));
}

/**
 * Lay out areas inside a rectangle.
 *
 * @param {number[]} areas  positive areas, descending, summing to rect.w * rect.h
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{x:number,y:number,w:number,h:number}[]} one rect per area, same order
 */
export function squarify(areas, rect) {
    const out = new Array(areas.length);
    let { x, y, w, h } = rect;
    let i = 0;

    while (i < areas.length) {
        // Rows go across the shorter side. Using the longer one is what
        // generates slivers.
        const side = Math.min(w, h);

        // Extend the row while the worst ratio improves. `best` is the ratio of
        // the row as it currently stands; the first tile always joins, because
        // a row of one is the only option available at that point.
        let sum = 0;
        let min = Infinity;
        let max = 0;
        let best = Infinity;
        let j = i;

        while (j < areas.length) {
            const v = areas[j];
            const nextSum = sum + v;
            const nextMin = Math.min(min, v);
            const nextMax = Math.max(max, v);
            const ratio = worstRatio(nextSum, nextMin, nextMax, side);

            if (j > i && ratio > best) break;

            sum = nextSum;
            min = nextMin;
            max = nextMax;
            best = ratio;
            j++;
        }

        // Place tiles i..j-1. The last row is forced to consume the remaining
        // space exactly, so floating-point drift cannot leave a hairline gap or
        // push the final tile a fraction outside the container.
        const last = j >= areas.length;

        if (w <= h) {
            const thickness = last ? h : sum / w;
            let cx = x;
            for (let k = i; k < j; k++) {
                const tw = k === j - 1 ? x + w - cx : (areas[k] / sum) * w;
                out[k] = { x: cx, y, w: tw, h: thickness };
                cx += tw;
            }
            y += thickness;
            h -= thickness;
        } else {
            const thickness = last ? w : sum / h;
            let cy = y;
            for (let k = i; k < j; k++) {
                const th = k === j - 1 ? y + h - cy : (areas[k] / sum) * h;
                out[k] = { x, y: cy, w: thickness, h: th };
                cy += th;
            }
            x += thickness;
            w -= thickness;
        }

        i = j;
    }

    return out;
}

/**
 * Turn category totals into positioned tiles.
 *
 * Folds the tail into "Other" because the categorical ramp holds seven hues and
 * a treemap has no room for a legend — past that the tiles stop being
 * identifiable, whatever colour they are given.
 *
 * @param {{key:string, value:number}[]} items  unsorted; extra fields are preserved
 * @param {{w:number,h:number}} box
 * @param {{maxTiles?:number, otherLabel?:string}} [options]
 * @returns {{key:string, value:number, share:number, x:number, y:number, w:number, h:number}[]}
 */
export function buildTreemap(items, box, options = {}) {
    const maxTiles = options.maxTiles ?? DEFAULT_MAX_TILES;
    const otherLabel = options.otherLabel ?? 'Other';

    const width = Number(box?.w);
    const height = Number(box?.h);
    if (!(width > 0) || !(height > 0)) return [];

    // A category with no spend has no area, and a negative total means refunds
    // outweighed spend — neither is representable as a rectangle.
    const usable = (items || [])
        .map((it) => ({ ...it, value: Number(it?.value) }))
        .filter((it) => Number.isFinite(it.value) && it.value > 0)
        .sort((a, b) => b.value - a.value);

    if (usable.length === 0) return [];

    // Fold the tail — unless the tail is a single category, in which case
    // "Other" would be a rename rather than a summary.
    let nodes = usable;
    if (usable.length > maxTiles + 1) {
        const head = usable.slice(0, maxTiles);
        const tail = usable.slice(maxTiles);
        nodes = head.concat({
            key: OTHER_KEY,
            label: otherLabel,
            value: tail.reduce((acc, it) => acc + it.value, 0),
            folded: tail.length,
        });
    }

    const total = nodes.reduce((acc, it) => acc + it.value, 0);
    const scale = (width * height) / total;
    const rects = squarify(nodes.map((it) => it.value * scale), { x: 0, y: 0, w: width, h: height });

    return nodes.map((node, index) => ({
        ...node,
        share: node.value / total,
        ...rects[index],
    }));
}
