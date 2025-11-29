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
import { Plus, Trash2, MapPin, Pencil, Map, Navigation, Upload, FileUp } from "lucide-react";
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
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const formMapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const formMap = useRef<mapboxgl.Map | null>(null);
  const formMarker = useRef<mapboxgl.Marker | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const gpxFileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    lugar: "",
    checkpoint_order: 1,
    distance_km: 0,
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    fetchMapboxToken();
  }, []);

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

    return Math.round(resultKm * 100) / 100; // Round to 2 decimal places
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

  const fetchCheckpoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_checkpoints")
      .select("*")
      .eq("race_distance_id", selectedDistanceId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Error al cargar los puntos de control");
      console.error(error);
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
    });
    setSelectedCheckpoint(null);
    setIsEditing(false);
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
        })
        .eq("id", selectedCheckpoint.id);

      if (error) {
        toast.error("Error al actualizar el punto de control");
        console.error(error);
        return;
      }
      toast.success("Punto de control actualizado");
    } else {
      const { error } = await supabase.from("race_checkpoints").insert({
        race_id: selectedRaceId,
        race_distance_id: selectedDistanceId,
        name: formData.name,
        lugar: formData.lugar || null,
        checkpoint_order: formData.checkpoint_order,
        distance_km: formData.distance_km,
        latitude,
        longitude,
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
      
      if (validWaypoints.length > 0) {
        waypoints = validWaypoints.map((wp) => {
          const distanceKm = gpxRoute.length > 0 
            ? findDistanceOnRoute(wp.lat, wp.lon) 
            : 0;
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
      
      // If no valid waypoints, try to extract start/end from track
      if (waypoints.length === 0 && gpx.tracks.length > 0) {
        const track = gpx.tracks[0];
        console.log("Using track with", track.points.length, "points");
        if (track.points.length > 0) {
          const firstPoint = track.points[0];
          const lastPoint = track.points[track.points.length - 1];
          const totalDistance = calculateTrackDistance(track);
          
          waypoints = [
            {
              name: "Salida",
              lat: firstPoint.lat,
              lon: firstPoint.lon,
              ele: firstPoint.ele,
              desc: "Punto de salida (extraído del track)",
              selected: true,
              distanceKm: 0,
            },
            {
              name: "Meta",
              lat: lastPoint.lat,
              lon: lastPoint.lon,
              ele: lastPoint.ele,
              desc: "Punto de llegada (extraído del track)",
              selected: true,
              distanceKm: Math.round(totalDistance * 100) / 100,
            },
          ];
          
          toast.info(`Se extrajeron salida y meta del track (${waypoints[1].distanceKm} km)`);
        }
      }

      if (waypoints.length === 0) {
        toast.error("No se encontraron puntos válidos en el archivo GPX");
        return;
      }

      console.log("Final waypoints to import:", waypoints);

      // Sort by distance if we have route data, otherwise calculate cumulative
      if (gpxRoute.length > 0) {
        waypoints.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
      } else {
        // Calculate cumulative distances between waypoints
        let cumulativeDistance = 0;
        waypoints = waypoints.map((wp, index) => {
          if (index > 0) {
            const prevWp = waypoints[index - 1];
            cumulativeDistance += calculateHaversineDistance(
              prevWp.lat, prevWp.lon,
              wp.lat, wp.lon
            );
          }
          return { ...wp, distanceKm: Math.round(cumulativeDistance * 100) / 100 };
        });
      }

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
      return { ...wp, calculatedDistance: Math.round(cumulativeDistance * 100) / 100 };
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
      fetchCheckpoints();
    }

    setImportingGpx(false);
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
            {mapboxToken && (checkpointsWithCoords.length > 0 || gpxRoute.length > 0) && (
              <Button
                variant="outline"
                onClick={() => setShowMap(!showMap)}
              >
                <Map className="mr-2 h-4 w-4" />
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
              onClick={() => gpxFileInputRef.current?.click()}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Importar GPX
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
              <DialogContent className="max-w-md">
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
                        step="0.1"
                        min="0"
                        value={formData.distance_km}
                        onChange={(e) =>
                          setFormData({ ...formData, distance_km: parseFloat(e.target.value) || 0 })
                        }
                        required
                      />
                    </div>
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
                    <TableCell className="text-right">{checkpoint.distance_km}</TableCell>
                    <TableCell className="text-center">
                      {checkpoint.latitude && checkpoint.longitude ? (
                        <Badge variant="secondary" className="text-xs">
                          <Navigation className="h-3 w-3 mr-1" />
                          {checkpoint.latitude.toFixed(4)}, {checkpoint.longitude.toFixed(4)}
                        </Badge>
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
              <Map className="h-5 w-5" />
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

      <Dialog open={isGpxDialogOpen} onOpenChange={setIsGpxDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Importar Waypoints desde GPX
            </DialogTitle>
            <DialogDescription>
              Selecciona los waypoints que deseas importar como puntos de control.
              {gpxRoute.length > 0 
                ? " Las distancias se calculan automáticamente basándose en la ruta GPX de la distancia."
                : " No hay ruta GPX asociada a esta distancia, las distancias se establecerán en 0."}
            </DialogDescription>
          </DialogHeader>
          
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

          <ScrollArea className="h-[300px] border rounded-md">
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
                        <Badge variant="secondary">{wp.distanceKm.toFixed(2)} km</Badge>
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
