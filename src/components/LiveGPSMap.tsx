import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';

interface RunnerPosition {
  id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  bib_number: number | null;
  runner_name: string;
}

interface LiveGPSMapProps {
  raceId: string;
  mapboxToken: string;
}

export function LiveGPSMap({ raceId, mapboxToken }: LiveGPSMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [runnerPositions, setRunnerPositions] = useState<RunnerPosition[]>([]);

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

    fetchInitialPositions();
    setupRealtimeSubscription();

    return () => {
      map.current?.remove();
    };
  }, [raceId, mapboxToken]);

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

    if (positions.length > 0) {
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
        }
      `}</style>
    </div>
  );
}
