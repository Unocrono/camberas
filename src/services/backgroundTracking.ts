import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
import { LocalNotifications } from '@capacitor/local-notifications';

// Interfaz para las actualizaciones de posición
export interface PositionUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: number;
}

// Variable para almacenar el watcher ID
let watcherId: string | null = null;

/**
 * Solicitar permisos necesarios
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    // Permisos de notificaciones (para la notificación persistente)
    const notifPermission = await LocalNotifications.requestPermissions();
    
    if (notifPermission.display !== 'granted') {
      console.warn('⚠️ Permisos de notificaciones denegados (recomendado)');
      // Continuamos igual, pero sin notificación
    }

    console.log('✅ Permisos otorgados');
    return true;

  } catch (error) {
    console.error('Error solicitando permisos:', error);
    return false;
  }
}

/**
 * Crear notificación persistente
 */
async function createPersistentNotification() {
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: 999,
        title: '📍 Camberas Tracking',
        body: 'Enviando tu posición en tiempo real',
        ongoing: true, // No se puede cerrar deslizando
        autoCancel: false,
        sound: undefined, // Sin sonido
        smallIcon: 'res://camberaslogoa',
      }]
    });
    console.log('✅ Notificación persistente creada');
  } catch (error) {
    console.error('Error creando notificación:', error);
  }
}

/**
 * Remover notificación persistente
 */
async function removePersistentNotification() {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 999 }] });
    console.log('✅ Notificación persistente removida');
  } catch (error) {
    console.error('Error removiendo notificación:', error);
  }
}

/**
 * Callback cuando se recibe una nueva posición
 */
function onLocationUpdate(location: any) {
  const position: PositionUpdate = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    speed: location.speed,
    heading: location.bearing || location.heading,
    altitude: location.altitude,
    timestamp: location.time || Date.now()
  };

  console.log('[📍 Nueva posición]', position);

  // Enviar al servidor
  sendPositionToServer(position);
}

/**
 * Callback cuando hay un error
 */
function onLocationError(error: any) {
  console.error('[❌ Error de ubicación]', error);
}

/**
 * Iniciar el tracking en segundo plano
 */
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    // 1. Solicitar permisos si aún no los tiene
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      alert('Necesitas otorgar permisos de ubicación para usar el tracking');
      return false;
    }

    // 2. Crear notificación persistente
    await createPersistentNotification();

    // 3. Configurar y empezar el tracking
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        // Configuración de tracking
        backgroundMessage: '📍 Camberas - Tracking activo',
        backgroundTitle: 'GPS Camberas',
        requestPermissions: true, // Solicitar permisos de ubicación
        stale: false, // No usar ubicaciones antiguas
        
        // Frecuencia de actualización
        distanceFilter: 10 // Actualizar cada 10 metros de movimiento
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
    await removePersistentNotification();
    return false;
  }
}

/**
 * Detener el tracking en segundo plano
 */
export async function stopBackgroundTracking(): Promise<boolean> {
  try {
    if (watcherId) {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
      watcherId = null;
      console.log('✅ Background tracking detenido');
    }

    // Remover notificación
    await removePersistentNotification();
    
    return true;

  } catch (error) {
    console.error('❌ Error deteniendo tracking:', error);
    return false;
  }
}

/**
 * Verificar si el tracking está activo
 */
export function isTrackingActive(): boolean {
  return watcherId !== null;
}

/**
 * Función para enviar posición al servidor
 * ADAPTA ESTO A TU IMPLEMENTACIÓN ACTUAL
 */
async function sendPositionToServer(position: PositionUpdate) {
  try {
    // TODO: Reemplaza con tu endpoint real y datos
    const response = await fetch('https://TU_DOMINIO/api/positions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Agrega headers de autenticación si los necesitas
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        // Adapta estos campos a tu estructura de BD
        runner_id: 'ID_DEL_CORREDOR', // Obtener del contexto
        race_id: 'ID_DE_LA_CARRERA',   // Obtener del contexto
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        speed: position.speed,
        heading: position.heading,
        altitude: position.altitude,
        timestamp: new Date(position.timestamp).toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Posición enviada al servidor:', data);

  } catch (error) {
    console.error('❌ Error enviando posición:', error);
    
    // TODO: Implementar cola de reintentos si falla
    // Podrías guardar en localStorage y reenviar después
  }
}

// Exportar las funciones principales
export default {
  requestPermissions,
  startBackgroundTracking,
  stopBackgroundTracking,
  isTrackingActive
};