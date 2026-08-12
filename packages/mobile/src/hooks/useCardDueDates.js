import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { syncCardDueReminders } from '../services/notifications';

/**
 * Credit card payment due dates, plus the device reminders that follow them.
 *
 * Same shape as useGoals, and coupled to reminder scheduling for the same
 * reason: a due date the user changed but a reminder that did not follow is a
 * bug nobody notices until the wrong day arrives. Every mutation re-syncs from
 * the server's list, so the device can never hold a reminder the server does
 * not.
 *
 * Sync failures are logged and swallowed — a due date saved is still saved, and
 * blocking the save on the notification subsystem would be the wrong trade.
 */
const useCardDueDates = ({ autoLoad = true } = {}) => {
    const [dueDates, setDueDates] = useState([]);
    const [options, setOptions] = useState(null);
    const [loading, setLoading] = useState(autoLoad);
    const [error, setError] = useState(null);

    const resync = useCallback(async (list) => {
        try {
            await syncCardDueReminders(list);
        } catch (err) {
            console.warn('Could not sync card due-date reminders:', err?.message || err);
        }
    }, []);

    /**
     * Sets no state before its first await, so the mount effect can call it
     * directly — `loading` already starts as `autoLoad`, and a synchronous
     * setState in an effect body triggers a cascading render.
     */
    const fetchDueDates = useCallback(async () => {
        try {
            const response = await api.getCardDueDates();
            if (response?.success) {
                const list = response.data || [];
                setDueDates(list);
                if (response.options) setOptions(response.options);
                setError(null);
                resync(list);
                return list;
            }
            setError('Could not load your due dates.');
            return [];
        } catch (err) {
            console.error('Error loading card due dates:', err);
            setError('Could not load your due dates.');
            return [];
        } finally {
            setLoading(false);
        }
    }, [resync]);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        return fetchDueDates();
    }, [fetchDueDates]);

    useEffect(() => {
        if (autoLoad) fetchDueDates();
    }, [autoLoad, fetchDueDates]);

    /**
     * Create or update in one call. Returns the API response so a caller can
     * branch on a code (CARD_LIMIT_REACHED, ACCOUNT_NOT_FOUND) rather than
     * parsing a message.
     */
    const save = useCallback(async (dueDate) => {
        const response = await api.saveCardDueDate(dueDate);
        if (response?.success) await load({ silent: true });
        return response;
    }, [load]);

    const remove = useCallback(async (id) => {
        const response = await api.deleteCardDueDate(id);
        if (response?.success) {
            // Drop it locally first so the list does not flash the old row while
            // the reload is in flight.
            setDueDates((prev) => prev.filter((d) => d.id !== id));
            await load({ silent: true });
        }
        return response;
    }, [load]);

    return { dueDates, options, loading, error, load, save, remove };
};

export default useCardDueDates;
