import { useCallback, useState } from 'react';

/**
 * The CustomAlert boilerplate every screen was writing by hand.
 *
 *   const { showAlert, alertProps } = useAlert();
 *   showAlert('Error', 'Please enter an email address');
 *   ...
 *   <CustomAlert {...alertProps} />
 *
 * Buttons are dismissed for you before their handler runs, so a handler that
 * navigates away never leaves the dialog mounted over the next screen — the
 * `setAlertVisible(false)` every call site used to have to remember.
 */

const CLOSED = { visible: false, title: '', message: '', buttons: [] };

export const useAlert = () => {
    const [state, setState] = useState(CLOSED);

    const hideAlert = useCallback(() => {
        setState((prev) => ({ ...prev, visible: false }));
    }, []);

    const showAlert = useCallback((title, message, buttons = []) => {
        setState({
            visible: true,
            title,
            message,
            buttons: buttons.map((btn) => ({
                ...btn,
                onPress: () => {
                    hideAlert();
                    btn.onPress?.();
                },
            })),
        });
    }, [hideAlert]);

    return {
        showAlert,
        hideAlert,
        alertProps: { ...state, onRequestClose: hideAlert },
    };
};

export default useAlert;
