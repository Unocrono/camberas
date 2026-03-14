/**
 * LiveTracking — Standalone public live GPS tracking page
 * URL: /live
 * Full-screen Mapbox map with race route and realtime GPS positions.
 * No authentication required.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Constants ────────────────────────────────────────────────────────────────
const EVENT_ID = '8bb7b6ec-af8e-415e-b992-5b0ae3ce035f';
const ROADBOOK_ID = '09e96abf-3c7b-4c92-8c61-e85ee9dc11ad';
const DEFAULT_CENTER: [number, number] = [-6.535, 43.544];
const DEFAULT_ZOOM = 12;

// ── Types ────────────────────────────────────────────────────────────────────
interface GpsToken {
  bib_number: string;
  participant_name: string;
  event_id: string;
  active: boolean;
}

interface PositionRow {
  token_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  altitude: number | null;
  battery: number | null;
  timestamp: string;
  gps_tokens: GpsToken;
}

// ── Component ────────────────────────────────────────────────────────────────
const LiveTracking = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [activeCount, setActiveCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('--');
  const [error, setError] = useState<string | null>(null);

  // ── Update stats ─────────────────────────────────────────────────────────
  const updateStats = useCallback(() => {
    setActiveCount(markersRef.current.size);
    setLastUpdate(new Date().toLocaleTimeString('es-ES'));
  }, []);

  // ── Add / update a runner marker ─────────────────────────────────────────
  const addRunnerMarker = useCallback(
    (map: mapboxgl.Map, tokenId: string, row: PositionRow) => {
      const token = row.gps_tokens;
      const bib = token.bib_number;

      if (markersRef.current.has(tokenId)) {
        markersRef.current.get(tokenId)!.setLngLat([row.lng, row.lat]);
        return;
      }

      // Marker element
      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      el.innerHTML = `<div style="background:#1a1a2e;border:2px solid #e94560;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)">${bib}</div>`;

      const speed = row.speed != null ? (row.speed * 3.6).toFixed(1) + ' km/h' : '--';
      const alt = row.altitude != null ? row.altitude.toFixed(0) + ' m' : '--';
      const batt = row.battery != null ? row.battery + '%' : '--';
      const time = new Date(row.timestamp).toLocaleTimeString('es-ES');

      const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(`
        <div style="font-family:-apple-system,sans-serif">
          <h3 style="color:#e94560;margin:0 0 4px">Dorsal ${bib}</h3>
          <p style="margin:2px 0;font-size:13px;color:#333"><b>${token.participant_name}</b></p>
          <p style="margin:2px 0;font-size:13px;color:#333">${speed} | ${alt}</p>
          <p style="margin:2px 0;font-size:13px;color:#333">Bateria: ${batt} | ${time}</p>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([row.lng, row.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(tokenId, marker);
    },
    []
  );

  // ── Load route from roadbook ─────────────────────────────────────────────
  const loadRoute = useCallback(async (map: mapboxgl.Map) => {
    const allPoints: { latitude: number; longitude: number; item_order: number }[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('roadbook_items')
        .select('latitude, longitude, item_order')
        .eq('roadbook_id', ROADBOOK_ID)
        .order('item_order', { ascending: true })
        .range(from, from + 999);

      if (error || !data || data.length === 0) break;
      allPoints.push(...(data as any[]));
      if (data.length < 1000) break;
      from += 1000;
    }

    if (allPoints.length < 2) return;

    const coords: [number, number][] = allPoints
      .filter((p) => p.latitude && p.longitude)
      .map((p) => [p.longitude, p.latitude]);

    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    });

    map.addLayer({
      id: 'route-outline',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1a1a2e', 'line-width': 6, 'line-opacity': 0.5 },
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e94560', 'line-width': 3, 'line-opacity': 0.85 },
    });

    // Start & finish markers
    const start = allPoints[0];
    const end = allPoints[allPoints.length - 1];
    addCircleMarker(map, [start.longitude, start.latitude], 'S', '#4ade80', 'Salida');
    addCircleMarker(map, [end.longitude, end.latitude], 'M', '#e94560', 'Meta');

    // Fit bounds
    const bounds = new mapboxgl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 50, maxZoom: 13 });
  }, []);

  // ── Circle marker helper ─────────────────────────────────────────────────
  const addCircleMarker = (
    map: mapboxgl.Map,
    lngLat: [number, number],
    letter: string,
    color: string,
    label: string
  ) => {
    const el = document.createElement('div');
    const textColor = color === '#4ade80' ? '#000' : '#fff';
    el.innerHTML = `<div style="background:${color};color:${textColor};font-weight:bold;font-size:11px;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${letter}</div>`;

    new mapboxgl.Marker(el)
      .setLngLat(lngLat)
      .setPopup(new mapboxgl.Popup().setHTML(`<b>${label}</b>`))
      .addTo(map);
  };

  // ── Load GPS positions ───────────────────────────────────────────────────
  const loadPositions = useCallback(
    async (map: mapboxgl.Map) => {
      const { data, error } = await supabase
        .from('gps_positions')
        .select(
          'token_id, lat, lng, speed, altitude, battery, timestamp, gps_tokens!inner(bib_number, participant_name, event_id, active)'
        )
        .eq('gps_tokens.active', true)
        .eq('gps_tokens.event_id', EVENT_ID)
        .order('timestamp', { ascending: false });

      if (error || !data) return;

      const byToken = new Map<string, any>();
      for (const row of data) {
        if (!byToken.has(row.token_id)) {
          byToken.set(row.token_id, row);
        }
      }

      for (const [tokenId, row] of byToken) {
        addRunnerMarker(map, tokenId, row);
      }
      updateStats();
    },
    [addRunnerMarker, updateStats]
  );

  // ── Subscribe to realtime ────────────────────────────────────────────────
  const subscribeRealtime = useCallback(
    (map: mapboxgl.Map) => {
      const channel = supabase
        .channel('live-track')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'gps_positions' },
          async (payload: any) => {
            const pos = payload.new;
            const { data: tokenData } = await supabase
              .from('gps_tokens')
              .select('bib_number, participant_name, event_id, active')
              .eq('id', pos.token_id)
              .single();

            if (!tokenData?.active || tokenData.event_id !== EVENT_ID) return;

            addRunnerMarker(map, pos.token_id, {
              ...pos,
              gps_tokens: tokenData,
            });
            updateStats();
          }
        )
        .subscribe();

      return channel;
    },
    [addRunnerMarker, updateStats]
  );

  // ── Initialize map ───────────────────────────────────────────────────────
  useEffect(() => {
    let channel: any = null;

    const init = async () => {
      // Load Mapbox token from app_settings
      const { data: tokenData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'mapbox_token')
        .single();

      if (!tokenData?.value) {
        setError('No se pudo cargar el token de Mapbox');
        return;
      }

      if (!mapContainer.current) return;

      mapboxgl.accessToken = tokenData.value;

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

      mapRef.current = map;

      map.on('load', async () => {
        await loadRoute(map);
        await loadPositions(map);
        channel = subscribeRealtime(map);
      });
    };

    init();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      // Clean up markers
      markersRef.current.clear();
    };
  }, [loadRoute, loadPositions, subscribeRealtime]);

  return (
    <div style={{ margin: 0, padding: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#0f0f23', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid #e94560',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
            <span style={{ color: '#e94560' }}>CAMBERAS</span> TRACK
          </h1>
          <span style={{ fontSize: '12px', color: '#888' }}>
            XI Desafio BTT Las Branas y el Mar
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(74,222,128,0.15)',
            border: '1px solid #4ade80',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              background: '#4ade80',
              borderRadius: '50%',
              animation: 'live-pulse 1.5s infinite',
            }}
          />
          EN VIVO
        </div>
      </div>

      {/* Map */}
      {error ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e94560',
            fontSize: '16px',
          }}
        >
          {error}
        </div>
      ) : (
        <div ref={mapContainer} style={{ flex: 1, width: '100%' }} />
      )}

      {/* Stats bar */}
      <div
        style={{
          background: '#1a1a2e',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          fontSize: '13px',
          borderTop: '1px solid #333',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#888' }}>Corredores activos:</span>
          <span style={{ color: '#e94560', fontWeight: 700 }}>{activeCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#888' }}>Ultima actualizacion:</span>
          <span style={{ color: '#e94560', fontWeight: 700 }}>{lastUpdate}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#888' }}>Recorrido:</span>
          <span style={{ color: '#e94560', fontWeight: 700 }}>52 km</span>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default LiveTracking;
