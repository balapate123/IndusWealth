/**
 * Proves the goal-pace read and write paths against real Postgres (PGlite,
 * in-process — no Docker, no server), running the *shipped* db.js rather than a
 * copy: `pool.query` is redirected at PGlite and createGoal / updateGoal /
 * getGoals are then called for real.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node tests/manual/goal_pace_sql_check.js
 *
 * tests/goal_pace.test.js covers the arithmetic. This covers what it cannot:
 *
 *   * that add_goal_baseline_at.sql applies to a table that already has rows,
 *     backfills them, and survives being run twice;
 *   * that `baseline_at = NOW()` — a raw expression spliced into a SET list
 *     whose other entries are numbered parameters — produces valid SQL. That is
 *     the exact shape of the recordNudgeShown bug, where a qualified column on
 *     the left of an ON CONFLICT ... SET made every write 500;
 *   * that it moves when the baseline moves, and stays put when it does not.
 *     A rename resetting the measurement clock would silently zero the pace of
 *     every goal a user ever edits.
 *
 * Not part of `npm test`: the glob is tests/*.test.js and this needs an
 * optional dependency.
 */

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const db = require('../../src/services/db');
const { PACE_STATE } = require('../../src/services/goal_pace');

let passed = 0;
let failed = 0;

const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log(`  ok   ${label}`);
    } else {
        failed++;
        console.log(`  FAIL ${label}`);
        console.log(`       expected ${JSON.stringify(expected)}`);
        console.log(`       actual   ${JSON.stringify(actual)}`);
    }
};

const ok = (label, condition, detail = '') => {
    if (condition) {
        passed++;
        console.log(`  ok   ${label}`);
    } else {
        failed++;
        console.log(`  FAIL ${label} ${detail}`);
    }
};

const USER_ID = 1;
const OTHER_USER = 2;

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
    const pg = new PGlite();
    db.pool.query = (text, params) => pg.query(text, params);

    await pg.exec(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
        CREATE TABLE accounts (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            plaid_account_id TEXT NOT NULL,
            name TEXT,
            mask TEXT,
            current_balance DECIMAL(15,2)
        );
        INSERT INTO users (id, email) VALUES (1, 'demo@induswealth.com'), (2, 'other@example.com');
        INSERT INTO accounts (user_id, plaid_account_id, name, mask, current_balance)
        VALUES (1, 'acct-save', 'Savings', '4321', 3200.00),
               (1, 'acct-tfsa', 'TFSA', '9911', 500.00),
               (2, 'acct-theirs', 'Not yours', '0000', 99999.00);
    `);

    // ---------------------------------------------------------------------
    // The migration, against a table that already holds rows
    // ---------------------------------------------------------------------

    const migrate = async (file) => {
        const sql = fs.readFileSync(path.join(__dirname, '../../db', file), 'utf8');
        await pg.exec(sql);
    };

    await migrate('add_goals.sql');

    // A goal that predates the column, created 200 days ago. This is every
    // existing user's data at deploy time.
    await pg.query(
        `INSERT INTO user_goals (user_id, name, target_amount, target_date, tracking_mode, created_at)
         VALUES ($1, 'Legacy Goal', 4000, $2, 'manual', NOW() - INTERVAL '200 days')`,
        [USER_ID, daysAhead(120)]
    );

    await migrate('add_goal_baseline_at.sql');
    console.log('\nmigrations applied\n');

    const legacy = await pg.query(
        `SELECT baseline_at, created_at,
                (baseline_at = created_at) AS matches_creation
           FROM user_goals WHERE name = 'Legacy Goal'`
    );
    ok('existing rows are backfilled from created_at', legacy.rows[0].matches_creation === true);
    ok('the backfilled value is the real creation time, not now',
        Date.now() - new Date(legacy.rows[0].baseline_at).getTime() > 190 * 86400000,
        `got ${legacy.rows[0].baseline_at}`);

    // Migrations re-run on every boot, so this must be a no-op rather than an
    // error about the column already existing or the constraint being present.
    await migrate('add_goal_baseline_at.sql');
    ok('the migration is idempotent', true);

    const notNull = await pg.query(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_name = 'user_goals' AND column_name = 'baseline_at'`
    );
    check('baseline_at is NOT NULL', notNull.rows[0].is_nullable, 'NO');
    ok('baseline_at defaults to now for new rows',
        /CURRENT_TIMESTAMP|now\(\)/i.test(notNull.rows[0].column_default || ''),
        notNull.rows[0].column_default);

    // ---------------------------------------------------------------------
    // Reads carry pace
    // ---------------------------------------------------------------------

    console.log('\n--- pace on read ---\n');

    const legacyRead = (await db.getGoals(USER_ID, { status: 'all' }))
        .find((g) => g.name === 'Legacy Goal');
    ok('getGoals attaches a pace block', Boolean(legacyRead.pace));
    ok('the backfilled goal has an observation window', legacyRead.pace.observedDays >= 199,
        `observedDays=${legacyRead.pace.observedDays}`);
    check('a goal with no contributions is stalled, not behind',
        legacyRead.pace.state, PACE_STATE.STALLED);
    check('and projects no date', legacyRead.pace.projectedDate, null);
    ok('but still says what it requires', legacyRead.pace.requiredPerMonth > 0);

    // ---------------------------------------------------------------------
    // A manual goal with real contributions
    // ---------------------------------------------------------------------

    console.log('\n--- manual goal ---\n');

    const manual = await db.createGoal(USER_ID, {
        name: 'Emergency Fund',
        targetAmount: 5000,
        targetDate: daysAhead(150),
        trackingMode: 'manual',
    });
    ok('a new goal starts measuring today', Boolean(manual.baseline_at));
    check('and has no pace yet', manual.pace.state, PACE_STATE.TOO_EARLY);
    check('quoting no rate it cannot support', manual.pace.actualPerMonth, null);
    ok('while still stating the requirement', manual.pace.requiredPerMonth > 0);

    // Age it 90 days and feed it, the way a real goal would have been.
    await pg.query(
        `UPDATE user_goals SET baseline_at = NOW() - INTERVAL '90 days', created_at = NOW() - INTERVAL '90 days'
          WHERE id = $1`, [manual.id]
    );
    for (const [amount, when] of [[700, 82], [700, 52], [600, 21], [700, 4]]) {
        await db.addGoalContribution(USER_ID, manual.id, { amount, occurredOn: daysAgo(when) });
    }

    const fed = await db.getGoalById(USER_ID, manual.id);
    check('saved is the sum of contributions', fed.saved_amount, 2700);
    ok('actual pace is measured over the window', fed.pace.observedDays >= 89 && fed.pace.observedDays <= 91,
        `observedDays=${fed.pace.observedDays}`);
    ok('and is a real number', fed.pace.actualPerMonth > 800 && fed.pace.actualPerMonth < 950,
        `actual=${fed.pace.actualPerMonth}`);
    ok('the projection lands in the future', fed.pace.projectedDate > daysAgo(0), fed.pace.projectedDate);
    ok('the verdict compares the two rates',
        [PACE_STATE.AHEAD, PACE_STATE.ON_TRACK, PACE_STATE.BEHIND].includes(fed.pace.state),
        fed.pace.state);

    // ---------------------------------------------------------------------
    // The clock moves only when the baseline does
    // ---------------------------------------------------------------------

    console.log('\n--- when measurement restarts ---\n');

    const beforeRename = fed.baseline_at;
    const renamed = await db.updateGoal(USER_ID, manual.id, { name: 'Rainy Day Fund' });
    check('a rename succeeds', renamed.name, 'Rainy Day Fund');
    check('and does not restart the measurement clock',
        new Date(renamed.baseline_at).getTime(), new Date(beforeRename).getTime());
    ok('so the pace survives an edit', renamed.pace.actualPerMonth > 800,
        `actual=${renamed.pace.actualPerMonth}`);

    // The write shape this harness exists for: a raw NOW() spliced into a SET
    // list whose other entries are $1, $2, $3.
    const linked = await db.updateGoal(USER_ID, manual.id, { accountId: 'acct-save' });
    ok('linking an account does not blow up the parameterised UPDATE', Boolean(linked));
    check('tracking mode follows the link', linked.tracking_mode, 'account');
    check('the baseline is snapshotted from the live balance', linked.baseline_amount, 3200);
    ok('and the clock restarts with it',
        new Date(linked.baseline_at).getTime() > new Date(beforeRename).getTime(),
        `${beforeRename} -> ${linked.baseline_at}`);
    check('so a freshly linked goal has no pace to quote', linked.pace.state, PACE_STATE.TOO_EARLY);
    check('rather than a stall invented by dividing by 90 days',
        linked.pace.actualPerMonth, null);

    // Relinking a different account moves both again.
    const relinked = await db.updateGoal(USER_ID, manual.id, { accountId: 'acct-tfsa' });
    check('relinking re-snapshots the baseline', relinked.baseline_amount, 500);
    ok('and restarts measurement again',
        new Date(relinked.baseline_at).getTime() >= new Date(linked.baseline_at).getTime());

    const unlinked = await db.updateGoal(USER_ID, manual.id, { accountId: null });
    check('unlinking returns to manual', unlinked.tracking_mode, 'manual');
    ok('and restarts measurement, because saved now means something else',
        new Date(unlinked.baseline_at).getTime() >= new Date(relinked.baseline_at).getTime());

    // ---------------------------------------------------------------------
    // An account that goes away
    // ---------------------------------------------------------------------

    console.log('\n--- disconnected account ---\n');

    const tracked = await db.createGoal(USER_ID, {
        name: 'New Car',
        targetAmount: 12000,
        targetDate: daysAhead(400),
        trackingMode: 'account',
        accountId: 'acct-save',
    });
    check('an account-tracked goal snapshots its baseline', tracked.baseline_amount, 3200);

    await pg.query(`UPDATE user_goals SET baseline_at = NOW() - INTERVAL '120 days' WHERE id = $1`,
        [tracked.id]);
    await pg.query('UPDATE accounts SET current_balance = 5000 WHERE plaid_account_id = $1', ['acct-save']);

    const growing = await db.getGoalById(USER_ID, tracked.id);
    check('saved is balance minus baseline', growing.saved_amount, 1800);
    ok('an account goal is never stalled by an absent contribution row',
        growing.pace.state !== PACE_STATE.STALLED, growing.pace.state);
    ok('its pace is measured', growing.pace.actualPerMonth > 0);

    // Accounts are ON DELETE SET NULL, so this is a real disconnection.
    await pg.query('UPDATE user_goals SET account_id = NULL WHERE id = $1', [tracked.id]);

    const orphaned = await db.getGoalById(USER_ID, tracked.id);
    check('a disconnected goal reports needs_relink', orphaned.needs_relink, true);
    check('saved is null, not zero', orphaned.saved_amount, null);
    check('and the pace refuses to guess', orphaned.pace.state, PACE_STATE.UNMEASURABLE);
    check('quoting no required rate either', orphaned.pace.requiredPerMonth, null);
    check('and no projection', orphaned.pace.projectedDate, null);

    // ---------------------------------------------------------------------
    // Authorisation is unchanged by any of this
    // ---------------------------------------------------------------------

    console.log('\n--- authorisation ---\n');

    const stolen = await db.createGoal(USER_ID, {
        name: 'Someone Elses Account',
        targetAmount: 100,
        trackingMode: 'account',
        accountId: 'acct-theirs',
    });
    check('another user\'s account cannot be linked', stolen, null);
    check('and another user cannot read this goal', await db.getGoalById(OTHER_USER, manual.id), null);

    // Every read path returns pace, not just the two obvious ones.
    const viaMilestones = await db.markGoalMilestones(USER_ID, tracked.id, [25]);
    ok('markGoalMilestones returns a decorated goal', Boolean(viaMilestones.pace));

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error('\nharness crashed:', err);
    process.exit(1);
});
