/**
 * CAPACITOR PLUGINS SINGLETON
 * 
 * Este módulo centraliza el registro de plugins de Capacitor para evitar
 * el error "Cannot register plugins twice" que ocurre cuando varios
 * módulos intentan registrar el mismo plugin.
 * 
 * IMPORTANTE: Solo importar este módulo en páginas que realmente usen
 * tracking GPS nativo (no en overlays web).
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

// Interfaz del plugin BackgroundGeolocation
export interface BackgroundGeolocationPlugin {
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

// Singleton - solo registrar si estamos en plataforma nativa
let _backgroundGeolocation: BackgroundGeolocationPlugin | null = null;

/**
 * Obtiene la instancia singleton del plugin BackgroundGeolocation.
 * Retorna null si no estamos en plataforma nativa.
 */
export function getBackgroundGeolocation(): BackgroundGeolocationPlugin | null {
  // Solo registrar en plataforma nativa
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  // Registrar solo una vez
  if (!_backgroundGeolocation) {
    try {
      _backgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
    } catch (error) {
      console.warn('[CapacitorPlugins] Error registering BackgroundGeolocation:', error);
      return null;
    }
  }

  return _backgroundGeolocation;
}

/**
 * Verifica si estamos en una plataforma nativa de Capacitor
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Obtiene la plataforma actual (web, ios, android)
 */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
