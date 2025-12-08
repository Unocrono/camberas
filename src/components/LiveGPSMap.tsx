import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile } from '@/lib/gpxParser';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, User, MapPin } from 'lucide-react';

interface RunnerPosition {
  id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  bib_number: number | null;
  runner_name: string;
}

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
  const [runnerPositions, setRunnerPositions] = useState<RunnerPosition[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [roadbookItems, setRoadbookItems] = useState<RoadbookItem[]>([]);
  const [gpxUrl, setGpxUrl] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  
  // New state for runner track
  const [selectedRunner, setSelectedRunner] = useState<RunnerPosition | null>(null);
  const [runnerTrack, setRunnerTrack] = useState<RunnerTrackPoint[]>([]);
  const [loadingTrack, setLoadingTrack] = useState(false);

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

    map.current.on('load', () => {
      setMapReady(true);
    });

    // If style already loaded
    if (map.current.isStyleLoaded()) {
      setMapReady(true);
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
    fetchGpx();
    fetchCheckpoints();
    fetchRoadbookItems();
  }, [distanceId, raceId, mapReady]);

  // Setup realtime and fetch positions
  useEffect(() => {
    if (!mapReady) return;
    fetchInitialPositions();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [raceId, mapReady]);

  // Load runner track when selected
  useEffect(() => {
    if (selectedRunner) {
      fetchRunnerTrack(selectedRunner.registration_id);
    } else {
      clearRunnerTrack();
    }
  }, [selectedRunner]);

  const clearRunnerTrack = () => {
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
    setRunnerTrack([]);
  };

  const fetchRunnerTrack = async (registrationId: string) => {
    setLoadingTrack(true);
    try {
      const { data, error } = await supabase
        .from('gps_tracking')
        .select('latitude, longitude, timestamp, speed, altitude')
        .eq('registration_id', registrationId)
        .eq('race_id', raceId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      const trackPoints: RunnerTrackPoint[] = (data || []).map(point => ({
        latitude: parseFloat(String(point.latitude)),
        longitude: parseFloat(String(point.longitude)),
        timestamp: point.timestamp,
        speed: point.speed ? parseFloat(String(point.speed)) : null,
        altitude: point.altitude ? parseFloat(String(point.altitude)) : null,
      }));

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

    // Clear existing runner track
    clearRunnerTrack();

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
        return;
      }
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
      setGpxUrl(distanceData.gpx_file_url);
      loadGpxRoute(distanceData.gpx_file_url);
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
      setGpxUrl(anyDistanceData.gpx_file_url);
      loadGpxRoute(anyDistanceData.gpx_file_url);
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

  const loadGpxRoute = async (url: string) => {
    try {
      const response = await fetch(url);
      const gpxText = await response.text();
      
      const parsedGpx = parseGpxFile(gpxText);

      if (!map.current || !parsedGpx.tracks || parsedGpx.tracks.length === 0) {
        console.warn('GPX parsing failed or no tracks found');
        return;
      }

      addGpxToMap(parsedGpx);
    } catch (error) {
      console.error('Error loading GPX:', error);
    }
  };

  const addGpxToMap = (gpx: ReturnType<typeof parseGpxFile>) => {
    if (!map.current) return;

    const coordinates: [number, number][] = [];
    
    gpx.tracks.forEach((track) => {
      track.points.forEach((point) => {
        coordinates.push([point.lon, point.lat]);
      });
    });

    if (coordinates.length === 0) return;

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
    map.current.fitBounds(bounds, { padding: 50 });
  };

  const fetchInitialPositions = async () => {
    // First, get the latest GPS position for each registration in this race
    // Using a subquery approach to get the most recent position per runner
    let query = supabase
      .from('gps_tracking')
      .select(`
        id,
        registration_id,
        latitude,
        longitude,
        timestamp,
        registrations!inner(
          bib_number,
          race_distance_id,
          user_id,
          guest_first_name,
          guest_last_name,
          profiles(
            first_name,
            last_name
          )
        )
      `)
      .eq('race_id', raceId)
      .order('timestamp', { ascending: false });

    // Filter by distance if specified
    if (distanceId) {
      query = query.eq('registrations.race_distance_id', distanceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching positions:', error);
      return;
    }

    const positions: RunnerPosition[] = [];
    const uniqueRegistrations = new Set<string>();

    data?.forEach((item: any) => {
      if (!uniqueRegistrations.has(item.registration_id)) {
        uniqueRegistrations.add(item.registration_id);
        
        // Get runner name from profile or guest fields
        let runnerName = 'Corredor';
        if (item.registrations.profiles?.first_name) {
          runnerName = `${item.registrations.profiles.first_name} ${item.registrations.profiles.last_name || ''}`.trim();
        } else if (item.registrations.guest_first_name) {
          runnerName = `${item.registrations.guest_first_name} ${item.registrations.guest_last_name || ''}`.trim();
        }
        
        positions.push({
          id: item.id,
          registration_id: item.registration_id,
          latitude: parseFloat(item.latitude),
          longitude: parseFloat(item.longitude),
          timestamp: item.timestamp,
          bib_number: item.registrations.bib_number,
          runner_name: runnerName,
        });
      }
    });

    setRunnerPositions(positions);
    updateMarkers(positions);
  };

  const setupRealtimeSubscription = () => {
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
        () => {
          fetchInitialPositions();
          // Also refresh runner track if one is selected
          if (selectedRunner) {
            fetchRunnerTrack(selectedRunner.registration_id);
          }
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
        el.innerHTML = `
          <div class="flex flex-col items-center">
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
      }
    });

    // Only fit bounds to runners if no GPX route is loaded
    if (positions.length > 0 && !gpxUrl) {
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
    setSelectedRunner(runner);
  };

  const handleClearSelection = () => {
    setSelectedRunner(null);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="relative w-full h-full min-h-[600px] flex">
      {/* Runners Panel */}
      <div className="w-64 bg-card border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Corredores ({runnerPositions.length})
          </h3>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {runnerPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2 text-center">
                No hay datos GPS disponibles
              </p>
            ) : (
              runnerPositions.map((runner) => (
                <button
                  key={runner.registration_id}
                  onClick={() => handleSelectRunner(runner)}
                  className={`w-full text-left p-2 rounded-lg transition-colors ${
                    selectedRunner?.registration_id === runner.registration_id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedRunner?.registration_id === runner.registration_id
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary text-primary-foreground'
                    }`}>
                      {runner.bib_number || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{runner.runner_name}</p>
                      <p className={`text-xs ${
                        selectedRunner?.registration_id === runner.registration_id
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      }`}>
                        {formatTime(runner.timestamp)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0 rounded-r-lg" />
        
        {/* Selected Runner Info Panel */}
        {selectedRunner && (
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
              <div className="mt-3 pt-3 border-t space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    <span>{runnerTrack.length} puntos GPS</span>
                  </div>
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

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur rounded-lg shadow-lg border p-3 z-10">
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 bg-[#FF6B35] rounded" />
              <span>Recorrido GPX</span>
            </div>
            {selectedRunner && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-[#3b82f6] rounded" />
                <span>Track del corredor</span>
              </div>
            )}
          </div>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}
