import { useEffect, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export function usePushNotifications() {
    const [pushToken, setPushToken] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        // PushNotifications are only available on actual native ecosystems (Android/iOS)
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'web') {
            return;
        }

        const registerPush = async () => {
            try {
                // Request permission
                let permStatus = await PushNotifications.checkPermissions();
                if (permStatus.receive === 'prompt') {
                    permStatus = await PushNotifications.requestPermissions();
                }

                if (permStatus.receive !== 'granted') {
                    console.warn('[Push] User denied push notification permissions');
                    return;
                }

                // Register with Apple / Google to receive token
                await PushNotifications.register();

                // Listen for physical token
                PushNotifications.addListener('registration', async (t) => {
                    console.log('[Push] Token established:', t.value);
                    setPushToken(t.value);

                    // If user is logged in, sync the FCM token to backend
                    const accessToken = api.getAccessToken();
                    if (user && accessToken) {
                        try {
                            await api.patch("/auth/fcm-token", { fcmToken: t.value });
                            console.log('[Push] Token synced to backend');
                        } catch (err) {
                            console.error('[Push] Failed to sync token:', err);
                        }
                    }
                });

                PushNotifications.addListener('registrationError', (error) => {
                    console.error('[Push] SDK Registration Error:', error);
                });

                PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    console.log('[Push] Notification received in foreground:', notification);
                    // Native banner overlays usually trigger, but we could also fire a Context Toast here
                });

                PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                    console.log('[Push] User tapped notification action:', action);
                    // SPA navigation via custom event — NO window.location.href
                    const data = action.notification.data;
                    if (data) {
                        window.dispatchEvent(new CustomEvent('push_nav', { detail: data }));
                    }
                });

            } catch (err) {
                console.error('[Push] Error initializing Push Notifications:', err);
            }
        };

        registerPush();

        return () => {
            PushNotifications.removeAllListeners();
        };
    }, [user]);

    return { pushToken };
}
