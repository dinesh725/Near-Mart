import { useEffect, useRef, useCallback } from 'react';

/**
 * Android back button handler for Capacitor.
 * - If history exists → navigate back
 * - Otherwise → show "Press back again to exit" toast, exit on 2nd press within 2s
 */
const useBackButton = (showToast) => {
    const lastBackRef = useRef(0);

    const handleBack = useCallback(async () => {
        try {
            const { App } = await import('@capacitor/app');

            // If we have navigation history, go back
            if (window.history.length > 1) {
                window.history.back();
                return;
            }

            // Double-press to exit
            const now = Date.now();
            if (now - lastBackRef.current < 2000) {
                await App.exitApp();
            } else {
                lastBackRef.current = now;
                if (showToast) {
                    showToast('Press back again to exit', { icon: '👋', duration: 2000 });
                }
            }
        } catch {
            // Not running in Capacitor — regular browser back
            if (window.history.length > 1) window.history.back();
        }
    }, [showToast]);

    useEffect(() => {
        let cleanup = null;

        (async () => {
            try {
                const { App } = await import('@capacitor/app');
                const listener = await App.addListener('backButton', (event) => {
                    // event.canGoBack is provided by Capacitor
                    if (event.canGoBack) {
                        window.history.back();
                    } else {
                        handleBack();
                    }
                });
                cleanup = listener;
            } catch {
                // Not in Capacitor environment — no-op
            }
        })();

        return () => {
            if (cleanup?.remove) cleanup.remove();
        };
    }, [handleBack]);
};

export default useBackButton;
