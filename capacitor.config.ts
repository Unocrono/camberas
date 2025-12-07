import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.ce90a0d67611478a9cd75d58c8c47bb9',
  appName: 'camberas',
  webDir: 'dist',
  server: {
    url: 'https://ce90a0d6-7611-478a-9cd7-5d58c8c47bb9.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
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
    }
  },
  ios: {
    // Enable background modes
    backgroundColor: '#0a0a0a'
  },
  android: {
    backgroundColor: '#0a0a0a',
    // Foreground service for GPS tracking
    allowMixedContent: true
  }
};

export default config;
