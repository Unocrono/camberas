import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface WaveData {
  id: string;
  wave_name: string;
  start_time: string | null;
  race_distance_id: string;
  distance_name: string;
}

const RaceClockOverlay = () => {
  const { raceId } = useParams();
  const [searchParams] = useSearchParams();
  const [waves, setWaves] = useState<WaveData[]>([]);
  const [currentTimes, setCurrentTimes] = useState<Record<string, string>>({});
  const [raceName, setRaceName] = useState("");
  
  // Config from URL params
  const theme = searchParams.get("theme") || "dark";
  const bgColor = searchParams.get("bg") || (theme === "dark" ? "#000000" : "#ffffff");
  const textColor = searchParams.get("text") || (theme === "dark" ? "#ffffff" : "#000000");
  const accentColor = searchParams.get("accent") || "#f59e0b"; // amber-500
  const delay = parseInt(searchParams.get("delay") || "0"); // delay in seconds (+/-)
  const showHeader = searchParams.get("header") !== "false";
  const selectedWaves = searchParams.get("waves")?.split(",") || []; // comma-separated wave IDs
  const layout = searchParams.get("layout") || "vertical"; // vertical, horizontal, grid
  const fontSize = searchParams.get("size") || "xl"; // sm, md, lg, xl, 2xl

  // Force transparent background on html/body
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  useEffect(() => {
    if (raceId) {
      fetchWaves();
    }
  }, [raceId]);

  const fetchWaves = async () => {
    try {
      // Get race info
      const { data: raceData } = await supabase
        .from("races")
        .select("name")
        .eq("id", raceId)
        .single();

      if (raceData) {
        setRaceName(raceData.name);
      }

      // Get waves with distance info
      const { data: wavesData, error } = await supabase
        .from("race_waves")
        .select(`
          id,
          wave_name,
          start_time,
          race_distance_id,
          race_distances!inner (
            name
          )
        `)
        .eq("race_id", raceId)
        .order("start_time", { ascending: true, nullsFirst: false });

      if (error) throw error;

      const formattedWaves: WaveData[] = (wavesData || []).map((wave: any) => ({
        id: wave.id,
        wave_name: wave.wave_name,
        start_time: wave.start_time,
        race_distance_id: wave.race_distance_id,
        distance_name: wave.race_distances?.name || ""
      }));

      setWaves(formattedWaves);
    } catch (error) {
      console.error("Error fetching waves:", error);
    }
  };

  const calculateElapsedTime = useCallback((startTime: string | null): string => {
    if (!startTime) return "--:--:--";

    const start = new Date(startTime);
    const now = new Date();
    
    // Apply delay adjustment (in seconds)
    const adjustedNow = new Date(now.getTime() + delay * 1000);
    
    const diffMs = adjustedNow.getTime() - start.getTime();
    
    // If race hasn't started yet
    if (diffMs < 0) {
      const absDiff = Math.abs(diffMs);
      const hours = Math.floor(absDiff / (1000 * 60 * 60));
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);
      
      return `-${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [delay]);

  // Update times every second
  useEffect(() => {
    const updateTimes = () => {
      const newTimes: Record<string, string> = {};
      waves.forEach(wave => {
        newTimes[wave.id] = calculateElapsedTime(wave.start_time);
      });
      setCurrentTimes(newTimes);
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);

    return () => clearInterval(interval);
  }, [waves, calculateElapsedTime]);

  // Filter waves if specific ones are selected
  const displayWaves = selectedWaves.length > 0 
    ? waves.filter(w => selectedWaves.includes(w.id))
    : waves;

  const getFontSizeClass = () => {
    switch (fontSize) {
      case "sm": return "text-2xl";
      case "md": return "text-4xl";
      case "lg": return "text-5xl";
      case "xl": return "text-6xl";
      case "2xl": return "text-7xl";
      default: return "text-6xl";
    }
  };

  const getLayoutClass = () => {
    switch (layout) {
      case "horizontal": return "flex flex-row flex-wrap justify-center gap-8";
      case "grid": return "grid grid-cols-2 gap-6";
      default: return "flex flex-col gap-6";
    }
  };

  return (
    <div 
      className="w-full min-h-screen overflow-hidden p-8 flex items-center justify-center"
      style={{ 
        background: "transparent",
        fontFamily: "'Inter', 'Segoe UI', sans-serif"
      }}
    >
      <div 
        className="rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl"
        style={{ 
          backgroundColor: `${bgColor}cc`,
          minWidth: layout === "horizontal" ? "auto" : "400px"
        }}
      >
        {/* Header */}
        {showHeader && (
          <div 
            className="px-6 py-4"
            style={{ backgroundColor: accentColor }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">⏱️</span>
              <div>
                <h2 className="text-xl font-bold text-white">{raceName}</h2>
                <p className="text-white/80 text-sm">Tiempo de Carrera</p>
              </div>
            </div>
          </div>
        )}

        {/* Clocks */}
        <div className={`p-6 ${getLayoutClass()}`}>
          {displayWaves.length === 0 ? (
            <div 
              className="text-center py-8"
              style={{ color: textColor }}
            >
              <p className="text-lg opacity-70">Sin relojes configurados</p>
              <p className="text-sm opacity-50">Configura la hora de salida en los eventos</p>
            </div>
          ) : (
            displayWaves.map((wave) => (
              <div 
                key={wave.id} 
                className="text-center"
                style={{ color: textColor }}
              >
                {/* Wave/Event Name */}
                <div className="mb-2">
                  <span 
                    className="text-sm font-medium uppercase tracking-wider opacity-70"
                  >
                    {wave.distance_name || wave.wave_name}
                  </span>
                </div>
                
                {/* Clock Display */}
                <div 
                  className={`font-mono font-bold tabular-nums ${getFontSizeClass()}`}
                  style={{
                    textShadow: theme === "dark" ? "0 0 20px rgba(255,255,255,0.2)" : "none"
                  }}
                >
                  {currentTimes[wave.id] || "--:--:--"}
                </div>
                
                {/* Status indicator */}
                {wave.start_time && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span 
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ 
                        backgroundColor: currentTimes[wave.id]?.startsWith("-") 
                          ? "#f59e0b" // amber for pending
                          : "#22c55e" // green for running
                      }}
                    />
                    <span className="text-xs opacity-60">
                      {currentTimes[wave.id]?.startsWith("-") ? "Salida pendiente" : "En carrera"}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Delay indicator */}
        {delay !== 0 && (
          <div 
            className="px-6 py-2 text-center text-xs opacity-50"
            style={{ 
              color: textColor,
              backgroundColor: `${bgColor}80`
            }}
          >
            Ajuste: {delay > 0 ? "+" : ""}{delay}s
          </div>
        )}
      </div>
    </div>
  );
};

export default RaceClockOverlay;