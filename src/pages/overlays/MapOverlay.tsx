import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface RunnerPosition {
  registration_id: string;
  bib_number: number;
  runner_name: string;
  latitude: number;
  longitude: number;
  gps_timestamp: string;
}

const MapOverlay = () => {
  const { raceId } = useParams();
  const [searchParams] = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const [positions, setPositions] = useState<RunnerPosition[]>([]);
  const [gpxUrl, setGpxUrl] = useState<string | null>(null);
  
  // Config from URL params
  const theme = searchParams.get("theme") || "dark";
  const showRoute = searchParams.get("route") !== "false";
  const showLabels = searchParams.get("labels") !== "false";
  const zoom = parseInt(searchParams.get("zoom") || "12");
  const distanceFilter = searchParams.get("distance"); // Optional filter

  // Fetch Mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error("Error fetching Mapbox token:", error);
      }
    };
    fetchToken();
  }, []);

  // Fetch race or distance info for GPX
  useEffect(() => {
    const fetchGpx = async () => {
      if (distanceFilter) {
        // If filtering by distance, get that distance's GPX
        const { data } = await supabase
          .from("race_distances")
          .select("gpx_file_url")
          .eq("id", distanceFilter)
          .single();
        if (data?.gpx_file_url) setGpxUrl(data.gpx_file_url);
      } else if (raceId) {
        // Otherwise get first distance with GPX or race GPX
        const { data: raceData } = await supabase
          .from("races")
          .select("gpx_file_url")
          .eq("id", raceId)
          .single();
        if (raceData?.gpx_file_url) {
          setGpxUrl(raceData.gpx_file_url);
        } else {
          // Try first distance
          const { data: distanceData } = await supabase
            .from("race_distances")
            .select("gpx_file_url")
            .eq("race_id", raceId)
            .not("gpx_file_url", "is", null)
            .limit(1)
            .single();
          if (distanceData?.gpx_file_url) setGpxUrl(distanceData.gpx_file_url);
        }
      }
    };
    fetchGpx();
  }, [raceId, distanceFilter]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    const mapStyle = theme === "dark" 
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      zoom: zoom,
      center: [-3.7, 40.4], // Default to Spain, will be updated with data
      attributionControl: false
    });

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken, theme, zoom]);

  // Load GPX route
  useEffect(() => {
    if (!map.current || !gpxUrl || !showRoute) return;

    const loadGpx = async () => {
      try {
        const response = await fetch(gpxUrl);
        const gpxText = await response.text();
        
        // Parse GPX
        const parser = new DOMParser();
        const gpxDoc = parser.parseFromString(gpxText, "text/xml");
        const trackPoints = gpxDoc.querySelectorAll("trkpt");
        
        const coordinates: [number, number][] = [];
        trackPoints.forEach((point) => {
          const lat = parseFloat(point.getAttribute("lat") || "0");
          const lon = parseFloat(point.getAttribute("lon") || "0");
          coordinates.push([lon, lat]);
        });

        if (coordinates.length === 0) return;

        // Wait for map to load
        map.current?.on("load", () => {
          if (!map.current) return;

          // Add route source
          map.current.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates
              }
            }
          });

          // Add route layer
          map.current.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: {
              "line-join": "round",
              "line-cap": "round"
            },
            paint: {
              "line-color": "#3b82f6",
              "line-width": 4,
              "line-opacity": 0.8
            }
          });

          // Fit to route bounds
          const bounds = new mapboxgl.LngLatBounds();
          coordinates.forEach(coord => bounds.extend(coord));
          map.current.fitBounds(bounds, { padding: 50 });
        });
      } catch (error) {
        console.error("Error loading GPX:", error);
      }
    };

    loadGpx();
  }, [gpxUrl, showRoute]);

  // Fetch initial positions
  useEffect(() => {
    if (!raceId) return;

    const fetchPositions = async () => {
      const { data, error } = await supabase.rpc("get_live_gps_positions", {
        p_race_id: raceId,
        p_distance_id: distanceFilter || null
      });

      if (error) {
        console.error("Error fetching positions:", error);
        return;
      }

      setPositions(data || []);
    };

    fetchPositions();

    // Setup realtime subscription
    const channel = supabase
      .channel(`map-overlay-${raceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gps_tracking",
          filter: `race_id=eq.${raceId}`
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, distanceFilter]);

  // Update markers when positions change
  useEffect(() => {
    if (!map.current) return;

    positions.forEach((pos) => {
      const existingMarker = markers.current.get(pos.registration_id);

      if (existingMarker) {
        // Update existing marker position
        existingMarker.setLngLat([pos.longitude, pos.latitude]);
      } else {
        // Create new marker
        const el = document.createElement("div");
        el.className = "runner-marker";
        el.innerHTML = `
          <div class="relative">
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs shadow-lg">
              ${pos.bib_number}
            </div>
            ${showLabels ? `
              <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                ${pos.runner_name.split(" ")[0]}
              </div>
            ` : ""}
          </div>
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([pos.longitude, pos.latitude])
          .addTo(map.current!);

        markers.current.set(pos.registration_id, marker);
      }
    });

    // Center map on runners if we have positions
    if (positions.length > 0 && map.current) {
      const bounds = new mapboxgl.LngLatBounds();
      positions.forEach(pos => {
        bounds.extend([pos.longitude, pos.latitude]);
      });
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 15 });
    }
  }, [positions, showLabels]);

  if (!mapboxToken) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-transparent">
        <div className="text-white/50">Cargando mapa...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden" style={{ background: "transparent" }}>
      <div ref={mapContainer} className="w-full h-full" />
      
      <style>{`
        .runner-marker {
          cursor: pointer;
          z-index: 10;
        }
        .runner-marker:hover {
          z-index: 20;
        }
        .mapboxgl-ctrl-logo,
        .mapboxgl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default MapOverlay;
