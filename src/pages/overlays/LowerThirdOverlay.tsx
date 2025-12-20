import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface RunnerData {
  bib_number: number;
  first_name: string;
  last_name: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  finish_time: string | null;
  status: string;
  team?: string;
  category?: string;
}

const LowerThirdOverlay = () => {
  const { raceId } = useParams();
  const [searchParams] = useSearchParams();
  const [currentRunner, setCurrentRunner] = useState<RunnerData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [raceName, setRaceName] = useState("");
  
  // Config from URL params
  const theme = searchParams.get("theme") || "dark";
  const position = searchParams.get("position") || "bottom-left";
  const bibNumber = searchParams.get("bib");
  const autoHide = parseInt(searchParams.get("autoHide") || "0");

  // Fetch runner by bib number
  const fetchRunner = useCallback(async (bib: string) => {
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          bib_number,
          user_id,
          guest_first_name,
          guest_last_name,
          race_id,
          profiles:user_id (
            first_name,
            last_name,
            team,
            club
          ),
          race_results (
            overall_position,
            gender_position,
            category_position,
            finish_time,
            status
          )
        `)
        .eq("race_id", raceId)
        .eq("bib_number", parseInt(bib))
        .single();

      if (error) throw error;

      if (data) {
        const profile = data.profiles as any;
        const result = Array.isArray(data.race_results) ? data.race_results[0] : data.race_results;

        setCurrentRunner({
          bib_number: data.bib_number || 0,
          first_name: profile?.first_name || data.guest_first_name || "",
          last_name: profile?.last_name || data.guest_first_name || "",
          overall_position: result?.overall_position || null,
          gender_position: result?.gender_position || null,
          category_position: result?.category_position || null,
          finish_time: result?.finish_time || null,
          status: result?.status || "in_progress",
          team: profile?.team || profile?.club || ""
        });
        setIsVisible(true);

        if (autoHide > 0) {
          setTimeout(() => setIsVisible(false), autoHide * 1000);
        }
      }
    } catch (error) {
      console.error("Error fetching runner:", error);
    }
  }, [raceId, autoHide]);

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
      // Fetch race name
      supabase
        .from("races")
        .select("name")
        .eq("id", raceId)
        .single()
        .then(({ data }) => {
          if (data) setRaceName(data.name);
        });
    }
  }, [raceId]);

  useEffect(() => {
    if (bibNumber) {
      fetchRunner(bibNumber);
    } else {
      // Show demo runner when no bib specified
      setCurrentRunner({
        bib_number: 123,
        first_name: "Demo",
        last_name: "Runner",
        overall_position: 1,
        gender_position: 1,
        category_position: 1,
        finish_time: "01:23:45",
        status: "finished",
        team: "Equipo Demo"
      });
      setIsVisible(true);
    }
  }, [bibNumber, fetchRunner]);

  // Listen for external commands via broadcast channel
  useEffect(() => {
    const channel = supabase
      .channel(`lower-third-control-${raceId}`)
      .on("broadcast", { event: "show-runner" }, ({ payload }) => {
        if (payload?.bib) {
          fetchRunner(payload.bib.toString());
        }
      })
      .on("broadcast", { event: "hide" }, () => {
        setIsVisible(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, fetchRunner]);

  const formatTime = (time: string | null): string => {
    if (!time) return "--:--:--";
    const match = time.match(/(\d+):(\d+):(\d+)/);
    if (match) {
      const [, hours, minutes, seconds] = match;
      if (hours === "00") return `${minutes}:${seconds}`;
      return `${hours}:${minutes}:${seconds}`;
    }
    return time;
  };

  const getPositionClass = () => {
    switch (position) {
      case "bottom-left": return "bottom-16 left-8";
      case "bottom-right": return "bottom-16 right-8";
      case "top-left": return "top-16 left-8";
      case "top-right": return "top-16 right-8";
      default: return "bottom-16 left-8";
    }
  };

  const isDark = theme === "dark";

  return (
    <div 
      className="w-full h-screen overflow-hidden relative"
      style={{ background: "transparent" }}
    >
      <AnimatePresence>
        {isVisible && currentRunner && (
          <motion.div
            className={`absolute ${getPositionClass()}`}
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            <div 
              className={`flex items-stretch rounded-lg overflow-hidden shadow-2xl ${
                isDark ? "bg-black/90" : "bg-white/95"
              } backdrop-blur-xl`}
              style={{ 
                minWidth: "400px",
                fontFamily: "'Inter', 'Segoe UI', sans-serif"
              }}
            >
              {/* Bib Number Section */}
              <div 
                className="flex items-center justify-center px-6 py-4 bg-gradient-to-br from-primary to-primary/80"
                style={{ minWidth: "100px" }}
              >
                <span className="text-4xl font-black text-white">
                  {currentRunner.bib_number}
                </span>
              </div>

              {/* Info Section */}
              <div className="flex-1 px-6 py-4">
                <div className="flex items-center gap-2">
                  <h3 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {currentRunner.first_name} {currentRunner.last_name}
                  </h3>
                  {currentRunner.overall_position && currentRunner.overall_position <= 3 && (
                    <span className="text-2xl">
                      {currentRunner.overall_position === 1 && "🥇"}
                      {currentRunner.overall_position === 2 && "🥈"}
                      {currentRunner.overall_position === 3 && "🥉"}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 mt-1">
                  {currentRunner.team && (
                    <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {currentRunner.team}
                    </span>
                  )}
                  <span className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                    {raceName}
                  </span>
                </div>
              </div>

              {/* Stats Section */}
              <div 
                className={`flex flex-col justify-center px-6 py-4 border-l ${
                  isDark ? "border-gray-700" : "border-gray-200"
                }`}
              >
                {currentRunner.overall_position && (
                  <div className="text-center">
                    <span className={`text-xs uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      Pos
                    </span>
                    <div className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {currentRunner.overall_position}º
                    </div>
                  </div>
                )}
              </div>

              {/* Time Section */}
              <div 
                className={`flex flex-col justify-center px-6 py-4 ${
                  isDark ? "bg-gray-900/50" : "bg-gray-100"
                }`}
              >
                <span className={`text-xs uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  Tiempo
                </span>
                <div className={`text-2xl font-mono font-bold tabular-nums ${isDark ? "text-white" : "text-gray-900"}`}>
                  {formatTime(currentRunner.finish_time)}
                </div>
              </div>
            </div>

            {/* Accent Line */}
            <div className="h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent rounded-b-lg" />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default LowerThirdOverlay;
