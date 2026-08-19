/**
 * Run with:  npm test   (from packages/backend)
 *
 * The regression these lock down: five of the twelve guides never resolved,
 * because the file is keyed on a display name and the detector emits an
 * uppercase one. Four of those five were the only merchants with negotiation
 * scripts, so Negotiate worked for exactly one merchant in the app.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const guides = require('../src/data/cancellation_guides.json');
const aliases = require('../src/data/merchant_aliases.json');
const {
    merchantSlug,
    guideKeyFor,
    findGuide,
    hasNegotiationScript,
    buildGuide,
    APP_STORE_TIP,
} = require('../src/services/merchant_guides');

const { CANONICAL_CATEGORIES } = require('../src/services/category_map');

// ---------------------------------------------------------------------------
// The reported bug
// ---------------------------------------------------------------------------

test('every guide resolves from the uppercase name the detector produces', () => {
    // ROGERS, BELL, TELUS, ADOBE and ENBRIDGE all returned undefined before the
    // slug index existed.
    const missing = Object.keys(guides).filter((key) => !findGuide(key.toUpperCase()));
    assert.deepEqual(missing, [], 'guides unreachable from their own uppercase name');
});

test('every guide resolves from its own key and display name', () => {
    for (const [key, guide] of Object.entries(guides)) {
        assert.equal(guideKeyFor(key), key, `${key} does not resolve from its key`);
        if (guide.displayName) {
            assert.equal(guideKeyFor(guide.displayName), key, `${key} does not resolve from displayName`);
        }
    }
});

test('every alias pointing at a guided merchant resolves to that guide', () => {
    for (const [alias, target] of Object.entries(aliases)) {
        if (!guides[target]) continue;
        assert.equal(guideKeyFor(alias), target, `alias ${alias} does not reach ${target}`);
    }
});

test('the specific name that broke it', () => {
    // ROGERS *MOBILE normalises to ROGERS: the '*' suffix is stripped, and the
    // alias table only holds ROGERS WIRELESS / CABLE / COMM.
    assert.equal(guideKeyFor('ROGERS'), 'Rogers');
    assert.equal(guideKeyFor('BELL'), 'Bell');
    assert.equal(guideKeyFor('TELUS'), 'Telus');
    assert.equal(guideKeyFor('ADOBE'), 'Adobe');
    assert.equal(guideKeyFor('ENBRIDGE'), 'Enbridge');
});

test('negotiation is offered for every merchant that has a script, and no others', () => {
    const withScript = Object.entries(guides)
        .filter(([, g]) => g.negotiation)
        .map(([k]) => k);

    // Four of these five were unreachable, which is why Negotiate never worked.
    assert.deepEqual(withScript.sort(), ['Adobe', 'Bell', 'GoodLife Fitness', 'Rogers', 'Telus']);

    for (const key of withScript) {
        assert.equal(hasNegotiationScript(key.toUpperCase()), true, `${key} script unreachable`);
    }
    assert.equal(hasNegotiationScript('Netflix'), false, 'Netflix has no retention line');
    assert.equal(hasNegotiationScript('SOME RANDOM SHOP'), false);
});

test('slugging collapses the forms a merchant name actually arrives in', () => {
    assert.equal(merchantSlug('Rogers'), 'rogers');
    assert.equal(merchantSlug('ROGERS'), 'rogers');
    assert.equal(merchantSlug('GoodLife Fitness'), 'goodlife_fitness');
    assert.equal(merchantSlug('PETRO-CANADA'), 'petro_canada');
    assert.equal(merchantSlug('Microsoft 365'), 'microsoft_365');
});

// ---------------------------------------------------------------------------
// A guide is never null
// ---------------------------------------------------------------------------

test('an unknown merchant still gets a usable guide', () => {
    // The dead end: recordAction returned null and the sheet never opened, so
    // the button flipped a hidden status and nothing happened on screen.
    const guide = buildGuide({ merchantName: 'PIONEER', action: 'stop', category: 'Gas & Fuel' });
    assert.ok(guide, 'a null guide is a dead button');
    assert.equal(guide.tier, 'generic');
    assert.ok(guide.steps.length > 0);
});

test('an unknown merchant in a known category gets its category guidance', () => {
    const guide = buildGuide({ merchantName: 'SOME STREAMER', action: 'stop', category: 'Subscriptions' });
    assert.equal(guide.tier, 'category');
    assert.ok(guide.steps.length > 0);
});

test('a known merchant still gets its own steps', () => {
    const guide = buildGuide({ merchantName: 'NETFLIX', action: 'stop', category: 'Subscriptions' });
    assert.equal(guide.tier, 'merchant');
    assert.equal(guide.directUrl, 'https://www.netflix.com/cancelplan');
    assert.equal(guide.canPause, true);
});

test('no cancel guide is ever null, whatever the category', () => {
    const categories = [...CANONICAL_CATEGORIES, null, undefined, 'Nonsense'];
    for (const category of categories) {
        const guide = buildGuide({ merchantName: 'ANY MERCHANT', action: 'stop', category });
        assert.ok(guide, `null guide for category ${category}`);
        assert.ok(guide.steps.length > 0, `no steps for category ${category}`);
    }
});

test('subscriptions warn about app-store billing, bills do not', () => {
    const sub = buildGuide({ merchantName: 'NETFLIX', action: 'stop', category: 'Subscriptions' });
    assert.ok(sub.tips.includes(APP_STORE_TIP));

    const bill = buildGuide({ merchantName: 'ENBRIDGE', action: 'stop', category: 'Utilities' });
    assert.ok(!bill.tips.includes(APP_STORE_TIP), 'a gas utility is not billed through the App Store');
});

// ---------------------------------------------------------------------------
// What the spec cut
// ---------------------------------------------------------------------------

test('no guide carries competitor names or prices', () => {
    // Hardcoded pricing that was already going stale, and the last place the app
    // recommended a named product off the user's own spending.
    for (const category of [...CANONICAL_CATEGORIES, 'Nonsense']) {
        for (const action of ['stop', 'negotiate']) {
            const guide = buildGuide({ merchantName: 'ROGERS', action, category });
            if (!guide) continue;
            assert.equal(guide.alternatives, undefined, 'alternatives block was cut');
        }
    }
});

test('negotiate returns nothing where there is no script, so no button is rendered', () => {
    assert.equal(
        buildGuide({ merchantName: 'NETFLIX', action: 'negotiate', category: 'Subscriptions' }),
        null
    );
    assert.ok(buildGuide({ merchantName: 'ROGERS', action: 'negotiate', category: 'Utilities' }));
});
