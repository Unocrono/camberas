import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { Hand, Radio } from "lucide-react";
import SpeedometerGauge from "@/components/overlays/SpeedometerGauge";
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
    distance_font: "Roboto Condensed",
    distance_size: 48,
    distance_color: "#FFFFFF",
    distance_bg_color: "#1a1a1a",
    distance_visible: true,
    distance_manual_mode: false,
    distance_manual_value: null,
    gaps_font: "Barlow Semi Condensed",
    gaps_size: 36,
    gaps_color: "#00FF00",
    gaps_bg_color: "#000000",
    gaps_visible: true,
    gaps_manual_mode: false,
    gaps_manual_value: null,
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
            const newConfig = payload.new as unknown as OverlayConfig;
            
            // Detect manual mode changes for glow effect
            if (config) {
              if (newConfig.speed_manual_mode !== config.speed_manual_mode) {
                setManualModeChanged(prev => ({ ...prev, speed: true }));
                setTimeout(() => setManualModeChanged(prev => ({ ...prev, speed: false })), 1000);
              }
              if (newConfig.distance_manual_mode !== config.distance_manual_mode) {
                setManualModeChanged(prev => ({ ...prev, distance: true }));
                setTimeout(() => setManualModeChanged(prev => ({ ...prev, distance: false })), 1000);
              }
              if (newConfig.gaps_manual_mode !== config.gaps_manual_mode) {
                setManualModeChanged(prev => ({ ...prev, gap: true }));
                setTimeout(() => setManualModeChanged(prev => ({ ...prev, gap: false })), 1000);
              }
            }
            
            setConfig(newConfig);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceIdResolved, config]);

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
        
        // Check if off-route (distance_from_start is null or negative)
        setIsOffRoute(data.distance_from_start === null || data.distance_from_start < 0);
      }
    };

    fetchMotoData();

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
            
            setIsOffRoute(newData.distance_from_start === null || newData.distance_from_start < 0);
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
    const cutoff = Date.now() - 60000;
    dataBuffer.current = dataBuffer.current.filter(d => d.timestamp > cutoff);
  }, []);

  // Process real data and add to buffer
  useEffect(() => {
    if (!motoData || !config) return;

    const isManualSpeed = config.speed_manual_mode && !!config.speed_manual_value;
    const isManualDistance = config.distance_manual_mode && !!config.distance_manual_value;
    const isManualGap = config.gaps_manual_mode && !!config.gaps_manual_value;

    const speed = isManualSpeed
      ? config.speed_manual_value!
      : `${Math.round(motoData.speed)}`;

    const distance = isManualDistance
      ? config.distance_manual_value!
      : `${(motoData.distance_from_start / 1000).toFixed(1)}`;

    let gap = "";
    if (compareMotoData && motoData.distance_from_start && compareMotoData.distance_from_start) {
      const diff = motoData.distance_from_start - compareMotoData.distance_from_start;
      const diffKm = diff / 1000;
      gap = isManualGap
        ? config.gaps_manual_value!
        : (diff >= 0 ? "+" : "") + diffKm.toFixed(2) + " km";
    }

    addToBuffer({
      speed,
      distance,
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
    return <div className="w-full h-full" />;
  }

  // Get entry/exit animation based on layout
  const getSlideAnimation = () => {
    switch (config.layout) {
      case "horizontal":
        return { x: -100, opacity: 0 };
      case "vertical":
        return { x: 100, opacity: 0 };
      case "square":
        return { y: 100, opacity: 0 };
      default:
        return { x: -100, opacity: 0 };
    }
  };

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

  // Off-route blink animation
  const offRouteAnimation = isOffRoute ? {
    animate: {
      backgroundColor: [config.speed_bg_color, "#FF4500", config.speed_bg_color],
      boxShadow: [
        "0 0 0 rgba(255, 69, 0, 0)",
        "0 0 20px rgba(255, 69, 0, 0.6)",
        "0 0 0 rgba(255, 69, 0, 0)"
      ]
    },
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  } : {};

  const parseNumericValue = (value: string): number => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  return (
    <div className="w-screen h-screen overflow-hidden" style={{ background: "transparent" }}>
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div 
            className={getLayoutStyles()}
            initial={getSlideAnimation()}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={getSlideAnimation()}
            transition={springConfig}
          >
            {/* Speed - Circular Speedometer */}
            <AnimatePresence mode="wait">
              {config.speed_visible && (
                <motion.div
                  key="speed"
                  initial={getSlideAnimation()}
                  animate={{ 
                    x: 0, 
                    y: 0, 
                    opacity: 1,
                    scale: 1,
                  }}
                  exit={getSlideAnimation()}
                  transition={springConfig}
                  layout
                >
                  <SpeedometerGauge
                    speed={parseNumericValue(displayData.speed)}
                    maxSpeed={60}
                    size={config.speed_size * 3}
                    color={config.speed_color}
                    bgColor={config.speed_bg_color}
                    isManual={displayData.isManualSpeed}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Distance */}
            <AnimatePresence mode="wait">
              {config.distance_visible && (
                <motion.div
                  key="distance"
                  initial={getSlideAnimation()}
                  animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  exit={getSlideAnimation()}
                  transition={springConfig}
                  style={{
                    position: "relative",
                    fontFamily: getFontFamily(config.distance_font),
                    fontSize: `${config.distance_size}px`,
                    color: config.distance_color,
                    backgroundColor: config.distance_bg_color,
                    padding: "12px 24px",
                    borderRadius: "8px",
                  }}
                  layout
                >
                  <ModeBadge isManual={displayData.isManualDistance} />
                  {displayData.isManualDistance ? (
                    <AnimatedText 
                      value={displayData.distance} 
                      suffix=" "
                      style={{}} 
                      showGlow={manualModeChanged.distance}
                    />
                  ) : (
                    <AnimatedNumber 
                      value={parseNumericValue(displayData.distance)} 
                      decimals={1}
                      suffix=" "
                      style={{}}
                      isManual={false}
                      showGlow={manualModeChanged.distance}
                    />
                  )}
                  <motion.span 
                    style={{ fontSize: "0.6em" }}
                    layout
                  >
                    km
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gap */}
            <AnimatePresence mode="wait">
              {config.gaps_visible && displayData.gap && (
                <motion.div
                  key="gap"
                  initial={getSlideAnimation()}
                  animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  exit={getSlideAnimation()}
                  transition={springConfig}
                  style={{
                    position: "relative",
                    fontFamily: getFontFamily(config.gaps_font),
                    fontSize: `${config.gaps_size}px`,
                    color: config.gaps_color,
                    backgroundColor: config.gaps_bg_color,
                    padding: "8px 16px",
                    borderRadius: "8px",
                  }}
                  layout
                >
                  <ModeBadge isManual={displayData.isManualGap} />
                  <AnimatedText 
                    value={displayData.gap} 
                    style={{}} 
                    showGlow={manualModeChanged.gap}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MotoOverlay;
