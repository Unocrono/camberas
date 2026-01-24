import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
} from '@/services/backgroundTracking';

interface BackgroundTrackingToggleProps {
  isTracking: boolean;
  appMode: 'runner' | 'moto';
  config: {
    race_id: string;
    registration_id?: string;
    moto_id?: string;
    runner_name?: string;
    moto_name?: string;
    bib_number?: number | null;
    update_frequency?: number;
  };
  onStatusChange?: (isActive: boolean) => void;
}

/**
 * Toggle para activar/desactivar Background Tracking
 * 
 * Este componente debe mostrarse cuando isTracking = true
 * Permite al usuario activar el modo de segundo plano
 */
export function BackgroundTrackingToggle({
  isTracking,
  appMode,
  config,
  onStatusChange,
}: BackgroundTrackingToggleProps) {
  const [isBackgroundActive, setIsBackgroundActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Verificar estado al montar
  useEffect(() => {
    setIsBackgroundActive(isBackgroundTrackingActive());
  }, []);

  // Si el tracking normal se detiene, también detener background
  useEffect(() => {
    if (!isTracking && isBackgroundActive) {
      handleToggle(false);
    }
  }, [isTracking]);

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(true);

    try {
      if (enabled) {
        // Activar background tracking
        const success = await startBackgroundTracking({
          mode: appMode,
          race_id: config.race_id,
          registration_id: config.registration_id,
          moto_id: config.moto_id,
          runner_name: config.runner_name,
          moto_name: config.moto_name,
          bib_number: config.bib_number,
          update_frequency: config.update_frequency,
        });

        if (success) {
          setIsBackgroundActive(true);
          onStatusChange?.(true);
        } else {
          alert('No se pudo activar el tracking en segundo plano. Verifica los permisos.');
        }
      } else {
        // Desactivar background tracking
        const success = await stopBackgroundTracking();
        
        if (success) {
          setIsBackgroundActive(false);
          onStatusChange?.(false);
        }
      }
    } catch (error) {
      console.error('Error al cambiar estado de background tracking:', error);
      alert('Error al cambiar el modo de segundo plano');
    } finally {
      setIsLoading(false);
    }
  };

  // No mostrar si no está tracking
  if (!isTracking) return null;

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          <Smartphone className={`h-5 w-5 ${isBackgroundActive ? 'text-green-500' : 'text-muted-foreground'}`} />
          <div>
            <Label htmlFor="background-mode" className="text-sm font-medium cursor-pointer">
              Tracking en segundo plano
            </Label>
            <p className="text-xs text-muted-foreground">
              Envía posición incluso con pantalla apagada
            </p>
          </div>
        </div>
        <Switch
          id="background-mode"
          checked={isBackgroundActive}
          onCheckedChange={handleToggle}
          disabled={isLoading || !isTracking}
        />
      </div>

      {/* Estado actual */}
      {isBackgroundActive && (
        <Alert className="border-green-500/50 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-sm text-green-800">
            <strong>Modo segundo plano activo</strong>
            <br />
            La app seguirá enviando tu posición aunque cierres la pantalla o cambies de app.
            No cierres la notificación de "Tracking activo".
          </AlertDescription>
        </Alert>
      )}

      {/* Advertencias cuando NO está activo */}
      {!isBackgroundActive && isTracking && (
        <Alert className="border-orange-500/50 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm text-orange-800">
            <strong>Modo normal activo</strong>
            <br />
            El tracking se detendrá si apagas la pantalla o cierras la app.
            Activa el modo segundo plano para tracking continuo.
          </AlertDescription>
        </Alert>
      )}

      {/* Información adicional */}
      <div className="text-xs text-muted-foreground px-4 space-y-1">
        <p>💡 <strong>Consejos:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Desactiva el ahorro de batería para esta app</li>
          <li>Mantén el GPS activado</li>
          <li>No cierres la notificación de tracking</li>
        </ul>
      </div>
    </div>
  );
}