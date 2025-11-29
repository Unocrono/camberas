import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import GPXParser from 'gpxparser';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Map, Mountain } from 'lucide-react';

interface Distance {
  id: string;
  name: string;
  distance_km: number;
  gpx_file_url: string | null;
}

interface RoutePreviewMapProps {
  distances: Distance[];
}

export function RoutePreviewMap({ distances }: RoutePreviewMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter distances that have GPX files
  const distancesWithGpx = distances.filter(d => d.gpx_file_url);

  useEffect(() => {
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    if (distancesWithGpx.length > 0 && !selectedDistanceId) {
      setSelectedDistanceId(distancesWithGpx[0].id);
    }
  }, [distancesWithGpx, selectedDistanceId]);

  useEffect(() => {
    if (mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [mapboxToken]);

  useEffect(() => {
    if (map.current && selectedDistanceId) {
      const distance = distancesWithGpx.find(d => d.id === selectedDistanceId);
      if (distance?.gpx_file_url) {
        loadGpxRoute(distance.gpx_file_url);
      }
    }
  }, [selectedDistanceId, map.current]);

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
      center: [-3.7, 40.4],
      zoom: 10,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Load GPX once map is ready
    map.current.on('load', () => {
      if (selectedDistanceId) {
        const distance = distancesWithGpx.find(d => d.id === selectedDistanceId);
        if (distance?.gpx_file_url) {
          loadGpxRoute(distance.gpx_file_url);
        }
      }
    });
  };

  const loadGpxRoute = async (url: string) => {
    if (!map.current) return;

    try {
      const response = await fetch(url);
      const gpxText = await response.text();

      const gpx = new GPXParser();
      gpx.parse(gpxText);

      if (!gpx.tracks || gpx.tracks.length === 0) return;

      const coordinates: [number, number][] = [];

      gpx.tracks.forEach((track: any) => {
        track.points.forEach((point: any) => {
          coordinates.push([point.lon, point.lat]);
        });
      });

      if (coordinates.length === 0) return;

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

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord));
      map.current.fitBounds(bounds, { padding: 50 });

    } catch (err) {
      console.error('Error loading GPX:', err);
    }
  };

  // Don't render if no distances have GPX files
  if (distancesWithGpx.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Cargando mapa del recorrido...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Mapa del Recorrido
          </CardTitle>
          
          {distancesWithGpx.length > 1 && (
            <Select
              value={selectedDistanceId || ''}
              onValueChange={setSelectedDistanceId}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Selecciona distancia" />
              </SelectTrigger>
              <SelectContent>
                {distancesWithGpx.map((distance) => (
                  <SelectItem key={distance.id} value={distance.id}>
                    <span className="flex items-center gap-2">
                      <Mountain className="h-4 w-4" />
                      {distance.name} ({distance.distance_km} km)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full h-[400px] rounded-lg overflow-hidden">
          <div ref={mapContainer} className="absolute inset-0" />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> Salida
          </span>
          <span className="mx-3">|</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> Meta
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
