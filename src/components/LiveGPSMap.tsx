import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import GPXParser from 'gpxparser';

interface RunnerPosition {
  id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  bib_number: number | null;
  runner_name: string;
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
      
      const gpx = new GPXParser();
      gpx.parse(gpxText);

      if (!map.current || !gpx.tracks || gpx.tracks.length === 0) {
        console.warn('GPX parsing failed or no tracks found');
        return;
      }

      // mapReady guarantees the style is loaded, add directly
      addGpxToMap(gpx);
    } catch (error) {
      console.error('Error loading GPX:', error);
    }
  };

  const addGpxToMap = (gpx: any) => {
    if (!map.current) return;

    const coordinates: [number, number][] = [];
    
    gpx.tracks.forEach((track: any) => {
      track.points.forEach((point: any) => {
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
    const { data, error } = await supabase
      .from('gps_tracking')
      .select(`
        id,
        registration_id,
        latitude,
        longitude,
        timestamp,
        registrations!inner(
          bib_number,
          profiles!inner(
            first_name,
            last_name
          )
        )
      `)
      .eq('race_id', raceId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching positions:', error);
      return;
    }

    const positions: RunnerPosition[] = [];
    const uniqueRegistrations = new Set<string>();

    data?.forEach((item: any) => {
      if (!uniqueRegistrations.has(item.registration_id)) {
        uniqueRegistrations.add(item.registration_id);
        positions.push({
          id: item.id,
          registration_id: item.registration_id,
          latitude: parseFloat(item.latitude),
          longitude: parseFloat(item.longitude),
          timestamp: item.timestamp,
          bib_number: item.registrations.bib_number,
          runner_name: `${item.registrations.profiles.first_name} ${item.registrations.profiles.last_name}`,
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

        marker = new mapboxgl.Marker(el)
          .setLngLat([position.longitude, position.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div class="p-2">
                <strong>${position.runner_name}</strong><br/>
                Dorsal: ${position.bib_number || 'N/A'}
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

  return (
    <div className="relative w-full h-full min-h-[600px]">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
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
