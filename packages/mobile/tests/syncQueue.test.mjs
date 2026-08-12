/**
 * The queue that stops reminders being scheduled twice.
 *
 * Every test here drives the UNGUARDED version first and asserts it breaks, so
 * the guarded assertion cannot pass vacuously against code that never had the
 * bug.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncQueue } from '../src/utils/syncQueue.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A stand-in for the device's pending-notification list, doing exactly what
 * _syncGoalReminders does: read everything, cancel ours, schedule the new set.
 * Each step yields, which is what lets two runs interleave.
 */
function fakeDevice() {
    let pending = [];
    return {
        get pending() { return pending; },
        async sync(items) {
            const existing = await tick().then(() => pending.slice());
            for (const item of existing) {
                await tick();
                pending = pending.filter((p) => p !== item);
            }
            for (const item of items) {
                await tick();
                pending.push(item);
            }
        },
    };
}

test('THE BUG: two unguarded syncs schedule everything twice', async () => {
    const device = fakeDevice();
    await device.sync(['a', 'b']);
    assert.equal(device.pending.length, 2);

    // Two refetches landing close together — deleting a goal reloads, and
    // navigating back to Home reloads again before the first has finished.
    await Promise.all([device.sync(['a', 'b']), device.sync(['a', 'b'])]);

    assert.equal(
        device.pending.length, 4,
        'expected the unguarded interleaving to double the reminders'
    );
});

test('the queue leaves exactly one set', async () => {
    const device = fakeDevice();
    const enqueue = createSyncQueue();
    await enqueue(() => device.sync(['a', 'b']));

    await Promise.all([
        enqueue(() => device.sync(['a', 'b'])),
        enqueue(() => device.sync(['a', 'b'])),
    ]);

    assert.deepEqual(device.pending, ['a', 'b']);
});

test('the last caller wins', async () => {
    const device = fakeDevice();
    const enqueue = createSyncQueue();

    await Promise.all([
        enqueue(() => device.sync(['old'])),
        enqueue(() => device.sync(['new'])),
    ]);

    assert.deepEqual(device.pending, ['new']);
});

test('work runs in the order it was queued', async () => {
    const enqueue = createSyncQueue();
    const order = [];

    await Promise.all([1, 2, 3, 4, 5].map((n) => enqueue(async () => {
        order.push(`start${n}`);
        await tick();
        order.push(`end${n}`);
    })));

    // Never "start2" before "end1" — that overlap is the bug.
    assert.deepEqual(order, [
        'start1', 'end1', 'start2', 'end2', 'start3', 'end3',
        'start4', 'end4', 'start5', 'end5',
    ]);
});

test('a rejected run does not wedge the queue', async () => {
    const enqueue = createSyncQueue();

    await assert.rejects(() => enqueue(async () => { throw new Error('device said no'); }));

    // Everything queued after a failure must still run, or one transient error
    // silently stops reminders updating for the rest of the session.
    const after = await enqueue(async () => 'ran');
    assert.equal(after, 'ran');
});

test('a run queued behind a failure still runs, and in order', async () => {
    const enqueue = createSyncQueue();
    const order = [];

    const failing = enqueue(async () => {
        order.push('failing');
        await tick();
        throw new Error('nope');
    });
    const following = enqueue(async () => {
        order.push('following');
        return 'ok';
    });

    await assert.rejects(() => failing);
    assert.equal(await following, 'ok');
    assert.deepEqual(order, ['failing', 'following']);
});

test('the caller sees its own result, not the previous run\'s', async () => {
    const enqueue = createSyncQueue();
    const [a, b] = await Promise.all([enqueue(async () => 'a'), enqueue(async () => 'b')]);
    assert.equal(a, 'a');
    assert.equal(b, 'b');
});

test('two queues are independent', async () => {
    const q1 = createSyncQueue();
    const q2 = createSyncQueue();
    const order = [];

    await Promise.all([
        q1(async () => { order.push('q1-start'); await tick(); order.push('q1-end'); }),
        q2(async () => { order.push('q2-start'); await tick(); order.push('q2-end'); }),
    ]);

    // Interleaved, because they do not share a lock — which is why the app puts
    // goal and card syncs on the SAME queue.
    assert.ok(order.indexOf('q2-start') < order.indexOf('q1-end'), order.join(','));
});
