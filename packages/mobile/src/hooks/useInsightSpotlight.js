import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { SNOOZE_DAYS } from '../constants/insights';

/**
 * Fetches and manages the spotlight pop-up.
 *
 * Fetched once per app launch, not on every screen focus. The endpoint reads
 * cache only, but a request every time the user taps back to Home is still a
 * request per tap, and the answer cannot change in between — the server's
 * cooldown means at most one pop-up a week either way.
 *
 * The server decides *whether* there is anything to show; this hook only
 * decides *when* to show it.
 */

/**
 * Held back briefly after mount. Presenting a sheet in the same frame as the
 * screen underneath it lands before the user has seen what they opened, and on
 * Android it can race the navigator's own transition.
 */
const PRESENT_DELAY_MS = 1400;

export function useInsightSpotlight({ enabled = true } = {}) {
    const [spotlight, setSpotlight] = useState(null);
    const [visible, setVisible] = useState(false);
    const timerRef = useRef(null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!enabled || fetchedRef.current) return undefined;
        fetchedRef.current = true;

        let cancelled = false;

        (async () => {
            try {
                const response = await api.getSpotlight();
                const candidate = response?.data?.spotlight;
                if (cancelled || !candidate) return;

                setSpotlight(candidate);
                timerRef.current = setTimeout(() => {
                    if (!cancelled) setVisible(true);
                }, PRESENT_DELAY_MS);
            } catch (err) {
                // A pop-up is the least important thing on this screen. If it
                // cannot be fetched, nothing should be visible about that.
                console.error('Failed to load spotlight:', err);
            }
        })();

        return () => {
            cancelled = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [enabled]);

    const close = useCallback(() => {
        setVisible(false);
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const markSeen = useCallback((fingerprint) => {
        api.markSpotlightSeen(fingerprint)
            .catch((err) => console.error('Failed to record spotlight impression:', err));
    }, []);

    const act = useCallback((insight) => {
        close();
        if (!insight?.fingerprint) return;
        api.trackInsightAction(insight, 'clicked_primary')
            .catch((err) => console.error('Failed to track spotlight action:', err));
    }, [close]);

    const snooze = useCallback((insight) => {
        close();
        api.dismissInsight(insight, { remindAfterDays: SNOOZE_DAYS, reason: 'remind_later' })
            .catch((err) => console.error('Failed to snooze insight:', err));
    }, [close]);

    const dismiss = useCallback((insight) => {
        close();
        // Backdrop taps arrive with no insight; those are "seen and closed",
        // which the cooldown already covers, not "never show me this again".
        if (!insight?.fingerprint) return;
        api.dismissInsight(insight, { reason: 'not_interested' })
            .catch((err) => console.error('Failed to dismiss insight:', err));
    }, [close]);

    return { spotlight, visible, act, snooze, dismiss, markSeen };
}

export default useInsightSpotlight;
