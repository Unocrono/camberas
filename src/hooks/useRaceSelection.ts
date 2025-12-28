import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataRefresh } from "./useDataRefresh";

const STORAGE_KEY_ADMIN = "admin_selected_race";
const STORAGE_KEY_ORGANIZER = "organizer_selected_race";

interface Race {
  id: string;
  name: string;
  date: string;
  race_type: string;
}

interface Distance {
  id: string;
  name: string;
  distance_km: number;
}

interface UseRaceSelectionOptions {
  type: "admin" | "organizer";
  userId?: string;
}

export const useRaceSelection = ({ type, userId }: UseRaceSelectionOptions) => {
  const storageKey = type === "admin" ? STORAGE_KEY_ADMIN : STORAGE_KEY_ORGANIZER;
  
  const [selectedRaceId, setSelectedRaceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey) || "";
    }
    return "";
  });
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<Distance[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);

  // Persist selection to localStorage
  useEffect(() => {
    if (selectedRaceId) {
      localStorage.setItem(storageKey, selectedRaceId);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [selectedRaceId, storageKey]);

  // Fetch races
  const fetchRaces = useCallback(async () => {
    setLoadingRaces(true);
    try {
      let query = supabase
        .from("races")
        .select("id, name, date, race_type")
        .order("date", { ascending: false });

      // For organizers, filter by their user ID
      if (type === "organizer" && userId) {
        query = query.eq("organizer_id", userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const fetchedRaces = data || [];
      setRaces(fetchedRaces);
      
      // Validate stored selection exists in fetched races
      if (selectedRaceId && !fetchedRaces.some(r => r.id === selectedRaceId)) {
        setSelectedRaceId("");
      }
    } catch (error) {
      console.error("Error fetching races:", error);
    } finally {
      setLoadingRaces(false);
    }
  }, [type, userId, selectedRaceId]);

  // Fetch distances when race changes
  const fetchDistances = useCallback(async () => {
    if (!selectedRaceId) {
      setDistances([]);
      setSelectedDistanceId("");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRaceId)
        .order("distance_km", { ascending: false });

      if (error) throw error;
      setDistances(data || []);
    } catch (error) {
      console.error("Error fetching distances:", error);
    }
  }, [selectedRaceId]);

  // Listen for refresh events
  useDataRefresh(["races"], fetchRaces);
  useDataRefresh(["distances"], fetchDistances);

  useEffect(() => {
    if (type === "admin" || (type === "organizer" && userId)) {
      fetchRaces();
    }
  }, [type, userId, fetchRaces]);

  useEffect(() => {
    fetchDistances();
  }, [selectedRaceId, fetchDistances]);

  const selectedRace = races.find(r => r.id === selectedRaceId);

  const clearSelection = useCallback(() => {
    setSelectedRaceId("");
    setSelectedDistanceId("");
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    selectedRaceId,
    setSelectedRaceId,
    selectedDistanceId,
    setSelectedDistanceId,
    races,
    distances,
    selectedRace,
    loadingRaces,
    clearSelection,
    refetchRaces: fetchRaces,
    refetchDistances: fetchDistances,
  };
};
