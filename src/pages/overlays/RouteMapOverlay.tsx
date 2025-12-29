import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Bike } from 'lucide-react';
import { createRoot } from 'react-dom/client';

interface MotoData {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
  latitude: number;
  longitude: number;
  distance_from_start: number | null;
}

interface OverlayConfig {
  route_map_visible: boolean;
  route_map_line_color: string;
  route_map_line_width: number;
  route_map_moto_label_size: number;
  route_map_moto_label_color: string;
  route_map_moto_label_bg_color: string;
  map_overlay_moto_ids: string[];
  selected_distance_id: string | null;
  delay_seconds: number;
}

interface TrackPoint {
  lat: number;
  lon: number;
}

const RouteMapOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [motos, setMotos] = useState<MotoData[]>([]);
  const [trackCoords, setTrackCoords] = useState<[number, number][]>([]);
  const [mapToken, setMapToken] = useState<string | null>(null);
  const [resolvedRaceId, setResolvedRaceId] = useState<string | null>(null);

  // Make html/body transparent IMMEDIATELY on mount - before any renders
  // This MUST be at the top to ensure transparency from the first frame
  useEffect(() => {
    // Remove any existing background styles
    document.documentElement.style.background = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    
    // Also hide the root element's background
    const root = document.getElementById('root');
    if (root) {
      root.style.background = 'transparent';
      root.style.backgroundColor = 'transparent';
    }
    
    return () => {
      document.documentElement.style.background = '';
      document.documentElement.style.backgroundColor = '';
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
      if (root) {
        root.style.background = '';
        root.style.backgroundColor = '';
      }
    };
  }, []);

  // Resolve raceId (could be slug or UUID)
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!raceId) return;
      
      // Check if it's a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(raceId)) {
        setResolvedRaceId(raceId);
        return;
      }
      
      // It's a slug, resolve to UUID
      const { data } = await supabase
        .from('races')
        .select('id')
        .eq('slug', raceId)
        .maybeSingle();
      
      if (data) setResolvedRaceId(data.id);
    };
    
    resolveRaceId();
  }, [raceId]);

  // Fetch Mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      const { data } = await supabase.functions.invoke('get-mapbox-token');
      if (data?.token) setMapToken(data.token);
    };
    fetchToken();
  }, []);

  // Fetch config
  useEffect(() => {
    if (!resolvedRaceId) return;
    
    const fetchConfig = async () => {
      const { data } = await supabase
        .from('overlay_config')
        .select('route_map_visible, route_map_line_color, route_map_line_width, route_map_moto_label_size, route_map_moto_label_color, route_map_moto_label_bg_color, map_overlay_moto_ids, selected_distance_id, delay_seconds')
        .eq('race_id', resolvedRaceId)
        .maybeSingle();
      
      if (data) {
        setConfig({
          ...data,
          map_overlay_moto_ids: (data.map_overlay_moto_ids as string[]) || []
        });
      }
    };
    
    fetchConfig();
    
    // Subscribe to config changes
    const channel = supabase
      .channel('overlay-config-route')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'overlay_config',
        filter: `race_id=eq.${resolvedRaceId}`
      }, () => fetchConfig())
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [resolvedRaceId]);

  // Fetch GPX track
  useEffect(() => {
    if (!config?.selected_distance_id) return;
    
    const fetchTrack = async () => {
      const { data: distance } = await supabase
        .from('race_distances')
        .select('gpx_file_url')
        .eq('id', config.selected_distance_id)
        .maybeSingle();
      
      if (!distance?.gpx_file_url) return;
      
      try {
        const response = await fetch(distance.gpx_file_url);
        const gpxText = await response.text();
        const parser = new DOMParser();
        const gpxDoc = parser.parseFromString(gpxText, 'text/xml');
        const trkpts = gpxDoc.querySelectorAll('trkpt');
        
        const coords: [number, number][] = [];
        trkpts.forEach(pt => {
          const lat = parseFloat(pt.getAttribute('lat') || '0');
          const lon = parseFloat(pt.getAttribute('lon') || '0');
          if (lat && lon) coords.push([lon, lat]);
        });
        
        setTrackCoords(coords);
      } catch (e) {
        console.error('Error parsing GPX:', e);
      }
    };
    
    fetchTrack();
  }, [config?.selected_distance_id]);

  // Fetch moto positions - if map_overlay_moto_ids is empty, fetch all active motos
  const fetchMotos = useCallback(async () => {
    if (!resolvedRaceId) return;
    
    let motoQuery = supabase
      .from('race_motos')
      .select('id, name, name_tv, color')
      .eq('race_id', resolvedRaceId)
      .eq('is_active', true);
    
    // If specific motos are selected, filter by them
    if (config?.map_overlay_moto_ids?.length) {
      motoQuery = motoQuery.in('id', config.map_overlay_moto_ids);
    }
    
    const { data: motoData } = await motoQuery;
    
    if (!motoData?.length) {
      console.log('[RouteMapOverlay] No active motos found for race:', resolvedRaceId);
      return;
    }
    
    console.log('[RouteMapOverlay] Found motos:', motoData.length);
    
    // Get latest GPS for each moto - only get records with valid position
    const motosWithGps: MotoData[] = [];
    
    for (const moto of motoData) {
      const { data: gps, error: gpsError } = await supabase
        .from('moto_gps_tracking')
        .select('latitude, longitude, distance_from_start, timestamp')
        .eq('moto_id', moto.id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (gpsError) {
        console.error('[RouteMapOverlay] Error fetching GPS for moto:', moto.id, gpsError);
        continue;
      }
      
      if (gps) {
        // Apply delay if configured
        const delayMs = (config?.delay_seconds || 0) * 1000;
        const gpsTime = new Date(gps.timestamp).getTime();
        const now = Date.now();
        
        if (now - gpsTime >= delayMs || delayMs === 0) {
          console.log('[RouteMapOverlay] Adding moto with GPS:', moto.name, gps.latitude, gps.longitude);
          motosWithGps.push({
            id: moto.id,
            name: moto.name,
            name_tv: moto.name_tv,
            color: moto.color,
            latitude: gps.latitude,
            longitude: gps.longitude,
            distance_from_start: gps.distance_from_start
          });
        }
      } else {
        console.log('[RouteMapOverlay] No GPS data for moto:', moto.name);
      }
    }
    
    console.log('[RouteMapOverlay] Motos with GPS:', motosWithGps.length);
    setMotos(motosWithGps);
  }, [resolvedRaceId, config?.map_overlay_moto_ids, config?.delay_seconds]);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 2000);
    return () => clearInterval(interval);
  }, [fetchMotos]);

  // This effect is now at the top of the component

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapToken || map.current) return;
    
    mapboxgl.accessToken = mapToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/empty-v9', // Empty style for transparent background
      center: [0, 0],
      zoom: 10,
      attributionControl: false
    });
    
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapToken]);

  // Update track on map
  useEffect(() => {
    if (!map.current || !trackCoords.length || !config) return;
    
    const mapInstance = map.current;
    
    const addTrack = () => {
      if (mapInstance.getSource('track')) {
        (mapInstance.getSource('track') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: trackCoords
          }
        });
      } else {
        mapInstance.addSource('track', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: trackCoords
            }
          }
        });
        
        mapInstance.addLayer({
          id: 'track-line',
          type: 'line',
          source: 'track',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': config.route_map_line_color || '#FF0000',
            'line-width': config.route_map_line_width || 4
          }
        });
      }
      
      // Fit map to track bounds
      const bounds = trackCoords.reduce((bounds, coord) => {
        return bounds.extend(coord as [number, number]);
      }, new mapboxgl.LngLatBounds(trackCoords[0], trackCoords[0]));
      
      mapInstance.fitBounds(bounds, { padding: 50 });
    };
    
    if (mapInstance.isStyleLoaded()) {
      addTrack();
    } else {
      mapInstance.on('load', addTrack);
    }
  }, [trackCoords, config]);

  // Update moto markers
  useEffect(() => {
    if (!map.current || !config) return;
    
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    
    // Add new markers with Bike icon
    motos.forEach(moto => {
      const el = document.createElement('div');
      el.className = 'moto-marker';
      el.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
      `;
      
      // Create label
      const label = document.createElement('span');
      label.style.cssText = `
        background-color: ${config.route_map_moto_label_bg_color || '#000000'};
        color: ${config.route_map_moto_label_color || '#FFFFFF'};
        font-size: ${config.route_map_moto_label_size || 16}px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
        margin-bottom: 4px;
      `;
      label.textContent = moto.name_tv || moto.name;
      
      // Create icon container
      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = `
        background-color: ${moto.color};
        border-radius: 50%;
        padding: 6px;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      // Render Bike icon using React
      const iconRoot = document.createElement('div');
      const root = createRoot(iconRoot);
      root.render(<Bike size={20} color="white" />);
      iconContainer.appendChild(iconRoot);
      
      el.appendChild(label);
      el.appendChild(iconContainer);
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([moto.longitude, moto.latitude])
        .addTo(map.current!);
      
      markersRef.current.push(marker);
    });
  }, [motos, config]);

  // Always render a transparent container, even when not visible
  // This ensures the overlay is always transparent in VMix/OBS
  if (!config?.route_map_visible) {
    return (
      <div 
        style={{
          width: '100vw',
          height: '100vh',
          background: 'transparent',
          backgroundColor: 'transparent'
        }}
      />
    );
  }

  return (
    <div 
      ref={mapContainer} 
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent'
      }}
    />
  );
};

export default RouteMapOverlay;
