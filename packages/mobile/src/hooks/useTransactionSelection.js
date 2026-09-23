import { useCallback, useState } from 'react';
import api from '../services/api';
import {
    MAX_SELECTION,
    toggleSelection,
    summarizeSelection,
} from '../utils/transactionSelection';

/**
 * Selection mode for a transaction list: what is ticked, what it adds up to,
 * and the two things that can be done with it.
 *
 * All Transactions and Account Transactions both have this, and Flag Detail is
 * the obvious third. Two copies of six pieces of state and four async handlers
 * is how the two category vocabularies happened, so the orchestration lives
 * here and the arithmetic stays in `utils/transactionSelection.js`, which is
 * pure and separately tested.
 *
 * **`rows` must be the rows actually on screen.** The count and the total are
 * both computed by walking it, so passing a list wider than what is displayed
 * is how a bar ends up reading "5 selected" over a total covering rows the
 * user cannot see. On a screen that filters client-side, that means the
 * filtered list, not everything fetched.
 *
 * What this deliberately does not own: anything about *one* transaction. The
 * single-transaction category sheet is driven by the detail sheet's open row,
 * and folding the two together is how a sheet ends up open over a transaction
 * it was not about.
 *
 * @param {object[]} rows           the visible transactions, each `{ id, amount }`
 * @param {() => void} onChanged    reload the list after a write moved totals
 * @param {() => Promise<void>} onFlagsChanged  reload flags after a group is made
 */
const useTransactionSelection = ({ rows, onChanged, onFlagsChanged }) => {
    // Entered from an explicit control rather than a long-press: nothing is
    // hidden behind a gesture, and it cannot be triggered by accident on a list
    // people scroll through every day.
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [groupOpen, setGroupOpen] = useState(false);
    const [groupError, setGroupError] = useState(null);
    const [busy, setBusy] = useState(false);

    const summary = summarizeSelection(rows, selected);
    const atCap = summary.count >= MAX_SELECTION;

    const enter = useCallback(() => setSelectMode(true), []);

    /** Leave selection mode entirely. */
    const exit = useCallback(() => {
        setSelectMode(false);
        setSelected(new Set());
    }, []);

    /**
     * Drop the selection but stay in selection mode.
     *
     * For a filter change: keeping the ticks would leave a total covering rows
     * that are no longer on screen, while filtering and then selecting is a
     * perfectly reasonable thing to be in the middle of doing.
     */
    const clear = useCallback(() => {
        // Returning the same Set when there is nothing to drop lets React bail
        // out of the render. Both callers run this from an effect keyed on
        // their filters, which fires once on mount as well.
        setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    }, []);

    const toggle = useCallback((id) => {
        // Silently refusing a tap at the cap would read as a broken row, so an
        // already-selected one can always be tapped off.
        //
        // The cap is measured against the VISIBLE count, not the size of the
        // Set. They are the same whenever a filter change clears the selection,
        // which both screens do — but the request is built from the visible
        // rows, so the visible count is the number the endpoint will actually
        // be handed, and capping on anything else caps the wrong thing.
        if (atCap && !selected.has(id)) return;
        setSelected((prev) => toggleSelection(prev, id));
    }, [atCap, selected]);

    const isSelected = useCallback((id) => selected.has(id), [selected]);

    /**
     * The ids to act on.
     *
     * These are PLAID transaction ids — `GET /transactions` aliases the numeric
     * key away before the device ever sees it — which is what both the flag
     * endpoint and the category endpoint expect. Derived from `rows` rather
     * than from the Set, so a row that has left the screen leaves the request
     * too, exactly as it has already left the count and the total.
     */
    const selectedIds = useCallback(
        () => rows.filter((row) => selected.has(row.id)).map((row) => row.id),
        [rows, selected]
    );

    const applyCategory = useCallback(async (category) => {
        const ids = selectedIds();
        if (ids.length === 0) return;

        try {
            setBusy(true);
            await api.setTransactionCategories(ids, category);
            setCategoryOpen(false);
            exit();
            // Reload rather than patch: a category change moves the totals and
            // can move rows out of a category-derived view later. Patching
            // would leave the header disagreeing with the rows beneath it.
            onChanged?.();
        } catch (error) {
            console.error('Error setting categories:', error);
        } finally {
            setBusy(false);
        }
    }, [selectedIds, exit, onChanged]);

    const createGroup = useCallback(async ({ name, colorIndex, icon }) => {
        const ids = selectedIds();
        if (ids.length === 0) return;

        try {
            setBusy(true);
            setGroupError(null);
            const created = await api.createFlag({ name, colorIndex, icon });
            const flagId = created?.data?.id ?? created?.id;
            if (!flagId) throw new Error('flag id missing from the create response');

            await api.setFlagTransactions(flagId, { add: ids });
            setGroupOpen(false);
            exit();
            await onFlagsChanged?.();
            onChanged?.();
        } catch (error) {
            console.error('Error creating a group:', error);
            // Surfaced in the sheet rather than swallowed: a duplicate name is
            // a 409 the user can fix, and a silent failure here loses a
            // selection they built by hand.
            setGroupError(error?.message || 'Could not create that group.');
        } finally {
            setBusy(false);
        }
    }, [selectedIds, exit, onChanged, onFlagsChanged]);

    const openGroup = useCallback(() => {
        setGroupError(null);
        setGroupOpen(true);
    }, []);

    return {
        selectMode,
        summary,
        atCap,
        busy,
        enter,
        exit,
        clear,
        toggle,
        isSelected,
        // Sheet plumbing, consumed by TransactionSelectionBar.
        categoryOpen,
        openCategory: useCallback(() => setCategoryOpen(true), []),
        closeCategory: useCallback(() => setCategoryOpen(false), []),
        groupOpen,
        groupError,
        openGroup,
        closeGroup: useCallback(() => setGroupOpen(false), []),
        applyCategory,
        createGroup,
    };
};

export default useTransactionSelection;
