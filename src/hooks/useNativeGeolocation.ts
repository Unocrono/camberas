import { useCallback, useRef, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

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
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            // Foreground Service configuration for Android
            // This creates a persistent notification that prevents the OS from killing the app
            backgroundTitle: 'Tracking Activo',
            backgroundMessage: 'Camberas GPS está compartiendo tu ubicación en tiempo real.',
            requestPermissions: true,
            stale: false,           // Only use fresh GPS readings, not cached
            distanceFilter: 5,      // Update every 5 meters for better accuracy
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                console.error('Location permission not authorized');
                // Could prompt user to open settings
                // BackgroundGeolocation.openSettings();
              }
              console.error('Background location error:', error);
              return;
            }
            if (location) {
              callback(positionToResult(location));
            }
          }
        );
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
