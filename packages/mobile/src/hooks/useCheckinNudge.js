import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { syncCheckinReminder } from '../services/notifications';

/**
 * The weekly check-in nudge.
 *
 * Fetched once per launch, like the insight spotlight, and shown at most once
 * per week — the server owns both cooldowns, so the device asks and takes the
 * answer rather than keeping its own record that two devices could disagree
 * about.
 *
 * `suppressed` exists because the spotlight wants the same moment. Two pop-ups
 * on one app open is not two chances to be helpful, it is an app that
 * interrupts twice.
 */
const useCheckinNudge = ({ enabled = true, suppressed = false } = {}) => {
    const [nudge, setNudge] = useState(null);
    const [visible, setVisible] = useState(false);
    const fetchedThisLaunch = useRef(false);
    const seenSent = useRef(false);

    useEffect(() => {
        if (!enabled || suppressed || fetchedThisLaunch.current) return;
        fetchedThisLaunch.current = true;

        let cancelled = false;
        (async () => {
            try {
                const response = await api.getCheckinNudge();
                // A null nudge is the normal answer most of the time — nothing
                // is due, or the cooldown has not elapsed. Not an error.
                if (!cancelled && response?.success && response.data) {
                    setNudge(response.data);
                    setVisible(true);
                }
            } catch (err) {
                console.warn('Could not load the check-in nudge:', err?.message || err);
            }
        })();

        return () => { cancelled = true; };
    }, [enabled, suppressed]);

    /**
     * Sent when the sheet has actually rendered, not when the nudge arrived —
     * otherwise a fetch nobody saw spends the user's one interruption a week.
     */
    const markSeen = useCallback(async () => {
        if (!nudge?.key || seenSent.current) return;
        seenSent.current = true;
        try {
            await api.markCheckinSeen(nudge.key);
        } catch (err) {
            console.warn('Could not record the check-in as seen:', err?.message || err);
        }
    }, [nudge]);

    const dismiss = useCallback(() => setVisible(false), []);

    /** Turn check-ins off entirely: the server stops selecting, the device stops asking. */
    const setEnabled = useCallback(async (next) => {
        try {
            await api.setCheckinEnabled(next);
            await syncCheckinReminder({ enabled: next });
        } catch (err) {
            console.warn('Could not change the check-in preference:', err?.message || err);
        }
    }, []);

    return { nudge, visible, markSeen, dismiss, setEnabled };
};

export default useCheckinNudge;
