import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface OverlayConfig {
  delay_seconds: number;
  layout: "horizontal" | "vertical" | "square";
  speed_font: string;
  speed_size: number;
  speed_color: string;
  speed_bg_color: string;
  speed_visible: boolean;
  speed_manual_mode: boolean;
  speed_manual_value: string | null;
  distance_font: string;
  distance_size: number;
  distance_color: string;
  distance_bg_color: string;
  distance_visible: boolean;
  distance_manual_mode: boolean;
  distance_manual_value: string | null;
  gaps_font: string;
  gaps_size: number;
  gaps_color: string;
  gaps_bg_color: string;
  gaps_visible: boolean;
  gaps_manual_mode: boolean;
  gaps_manual_value: string | null;
  selected_moto_id: string | null;
  compare_moto_id: string | null;
}

interface MotoData {
  speed: number;
  distance_from_start: number;
  moto_name: string;
  color: string;
}

interface BufferedData {
  speed: string;
  distance: string;
  gap: string;
  timestamp: number;
}

const MotoOverlay = () => {
  const { raceId } = useParams();
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [raceIdResolved, setRaceIdResolved] = useState<string | null>(null);
  const [motoData, setMotoData] = useState<MotoData | null>(null);
  const [compareMotoData, setCompareMotoData] = useState<MotoData | null>(null);
  const [displayData, setDisplayData] = useState<BufferedData>({
    speed: "0",
    distance: "0.0",
    gap: "",
    timestamp: Date.now()
  });
  const dataBuffer = useRef<BufferedData[]>([]);

  // Resolve race ID from slug
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!raceId) return;
      
      // Check if it's a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(raceId)) {
        setRaceIdResolved(raceId);
        return;
      }

      // It's a slug, resolve to ID
      const { data, error } = await supabase
        .from("races")
        .select("id")
        .eq("slug", raceId)
        .single();

      if (!error && data) {
        setRaceIdResolved(data.id);
      }
    };

    resolveRaceId();
  }, [raceId]);

  // Fetch config
  useEffect(() => {
    if (!raceIdResolved) return;

    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from("overlay_config")
        .select("*")
        .eq("race_id", raceIdResolved)
        .single();

      if (!error && data) {
        setConfig(data as unknown as OverlayConfig);
      }
    };

    fetchConfig();

    // Subscribe to config changes
    const channel = supabase
      .channel("overlay-config-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "overlay_config",
          filter: `race_id=eq.${raceIdResolved}`
        },
        (payload) => {
          if (payload.new) {
            setConfig(payload.new as unknown as OverlayConfig);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved]);

  // Fetch moto GPS data
  useEffect(() => {
    if (!raceIdResolved || !config?.selected_moto_id) return;

    const fetchMotoData = async () => {
      const { data, error } = await supabase
        .from("moto_gps_tracking")
        .select(`
          speed,
          distance_from_start,
          race_motos!inner (
            name,
            name_tv,
            color
          )
        `)
        .eq("moto_id", config.selected_moto_id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        const motoInfo = data.race_motos as any;
        setMotoData({
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          moto_name: motoInfo?.name_tv || motoInfo?.name || "",
          color: motoInfo?.color || "#FF5722"
        });
      }
    };

    fetchMotoData();

    // Subscribe to GPS updates
    const channel = supabase
      .channel("moto-gps-overlay")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moto_gps_tracking",
          filter: `moto_id=eq.${config.selected_moto_id}`
        },
        async (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            setMotoData(prev => prev ? {
              ...prev,
              speed: newData.speed || 0,
              distance_from_start: newData.distance_from_start || 0
            } : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved, config?.selected_moto_id]);

  // Fetch compare moto data
  useEffect(() => {
    if (!raceIdResolved || !config?.compare_moto_id) {
      setCompareMotoData(null);
      return;
    }

    const fetchCompareMotoData = async () => {
      const { data, error } = await supabase
        .from("moto_gps_tracking")
        .select(`
          speed,
          distance_from_start,
          race_motos!inner (
            name,
            name_tv,
            color
          )
        `)
        .eq("moto_id", config.compare_moto_id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        const motoInfo = data.race_motos as any;
        setCompareMotoData({
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          moto_name: motoInfo?.name_tv || motoInfo?.name || "",
          color: motoInfo?.color || "#FF5722"
        });
      }
    };

    fetchCompareMotoData();

    const channel = supabase
      .channel("moto-compare-gps-overlay")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moto_gps_tracking",
          filter: `moto_id=eq.${config.compare_moto_id}`
        },
        async (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            setCompareMotoData(prev => prev ? {
              ...prev,
              speed: newData.speed || 0,
              distance_from_start: newData.distance_from_start || 0
            } : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved, config?.compare_moto_id]);

  // Buffer management for delay
  const addToBuffer = useCallback((data: BufferedData) => {
    dataBuffer.current.push(data);
    // Keep only last 60 seconds of data
    const cutoff = Date.now() - 60000;
    dataBuffer.current = dataBuffer.current.filter(d => d.timestamp > cutoff);
  }, []);

  // Process real data and add to buffer
  useEffect(() => {
    if (!motoData || !config) return;

    const speed = config.speed_manual_mode && config.speed_manual_value
      ? config.speed_manual_value
      : `${Math.round(motoData.speed)}`;

    const distance = config.distance_manual_mode && config.distance_manual_value
      ? config.distance_manual_value
      : `${(motoData.distance_from_start / 1000).toFixed(1)}`;

    let gap = "";
    if (compareMotoData && motoData.distance_from_start && compareMotoData.distance_from_start) {
      const diff = motoData.distance_from_start - compareMotoData.distance_from_start;
      const diffKm = diff / 1000;
      gap = config.gaps_manual_mode && config.gaps_manual_value
        ? config.gaps_manual_value
        : (diff >= 0 ? "+" : "") + diffKm.toFixed(2) + " km";
    }

    addToBuffer({
      speed,
      distance,
      gap,
      timestamp: Date.now()
    });
  }, [motoData, compareMotoData, config, addToBuffer]);

  // Display delayed data
  useEffect(() => {
    if (!config) return;

    const delayMs = (config.delay_seconds || 0) * 1000;

    const interval = setInterval(() => {
      const targetTime = Date.now() - delayMs;
      
      // Find the closest data point to the target time
      const closest = dataBuffer.current.reduce((prev, curr) => {
        if (!prev) return curr;
        return Math.abs(curr.timestamp - targetTime) < Math.abs(prev.timestamp - targetTime) ? curr : prev;
      }, dataBuffer.current[0]);

      if (closest) {
        setDisplayData(closest);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [config?.delay_seconds]);

  const getFontFamily = (fontName: string) => {
    switch (fontName) {
      case "Bebas Neue": return '"Bebas Neue", cursive';
      case "Archivo Black": return '"Archivo Black", sans-serif';
      case "Roboto Condensed": return '"Roboto Condensed", sans-serif';
      case "Barlow Semi Condensed": return '"Barlow Semi Condensed", sans-serif';
      default: return "sans-serif";
    }
  };

  if (!config || !raceIdResolved) {
    return <div className="w-full h-full" />;
  }

  const getLayoutStyles = () => {
    switch (config.layout) {
      case "horizontal":
        return "fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-4";
      case "vertical":
        return "fixed right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4";
      case "square":
        return "fixed bottom-8 right-8 flex flex-col gap-2";
      default:
        return "";
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden" style={{ background: "transparent" }}>
      <AnimatePresence>
        <motion.div 
          className={getLayoutStyles()}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Speed */}
          {config.speed_visible && (
            <motion.div
              key="speed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                fontFamily: getFontFamily(config.speed_font),
                fontSize: `${config.speed_size}px`,
                color: config.speed_color,
                backgroundColor: config.speed_bg_color,
                padding: "12px 24px",
                borderRadius: "8px",
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
              }}
            >
              {displayData.speed} <span style={{ fontSize: "0.5em" }}>km/h</span>
            </motion.div>
          )}

          {/* Distance */}
          {config.distance_visible && (
            <motion.div
              key="distance"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                fontFamily: getFontFamily(config.distance_font),
                fontSize: `${config.distance_size}px`,
                color: config.distance_color,
                backgroundColor: config.distance_bg_color,
                padding: "12px 24px",
                borderRadius: "8px",
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
              }}
            >
              {displayData.distance} <span style={{ fontSize: "0.6em" }}>km</span>
            </motion.div>
          )}

          {/* Gap */}
          {config.gaps_visible && displayData.gap && (
            <motion.div
              key="gap"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                fontFamily: getFontFamily(config.gaps_font),
                fontSize: `${config.gaps_size}px`,
                color: config.gaps_color,
                backgroundColor: config.gaps_bg_color,
                padding: "8px 16px",
                borderRadius: "8px",
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
              }}
            >
              {displayData.gap}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default MotoOverlay;
