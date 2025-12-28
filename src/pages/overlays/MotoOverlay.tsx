import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { Hand, Radio } from "lucide-react";
import SpeedDisplay from "@/components/overlays/SpeedDisplay";

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
  speed_bg_opacity: number;
  speed_pos_x: number;
  speed_pos_y: number;
  speed_scale: number;
  speed_display_type: "speed" | "pace";
  distance_font: string;
  distance_size: number;
  distance_color: string;
  distance_bg_color: string;
  distance_visible: boolean;
  distance_manual_mode: boolean;
  distance_manual_value: string | null;
  distance_bg_opacity: number;
  distance_pos_x: number;
  distance_pos_y: number;
  distance_scale: number;
  gaps_font: string;
  gaps_size: number;
  gaps_color: string;
  gaps_bg_color: string;
  gaps_visible: boolean;
  gaps_manual_mode: boolean;
  gaps_manual_value: string | null;
  gaps_bg_opacity: number;
  gaps_pos_x: number;
  gaps_pos_y: number;
  gaps_scale: number;
  clock_font: string;
  clock_size: number;
  clock_color: string;
  clock_bg_color: string;
  clock_visible: boolean;
  clock_bg_opacity: number;
  clock_pos_x: number;
  clock_pos_y: number;
  clock_scale: number;
  // Checkpoint element
  checkpoint_font: string;
  checkpoint_size: number;
  checkpoint_color: string;
  checkpoint_bg_color: string;
  checkpoint_visible: boolean;
  checkpoint_manual_mode: boolean;
  checkpoint_manual_value: string | null;
  checkpoint_bg_opacity: number;
  checkpoint_pos_x: number;
  checkpoint_pos_y: number;
  checkpoint_scale: number;
  selected_moto_id: string | null;
  compare_moto_id: string | null;
}

interface MotoData {
  speed: number;
  distance_from_start: number;
  distance_to_finish: number | null;
  distance_to_next_checkpoint: number | null;
  next_checkpoint_name: string | null;
  moto_name: string;
  color: string;
}

interface BufferedData {
  speed: string;
  distance: string;
  distanceToFinish: string;
  distanceToNextCheckpoint: string;
  nextCheckpointName: string;
  gap: string;
  timestamp: number;
  isManualSpeed: boolean;
  isManualDistance: boolean;
  isManualGap: boolean;
}

// Animated number component with count-up effect
const AnimatedNumber = ({ 
  value, 
  decimals = 0,
  suffix = "",
  style,
  isManual = false,
  showGlow = false
}: { 
  value: number; 
  decimals?: number;
  suffix?: string;
  style: React.CSSProperties;
  isManual?: boolean;
  showGlow?: boolean;
}) => {
  const spring = useSpring(value, {
    stiffness: 100,
    damping: 30,
    mass: 1
  });

  const display = useTransform(spring, (val) => val.toFixed(decimals));
  const [displayValue, setDisplayValue] = useState(value.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsubscribe = display.on("change", (v) => {
      setDisplayValue(v);
    });
    return unsubscribe;
  }, [display]);

  return (
    <motion.span 
      style={style}
      animate={{
        textShadow: showGlow 
          ? [
              "2px 2px 4px rgba(0,0,0,0.5)",
              "0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.6)",
              "2px 2px 4px rgba(0,0,0,0.5)"
            ]
          : "2px 2px 4px rgba(0,0,0,0.5)"
      }}
      transition={{ duration: 0.5, times: [0, 0.5, 1] }}
    >
      {displayValue}{suffix}
    </motion.span>
  );
};

// Animated text for manual values
const AnimatedText = ({ 
  value, 
  suffix = "",
  style,
  showGlow = false
}: { 
  value: string; 
  suffix?: string;
  style: React.CSSProperties;
  showGlow?: boolean;
}) => {
  return (
    <motion.span 
      key={value}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ 
        opacity: 1, 
        y: 0,
        textShadow: showGlow 
          ? [
              "2px 2px 4px rgba(0,0,0,0.5)",
              "0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.6)",
              "2px 2px 4px rgba(0,0,0,0.5)"
            ]
          : "2px 2px 4px rgba(0,0,0,0.5)"
      }}
      transition={{ 
        opacity: { duration: 0.2 },
        y: { type: "spring", stiffness: 300, damping: 30 },
        textShadow: { duration: 0.5, times: [0, 0.5, 1] }
      }}
    >
      {value}{suffix}
    </motion.span>
  );
};

// Mode badge component - shows AUTO/MANUAL status
const ModeBadge = ({ isManual }: { isManual: boolean }) => {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isManual ? "manual" : "auto"}
        initial={{ scale: 0, opacity: 0, rotate: -10 }}
        animate={{ 
          scale: 1, 
          opacity: 1, 
          rotate: 0,
        }}
        exit={{ scale: 0, opacity: 0, rotate: 10 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 20
        }}
        style={{
          position: "absolute",
          top: "-8px",
          right: "-8px",
          display: "flex",
          alignItems: "center",
          gap: "3px",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          fontWeight: "bold",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.5px",
          backgroundColor: isManual ? "#FF9800" : "#4CAF50",
          color: "#FFFFFF",
          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          zIndex: 10,
        }}
      >
        {isManual ? (
          <>
            <motion.div
              animate={{ 
                rotate: [0, -15, 15, -15, 0],
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Hand size={10} strokeWidth={2.5} />
            </motion.div>
            <span>MAN</span>
          </>
        ) : (
          <>
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Radio size={10} strokeWidth={2.5} />
            </motion.div>
            <span>AUTO</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

const MotoOverlay = () => {
  const { raceId } = useParams();
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [raceIdResolved, setRaceIdResolved] = useState<string | null>(null);
  const [motoData, setMotoData] = useState<MotoData | null>(null);
  const [compareMotoData, setCompareMotoData] = useState<MotoData | null>(null);
  const [displayData, setDisplayData] = useState<BufferedData>({
    speed: "0",
    distance: "0.0",
    distanceToFinish: "--",
    distanceToNextCheckpoint: "--",
    nextCheckpointName: "",
    gap: "",
    timestamp: Date.now(),
    isManualSpeed: false,
    isManualDistance: false,
    isManualGap: false
  });
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [manualModeChanged, setManualModeChanged] = useState<{speed: boolean; distance: boolean; gap: boolean}>({
    speed: false, distance: false, gap: false
  });
  const prevManualMode = useRef({ speed: false, distance: false, gap: false });
  const dataBuffer = useRef<BufferedData[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [waveStartTime, setWaveStartTime] = useState<Date | null>(null);
  const [primaryMotoId, setPrimaryMotoId] = useState<string | null>(null);

  // Spring configuration for TV-like animations
  const springConfig = {
    type: "spring" as const,
    stiffness: 200,
    damping: 25,
    mass: 1.2
  };

  // Resolve race ID from slug
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!raceId) return;
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(raceId)) {
        setRaceIdResolved(raceId);
        return;
      }

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

  // Default config when none exists in database
  const defaultConfig: OverlayConfig = {
    delay_seconds: 0,
    layout: "horizontal",
    speed_font: "Bebas Neue",
    speed_size: 72,
    speed_color: "#FFFFFF",
    speed_bg_color: "#000000",
    speed_visible: true,
    speed_manual_mode: false,
    speed_manual_value: null,
    speed_bg_opacity: 0.7,
    speed_pos_x: 50,
    speed_pos_y: 85,
    speed_scale: 1,
    speed_display_type: "speed",
    distance_font: "Roboto Condensed",
    distance_size: 48,
    distance_color: "#FFFFFF",
    distance_bg_color: "#1a1a1a",
    distance_visible: true,
    distance_manual_mode: false,
    distance_manual_value: null,
    distance_bg_opacity: 0.7,
    distance_pos_x: 25,
    distance_pos_y: 85,
    distance_scale: 1,
    gaps_font: "Barlow Semi Condensed",
    gaps_size: 36,
    gaps_color: "#00FF00",
    gaps_bg_color: "#000000",
    gaps_visible: true,
    gaps_manual_mode: false,
    gaps_manual_value: null,
    gaps_bg_opacity: 0.7,
    gaps_pos_x: 75,
    gaps_pos_y: 85,
    gaps_scale: 1,
    clock_font: "Bebas Neue",
    clock_size: 48,
    clock_color: "#FFFFFF",
    clock_bg_color: "#000000",
    clock_visible: false,
    clock_bg_opacity: 0.7,
    clock_pos_x: 50,
    clock_pos_y: 10,
    clock_scale: 1,
    // Checkpoint defaults
    checkpoint_font: "Roboto Condensed",
    checkpoint_size: 36,
    checkpoint_color: "#FFFFFF",
    checkpoint_bg_color: "#1a1a1a",
    checkpoint_visible: true,
    checkpoint_manual_mode: false,
    checkpoint_manual_value: null,
    checkpoint_bg_opacity: 0.7,
    checkpoint_pos_x: 90,
    checkpoint_pos_y: 85,
    checkpoint_scale: 1,
    selected_moto_id: null,
    compare_moto_id: null,
  };

  // Fetch config
  useEffect(() => {
    if (!raceIdResolved) return;

    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from("overlay_config")
        .select("*")
        .eq("race_id", raceIdResolved)
        .maybeSingle();

      if (error) {
        console.error("Error fetching overlay config:", error);
        setConfig(defaultConfig);
      } else if (data) {
        setConfig(data as unknown as OverlayConfig);
      } else {
        // No config exists, use defaults
        setConfig(defaultConfig);
      }
      // Trigger visibility after config loads
      setTimeout(() => setIsVisible(true), 100);
    };

    fetchConfig();

    const channel = supabase
      .channel(`overlay-config-changes-${raceIdResolved}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "overlay_config",
          filter: `race_id=eq.${raceIdResolved}`
        },
        async (payload) => {
          if (payload.new) {
            const newConfig = payload.new as unknown as OverlayConfig;
            
            // Detect manual mode changes for glow effect
            setConfig(prevConfig => {
              if (prevConfig) {
                if (newConfig.speed_manual_mode !== prevConfig.speed_manual_mode) {
                  setManualModeChanged(prev => ({ ...prev, speed: true }));
                  setTimeout(() => setManualModeChanged(prev => ({ ...prev, speed: false })), 1000);
                }
                if (newConfig.distance_manual_mode !== prevConfig.distance_manual_mode) {
                  setManualModeChanged(prev => ({ ...prev, distance: true }));
                  setTimeout(() => setManualModeChanged(prev => ({ ...prev, distance: false })), 1000);
                }
                if (newConfig.gaps_manual_mode !== prevConfig.gaps_manual_mode) {
                  setManualModeChanged(prev => ({ ...prev, gap: true }));
                  setTimeout(() => setManualModeChanged(prev => ({ ...prev, gap: false })), 1000);
                }
              }
              return newConfig as unknown as OverlayConfig;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved]);

  // Fetch primary moto (moto_order = 1) if no selected_moto_id is configured
  useEffect(() => {
    if (!raceIdResolved) return;

    const fetchPrimaryMoto = async () => {
      // Get the moto with moto_order = 1 (MOTO PRINCIPAL)
      const { data, error } = await supabase
        .from("race_motos")
        .select("id")
        .eq("race_id", raceIdResolved)
        .eq("is_active", true)
        .order("moto_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        console.log("[Overlay] Primary moto (moto_order=1):", data.id);
        setPrimaryMotoId(data.id);
      }
    };

    fetchPrimaryMoto();
  }, [raceIdResolved]);

  // Determine which moto ID to use: config.selected_moto_id OR primaryMotoId
  const effectiveMotoId = config?.selected_moto_id || primaryMotoId;

  // Fetch wave start time based on effectiveMotoId's race_distance_id
  useEffect(() => {
    if (!raceIdResolved || !effectiveMotoId) {
      setWaveStartTime(null);
      return;
    }

    const fetchWaveStartTime = async () => {
      // First get the moto's race_distance_id
      const { data: motoData, error: motoError } = await supabase
        .from("race_motos")
        .select("race_distance_id")
        .eq("id", effectiveMotoId)
        .single();

      if (motoError || !motoData?.race_distance_id) {
        console.error("Error fetching moto race_distance_id:", motoError);
        setWaveStartTime(null);
        return;
      }

      // Then get the wave for that race_distance
      const { data: waveData, error: waveError } = await supabase
        .from("race_waves")
        .select("start_time")
        .eq("race_distance_id", motoData.race_distance_id)
        .single();

      if (waveError || !waveData?.start_time) {
        console.error("Error fetching wave start_time:", waveError);
        setWaveStartTime(null);
        return;
      }

      console.log("[Overlay] Wave start time for moto event:", waveData.start_time);
      setWaveStartTime(new Date(waveData.start_time));
    };

    fetchWaveStartTime();
  }, [raceIdResolved, effectiveMotoId]);

  // Fetch moto GPS data using effectiveMotoId
  useEffect(() => {
    if (!raceIdResolved || !effectiveMotoId) return;

    console.log("[Overlay] Fetching GPS data for moto:", effectiveMotoId);

    const fetchMotoData = async () => {
      const { data, error } = await supabase
        .from("moto_gps_tracking")
        .select(`
          speed,
          distance_from_start,
          distance_to_finish,
          distance_to_next_checkpoint,
          next_checkpoint_name,
          race_motos!inner (
            name,
            name_tv,
            color
          )
        `)
        .eq("moto_id", effectiveMotoId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const motoInfo = data.race_motos as any;
        console.log("[Overlay] GPS data received:", {
          distance_to_finish: data.distance_to_finish,
          distance_to_next_checkpoint: data.distance_to_next_checkpoint,
          next_checkpoint_name: data.next_checkpoint_name
        });
        setMotoData({
          speed: data.speed || 0,
          distance_from_start: data.distance_from_start || 0,
          distance_to_finish: data.distance_to_finish,
          distance_to_next_checkpoint: data.distance_to_next_checkpoint,
          next_checkpoint_name: data.next_checkpoint_name,
          moto_name: motoInfo?.name_tv || motoInfo?.name || "",
          color: motoInfo?.color || "#FF5722"
        });
        
        // Check if off-route (distance_from_start is null or negative)
        setIsOffRoute(data.distance_from_start === null || data.distance_from_start < 0);
      } else if (error) {
        console.error("[Overlay] Error fetching moto GPS data:", error);
      }
    };

    fetchMotoData();
    
    // Also poll every 2 seconds in case realtime doesn't trigger
    const pollInterval = setInterval(fetchMotoData, 2000);

    const channel = supabase
      .channel(`moto-gps-overlay-${effectiveMotoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moto_gps_tracking",
          filter: `moto_id=eq.${effectiveMotoId}`
        },
        async (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            console.log("[Overlay] Realtime GPS update:", {
              distance_to_finish: newData.distance_to_finish,
              distance_to_next_checkpoint: newData.distance_to_next_checkpoint
            });
            setMotoData(prev => prev ? {
              ...prev,
              speed: newData.speed || 0,
              distance_from_start: newData.distance_from_start || 0,
              distance_to_finish: newData.distance_to_finish,
              distance_to_next_checkpoint: newData.distance_to_next_checkpoint,
              next_checkpoint_name: newData.next_checkpoint_name
            } : null);
            
            setIsOffRoute(newData.distance_from_start === null || newData.distance_from_start < 0);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved, effectiveMotoId]);

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
          distance_to_finish: null,
          distance_to_next_checkpoint: null,
          next_checkpoint_name: null,
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
    const cutoff = Date.now() - 60000;
    dataBuffer.current = dataBuffer.current.filter(d => d.timestamp > cutoff);
  }, []);

  // Process real data and add to buffer
  useEffect(() => {
    if (!config) return;
    
    // Always process - even without motoData, we need to handle manual mode
    const isManualSpeed = config.speed_manual_mode;
    const isManualDistance = config.distance_manual_mode;
    const isManualGap = config.gaps_manual_mode;

    let speed = "0";
    if (isManualSpeed && config.speed_manual_value) {
      speed = config.speed_manual_value;
    } else if (motoData) {
      // CRITICAL: motoData.speed comes from GPS in m/s, convert to km/h
      const speedKmh = Math.round(motoData.speed * 3.6);
      if (config.speed_display_type === "pace" && speedKmh > 0) {
        // Convert km/h to min/km
        const paceMinutes = 60 / speedKmh;
        const mins = Math.floor(paceMinutes);
        const secs = Math.round((paceMinutes - mins) * 60);
        speed = `${mins}:${secs.toString().padStart(2, '0')}`;
      } else {
        speed = `${speedKmh}`;
      }
    }

    let distance = "0.0";
    if (isManualDistance && config.distance_manual_value) {
      distance = config.distance_manual_value;
    } else if (motoData) {
      distance = `${(motoData.distance_from_start / 1000).toFixed(1)}`;
    }

    let gap = "";
    if (isManualGap && config.gaps_manual_value) {
      gap = config.gaps_manual_value;
    } else if (compareMotoData && motoData && motoData.distance_from_start && compareMotoData.distance_from_start) {
      const diff = motoData.distance_from_start - compareMotoData.distance_from_start;
      const diffKm = diff / 1000;
      gap = (diff >= 0 ? "+" : "") + diffKm.toFixed(2) + " km";
    }

    // Distance to finish and next checkpoint
    let distanceToFinish = "--";
    let distanceToNextCheckpoint = "--";
    let nextCheckpointName = "";
    
    if (motoData?.distance_to_finish != null) {
      distanceToFinish = motoData.distance_to_finish.toFixed(1);
    }
    if (motoData?.distance_to_next_checkpoint != null) {
      distanceToNextCheckpoint = motoData.distance_to_next_checkpoint.toFixed(1);
    }
    if (motoData?.next_checkpoint_name) {
      nextCheckpointName = motoData.next_checkpoint_name;
    }

    addToBuffer({
      speed,
      distance,
      distanceToFinish,
      distanceToNextCheckpoint,
      nextCheckpointName,
      gap,
      timestamp: Date.now(),
      isManualSpeed,
      isManualDistance,
      isManualGap
    });
  }, [motoData, compareMotoData, config, addToBuffer]);

  // Display delayed data
  useEffect(() => {
    if (!config) return;

    const delayMs = (config.delay_seconds || 0) * 1000;

    const interval = setInterval(() => {
      const targetTime = Date.now() - delayMs;
      
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
    return <div className="w-full h-full" style={{ background: "transparent" }} />;
  }

  const parseNumericValue = (value: string): number => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  // Calculate positions and scales with proper defaults
  const speedX = config.speed_pos_x ?? 50;
  const speedY = config.speed_pos_y ?? 85;
  const speedScale = config.speed_scale ?? 1;
  const distanceX = config.distance_pos_x ?? 25;
  const distanceY = config.distance_pos_y ?? 85;
  const distanceScale = config.distance_scale ?? 1;
  const gapsX = config.gaps_pos_x ?? 75;
  const gapsY = config.gaps_pos_y ?? 85;
  const gapsScale = config.gaps_scale ?? 1;
  const clockX = config.clock_pos_x ?? 50;
  const clockY = config.clock_pos_y ?? 10;
  const clockScale = config.clock_scale ?? 1;
  const checkpointX = config.checkpoint_pos_x ?? 90;
  const checkpointY = config.checkpoint_pos_y ?? 85;
  const checkpointScale = config.checkpoint_scale ?? 1;

  return (
    <>
      {/* Force transparent background on body for this route */}
      <style>{`
        html, body, #root {
          background: transparent !important;
          background-color: transparent !important;
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
        {/* Speed - Circular Speedometer */}
        <AnimatePresence mode="wait">
          {isVisible && config.speed_visible && (
            <motion.div
              key="speed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springConfig}
              style={{
                position: "absolute",
                left: `${speedX}%`,
                top: `${speedY}%`,
                transform: `translate(-50%, -50%) scale(${speedScale})`,
              }}
            >
              <SpeedDisplay
                speed={parseNumericValue(displayData.speed)}
                size={config.speed_size}
                color={config.speed_color}
                bgColor={config.speed_bg_color}
                bgOpacity={config.speed_bg_opacity ?? 0.7}
                fontFamily={getFontFamily(config.speed_font)}
                isManual={displayData.isManualSpeed}
                showBadge={false}
                displayType={config.speed_display_type || "speed"}
                rawValue={displayData.speed}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Distance to Finish (A Meta) */}
        <AnimatePresence mode="wait">
          {isVisible && config.distance_visible && (
            <motion.div
              key="distance-to-finish"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springConfig}
              style={{
                position: "absolute",
                left: `${distanceX}%`,
                top: `${distanceY}%`,
                transform: `translate(-50%, -50%) scale(${distanceScale})`,
                fontFamily: getFontFamily(config.distance_font),
                fontSize: `${config.distance_size}px`,
                color: config.distance_color,
                backgroundColor: hexToRgba(config.distance_bg_color, config.distance_bg_opacity ?? 0.7),
                padding: "12px 24px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.4em", opacity: 0.7, marginBottom: "2px" }}>A META</div>
              {displayData.isManualDistance ? (
                <AnimatedText 
                  value={displayData.distance} 
                  suffix=" "
                  style={{}} 
                  showGlow={manualModeChanged.distance}
                />
              ) : (
                <AnimatedNumber 
                  value={parseNumericValue(displayData.distanceToFinish)} 
                  decimals={1}
                  suffix=" "
                  style={{}}
                  isManual={false}
                  showGlow={manualModeChanged.distance}
                />
              )}
              <motion.span style={{ fontSize: "0.6em" }}>km</motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Distance to Next Checkpoint - Independent element with own config */}
        <AnimatePresence mode="wait">
          {isVisible && config.checkpoint_visible && (
            <motion.div
              key="distance-to-checkpoint"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springConfig}
              style={{
                position: "absolute",
                left: `${checkpointX}%`,
                top: `${checkpointY}%`,
                transform: `translate(-50%, -50%) scale(${checkpointScale})`,
                fontFamily: getFontFamily(config.checkpoint_font),
                fontSize: `${config.checkpoint_size}px`,
                color: config.checkpoint_color,
                backgroundColor: hexToRgba(config.checkpoint_bg_color, config.checkpoint_bg_opacity ?? 0.7),
                padding: "10px 20px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.45em", opacity: 0.7, marginBottom: "2px", whiteSpace: "nowrap" }}>
                {displayData.nextCheckpointName ? `→ ${displayData.nextCheckpointName}` : "Próximo control"}
              </div>
              {config.checkpoint_manual_mode && config.checkpoint_manual_value ? (
                <AnimatedText 
                  value={config.checkpoint_manual_value} 
                  style={{}} 
                  showGlow={false}
                />
              ) : displayData.distanceToNextCheckpoint !== "--" ? (
                <>
                  <AnimatedNumber 
                    value={parseNumericValue(displayData.distanceToNextCheckpoint)} 
                    decimals={1}
                    suffix=" "
                    style={{}}
                    isManual={false}
                    showGlow={false}
                  />
                  <motion.span style={{ fontSize: "0.6em" }}>km</motion.span>
                </>
              ) : (
                <span>--</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gap - Show when gap exists or manual mode */}
        <AnimatePresence mode="wait">
          {isVisible && config.gaps_visible && (displayData.gap || config.gaps_manual_mode) && (
            <motion.div
              key="gap"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springConfig}
              style={{
                position: "absolute",
                left: `${gapsX}%`,
                top: `${gapsY}%`,
                transform: `translate(-50%, -50%) scale(${gapsScale})`,
                fontFamily: getFontFamily(config.gaps_font),
                fontSize: `${config.gaps_size}px`,
                color: config.gaps_color,
                backgroundColor: hexToRgba(config.gaps_bg_color, config.gaps_bg_opacity ?? 0.7),
                padding: "8px 16px",
                borderRadius: "8px",
              }}
            >
              <AnimatedText 
                value={displayData.gap || config.gaps_manual_value || "---"} 
                style={{}} 
                showGlow={manualModeChanged.gap}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clock */}
        <AnimatePresence mode="wait">
          {isVisible && config.clock_visible && (
            <motion.div
              key="clock"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springConfig}
              style={{
                position: "absolute",
                left: `${clockX}%`,
                top: `${clockY}%`,
                transform: `translate(-50%, -50%) scale(${clockScale})`,
                fontFamily: getFontFamily(config.clock_font),
                fontSize: `${config.clock_size}px`,
                color: config.clock_color,
                backgroundColor: hexToRgba(config.clock_bg_color, config.clock_bg_opacity ?? 0.7),
                padding: "8px 20px",
                borderRadius: "8px",
              }}
            >
              <RaceTimeDisplay startTime={waveStartTime} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

// Race time display component - shows elapsed time since wave start
const RaceTimeDisplay = ({ startTime }: { startTime: Date | null }) => {
  const [elapsed, setElapsed] = useState("--:--:--");
  
  useEffect(() => {
    // If no start time, show placeholder
    if (!startTime) {
      setElapsed("--:--:--");
      return;
    }
    
    const updateElapsed = () => {
      const now = new Date();
      const diff = now.getTime() - startTime.getTime();
      
      if (diff < 0) {
        // Race hasn't started yet
        setElapsed("--:--:--");
        return;
      }
      
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      setElapsed(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  
  return (
    <motion.span
      key={elapsed}
      initial={{ opacity: 0.8 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {elapsed}
    </motion.span>
  );
};

// Helper function to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default MotoOverlay;
