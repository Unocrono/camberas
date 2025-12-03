import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile } from '@/lib/gpxParser';
import { Maximize2, X, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Checkpoint {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  checkpoint_type: string;
  distance_km: number;
}

interface RoadbookItem {
  id: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  km_total: number;
  item_type: string;
}

interface GPSMiniMapProps {
  latitude: number | null;
  longitude: number | null;
  distanceId?: string;
  raceId?: string;
  distanceTraveled?: number;
  totalDistance?: number;
  className?: string;
}

export function GPSMiniMap({ latitude, longitude, distanceId, raceId, distanceTraveled, totalDistance, className = '' }: GPSMiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const poiMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const routeLoadedRef = useRef(false);
  const markersLoadedRef = useRef(false);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // Resize map after state change
    setTimeout(() => {
      map.current?.resize();
    }, 100);
  };

  const centerOnPosition = () => {
    if (map.current && latitude && longitude) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 16,
        duration: 800,
      });
    }
  };

  // Fetch Mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.MAPBOX_PUBLIC_TOKEN) {
          setMapboxToken(data.MAPBOX_PUBLIC_TOKEN);
        } else {
          setError('Token no disponible');
        }
      } catch (e) {
        console.error('Error fetching Mapbox token:', e);
        setError('Error cargando mapa');
      }
    };
    fetchToken();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    
    const defaultCenter: [number, number] = longitude && latitude 
      ? [longitude, latitude] 
      : [-3.7, 40.4]; // Madrid default

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: defaultCenter,
      zoom: 14,
      interactive: true,
      attributionControl: false,
    });

    // Add zoom controls
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'bottom-right'
    );

    map.current.on('load', () => {
      setMapReady(true);
    });

    // Create marker element
    const el = document.createElement('div');
    el.className = 'current-position-marker';
    el.innerHTML = `
      <div class="relative">
        <div style="position: absolute; inset: -8px; background: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 16px; height: 16px; background: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
      </div>
    `;

    marker.current = new mapboxgl.Marker(el);

    if (latitude && longitude) {
      marker.current.setLngLat([longitude, latitude]).addTo(map.current);
    }

    return () => {
      poiMarkersRef.current.forEach(m => m.remove());
      map.current?.remove();
      routeLoadedRef.current = false;
      markersLoadedRef.current = false;
    };
  }, [mapboxToken]);

  // Load GPX route
  useEffect(() => {
    if (!map.current || !mapReady || !distanceId || routeLoadedRef.current) return;

    const loadGpxRoute = async () => {
      try {
        // Get GPX URL from race_distances
        const { data: distanceData, error: distanceError } = await supabase
          .from('race_distances')
          .select('gpx_file_url')
          .eq('id', distanceId)
          .maybeSingle();

        if (distanceError || !distanceData?.gpx_file_url) {
          console.log('No GPX file found for distance');
          return;
        }

        // Fetch and parse GPX
        const response = await fetch(distanceData.gpx_file_url);
        const gpxText = await response.text();
        const parsedGpx = parseGpxFile(gpxText);

        if (!parsedGpx.tracks || parsedGpx.tracks.length === 0) {
          console.warn('No tracks found in GPX');
          return;
        }

        // Extract coordinates
        const coordinates: [number, number][] = [];
        parsedGpx.tracks.forEach((track) => {
          track.points.forEach((point) => {
            coordinates.push([point.lon, point.lat]);
          });
        });

        if (coordinates.length === 0 || !map.current) return;

        // Remove existing route if any
        if (map.current.getLayer('gpx-route')) {
          map.current.removeLayer('gpx-route');
        }
        if (map.current.getSource('gpx-route')) {
          map.current.removeSource('gpx-route');
        }

        // Add the route
        map.current.addSource('gpx-route', {
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
          id: 'gpx-route',
          type: 'line',
          source: 'gpx-route',
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
        map.current.fitBounds(bounds, { padding: 30 });

        routeLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading GPX:', error);
      }
    };

    loadGpxRoute();
  }, [distanceId, mapReady]);

  // Load checkpoints and roadbook items
  useEffect(() => {
    if (!map.current || !mapReady || markersLoadedRef.current) return;
    if (!distanceId && !raceId) return;

    const loadMarkers = async () => {
      try {
        // Clear existing POI markers
        poiMarkersRef.current.forEach(m => m.remove());
        poiMarkersRef.current = [];

        // Fetch checkpoints (start/finish)
        if (raceId || distanceId) {
          let query = supabase
            .from('race_checkpoints')
            .select('id, name, latitude, longitude, checkpoint_type, distance_km')
            .in('checkpoint_type', ['START', 'FINISH']);
          
          if (distanceId) {
            query = query.eq('race_distance_id', distanceId);
          } else if (raceId) {
            query = query.eq('race_id', raceId);
          }

          const { data: checkpoints } = await query;

          if (checkpoints && map.current) {
            checkpoints.forEach((cp) => {
              if (cp.latitude && cp.longitude) {
                const isStart = cp.checkpoint_type === 'START';
                const el = document.createElement('div');
                el.className = 'checkpoint-marker';
                el.innerHTML = `
                  <div style="
                    width: 28px; 
                    height: 28px; 
                    background: ${isStart ? '#22c55e' : '#ef4444'}; 
                    border-radius: 50%; 
                    border: 3px solid white; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                  ">
                    ${isStart ? '🏁' : '🎯'}
                  </div>
                `;

                const marker = new mapboxgl.Marker(el)
                  .setLngLat([cp.longitude, cp.latitude])
                  .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<strong>${cp.name}</strong><br/>KM ${cp.distance_km}`
                  ))
                  .addTo(map.current!);

                poiMarkersRef.current.push(marker);
              }
            });
          }
        }

        // Fetch highlighted roadbook items
        if (distanceId) {
          const { data: roadbooks } = await supabase
            .from('roadbooks')
            .select('id')
            .eq('race_distance_id', distanceId)
            .limit(1);

          if (roadbooks && roadbooks.length > 0) {
            const { data: items } = await supabase
              .from('roadbook_items')
              .select('id, description, latitude, longitude, km_total, item_type')
              .eq('roadbook_id', roadbooks[0].id)
              .eq('is_highlighted', true);

            if (items && map.current) {
              items.forEach((item) => {
                if (item.latitude && item.longitude) {
                  const el = document.createElement('div');
                  el.className = 'roadbook-marker';
                  el.innerHTML = `
                    <div style="
                      width: 24px; 
                      height: 24px; 
                      background: #f59e0b; 
                      border-radius: 50%; 
                      border: 2px solid white; 
                      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 12px;
                    ">
                      📍
                    </div>
                  `;

                  const marker = new mapboxgl.Marker(el)
                    .setLngLat([item.longitude, item.latitude])
                    .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(
                      `<strong>${item.description}</strong><br/>KM ${item.km_total.toFixed(1)}`
                    ))
                    .addTo(map.current!);

                  poiMarkersRef.current.push(marker);
                }
              });
            }
          }
        }

        markersLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading markers:', error);
      }
    };

    loadMarkers();
  }, [distanceId, raceId, mapReady]);

  // Update marker position
  useEffect(() => {
    if (!map.current || !marker.current || !latitude || !longitude) return;

    marker.current.setLngLat([longitude, latitude]);
    
    if (!marker.current.getElement().parentElement) {
      marker.current.addTo(map.current);
    }

    // Only fly to position if route is loaded (to not override route bounds)
    if (routeLoadedRef.current) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 15,
        duration: 1000,
      });
    }
  }, [latitude, longitude]);

  if (error) {
    return (
      <div className={`bg-muted rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-muted-foreground text-sm">{error}</span>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className={`bg-muted rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-muted-foreground text-sm animate-pulse">Cargando mapa...</span>
      </div>
    );
  }

  return (
    <>
      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background">
          <div ref={mapContainer} className="w-full h-full" />
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {latitude && longitude && (
              <Button
                variant="secondary"
                size="icon"
                onClick={centerOnPosition}
              >
                <Crosshair className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleFullscreen}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          {(!latitude || !longitude) && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center pointer-events-none">
              <span className="text-muted-foreground text-sm">Esperando señal GPS...</span>
            </div>
          )}
          {/* Distance overlay - fullscreen */}
          {totalDistance !== undefined && (
            <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Recorrido</span>
                  <div className="font-bold text-lg">{(distanceTraveled || 0).toFixed(2)} km</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Restante</span>
                  <div className="font-bold text-lg">{Math.max(0, totalDistance - (distanceTraveled || 0)).toFixed(2)} km</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total</span>
                  <div className="font-bold text-lg">{totalDistance.toFixed(1)} km</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mini map */}
      {!isFullscreen && (
        <div className={`relative rounded-lg overflow-hidden ${className}`}>
          <div ref={mapContainer} className="w-full h-full" />
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            {latitude && longitude && (
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={centerOnPosition}
              >
                <Crosshair className="h-4 w-4" />
              </Button>
            )}
          </div>
          {(!latitude || !longitude) && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <span className="text-muted-foreground text-sm">Esperando señal GPS...</span>
            </div>
          )}
          {/* Distance overlay - mini */}
          {totalDistance !== undefined && (
            <div className="absolute bottom-2 left-2 right-2 z-10 bg-background/90 backdrop-blur-sm rounded px-2 py-1">
              <div className="flex justify-between text-xs">
                <span><span className="text-muted-foreground">Recorrido:</span> <strong>{(distanceTraveled || 0).toFixed(2)} km</strong></span>
                <span><span className="text-muted-foreground">Restante:</span> <strong>{Math.max(0, totalDistance - (distanceTraveled || 0)).toFixed(2)} km</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
