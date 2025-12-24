import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PendingStart {
  id: string; // UUID local
  raceId: string;
  distanceIds: string[]; // Múltiples eventos pueden compartir salida
  startTimestamp: number; // Timestamp corregido por NTP
  startTimeISO: string; // ISO string para la DB
  createdAt: number;
  status: 'pending' | 'syncing' | 'synced' | 'error';
  retryCount: number;
  lastError?: string;
  isEdit?: boolean; // True si es una edición de una salida existente
  waveIds?: string[]; // IDs de las waves si es edición
}

interface SyncState {
  pendingStarts: PendingStart[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAttempt: Date | null;
}

const STORAGE_KEY = 'start_control_pending_queue';
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 segundo

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function useStartControlSync() {
  const { toast } = useToast();
  const [state, setState] = useState<SyncState>({
    pendingStarts: [],
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncAttempt: null
  });
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar cola desde localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setState(prev => ({ ...prev, pendingStarts: data }));
      } catch (e) {
        console.warn('[Sync] Error loading pending queue:', e);
      }
    }
  }, []);

  // Guardar cola en localStorage cuando cambie
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pendingStarts));
  }, [state.pendingStarts]);

  // Monitorear estado de conexión
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      console.log('[Sync] Conexión restaurada');
      // Intentar sincronizar pendientes
      syncPendingStarts();
    };
    
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      console.log('[Sync] Conexión perdida');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Registrar una nueva salida (o edición)
  const registerStart = useCallback((
    raceId: string,
    distanceIds: string[],
    correctedTimestamp: number,
    isEdit = false,
    waveIds?: string[]
  ): PendingStart => {
    const startTimeISO = new Date(correctedTimestamp).toISOString();
    
    // Verificar si ya existe un registro pendiente para estos eventos
    const existingIndex = state.pendingStarts.findIndex(
      p => p.raceId === raceId && 
           p.distanceIds.length === distanceIds.length &&
           p.distanceIds.every(id => distanceIds.includes(id)) &&
           p.status === 'pending'
    );
    
    const newStart: PendingStart = {
      id: generateUUID(),
      raceId,
      distanceIds,
      startTimestamp: correctedTimestamp,
      startTimeISO,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      isEdit,
      waveIds
    };
    
    setState(prev => {
      let newPendingStarts: PendingStart[];
      
      if (existingIndex >= 0) {
        // Actualizar registro existente en vez de duplicar
        newPendingStarts = [...prev.pendingStarts];
        newPendingStarts[existingIndex] = {
          ...newStart,
          id: prev.pendingStarts[existingIndex].id // Mantener el ID original
        };
        console.log('[Sync] Actualizando registro existente:', newPendingStarts[existingIndex].id);
      } else {
        newPendingStarts = [...prev.pendingStarts, newStart];
        console.log('[Sync] Nuevo registro añadido:', newStart.id);
      }
      
      return { ...prev, pendingStarts: newPendingStarts };
    });
    
    return newStart;
  }, [state.pendingStarts]);

  // Sincronizar inmediatamente (para nuevas salidas)
  const syncImmediately = useCallback(async (start: PendingStart): Promise<boolean> => {
    if (!navigator.onLine) {
      toast({
        title: "Sin conexión",
        description: "La salida se sincronizará cuando haya conexión",
        variant: "destructive"
      });
      return false;
    }
    
    setState(prev => ({ ...prev, isSyncing: true }));
    const success = await syncSingleStart(start);
    setState(prev => ({ ...prev, isSyncing: false }));
    
    if (success) {
      // Limpiar de la cola después de sincronizar
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          pendingStarts: prev.pendingStarts.filter(p => p.id !== start.id)
        }));
      }, 2000);
    }
    
    return success;
  }, [toast]);

  // Sincronizar un registro individual
  const syncSingleStart = async (start: PendingStart): Promise<boolean> => {
    try {
      // Actualizar estado a "syncing"
      setState(prev => ({
        ...prev,
        pendingStarts: prev.pendingStarts.map(p =>
          p.id === start.id ? { ...p, status: 'syncing' as const } : p
        )
      }));

      // Para cada distanceId, actualizar o crear wave
      for (let i = 0; i < start.distanceIds.length; i++) {
        const distanceId = start.distanceIds[i];
        
        if (start.isEdit && start.waveIds && start.waveIds[i]) {
          // Es una edición: actualizar wave existente usando el índice correspondiente
          const waveId = start.waveIds[i];
          console.log('[Sync] Actualizando wave:', waveId, 'con tiempo:', start.startTimeISO);
          
          const { error } = await supabase
            .from('race_waves')
            .update({ 
              start_time: start.startTimeISO,
              updated_at: new Date().toISOString()
            })
            .eq('id', waveId);
          
          if (error) {
            console.error('[Sync] Error actualizando wave:', error);
            throw error;
          }
          console.log('[Sync] Wave actualizada correctamente');
        } else {
          // Es nueva salida: verificar si existe wave para esta distance
          const { data: existingWave } = await supabase
            .from('race_waves')
            .select('id')
            .eq('race_distance_id', distanceId)
            .maybeSingle();
          
          if (existingWave) {
            // Actualizar wave existente
            const { error } = await supabase
              .from('race_waves')
              .update({ 
                start_time: start.startTimeISO,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingWave.id);
            
            if (error) throw error;
          } else {
            // Crear nueva wave
            const { data: distance } = await supabase
              .from('race_distances')
              .select('name')
              .eq('id', distanceId)
              .single();
            
            const { error } = await supabase
              .from('race_waves')
              .insert({
                race_id: start.raceId,
                race_distance_id: distanceId,
                wave_name: distance?.name || 'Salida principal',
                start_time: start.startTimeISO
              });
            
            if (error) throw error;
          }
        }
      }

      // Marcar como sincronizado
      setState(prev => ({
        ...prev,
        pendingStarts: prev.pendingStarts.map(p =>
          p.id === start.id ? { ...p, status: 'synced' as const } : p
        )
      }));

      console.log('[Sync] Sincronizado correctamente:', start.id);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[Sync] Error sincronizando:', start.id, error);
      
      setState(prev => ({
        ...prev,
        pendingStarts: prev.pendingStarts.map(p =>
          p.id === start.id 
            ? { ...p, status: 'error' as const, lastError: errorMessage, retryCount: p.retryCount + 1 } 
            : p
        )
      }));
      
      return false;
    }
  };

  // Sincronizar todos los pendientes
  const syncPendingStarts = useCallback(async () => {
    if (state.isSyncing || !navigator.onLine) return;
    
    const pendingToSync = state.pendingStarts.filter(
      p => p.status === 'pending' || (p.status === 'error' && p.retryCount < MAX_RETRIES)
    );
    
    if (pendingToSync.length === 0) return;
    
    setState(prev => ({ ...prev, isSyncing: true, lastSyncAttempt: new Date() }));
    console.log(`[Sync] Sincronizando ${pendingToSync.length} registros...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const start of pendingToSync) {
      // Calcular delay con backoff exponencial para reintentos
      if (start.retryCount > 0) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, start.retryCount - 1);
        await new Promise(r => setTimeout(r, delay));
      }
      
      const success = await syncSingleStart(start);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    setState(prev => ({ ...prev, isSyncing: false }));
    
    // Limpiar sincronizados después de un tiempo
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        pendingStarts: prev.pendingStarts.filter(p => p.status !== 'synced')
      }));
    }, 5000);
    
    if (successCount > 0) {
      toast({
        title: "Sincronización completada",
        description: `${successCount} salida(s) sincronizada(s) correctamente`
      });
    }
    
    if (failCount > 0) {
      toast({
        title: "Error de sincronización",
        description: `${failCount} salida(s) pendiente(s) de reintento`,
        variant: "destructive"
      });
      
      // Programar reintento
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(syncPendingStarts, 10000);
    }
  }, [state.isSyncing, state.pendingStarts, toast]);

  // Forzar sincronización manual
  const forcSync = useCallback(() => {
    if (!navigator.onLine) {
      toast({
        title: "Sin conexión",
        description: "Esperando conexión para sincronizar",
        variant: "destructive"
      });
      return;
    }
    syncPendingStarts();
  }, [syncPendingStarts, toast]);

  // Obtener estado de sincronización para un evento
  const getStartStatus = useCallback((distanceId: string): PendingStart | null => {
    return state.pendingStarts.find(
      p => p.distanceIds.includes(distanceId) && p.status !== 'synced'
    ) || null;
  }, [state.pendingStarts]);

  // Contar pendientes
  const pendingCount = state.pendingStarts.filter(
    p => p.status === 'pending' || p.status === 'error'
  ).length;

  return {
    pendingStarts: state.pendingStarts,
    pendingCount,
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    lastSyncAttempt: state.lastSyncAttempt,
    registerStart,
    syncImmediately,
    syncPendingStarts,
    forcSync,
    getStartStatus
  };
}
