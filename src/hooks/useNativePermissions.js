import { useState, useEffect, useCallback } from 'react';

/**
 * Native permissions handler for Capacitor.
 * Requests Location and Notification permissions on first launch.
 * Shows dismissable explanation UI if permissions are denied.
 */

const PERM_KEY = 'nm_permissions_asked';

const useNativePermissions = () => {
    const [permStatus, setPermStatus] = useState({
        location: 'unknown',    // 'granted' | 'denied' | 'unknown'
        notifications: 'unknown',
    });
    const [showBanner, setShowBanner] = useState(false);

    const checkAndRequest = useCallback(async () => {
        // Skip if already asked this session
        if (sessionStorage.getItem(PERM_KEY)) return;

        try {
            // Location permission
            const { Geolocation } = await import('@capacitor/geolocation').catch(() => ({}));
            if (Geolocation) {
                const locPerm = await Geolocation.checkPermissions();
                if (locPerm.location !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    setPermStatus(prev => ({ ...prev, location: req.location }));
                    if (req.location === 'denied') setShowBanner(true);
                } else {
                    setPermStatus(prev => ({ ...prev, location: 'granted' }));
                }
            }

            // Notification permission
            const { PushNotifications } = await import('@capacitor/push-notifications').catch(() => ({}));
            if (PushNotifications) {
                const notifPerm = await PushNotifications.checkPermissions();
                if (notifPerm.receive !== 'granted') {
                    const req = await PushNotifications.requestPermissions();
                    setPermStatus(prev => ({ ...prev, notifications: req.receive }));
                    if (req.receive === 'denied') setShowBanner(true);
                } else {
                    setPermStatus(prev => ({ ...prev, notifications: 'granted' }));
                }
            }

            sessionStorage.setItem(PERM_KEY, '1');
        } catch {
            // Not in Capacitor — web environment
        }
    }, []);

    useEffect(() => {
        // Delay slightly to not block app startup
        const timer = setTimeout(checkAndRequest, 1500);
        return () => clearTimeout(timer);
    }, [checkAndRequest]);

    const dismissBanner = useCallback(() => setShowBanner(false), []);

    return { permStatus, showBanner, dismissBanner };
};

export default useNativePermissions;
