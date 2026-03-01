import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.nearmart.app',
  appName: 'NearMart',
  webDir: 'build',

  server: {
    // For development live-reload, uncomment and set your local IP:
    // url: 'http://192.168.31.44:3001',
    // cleartext: true,

    // Allow navigation to your API domain
    allowNavigation: ['api.nearmart.in'],
  },

  plugins: {
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
