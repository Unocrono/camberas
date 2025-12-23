import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Clock, Cloud, CloudOff, AlertCircle, Pencil, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PendingStart } from '@/hooks/useStartControlSync';

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface RaceWave {
  id: string;
  race_distance_id: string;
  wave_name: string;
  start_time: string | null;
}

interface EventSelectorProps {
  distances: RaceDistance[];
  waves: RaceWave[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onEditStart: (distanceId: string, waveId: string, currentTime: string) => void;
  getStartStatus: (distanceId: string) => PendingStart | null;
  disabled?: boolean;
}

export function EventSelector({
  distances,
  waves,
  selectedIds,
  onSelectionChange,
  onEditStart,
  getStartStatus,
  disabled = false
}: EventSelectorProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{
    distanceId: string;
    waveId: string;
    currentTime: string;
  } | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');

  const handleToggle = (distanceId: string) => {
    console.log('[EventSelector] handleToggle called:', { distanceId, disabled, selectedIds });
    
    if (disabled) {
      console.log('[EventSelector] disabled, returning');
      return;
    }
    
    // Permitir seleccionar cualquier evento (incluso los que ya tienen salida para poder re-darla)
    const newSelection = selectedIds.includes(distanceId)
      ? selectedIds.filter(id => id !== distanceId)
      : [...selectedIds, distanceId];
    
    console.log('[EventSelector] calling onSelectionChange with:', newSelection);
    onSelectionChange(newSelection);
  };

  const handleEditClick = (distanceId: string, wave: RaceWave) => {
    if (!wave.start_time) return;
    setEditingEvent({
      distanceId,
      waveId: wave.id,
      currentTime: wave.start_time
    });
    // Formatear tiempo para el input
    const date = new Date(wave.start_time);
    const formatted = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
    setEditTimeValue(formatted);
    setEditDialogOpen(true);
  };

  const handleConfirmEdit = () => {
    if (!editingEvent) return;
    
    // Parsear el tiempo editado
    const [time, ms] = editTimeValue.split('.');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    
    // Crear timestamp basado en la fecha de la salida original
    const originalDate = new Date(editingEvent.currentTime);
    originalDate.setHours(hours, minutes, seconds, parseInt(ms) || 0);
    
    onEditStart(editingEvent.distanceId, editingEvent.waveId, originalDate.toISOString());
    setEditDialogOpen(false);
    setEditingEvent(null);
  };

  const getEventStatus = (distanceId: string) => {
    const pendingStatus = getStartStatus(distanceId);
    const wave = waves.find(w => w.race_distance_id === distanceId);
    
    if (pendingStatus) {
      return {
        type: pendingStatus.status,
        time: new Date(pendingStatus.startTimestamp).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        wave: null
      };
    }
    
    if (wave?.start_time) {
      return {
        type: 'synced' as const,
        time: new Date(wave.start_time).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        wave
      };
    }
    
    return { type: 'none' as const, time: null, wave: null };
  };

  const SyncIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'pending':
        return <CloudOff className="h-4 w-4 text-yellow-500" />;
      case 'syncing':
        return <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
          <Cloud className="h-4 w-4 text-blue-500" />
        </motion.div>;
      case 'synced':
        return <Cloud className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {distances.map((distance, index) => {
            const status = getEventStatus(distance.id);
            const hasStarted = status.type !== 'none';
            const isSelected = selectedIds.includes(distance.id);
            
            return (
              <motion.div
                key={distance.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "relative flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                  "bg-card hover:bg-muted/50",
                  isSelected && !hasStarted && "ring-2 ring-primary border-primary",
                  hasStarted && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                  disabled && "opacity-50 cursor-not-allowed",
                  hasStarted && "cursor-default"
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggle(distance.id);
                }}
              >
                {/* Checkbox */}
                <div 
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggle(distance.id);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled || hasStarted}
                    onCheckedChange={() => handleToggle(distance.id)}
                    className={cn(
                      "h-5 w-5",
                      hasStarted && "opacity-50"
                    )}
                  />
                </div>

                {/* Info del evento */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate">
                      {distance.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {distance.distance_km} km
                    </Badge>
                  </div>
                  
                  {/* Estado de salida */}
                  {hasStarted && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center gap-2 mt-1"
                    >
                      <Clock className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-mono text-green-700 dark:text-green-300">
                        Salida: {status.time}
                      </span>
                      <SyncIcon status={status.type} />
                    </motion.div>
                  )}
                </div>

                {/* Botón de edición */}
                {hasStarted && status.wave && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(distance.id, status.wave!);
                    }}
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}

                {/* Indicador de selección */}
                {isSelected && !hasStarted && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center"
                  >
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {distances.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay eventos configurados para esta carrera
          </div>
        )}
      </div>

      {/* Modal de edición */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corregir tiempo de salida</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-time">Hora de salida (HH:mm:ss.ms)</Label>
              <Input
                id="edit-time"
                value={editTimeValue}
                onChange={(e) => setEditTimeValue(e.target.value)}
                placeholder="09:00:00.000"
                className="font-mono text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Formato: Hora:Minutos:Segundos.Milisegundos
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmEdit}>
              Guardar corrección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
