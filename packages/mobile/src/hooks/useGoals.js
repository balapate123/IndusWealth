import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { syncGoalReminders } from '../services/notifications';

/**
 * The user's goals, plus the device reminders that follow them.
 *
 * Reminder scheduling is deliberately coupled here rather than left to each
 * screen: a goal whose cadence changed but whose notification did not is a bug
 * nobody notices until the wrong reminder arrives a week later. Every mutation
 * that lands re-syncs from the server's list, so the device can never hold a
 * reminder the server does not.
 *
 * Sync failures are logged and swallowed — a goal saved is still a goal saved,
 * and blocking a save on the notification subsystem would be the wrong trade.
 */
const useGoals = ({ status = 'active', autoLoad = true } = {}) => {
    const [goals, setGoals] = useState([]);
    const [options, setOptions] = useState(null);
    const [loading, setLoading] = useState(autoLoad);
    const [error, setError] = useState(null);

    const resync = useCallback(async (list) => {
        try {
            await syncGoalReminders(list);
        } catch (err) {
            console.warn('Could not sync goal reminders:', err?.message || err);
        }
    }, []);

    /**
     * The fetch itself. Sets no state before its first await, so the mount
     * effect can call it directly — `loading` already starts as `autoLoad`, and
     * a synchronous setState in an effect body triggers a cascading render.
     */
    const fetchGoals = useCallback(async () => {
        try {
            const response = await api.getGoals(status);
            if (response?.success) {
                const list = response.data || [];
                setGoals(list);
                if (response.options) setOptions(response.options);
                setError(null);
                // Reminders follow whatever the server says is active, so a goal
                // deleted on another device stops notifying on this one.
                if (status === 'active') resync(list);
                return list;
            }
            setError('Could not load your goals.');
            return [];
        } catch (err) {
            console.error('Error loading goals:', err);
            setError('Could not load your goals.');
            return [];
        } finally {
            setLoading(false);
        }
    }, [status, resync]);

    /**
     * What screens call. `silent` skips the spinner, for a pull-to-refresh or a
     * reload after a mutation, where blanking the list would be a regression.
     */
    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        return fetchGoals();
    }, [fetchGoals]);

    useEffect(() => {
        if (autoLoad) fetchGoals();
    }, [autoLoad, fetchGoals]);

    /**
     * Mutations return the API response so a caller can branch on a code
     * (GOAL_NAME_TAKEN, GOAL_LIMIT_REACHED) rather than parsing a message.
     */
    const create = useCallback(async (goal) => {
        const response = await api.createGoal(goal);
        if (response?.success) await load({ silent: true });
        return response;
    }, [load]);

    const update = useCallback(async (goalId, fields) => {
        const response = await api.updateGoal(goalId, fields);
        if (response?.success) await load({ silent: true });
        return response;
    }, [load]);

    const remove = useCallback(async (goalId) => {
        const response = await api.deleteGoal(goalId);
        if (response?.success) {
            // Drop it locally first so the list does not flash the old row while
            // the reload is in flight.
            setGoals((prev) => prev.filter((g) => g.id !== goalId));
            await load({ silent: true });
        }
        return response;
    }, [load]);

    const contribute = useCallback(async (goalId, contribution) => {
        const response = await api.addGoalContribution(goalId, contribution);
        if (response?.success) await load({ silent: true });
        return response;
    }, [load]);

    return { goals, options, loading, error, load, create, update, remove, contribute };
};

export default useGoals;
