import { useCallback, useRef, useState, useEffect } from 'react';
import { Geolocation, Position, WatchPositionCallback } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

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
 * On native platforms, it enables background location tracking
 */
export const useNativeGeolocation = (): UseNativeGeolocationReturn => {
  const isNative = Capacitor.isNativePlatform();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const webWatchIdRef = useRef<number | null>(null);

  // Check permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (isNative) {
        try {
          const status = await Geolocation.checkPermissions();
          setHasPermission(status.location === 'granted' || status.coarseLocation === 'granted');
        } catch (e) {
          console.error('Error checking permissions:', e);
          setHasPermission(false);
        }
      } else {
        // Web: check via navigator.permissions if available
        if ('permissions' in navigator) {
          try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            setHasPermission(result.state === 'granted');
          } catch (e) {
            setHasPermission(null);
          }
        }
      }
    };
    checkPermissions();
  }, [isNative]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (isNative) {
      try {
        const status = await Geolocation.requestPermissions();
        const granted = status.location === 'granted' || status.coarseLocation === 'granted';
        setHasPermission(granted);
        return granted;
      } catch (e) {
        console.error('Error requesting permissions:', e);
        return false;
      }
    } else {
      // Web: trigger permission by getting position
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
    }
  }, [isNative]);

  const positionToResult = (position: Position | GeolocationPosition): GeolocationResult => {
    // Both Capacitor Position and Web GeolocationPosition have the same structure
    const coords = position.coords;
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude ?? null,
      accuracy: coords.accuracy ?? null,
      speed: coords.speed ?? null,
      timestamp: new Date(position.timestamp).toISOString(),
    };
  };

  const getCurrentPosition = useCallback(async (
    options?: UseNativeGeolocationOptions
  ): Promise<GeolocationResult | null> => {
    const opts = {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 0,
    };

    if (isNative) {
      try {
        const position = await Geolocation.getCurrentPosition(opts);
        return positionToResult(position);
      } catch (e) {
        console.error('Native getCurrentPosition error:', e);
        return null;
      }
    } else {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(positionToResult(position)),
          (error) => {
            console.error('Web getCurrentPosition error:', error);
            resolve(null);
          },
          opts
        );
      });
    }
  }, [isNative]);

  const watchPosition = useCallback(async (
    callback: (position: GeolocationResult) => void,
    options?: UseNativeGeolocationOptions
  ): Promise<string | null> => {
    const opts = {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 15000,
      maximumAge: options?.maximumAge ?? 0,
    };

    if (isNative) {
      try {
        // Request permissions first on native
        const hasPerms = await requestPermissions();
        if (!hasPerms) {
          console.error('No geolocation permission');
          return null;
        }

        const watchId = await Geolocation.watchPosition(opts, (position, err) => {
          if (err) {
            console.error('Native watch error:', err);
            return;
          }
          if (position) {
            callback(positionToResult(position));
          }
        });
        return watchId;
      } catch (e) {
        console.error('Native watchPosition error:', e);
        return null;
      }
    } else {
      // Web fallback
      const watchId = navigator.geolocation.watchPosition(
        (position) => callback(positionToResult(position)),
        (error) => console.error('Web watch error:', error),
        opts
      );
      webWatchIdRef.current = watchId;
      return `web-${watchId}`;
    }
  }, [isNative, requestPermissions]);

  const clearWatch = useCallback(async (watchId: string): Promise<void> => {
    if (isNative) {
      try {
        await Geolocation.clearWatch({ id: watchId });
      } catch (e) {
        console.error('Error clearing native watch:', e);
      }
    } else {
      // Web fallback
      if (watchId.startsWith('web-')) {
        const numericId = parseInt(watchId.replace('web-', ''), 10);
        navigator.geolocation.clearWatch(numericId);
      }
      if (webWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
        webWatchIdRef.current = null;
      }
    }
  }, [isNative]);

  return {
    isNative,
    hasPermission,
    watchPosition,
    getCurrentPosition,
    clearWatch,
    requestPermissions,
  };
};
