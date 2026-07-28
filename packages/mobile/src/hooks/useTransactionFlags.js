import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * The user's flags, plus the attach/detach state for whichever transaction is
 * currently open in the detail sheet.
 *
 * Home, All Transactions and Account Transactions all show that sheet, so this
 * keeps the diffing in one place rather than in three — the same reason the
 * sheet itself was extracted.
 *
 * The diff is computed against what the transaction arrived with, so opening the
 * sheet and closing it without touching anything sends no requests at all.
 */
const useTransactionFlags = () => {
    const [flags, setFlags] = useState([]);
    const [options, setOptions] = useState(null);
    const [selected, setSelected] = useState([]);
    const [saving, setSaving] = useState(false);

    // What the open transaction started with. A ref, not state: it is only ever
    // read at save time, and holding it in state would re-render the sheet for
    // a value nothing displays.
    const initialRef = useRef([]);

    const reload = useCallback(async () => {
        try {
            const response = await api.getFlags();
            if (response?.success) {
                setFlags(response.data || []);
                if (response.options) setOptions(response.options);
            }
        } catch (err) {
            // A failed load leaves the picker empty rather than blocking the
            // sheet — notes still save, which is what most opens are for.
            console.error('Error loading flags:', err);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    /** Seed the selection from the transaction the user just opened. */
    const openFor = useCallback((transaction) => {
        const ids = (transaction?.flags || []).map((f) => f.id);
        initialRef.current = ids;
        setSelected(ids);
    }, []);

    const toggle = useCallback((flagId) => {
        setSelected((prev) => (
            prev.includes(flagId) ? prev.filter((id) => id !== flagId) : [...prev, flagId]
        ));
    }, []);

    /**
     * Persist the difference and return the flags now attached, shaped like the
     * ones the list already holds so a caller can drop them straight into a row.
     */
    const save = useCallback(async (plaidTransactionId) => {
        const initial = initialRef.current;
        const added = selected.filter((id) => !initial.includes(id));
        const removed = initial.filter((id) => !selected.includes(id));

        if (added.length || removed.length) {
            setSaving(true);
            try {
                await Promise.all([
                    ...added.map((id) => api.setFlagTransactions(id, { add: [plaidTransactionId] })),
                    ...removed.map((id) => api.setFlagTransactions(id, { remove: [plaidTransactionId] })),
                ]);
                initialRef.current = selected;
                // Counts and totals moved, so anything showing them is now stale.
                reload();
            } finally {
                setSaving(false);
            }
        }

        return flags
            .filter((f) => selected.includes(f.id))
            .map(({ id, name, color_index, icon }) => ({ id, name, color_index, icon }));
    }, [selected, flags, reload]);

    return { flags, options, selected, saving, openFor, toggle, save, reload };
};

export default useTransactionFlags;
