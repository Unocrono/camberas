import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
  requestBackgroundPermissions
} from '@/services/backgroundTracking';

export function TrackingControl() {
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);

  // Verificar estado al montar
  useEffect(() => {
    setIsTracking(isBackgroundTrackingActive());
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    // Aquí podrías verificar si ya tiene permisos
    // Por ahora asumimos que no
    setHasPermissions(false);
  };

  const handleRequestPermissions = async () => {
    const granted = await requestBackgroundPermissions();
    setHasPermissions(granted);
    
    if (!granted) {
      alert('Necesitas otorgar permisos de ubicación en Ajustes');
    }
  };

  const handleStartTracking = async () => {
    // Configuración de ejemplo - adaptar según el contexto real
    const started = await startBackgroundTracking({
      mode: 'runner',
      race_id: 'demo-race-id',
      registration_id: 'demo-registration-id',
      runner_name: 'Corredor Demo',
    });
    
    if (started) {
      setIsTracking(true);
      setHasPermissions(true);
    } else {
      alert('No se pudo iniciar el tracking. Verifica los permisos.');
    }
  };

  const handleStopTracking = async () => {
    const stopped = await stopBackgroundTracking();
    
    if (stopped) {
      setIsTracking(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      {/* Estado actual */}
      <div className="text-center space-y-2">
        <div className="text-4xl">
          {isTracking ? '🟢' : '⚪'}
        </div>
        <h2 className={`text-2xl font-bold ${
          isTracking ? 'text-green-600' : 'text-gray-500'
        }`}>
          {isTracking ? 'Tracking Activo' : 'Tracking Inactivo'}
        </h2>
        <p className="text-sm text-gray-600">
          {isTracking 
            ? 'Tu posición se está enviando continuamente, incluso con la pantalla apagada'
            : 'Presiona el botón para comenzar a enviar tu posición'
          }
        </p>
      </div>

      {/* Advertencias */}
      {isTracking && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Importante:</strong> No cierres la notificación de "Tracking activo" 
            o el envío de posiciones se detendrá.
          </p>
        </div>
      )}

      {/* Botones de control */}
      <div className="space-y-3">
        {!hasPermissions && !isTracking && (
          <Button 
            onClick={handleRequestPermissions}
            className="w-full"
            variant="outline"
            size="lg"
          >
            🔓 Solicitar Permisos
          </Button>
        )}

        {!isTracking ? (
          <Button 
            onClick={handleStartTracking}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            ▶️ Iniciar Tracking
          </Button>
        ) : (
          <Button 
            onClick={handleStopTracking}
            className="w-full"
            variant="destructive"
            size="lg"
          >
            ⏹️ Detener Tracking
          </Button>
        )}
      </div>

      {/* Información adicional */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">
          💡 Consejos para mejor tracking:
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Mantén el GPS activado en tu dispositivo</li>
          <li>Desactiva el ahorro de batería para esta app</li>
          <li>No cierres la notificación de tracking</li>
          <li>Funciona incluso con la pantalla apagada</li>
        </ul>
      </div>
    </Card>
  );
}