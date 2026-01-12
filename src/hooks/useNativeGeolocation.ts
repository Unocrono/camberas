import { useCallback, useRef, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Background Geolocation plugin interface
interface BackgroundGeolocationPlugin {
  addWatcher: (
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (location: any, error: any) => void
  ) => Promise<string>;
  removeWatcher: (options: { id: string }) => Promise<void>;
  openSettings: () => Promise<void>;
}

// Register the plugin
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Request POST_NOTIFICATIONS permission on Android 13+ (API 33+)
 * This is REQUIRED to show the persistent Foreground Service notification
 * Without this permission, the Foreground Service cannot display its notification
 * and Android will kill the background tracking when the screen is off
 */
const requestNotificationPermission = async (): Promise<boolean> => {
  // Only needed on native Android
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('[GPS] Not Android native, skipping notification permission');
    return true;
  }

  try {
    console.log('[GPS] Checking notification permission status...');
    
    // Use Capacitor LocalNotifications to check and request permission
    const permStatus = await LocalNotifications.checkPermissions();
    console.log('[GPS] Current notification permission:', permStatus.display);
    
    if (permStatus.display === 'granted') {
      console.log('[GPS] ✅ Notification permission already granted');
      return true;
    }
    
    if (permStatus.display === 'denied') {
      console.warn('[GPS] ⚠️ Notification permission denied. Opening settings...');
      // Try to open settings so user can manually enable
      try {
        await BackgroundGeolocation.openSettings();
      } catch (e) {
        console.error('[GPS] Could not open settings:', e);
      }
      return false;
    }
    
    // Request permission (prompt state)
    console.log('[GPS] Requesting notification permission...');
    const requestResult = await LocalNotifications.requestPermissions();
    console.log('[GPS] Notification permission result:', requestResult.display);
    
    if (requestResult.display === 'granted') {
      console.log('[GPS] ✅ Notification permission granted!');
      return true;
    } else {
      console.warn('[GPS] ❌ Notification permission not granted:', requestResult.display);
      return false;
    }
  } catch (error) {
    console.error('[GPS] Error requesting notification permission:', error);
    // Don't block tracking, but warn
    console.warn('[GPS] Proceeding without notification permission - tracking may stop when screen is off');
    return true;
  }
};

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  timestamp: string;
}

interface UseNativeGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

interface UseNativeGeolocationReturn {
  isNative: boolean;
  hasPermission: boolean | null;
  watchPosition: (callback: (position: GeolocationResult) => void, options?: UseNativeGeolocationOptions) => Promise<string | null>;
  getCurrentPosition: (options?: UseNativeGeolocationOptions) => Promise<GeolocationResult | null>;
  clearWatch: (watchId: string) => Promise<void>;
  requestPermissions: () => Promise<boolean>;
}

/**
 * Hook that provides unified geolocation API for both web and native (Capacitor)
 * On native platforms, uses @capacitor-community/background-geolocation for true background support
 */
export const useNativeGeolocation = (): UseNativeGeolocationReturn => {
  const isNative = Capacitor.isNativePlatform();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const webWatchIdRef = useRef<number | null>(null);

  // Check permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          setHasPermission(result.state === 'granted');
        } catch (e) {
          setHasPermission(null);
        }
      }
    };
    checkPermissions();
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    // Trigger permission by getting position
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setHasPermission(true);
          resolve(true);
        },
        () => {
          setHasPermission(false);
          resolve(false);
        }
      );
    });
  }, []);

  const positionToResult = (position: GeolocationPosition | any): GeolocationResult => {
    // Handle both web GeolocationPosition and background-geolocation format
    if ('coords' in position) {
      // Web format
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitude: position.coords.altitude ?? null,
        accuracy: position.coords.accuracy ?? null,
        speed: position.coords.speed ?? null,
        timestamp: new Date(position.timestamp).toISOString(),
      };
    } else {
      // Background geolocation format (flat structure)
      return {
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: position.altitude ?? null,
        accuracy: position.accuracy ?? null,
        speed: position.speed ?? null,
        timestamp: new Date(position.time || Date.now()).toISOString(),
      };
    }
  };

  const getCurrentPosition = useCallback(async (
    options?: UseNativeGeolocationOptions
  ): Promise<GeolocationResult | null> => {
    const opts = {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 0,
    };

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(positionToResult(position)),
        (error) => {
          console.error('getCurrentPosition error:', error);
          resolve(null);
        },
        opts
      );
    });
  }, []);

  const watchPosition = useCallback(async (
    callback: (position: GeolocationResult) => void,
    options?: UseNativeGeolocationOptions
  ): Promise<string | null> => {
    if (isNative) {
      // Use background geolocation plugin for native platforms
      try {
        // CRITICAL: Request notification permission FIRST on Android 13+ (API 33+)
        // This is REQUIRED for the Foreground Service notification to appear
        // Without this, Android will kill the tracking when screen is off!
        const hasNotificationPerm = await requestNotificationPermission();
        
        if (!hasNotificationPerm) {
          console.warn('[GPS] ⚠️ Notification permission not granted - background tracking may not work!');
        }
        
        console.log('[GPS] Starting BackgroundGeolocation watcher...');
        
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            // Foreground Service configuration for Android
            // This creates a persistent notification that prevents the OS from killing the app
            backgroundTitle: 'Tracking Activo 📍',
            backgroundMessage: 'Camberas GPS - Ubicación en tiempo real',
            requestPermissions: true,
            // CRITICAL: stale: true allows cached readings when fresh GPS unavailable
            // This helps maintain tracking when OS throttles GPS in deep sleep
            stale: true,
            // Reduce distance filter for more frequent updates (meters)
            distanceFilter: 3,
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                console.error('[GPS] ❌ Location permission not authorized');
                // Prompt user to open settings
                BackgroundGeolocation.openSettings();
              }
              console.error('[GPS] Background location error:', error);
              return;
            }
            if (location) {
              console.log('[GPS] 📍 Native location received:', location.latitude.toFixed(6), location.longitude.toFixed(6));
              callback(positionToResult(location));
            }
          }
        );
        
        console.log('[GPS] ✅ Watcher started with ID:', watcherId);
        return watcherId;
      } catch (e) {
        console.error('Failed to start background geolocation:', e);
        // Fallback to web API
        const watchId = navigator.geolocation.watchPosition(
          (position) => callback(positionToResult(position)),
          (error) => console.error('Web watch error:', error),
          {
            enableHighAccuracy: options?.enableHighAccuracy ?? true,
            timeout: options?.timeout ?? 15000,
            maximumAge: options?.maximumAge ?? 0,
          }
        );
        webWatchIdRef.current = watchId;
        return `web-${watchId}`;
      }
    } else {
      // Web fallback
      const watchId = navigator.geolocation.watchPosition(
        (position) => callback(positionToResult(position)),
        (error) => console.error('Web watch error:', error),
        {
          enableHighAccuracy: options?.enableHighAccuracy ?? true,
          timeout: options?.timeout ?? 15000,
          maximumAge: options?.maximumAge ?? 0,
        }
      );
      webWatchIdRef.current = watchId;
      return `web-${watchId}`;
    }
  }, [isNative]);

  const clearWatch = useCallback(async (watchId: string): Promise<void> => {
    if (watchId.startsWith('web-')) {
      // Web watcher
      const numericId = parseInt(watchId.replace('web-', ''), 10);
      navigator.geolocation.clearWatch(numericId);
      if (webWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
        webWatchIdRef.current = null;
      }
    } else {
      // Native background geolocation watcher
      try {
        await BackgroundGeolocation.removeWatcher({ id: watchId });
      } catch (e) {
        console.error('Error removing background watcher:', e);
      }
    }
  }, []);

  return {
    isNative,
    hasPermission,
    watchPosition,
    getCurrentPosition,
    clearWatch,
    requestPermissions,
  };
};
