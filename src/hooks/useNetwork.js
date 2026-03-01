import { useState, useEffect } from "react";

/**
 * useNetwork — tracks online/offline status with reconnection awareness.
 *
 * Returns:
 *   isOnline   — current connectivity state
 *   wasOffline — true if user recently recovered from offline (resets after 4s)
 */
export function useNetwork() {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );
    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        let timer;

        const goOnline = () => {
            setIsOnline(true);
            setWasOffline(true);
            timer = setTimeout(() => setWasOffline(false), 4000);
        };

        const goOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
            clearTimeout(timer);
        };
    }, []);

    return { isOnline, wasOffline };
}
