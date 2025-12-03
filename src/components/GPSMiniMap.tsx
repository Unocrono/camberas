import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';

interface GPSMiniMapProps {
  latitude: number | null;
  longitude: number | null;
  className?: string;
}

export function GPSMiniMap({ latitude, longitude, className = '' }: GPSMiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch Mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
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
      style: 'mapbox://styles/mapbox/streets-v12',
      center: defaultCenter,
      zoom: 15,
      interactive: true,
      attributionControl: false,
    });

    // Add zoom controls
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'bottom-right'
    );

    // Create marker element
    const el = document.createElement('div');
    el.className = 'current-position-marker';
    el.innerHTML = `
      <div class="relative">
        <div class="absolute -inset-2 bg-primary/30 rounded-full animate-ping"></div>
        <div class="relative w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg"></div>
      </div>
    `;

    marker.current = new mapboxgl.Marker(el);

    if (latitude && longitude) {
      marker.current.setLngLat([longitude, latitude]).addTo(map.current);
    }

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  // Update marker position
  useEffect(() => {
    if (!map.current || !marker.current || !latitude || !longitude) return;

    marker.current.setLngLat([longitude, latitude]);
    
    if (!marker.current.getElement().parentElement) {
      marker.current.addTo(map.current);
    }

    map.current.flyTo({
      center: [longitude, latitude],
      duration: 1000,
    });
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
    <div className={`relative rounded-lg overflow-hidden ${className}`}>
      <div ref={mapContainer} className="w-full h-full" />
      {(!latitude || !longitude) && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Esperando señal GPS...</span>
        </div>
      )}
    </div>
  );
}
