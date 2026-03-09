import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.nearmart.app',
  appName: 'NearMart',
  webDir: 'build',

  server: {
    // For development live-reload, uncomment and set your local IP:
    // url: 'http://192.168.31.44:3001',
    // cleartext: true,

    // Allow navigation to your API domain and third-party auth/payment domains
    allowNavigation: [
      'api.nearmart.in',
      'near-mart.onrender.com',
      'accounts.google.com',
      '*.google.com',
      'checkout.razorpay.com',
      'api.razorpay.com',
    ],
  },

  plugins: {
    // CapacitorHttp ENABLED — routes all fetch/XHR through Android/iOS native HTTP
    // layer, which bypasses WebView CORS entirely. This is required because the
    // deployed server may not have Capacitor WebView origins in its CORS whitelist.
    // Security is maintained via JWT Bearer tokens (not cookies).
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#070B12',
      showSpinner: true,
      spinnerColor: '#6366f1',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true, // Set false for production release
  },

  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'NearMart',
  },
};

export default config;
