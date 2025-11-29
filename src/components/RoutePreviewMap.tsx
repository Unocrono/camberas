import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile } from '@/lib/gpxParser';

interface RoutePreviewMapProps {
  gpxUrl: string;
  distanceName: string;
}

export function RoutePreviewMap({ gpxUrl, distanceName }: RoutePreviewMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    if (mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [mapboxToken]);

  const fetchMapboxToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      if (error) throw error;
      if (data?.MAPBOX_PUBLIC_TOKEN) {
        setMapboxToken(data.MAPBOX_PUBLIC_TOKEN);
      } else {
        setError('Token de mapa no disponible');
      }
    } catch (err) {
      console.error('Error fetching Mapbox token:', err);
      setError('Error al cargar el mapa');
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [0, 0],
      zoom: 10,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      loadGpxRoute();
    });
  };

  const loadGpxRoute = async () => {
    if (!map.current) return;

    try {
      const response = await fetch(gpxUrl);
      const gpxText = await response.text();

      const parsedGpx = parseGpxFile(gpxText);

      if (!parsedGpx.tracks || parsedGpx.tracks.length === 0) {
        setError('No se encontró recorrido en el archivo GPX');
        return;
      }

      const coordinates: [number, number][] = [];

      parsedGpx.tracks.forEach((track) => {
        track.points.forEach((point) => {
          coordinates.push([point.lon, point.lat]);
        });
      });

      if (coordinates.length === 0) {
        setError('No se encontraron coordenadas en el recorrido');
        return;
      }

      // Remove existing route layer and source
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
          'line-opacity': 0.9,
        },
      });

      // Add start marker
      const startCoord = coordinates[0];
      const endCoord = coordinates[coordinates.length - 1];

      // Remove existing markers
      const existingMarkers = document.querySelectorAll('.route-marker');
      existingMarkers.forEach(m => m.remove());

      // Start marker
      const startEl = document.createElement('div');
      startEl.className = 'route-marker';
      startEl.innerHTML = `
        <div class="flex items-center justify-center w-8 h-8 bg-green-500 text-white rounded-full shadow-lg font-bold text-xs">
          S
        </div>
      `;
      new mapboxgl.Marker(startEl)
        .setLngLat(startCoord)
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML('<strong>Salida</strong>'))
        .addTo(map.current);

      // End marker
      const endEl = document.createElement('div');
      endEl.className = 'route-marker';
      endEl.innerHTML = `
        <div class="flex items-center justify-center w-8 h-8 bg-red-500 text-white rounded-full shadow-lg font-bold text-xs">
          M
        </div>
      `;
      new mapboxgl.Marker(endEl)
        .setLngLat(endCoord)
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML('<strong>Meta</strong>'))
        .addTo(map.current);

      // Add waypoints from GPX if available
      parsedGpx.waypoints.forEach((waypoint) => {
        const waypointEl = document.createElement('div');
        waypointEl.className = 'route-marker';
        waypointEl.innerHTML = `
          <div class="flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full shadow-md text-xs">
            ●
          </div>
        `;
        new mapboxgl.Marker(waypointEl)
          .setLngLat([waypoint.lon, waypoint.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<strong>${waypoint.name}</strong>${waypoint.desc ? `<br/>${waypoint.desc}` : ''}`))
          .addTo(map.current!);
      });

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord));
      map.current.fitBounds(bounds, { padding: 50 });

    } catch (err) {
      console.error('Error loading GPX:', err);
      setError('Error al cargar el recorrido');
    }
  };

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-muted/50 rounded-lg">
        <p className="text-muted-foreground">Cargando mapa...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-muted/50 rounded-lg">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full h-[400px] rounded-lg overflow-hidden">
        <div ref={mapContainer} className="absolute inset-0" />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> Salida
        </span>
        <span className="mx-3">|</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> Meta
        </span>
      </p>
    </div>
  );
}
