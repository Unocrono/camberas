import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/integrations/supabase/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * BACKGROUND TRACKING SERVICE PARA CAMBERAS
 * 
 * Este servicio maneja el tracking GPS en segundo plano usando:
 * - @capacitor-community/background-geolocation (GRATIS)
 * - Notificación persistente para mantener el servicio vivo
 * - Envío automático a Supabase
 */

// GPS Point para corredores
interface GPSPoint {
  race_id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number;
  timestamp: string;
}

// GPS Point para motos
interface MotoGPSPoint {
  moto_id: string;
  race_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number;
  timestamp: string;
}

type AppMode = 'runner' | 'moto';

// Configuración del tracking actual
interface TrackingConfig {
  mode: AppMode;
  race_id: string;
  registration_id?: string; // Para runners
  moto_id?: string;         // Para motos
  runner_name?: string;
  moto_name?: string;
  bib_number?: number | null;
  update_frequency?: number; // segundos
}

// Variable global para almacenar la configuración
let currentConfig: TrackingConfig | null = null;
let watcherId: string | null = null;
let isInitialized = false;

/**
 * Obtener nivel de batería del dispositivo
 */
async function getBatteryLevel(): Promise<number> {
  try {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      return Math.round(battery.level * 100);
    }
  } catch (error) {
    console.warn('No se pudo obtener nivel de batería:', error);
  }
  return 100; // Default
}

/**
 * Solicitar permisos necesarios
 */
export async function requestBackgroundPermissions(): Promise<boolean> {
  try {
    console.log('🔐 Solicitando permisos...');
    
    // 1. Permisos de notificaciones
    try {
      const notifPermission = await LocalNotifications.requestPermissions();
      if (notifPermission.display !== 'granted') {
        console.warn('⚠️ Permisos de notificaciones denegados (recomendado pero no crítico)');
      }
    } catch (error) {
      console.warn('⚠️ No se pudieron solicitar permisos de notificación:', error);
    }

    // Los permisos de ubicación se solicitan automáticamente con addWatcher
    // cuando requestPermissions: true está configurado
    console.log('✅ Permisos de notificación procesados');
    return true;

  } catch (error) {
    console.error('❌ Error solicitando permisos:', error);
    return false;
  }
}

/**
 * Crear notificación persistente
 */
async function createPersistentNotification(config: TrackingConfig) {
  try {
    const displayName = config.mode === 'runner' 
      ? `${config.runner_name || 'Corredor'}${config.bib_number ? ` #${config.bib_number}` : ''}`
      : config.moto_name || 'Moto';

    await LocalNotifications.schedule({
      notifications: [{
        id: 999,
        title: '📍 Camberas GPS Tracking',
        body: `${displayName} - Enviando posición en tiempo real`,
        ongoing: true,
        autoCancel: false,
        sound: undefined,
        smallIcon: 'res://camberaslogoa',
      }]
    });
    
    console.log('✅ Notificación persistente creada');
  } catch (error) {
    console.error('❌ Error creando notificación:', error);
  }
}

/**
 * Remover notificación persistente
 */
async function removePersistentNotification() {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 999 }] });
    console.log('✅ Notificación removida');
  } catch (error) {
    console.error('❌ Error removiendo notificación:', error);
  }
}

/**
 * Enviar posición a Supabase (RUNNERS)
 */
async function sendRunnerPosition(location: any, config: TrackingConfig): Promise<boolean> {
  try {
    if (!config.registration_id) {
      throw new Error('registration_id no configurado');
    }

    const batteryLevel = await getBatteryLevel();

    const gpsPoint: GPSPoint = {
      race_id: config.race_id,
      registration_id: config.registration_id,
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude || null,
      accuracy: location.accuracy || null,
      speed: location.speed || null,
      heading: location.bearing || location.heading || null,
      battery_level: batteryLevel,
      timestamp: new Date(location.time || Date.now()).toISOString(),
    };

    const { error } = await supabase
      .from('gps_tracking')
      .insert(gpsPoint);

    if (error) throw error;

    console.log('✅ [RUNNER] Posición enviada:', gpsPoint);
    return true;

  } catch (error) {
    console.error('❌ [RUNNER] Error enviando posición:', error);
    return false;
  }
}

/**
 * Enviar posición a Supabase (MOTOS)
 */
async function sendMotoPosition(location: any, config: TrackingConfig): Promise<boolean> {
  try {
    if (!config.moto_id) {
      throw new Error('moto_id no configurado');
    }

    const batteryLevel = await getBatteryLevel();

    const motoPoint: MotoGPSPoint = {
      moto_id: config.moto_id,
      race_id: config.race_id,
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude || null,
      accuracy: location.accuracy || null,
      speed: location.speed || null,
      heading: location.bearing || location.heading || null,
      battery_level: batteryLevel,
      timestamp: new Date(location.time || Date.now()).toISOString(),
    };

    const { error } = await supabase
      .from('moto_gps_tracking')
      .insert(motoPoint);

    if (error) throw error;

    console.log('✅ [MOTO] Posición enviada:', motoPoint);
    return true;

  } catch (error) {
    console.error('❌ [MOTO] Error enviando posición:', error);
    return false;
  }
}

/**
 * Callback cuando se recibe una nueva posición
 */
function onLocationUpdate(location: any) {
  if (!currentConfig) {
    console.error('❌ No hay configuración de tracking');
    return;
  }

  console.log('📍 Nueva posición:', {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: location.accuracy,
    speed: location.speed,
  });

  // Enviar según el modo
  if (currentConfig.mode === 'runner') {
    sendRunnerPosition(location, currentConfig);
  } else {
    sendMotoPosition(location, currentConfig);
  }
}

/**
 * Callback cuando hay un error
 */
function onLocationError(error: any) {
  console.error('❌ Error de ubicación:', error);
}

/**
 * INICIAR tracking en segundo plano
 */
export async function startBackgroundTracking(config: TrackingConfig): Promise<boolean> {
  try {
    console.log('🚀 Iniciando background tracking:', config);

    // Guardar configuración
    currentConfig = config;

    // 1. Solicitar permisos si aún no los tiene
    if (!isInitialized) {
      const hasPermissions = await requestBackgroundPermissions();
      if (!hasPermissions) {
        throw new Error('Permisos no otorgados');
      }
      isInitialized = true;
    }

    // 2. Crear notificación persistente
    await createPersistentNotification(config);

    // 3. Configurar frecuencia de actualización
    const updateFrequency = config.update_frequency || 30; // Default 30 segundos
    const distanceFilter = Math.max(10, updateFrequency * 2); // Mínimo 10 metros

    console.log(`⚙️ Configurando tracking cada ${updateFrequency}s o ${distanceFilter}m`);

    // 4. Iniciar el tracking
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: '📍 Camberas - Tracking activo',
        backgroundTitle: 'GPS Camberas',
        requestPermissions: false, // Ya los solicitamos
        stale: false,
        distanceFilter: distanceFilter,
      },
      (location, error) => {
        if (error) {
          onLocationError(error);
          return;
        }
        if (location) {
          onLocationUpdate(location);
        }
      }
    );

    console.log('✅ Background tracking iniciado con ID:', watcherId);
    return true;

  } catch (error) {
    console.error('❌ Error iniciando tracking:', error);
    currentConfig = null;
    await removePersistentNotification();
    return false;
  }
}

/**
 * DETENER tracking en segundo plano
 */
export async function stopBackgroundTracking(): Promise<boolean> {
  try {
    console.log('⏹️ Deteniendo background tracking...');

    if (watcherId) {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
      watcherId = null;
    }

    await removePersistentNotification();
    currentConfig = null;

    console.log('✅ Background tracking detenido');
    return true;

  } catch (error) {
    console.error('❌ Error deteniendo tracking:', error);
    return false;
  }
}

/**
 * Verificar si el tracking está activo
 */
export function isBackgroundTrackingActive(): boolean {
  return watcherId !== null && currentConfig !== null;
}

/**
 * Obtener configuración actual
 */
export function getCurrentTrackingConfig(): TrackingConfig | null {
  return currentConfig;
}

// Exportar por defecto
export default {
  requestBackgroundPermissions,
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
  getCurrentTrackingConfig,
};