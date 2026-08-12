/**
 * A one-at-a-time work queue. Pure — no expo, no react-native.
 *
 * Exists because cancel-then-reschedule is not safe to run concurrently. Two
 * overlapping runs interleave as cancel, cancel, schedule, schedule: both
 * cancels land before either schedule, so nothing is removed and everything is
 * scheduled twice. That is reachable in ordinary use — any two refetches close
 * together — and it fails silently, as a doubled notification days later.
 *
 * A factory rather than a module-level chain so each consumer owns its own
 * queue and tests can exercise the real implementation without inheriting
 * state from another test.
 */

/**
 * @returns {(work: () => Promise<any>) => Promise<any>} enqueue
 */
export function createSyncQueue() {
    let chain = Promise.resolve();

    return function enqueue(work) {
        // Both continuation handlers run the work, so one rejected run cannot
        // wedge the queue for every caller after it.
        const run = chain.then(work, work);
        // The queue tracks completion, not success — a failed run must still
        // release the next one.
        chain = run.catch(() => {});
        return run;
    };
}
