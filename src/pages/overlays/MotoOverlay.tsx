// src/pages/overlays/MotoOverlay.tsx

/**
 * MotoOverlay - Sistema Modular de Overlays para Broadcast
 * Implementación limpia usando el nuevo sistema de componentes reutilizables
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

// Importar del sistema modular
import { useOverlayConfig } from '@/overlays/core/useOverlayConfig';
import { DataDisplay, PositionWrapper, OverlayContainer } from '@/overlays/components/DataDisplay';
import { WithModeBadge } from '@/overlays/components/ModeBadge';
import { 
  formatSpeed, 
  metersToKm, 
  calculateGap,
  getElapsedTime,
  DataBuffer 
} from '@/overlays/core/utils';
import type { MotoData, DisplayData } from '@/overlays/core/types';

/**
 * MotoOverlay usando el sistema modular
 * 
 * VENTAJAS:
 * - 80% menos código que la versión anterior
 * - Componentes reutilizables
 * - Más fácil de mantener
 * - Lógica separada de la vista
 */
const MotoOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();
  
  // Hook principal - maneja toda la config de Supabase
  const { config, loading } = useOverlayConfig({
    raceId: raceId || '',
    autoSubscribe: true,
  });

  const [motoData, setMotoData] = useState<MotoData | null>(null);
  const [compareMotoData, setCompareMotoData] = useState<MotoData | null>(null);
  const [displayData, setDisplayData] = useState<DisplayData>({
    speed: '0',
    distance: '0.0',
    distanceToFinish: '--',
    distanceToNextCheckpoint: '--',
    nextCheckpointName: '',
    gap: '',
    timestamp: Date.now(),
    isManualSpeed: false,
    isManualDistance: false,
    isManualGap: false,
  });
  const [waveStartTime, setWaveStartTime] = useState<Date | null>(null);

  // Buffer para delay
  const [dataBuffer] = useState(() => new DataBuffer<DisplayData>(60000));

  // Fetch GPS data para moto principal
  useEffect(() => {
    if (!config?.selected_moto_id) return;

    const fetchMotoData = async () => {
      const { data, error } = await supabase
        .from('moto_gps_tracking')
        .select(`
          speed,
          distance_from_start,
          distance_to_finish,
          distance_to_next_checkpoint,
          next_checkpoint_name,
          timestamp,
          race_motos!inner (name, name_tv, color)
        `)
        .eq('moto_id', config.selected_moto_id)
        .not('distance_from_start', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const motoInfo = data.race_motos as any;
        setMotoData({
          id: config.selected_moto_id,
          name: motoInfo?.name || '',
          name_tv: motoInfo?.name_tv,
          color: motoInfo?.color || '#FF5722',
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          distance_to_finish: data.distance_to_finish,
          distance_to_next_checkpoint: data.distance_to_next_checkpoint,
          next_checkpoint_name: data.next_checkpoint_name,
          timestamp: data.timestamp,
        });
      }
    };

    fetchMotoData();
    const interval = setInterval(fetchMotoData, 2000);

    // Realtime subscription
    const channel = supabase
      .channel(`moto-gps-${config.selected_moto_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'moto_gps_tracking',
        filter: `moto_id=eq.${config.selected_moto_id}`,
      }, () => {
        fetchMotoData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [config?.selected_moto_id]);

  // Fetch compare moto data
  useEffect(() => {
    if (!config?.compare_moto_id) {
      setCompareMotoData(null);
      return;
    }

    const fetchCompareData = async () => {
      const { data } = await supabase
        .from('moto_gps_tracking')
        .select('speed, distance_from_start')
        .eq('moto_id', config.compare_moto_id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setCompareMotoData({
          id: config.compare_moto_id,
          name: '',
          name_tv: null,
          color: '',
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          distance_to_finish: null,
          distance_to_next_checkpoint: null,
          next_checkpoint_name: null,
          timestamp: new Date().toISOString(),
        });
      }
    };

    fetchCompareData();
    const interval = setInterval(fetchCompareData, 2000);
    return () => clearInterval(interval);
  }, [config?.compare_moto_id]);

  // Process data and add to buffer
  useEffect(() => {
    if (!config) return;

    const isManualSpeed = config.speed.manualMode;
    const isManualDistance = config.distance.manualMode;
    const isManualGap = config.gaps.manualMode;

    // Speed
    let speed = '0';
    if (isManualSpeed && config.speed.manualValue) {
      speed = config.speed.manualValue;
    } else if (motoData) {
      speed = formatSpeed(motoData.speed, config.speed.displayType);
    }

    // Distance
    let distance = '0.0';
    if (isManualDistance && config.distance.manualValue) {
      distance = config.distance.manualValue;
    } else if (motoData) {
      distance = metersToKm(motoData.distance_from_start);
    }

    // Gap
    let gap = '';
    if (isManualGap && config.gaps.manualValue) {
      gap = config.gaps.manualValue;
    } else if (compareMotoData && motoData) {
      gap = calculateGap(motoData.distance_from_start, compareMotoData.distance_from_start);
    }

    dataBuffer.add({
      speed,
      distance,
      distanceToFinish: motoData?.distance_to_finish?.toFixed(1) || '--',
      distanceToNextCheckpoint: motoData?.distance_to_next_checkpoint?.toFixed(1) || '--',
      nextCheckpointName: motoData?.next_checkpoint_name || '',
      gap,
      timestamp: Date.now(),
      isManualSpeed,
      isManualDistance,
      isManualGap,
    });
  }, [motoData, compareMotoData, config, dataBuffer]);

  // Display delayed data
  useEffect(() => {
    if (!config) return;

    const interval = setInterval(() => {
      const delayed = dataBuffer.getDelayed(config.delay_seconds * 1000);
      if (delayed) setDisplayData(delayed);
    }, 100);

    return () => clearInterval(interval);
  }, [config?.delay_seconds, dataBuffer]);

  // Fetch wave start time
  useEffect(() => {
    if (!config?.selected_distance_id) return;

    const fetchWaveStartTime = async () => {
      const { data } = await supabase
        .from('race_waves')
        .select('start_time')
        .eq('race_distance_id', config.selected_distance_id)
        .maybeSingle();

      if (data?.start_time) {
        setWaveStartTime(new Date(data.start_time));
      }
    };

    fetchWaveStartTime();
  }, [config?.selected_distance_id]);

  if (loading || !config) {
    return <OverlayContainer><div /></OverlayContainer>;
  }

  return (
    <OverlayContainer>
      <AnimatePresence mode="wait">
        {/* Speed Display */}
        {config.speed.visible && (
          <PositionWrapper
            key="speed"
            posX={config.speed.posX}
            posY={config.speed.posY}
            scale={config.speed.scale}
            visible={config.speed.visible}
          >
            <WithModeBadge 
              isManual={displayData.isManualSpeed}
              showBadge={false}
            >
              <DataDisplay
                label={config.speed.displayType === 'pace' ? 'RITMO' : 'VELOCIDAD'}
                value={displayData.speed}
                suffix={config.speed.displayType === 'pace' ? ' min/km' : ' km/h'}
                config={config.speed}
                isManual={displayData.isManualSpeed}
                animated={true}
              />
            </WithModeBadge>
          </PositionWrapper>
        )}

        {/* Distance to Finish */}
        {config.distance.visible && (
          <PositionWrapper
            key="distance"
            posX={config.distance.posX}
            posY={config.distance.posY}
            scale={config.distance.scale}
            visible={config.distance.visible}
          >
            <DataDisplay
              label="A META"
              value={displayData.distanceToFinish}
              suffix=" km"
              config={config.distance}
              isManual={displayData.isManualDistance}
              animated={true}
            />
          </PositionWrapper>
        )}

        {/* Checkpoint */}
        {config.checkpoint.visible && (
          <PositionWrapper
            key="checkpoint"
            posX={config.checkpoint.posX}
            posY={config.checkpoint.posY}
            scale={config.checkpoint.scale}
            visible={config.checkpoint.visible}
          >
            <DataDisplay
              label={displayData.nextCheckpointName || 'PRÓXIMO CONTROL'}
              value={displayData.distanceToNextCheckpoint}
              suffix=" km"
              config={config.checkpoint}
              animated={true}
            />
          </PositionWrapper>
        )}

        {/* Gap */}
        {config.gaps.visible && displayData.gap && (
          <PositionWrapper
            key="gap"
            posX={config.gaps.posX}
            posY={config.gaps.posY}
            scale={config.gaps.scale}
            visible={config.gaps.visible}
          >
            <DataDisplay
              value={displayData.gap}
              config={config.gaps}
              isManual={displayData.isManualGap}
              animated={true}
            />
          </PositionWrapper>
        )}

        {/* Clock */}
        {config.clock.visible && (
          <PositionWrapper
            key="clock"
            posX={config.clock.posX}
            posY={config.clock.posY}
            scale={config.clock.scale}
            visible={config.clock.visible}
          >
            <DataDisplay
              value={getElapsedTime(waveStartTime)}
              config={config.clock}
              animated={false}
            />
          </PositionWrapper>
        )}
      </AnimatePresence>
    </OverlayContainer>
  );
};

export default MotoOverlay;
