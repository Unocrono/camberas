import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile } from '@/lib/gpxParser';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, Users, RefreshCw, Clock, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapControls } from '@/components/MapControls';
import { TooltipProvider } from '@/components/ui/tooltip';

interface MotoPosition {
  id: string;
  moto_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  heading: number | null;
  distance_from_start: number | null;
  moto: {
    id: string;
    name: string;
    name_tv: string | null;
    color: string;
    moto_order: number;
    is_active: boolean;
    race_distance_id: string | null;
  };
  distance_remaining: number | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
  gpx_file_url: string | null;
}

interface MotoMapViewerProps {
  selectedRaceId?: string;
}

const STORAGE_KEY = 'motoMapViewer_lastDistanceId';

export function MotoMapViewer({ selectedRaceId }: MotoMapViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const routeCoordinates = useRef<[number, number][]>([]);
  
  const [motoPositions, setMotoPositions] = useState<MotoPosition[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>('all');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Map controls state
  const [mapStyle, setMapStyle] = useState<'outdoors' | 'satellite' | 'streets' | 'light' | 'dark'>('outdoors');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasRoute, setHasRoute] = useState(false);
  const [selectedMoto, setSelectedMoto] = useState<MotoPosition | null>(null);
  
  const isMobile = useIsMobile();

  // Load last selected distance from localStorage
  useEffect(() => {
    if (selectedRaceId) {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${selectedRaceId}`);
      if (stored) {
        setSelectedDistanceId(stored);
      }
    }
  }, [selectedRaceId]);

  // Save selected distance to localStorage
  useEffect(() => {
    if (selectedRaceId && selectedDistanceId) {
      localStorage.setItem(`${STORAGE_KEY}_${selectedRaceId}`, selectedDistanceId);
    }
  }, [selectedRaceId, selectedDistanceId]);

  // Fetch mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        setMapboxToken(data.token);
      } catch (error) {
        console.error('Error fetching mapbox token:', error);
      }
    };
    fetchToken();
  }, []);

  // Fetch distances for the race
  useEffect(() => {
    if (!selectedRaceId) {
      setDistances([]);
      return;
    }

    const fetchDistances = async () => {
      const { data, error } = await supabase
        .from('race_distances')
        .select('id, name, distance_km, gpx_file_url')
        .eq('race_id', selectedRaceId)
        .order('distance_km', { ascending: true });

      if (!error && data) {
        setDistances(data);
      }
    };

    fetchDistances();
  }, [selectedRaceId]);

  // Map control functions
  const handleCenterRoute = useCallback(() => {
    if (!map.current || routeCoordinates.current.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    routeCoordinates.current.forEach(coord => bounds.extend(coord));
    map.current.fitBounds(bounds, { padding: 50 });
  }, []);

  const handleCenterMotos = useCallback(() => {
    if (!map.current || motoPositions.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    motoPositions.forEach(pos => {
      bounds.extend([pos.longitude, pos.latitude]);
    });
    map.current.fitBounds(bounds, { padding: 50 });
  }, [motoPositions]);

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
        addRouteToMap(routeCoordinates.current);
      }
    });
  }, []);

  const handleFollowMoto = useCallback(() => {
    if (!selectedMoto) return;
    setIsFollowing(prev => !prev);
    if (!isFollowing && map.current) {
      map.current.flyTo({
        center: [selectedMoto.longitude, selectedMoto.latitude],
        zoom: 16,
      });
    }
  }, [selectedMoto, isFollowing]);

  // Follow selected moto when position updates
  useEffect(() => {
    if (!isFollowing || !selectedMoto || !map.current) return;
    const updatedMoto = motoPositions.find(m => m.moto_id === selectedMoto.moto_id);
    if (updatedMoto) {
      map.current.flyTo({
        center: [updatedMoto.longitude, updatedMoto.latitude],
        zoom: map.current.getZoom(),
        duration: 1000,
      });
    }
  }, [motoPositions, selectedMoto, isFollowing]);

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

    if (map.current.isStyleLoaded()) {
      setMapReady(true);
    }

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  // Load GPX when distance changes
  useEffect(() => {
    if (!map.current || !mapReady || !selectedRaceId) return;
    
    // Clear existing route
    if (map.current.getLayer('route')) {
      map.current.removeLayer('route');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }
    routeCoordinates.current = [];
    setHasRoute(false);

    fetchGpx();
  }, [selectedDistanceId, selectedRaceId, mapReady]);

  const fetchGpx = async () => {
    if (!selectedRaceId) return;

    // If a specific distance is selected, get its GPX
    if (selectedDistanceId && selectedDistanceId !== 'all') {
      const distance = distances.find(d => d.id === selectedDistanceId);
      if (distance?.gpx_file_url) {
        await loadGpxRoute(distance.gpx_file_url);
        return;
      }
    }

    // Fallback: try to get GPX from first distance with GPX
    const distanceWithGpx = distances.find(d => d.gpx_file_url);
    if (distanceWithGpx?.gpx_file_url) {
      await loadGpxRoute(distanceWithGpx.gpx_file_url);
    }
  };

  const loadGpxRoute = async (url: string) => {
    try {
      const response = await fetch(url);
      const gpxText = await response.text();
      const parsedGpx = parseGpxFile(gpxText);

      if (!map.current || !parsedGpx.tracks || parsedGpx.tracks.length === 0) {
        return;
      }

      const coordinates: [number, number][] = [];
      parsedGpx.tracks.forEach((track) => {
        track.points.forEach((point) => {
          coordinates.push([point.lon, point.lat]);
        });
      });

      if (coordinates.length === 0) return;

      routeCoordinates.current = coordinates;
      setHasRoute(true);
      addRouteToMap(coordinates);

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord));
      map.current.fitBounds(bounds, { padding: 50 });
    } catch (error) {
      console.error('Error loading GPX:', error);
    }
  };

  const addRouteToMap = (coordinates: [number, number][]) => {
    if (!map.current) return;

    // Remove existing route if any
    if (map.current.getLayer('route')) {
      map.current.removeLayer('route');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }

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
  };

  // Fetch moto positions
  const fetchMotoPositions = useCallback(async () => {
    if (!selectedRaceId) {
      setMotoPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get active motos for this race
      const { data: motos, error: motosError } = await supabase
        .from('race_motos')
        .select('id, name, name_tv, color, moto_order, is_active, race_distance_id')
        .eq('race_id', selectedRaceId)
        .eq('is_active', true)
        .order('moto_order');

      if (motosError) throw motosError;

      // Build a map of distance_id -> distance_km for remaining calculation
      const distanceMap = new Map<string, number>();
      distances.forEach(d => distanceMap.set(d.id, d.distance_km));

      if (!motos || motos.length === 0) {
        setMotoPositions([]);
        setLoading(false);
        return;
      }

      // Get latest position for each moto
      const positions: MotoPosition[] = [];
      
      for (const moto of motos) {
        const { data: gpsData, error: gpsError } = await supabase
          .from('moto_gps_tracking')
          .select('id, latitude, longitude, timestamp, speed, heading, distance_from_start')
          .eq('race_id', selectedRaceId)
          .eq('moto_id', moto.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!gpsError && gpsData) {
          const distanceFromStart = gpsData.distance_from_start ? parseFloat(String(gpsData.distance_from_start)) : null;
          const totalDistance = moto.race_distance_id ? distanceMap.get(moto.race_distance_id) : null;
          const distanceRemaining = distanceFromStart !== null && totalDistance 
            ? Math.max(0, totalDistance - distanceFromStart) 
            : null;

          positions.push({
            id: gpsData.id,
            moto_id: moto.id,
            latitude: parseFloat(String(gpsData.latitude)),
            longitude: parseFloat(String(gpsData.longitude)),
            timestamp: gpsData.timestamp,
            speed: gpsData.speed ? parseFloat(String(gpsData.speed)) : null,
            heading: gpsData.heading ? parseFloat(String(gpsData.heading)) : null,
            distance_from_start: distanceFromStart,
            moto: moto,
            distance_remaining: distanceRemaining,
          });
        }
      }

      setMotoPositions(positions);
      setLastUpdate(new Date());
      updateMarkers(positions);
    } catch (error) {
      console.error('Error fetching moto positions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRaceId]);

  // Initial fetch and realtime subscription
  useEffect(() => {
    if (!mapReady || !selectedRaceId) return;

    fetchMotoPositions();

    // Setup realtime subscription
    const channel = supabase
      .channel('moto_gps_tracking_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moto_gps_tracking',
          filter: `race_id=eq.${selectedRaceId}`,
        },
        () => {
          fetchMotoPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRaceId, mapReady, fetchMotoPositions]);

  const updateMarkers = (positions: MotoPosition[]) => {
    if (!map.current) return;

    // Remove old markers
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();

    // Add new markers
    positions.forEach((pos) => {
      const el = document.createElement('div');
      el.className = 'moto-marker';
      el.innerHTML = `
        <div class="flex flex-col items-center cursor-pointer">
          <div style="background-color: ${pos.moto.color}; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4);" 
               class="rounded-full w-12 h-12 flex items-center justify-center text-white font-bold text-lg">
            🏍️
          </div>
          <div style="background-color: ${pos.moto.color};" class="text-white text-xs px-2 py-1 rounded mt-1 whitespace-nowrap shadow-lg font-semibold">
            ${pos.moto.name_tv || pos.moto.name}
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        setSelectedMoto(pos);
      });

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="p-3">
          <div class="font-bold text-lg" style="color: ${pos.moto.color};">${pos.moto.name}</div>
          ${pos.moto.name_tv ? `<div class="text-sm text-muted-foreground">TV: ${pos.moto.name_tv}</div>` : ''}
          <div class="mt-2 space-y-1 text-sm">
            ${pos.speed !== null ? `<div>🚀 Velocidad: ${pos.speed.toFixed(1)} km/h</div>` : ''}
            ${pos.distance_from_start !== null ? `<div>📏 Km recorrido: ${pos.distance_from_start.toFixed(2)} km</div>` : ''}
            ${pos.distance_remaining !== null ? `<div>🏁 Km hasta meta: ${pos.distance_remaining.toFixed(2)} km</div>` : ''}
            <div>🕐 Última actualización: ${new Date(pos.timestamp).toLocaleTimeString('es-ES')}</div>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([pos.longitude, pos.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.set(pos.moto_id, marker);
    });
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Bike className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecciona una carrera para ver el mapa de motos</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Bike className="h-5 w-5" />
              Mapa de Motos en Vivo
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Distance filter */}
              <Select value={selectedDistanceId} onValueChange={setSelectedDistanceId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos los eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.distance_km} km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={fetchMotoPositions} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Bike className="h-4 w-4" />
              <span>{motoPositions.length} motos activas</span>
            </div>
            {lastUpdate && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Última actualización: {lastUpdate.toLocaleTimeString('es-ES')}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative" style={{ height: isMobile ? '60vh' : '70vh' }}>
            {/* Map container */}
            <div ref={mapContainer} className="absolute inset-0" />
            
            {/* Map controls */}
            {mapReady && (
              <TooltipProvider>
                <MapControls
                  onCenterRoute={handleCenterRoute}
                  onCenterRunners={handleCenterMotos}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onToggleFullscreen={handleToggleFullscreen}
                  onChangeStyle={handleChangeStyle}
                  currentStyle={mapStyle}
                  hasRoute={hasRoute}
                  hasRunners={motoPositions.length > 0}
                  onFollowRunner={handleFollowMoto}
                  isFollowing={isFollowing}
                />
              </TooltipProvider>
            )}

            {/* Moto list panel */}
            {motoPositions.length > 0 && (
              <div className={`absolute ${isMobile ? 'bottom-0 left-0 right-0' : 'top-4 left-4 w-64'} z-10`}>
                <Card className="bg-background/95 backdrop-blur-sm shadow-lg">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Motos ({motoPositions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className={isMobile ? 'h-32' : 'h-64'}>
                      <div className="p-2 space-y-1">
                        {motoPositions.map((pos) => (
                          <div
                            key={pos.moto_id}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                              selectedMoto?.moto_id === pos.moto_id
                                ? 'bg-primary/10 border border-primary/20'
                                : 'hover:bg-muted'
                            }`}
                            onClick={() => {
                              setSelectedMoto(pos);
                              if (map.current) {
                                map.current.flyTo({
                                  center: [pos.longitude, pos.latitude],
                                  zoom: 15,
                                });
                              }
                            }}
                          >
                            <div
                              className="w-4 h-4 rounded-full border-2 border-white shadow"
                              style={{ backgroundColor: pos.moto.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {pos.moto.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {pos.speed !== null ? `${pos.speed.toFixed(1)} km/h` : 'Sin velocidad'}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              {pos.distance_from_start !== null && (
                                <Badge variant="secondary" className="text-xs">
                                  {pos.distance_from_start.toFixed(1)} km
                                </Badge>
                              )}
                              {pos.distance_remaining !== null && (
                                <Badge variant="outline" className="text-xs text-green-600">
                                  🏁 {pos.distance_remaining.toFixed(1)} km
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Loading overlay */}
            {loading && motoPositions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span>Cargando posiciones...</span>
                </div>
              </div>
            )}

            {/* No motos message */}
            {!loading && motoPositions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground bg-background/90 p-6 rounded-lg shadow">
                  <Bike className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No hay motos con posición GPS</p>
                  <p className="text-sm mt-1">Las motos activas aparecerán aquí cuando envíen su ubicación</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
