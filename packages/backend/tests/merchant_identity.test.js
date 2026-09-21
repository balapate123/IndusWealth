/**
 * Run with:  npm test   (from packages/backend)
 *
 * `normalizeMerchantName` has been load-bearing since Watchdog shipped and has
 * never had a test, because it was a method on the Watchdog class and nothing
 * could reach it. Extracting it is what makes "apply this correction to every
 * Pioneer transaction" possible at all: the feature only works if
 * `PIONEER #0421` and `PIONEER #0388` resolve to the same merchant.
 *
 * Pure. No pool, no clock. The aliases file is real data, not a fixture, so a
 * bad edit to it fails here.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeMerchantName,
    merchantKeyFor,
    merchantLabelFor,
} = require('../src/services/merchant_identity');

// ---------------------------------------------------------------------------
// The thing the feature depends on
// ---------------------------------------------------------------------------

test('two branches of one merchant reduce to the same name', () => {
    // The whole point. A correction keyed on the raw statement string would
    // match one fill-up and miss the other nineteen.
    assert.equal(
        normalizeMerchantName('PIONEER #0421'),
        normalizeMerchantName('PIONEER #0388')
    );
    assert.equal(normalizeMerchantName('PIONEER #0421'), 'PIONEER');
});

test('a store number needs four digits before it is treated as one', () => {
    // Three digits is as likely to be part of the name as a branch code.
    // Wrong in the safe direction: two merchants stay separate rather than a
    // correction reaching somewhere the user did not intend.
    assert.equal(normalizeMerchantName('PIONEER #0421'), 'PIONEER');
    assert.equal(normalizeMerchantName('PIONEER 0421'), 'PIONEER');
    assert.equal(normalizeMerchantName('STORE 123'), 'STORE 123');
});

// ---------------------------------------------------------------------------
// What it strips
// ---------------------------------------------------------------------------

test('a card-network suffix is not part of the merchant', () => {
    assert.equal(normalizeMerchantName('SPOTIFY *FAMILY'), 'Spotify');
    assert.equal(normalizeMerchantName('ROGERS *MOBILE'), 'ROGERS');
});

test('a suffix and a store number both go, in either order on the string', () => {
    assert.equal(normalizeMerchantName('ROGERS *MOBILE 1234'), 'ROGERS');
});

test('corporate tails go', () => {
    assert.equal(normalizeMerchantName('SOMEPLACE LTD'), 'SOMEPLACE');
    assert.equal(normalizeMerchantName('SOMEPLACE CORP'), 'SOMEPLACE');
    assert.equal(normalizeMerchantName('SOMEPLACE LLC'), 'SOMEPLACE');
});

test('a merchant that merely ends in those letters is left alone', () => {
    // CO. needs its dot. Without it, COSTCO loses two characters and stops
    // matching anything else the same merchant produced.
    assert.equal(normalizeMerchantName('COSTCO'), 'COSTCO');
});

test('bank transaction prefixes go', () => {
    for (const prefix of ['POS ', 'PREAUTHORIZED ', 'PAD ', 'EFT ', 'RECURRING ', 'MONTHLY ', 'ANNUAL ']) {
        assert.equal(normalizeMerchantName(`${prefix}SOMEPLACE`), 'SOMEPLACE', prefix);
    }
});

test('case and padding do not make two merchants', () => {
    assert.equal(normalizeMerchantName('  pioneer #0421  '), 'PIONEER');
});

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

test('known aliases collapse to one merchant', () => {
    // merchant_aliases.json is real data, so this also guards edits to it.
    assert.equal(normalizeMerchantName('NETFLIX.COM'), 'Netflix');
    assert.equal(normalizeMerchantName('NETFLIX'), 'Netflix');
    assert.equal(normalizeMerchantName('ROGERS WIRELESS'), 'Rogers');
    assert.equal(normalizeMerchantName('ROGERS CABLE'), 'Rogers');
});

test('an alias is applied after stripping, not before', () => {
    // NETFLIX.COM only reaches the alias table once the .COM is gone. Checking
    // the raw string first would miss every variant the bank decorates.
    assert.equal(normalizeMerchantName('NETFLIX.COM'), normalizeMerchantName('NETFLIX'));
});

test('an unaliased merchant keeps the casing the bank sent', () => {
    // Deliberately not title-cased. TD AUTO FINANCE becoming Td Auto Finance is
    // worse than leaving it, and no general rule gets acronyms right -- the same
    // decision displayNameFor already makes.
    assert.equal(normalizeMerchantName('TD AUTO FINANCE'), 'TD AUTO FINANCE');
});

test('nothing in gives nothing out', () => {
    assert.equal(normalizeMerchantName(null), null);
    assert.equal(normalizeMerchantName(undefined), null);
    assert.equal(normalizeMerchantName(''), null);
});

test('a name that is entirely decoration also gives nothing out', () => {
    // These reduce to an empty string rather than a missing one, and an empty
    // string is falsy in the key path but renders as a blank in the label path
    // -- "Also apply to all " with nothing after it.
    //
    // A line that is only a prefix ("POS ") is deliberately NOT in this list.
    // The leading trim removes its trailing space before the prefix pattern --
    // which requires one -- can match, so it survives as "POS". That is a
    // degenerate input Plaid does not produce, and stripping it to nothing
    // would be inventing a rule to satisfy a test rather than the other way
    // round.
    for (const raw of ['#12345', '*SOMETHING', '   ']) {
        assert.equal(normalizeMerchantName(raw), null, JSON.stringify(raw));
        assert.equal(merchantLabelFor({ name: raw }), null, JSON.stringify(raw));
        assert.equal(merchantKeyFor({ name: raw }), null, JSON.stringify(raw));
    }
});

// ---------------------------------------------------------------------------
// The rule key
// ---------------------------------------------------------------------------

test('the key prefers the merchant name over the raw description', () => {
    // merchant_name is Plaid's cleaned field and is the better key when present;
    // name is the raw statement line and is all we have when it is not.
    assert.equal(
        merchantKeyFor({ merchant_name: 'Pioneer', name: 'POS PIONEER #0421 KITCHENER' }),
        'PIONEER'
    );
    assert.equal(merchantKeyFor({ merchant_name: null, name: 'PIONEER #0421' }), 'PIONEER');
    assert.equal(merchantKeyFor({ name: 'PIONEER #0388' }), 'PIONEER');
});

test('the key is case-insensitive, so an alias cannot split a merchant in two', () => {
    // normalizeMerchantName returns the alias verbatim, and the alias table is
    // title case ("Netflix") while unaliased merchants stay uppercase. Storing
    // that mixture as a key would make Netflix and NETFLIX two different rules
    // depending on which row the user happened to correct.
    assert.equal(merchantKeyFor({ merchant_name: 'NETFLIX.COM' }), 'NETFLIX');
    assert.equal(merchantKeyFor({ merchant_name: 'Netflix' }), 'NETFLIX');
    assert.equal(
        merchantKeyFor({ merchant_name: 'ROGERS WIRELESS' }),
        merchantKeyFor({ merchant_name: 'ROGERS CABLE' })
    );
});

test('a transaction with no usable name has no key', () => {
    // A rule keyed on null would match every nameless transaction at once.
    assert.equal(merchantKeyFor({ merchant_name: null, name: null }), null);
    assert.equal(merchantKeyFor({}), null);
    assert.equal(merchantKeyFor(null), null);
});

test('the label is what a person reads, and the key is not', () => {
    // "NETFLIX" is a key. "Netflix" is what goes in "Also apply to all Netflix".
    const tx = { merchant_name: 'NETFLIX.COM' };
    assert.equal(merchantLabelFor(tx), 'Netflix');
    assert.equal(merchantKeyFor(tx), 'NETFLIX');
    assert.notEqual(merchantLabelFor(tx), merchantKeyFor(tx));
});

test('a label falls back to the merchant as written when there is no alias', () => {
    assert.equal(merchantLabelFor({ merchant_name: 'PIONEER #0421' }), 'PIONEER');
    assert.equal(merchantLabelFor({}), null);
});

// ---------------------------------------------------------------------------
// Watchdog must not have changed behaviour
// ---------------------------------------------------------------------------

test('Watchdog delegates rather than keeping its own copy', () => {
    // Two implementations of merchant normalisation is how the Entertainment /
    // Alcohol & Bars keyword drift happened. Asserting identity here is what
    // stops the extracted copy and the original diverging later.
    const WatchdogService = require('../src/services/watchdog');
    const instance = WatchdogService.__testInstance || WatchdogService;
    const viaWatchdog = typeof instance.normalizeMerchantName === 'function'
        ? instance.normalizeMerchantName.bind(instance)
        : null;

    assert.ok(viaWatchdog, 'watchdog no longer exposes normalizeMerchantName');

    for (const raw of ['PIONEER #0421', 'NETFLIX.COM', 'ROGERS *MOBILE', 'POS SOMEPLACE LTD', null]) {
        assert.equal(viaWatchdog(raw), normalizeMerchantName(raw), String(raw));
    }
});
