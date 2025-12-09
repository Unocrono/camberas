import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.ce90a0d67611478a9cd75d58c8c47bb9',
  appName: 'GPS Camberas',
  webDir: 'dist',
  // Remove server.url for production builds - this makes the app use local assets
  // Uncomment the server block below only for development/live-reload
  /*
  server: {
    url: 'https://ce90a0d6-7611-478a-9cd7-5d58c8c47bb9.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  */
  plugins: {
    Geolocation: {
      // iOS: Always and When In Use location permission
      // Android: Fine and coarse location + background location
    },
    BackgroundRunner: {
      label: 'com.camberas.gps.tracking',
      src: 'background.js',
      event: 'gpsUpdate',
      repeat: true,
      interval: 30,
      autoStart: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a'
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
      showSpinner: true,
      spinnerColor: '#16a34a'
    }
  },
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic'
  },
  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: true
  }
};

export default config;
