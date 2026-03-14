/**
 * LiveTracking — Standalone public live GPS tracking page
 * URL: /live
 * Full-screen Mapbox map with race route, realtime GPS positions,
 * and a sidebar listing all runners (bib, name, status, battery).
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

interface RunnerInfo {
  token_id: string;
  bib_number: string;
  participant_name: string;
  lat: number;
  lng: number;
  speed: number | null;
  battery: number | null;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const batteryColor = (pct: number | null) => {
  if (pct === null) return '#888';
  if (pct > 50) return '#4ade80';
  if (pct > 20) return '#f59e0b';
  return '#e94560';
};

const timeAgo = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
};

// ── Component ────────────────────────────────────────────────────────────────
const LiveTracking = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [activeCount, setActiveCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('--');
  const [error, setError] = useState<string | null>(null);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [, setTick] = useState(0);

  // Re-render every 15s to update timeAgo labels
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Update runners list ────────────────────────────────────────────────────
  const updateRunnersList = useCallback((tokenId: string, row: PositionRow) => {
    setRunners((prev) => {
      const existing = prev.filter((r) => r.token_id !== tokenId);
      return [
        ...existing,
        {
          token_id: tokenId,
          bib_number: row.gps_tokens.bib_number,
          participant_name: row.gps_tokens.participant_name,
          lat: row.lat,
          lng: row.lng,
          speed: row.speed,
          battery: row.battery,
          timestamp: row.timestamp,
        },
      ];
    });
  }, []);

  // ── Update stats ───────────────────────────────────────────────────────────
  const updateStats = useCallback(() => {
    setActiveCount(markersRef.current.size);
    setLastUpdate(new Date().toLocaleTimeString('es-ES'));
  }, []);

  // ── Add / update a runner marker ───────────────────────────────────────────
  const addRunnerMarker = useCallback(
    (map: mapboxgl.Map, tokenId: string, row: PositionRow) => {
      const token = row.gps_tokens;
      const bib = token.bib_number;

      // Update runner list
      updateRunnersList(tokenId, row);

      if (markersRef.current.has(tokenId)) {
        markersRef.current.get(tokenId)!.setLngLat([row.lng, row.lat]);
        // Update popup content
        const marker = markersRef.current.get(tokenId)!;
        const popup = marker.getPopup();
        if (popup) {
          popup.setHTML(buildPopupHTML(row));
        }
        return;
      }

      // Marker element
      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      el.innerHTML = `<div style="background:#1a1a2e;border:2px solid #e94560;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)">${bib}</div>`;

      const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(buildPopupHTML(row));

      const marker = new mapboxgl.Marker(el)
        .setLngLat([row.lng, row.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(tokenId, marker);
    },
    [updateRunnersList]
  );

  const buildPopupHTML = (row: PositionRow) => {
    const token = row.gps_tokens;
    const speed = row.speed != null ? (row.speed * 3.6).toFixed(1) + ' km/h' : '--';
    const alt = row.altitude != null ? row.altitude.toFixed(0) + ' m' : '--';
    const batt = row.battery != null ? row.battery + '%' : '--';
    const time = new Date(row.timestamp).toLocaleTimeString('es-ES');
    return `
      <div style="font-family:-apple-system,sans-serif">
        <h3 style="color:#e94560;margin:0 0 4px">Dorsal ${token.bib_number}</h3>
        <p style="margin:2px 0;font-size:13px;color:#333"><b>${token.participant_name}</b></p>
        <p style="margin:2px 0;font-size:13px;color:#333">${speed} | ${alt}</p>
        <p style="margin:2px 0;font-size:13px;color:#333">Bateria: ${batt} | ${time}</p>
      </div>
    `;
  };

  // ── Load route from roadbook ───────────────────────────────────────────────
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

  // ── Circle marker helper ───────────────────────────────────────────────────
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

  // ── Load GPS positions ─────────────────────────────────────────────────────
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

  // ── Subscribe to realtime ──────────────────────────────────────────────────
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

  // ── Initialize map ─────────────────────────────────────────────────────────
  useEffect(() => {
    let channel: any = null;

    const init = async () => {
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
      if (channel) supabase.removeChannel(channel);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, [loadRoute, loadPositions, subscribeRealtime]);

  // ── Fly to runner on click ─────────────────────────────────────────────────
  const flyToRunner = (runner: RunnerInfo) => {
    mapRef.current?.flyTo({ center: [runner.lng, runner.lat], zoom: 15 });
  };

  // Sorted runners (most recent first)
  const sortedRunners = [...runners].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const activeRunners = sortedRunners.filter(
    (r) => (Date.now() - new Date(r.timestamp).getTime()) / 1000 < 60
  );

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: '#0f0f23',
        color: '#fff',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Toggle panel button (mobile) */}
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              background: 'rgba(233,69,96,0.15)',
              border: '1px solid #e94560',
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#e94560',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {panelOpen ? 'Ocultar lista' : `Corredores (${runners.length})`}
          </button>
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
      </div>

      {/* Main content: map + sidebar */}
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
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Map */}
          <div ref={mapContainer} style={{ flex: 1 }} />

          {/* Sidebar — runners list */}
          {panelOpen && (
            <div
              style={{
                width: '280px',
                background: '#16213e',
                borderLeft: '1px solid #333',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>Corredores</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>{activeRunners.length}</span>
                    {' '}activos de {runners.length}
                  </div>
                </div>
                <div
                  style={{
                    background: '#e94560',
                    borderRadius: '12px',
                    padding: '2px 10px',
                    fontSize: '18px',
                    fontWeight: 700,
                  }}
                >
                  {activeRunners.length}
                </div>
              </div>

              {/* Runners list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {sortedRunners.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: '#888',
                    }}
                  >
                    Sin posiciones aun.
                    <br />
                    Esperando datos de la app...
                  </div>
                ) : (
                  sortedRunners.map((runner) => {
                    const ago = (Date.now() - new Date(runner.timestamp).getTime()) / 1000;
                    const isActive = ago < 60;
                    const speed =
                      runner.speed != null ? (runner.speed * 3.6).toFixed(1) + ' km/h' : '';

                    return (
                      <button
                        key={runner.token_id}
                        onClick={() => flyToRunner(runner)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: 'transparent',
                          border: 'none',
                          borderBottomStyle: 'solid',
                          borderBottomWidth: '1px',
                          borderBottomColor: 'rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          color: '#fff',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'transparent')
                        }
                      >
                        {/* Row 1: bib + name + status */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                color: '#e94560',
                                fontWeight: 700,
                                fontSize: '14px',
                                width: '28px',
                              }}
                            >
                              {runner.bib_number}
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: '#ccc',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '120px',
                              }}
                            >
                              {runner.participant_name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: isActive ? '#4ade80' : '#555',
                                boxShadow: isActive ? '0 0 6px #4ade80' : 'none',
                              }}
                            />
                            <span style={{ fontSize: '11px', color: '#888' }}>
                              {timeAgo(runner.timestamp)}
                            </span>
                          </div>
                        </div>

                        {/* Row 2: speed + battery */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '4px',
                            marginLeft: '36px',
                          }}
                        >
                          {speed && (
                            <span style={{ fontSize: '11px', color: '#888' }}>{speed}</span>
                          )}
                          {runner.battery !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div
                                style={{
                                  width: '24px',
                                  height: '6px',
                                  background: '#333',
                                  borderRadius: '3px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${runner.battery}%`,
                                    height: '100%',
                                    background: batteryColor(runner.battery),
                                    borderRadius: '3px',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '10px', color: '#888' }}>
                                {runner.battery}%
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats bar — only visible when panel is open */}
      {panelOpen && (
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
            <span style={{ color: '#e94560', fontWeight: 700 }}>{activeRunners.length}</span>
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
      )}

      {/* Animations */}
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        /* Scrollbar styling for runner list */
        div::-webkit-scrollbar {
          width: 4px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 2px;
        }
        /* Mobile: sidebar becomes bottom panel */
        @media (max-width: 768px) {
          .live-sidebar {
            width: 100% !important;
            max-height: 40vh !important;
            border-left: none !important;
            border-top: 1px solid #333 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default LiveTracking;
