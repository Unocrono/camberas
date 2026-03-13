/**
 * CamberasTrackMap — Mapa en tiempo real para datos de camberas-track
 * Lee de: gps_positions + gps_tokens (Supabase Realtime)
 * Usado en: página pública /:slug/live + panel organizador
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, AlertTriangle, Battery, Gauge, Clock, Users } from 'lucide-react';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface TrackedRunner {
  token_id: string;
  bib_number: string;
  participant_name: string;
  lat: number;
  lng: number;
  speed: number | null;
  altitude: number | null;
  battery: number | null;
  timestamp: string;
  hasSOS: boolean;
}

interface SosAlert {
  id: string;
  token_id: string;
  lat: number;
  lng: number;
  triggered_at: string;
  bib_number?: string;
  participant_name?: string;
}

interface CamberasTrackMapProps {
  eventId?: string;        // filtrar por evento (opcional)
  mapboxToken?: string;    // si no se pasa, se carga de Supabase Edge Function
  showSOSPanel?: boolean;  // solo para organizador
  height?: string;
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

const markerHTML = (bib: string, hasSOS: boolean, battery: number | null) => `
  <div style="
    background:${hasSOS ? '#e94560' : '#1a1a2e'};
    border: 2px solid ${hasSOS ? '#fff' : '#e94560'};
    border-radius:50%;
    width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:bold;color:#fff;
    cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    position:relative;
  ">
    ${hasSOS ? '🆘' : bib}
    ${battery !== null ? `<div style="
      position:absolute;bottom:-4px;right:-4px;
      background:${batteryColor(battery)};
      border-radius:2px;width:8px;height:4px;
    "></div>` : ''}
  </div>
`;

// ── Componente ────────────────────────────────────────────────────────────────

export function CamberasTrackMap({
  eventId,
  mapboxToken: mapboxTokenProp,
  showSOSPanel = false,
  height = '600px',
}: CamberasTrackMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState(mapboxTokenProp || '');

  // Cargar token de app_settings si no se pasó como prop
  useEffect(() => {
    if (!mapboxTokenProp) {
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'mapbox_token')
        .single()
        .then(({ data }) => {
          if (data?.value) setMapboxToken(data.value);
        });
    }
  }, [mapboxTokenProp]);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const sosMarkers = useRef<mapboxgl.Marker[]>([]);

  const [runners, setRunners] = useState<TrackedRunner[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedRunner, setSelectedRunner] = useState<TrackedRunner | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // ── Fetch inicial de posiciones ───────────────────────────────────────────

  const fetchPositions = useCallback(async () => {
    // Obtener última posición de cada token
    let query = supabase
      .from('gps_positions')
      .select(`
        token_id,
        lat, lng, speed, altitude, battery, timestamp,
        gps_tokens!inner(bib_number, participant_name, event_id, active)
      `)
      .eq('gps_tokens.active', true)
      .order('timestamp', { ascending: false });

    if (eventId) {
      query = query.eq('gps_tokens.event_id', eventId);
    }

    const { data, error } = await query;
    if (error) { console.error('[TrackMap] Error fetch:', error); return; }
    if (!data) return;

    // Agrupar por token_id → solo la más reciente
    const byToken = new Map<string, TrackedRunner>();
    for (const row of data) {
      if (!byToken.has(row.token_id)) {
        const token = row.gps_tokens as any;
        byToken.set(row.token_id, {
          token_id: row.token_id,
          bib_number: token.bib_number,
          participant_name: token.participant_name,
          lat: row.lat,
          lng: row.lng,
          speed: row.speed,
          altitude: row.altitude,
          battery: row.battery,
          timestamp: row.timestamp,
          hasSOS: false,
        });
      }
    }

    setRunners(Array.from(byToken.values()));
    setLastUpdate(new Date());
  }, [eventId]);

  // ── Fetch alertas SOS ─────────────────────────────────────────────────────

  const fetchSOS = useCallback(async () => {
    const { data, error } = await supabase
      .from('gps_sos_alerts')
      .select(`
        id, token_id, lat, lng, triggered_at,
        gps_tokens(bib_number, participant_name)
      `)
      .is('resolved_at', null)
      .order('triggered_at', { ascending: false });

    if (error || !data) return;

    setSosAlerts(data.map((a: any) => ({
      id: a.id,
      token_id: a.token_id,
      lat: a.lat,
      lng: a.lng,
      triggered_at: a.triggered_at,
      bib_number: a.gps_tokens?.bib_number,
      participant_name: a.gps_tokens?.participant_name,
    })));

    // Marcar corredores con SOS activo
    setRunners(prev => prev.map(r => ({
      ...r,
      hasSOS: data.some((a: any) => a.token_id === r.token_id),
    })));
  }, []);

  // ── Inicializar mapa ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-1.5, 37.5], // España
      zoom: 6,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken]);

  // ── Carga inicial ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPositions();
    fetchSOS();
  }, [fetchPositions, fetchSOS]);

  // ── Suscripción Realtime a nuevas posiciones ──────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('camberas-track-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_positions' },
        async (payload) => {
          const pos = payload.new as any;

          // Obtener datos del token
          const { data: tokenData } = await supabase
            .from('gps_tokens')
            .select('bib_number, participant_name, event_id, active')
            .eq('id', pos.token_id)
            .single();

          if (!tokenData?.active) return;
          if (eventId && tokenData.event_id !== eventId) return;

          setRunners(prev => {
            const updated = prev.filter(r => r.token_id !== pos.token_id);
            updated.push({
              token_id: pos.token_id,
              bib_number: tokenData.bib_number,
              participant_name: tokenData.participant_name,
              lat: pos.lat,
              lng: pos.lng,
              speed: pos.speed,
              altitude: pos.altitude,
              battery: pos.battery,
              timestamp: pos.timestamp,
              hasSOS: prev.find(r => r.token_id === pos.token_id)?.hasSOS ?? false,
            });
            return updated;
          });
          setLastUpdate(new Date());
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_sos_alerts' },
        () => { fetchSOS(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId, fetchSOS]);

  // ── Actualizar marcadores en el mapa ──────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !map.current) return;

    const activeIds = new Set(runners.map(r => r.token_id));

    // Eliminar marcadores de corredores que ya no están
    for (const [id, marker] of markers.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    for (const runner of runners) {
      const el = document.createElement('div');
      el.innerHTML = markerHTML(runner.bib_number, runner.hasSOS, runner.battery);

      if (markers.current.has(runner.token_id)) {
        // Actualizar posición
        markers.current.get(runner.token_id)!
          .setLngLat([runner.lng, runner.lat])
          .getElement().innerHTML = el.innerHTML;
      } else {
        // Crear nuevo marcador
        const marker = new mapboxgl.Marker(el)
          .setLngLat([runner.lng, runner.lat])
          .addTo(map.current!);

        el.addEventListener('click', () => setSelectedRunner(runner));
        markers.current.set(runner.token_id, marker);
      }
    }

    // Ajustar vista si hay corredores
    if (runners.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      runners.forEach(r => bounds.extend([r.lng, r.lat]));
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
    }
  }, [runners, mapReady]);

  // ── Marcadores SOS en el mapa ─────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !map.current) return;
    sosMarkers.current.forEach(m => m.remove());
    sosMarkers.current = [];

    for (const alert of sosAlerts) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="font-size:24px;cursor:pointer">🆘</div>`;
      const marker = new mapboxgl.Marker(el)
        .setLngLat([alert.lng, alert.lat])
        .setPopup(new mapboxgl.Popup().setHTML(
          `<b>🆘 SOS — Dorsal ${alert.bib_number}</b><br/>${alert.participant_name}<br/><small>${new Date(alert.triggered_at).toLocaleTimeString('es-ES')}</small>`
        ))
        .addTo(map.current!);
      sosMarkers.current.push(marker);
    }
  }, [sosAlerts, mapReady]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeRunners = runners.filter(r => {
    const ago = (Date.now() - new Date(r.timestamp).getTime()) / 1000;
    return ago < 300; // activo si posición < 5 min
  });

  return (
    <div className="flex flex-col md:flex-row gap-4" style={{ height }}>

      {/* ── Mapa ── */}
      <div className="relative flex-1 rounded-xl overflow-hidden border border-border min-h-[400px]">
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Badge EN VIVO */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1">
          <Radio className="h-3 w-3 text-green-400 animate-pulse" />
          <span className="text-xs text-white font-semibold">EN VIVO</span>
          {lastUpdate && (
            <span className="text-xs text-gray-400">
              · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Popup de corredor seleccionado */}
        {selectedRunner && (
          <div className="absolute bottom-4 left-4 z-10 bg-[#1a1a2e] border border-[#e94560] rounded-xl p-4 w-64 shadow-xl">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
              onClick={() => setSelectedRunner(null)}
            >✕</button>
            <div className="text-[#e94560] font-bold text-2xl">{selectedRunner.bib_number}</div>
            <div className="text-white font-semibold mt-1">{selectedRunner.participant_name}</div>
            <div className="mt-3 space-y-1 text-sm text-gray-400">
              {selectedRunner.speed !== null && (
                <div className="flex items-center gap-2">
                  <Gauge className="h-3 w-3" />
                  <span>{(selectedRunner.speed * 3.6).toFixed(1)} km/h</span>
                </div>
              )}
              {selectedRunner.altitude !== null && (
                <div className="flex items-center gap-2">
                  <span>⛰</span>
                  <span>{selectedRunner.altitude.toFixed(0)} m</span>
                </div>
              )}
              {selectedRunner.battery !== null && (
                <div className="flex items-center gap-2">
                  <Battery className="h-3 w-3" style={{ color: batteryColor(selectedRunner.battery) }} />
                  <span style={{ color: batteryColor(selectedRunner.battery) }}>{selectedRunner.battery}%</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>Hace {timeAgo(selectedRunner.timestamp)}</span>
              </div>
            </div>
            <button
              className="mt-3 text-xs text-[#e94560] hover:underline"
              onClick={() => {
                map.current?.flyTo({ center: [selectedRunner.lng, selectedRunner.lat], zoom: 15 });
              }}
            >
              Centrar en mapa →
            </button>
          </div>
        )}
      </div>

      {/* ── Panel lateral ── */}
      <div className="w-full md:w-72 flex flex-col gap-3">

        {/* Resumen */}
        <div className="bg-[#16213e] rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-[#e94560]" />
            <span className="font-semibold text-sm">Corredores activos</span>
          </div>
          <div className="text-4xl font-bold text-[#e94560]">{activeRunners.length}</div>
          <div className="text-xs text-muted-foreground mt-1">de {runners.length} vinculados</div>
        </div>

        {/* Alertas SOS */}
        {showSOSPanel && sosAlerts.length > 0 && (
          <div className="bg-[#e94560]/10 border border-[#e94560] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-[#e94560] animate-pulse" />
              <span className="font-bold text-sm text-[#e94560]">ALERTAS SOS ({sosAlerts.length})</span>
            </div>
            {sosAlerts.map(alert => (
              <div key={alert.id} className="text-sm mb-2 p-2 bg-[#e94560]/20 rounded">
                <div className="font-bold">Dorsal {alert.bib_number}</div>
                <div className="text-xs text-muted-foreground">{alert.participant_name}</div>
                <div className="text-xs text-gray-400">{new Date(alert.triggered_at).toLocaleTimeString('es-ES')}</div>
                <button
                  className="text-xs text-[#e94560] hover:underline mt-1"
                  onClick={() => map.current?.flyTo({ center: [alert.lng, alert.lat], zoom: 15 })}
                >
                  Ver en mapa →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Lista de corredores */}
        <div className="bg-[#16213e] rounded-xl border border-border flex-1 overflow-hidden">
          <div className="p-3 border-b border-border text-sm font-semibold">Todos los corredores</div>
          <ScrollArea className="h-64 md:h-full">
            {runners.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Sin posiciones aún.<br />Esperando datos de la app...
              </div>
            ) : (
              runners
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map(runner => {
                  const ago = (Date.now() - new Date(runner.timestamp).getTime()) / 1000;
                  const isActive = ago < 300;
                  return (
                    <button
                      key={runner.token_id}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-border/50 transition-colors"
                      onClick={() => {
                        setSelectedRunner(runner);
                        map.current?.flyTo({ center: [runner.lng, runner.lat], zoom: 14 });
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[#e94560] font-bold text-sm w-8">{runner.bib_number}</span>
                          <span className="text-xs text-white truncate max-w-[120px]">{runner.participant_name}</span>
                          {runner.hasSOS && <span className="text-xs">🆘</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-600'}`} />
                          <span className="text-xs text-gray-500">{timeAgo(runner.timestamp)}</span>
                        </div>
                      </div>
                      {runner.battery !== null && (
                        <div className="ml-10 mt-1">
                          <div className="w-16 h-1 bg-gray-700 rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${runner.battery}%`,
                                background: batteryColor(runner.battery),
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
