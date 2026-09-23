/**
 * Proves that account-scoped analytics actually excludes every other account,
 * against real Postgres (PGlite, in-process — no Docker, no server), driving
 * the *shipped* `computeCategoryAnalytics` rather than a copy of it.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/account_analytics_sql_check.js
 *
 * The thing worth proving is narrow and unforgiving: a scope that reaches the
 * transaction read but not the monthly one produces a screen where the
 * categories, the merchants and the hero are about one credit card while the
 * six-month trend underneath is about every account the user owns. Nothing
 * errors. The bars are the right shape. They are simply a different question's
 * answer, and there is no way to notice by looking.
 *
 * That is the same failure as the goal-pace Date bug and the DECIMAL[]
 * string comparison: correct-looking output from a query nobody ran against
 * real Postgres. So:
 *
 *   * every figure on the screen is checked against a hand-computed value for
 *     one account, not merely checked to have changed;
 *   * the monthly trend is checked separately, because it is the one read that
 *     needed a join it did not have;
 *   * the unscoped payload is checked to be unchanged, because the whole
 *     all-accounts screen runs through the same function;
 *   * a foreign account id is checked to resolve to nothing, because that is
 *     the authorisation.
 *
 * Not part of `npm test`: the glob is tests/*.test.js and this needs an
 * optional dependency.
 */

const { PGlite } = require('@electric-sql/pglite');

const db = require('../../src/services/db');
const analytics = require('../../src/routes/analytics');

const { computeCategoryAnalytics } = analytics;

let passed = 0;
let failed = 0;

const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log(`  ok   ${label}`); }
    else {
        failed++;
        console.log(`  FAIL ${label}`);
        console.log(`       expected ${JSON.stringify(expected)}`);
        console.log(`       actual   ${JSON.stringify(actual)}`);
    }
};

const ok = (label, condition, detail = '') => {
    if (condition) { passed++; console.log(`  ok   ${label}`); }
    else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};

const USER = 1;
const OTHER_USER = 2;

const CARD = 'acct-card';
const CHEQUING = 'acct-chq';
/** Belongs to user 2, and carries the same shape of data. */
const FOREIGN = 'acct-foreign';

const GAS = ['Travel', 'Gas Stations'];
const GROCERIES = ['Shops', 'Supermarkets and Groceries'];
const RESTAURANTS = ['Food and Drink', 'Restaurants'];

const sum = (values) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

(async () => {
    const pg = new PGlite();

    // PGlite returns { rows, fields, affectedRows }; node-postgres returns
    // rowCount. Normalised here rather than in db.js — production talks to real
    // pg, and bending shipped code to suit a test double is how a harness
    // starts proving the wrong thing.
    db.pool.query = async (text, params) => {
        const result = await pg.query(text, params);
        return {
            ...result,
            rowCount: result.rowCount ?? result.affectedRows ?? result.rows?.length ?? 0,
        };
    };

    await pg.exec(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
        CREATE TABLE accounts (
            id SERIAL PRIMARY KEY, user_id INT NOT NULL,
            plaid_account_id TEXT NOT NULL, name TEXT, alias TEXT,
            type TEXT, subtype TEXT, mask TEXT,
            current_balance DECIMAL(15,2)
        );
        CREATE TABLE transactions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            account_id INT,
            plaid_transaction_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            merchant_name VARCHAR(255),
            amount DECIMAL(15,2) NOT NULL,
            date DATE NOT NULL,
            category VARCHAR(255)[],
            user_category VARCHAR(50),
            pending BOOLEAN DEFAULT FALSE,
            iso_currency_code VARCHAR(10) DEFAULT 'CAD',
            notes VARCHAR(500),
            UNIQUE(user_id, plaid_transaction_id)
        );
        INSERT INTO users (id, email) VALUES (1, 'demo@induswealth.com'), (2, 'other@example.com');
        INSERT INTO accounts (id, user_id, plaid_account_id, name, alias, type, subtype) VALUES
            (10, 1, 'acct-card', 'Visa Infinite', 'Travel card', 'credit', 'credit card'),
            (11, 1, 'acct-chq',  'Everyday Chequing', NULL, 'depository', 'chequing'),
            (12, 2, 'acct-foreign', 'Someone else', NULL, 'depository', 'chequing');
    `);

    let seq = 0;
    const insert = async (accountRowId, userId, name, amount, daysAgo, category) => {
        seq += 1;
        await pg.query(
            `INSERT INTO transactions
                (user_id, account_id, plaid_transaction_id, name, merchant_name, amount, date, category)
             VALUES ($1, $2, $3, $4, $4, $5, CURRENT_DATE - $6::int, $7)`,
            [userId, accountRowId, `tx-${seq}`, name, amount, daysAgo, category]
        );
    };

    // ---- the card: 3 purchases and one payment coming back in -------------
    const CARD_GAS = [61.40, 48.15];
    const CARD_GROCERIES = [92.30];
    const CARD_PAYMENT = -250.00;

    await insert(10, USER, 'PIONEER #0421', CARD_GAS[0], 5, GAS);
    await insert(10, USER, 'ESSO 12345', CARD_GAS[1], 9, GAS);
    await insert(10, USER, 'LOBLAWS 1042', CARD_GROCERIES[0], 12, GROCERIES);
    await insert(10, USER, 'PAYMENT THANK YOU', CARD_PAYMENT, 3, ['Payment']);

    // ---- the chequing account: deliberately overlapping categories --------
    // Same categories as the card, so a scope that silently fails shows up as
    // a bigger number rather than as a missing row. A scope bug that produced
    // categories the card does not have would be obvious; this one would not.
    const CHQ_GAS = [40.00];
    const CHQ_RESTAURANTS = [77.77];

    await insert(11, USER, 'PETRO CANADA', CHQ_GAS[0], 4, GAS);
    await insert(11, USER, 'THE KEG', CHQ_RESTAURANTS[0], 6, RESTAURANTS);

    // ---- another user, same shape ----------------------------------------
    await insert(12, OTHER_USER, 'PIONEER #0421', 999.99, 5, GAS);

    console.log('\n--- scoped to the credit card ---\n');

    const card = await computeCategoryAnalytics(USER, 30, { accountId: CARD });

    const cardSpend = sum([...CARD_GAS, ...CARD_GROCERIES]);
    check('total spend is this card and nothing else', card.summary.totalSpend, cardSpend);
    check('the purchase count is this card only', card.summary.expenseCount, 3);

    // Money coming back on a card is a payment, not income. The figure is
    // right; the mobile side is what relabels it for a credit account.
    check('a card payment reads as money in', card.summary.totalIncome, 250);

    const cardCats = Object.fromEntries(card.categories.map((c) => [c.name, c.total]));
    check('the categories are the card\'s', Object.keys(cardCats).sort(), ['Gas & Fuel', 'Groceries']);
    check('and Gas holds only the card\'s gas', cardCats['Gas & Fuel'], sum(CARD_GAS));
    ok('the other account\'s Restaurants is absent', cardCats.Restaurants === undefined);

    const cardMerchants = card.topMerchants.map((m) => m.name);
    ok('PETRO CANADA is not among this card\'s merchants',
        !cardMerchants.some((n) => n.includes('PETRO')), JSON.stringify(cardMerchants));
    ok('and the other user\'s identical merchant row never appears',
        card.summary.totalSpend < 999, `${card.summary.totalSpend}`);

    // The one that needed a join it did not have.
    console.log('\n--- the monthly trend, which is a different query ---\n');

    const cardMonthSpend = sum(card.monthlyTrend.map((m) => m.spending));
    check('the trend sums to this card alone, not to every account', cardMonthSpend, cardSpend);
    ok('the trend is not the all-accounts figure',
        cardMonthSpend !== sum([...CARD_GAS, ...CARD_GROCERIES, ...CHQ_GAS, ...CHQ_RESTAURANTS]),
        `${cardMonthSpend}`);
    check('and its income is the card payment only',
        sum(card.monthlyTrend.map((m) => m.income)), 250);

    console.log('\n--- scoped to the chequing account ---\n');

    const chq = await computeCategoryAnalytics(USER, 30, { accountId: CHEQUING });
    const chqSpend = sum([...CHQ_GAS, ...CHQ_RESTAURANTS]);
    check('total spend is the chequing account', chq.summary.totalSpend, chqSpend);
    const chqCats = Object.fromEntries(chq.categories.map((c) => [c.name, c.total]));
    check('Gas here is only its own', chqCats['Gas & Fuel'], sum(CHQ_GAS));
    ok('Groceries, which only the card has, is absent', chqCats.Groceries === undefined);
    check('the trend follows the scope here too',
        sum(chq.monthlyTrend.map((m) => m.spending)), chqSpend);

    console.log('\n--- unscoped, which is what the existing screen runs ---\n');

    const all = await computeCategoryAnalytics(USER, 30);
    check('unscoped totals both accounts', all.summary.totalSpend, sum([cardSpend, chqSpend]));
    check('and the two scopes add up to it', sum([card.summary.totalSpend, chq.summary.totalSpend]), all.summary.totalSpend);
    check('unscoped sees all three categories',
        all.categories.map((c) => c.name).sort(), ['Gas & Fuel', 'Groceries', 'Restaurants']);
    check('unscoped Gas is both accounts\' gas',
        Object.fromEntries(all.categories.map((c) => [c.name, c.total]))['Gas & Fuel'],
        sum([...CARD_GAS, ...CHQ_GAS]));
    check('the unscoped trend is unchanged by any of this',
        sum(all.monthlyTrend.map((m) => m.spending)), sum([cardSpend, chqSpend]));
    ok('and the other user is still nowhere in it', all.summary.totalSpend < 999);

    console.log('\n--- authorisation ---\n');

    const mine = await db._resolveOwnedAccount(USER, CARD);
    ok('my own account resolves', !!mine);
    check('and carries what the route echoes back', {
        id: mine.plaid_account_id, name: mine.alias || mine.name, type: mine.type, subtype: mine.subtype,
    }, { id: CARD, name: 'Travel card', type: 'credit', subtype: 'credit card' });

    const stolen = await db._resolveOwnedAccount(USER, FOREIGN);
    check('another user\'s account resolves to nothing', stolen, null);

    // Belt and braces: even if the 404 were ever removed, the scope itself
    // must not return somebody else's money.
    const leaked = await computeCategoryAnalytics(USER, 30, { accountId: FOREIGN });
    check('and scoping to it returns nothing rather than their data', leaked.summary.totalSpend, 0);
    check('with no categories', leaked.categories.length, 0);
    check('and an empty trend', sum(leaked.monthlyTrend.map((m) => m.spending)), 0);

    console.log('\n--- a correction still wins inside a scope ---\n');

    // The scoped read must carry user_category, or effectiveCategory has
    // nothing to act on and a correction made on the transaction list would
    // silently not appear in this account's chart.
    await pg.query(
        `UPDATE transactions SET user_category = 'Groceries'
          WHERE user_id = $1 AND name = 'PIONEER #0421'`,
        [USER]
    );
    const corrected = await computeCategoryAnalytics(USER, 30, { accountId: CARD });
    const correctedCats = Object.fromEntries(corrected.categories.map((c) => [c.name, c.total]));
    check('the corrected row moved buckets inside the account view',
        correctedCats.Groceries, sum([...CARD_GROCERIES, CARD_GAS[0]]));
    check('and left the one it came from', correctedCats['Gas & Fuel'], CARD_GAS[1]);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
