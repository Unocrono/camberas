// src/overlays/templates/SimplifiedMotoOverlay.tsx

/**
 * CAMBERAS OVERLAY SYSTEM - SIMPLIFIED MOTO OVERLAY
 * Ejemplo de overlay usando el sistema modular
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useOverlayConfig } from '../core/useOverlayConfig';
import { formatSpeed, metersToKm, calculateGap } from '../core/utils';
import { DataDisplay, PositionWrapper, OverlayContainer } from '../components/DataDisplay';
import { WithModeBadge } from '../components/ModeBadge';
import type { MotoData, DisplayData } from '../core/types';

/**
 * Overlay simplificado para motos
 * Muestra: velocidad, distancia, gaps, checkpoint, reloj
 */
const SimplifiedMotoOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();
  
  // Hook para configuración
  const { config, loading, error } = useOverlayConfig({
    raceId: raceId || '',
    autoSubscribe: true,
  });
  
  // Estado de datos GPS
  const [motoData, setMotoData] = useState<MotoData | null>(null);
  const [compareMotoData, setCompareMotoData] = useState<MotoData | null>(null);
  const [displayData, setDisplayData] = useState<DisplayData>({
    speed: '0',
    distance: '0.0',
    distanceToFinish: '--',
    distanceToNextCheckpoint: '--',
    nextCheckpointName: '--',
    gap: '--',
    timestamp: Date.now(),
    isManualSpeed: false,
    isManualDistance: false,
    isManualGap: false,
  });
  
  // Suscribirse a datos GPS en tiempo real
  useEffect(() => {
    if (!config?.selected_moto_id) return;
    
    const channel = supabase
      .channel(`moto-gps-${config.selected_moto_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moto_gps_tracking',
          filter: `moto_id=eq.${config.selected_moto_id}`
        },
        (payload) => {
          if (payload.new) {
            const data = payload.new as MotoData;
            setMotoData(data);
          }
        }
      )
      .subscribe();
    
    // Cargar último dato conocido
    const loadLatestData = async () => {
      const { data } = await supabase
        .from('moto_gps_tracking')
        .select('*')
        .eq('moto_id', config.selected_moto_id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if (data) setMotoData(data as unknown as MotoData);
    };
    
    loadLatestData();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [config?.selected_moto_id]);
  
  // Suscribirse a moto de comparación
  useEffect(() => {
    if (!config?.compare_moto_id) return;
    
    const channel = supabase
      .channel(`moto-compare-${config.compare_moto_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moto_gps_tracking',
          filter: `moto_id=eq.${config.compare_moto_id}`
        },
        (payload) => {
          if (payload.new) {
            setCompareMotoData(payload.new as MotoData);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [config?.compare_moto_id]);
  
  // Actualizar display data cuando cambian los datos
  useEffect(() => {
    if (!config) return;
    
    const isManualSpeed = config.speed.manualMode;
    const isManualDistance = config.distance.manualMode;
    const isManualGap = config.gaps.manualMode;
    
    let speed = '0';
    let distance = '0.0';
    let distanceToFinish = '--';
    let distanceToNextCheckpoint = '--';
    let nextCheckpointName = '--';
    let gap = '--';
    
    // Velocidad
    if (isManualSpeed && config.speed.manualValue) {
      speed = config.speed.manualValue;
    } else if (motoData) {
      speed = formatSpeed(motoData.speed, config.speed.displayType);
    }
    
    // Distancia
    if (isManualDistance && config.distance.manualValue) {
      distance = config.distance.manualValue;
    } else if (motoData) {
      distance = metersToKm(motoData.distance_from_start);
      if (motoData.distance_to_finish !== null) {
        distanceToFinish = `${motoData.distance_to_finish.toFixed(1)} km`;
      }
    }
    
    // Checkpoint
    if (config.checkpoint.manualMode && config.checkpoint.manualValue) {
      nextCheckpointName = config.checkpoint.manualValue;
    } else if (motoData) {
      nextCheckpointName = motoData.next_checkpoint_name || '--';
      if (motoData.distance_to_next_checkpoint !== null) {
        distanceToNextCheckpoint = `${motoData.distance_to_next_checkpoint.toFixed(1)} km`;
      }
    }
    
    // Gap
    if (isManualGap && config.gaps.manualValue) {
      gap = config.gaps.manualValue;
    } else if (motoData && compareMotoData) {
      gap = calculateGap(motoData.distance_from_start, compareMotoData.distance_from_start);
    }
    
    setDisplayData({
      speed,
      distance,
      distanceToFinish,
      distanceToNextCheckpoint,
      nextCheckpointName,
      gap,
      timestamp: Date.now(),
      isManualSpeed,
      isManualDistance,
      isManualGap,
    });
  }, [config, motoData, compareMotoData]);
  
  // Estados de carga y error
  if (loading) {
    return <div style={{ display: 'none' }} />;
  }
  
  if (error || !config) {
    return <div style={{ display: 'none' }} />;
  }
  
  return (
    <OverlayContainer>
      {/* Velocidad */}
      <PositionWrapper
        posX={config.speed.posX}
        posY={config.speed.posY}
        scale={config.speed.scale}
        visible={config.speed.visible}
      >
        <WithModeBadge isManual={displayData.isManualSpeed}>
          <DataDisplay
            value={displayData.speed}
            suffix={config.speed.displayType === 'pace' ? '' : ' km/h'}
            config={config.speed}
            isManual={displayData.isManualSpeed}
          />
        </WithModeBadge>
      </PositionWrapper>
      
      {/* Distancia */}
      <PositionWrapper
        posX={config.distance.posX}
        posY={config.distance.posY}
        scale={config.distance.scale}
        visible={config.distance.visible}
      >
        <WithModeBadge isManual={displayData.isManualDistance}>
          <DataDisplay
            label="DISTANCIA"
            value={displayData.distance}
            suffix=" km"
            config={config.distance}
            isManual={displayData.isManualDistance}
          />
        </WithModeBadge>
      </PositionWrapper>
      
      {/* Gap */}
      <PositionWrapper
        posX={config.gaps.posX}
        posY={config.gaps.posY}
        scale={config.gaps.scale}
        visible={config.gaps.visible}
      >
        <WithModeBadge isManual={displayData.isManualGap}>
          <DataDisplay
            label="GAP"
            value={displayData.gap}
            config={config.gaps}
            isManual={displayData.isManualGap}
          />
        </WithModeBadge>
      </PositionWrapper>
      
      {/* Checkpoint */}
      <PositionWrapper
        posX={config.checkpoint.posX}
        posY={config.checkpoint.posY}
        scale={config.checkpoint.scale}
        visible={config.checkpoint.visible}
      >
        <DataDisplay
          label="PRÓXIMO"
          value={displayData.nextCheckpointName}
          suffix={displayData.distanceToNextCheckpoint !== '--' ? ` (${displayData.distanceToNextCheckpoint})` : ''}
          config={config.checkpoint}
        />
      </PositionWrapper>
      
      {/* Reloj (opcional) */}
      <PositionWrapper
        posX={config.clock.posX}
        posY={config.clock.posY}
        scale={config.clock.scale}
        visible={config.clock.visible}
      >
        <DataDisplay
          value={new Date().toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          })}
          config={config.clock}
        />
      </PositionWrapper>
    </OverlayContainer>
  );
};

export default SimplifiedMotoOverlay;
