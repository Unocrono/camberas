// src/overlays/core/useOverlayConfig.ts

/**
 * CAMBERAS OVERLAY SYSTEM - CONFIGURATION HOOK
 * Hook principal para gestionar configuración de overlays con Supabase
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { OverlayConfig, OverlayConfigDB, OverlayElementConfig } from './types';
import { dbToOverlayConfig, overlayConfigToDb, validateConfig, isUUID } from './utils';

interface UseOverlayConfigOptions {
  raceId: string;
  autoSubscribe?: boolean;
  onError?: (error: Error) => void;
  onUpdate?: (config: OverlayConfig) => void;
}

interface UseOverlayConfigReturn {
  config: OverlayConfig | null;
  loading: boolean;
  saving: boolean;
  error: Error | null;
  updateConfig: (updates: Partial<OverlayConfig>) => void;
  updateElement: (
    elementType: keyof Pick<OverlayConfig, 'speed' | 'distance' | 'gaps' | 'clock' | 'checkpoint'>,
    updates: Partial<OverlayElementConfig>
  ) => void;
  saveConfig: () => Promise<void>;
  resetConfig: () => void;
  refreshConfig: () => Promise<void>;
}

/**
 * Hook para gestionar configuración de overlays
 * 
 * @example
 * ```tsx
 * const { config, updateElement, saveConfig } = useOverlayConfig({
 *   raceId: 'abc-123',
 *   autoSubscribe: true
 * });
 * 
 * // Actualizar elemento
 * updateElement('speed', { visible: true, size: 72 });
 * 
 * // Guardar cambios
 * await saveConfig();
 * ```
 */
export function useOverlayConfig(options: UseOverlayConfigOptions): UseOverlayConfigReturn {
  const { raceId, autoSubscribe = true, onError, onUpdate } = options;
  
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [resolvedRaceId, setResolvedRaceId] = useState<string | null>(null);

  // Resolver raceId (puede ser slug o UUID)
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!raceId) return;
      
      if (isUUID(raceId)) {
        setResolvedRaceId(raceId);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('races')
          .select('id')
          .eq('slug', raceId)
          .maybeSingle();
        
        if (error) throw error;
        if (data) setResolvedRaceId(data.id);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Error resolving race ID');
        setError(error);
        onError?.(error);
      }
    };
    
    resolveRaceId();
  }, [raceId, onError]);

  // Cargar configuración inicial
  const loadConfig = useCallback(async () => {
    if (!resolvedRaceId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('overlay_config')
        .select('*')
        .eq('race_id', resolvedRaceId)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (data) {
        const parsedConfig = dbToOverlayConfig(data as unknown as OverlayConfigDB);
        setConfig(parsedConfig);
        onUpdate?.(parsedConfig);
      } else {
        // No existe config, usar defaults
        setConfig(getDefaultConfig(resolvedRaceId));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error loading config');
      setError(error);
      onError?.(error);
      // Set default config on error
      setConfig(getDefaultConfig(resolvedRaceId));
    } finally {
      setLoading(false);
    }
  }, [resolvedRaceId, onError, onUpdate]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Suscribir a cambios en tiempo real
  useEffect(() => {
    if (!autoSubscribe || !resolvedRaceId) return;
    
    const channel = supabase
      .channel(`overlay-config-${resolvedRaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overlay_config',
          filter: `race_id=eq.${resolvedRaceId}`
        },
        (payload) => {
          if (payload.new) {
            const newConfig = dbToOverlayConfig(payload.new as unknown as OverlayConfigDB);
            setConfig(newConfig);
            onUpdate?.(newConfig);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoSubscribe, resolvedRaceId, onUpdate]);

  // Actualizar configuración local
  const updateConfig = useCallback((updates: Partial<OverlayConfig>) => {
    setConfig(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Actualizar elemento específico
  const updateElement = useCallback((
    elementType: keyof Pick<OverlayConfig, 'speed' | 'distance' | 'gaps' | 'clock' | 'checkpoint'>,
    updates: Partial<OverlayElementConfig>
  ) => {
    setConfig(prev => {
      if (!prev) return null;
      return {
        ...prev,
        [elementType]: {
          ...prev[elementType],
          ...updates
        }
      };
    });
  }, []);

  // Guardar configuración en base de datos
  const saveConfig = useCallback(async () => {
    if (!config || !resolvedRaceId) {
      throw new Error('No config or race ID available');
    }
    
    // Validar configuración
    const errors = validateConfig(config);
    if (errors.length > 0) {
      const error = new Error(`Validation errors: ${errors.join(', ')}`);
      setError(error);
      onError?.(error);
      throw error;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const dbConfig = overlayConfigToDb(config);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: saveError } = await supabase
        .from('overlay_config')
        .upsert(dbConfig as any, { onConflict: 'race_id' });
      
      if (saveError) throw saveError;
      
      // Refresh to get server-side updates
      await loadConfig();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error saving config');
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [config, resolvedRaceId, loadConfig, onError]);

  // Resetear a configuración por defecto
  const resetConfig = useCallback(() => {
    if (!resolvedRaceId) return;
    setConfig(getDefaultConfig(resolvedRaceId));
  }, [resolvedRaceId]);

  // Refrescar configuración desde BD
  const refreshConfig = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    saving,
    error,
    updateConfig,
    updateElement,
    saveConfig,
    resetConfig,
    refreshConfig,
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

function getDefaultConfig(raceId: string): OverlayConfig {
  return {
    race_id: raceId,
    delay_seconds: 0,
    layout: 'horizontal',
    
    speed: {
      type: 'speed',
      visible: true,
      font: 'Bebas Neue',
      size: 72,
      color: '#FFFFFF',
      bgColor: '#000000',
      bgOpacity: 0.7,
      posX: 50,
      posY: 85,
      scale: 1.0,
      manualMode: false,
      manualValue: null,
      displayType: 'speed',
    },
    
    distance: {
      type: 'distance',
      visible: true,
      font: 'Roboto Condensed',
      size: 48,
      color: '#FFFFFF',
      bgColor: '#1a1a1a',
      bgOpacity: 0.7,
      posX: 25,
      posY: 85,
      scale: 1.0,
      manualMode: false,
      manualValue: null,
    },
    
    gaps: {
      type: 'gaps',
      visible: true,
      font: 'Barlow Semi Condensed',
      size: 36,
      color: '#00FF00',
      bgColor: '#000000',
      bgOpacity: 0.7,
      posX: 75,
      posY: 85,
      scale: 1.0,
      manualMode: false,
      manualValue: null,
    },
    
    clock: {
      type: 'clock',
      visible: false,
      font: 'Bebas Neue',
      size: 48,
      color: '#FFFFFF',
      bgColor: '#000000',
      bgOpacity: 0.7,
      posX: 50,
      posY: 10,
      scale: 1.0,
      manualMode: false,
      manualValue: null,
    },
    
    checkpoint: {
      type: 'checkpoint',
      visible: true,
      font: 'Roboto Condensed',
      size: 36,
      color: '#FFFFFF',
      bgColor: '#1a1a1a',
      bgOpacity: 0.7,
      posX: 90,
      posY: 85,
      scale: 1.0,
      manualMode: false,
      manualValue: null,
    },
    
    selected_moto_id: null,
    compare_moto_id: null,
    selected_distance_id: null,
    
    route_map: {
      visible: true,
      lineColor: '#FF0000',
      lineWidth: 4,
      motoLabelSize: 16,
      motoLabelColor: '#FFFFFF',
      motoLabelBgColor: '#000000',
    },
    
    elevation: {
      visible: true,
      lineColor: '#00FF00',
      fillOpacity: 0.3,
      motoMarkerSize: 10,
    },
    
    map_overlay_moto_ids: [],
  };
}
