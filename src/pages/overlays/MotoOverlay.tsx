// src/pages/overlays/MotoOverlay.tsx
// VERSIÓN OPTIMIZADA PARA VMIX - Combina sistema modular con rendering directo

import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

// Importar del sistema modular
import { useOverlayConfig } from "@/overlays/core/useOverlayConfig";
import {
  formatSpeed,
  metersToKm,
  calculateGap,
  getElapsedTime,
  DataBuffer,
  getFontFamily,
  hexToRgba,
} from "@/overlays/core/utils";
import type { MotoData, DisplayData } from "@/overlays/core/types";

const MotoOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();

  // Hook modular para config
  const { config, loading } = useOverlayConfig({
    raceId: raceId || "",
    autoSubscribe: true,
  });

  const [motoData, setMotoData] = useState<MotoData | null>(null);
  const [compareMotoData, setCompareMotoData] = useState<MotoData | null>(null);
  const [displayData, setDisplayData] = useState<DisplayData>({
    speed: "0",
    distance: "0.0",
    distanceToFinish: "--",
    distanceToNextCheckpoint: "--",
    nextCheckpointName: "",
    gap: "",
    timestamp: Date.now(),
    isManualSpeed: false,
    isManualDistance: false,
    isManualGap: false,
  });
  const [waveStartTime, setWaveStartTime] = useState<Date | null>(null);
  const [dataBuffer] = useState(() => new DataBuffer<DisplayData>(60000));

  // Fetch GPS data
  useEffect(() => {
    if (!config?.selected_moto_id) return;

    const fetchMotoData = async () => {
      const { data, error } = await supabase
        .from("moto_gps_tracking")
        .select(
          `
          speed,
          distance_from_start,
          distance_to_finish,
          distance_to_next_checkpoint,
          next_checkpoint_name,
          timestamp,
          race_motos!inner (name, name_tv, color)
        `,
        )
        .eq("moto_id", config.selected_moto_id)
        .not("distance_from_start", "is", null)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const motoInfo = data.race_motos as any;
        setMotoData({
          id: config.selected_moto_id,
          name: motoInfo?.name || "",
          name_tv: motoInfo?.name_tv,
          color: motoInfo?.color || "#FF5722",
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

    const channel = supabase
      .channel(`moto-gps-${config.selected_moto_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moto_gps_tracking",
          filter: `moto_id=eq.${config.selected_moto_id}`,
        },
        () => fetchMotoData(),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [config?.selected_moto_id]);

  // Fetch compare moto
  useEffect(() => {
    if (!config?.compare_moto_id) {
      setCompareMotoData(null);
      return;
    }

    const fetchCompareData = async () => {
      const { data } = await supabase
        .from("moto_gps_tracking")
        .select("speed, distance_from_start, timestamp")
        .eq("moto_id", config.compare_moto_id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setCompareMotoData({
          id: config.compare_moto_id,
          name: "",
          name_tv: null,
          color: "",
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          distance_to_finish: null,
          distance_to_next_checkpoint: null,
          next_checkpoint_name: null,
          timestamp: data.timestamp,
        });
      }
    };

    fetchCompareData();
    const interval = setInterval(fetchCompareData, 2000);
    return () => clearInterval(interval);
  }, [config?.compare_moto_id]);

  // Process data
  useEffect(() => {
    if (!config) return;

    const speed =
      config.speed.manualMode && config.speed.manualValue
        ? config.speed.manualValue
        : motoData
          ? formatSpeed(motoData.speed, config.speed.displayType)
          : "0";

    const distance =
      config.distance.manualMode && config.distance.manualValue
        ? config.distance.manualValue
        : motoData
          ? metersToKm(motoData.distance_from_start)
          : "0.0";

    const gap =
      config.gaps.manualMode && config.gaps.manualValue
        ? config.gaps.manualValue
        : compareMotoData && motoData
          ? calculateGap(motoData.distance_from_start, compareMotoData.distance_from_start)
          : "";

    dataBuffer.add({
      speed,
      distance,
      distanceToFinish: motoData?.distance_to_finish?.toFixed(1) || "--",
      distanceToNextCheckpoint: motoData?.distance_to_next_checkpoint?.toFixed(1) || "--",
      nextCheckpointName: motoData?.next_checkpoint_name || "",
      gap,
      timestamp: Date.now(),
      isManualSpeed: config.speed.manualMode,
      isManualDistance: config.distance.manualMode,
      isManualGap: config.gaps.manualMode,
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
        .from("race_waves")
        .select("start_time")
        .eq("race_distance_id", config.selected_distance_id)
        .maybeSingle();

      if (data?.start_time) {
        setWaveStartTime(new Date(data.start_time));
      }
    };

    fetchWaveStartTime();
  }, [config?.selected_distance_id]);

  if (loading || !config) {
    return null; // No mostrar nada mientras carga
  }

  // RENDERING DIRECTO - Sin OverlayContainer ni AnimatePresence que puedan causar delays
  return (
    <>
      {/* CRÍTICO: Forzar transparencia desde el primer frame */}
      <style>{`
        html, body, #root {
          background: transparent !important;
          background-color: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "transparent",
          backgroundColor: "transparent",
          pointerEvents: "none",
        }}
      >
        {/* Speed Display */}
        {config.speed.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              left: `${config.speed.posX}%`,
              top: `${config.speed.posY}%`,
              transform: `translate(-50%, -50%) scale(${config.speed.scale})`,
              fontFamily: getFontFamily(config.speed.font),
              fontSize: `${config.speed.size}px`,
              color: config.speed.color,
              backgroundColor: hexToRgba(config.speed.bgColor, config.speed.bgOpacity),
              padding: "12px 24px",
              borderRadius: "8px",
              textAlign: "center",
              fontWeight: "bold",
              textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "0.4em", opacity: 0.7, marginBottom: "2px" }}>
              {config.speed.displayType === "pace" ? "RITMO" : "VELOCIDAD"}
            </div>
            {displayData.speed}
            <span style={{ fontSize: "0.6em", marginLeft: "4px" }}>
              {config.speed.displayType === "pace" ? "min/km" : "km/h"}
            </span>
          </motion.div>
        )}

        {/* Distance to Finish */}
        {config.distance.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              left: `${config.distance.posX}%`,
              top: `${config.distance.posY}%`,
              transform: `translate(-50%, -50%) scale(${config.distance.scale})`,
              fontFamily: getFontFamily(config.distance.font),
              fontSize: `${config.distance.size}px`,
              color: config.distance.color,
              backgroundColor: hexToRgba(config.distance.bgColor, config.distance.bgOpacity),
              padding: "12px 24px",
              borderRadius: "8px",
              textAlign: "center",
              fontWeight: "bold",
              textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "0.4em", opacity: 0.7, marginBottom: "2px" }}>A META</div>
            {displayData.distanceToFinish}
            <span style={{ fontSize: "0.6em", marginLeft: "4px" }}>km</span>
          </motion.div>
        )}

        {/* Checkpoint */}
        {config.checkpoint.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              left: `${config.checkpoint.posX}%`,
              top: `${config.checkpoint.posY}%`,
              transform: `translate(-50%, -50%) scale(${config.checkpoint.scale})`,
              fontFamily: getFontFamily(config.checkpoint.font),
              fontSize: `${config.checkpoint.size}px`,
              color: config.checkpoint.color,
              backgroundColor: hexToRgba(config.checkpoint.bgColor, config.checkpoint.bgOpacity),
              padding: "10px 20px",
              borderRadius: "8px",
              textAlign: "center",
              fontWeight: "bold",
              textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "0.45em", opacity: 0.7, marginBottom: "2px", whiteSpace: "nowrap" }}>
              {displayData.nextCheckpointName || "PRÓXIMO CONTROL"}
            </div>
            {displayData.distanceToNextCheckpoint !== "--" ? (
              <>
                {displayData.distanceToNextCheckpoint}
                <span style={{ fontSize: "0.6em", marginLeft: "4px" }}>km</span>
              </>
            ) : (
              "--"
            )}
          </motion.div>
        )}

        {/* Gap */}
        {config.gaps.visible && displayData.gap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              left: `${config.gaps.posX}%`,
              top: `${config.gaps.posY}%`,
              transform: `translate(-50%, -50%) scale(${config.gaps.scale})`,
              fontFamily: getFontFamily(config.gaps.font),
              fontSize: `${config.gaps.size}px`,
              color: config.gaps.color,
              backgroundColor: hexToRgba(config.gaps.bgColor, config.gaps.bgOpacity),
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: "bold",
              textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            {displayData.gap}
          </motion.div>
        )}

        {/* Clock */}
        {config.clock.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              left: `${config.clock.posX}%`,
              top: `${config.clock.posY}%`,
              transform: `translate(-50%, -50%) scale(${config.clock.scale})`,
              fontFamily: getFontFamily(config.clock.font),
              fontSize: `${config.clock.size}px`,
              color: config.clock.color,
              backgroundColor: hexToRgba(config.clock.bgColor, config.clock.bgOpacity),
              padding: "8px 20px",
              borderRadius: "8px",
              fontWeight: "bold",
              letterSpacing: "0.05em",
              textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            {getElapsedTime(waveStartTime)}
          </motion.div>
        )}
      </div>
    </>
  );
};

export default MotoOverlay;
