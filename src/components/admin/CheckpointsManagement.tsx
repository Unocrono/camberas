import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Pencil, Map as MapIcon, Navigation, Upload, FileUp, Flag, FlagTriangleRight, Clock, RefreshCw } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { parseGpxFile, calculateHaversineDistance as gpxCalcDistance, calculateTrackDistance } from "@/lib/gpxParser";

interface Checkpoint {
  id: string;
  name: string;
  lugar: string | null;
  checkpoint_order: number;
  distance_km: number;
  race_id: string;
  race_distance_id: string | null;
  latitude: number | null;
  longitude: number | null;
  timing_point_id: string | null;
  checkpoint_type: string;
  geofence_radius: number | null;
  min_time: unknown;
  max_time: unknown;
  min_lap_time: unknown;
  expected_laps: number | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface TimingPoint {
  id: string;
  name: string;
  notes: string | null;
  point_order: number | null;
}

interface CheckpointsManagementProps {
  selectedRaceId: string;
  selectedDistanceId: string;
}

interface GpxWaypoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  desc?: string;
  selected: boolean;
  distanceKm?: number;
}

interface GpxRoutePoint {
  lat: number;
  lon: number;
  cumulativeDistance: number;
}

export function CheckpointsManagement({ selectedRaceId, selectedDistanceId }: CheckpointsManagementProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [allDistances, setAllDistances] = useState<RaceDistance[]>([]);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isGpxDialogOpen, setIsGpxDialogOpen] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showFormMap, setShowFormMap] = useState(false);
  const [gpxWaypoints, setGpxWaypoints] = useState<GpxWaypoint[]>([]);
  const [importingGpx, setImportingGpx] = useState(false);
  const [gpxRoute, setGpxRoute] = useState<GpxRoutePoint[]>([]);
  const [distanceGpxUrl, setDistanceGpxUrl] = useState<string | null>(null);
  const [gpxPreviewRoute, setGpxPreviewRoute] = useState<GpxRoutePoint[]>([]);
  const [recalculatingDistances, setRecalculatingDistances] = useState(false);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const formMapContainer = useRef<HTMLDivElement>(null);
  const gpxPreviewMapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const formMap = useRef<mapboxgl.Map | null>(null);
  const gpxPreviewMap = useRef<mapboxgl.Map | null>(null);
  const formMarker = useRef<mapboxgl.Marker | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const gpxPreviewMarkers = useRef<mapboxgl.Marker[]>([]);
  const gpxFileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    lugar: "",
    checkpoint_order: 1,
    distance_km: 0,
    latitude: "",
    longitude: "",
    timing_point_id: "",
    geofence_radius: 50,
    checkpoint_type: "CONTROL",
    min_time: "",
    max_time: "",
    min_lap_time: "",
    expected_laps: 1,
  });
  const [isCreatingTimingPoint, setIsCreatingTimingPoint] = useState(false);
  const [newTimingPointName, setNewTimingPointName] = useState("");

  useEffect(() => {
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    if (selectedRaceId) {
      fetchAllDistances();
      fetchTimingPoints();
    }
  }, [selectedRaceId]);

  useEffect(() => {
    if (selectedDistanceId) {
      fetchCheckpoints();
      fetchDistanceGpx();
    } else {
      setGpxRoute([]);
      setDistanceGpxUrl(null);
    }
  }, [selectedDistanceId]);

  useEffect(() => {
    if (showMap && mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [showMap, mapboxToken]);

  useEffect(() => {
    if (map.current && checkpoints.length > 0) {
      updateMapMarkers();
    }
  }, [checkpoints, map.current]);

  useEffect(() => {
    if (map.current && gpxRoute.length > 0) {
      drawGpxRoute();
    }
  }, [gpxRoute, map.current]);

  useEffect(() => {
    if (showFormMap && mapboxToken && formMapContainer.current && !formMap.current) {
      initializeFormMap();
    }
    return () => {
      if (formMap.current && !showFormMap) {
        formMap.current.remove();
        formMap.current = null;
        formMarker.current = null;
      }
    };
  }, [showFormMap, mapboxToken]);

  useEffect(() => {
    if (!isDialogOpen) {
      setShowFormMap(false);
      if (formMap.current) {
        formMap.current.remove();
        formMap.current = null;
        formMarker.current = null;
      }
    }
  }, [isDialogOpen]);

  // Initialize GPX preview map when dialog opens with waypoints
  useEffect(() => {
    if (isGpxDialogOpen && mapboxToken && gpxPreviewMapContainer.current && !gpxPreviewMap.current && gpxWaypoints.length > 0) {
      initializeGpxPreviewMap();
    }
    return () => {
      if (!isGpxDialogOpen && gpxPreviewMap.current) {
        gpxPreviewMap.current.remove();
        gpxPreviewMap.current = null;
        gpxPreviewMarkers.current.forEach(m => m.remove());
        gpxPreviewMarkers.current = [];
      }
    };
  }, [isGpxDialogOpen, mapboxToken, gpxWaypoints]);

  // Update preview markers when waypoints selection changes
  useEffect(() => {
    if (gpxPreviewMap.current && gpxWaypoints.length > 0) {
      updateGpxPreviewMarkers();
    }
  }, [gpxWaypoints]);

  const fetchMapboxToken = async () => {
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

  const fetchDistanceGpx = async () => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("gpx_file_url")
        .eq("id", selectedDistanceId)
        .single();

      if (error) throw error;
      
      if (data?.gpx_file_url) {
        setDistanceGpxUrl(data.gpx_file_url);
        await parseGpxRoute(data.gpx_file_url);
      } else {
        setDistanceGpxUrl(null);
        setGpxRoute([]);
      }
    } catch (error) {
      console.error("Error fetching distance GPX:", error);
    }
  };

  const parseGpxRoute = async (url: string) => {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const gpx = parseGpxFile(text);

      if (gpx.tracks.length === 0) {
        console.log("No tracks found in GPX");
        return;
      }

      const track = gpx.tracks[0];
      const points: GpxRoutePoint[] = [];
      let cumulativeDistance = 0;

      track.points.forEach((point, index) => {
        if (index > 0) {
          const prevPoint = track.points[index - 1];
          cumulativeDistance += calculateHaversineDistance(
            prevPoint.lat,
            prevPoint.lon,
            point.lat,
            point.lon
          );
        }
        points.push({
          lat: point.lat,
          lon: point.lon,
          cumulativeDistance,
        });
      });

      setGpxRoute(points);
    } catch (error) {
      console.error("Error parsing GPX route:", error);
    }
  };

  // Calculate distance between two points using Haversine formula
  const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Find the closest point on the route and return its cumulative distance
  const findDistanceOnRoute = (lat: number, lon: number): number => {
    if (gpxRoute.length === 0) return 0;

    let closestDistance = Infinity;
    let resultKm = 0;

    gpxRoute.forEach((point) => {
      const dist = calculateHaversineDistance(lat, lon, point.lat, point.lon);
      if (dist < closestDistance) {
        closestDistance = dist;
        resultKm = point.cumulativeDistance;
      }
    });

    return Math.round(resultKm * 1000) / 1000; // Round to 3 decimal places
  };

  const drawGpxRoute = () => {
    if (!map.current || gpxRoute.length === 0) return;

    const coordinates = gpxRoute.map((p) => [p.lon, p.lat]);

    // Remove existing gpx-route layer and source
    if (map.current.getLayer("gpx-route")) {
      map.current.removeLayer("gpx-route");
    }
    if (map.current.getSource("gpx-route")) {
      map.current.removeSource("gpx-route");
    }

    map.current.addSource("gpx-route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    });

    map.current.addLayer({
      id: "gpx-route",
      type: "line",
      source: "gpx-route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#3b82f6",
        "line-width": 4,
        "line-opacity": 0.7,
      },
    });
  };

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-3.7038, 40.4168], // Madrid por defecto
      zoom: 10,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      if (gpxRoute.length > 0) {
        drawGpxRoute();
      }
      updateMapMarkers();
    });
  };

  const initializeFormMap = () => {
    if (!formMapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    const initialLat = formData.latitude ? parseFloat(formData.latitude) : 40.4168;
    const initialLng = formData.longitude ? parseFloat(formData.longitude) : -3.7038;

    formMap.current = new mapboxgl.Map({
      container: formMapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [initialLng, initialLat],
      zoom: formData.latitude && formData.longitude ? 14 : 6,
    });

    formMap.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add marker if coordinates exist
    if (formData.latitude && formData.longitude) {
      formMarker.current = new mapboxgl.Marker({ color: "hsl(var(--primary))" })
        .setLngLat([initialLng, initialLat])
        .addTo(formMap.current);
    }

    // Handle click to set coordinates
    formMap.current.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      
      setFormData((prev) => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }));

      // Update or create marker
      if (formMarker.current) {
        formMarker.current.setLngLat([lng, lat]);
      } else if (formMap.current) {
        formMarker.current = new mapboxgl.Marker({ color: "hsl(var(--primary))" })
          .setLngLat([lng, lat])
          .addTo(formMap.current);
      }
    });
  };

  const initializeGpxPreviewMap = () => {
    if (!gpxPreviewMapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    // Calculate center from waypoints
    let centerLat = 40.4168;
    let centerLng = -3.7038;
    
    if (gpxWaypoints.length > 0) {
      centerLat = gpxWaypoints.reduce((sum, wp) => sum + wp.lat, 0) / gpxWaypoints.length;
      centerLng = gpxWaypoints.reduce((sum, wp) => sum + wp.lon, 0) / gpxWaypoints.length;
    }

    gpxPreviewMap.current = new mapboxgl.Map({
      container: gpxPreviewMapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [centerLng, centerLat],
      zoom: 10,
    });

    gpxPreviewMap.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    gpxPreviewMap.current.on("load", () => {
      // Draw the track if exists
      if (gpxPreviewRoute.length > 0) {
        const coordinates = gpxPreviewRoute.map((p) => [p.lon, p.lat]);
        
        gpxPreviewMap.current!.addSource("gpx-preview-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });

        gpxPreviewMap.current!.addLayer({
          id: "gpx-preview-route",
          type: "line",
          source: "gpx-preview-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#3b82f6",
            "line-width": 4,
            "line-opacity": 0.7,
          },
        });
      }

      updateGpxPreviewMarkers();
      
      // Fit bounds to show everything
      const bounds = new mapboxgl.LngLatBounds();
      
      gpxWaypoints.forEach((wp) => {
        bounds.extend([wp.lon, wp.lat]);
      });
      
      gpxPreviewRoute.forEach((point) => {
        bounds.extend([point.lon, point.lat]);
      });
      
      if (!bounds.isEmpty()) {
        gpxPreviewMap.current!.fitBounds(bounds, { padding: 40 });
      }
    });
  };

  const updateGpxPreviewMarkers = () => {
    if (!gpxPreviewMap.current) return;

    // Clear existing markers
    gpxPreviewMarkers.current.forEach((marker) => marker.remove());
    gpxPreviewMarkers.current = [];

    gpxWaypoints.forEach((wp, index) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${wp.selected ? 'hsl(142, 76%, 36%)' : 'hsl(0, 0%, 60%)'};
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 10px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: background 0.2s;
      `;
      el.innerText = (index + 1).toString();

      const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
        <div style="padding: 4px;">
          <strong>${wp.name}</strong>
          <br><span style="font-size: 11px;">Km ${wp.distanceKm?.toFixed(2) || 0}</span>
          ${wp.ele ? `<br><span style="font-size: 11px;">${wp.ele.toFixed(0)}m</span>` : ''}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([wp.lon, wp.lat])
        .setPopup(popup)
        .addTo(gpxPreviewMap.current!);

      gpxPreviewMarkers.current.push(marker);
    });
  };

  const updateMapMarkers = () => {
    if (!map.current) return;

    // Limpiar marcadores existentes
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const checkpointsWithCoords = checkpoints.filter(
      (cp) => cp.latitude !== null && cp.longitude !== null
    );

    // Añadir marcadores si hay checkpoints con coordenadas
    checkpointsWithCoords.forEach((checkpoint) => {
      const el = document.createElement("div");
      el.className = "checkpoint-marker";
      el.style.cssText = `
        width: 30px;
        height: 30px;
        background: hsl(var(--primary));
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      el.innerText = checkpoint.checkpoint_order.toString();

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <strong>${checkpoint.name}</strong>
          ${checkpoint.lugar ? `<br><span style="color: #666;">${checkpoint.lugar}</span>` : ""}
          <br><span style="font-size: 12px;">Km ${checkpoint.distance_km}</span>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([checkpoint.longitude!, checkpoint.latitude!])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.push(marker);
    });

    // Dibujar línea entre checkpoints
    if (checkpointsWithCoords.length > 1) {
      const coordinates = checkpointsWithCoords
        .sort((a, b) => a.checkpoint_order - b.checkpoint_order)
        .map((cp) => [cp.longitude!, cp.latitude!]);

      if (map.current.getSource("route")) {
        (map.current.getSource("route") as mapboxgl.GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        });
      } else {
        map.current.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });

        map.current.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "hsl(var(--primary))",
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        });
      }
    }

    // Ajustar vista a los checkpoints y/o ruta GPX
    const bounds = new mapboxgl.LngLatBounds();
    
    // Incluir checkpoints en los bounds
    checkpointsWithCoords.forEach((cp) => {
      bounds.extend([cp.longitude!, cp.latitude!]);
    });
    
    // Incluir ruta GPX en los bounds si existe
    if (gpxRoute.length > 0) {
      gpxRoute.forEach((point) => {
        bounds.extend([point.lon, point.lat]);
      });
    }
    
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  const fetchAllDistances = async () => {
    const { data, error } = await supabase
      .from("race_distances")
      .select("id, name, distance_km")
      .eq("race_id", selectedRaceId)
      .order("distance_km");

    if (error) {
      console.error("Error fetching distances:", error);
    } else {
      setAllDistances(data || []);
    }
  };

  const fetchTimingPoints = async () => {
    const { data, error } = await supabase
      .from("timing_points")
      .select("id, name, notes, point_order")
      .eq("race_id", selectedRaceId)
      .order("point_order", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Error fetching timing points:", error);
    } else {
      setTimingPoints(data || []);
    }
  };

  const fetchCheckpoints = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("race_checkpoints")
      .select("*")
      .eq("race_distance_id", selectedDistanceId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Error al cargar puntos de control");
      console.error(error);
      setCheckpoints([]);
    } else {
      setCheckpoints(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      lugar: "",
      checkpoint_order: checkpoints.length + 1,
      distance_km: 0,
      latitude: "",
      longitude: "",
      timing_point_id: "",
      geofence_radius: 50,
      checkpoint_type: "CONTROL",
      min_time: "",
      max_time: "",
      min_lap_time: "",
      expected_laps: 1,
    });
    setSelectedCheckpoint(null);
    setIsEditing(false);
    setIsCreatingTimingPoint(false);
    setNewTimingPointName("");
  };

  // Función para formatear interval a string HH:MM:SS
  const intervalToString = (interval: unknown): string => {
    if (!interval) return "";
    const strVal = String(interval);
    // Si ya es formato HH:MM:SS, retornar
    if (/^\d{2}:\d{2}:\d{2}$/.test(strVal)) return strVal;
    // Si viene de PostgreSQL como "01:30:00" o similar
    const match = strVal.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}:${match[3]}`;
    return "";
  };

  // Función para crear un nuevo timing_point con nombre y coordenadas del checkpoint
  const handleCreateTimingPoint = async () => {
    // Obtener el orden máximo actual
    const maxOrder = timingPoints.reduce((max, tp) => Math.max(max, tp.point_order || 0), 0);

    // Usar nombre del checkpoint + " PC" como nombre del timing point
    const checkpointName = formData.name.trim() || newTimingPointName.trim();
    if (!checkpointName) {
      toast.error("Primero ingresa el nombre del punto de control");
      return;
    }

    // Generar nombre para el timing point
    let tpName = `${checkpointName} PC`;
    if (formData.checkpoint_type === "START") {
      tpName = "START";
    } else if (formData.checkpoint_type === "FINISH") {
      tpName = "FINISH";
    }

    // Obtener coordenadas del formulario
    const lat = formData.latitude ? parseFloat(formData.latitude) : null;
    const lng = formData.longitude ? parseFloat(formData.longitude) : null;

    const { data, error } = await supabase
      .from("timing_points")
      .insert({
        race_id: selectedRaceId,
        name: tpName,
        notes: checkpointName !== tpName ? checkpointName : null,
        point_order: maxOrder + 1,
        latitude: lat,
        longitude: lng,
      })
      .select()
      .single();

    if (error) {
      toast.error("Error al crear punto de cronometraje");
      console.error(error);
      return;
    }

    const coordMsg = lat && lng ? ` con coordenadas (${lat.toFixed(4)}, ${lng.toFixed(4)})` : "";
    toast.success(`Punto de cronometraje "${tpName}" creado${coordMsg}`);
    setTimingPoints([...timingPoints, data]);
    setFormData({ ...formData, timing_point_id: data.id });
    setIsCreatingTimingPoint(false);
    setNewTimingPointName("");
  };

  const handleOpenDialog = (checkpoint?: Checkpoint) => {
    if (checkpoint) {
      setFormData({
        name: checkpoint.name,
        lugar: checkpoint.lugar || "",
        checkpoint_order: checkpoint.checkpoint_order,
        distance_km: checkpoint.distance_km,
        latitude: checkpoint.latitude?.toString() || "",
        longitude: checkpoint.longitude?.toString() || "",
        timing_point_id: checkpoint.timing_point_id || "",
        geofence_radius: checkpoint.geofence_radius || 50,
        checkpoint_type: checkpoint.checkpoint_type || "CONTROL",
        min_time: intervalToString(checkpoint.min_time),
        max_time: intervalToString(checkpoint.max_time),
        min_lap_time: intervalToString(checkpoint.min_lap_time),
        expected_laps: checkpoint.expected_laps || 1,
      });
      setSelectedCheckpoint(checkpoint);
      setIsEditing(true);
    } else {
      resetForm();
      setFormData((prev) => ({
        ...prev,
        checkpoint_order: checkpoints.length + 1,
      }));
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const latitude = formData.latitude ? parseFloat(formData.latitude) : null;
    const longitude = formData.longitude ? parseFloat(formData.longitude) : null;
    const timing_point_id = formData.timing_point_id || null;
    
    // Convertir tiempos a formato interval o null
    const min_time = formData.min_time && /^\d{2}:\d{2}:\d{2}$/.test(formData.min_time) ? formData.min_time : null;
    const max_time = formData.max_time && /^\d{2}:\d{2}:\d{2}$/.test(formData.max_time) ? formData.max_time : null;
    const min_lap_time = formData.min_lap_time && /^\d{2}:\d{2}:\d{2}$/.test(formData.min_lap_time) ? formData.min_lap_time : null;

    if (isEditing && selectedCheckpoint) {
      const { error } = await supabase
        .from("race_checkpoints")
        .update({
          name: formData.name,
          lugar: formData.lugar || null,
          checkpoint_order: formData.checkpoint_order,
          distance_km: formData.distance_km,
          latitude,
          longitude,
          timing_point_id,
          geofence_radius: formData.geofence_radius,
          checkpoint_type: formData.checkpoint_type,
          min_time,
          max_time,
          min_lap_time,
          expected_laps: formData.expected_laps,
        })
        .eq("id", selectedCheckpoint.id);

      if (error) {
        toast.error("Error al actualizar el punto de control");
        console.error(error);
        return;
      }

      toast.success("Punto de control actualizado");
    } else {
      const { error } = await supabase
        .from("race_checkpoints")
        .insert({
          race_id: selectedRaceId,
          race_distance_id: selectedDistanceId,
          name: formData.name,
          lugar: formData.lugar || null,
          checkpoint_order: formData.checkpoint_order,
          distance_km: formData.distance_km,
          latitude,
          longitude,
          timing_point_id,
          geofence_radius: formData.geofence_radius,
          checkpoint_type: formData.checkpoint_type,
          min_time,
          max_time,
          min_lap_time,
          expected_laps: formData.expected_laps,
        });

      if (error) {
        toast.error("Error al crear el punto de control");
        console.error(error);
        return;
      }

      toast.success("Punto de control creado");
    }

    setIsDialogOpen(false);
    resetForm();
    fetchCheckpoints();
  };

  const handleDeleteClick = (checkpoint: Checkpoint) => {
    setSelectedCheckpoint(checkpoint);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCheckpoint) return;

    const { error } = await supabase
      .from("race_checkpoints")
      .delete()
      .eq("id", selectedCheckpoint.id);

    if (error) {
      toast.error("Error al eliminar el punto de control");
      console.error(error);
      return;
    }

    toast.success("Punto de control eliminado");
    setIsDeleteDialogOpen(false);
    setSelectedCheckpoint(null);
    fetchCheckpoints();
  };

  const handleGpxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("Processing GPX file:", file.name);

    try {
      const text = await file.text();
      console.log("GPX content length:", text.length);
      
      // Use custom GPX parser
      const gpx = parseGpxFile(text);
      console.log("Parsed GPX:", { waypoints: gpx.waypoints.length, tracks: gpx.tracks.length });

      // Try to get waypoints first
      let waypoints: GpxWaypoint[] = [];
      
      // Filter valid waypoints (not 0,0 coordinates)
      const validWaypoints = gpx.waypoints.filter(wp => 
        wp.lat !== 0 && wp.lon !== 0 && !isNaN(wp.lat) && !isNaN(wp.lon)
      );
      console.log("Valid waypoints:", validWaypoints.length);
      
      // Build route points from track for distance calculation
      let importedRoutePoints: GpxRoutePoint[] = [];
      let totalTrackDistance = 0;
      
      if (gpx.tracks.length > 0) {
        const track = gpx.tracks[0];
        console.log("Building route from track with", track.points.length, "points");
        let cumulativeDist = 0;
        
        track.points.forEach((point, index) => {
          if (index > 0) {
            const prevPoint = track.points[index - 1];
            cumulativeDist += calculateHaversineDistance(
              prevPoint.lat,
              prevPoint.lon,
              point.lat,
              point.lon
            );
          }
          importedRoutePoints.push({
            lat: point.lat,
            lon: point.lon,
            cumulativeDistance: cumulativeDist,
          });
        });
        totalTrackDistance = cumulativeDist;
        console.log("Track total distance:", totalTrackDistance, "km");
      }
      
      // Helper function to find distance along imported route
      const findDistanceOnImportedRoute = (lat: number, lon: number): number => {
        if (importedRoutePoints.length === 0) return 0;
        
        let closestDistance = Infinity;
        let resultKm = 0;
        
        importedRoutePoints.forEach((point) => {
          const dist = calculateHaversineDistance(lat, lon, point.lat, point.lon);
          if (dist < closestDistance) {
            closestDistance = dist;
            resultKm = point.cumulativeDistance;
          }
        });
        
        return Math.round(resultKm * 1000) / 1000;
      };
      
      // Process waypoints with distances calculated from imported track
      if (validWaypoints.length > 0) {
        waypoints = validWaypoints.map((wp) => {
          // Prefer imported route, then existing gpxRoute, then 0
          const distanceKm = importedRoutePoints.length > 0 
            ? findDistanceOnImportedRoute(wp.lat, wp.lon)
            : (gpxRoute.length > 0 ? findDistanceOnRoute(wp.lat, wp.lon) : 0);
          return {
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            ele: wp.ele,
            desc: wp.desc || wp.cmt || "",
            selected: true,
            distanceKm,
          };
        });
      }
      
      // Always try to add Salida and Meta from track if they don't exist in waypoints
      if (gpx.tracks.length > 0 && importedRoutePoints.length > 0) {
        const firstPoint = importedRoutePoints[0];
        const lastPoint = importedRoutePoints[importedRoutePoints.length - 1];
        
        console.log("First point:", firstPoint.lat, firstPoint.lon);
        console.log("Last point:", lastPoint.lat, lastPoint.lon);
        
        // Check if Salida exists (by name only, not by distance since all might be 0)
        const hasSalida = waypoints.some(wp => {
          const name = wp.name.toLowerCase();
          return name.includes('salida') || 
            name.includes('start') ||
            name.includes('inicio') ||
            name === 'sal' ||
            name === 's';
        });
        
        // Check if Meta exists (by name only)
        const hasMeta = waypoints.some(wp => {
          const name = wp.name.toLowerCase();
          return name.includes('meta') || 
            name.includes('finish') ||
            name.includes('llegada') ||
            name.includes('end') ||
            name.includes('fin') ||
            name === 'm';
        });
        
        console.log("Has Salida:", hasSalida, "Has Meta:", hasMeta);
        
        // Add Salida if not present
        if (!hasSalida) {
          waypoints.unshift({
            name: "Salida",
            lat: firstPoint.lat,
            lon: firstPoint.lon,
            ele: undefined,
            desc: "Punto de salida (extraído del track)",
            selected: true,
            distanceKm: 0,
          });
          console.log("Added Salida from track at", firstPoint.lat, firstPoint.lon);
        }
        
        // Add Meta if not present
        if (!hasMeta) {
          waypoints.push({
            name: "Meta",
            lat: lastPoint.lat,
            lon: lastPoint.lon,
            ele: undefined,
            desc: "Punto de llegada (extraído del track)",
            selected: true,
            distanceKm: Math.round(totalTrackDistance * 1000) / 1000,
          });
          console.log("Added Meta from track at", lastPoint.lat, lastPoint.lon, "distance:", totalTrackDistance);
        }
        
        if (!hasSalida || !hasMeta) {
          toast.info(`Se añadieron ${!hasSalida ? 'Salida' : ''}${!hasSalida && !hasMeta ? ' y ' : ''}${!hasMeta ? 'Meta' : ''} desde el track (${(totalTrackDistance).toFixed(3)} km)`);
        }
        
        // Recalculate distances for all waypoints using imported route
        waypoints = waypoints.map(wp => ({
          ...wp,
          distanceKm: wp.name === "Salida" ? 0 : 
                      wp.name === "Meta" ? Math.round(totalTrackDistance * 1000) / 1000 :
                      findDistanceOnImportedRoute(wp.lat, wp.lon)
        }));
      }

      if (waypoints.length === 0) {
        toast.error("No se encontraron puntos válidos en el archivo GPX");
        return;
      }

      // Sort waypoints by distance along route
      waypoints.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
      
      console.log("Final waypoints to import:", waypoints);

      // Store route for preview map
      setGpxPreviewRoute(importedRoutePoints);
      setGpxWaypoints(waypoints);
      setIsGpxDialogOpen(true);
    } catch (error: any) {
      console.error("Error parsing GPX:", error);
      const errorMessage = error?.message || "Error desconocido";
      toast.error(`Error al leer el archivo GPX: ${errorMessage}`);
    }

    // Reset input
    if (gpxFileInputRef.current) {
      gpxFileInputRef.current.value = "";
    }
  };

  const toggleWaypointSelection = (index: number) => {
    setGpxWaypoints((prev) =>
      prev.map((wp, i) => (i === index ? { ...wp, selected: !wp.selected } : wp))
    );
  };

  const toggleAllWaypoints = (selected: boolean) => {
    setGpxWaypoints((prev) => prev.map((wp) => ({ ...wp, selected })));
  };

  const handleImportGpxWaypoints = async () => {
    const selectedWaypoints = gpxWaypoints.filter((wp) => wp.selected);
    if (selectedWaypoints.length === 0) {
      toast.error("Selecciona al menos un waypoint para importar");
      return;
    }

    setImportingGpx(true);
    
    // Get max checkpoint_order for the ENTIRE race (not just this distance) to avoid unique constraint violation
    const { data: maxOrderData } = await supabase
      .from("race_checkpoints")
      .select("checkpoint_order")
      .eq("race_id", selectedRaceId)
      .order("checkpoint_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const startOrder = (maxOrderData?.checkpoint_order || 0) + 1;

    // Calculate cumulative distances if not already set from route
    let cumulativeDistance = 0;
    const waypointsWithDistances = selectedWaypoints.map((wp, index) => {
      if (index > 0 && (!wp.distanceKm || wp.distanceKm === 0)) {
        const prevWp = selectedWaypoints[index - 1];
        cumulativeDistance += calculateHaversineDistance(
          prevWp.lat, prevWp.lon,
          wp.lat, wp.lon
        );
      } else if (wp.distanceKm && wp.distanceKm > 0) {
        cumulativeDistance = wp.distanceKm;
      }
      return { ...wp, calculatedDistance: Math.round(cumulativeDistance * 1000) / 1000 };
    });

    const checkpointsToInsert = waypointsWithDistances.map((wp, index) => ({
      race_id: selectedRaceId,
      race_distance_id: selectedDistanceId,
      name: wp.name,
      lugar: wp.desc || null,
      checkpoint_order: startOrder + index,
      distance_km: wp.distanceKm && wp.distanceKm > 0 ? wp.distanceKm : wp.calculatedDistance,
      latitude: wp.lat,
      longitude: wp.lon,
    }));

    console.log("Inserting checkpoints:", checkpointsToInsert);

    const { data, error } = await supabase
      .from("race_checkpoints")
      .insert(checkpointsToInsert)
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      toast.error(`Error al importar: ${error.message}`);
    } else {
      console.log("Inserted successfully:", data);
      toast.success(`${selectedWaypoints.length} puntos de control importados`);
      setIsGpxDialogOpen(false);
      setGpxWaypoints([]);
      setGpxPreviewRoute([]);
      if (gpxPreviewMap.current) {
        gpxPreviewMap.current.remove();
        gpxPreviewMap.current = null;
      }
      gpxPreviewMarkers.current.forEach(m => m.remove());
      gpxPreviewMarkers.current = [];
      fetchCheckpoints();
    }

    setImportingGpx(false);
  };

  // Import checkpoints from roadbook items marked as is_checkpoint
  const handleImportFromRoadbook = async () => {
    setRecalculatingDistances(true);

    try {
      // First, get the roadbook for this distance
      const { data: roadbook, error: roadbookError } = await supabase
        .from("roadbooks")
        .select("id")
        .eq("race_distance_id", selectedDistanceId)
        .maybeSingle();

      if (roadbookError) throw roadbookError;

      if (!roadbook) {
        toast.error("No hay rutómetro creado para esta distancia");
        setRecalculatingDistances(false);
        return;
      }

      // Get roadbook items marked as checkpoints
      const { data: roadbookItems, error: itemsError } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbook.id)
        .eq("is_checkpoint", true)
        .order("item_order");

      if (itemsError) throw itemsError;

      if (!roadbookItems || roadbookItems.length === 0) {
        toast.error("No hay puntos marcados como Punto de Control en el rutómetro");
        setRecalculatingDistances(false);
        return;
      }

      // Get max checkpoint_order for the ENTIRE race to avoid unique constraint violation
      const { data: maxOrderData } = await supabase
        .from("race_checkpoints")
        .select("checkpoint_order")
        .eq("race_id", selectedRaceId)
        .order("checkpoint_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const startOrder = (maxOrderData?.checkpoint_order || 0) + 1;

      // Get max timing_point order
      const maxTpOrder = timingPoints.reduce((max, tp) => Math.max(max, tp.point_order || 0), 0);

      // Create timing_points for each checkpoint with coordinates
      const timingPointsToInsert = roadbookItems
        .filter(item => item.latitude && item.longitude) // Solo los que tienen coordenadas
        .map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === roadbookItems.length - 1;
          
          // Nombre del timing point: START, FINISH o "{descripción} PC"
          let tpName = `${item.description} PC`;
          if (isFirst) tpName = "START";
          else if (isLast) tpName = "FINISH";
          
          return {
            race_id: selectedRaceId,
            name: tpName,
            notes: item.description,
            point_order: maxTpOrder + index + 1,
            latitude: item.latitude,
            longitude: item.longitude,
          };
        });

      let createdTimingPoints: TimingPoint[] = [];
      if (timingPointsToInsert.length > 0) {
        const { data: tpData, error: tpError } = await supabase
          .from("timing_points")
          .insert(timingPointsToInsert)
          .select();

        if (tpError) {
          console.error("Error creating timing points:", tpError);
          // Continue anyway, checkpoints can be created without timing points
        } else {
          createdTimingPoints = tpData || [];
        }
      }

      // Create a map from description to timing_point_id
      const tpMap = new Map<string, string>();
      createdTimingPoints.forEach(tp => {
        if (tp.notes) {
          tpMap.set(tp.notes, tp.id);
        }
      });

      // Create checkpoints from roadbook items with timing_point_id and checkpoint_type assigned
      const checkpointsToInsert = roadbookItems.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === roadbookItems.length - 1;
        
        // Tipo de checkpoint: START, FINISH o CONTROL
        let checkpointType = "CONTROL";
        if (isFirst) checkpointType = "START";
        else if (isLast) checkpointType = "FINISH";
        
        return {
          race_id: selectedRaceId,
          race_distance_id: selectedDistanceId,
          name: item.description,
          lugar: item.via || null,
          checkpoint_order: startOrder + index,
          distance_km: item.km_total,
          latitude: item.latitude,
          longitude: item.longitude,
          timing_point_id: tpMap.get(item.description) || null,
          checkpoint_type: checkpointType,
        };
      });

      const { error: insertError } = await supabase
        .from("race_checkpoints")
        .insert(checkpointsToInsert);

      if (insertError) throw insertError;

      // Refresh timing points list
      await fetchTimingPoints();

      const tpCount = createdTimingPoints.length;
      const tpMsg = tpCount > 0 ? ` y ${tpCount} puntos de cronometraje` : "";
      toast.success(`${roadbookItems.length} puntos de control${tpMsg} importados desde el rutómetro`);
      fetchCheckpoints();
    } catch (error: any) {
      console.error("Error importing from roadbook:", error);
      toast.error(`Error al importar: ${error.message}`);
    }

    setRecalculatingDistances(false);
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una carrera para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedDistanceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una distancia para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  const checkpointsWithCoords = checkpoints.filter(
    (cp) => cp.latitude !== null && cp.longitude !== null
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Puntos de Control
            </CardTitle>
            {gpxRoute.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Navigation className="h-3 w-3 mr-1" />
                Ruta GPX cargada
              </Badge>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {mapboxToken && (
              <Button
                variant="outline"
                onClick={() => setShowMap(!showMap)}
              >
                <MapIcon className="mr-2 h-4 w-4" />
                {showMap ? "Ocultar Mapa" : "Ver Mapa"}
              </Button>
            )}
            <input
              ref={gpxFileInputRef}
              type="file"
              accept=".gpx"
              onChange={handleGpxFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={handleImportFromRoadbook}
              disabled={recalculatingDistances}
            >
              <FileUp className={`mr-2 h-4 w-4 ${recalculatingDistances ? 'animate-spin' : ''}`} />
              {recalculatingDistances ? "Importando..." : "Importar desde Rutómetro"}
            </Button>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir Punto de Control
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {isEditing ? "Editar Punto de Control" : "Crear Punto de Control"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nombre</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Avituallamiento 1"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lugar">Lugar</Label>
                    <Input
                      id="lugar"
                      value={formData.lugar}
                      onChange={(e) => setFormData({ ...formData, lugar: e.target.value })}
                      placeholder="Ej: Plaza Mayor"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="order">Orden</Label>
                      <Input
                        id="order"
                        type="number"
                        min="1"
                        value={formData.checkpoint_order}
                        onChange={(e) =>
                          setFormData({ ...formData, checkpoint_order: parseInt(e.target.value) || 1 })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="distance">Distancia (km)</Label>
                      <Input
                        id="distance"
                        type="number"
                        step="0.001"
                        min="0"
                        value={formData.distance_km}
                        onChange={(e) =>
                          setFormData({ ...formData, distance_km: parseFloat(e.target.value) || 0 })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="checkpoint_type">Tipo de Punto</Label>
                    <select
                      id="checkpoint_type"
                      value={formData.checkpoint_type}
                      onChange={(e) => setFormData({ ...formData, checkpoint_type: e.target.value })}
                      className="w-full h-9 px-3 py-1 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="START">Salida (START)</option>
                      <option value="CONTROL">Intermedio (CONTROL)</option>
                      <option value="FINISH">Meta (FINISH)</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      FINISH se usa para calcular resultados finales
                    </p>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Navigation className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Coordenadas GPS (opcional)</Label>
                      </div>
                      {mapboxToken && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFormMap(!showFormMap)}
                        >
                          <MapPin className="mr-1 h-3 w-3" />
                          {showFormMap ? "Ocultar" : "Seleccionar en mapa"}
                        </Button>
                      )}
                    </div>
                    {showFormMap && mapboxToken && (
                      <div className="mb-4">
                        <div ref={formMapContainer} className="w-full h-[200px] rounded-lg border" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Haz clic en el mapa para seleccionar las coordenadas
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="latitude">Latitud</Label>
                        <Input
                          id="latitude"
                          type="number"
                          step="any"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                          placeholder="40.4168"
                        />
                      </div>
                      <div>
                        <Label htmlFor="longitude">Longitud</Label>
                        <Input
                          id="longitude"
                          type="number"
                          step="any"
                          value={formData.longitude}
                          onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                          placeholder="-3.7038"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Asignación a eventos - Simplificado */}
                  <p className="text-xs text-muted-foreground">
                    Este checkpoint se asignará al evento: <strong>{allDistances.find(d => d.id === selectedDistanceId)?.name}</strong>
                  </p>
                  {/* Selector de Punto de Cronometraje */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="timing_point_id">Punto de Cronometraje</Label>
                      {!isCreatingTimingPoint && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsCreatingTimingPoint(true)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Crear nuevo
                        </Button>
                      )}
                    </div>
                    {isCreatingTimingPoint ? (
                      <div className="space-y-2">
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm text-muted-foreground mb-1">Se creará el punto de cronometraje:</p>
                          <p className="font-medium">
                            {formData.checkpoint_type === "START" 
                              ? "START" 
                              : formData.checkpoint_type === "FINISH" 
                                ? "FINISH" 
                                : formData.name.trim() 
                                  ? `${formData.name.trim()} PC`
                                  : "(Ingresa nombre del checkpoint)"}
                          </p>
                          {formData.latitude && formData.longitude && (
                            <p className="text-xs text-muted-foreground mt-1">
                              📍 Coordenadas: {parseFloat(formData.latitude).toFixed(4)}, {parseFloat(formData.longitude).toFixed(4)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            size="sm" 
                            onClick={handleCreateTimingPoint}
                            disabled={!formData.name.trim() && formData.checkpoint_type === "CONTROL"}
                            className="flex-1"
                          >
                            Crear Punto de Cronometraje
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => {
                            setIsCreatingTimingPoint(false);
                            setNewTimingPointName("");
                          }}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <select
                        id="timing_point_id"
                        value={formData.timing_point_id}
                        onChange={(e) => setFormData({ ...formData, timing_point_id: e.target.value })}
                        className="w-full h-9 px-3 py-1 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Sin asignar</option>
                        {timingPoints.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.name}{tp.notes ? ` (${tp.notes})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Nomenclatura: START, CP1, CP2..., FINISH
                    </p>
                  </div>
                  
                  {/* Parámetros de Tiempo */}
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Parámetros de Cronometraje</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="min_time" className="text-xs">Tiempo Mínimo</Label>
                        <Input
                          id="min_time"
                          type="text"
                          value={formData.min_time}
                          onChange={(e) => setFormData({ ...formData, min_time: e.target.value })}
                          placeholder="HH:MM:SS"
                          pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ignorar lecturas antes de este tiempo
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="max_time" className="text-xs">Tiempo Máximo</Label>
                        <Input
                          id="max_time"
                          type="text"
                          value={formData.max_time}
                          onChange={(e) => setFormData({ ...formData, max_time: e.target.value })}
                          placeholder="HH:MM:SS"
                          pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ignorar lecturas después (cutoff)
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="expected_laps" className="text-xs">Vueltas Esperadas</Label>
                        <Input
                          id="expected_laps"
                          type="number"
                          min="1"
                          max="100"
                          value={formData.expected_laps}
                          onChange={(e) => setFormData({ ...formData, expected_laps: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      {formData.expected_laps > 1 && (
                        <div>
                          <Label htmlFor="min_lap_time" className="text-xs">Tiempo Mín. por Vuelta</Label>
                          <Input
                            id="min_lap_time"
                            type="text"
                            value={formData.min_lap_time}
                            onChange={(e) => setFormData({ ...formData, min_lap_time: e.target.value })}
                            placeholder="HH:MM:SS"
                            pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Tiempo mínimo entre vueltas
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Radio GPS para Geofencing */}
                  <div>
                    <Label htmlFor="geofence_radius">Radio GPS (metros)</Label>
                    <Input
                      id="geofence_radius"
                      type="number"
                      min="10"
                      max="200"
                      value={formData.geofence_radius}
                      onChange={(e) => setFormData({ ...formData, geofence_radius: parseInt(e.target.value) || 50 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Radio para detección automática de paso por GPS
                    </p>
                  </div>
                  <Button type="submit" className="w-full">
                    {isEditing ? "Guardar Cambios" : "Crear Punto de Control"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-4">Cargando...</p>
          ) : checkpoints.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No hay puntos de control configurados. Los puntos de control "Salida" y "Meta" se crean
              automáticamente al añadir una distancia.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Orden</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Lugar</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Punto Crono</TableHead>
                  <TableHead className="text-center">Tiempos</TableHead>
                  <TableHead className="text-center">GPS</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkpoints.map((checkpoint) => (
                  <TableRow key={checkpoint.id}>
                    <TableCell>
                      <Badge variant="outline">{checkpoint.checkpoint_order}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{checkpoint.name}</TableCell>
                    <TableCell className="text-muted-foreground">{checkpoint.lugar || "-"}</TableCell>
                    <TableCell className="text-right">{checkpoint.distance_km.toFixed(3)}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs flex items-center gap-1 w-fit ${
                          checkpoint.checkpoint_type === 'START' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : checkpoint.checkpoint_type === 'FINISH' 
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                              : ''
                        }`}
                      >
                        {checkpoint.checkpoint_type === 'START' && <Flag className="h-3 w-3" />}
                        {checkpoint.checkpoint_type === 'FINISH' && <FlagTriangleRight className="h-3 w-3" />}
                        {checkpoint.checkpoint_type === 'CONTROL' && <MapPin className="h-3 w-3" />}
                        {checkpoint.checkpoint_type || "CONTROL"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {checkpoint.timing_point_id ? (
                          <Badge variant="outline" className="text-xs w-fit">
                            {timingPoints.find(tp => tp.id === checkpoint.timing_point_id)?.name || "Vinculado"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                        {(checkpoint.expected_laps || 1) > 1 && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {checkpoint.expected_laps} vueltas
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5 text-xs">
                        {checkpoint.min_time || checkpoint.max_time ? (
                          <>
                            {checkpoint.min_time && (
                              <span className="text-muted-foreground">
                                Min: {intervalToString(checkpoint.min_time)}
                              </span>
                            )}
                            {checkpoint.max_time && (
                              <span className="text-muted-foreground">
                                Max: {intervalToString(checkpoint.max_time)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {checkpoint.latitude && checkpoint.longitude ? (
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant="secondary" className="text-xs">
                            <Navigation className="h-3 w-3 mr-1" />
                            {checkpoint.latitude.toFixed(4)}, {checkpoint.longitude.toFixed(4)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Radio: {checkpoint.geofence_radius || 50}m
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenDialog(checkpoint)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(checkpoint)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showMap && mapboxToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="h-5 w-5" />
              Mapa de Puntos de Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={mapContainer} className="w-full h-[400px] rounded-lg" />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto de control?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el punto de control "{selectedCheckpoint?.name}". Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isGpxDialogOpen} onOpenChange={(open) => {
        setIsGpxDialogOpen(open);
        if (!open) {
          setGpxWaypoints([]);
          setGpxPreviewRoute([]);
          if (gpxPreviewMap.current) {
            gpxPreviewMap.current.remove();
            gpxPreviewMap.current = null;
          }
          gpxPreviewMarkers.current.forEach(m => m.remove());
          gpxPreviewMarkers.current = [];
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Importar Waypoints desde GPX
            </DialogTitle>
            <DialogDescription>
              Selecciona los waypoints que deseas importar como puntos de control.
              {gpxPreviewRoute.length > 0 
                ? ` Track de ${(gpxPreviewRoute[gpxPreviewRoute.length - 1]?.cumulativeDistance || 0).toFixed(3)} km detectado.`
                : " No se detectó track en el archivo GPX."}
            </DialogDescription>
          </DialogHeader>
          
          {/* Map Preview */}
          {mapboxToken && (
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-sm font-medium flex items-center gap-2">
                <MapIcon className="h-4 w-4" />
                Preview del recorrido
                <Badge variant="outline" className="ml-auto">
                  {gpxWaypoints.filter((wp) => wp.selected).length} waypoints seleccionados
                </Badge>
              </div>
              <div 
                ref={gpxPreviewMapContainer} 
                className="w-full h-[250px]"
              />
            </div>
          )}
          
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">
              {gpxWaypoints.filter((wp) => wp.selected).length} de {gpxWaypoints.length} seleccionados
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAllWaypoints(true)}
              >
                Seleccionar todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAllWaypoints(false)}
              >
                Deseleccionar todos
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[200px] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead>Coordenadas</TableHead>
                  <TableHead>Elevación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gpxWaypoints.map((wp, index) => (
                  <TableRow key={index} className="cursor-pointer" onClick={() => toggleWaypointSelection(index)}>
                    <TableCell>
                      <Checkbox
                        checked={wp.selected}
                        onCheckedChange={() => toggleWaypointSelection(index)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{wp.name}</TableCell>
                    <TableCell className="text-right">
                      {wp.distanceKm !== undefined ? (
                        <Badge variant="secondary">{wp.distanceKm.toFixed(3)} km</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
                    </TableCell>
                    <TableCell>{wp.ele ? `${wp.ele.toFixed(0)}m` : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsGpxDialogOpen(false);
                setGpxWaypoints([]);
                setGpxPreviewRoute([]);
                if (gpxPreviewMap.current) {
                  gpxPreviewMap.current.remove();
                  gpxPreviewMap.current = null;
                }
                gpxPreviewMarkers.current.forEach(m => m.remove());
                gpxPreviewMarkers.current = [];
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImportGpxWaypoints}
              disabled={importingGpx || gpxWaypoints.filter((wp) => wp.selected).length === 0}
            >
              {importingGpx ? "Importando..." : "Importar seleccionados"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
