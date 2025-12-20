import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import "mapbox-gl/dist/mapbox-gl.css";
interface ResultRow {
  id: string;
  bib_number: number;
  first_name: string;
  last_name: string;
  overall_position: number | null;
  finish_time: string | null;
  status: string;
  gender: string | null;
  category?: string;
}

const LeaderboardOverlay = () => {
  const { raceId } = useParams();
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<ResultRow[]>([]);
  const [raceName, setRaceName] = useState("");
  
  // Config from URL params
  const rows = parseInt(searchParams.get("rows") || "10");
  const theme = searchParams.get("theme") || "dark";
  const showHeader = searchParams.get("header") !== "false";
  const animate = searchParams.get("animate") !== "false";
  const distanceFilter = searchParams.get("distance"); // Optional filter

  useEffect(() => {
    if (raceId) {
      fetchInitialData();
      setupRealtimeSubscription();
    }
  }, [raceId, distanceFilter]);

  const fetchInitialData = async () => {
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

      // Get results
      await fetchResults();
    } catch (error) {
      console.error("Error fetching initial data:", error);
    }
  };

  const fetchResults = async () => {
    let query = supabase
      .from("race_results")
      .select(`
        id,
        overall_position,
        finish_time,
        status,
        race_distance_id,
        registrations!inner (
          bib_number,
          user_id,
          race_id,
          guest_first_name,
          guest_last_name,
          profiles:user_id (
            first_name,
            last_name,
            gender
          )
        )
      `)
      .eq("registrations.race_id", raceId)
      .eq("status", "finished")
      .order("overall_position", { ascending: true })
      .limit(rows);

    // Apply distance filter if provided
    if (distanceFilter) {
      query = query.eq("race_distance_id", distanceFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching results:", error);
      return;
    }

    const formattedResults: ResultRow[] = (data || []).map((result: any) => {
      const reg = result.registrations;
      const profile = reg?.profiles;
      
      return {
        id: result.id,
        bib_number: reg?.bib_number || 0,
        first_name: profile?.first_name || reg?.guest_first_name || "",
        last_name: profile?.last_name || reg?.guest_last_name || "",
        overall_position: result.overall_position,
        finish_time: result.finish_time,
        status: result.status,
        gender: profile?.gender
      };
    });

    setResults(formattedResults);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`leaderboard-${raceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "race_results"
        },
        () => {
          fetchResults();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const formatTime = (time: string | null): string => {
    if (!time) return "--:--:--";
    
    // Parse interval format
    const match = time.match(/(\d+):(\d+):(\d+)/);
    if (match) {
      const [, hours, minutes, seconds] = match;
      if (hours === "00") {
        return `${minutes}:${seconds}`;
      }
      return `${hours}:${minutes}:${seconds}`;
    }
    return time;
  };

  const getPositionBadge = (pos: number | null) => {
    if (!pos) return null;
    
    if (pos === 1) return "🥇";
    if (pos === 2) return "🥈";
    if (pos === 3) return "🥉";
    return pos;
  };

  const isDark = theme === "dark";

  return (
    <div 
      className="w-full h-screen overflow-hidden p-8"
      style={{ 
        background: "transparent",
        fontFamily: "'Inter', 'Segoe UI', sans-serif"
      }}
    >
      <div 
        className={`max-w-2xl mx-auto rounded-2xl overflow-hidden shadow-2xl ${
          isDark ? "bg-black/80" : "bg-white/90"
        } backdrop-blur-xl`}
      >
        {/* Header */}
        {showHeader && (
          <div 
            className={`px-6 py-4 ${
              isDark 
                ? "bg-gradient-to-r from-yellow-600 to-orange-600" 
                : "bg-gradient-to-r from-yellow-400 to-orange-500"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <h2 className="text-xl font-bold text-white">{raceName}</h2>
                <p className="text-white/80 text-sm">Clasificación en vivo</p>
              </div>
            </div>
          </div>
        )}

        {/* Table Header */}
        <div 
          className={`grid grid-cols-12 gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-wider ${
            isDark ? "text-gray-400 bg-gray-900/50" : "text-gray-600 bg-gray-100"
          }`}
        >
          <div className="col-span-1 text-center">Pos</div>
          <div className="col-span-2 text-center">Dorsal</div>
          <div className="col-span-6">Nombre</div>
          <div className="col-span-3 text-right">Tiempo</div>
        </div>

        {/* Results */}
        <div className="divide-y divide-gray-800/30">
          <AnimatePresence mode="popLayout">
            {results.map((result, index) => (
              <motion.div
                key={result.id}
                initial={animate ? { opacity: 0, x: -20 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={animate ? { opacity: 0, x: 20 } : undefined}
                transition={{ delay: index * 0.05 }}
                layout
                className={`grid grid-cols-12 gap-2 px-6 py-4 items-center ${
                  isDark ? "text-white" : "text-gray-900"
                } ${index % 2 === 0 ? (isDark ? "bg-gray-900/30" : "bg-gray-50") : ""}`}
              >
                {/* Position */}
                <div className="col-span-1 text-center">
                  <span className="text-xl font-bold">
                    {getPositionBadge(result.overall_position)}
                  </span>
                </div>

                {/* Bib */}
                <div className="col-span-2 text-center">
                  <span 
                    className={`inline-flex items-center justify-center w-12 h-8 rounded font-mono font-bold ${
                      isDark ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  >
                    {result.bib_number}
                  </span>
                </div>

                {/* Name */}
                <div className="col-span-6 truncate">
                  <span className="font-semibold">
                    {result.first_name} {result.last_name}
                  </span>
                </div>

                {/* Time */}
                <div className="col-span-3 text-right">
                  <span className="font-mono text-lg font-semibold tabular-nums">
                    {formatTime(result.finish_time)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div 
          className={`px-6 py-3 text-center text-xs ${
            isDark ? "text-gray-500 bg-gray-900/50" : "text-gray-500 bg-gray-100"
          }`}
        >
          Actualización en tiempo real · Powered by Camberas
        </div>
      </div>
    </div>
  );
};

export default LeaderboardOverlay;
