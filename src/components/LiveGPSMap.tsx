import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile } from '@/lib/gpxParser';
import { buildRouteIndex, projectOnRoute, RouteIndex, RouteProgress } from '@/lib/routeProgress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, User, MapPin, Bell, ChevronUp, ChevronDown, Users, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatLocalTime } from '@/lib/timezoneUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapControls } from '@/components/MapControls';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TrackPlaybackControls } from '@/components/TrackPlaybackControls';
import { GroupPlaybackControls } from '@/components/GroupPlaybackControls';

interface CheckpointNotification {
  id: string;
  bib_number: number;
  checkpoint_name: string;
  runner_name: string;
  timestamp: string;
}
interface RunnerPosition {
  id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  bib_number: string | null;
  runner_name: string;
  heading: number | null;
  speed: number | null;
  battery: number | null;
  source: string | null;
}

interface SosAlert {
  id: string;
  lat: number;
  lng: number;
  triggered_at: string;
  resolved_at: string | null;
  bib_number: string | null;
  runner_name: string;
}

/** Sin actualización GPS en este tiempo → corredor "sin señal" */
const STALE_MS = 5 * 60 * 1000;

interface RunnerTrackPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  altitude: number | null;
}

interface Checkpoint {
  id: string;
  name: string;
  checkpoint_type: string;
  distance_km: number;
  latitude: number | null;
  longitude: number | null;
}

interface RoadbookItem {
  id: string;
  description: string;
  km_total: number;
  latitude: number | null;
  longitude: number | null;
  is_highlighted: boolean;
  item_type: string;
  roadbook_item_types?: {
    icon: string;
    label: string;
  } | null;
}

interface LiveGPSMapProps {
  raceId: string;
  distanceId?: string;
  mapboxToken: string;
}

export function LiveGPSMap({ raceId, distanceId, mapboxToken }: LiveGPSMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const checkpointMarkers = useRef<mapboxgl.Marker[]>([]);
  const roadbookMarkers = useRef<mapboxgl.Marker[]>([]);
  const routeCoordinates = useRef<[number, number][]>([]);
  const [runnerPositions, setRunnerPositions] = useState<RunnerPosition[]>([]);
  const [routeIndex, setRouteIndex] = useState<RouteIndex | null>(null);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const sosMarkers = useRef<mapboxgl.Marker[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [roadbookItems, setRoadbookItems] = useState<RoadbookItem[]>([]);
  const [gpxUrl, setGpxUrl] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isBikeRace, setIsBikeRace] = useState(false);

  // Modalidad: en bici la velocidad se muestra en km/h; a pie, ritmo min/km
  useEffect(() => {
    supabase
      .from('races')
      .select('race_type')
      .eq('id', raceId)
      .single()
      .then(({ data }) => {
        setIsBikeRace(/mtb|btt|bici|bike|cicl/i.test(data?.race_type ?? ''));
      });
  }, [raceId]);
  
  // New state for runner track
  const [selectedRunner, setSelectedRunner] = useState<RunnerPosition | null>(null);
  const [runnerTrack, setRunnerTrack] = useState<RunnerTrackPoint[]>([]);
  const [loadingTrack, setLoadingTrack] = useState(false);
  
  // Playback mode state
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [pendingPlayback, setPendingPlayback] = useState(false);
  const playbackMarker = useRef<mapboxgl.Marker | null>(null);

  // Repetición del grupo (reloj maestro)
  const [isGroupPlayback, setIsGroupPlayback] = useState(false);
  const groupPlaybackRef = useRef(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupTracks, setGroupTracks] = useState<Map<string, RunnerTrackPoint[]>>(new Map());
  const groupTracksRef = useRef<Map<string, RunnerTrackPoint[]>>(new Map());
  const [replayPositions, setReplayPositions] = useState<RunnerPosition[] | null>(null);
  const [finalizadoMode, setFinalizadoMode] = useState(false);
  const [hiddenInReplay, setHiddenInReplay] = useState<Set<string>>(new Set());
  const hiddenInReplayRef = useRef<Set<string>>(new Set());
  const lastPanelUpdateRef = useRef(0);
  
  // Mobile panel state
  const isMobile = useIsMobile();
  const [isRunnersPanelExpanded, setIsRunnersPanelExpanded] = useState(false);
  
  // Map controls state
  const [mapStyle, setMapStyle] = useState<'outdoors' | 'satellite' | 'streets' | 'light' | 'dark'>('outdoors');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasRoute, setHasRoute] = useState(false);

  // Map control functions
  const handleCenterRoute = useCallback(() => {
    if (!map.current || routeCoordinates.current.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    routeCoordinates.current.forEach(coord => bounds.extend(coord));
    map.current.fitBounds(bounds, { padding: 50 });
  }, []);

  const handleCenterRunners = useCallback(() => {
    if (!map.current || runnerPositions.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    runnerPositions.forEach(pos => {
      bounds.extend([pos.longitude, pos.latitude]);
    });
    map.current.fitBounds(bounds, { padding: 50 });
  }, [runnerPositions]);

  const handleZoomIn = useCallback(() => {
    if (!map.current) return;
    map.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!map.current) return;
    map.current.zoomOut();
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!mapContainer.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      mapContainer.current.parentElement?.requestFullscreen();
    }
  }, []);

  const handleChangeStyle = useCallback((style: 'outdoors' | 'satellite' | 'streets' | 'light' | 'dark') => {
    if (!map.current) return;
    const styleUrls: Record<string, string> = {
      outdoors: 'mapbox://styles/mapbox/outdoors-v12',
      satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
      streets: 'mapbox://styles/mapbox/streets-v12',
      light: 'mapbox://styles/mapbox/light-v11',
      dark: 'mapbox://styles/mapbox/dark-v11',
    };
    map.current.setStyle(styleUrls[style]);
    setMapStyle(style);
    
    // Re-add route layer after style change
    map.current.once('style.load', () => {
      if (routeCoordinates.current.length > 0 && map.current) {
        // Re-add the route
        if (!map.current.getSource('route')) {
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: routeCoordinates.current,
              },
            },
          });
          
          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#FF6B35',
              'line-width': 4,
              'line-opacity': 0.8,
            },
          });
        }
      }
    });
  }, []);

  const handleFollowRunner = useCallback(() => {
    if (!selectedRunner) {
      toast.info('Selecciona un corredor primero');
      return;
    }
    setIsFollowing(prev => !prev);
    if (!isFollowing && map.current) {
      map.current.flyTo({
        center: [selectedRunner.longitude, selectedRunner.latitude],
        zoom: 16,
      });
    }
  }, [selectedRunner, isFollowing]);

  // Follow selected runner when position updates
  useEffect(() => {
    if (!isFollowing || !selectedRunner || !map.current) return;
    const updatedRunner = runnerPositions.find(r => r.registration_id === selectedRunner.registration_id);
    if (updatedRunner) {
      map.current.flyTo({
        center: [updatedRunner.longitude, updatedRunner.latitude],
        zoom: map.current.getZoom(),
        duration: 1000,
      });
    }
  }, [runnerPositions, selectedRunner, isFollowing]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-3.7, 40.4],
      zoom: 12,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Marcar el mapa como listo. Se engancha a DOS eventos a proposito: con
    // solo 'load' habia cargas en las que mapReady se quedaba en false para
    // siempre, y entonces no se pintaba ni el recorrido ni los puntos de
    // control — el mapa se quedaba en su centro por defecto, Madrid, y el
    // boton "Recorrido" apagado. Al cambiar de recorrido a mano funcionaba,
    // porque el componente ya estaba montado: de ahi que pareciera
    // intermitente. 'idle' dispara cada vez que el mapa se queda quieto, asi
    // que rescata el caso en que 'load' se pierde.
    const marcarListo = () => {
      // El contenedor crece despues de crear el mapa (la tarjeta que lo
      // envuelve se pinta antes de tener alto). Sin resize, Mapbox sigue
      // creyendo que mide lo de antes y lo que se encuadre despues sale a un
      // zoom sin tiles: el mapa en beige.
      map.current?.resize();
      setMapReady(true);
    };
    map.current.on('load', marcarListo);
    map.current.on('idle', marcarListo);

    if (map.current.isStyleLoaded()) {
      marcarListo();
    }

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  // Load GPX, checkpoints and roadbook items when map is ready or distanceId changes
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    // Clear existing route
    if (map.current.getLayer('route')) {
      map.current.removeLayer('route');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }
    
    // Clear runner track
    clearRunnerTrack();
    
    // Clear existing checkpoint markers
    checkpointMarkers.current.forEach(marker => marker.remove());
    checkpointMarkers.current = [];
    
    // Clear existing roadbook markers
    roadbookMarkers.current.forEach(marker => marker.remove());
    roadbookMarkers.current = [];
    
    setGpxUrl(null);
    // Y el estado que cuelga de la ruta, tambien. Se limpiaba la capa del mapa
    // pero no esto, asi que al pasar a un recorrido sin GPX el boton
    // "Recorrido" seguia activo y llevaba al trazado del recorrido ANTERIOR.
    routeCoordinates.current = [];
    setHasRoute(false);
    setRouteIndex(null);
    fetchGpx();
    fetchCheckpoints();
    fetchRoadbookItems();
  }, [distanceId, raceId, mapReady]);

  // Setup realtime and fetch positions
  useEffect(() => {
    if (!mapReady) return;
    fetchInitialPositions();
    const cleanupGPS = setupRealtimeSubscription();
    const cleanupTimings = setupTimingReadingsSubscription();
    return () => {
      cleanupGPS();
      cleanupTimings();
    };
  }, [raceId, distanceId, mapReady]);

  // Load runner track when selected
  useEffect(() => {
    if (selectedRunner) {
      fetchRunnerTrack(selectedRunner.registration_id);
    } else {
      clearRunnerTrack();
    }
  }, [selectedRunner]);

  // Auto-start playback when track is loaded and pendingPlayback is true
  useEffect(() => {
    if (pendingPlayback && runnerTrack.length > 0 && !loadingTrack) {
      setIsPlaybackMode(true);
      setPendingPlayback(false);
    }
  }, [pendingPlayback, runnerTrack, loadingTrack]);

  // Clean map layers only (don't clear state)
  const clearMapTrackLayers = () => {
    if (!map.current) return;
    
    if (map.current.getLayer('runner-track')) {
      map.current.removeLayer('runner-track');
    }
    if (map.current.getLayer('runner-track-points')) {
      map.current.removeLayer('runner-track-points');
    }
    if (map.current.getSource('runner-track')) {
      map.current.removeSource('runner-track');
    }
  };

  const clearRunnerTrack = () => {
    clearMapTrackLayers();
    setRunnerTrack([]);
    setIsPlaybackMode(false);
    
    // Remove playback marker
    if (playbackMarker.current) {
      playbackMarker.current.remove();
      playbackMarker.current = null;
    }
    setIsPlaybackMode(false);
  };

  /** Carga el track completo de un corredor, del pipeline que corresponda */
  const loadTrackPoints = async (runner: RunnerPosition): Promise<RunnerTrackPoint[]> => {
    // Los RPC "_full" devuelven UNA fila con todos los puntos dentro: el
    // API corta las consultas normales en 1.000 filas y las rutas largas
    // perdían el final (1.846 puntos → se veían 1.000, faltaba hora y media).
    if (runner.source === 'app') {
      // Pipeline app (camberas-track): registration_id es el token → RPC propio
      const { data, error } = await supabase.rpc('get_token_track_full' as never, {
        p_token_id: runner.registration_id,
      } as never);
      if (error) throw error;
      return ((data as unknown as any[]) || []).map(point => ({
        latitude: parseFloat(String(point.lat)),
        longitude: parseFloat(String(point.lng)),
        timestamp: point.ts,
        speed: point.speed != null ? parseFloat(String(point.speed)) : null,
        altitude: null,
      }));
    }
    const { data, error } = await supabase.rpc('get_registration_track_full' as never, {
      p_registration_id: runner.registration_id,
      p_race_id: raceId,
    } as never);

    if (error) throw error;

    return ((data as unknown as any[]) || []).map(point => ({
      latitude: parseFloat(String(point.lat)),
      longitude: parseFloat(String(point.lng)),
      timestamp: point.ts,
      speed: point.speed != null ? parseFloat(String(point.speed)) : null,
      altitude: point.altitude != null ? parseFloat(String(point.altitude)) : null,
    }));
  };

  const fetchRunnerTrack = async (registrationId: string) => {
    setLoadingTrack(true);
    try {
      const runner = runnerPositions.find(r => r.registration_id === registrationId);
      if (!runner) return;
      const trackPoints = await loadTrackPoints(runner);
      setRunnerTrack(trackPoints);
      addRunnerTrackToMap(trackPoints);
    } catch (error) {
      console.error('Error fetching runner track:', error);
    } finally {
      setLoadingTrack(false);
    }
  };

  const addRunnerTrackToMap = (trackPoints: RunnerTrackPoint[]) => {
    if (!map.current || trackPoints.length === 0) return;

    // Clear existing map layers only (keep state)
    clearMapTrackLayers();

    const coordinates: [number, number][] = trackPoints.map(point => [point.longitude, point.latitude]);

    // Add runner track as a line
    map.current.addSource('runner-track', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      },
    });

    map.current.addLayer({
      id: 'runner-track',
      type: 'line',
      source: 'runner-track',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 5,
        'line-opacity': 0.9,
      },
    });

    // Add dots for each GPS point
    map.current.addLayer({
      id: 'runner-track-points',
      type: 'circle',
      source: 'runner-track',
      paint: {
        'circle-radius': 4,
        'circle-color': '#1d4ed8',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    // Fit map to runner track
    if (coordinates.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord));
      map.current.fitBounds(bounds, { padding: 80 });
    }
  };

  const fetchCheckpoints = async () => {
    let query = supabase
      .from('race_checkpoints')
      .select('id, name, checkpoint_type, distance_km, latitude, longitude')
      .eq('race_id', raceId)
      .order('checkpoint_order', { ascending: true });

    if (distanceId) {
      query = query.eq('race_distance_id', distanceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checkpoints:', error);
      return;
    }

    if (data) {
      setCheckpoints(data);
      addCheckpointMarkers(data);
    }
  };

  const getCheckpointIcon = (type: string): { color: string; icon: string } => {
    switch (type.toUpperCase()) {
      case 'START':
        return { color: '#10b981', icon: '🚩' }; // Green
      case 'FINISH':
        return { color: '#ef4444', icon: '🏁' }; // Red
      default:
        return { color: '#3b82f6', icon: '📍' }; // Blue
    }
  };

  const addCheckpointMarkers = (checkpointsData: Checkpoint[]) => {
    if (!map.current) return;

    const validCheckpoints = checkpointsData.filter(cp => cp.latitude && cp.longitude);

    validCheckpoints.forEach((checkpoint) => {
      const { color, icon } = getCheckpointIcon(checkpoint.checkpoint_type);
      
      const el = document.createElement('div');
      el.className = 'checkpoint-marker';
      el.innerHTML = `
        <div class="flex flex-col items-center">
          <div style="background-color: ${color}; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" class="rounded-full w-8 h-8 flex items-center justify-center text-white font-bold text-sm">
            ${icon}
          </div>
          <div style="background-color: ${color};" class="text-white text-xs px-2 py-0.5 rounded mt-1 whitespace-nowrap shadow">
            ${checkpoint.name}
          </div>
        </div>
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat([checkpoint.longitude!, checkpoint.latitude!])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <strong>${checkpoint.name}</strong><br/>
              Tipo: ${checkpoint.checkpoint_type}<br/>
              KM: ${checkpoint.distance_km}
            </div>`
          )
        )
        .addTo(map.current!);

      checkpointMarkers.current.push(marker);
    });

    // Center map on checkpoints if no GPX route loaded yet
    if (validCheckpoints.length > 0 && !gpxUrl) {
      const bounds = new mapboxgl.LngLatBounds();
      validCheckpoints.forEach(cp => {
        bounds.extend([cp.longitude!, cp.latitude!]);
      });
      map.current.fitBounds(bounds, { padding: 80 });
    }
  };

  const fetchRoadbookItems = async () => {
    if (!distanceId) return;

    // Get roadbook for this distance
    const { data: roadbookData, error: roadbookError } = await supabase
      .from('roadbooks')
      .select('id')
      .eq('race_distance_id', distanceId)
      .maybeSingle();

    if (roadbookError || !roadbookData) return;

    // Get highlighted items with coordinates
    const { data: items, error: itemsError } = await supabase
      .from('roadbook_items')
      .select(`
        id,
        description,
        km_total,
        latitude,
        longitude,
        is_highlighted,
        item_type,
        roadbook_item_types (
          icon,
          label
        )
      `)
      .eq('roadbook_id', roadbookData.id)
      .eq('is_highlighted', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('item_order', { ascending: true });

    if (itemsError) {
      console.error('Error fetching roadbook items:', itemsError);
      return;
    }

    if (items) {
      setRoadbookItems(items as RoadbookItem[]);
      addRoadbookMarkers(items as RoadbookItem[]);
    }
  };

  const addRoadbookMarkers = (items: RoadbookItem[]) => {
    if (!map.current) return;

    items.forEach((item) => {
      if (!item.latitude || !item.longitude) return;

      const icon = item.roadbook_item_types?.icon || 'MapPin';
      const label = item.roadbook_item_types?.label || item.item_type;
      
      const el = document.createElement('div');
      el.className = 'roadbook-marker';
      el.innerHTML = `
        <div class="flex flex-col items-center">
          <div style="background-color: #8b5cf6; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" class="rounded-full w-7 h-7 flex items-center justify-center text-white font-bold text-xs">
            ⭐
          </div>
        </div>
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat([item.longitude, item.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <strong>${label}</strong><br/>
              ${item.description}<br/>
              KM: ${item.km_total}
            </div>`
          )
        )
        .addTo(map.current!);

      roadbookMarkers.current.push(marker);
    });
  };

  const fetchGpx = async () => {
    // If a specific distance is selected, get its GPX
    if (distanceId) {
      const { data: distanceData, error: distanceError } = await supabase
        .from('race_distances')
        .select('gpx_file_url')
        .eq('id', distanceId)
        .maybeSingle();

      if (!distanceError && distanceData?.gpx_file_url) {
        setGpxUrl(distanceData.gpx_file_url);
        loadGpxRoute(distanceData.gpx_file_url);
      }
      // Y si ESE recorrido no tiene GPX, no se dibuja ninguno. Antes se caia a
      // los respaldos de abajo y acababa pintando el recorrido de OTRA
      // distancia de la misma carrera: quien entraba a ver el Trail de 25 km
      // veia el trazado de la Marcha de 15 dibujado como si fuera el suyo.
      // Los respaldos valen cuando no se ha elegido recorrido —mejor algo que
      // nada—, pero con uno concreto seleccionado mienten.
      return;
    }

    // Fallback: try to get GPX from race_distances with GPS enabled
    const { data: distanceData, error: distanceError } = await supabase
      .from('race_distances')
      .select('gpx_file_url')
      .eq('race_id', raceId)
      .eq('gps_tracking_enabled', true)
      .not('gpx_file_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!distanceError && distanceData?.gpx_file_url) {
      // Sin setGpxUrl: no hay recorrido propio que anunciar en la leyenda
      loadGpxRoute(distanceData.gpx_file_url, true);
      return;
    }

    // Fallback: try any distance with GPX
    const { data: anyDistanceData, error: anyDistanceError } = await supabase
      .from('race_distances')
      .select('gpx_file_url')
      .eq('race_id', raceId)
      .not('gpx_file_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!anyDistanceError && anyDistanceData?.gpx_file_url) {
      loadGpxRoute(anyDistanceData.gpx_file_url, true);
      return;
    }

    // Final fallback: check if race itself has GPX (legacy support)
    const { data: raceData, error: raceError } = await supabase
      .from('races')
      .select('gpx_file_url')
      .eq('id', raceId)
      .single();

    if (!raceError && raceData?.gpx_file_url) {
      setGpxUrl(raceData.gpx_file_url);
      loadGpxRoute(raceData.gpx_file_url);
    }
  };

  /**
   * Carga el GPX y lo dibuja. Con soloEncuadrar solo mueve el mapa a esa zona
   * SIN dibujar la linea: se usa cuando el recorrido elegido no tiene ruta
   * propia y se toma prestada la de otro de la misma carrera, nada mas que
   * para no dejar el mapa plantado en su centro por defecto, que es Madrid.
   * Encuadrar en la comarca correcta ayuda; dibujar el trazado de otra
   * distancia como si fuera el tuyo es mentir.
   */
  const loadGpxRoute = async (url: string, soloEncuadrar = false) => {
    try {
      const response = await fetch(url);
      const gpxText = await response.text();
      
      const parsedGpx = parseGpxFile(gpxText);

      if (!map.current || !parsedGpx.tracks || parsedGpx.tracks.length === 0) {
        console.warn('GPX parsing failed or no tracks found');
        return;
      }

      addGpxToMap(parsedGpx, soloEncuadrar);
    } catch (error) {
      console.error('Error loading GPX:', error);
    }
  };

  const addGpxToMap = (gpx: ReturnType<typeof parseGpxFile>, soloEncuadrar = false) => {
    if (!map.current) return;

    const coordinates: [number, number][] = [];
    
    gpx.tracks.forEach((track) => {
      track.points.forEach((point) => {
        coordinates.push([point.lon, point.lat]);
      });
    });

    if (coordinates.length === 0) return;

    // Prestado de otro recorrido: solo sirve para saber por donde cae la
    // carrera. Ni se dibuja, ni se guarda como ruta, ni enciende los controles
    // de recorrido — no es el trazado de quien esta mirando.
    if (soloEncuadrar) {
      const encuadre = new mapboxgl.LngLatBounds();
      coordinates.forEach((coord) => encuadre.extend(coord));
      map.current.fitBounds(encuadre, { padding: 50, maxZoom: 15 });
      return;
    }

    // Store coordinates for map controls
    routeCoordinates.current = coordinates;
    setHasRoute(true);
    // Índice de km acumulados → progreso/clasificación virtual
    setRouteIndex(buildRouteIndex(coordinates));

    // Remove existing route if any
    if (map.current.getLayer('route')) {
      map.current.removeLayer('route');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }

    // Add the route as a line layer
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      },
    });

    map.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#FF6B35',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    });

    // Fit map to route bounds
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord));
    // maxZoom: una ruta corta encuadrada sin tope se va a un zoom donde no
    // hay tiles y el mapa aparece en blanco
    map.current.fitBounds(bounds, { padding: 50, maxZoom: 15 });
  };

  const fetchInitialPositions = async () => {
    // Use RPC function to get positions with runner info (bypasses RLS)
    let { data, error } = await supabase.rpc('get_live_gps_positions', {
      p_race_id: raceId,
      p_distance_id: distanceId || null
    });

    if (error) {
      console.error('Error fetching positions:', error);
      return;
    }

    // Ventana de captura cerrada: modo finalizado — participantes con track
    // (7 días tras el evento) para poder ver y reproducir los recorridos
    if (!data || data.length === 0) {
      const replay = await supabase.rpc('get_event_participants_replay', {
        p_race_id: raceId,
        p_distance_id: distanceId || null,
      });
      if (!replay.error && replay.data && replay.data.length > 0) {
        data = replay.data;
        setFinalizadoMode(true);
      } else {
        setFinalizadoMode(false);
      }
    } else {
      setFinalizadoMode(false);
    }

    const positions: RunnerPosition[] = (data || []).map((item: any) => ({
      id: item.gps_id,
      registration_id: item.registration_id,
      latitude: parseFloat(String(item.latitude)),
      longitude: parseFloat(String(item.longitude)),
      timestamp: item.gps_timestamp,
      bib_number: item.bib_number != null ? String(item.bib_number) : null,
      runner_name: item.runner_name || 'Corredor',
      heading: item.heading != null ? parseFloat(String(item.heading)) : null,
      speed: item.speed != null ? parseFloat(String(item.speed)) : null,
      battery: item.battery != null ? parseFloat(String(item.battery)) : null,
      source: item.source ?? null,
    }));

    setRunnerPositions(positions);
    // Durante la repetición del grupo, los marcadores los mueve el reloj maestro
    if (!groupPlaybackRef.current) updateMarkers(positions);
  };
  const setupRealtimeSubscription = () => {
    const onNewPosition = () => {
      fetchInitialPositions();
      // Also refresh runner track if one is selected
      if (selectedRunner) {
        fetchRunnerTrack(selectedRunner.registration_id);
      }
    };

    const channel = supabase
      .channel('gps_tracking_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_tracking',
          filter: `race_id=eq.${raceId}`,
        },
        onNewPosition
      )
      .subscribe();

    // Pipeline de la app Camberas Track (gps_positions).
    // Filtramos por event_id (= race_distance_id) cuando hay distancia elegida.
    const appChannel = supabase
      .channel('gps_positions_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_positions',
          ...(distanceId ? { filter: `event_id=eq.${distanceId}` } : {}),
        },
        onNewPosition
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(appChannel);
    };
  };

  // ── Alertas SOS ──────────────────────────────────────────────────────────
  const fetchSosAlerts = async () => {
    const { data, error } = await supabase.rpc('get_race_sos_alerts', {
      p_race_id: raceId,
    });
    if (error) {
      console.error('Error fetching SOS alerts:', error);
      return;
    }
    setSosAlerts(
      ((data as any[]) || []).map((a) => ({
        id: a.id,
        lat: parseFloat(String(a.lat)),
        lng: parseFloat(String(a.lng)),
        triggered_at: a.triggered_at,
        resolved_at: a.resolved_at,
        bib_number: a.bib_number != null ? String(a.bib_number) : null,
        runner_name: a.runner_name || 'Corredor',
      }))
    );
  };

  useEffect(() => {
    if (!mapReady) return;
    fetchSosAlerts();

    const channel = supabase
      .channel('gps_sos_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gps_sos_alerts' },
        () => fetchSosAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, mapReady]);

  // Pintar marcadores SOS (solo alertas sin resolver)
  useEffect(() => {
    if (!map.current) return;
    sosMarkers.current.forEach((m) => m.remove());
    sosMarkers.current = [];

    sosAlerts
      .filter((a) => !a.resolved_at)
      .forEach((alert) => {
        const el = document.createElement('div');
        el.className = 'sos-marker';
        el.innerHTML = `
          <div style="background-color: #dc2626; border: 3px solid white; box-shadow: 0 0 12px rgba(220,38,38,0.8);" class="rounded-full w-10 h-10 flex items-center justify-center text-white font-bold text-base animate-pulse">
            🆘
          </div>
        `;
        const marker = new mapboxgl.Marker(el)
          .setLngLat([alert.lng, alert.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              // El dorsal solo lo devuelve la RPC a admin u organizador: en el
              // mapa publico viene NULL a proposito, y ahi no se pinta la linea
              // en vez de dejar un "Dorsal: N/A" que no dice nada
              `<div class="p-2">
                <strong>🆘 SOS — ${alert.runner_name}</strong><br/>
                ${alert.bib_number ? `Dorsal: ${alert.bib_number}<br/>` : ''}
                ${formatLocalTime(alert.triggered_at)}
              </div>`
            )
          )
          .addTo(map.current!);
        sosMarkers.current.push(marker);
      });
  }, [sosAlerts, mapReady]);

  // Setup realtime subscription for timing readings (checkpoint passes)
  const setupTimingReadingsSubscription = () => {
    const channel = supabase
      .channel('timing_readings_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timing_readings',
          filter: `race_id=eq.${raceId}`,
        },
        async (payload) => {
          const newReading = payload.new as any;
          
          // Only show notification for geofence readings
          if (newReading.reading_type !== 'gps_geofence') return;
          
          // Get checkpoint name
          let checkpointName = 'Checkpoint';
          if (newReading.checkpoint_id) {
            const { data: checkpoint } = await supabase
              .from('race_checkpoints')
              .select('name')
              .eq('id', newReading.checkpoint_id)
              .single();
            
            if (checkpoint) {
              checkpointName = checkpoint.name;
            }
          }
          
          // Get runner name
          let runnerName = `Dorsal #${newReading.bib_number}`;
          if (newReading.registration_id) {
            const runner = runnerPositions.find(r => r.registration_id === newReading.registration_id);
            if (runner) {
              runnerName = runner.runner_name;
            }
          }
          
          // Show toast notification
          toast.success(
            `🏃 ${runnerName} pasó por ${checkpointName}`,
            {
              description: `Dorsal #${newReading.bib_number} - ${formatLocalTime(newReading.timing_timestamp)}`,
              duration: 5000,
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const updateMarkers = (positions: RunnerPosition[]) => {
    if (!map.current) return;

    positions.forEach((position) => {
      let marker = markers.current.get(position.registration_id);
      
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'runner-marker';
        const hasHeading = position.heading !== null && position.heading !== undefined;
        const rotation = hasHeading ? position.heading : 0;
        // La flecha de rumbo gira alrededor del dorsal; el número queda siempre vertical
        el.innerHTML = `
          <div class="relative w-8 h-8">
            <div class="marker-heading" style="position: absolute; inset: -8px; transform: rotate(${rotation}deg); display: ${hasHeading ? 'block' : 'none'};">
              <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid hsl(var(--primary));"></div>
            </div>
            <div class="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-lg">
              ${position.bib_number || '?'}
            </div>
          </div>
        `;
        
        // Add click handler to select runner
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedRunner(position);
        });

        marker = new mapboxgl.Marker(el)
          .setLngLat([position.longitude, position.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div class="p-2">
                <strong>${position.runner_name}</strong><br/>
                Dorsal: ${position.bib_number || 'N/A'}<br/>
                <button onclick="window.selectRunner && window.selectRunner('${position.registration_id}')" class="text-blue-500 underline text-sm mt-1">Ver recorrido</button>
              </div>`
            )
          )
          .addTo(map.current!);

        markers.current.set(position.registration_id, marker);
      } else {
        marker.setLngLat([position.longitude, position.latitude]);
        // Actualizar el rumbo de la flecha (antes se quedaba congelado al crear)
        const headingEl = marker.getElement().querySelector('.marker-heading') as HTMLElement | null;
        if (headingEl) {
          const hasHeading = position.heading !== null && position.heading !== undefined;
          headingEl.style.display = hasHeading ? 'block' : 'none';
          if (hasHeading) headingEl.style.transform = `rotate(${position.heading}deg)`;
        }
      }

      // Atenuar corredores sin señal reciente
      const stale = Date.now() - new Date(position.timestamp).getTime() > STALE_MS;
      marker.getElement().style.opacity = stale ? '0.4' : '1';
    });

    // Only fit bounds to runners if no GPX route is loaded (nunca durante la repetición)
    if (positions.length > 0 && !gpxUrl && !groupPlaybackRef.current) {
      const bounds = new mapboxgl.LngLatBounds();
      positions.forEach((pos) => {
        bounds.extend([pos.longitude, pos.latitude]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  // Expose selectRunner to window for popup button
  useEffect(() => {
    (window as any).selectRunner = (registrationId: string) => {
      const runner = runnerPositions.find(r => r.registration_id === registrationId);
      if (runner) setSelectedRunner(runner);
    };
    return () => {
      delete (window as any).selectRunner;
    };
  }, [runnerPositions]);

  const handleSelectRunner = (runner: RunnerPosition) => {
    // En repetición de grupo, el toque alterna ocultar/mostrar al corredor
    if (groupPlaybackRef.current) {
      toggleHiddenInReplay(runner.registration_id);
      return;
    }
    setSelectedRunner(runner);
  };

  const handleClearSelection = () => {
    setSelectedRunner(null);
    setIsPlaybackMode(false);
    if (playbackMarker.current) {
      playbackMarker.current.remove();
      playbackMarker.current = null;
    }
  };

  const handleStartPlayback = () => {
    setIsPlaybackMode(true);
  };

  const handleQuickPlayback = (runner: RunnerPosition, e: React.MouseEvent) => {
    e.stopPropagation();
    if (groupPlaybackRef.current) stopGroupPlayback();
    setSelectedRunner(runner);
    setPendingPlayback(true);
    if (isMobile) {
      setIsRunnersPanelExpanded(false);
    }
  };

  // ── Repetición del grupo: reloj maestro sobre todos los tracks ───────────
  const startGroupPlayback = async () => {
    setGroupLoading(true);
    try {
      handleClearSelection();
      const entries = await Promise.all(
        runnerPositions.map(async runner => {
          try {
            return [runner.registration_id, await loadTrackPoints(runner)] as const;
          } catch {
            return [runner.registration_id, [] as RunnerTrackPoint[]] as const;
          }
        })
      );
      const tracks = new Map(entries.filter(([, pts]) => pts.length >= 2));
      if (tracks.size === 0) {
        toast.info('Ningún participante tiene track para reproducir');
        return;
      }
      groupTracksRef.current = tracks;
      setGroupTracks(tracks);
      hiddenInReplayRef.current = new Set();
      setHiddenInReplay(new Set());
      groupPlaybackRef.current = true;
      setIsGroupPlayback(true);
      if (isMobile) setIsRunnersPanelExpanded(false);
    } finally {
      setGroupLoading(false);
    }
  };

  const stopGroupPlayback = () => {
    groupPlaybackRef.current = false;
    setIsGroupPlayback(false);
    setReplayPositions(null);
    // Restaurar los marcadores a las posiciones en vivo
    markers.current.forEach(m => (m.getElement().style.display = ''));
    updateMarkers(runnerPositions);
  };

  const toggleHiddenInReplay = (registrationId: string) => {
    const next = new Set(hiddenInReplayRef.current);
    if (next.has(registrationId)) next.delete(registrationId);
    else next.add(registrationId);
    hiddenInReplayRef.current = next;
    setHiddenInReplay(next);
  };

  /** Rumbo entre dos puntos, en grados desde el norte */
  const bearingDeg = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };

  const handleGroupTimeChange = useCallback(
    (timeMs: number) => {
      if (!groupPlaybackRef.current) return;
      const liveById = new Map(runnerPositions.map(r => [r.registration_id, r]));
      const positions: RunnerPosition[] = [];

      groupTracksRef.current.forEach((pts, id) => {
        const marker = markers.current.get(id);
        if (hiddenInReplayRef.current.has(id)) {
          if (marker) marker.getElement().style.display = 'none';
          return;
        }
        const start = +new Date(pts[0].timestamp);
        if (timeMs < start) {
          // Aún no había empezado a emitir
          if (marker) marker.getElement().style.display = 'none';
          return;
        }
        // Segmento que contiene el instante (búsqueda binaria)
        let lo = 0;
        let hi = pts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (+new Date(pts[mid].timestamp) <= timeMs) lo = mid;
          else hi = mid - 1;
        }
        let latitude: number;
        let longitude: number;
        let heading: number | null = null;
        const speed = pts[lo].speed;
        if (lo >= pts.length - 1) {
          latitude = pts[lo].latitude;
          longitude = pts[lo].longitude;
        } else {
          const a = pts[lo];
          const b = pts[lo + 1];
          const ta = +new Date(a.timestamp);
          const tb = +new Date(b.timestamp);
          const f = tb > ta ? (timeMs - ta) / (tb - ta) : 0;
          latitude = a.latitude + (b.latitude - a.latitude) * f;
          longitude = a.longitude + (b.longitude - a.longitude) * f;
          if (Math.abs(b.latitude - a.latitude) > 1e-6 || Math.abs(b.longitude - a.longitude) > 1e-6) {
            heading = bearingDeg(a.latitude, a.longitude, b.latitude, b.longitude);
          }
        }
        if (marker) marker.getElement().style.display = '';
        const live = liveById.get(id);
        positions.push({
          id,
          registration_id: id,
          latitude,
          longitude,
          timestamp: new Date(timeMs).toISOString(),
          bib_number: live?.bib_number ?? null,
          runner_name: live?.runner_name ?? 'Corredor',
          heading,
          speed,
          battery: null,
          source: live?.source ?? null,
        });
      });

      updateMarkers(positions);
      // El panel (clasificación + gaps) se refresca a ritmo más tranquilo
      const now = Date.now();
      if (now - lastPanelUpdateRef.current > 300) {
        lastPanelUpdateRef.current = now;
        setReplayPositions(positions);
      }
    },
    [runnerPositions]
  );

  const handlePlaybackPositionChange = useCallback((index: number, point: RunnerTrackPoint) => {
    if (!map.current) return;
    
    // Create or update playback marker
    if (!playbackMarker.current) {
      const el = document.createElement('div');
      el.className = 'playback-marker';
      el.innerHTML = `
        <div class="flex flex-col items-center">
          <div style="background-color: #ef4444; border: 3px solid white; box-shadow: 0 0 10px rgba(239,68,68,0.6);" class="rounded-full w-10 h-10 flex items-center justify-center text-white font-bold text-sm animate-pulse">
            ${selectedRunner?.bib_number || '?'}
          </div>
        </div>
      `;
      
      playbackMarker.current = new mapboxgl.Marker(el)
        .setLngLat([point.longitude, point.latitude])
        .addTo(map.current);
    } else {
      playbackMarker.current.setLngLat([point.longitude, point.latitude]);
    }

    // Follow the playback marker if following is enabled
    if (isFollowing) {
      map.current.flyTo({
        center: [point.longitude, point.latitude],
        zoom: map.current.getZoom(),
        duration: 300,
      });
    }
  }, [selectedRunner, isFollowing]);

  const formatTime = (timestamp: string) => {
    return formatLocalTime(timestamp);
  };

  // ── Progreso sobre el recorrido + clasificación virtual ──────────────────
  // En repetición de grupo, el panel refleja el instante del reloj maestro
  const displayPositions = replayPositions ?? runnerPositions;

  const progressByRunner = useMemo(() => {
    const result = new Map<string, RouteProgress>();
    if (!routeIndex) return result;
    for (const runner of displayPositions) {
      const progress = projectOnRoute(routeIndex, runner.longitude, runner.latitude);
      if (progress) result.set(runner.registration_id, progress);
    }
    return result;
  }, [displayPositions, routeIndex]);

  const isStale = (runner: RunnerPosition) =>
    replayPositions == null && Date.now() - new Date(runner.timestamp).getTime() > STALE_MS;

  // Orden: primero por km recorridos (clasificación virtual), sin progreso al final
  const sortedRunners = useMemo(() => {
    return [...displayPositions].sort((a, b) => {
      const pa = progressByRunner.get(a.registration_id)?.km ?? -1;
      const pb = progressByRunner.get(b.registration_id)?.km ?? -1;
      return pb - pa;
    });
  }, [displayPositions, progressByRunner]);

  // Km del que va en cabeza — referencia para los gaps
  const leaderKm = useMemo(() => {
    for (const r of sortedRunners) {
      const p = progressByRunner.get(r.registration_id);
      if (p) return p.km;
    }
    return null;
  }, [sortedRunners, progressByRunner]);

  /** Gap sobre la ruta respecto al primero: "+180 m (~40 s)" / "cabeza" */
  const formatGap = (runner: RunnerPosition): string | null => {
    if (leaderKm == null || progressByRunner.size < 2) return null;
    const p = progressByRunner.get(runner.registration_id);
    if (!p) return null;
    const gapM = (leaderKm - p.km) * 1000;
    if (gapM < 15) return '🚩 cabeza';
    const dist = gapM >= 1000 ? `+${(gapM / 1000).toFixed(1)} km` : `+${Math.round(gapM)} m`;
    // Estimación en tiempo al ritmo actual del corredor
    if (runner.speed != null && runner.speed > 0.3) {
      const s = gapM / runner.speed;
      const eta = s < 60 ? `~${Math.round(s)} s` : `~${Math.round(s / 60)} min`;
      return `${dist} (${eta})`;
    }
    return dist;
  };

  // Rango temporal del reloj maestro (primer y último punto de todos los tracks)
  const groupTimeRange = useMemo(() => {
    let t0 = Infinity;
    let t1 = -Infinity;
    groupTracks.forEach(pts => {
      t0 = Math.min(t0, +new Date(pts[0].timestamp));
      t1 = Math.max(t1, +new Date(pts[pts.length - 1].timestamp));
    });
    return t0 < t1 ? { t0, t1 } : null;
  }, [groupTracks]);

  const formatSpeed = (speed: number | null) => {
    if (speed == null || speed <= 0.3) return null;
    if (isBikeRace) return `${(speed * 3.6).toFixed(1)} km/h`;
    // Ritmo para carreras a pie (trail/running/marcha)
    const secPerKm = 1000 / speed;
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')} min/km`;
  };

  const formatRemaining = (p: RouteProgress | undefined) => {
    if (!p) return null;
    return p.remainingKm >= 1
      ? `${p.remainingKm.toFixed(1)} km a meta`
      : `${Math.round(p.remainingKm * 1000)} m a meta`;
  };

  /** Línea de estadísticas compacta para las tarjetas de corredor */
  const runnerStats = (runner: RunnerPosition) => {
    const parts: string[] = [];
    const gap = formatGap(runner);
    if (gap) parts.push(gap);
    const p = progressByRunner.get(runner.registration_id);
    const remaining = formatRemaining(p);
    if (remaining) parts.push(remaining);
    const speed = formatSpeed(runner.speed);
    if (speed) parts.push(speed);
    if (runner.battery != null) parts.push(`🔋${Math.round(runner.battery)}%`);
    return parts.join(' · ');
  };

  return (
    <div className={`relative w-full ${isMobile ? 'h-[calc(100vh-120px)]' : 'h-full min-h-[600px]'} flex flex-col md:flex-row`}>
      {/* Desktop Runners Panel - Left side */}
      {!isMobile && (
        <div className="w-64 bg-card border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Corredores ({runnerPositions.length})
              </h3>
              {finalizadoMode && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Evento finalizado — repetición disponible
                </p>
              )}
            </div>
            {runnerPositions.length > 1 && !isGroupPlayback && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={startGroupPlayback}
                disabled={groupLoading}
                title="Repetición del grupo"
              >
                {groupLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" /> Grupo
                  </>
                )}
              </Button>
            )}
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sortedRunners.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2 text-center">
                  No hay datos GPS disponibles
                </p>
              ) : (
                sortedRunners.map((runner, rankIdx) => (
                  <div
                    key={runner.registration_id}
                    className={`w-full p-2 rounded-lg transition-colors ${
                      selectedRunner?.registration_id === runner.registration_id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    } ${isStale(runner) || hiddenInReplay.has(runner.registration_id) ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectRunner(runner)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {progressByRunner.has(runner.registration_id) && (
                          <span className="text-xs font-bold w-5 text-right flex-shrink-0 tabular-nums">
                            {rankIdx + 1}º
                          </span>
                        )}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          selectedRunner?.registration_id === runner.registration_id
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-primary text-primary-foreground'
                        }`}>
                          {runner.bib_number || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {runner.runner_name}
                            {isStale(runner) && ' ⚠️'}
                          </p>
                          <p className={`text-xs ${
                            selectedRunner?.registration_id === runner.registration_id
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground'
                          }`}>
                            {isStale(runner)
                              ? `Sin señal desde ${formatTime(runner.timestamp)}`
                              : runnerStats(runner) || formatTime(runner.timestamp)}
                          </p>
                          {progressByRunner.has(runner.registration_id) && (
                            <div className="h-1 mt-1 rounded bg-muted-foreground/20 overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded"
                                style={{ width: `${progressByRunner.get(runner.registration_id)!.pct.toFixed(1)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleQuickPlayback(runner, e)}
                        className={`h-8 w-8 flex-shrink-0 ${
                          selectedRunner?.registration_id === runner.registration_id
                            ? 'text-primary-foreground hover:bg-primary-foreground/20'
                            : 'text-primary hover:bg-primary/10'
                        }`}
                        title="Reproducir recorrido"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Map Container - Full height on mobile */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainer} className="absolute inset-0 md:rounded-r-lg" />
        
        {/* Map Controls */}
        <TooltipProvider>
          <MapControls
            onCenterRoute={handleCenterRoute}
            onCenterRunners={handleCenterRunners}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onToggleFullscreen={handleToggleFullscreen}
            onChangeStyle={handleChangeStyle}
            onFollowRunner={handleFollowRunner}
            isFollowing={isFollowing}
            hasRoute={hasRoute}
            hasRunners={runnerPositions.length > 0}
            currentStyle={mapStyle}
          />
        </TooltipProvider>
        
        {/* Selected Runner Info Panel */}
        {selectedRunner && !isPlaybackMode && (
          <div className="absolute top-4 left-4 right-4 max-w-md bg-card rounded-lg shadow-lg border p-4 z-10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {selectedRunner.bib_number || '?'}
                </div>
                <div>
                  <h4 className="font-semibold">{selectedRunner.runner_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Dorsal #{selectedRunner.bib_number}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={handleClearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {loadingTrack ? (
              <p className="text-sm text-muted-foreground mt-3">Cargando recorrido...</p>
            ) : runnerTrack.length > 0 ? (
              <div className="mt-3 pt-3 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-blue-500" />
                      <span>{runnerTrack.length} puntos GPS</span>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={handleStartPlayback}
                    className="gap-1.5"
                  >
                    <Play className="h-4 w-4" />
                    Reproducir
                  </Button>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Inicio: {formatTime(runnerTrack[0].timestamp)}</span>
                  <span>Último: {formatTime(runnerTrack[runnerTrack.length - 1].timestamp)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-3">Sin datos de recorrido</p>
            )}
          </div>
        )}

        {/* Group Playback Controls Panel */}
        {isGroupPlayback && groupTimeRange && (
          <div className="absolute top-4 left-4 right-4 max-w-md z-10">
            <div className="relative">
              <Button
                size="icon"
                variant="secondary"
                onClick={stopGroupPlayback}
                className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white shadow-md z-10"
              >
                <X className="h-4 w-4" />
              </Button>
              <GroupPlaybackControls
                t0={groupTimeRange.t0}
                t1={groupTimeRange.t1}
                participantes={groupTracks.size - hiddenInReplay.size}
                onTimeChange={handleGroupTimeChange}
              />
            </div>
          </div>
        )}

        {/* Playback Controls Panel */}
        {selectedRunner && isPlaybackMode && runnerTrack.length > 0 && (
          <div className="absolute top-4 left-4 right-4 max-w-md z-10">
            <div className="relative">
              <Button 
                size="icon" 
                variant="secondary" 
                onClick={handleClearSelection}
                className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white shadow-md z-10"
              >
                <X className="h-4 w-4" />
              </Button>
              <TrackPlaybackControls
                trackPoints={runnerTrack}
                onPositionChange={handlePlaybackPositionChange}
                runnerName={selectedRunner.runner_name}
                bibNumber={selectedRunner.bib_number}
              />
            </div>
          </div>
        )}

        {/* Legend - Hidden on mobile when panel is expanded */}
        <div className={`absolute bottom-4 left-4 bg-card/90 backdrop-blur rounded-lg shadow-lg border p-3 z-10 ${
          isMobile && isRunnersPanelExpanded ? 'hidden' : ''
        }`}>
          <div className="space-y-2 text-xs">
            {/* Solo si hay recorrido de verdad. Se pintaba siempre, y en una
                carrera sin GPX hacia creer que habia una ruta cargada que no
                se veia — cuando lo que pasaba es que no habia ninguna. */}
            {gpxUrl && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-[#FF6B35] rounded" />
                <span>Recorrido GPX</span>
              </div>
            )}
            {selectedRunner && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-[#3b82f6] rounded" />
                <span>Track del corredor</span>
              </div>
            )}
            {sosAlerts.some((a) => !a.resolved_at) && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#dc2626]" />
                <span>Alerta SOS activa</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Runners Panel - Bottom collapsible */}
      {isMobile && (
        <div 
          className={`absolute left-0 right-0 bg-card border-t rounded-t-2xl shadow-lg z-20 transition-all duration-300 ease-in-out ${
            isRunnersPanelExpanded ? 'bottom-0 h-[50vh]' : 'bottom-0 h-auto max-h-32'
          }`}
        >
          {/* Handle to expand/collapse */}
          <button
            onClick={() => setIsRunnersPanelExpanded(!isRunnersPanelExpanded)}
            className="w-full flex flex-col items-center pt-2 pb-2 px-4"
          >
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mb-2" />
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm">
                  Corredores ({runnerPositions.length})
                  {finalizadoMode && <span className="font-normal text-muted-foreground"> · finalizado</span>}
                </span>
                {runnerPositions.length > 1 && !isGroupPlayback && (
                  <span
                    role="button"
                    className="inline-flex items-center h-7 px-2 text-xs border rounded-md bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      startGroupPlayback();
                    }}
                  >
                    {groupLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1" /> Grupo
                      </>
                    )}
                  </span>
                )}
              </div>
              {isRunnersPanelExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </button>

          {/* Collapsed state - show mini list */}
          {!isRunnersPanelExpanded && sortedRunners.length > 0 && (
            <div className="px-4 pb-3">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {sortedRunners.slice(0, 5).map((runner) => (
                  <button
                    key={runner.registration_id}
                    onClick={() => {
                      handleSelectRunner(runner);
                    }}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border transition-colors ${
                      selectedRunner?.registration_id === runner.registration_id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 hover:bg-muted border-border'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedRunner?.registration_id === runner.registration_id
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary text-primary-foreground'
                    }`}>
                      {runner.bib_number || '?'}
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">
                      {runner.runner_name.split(' ')[0]}
                    </span>
                  </button>
                ))}
                {sortedRunners.length > 5 && (
                  <button
                    onClick={() => setIsRunnersPanelExpanded(true)}
                    className="flex-shrink-0 px-3 py-2 rounded-full bg-muted/50 border border-border text-sm text-muted-foreground"
                  >
                    +{sortedRunners.length - 5} más
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Expanded state - full list */}
          {isRunnersPanelExpanded && (
            <ScrollArea className="h-[calc(50vh-60px)]">
              <div className="p-4 space-y-2">
                {sortedRunners.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay datos GPS disponibles
                  </p>
                ) : (
                  sortedRunners.map((runner, rankIdx) => (
                    <div
                      key={runner.registration_id}
                      className={`w-full p-3 rounded-xl transition-colors ${
                        selectedRunner?.registration_id === runner.registration_id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted'
                      } ${isStale(runner) || hiddenInReplay.has(runner.registration_id) ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            handleSelectRunner(runner);
                            setIsRunnersPanelExpanded(false);
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          {progressByRunner.has(runner.registration_id) && (
                            <span className="text-sm font-bold w-6 text-right flex-shrink-0 tabular-nums">
                              {rankIdx + 1}º
                            </span>
                          )}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            selectedRunner?.registration_id === runner.registration_id
                              ? 'bg-primary-foreground text-primary'
                              : 'bg-primary text-primary-foreground'
                          }`}>
                            {runner.bib_number || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {runner.runner_name}
                              {isStale(runner) && ' ⚠️'}
                            </p>
                            <p className={`text-sm ${
                              selectedRunner?.registration_id === runner.registration_id
                                ? 'text-primary-foreground/80'
                                : 'text-muted-foreground'
                            }`}>
                              {isStale(runner)
                                ? `Sin señal desde ${formatTime(runner.timestamp)}`
                                : runnerStats(runner) || `Última actualización: ${formatTime(runner.timestamp)}`}
                            </p>
                            {progressByRunner.has(runner.registration_id) && (
                              <div className="h-1.5 mt-1 rounded bg-muted-foreground/20 overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded"
                                  style={{ width: `${progressByRunner.get(runner.registration_id)!.pct.toFixed(1)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => handleQuickPlayback(runner, e)}
                          className={`h-10 w-10 flex-shrink-0 ${
                            selectedRunner?.registration_id === runner.registration_id
                              ? 'text-primary-foreground hover:bg-primary-foreground/20'
                              : 'text-primary hover:bg-primary/10'
                          }`}
                          title="Reproducir recorrido"
                        >
                          <Play className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      <style>{`
        .runner-marker {
          cursor: pointer;
          z-index: 10;
        }
        .checkpoint-marker {
          cursor: pointer;
          z-index: 5;
        }
        .roadbook-marker {
          cursor: pointer;
          z-index: 3;
        }
        .playback-marker {
          cursor: pointer;
          z-index: 20;
        }
        .sos-marker {
          cursor: pointer;
          z-index: 30;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
