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
import { GroupPlaybackControls } from '@/components/GroupPlaybackControls';
import { Radio, AlertTriangle, Battery, Gauge, Clock, Users, Search, Repeat, Loader2, Star } from 'lucide-react';

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

/** Un punto del track para la repetición (t en ms epoch) */
interface ReplayPoint {
  t: number;
  lat: number;
  lng: number;
}

/** Track completo de un participante seleccionado para la repetición */
interface ReplayTrack {
  bib: string;
  name: string;
  points: ReplayPoint[];
}

/** Posición interpolada en el instante t (búsqueda binaria + lerp) */
const positionAt = (points: ReplayPoint[], t: number): [number, number] | null => {
  if (points.length === 0 || t < points[0].t) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo];
  const b = points[lo + 1];
  if (!b) return [a.lng, a.lat];
  const f = (t - a.t) / (b.t - a.t || 1);
  return [a.lng + (b.lng - a.lng) * f, a.lat + (b.lat - a.lat) * f];
};

interface SosAlert {
  id: string;
  token_id: string;
  lat: number;
  lng: number;
  triggered_at: string;
  bib_number?: string;
  participant_name?: string;
}

/**
 * Filtro por concepto para el mapa único (Camberas Org):
 * - corredores: tokens que NO están en el catálogo race_motos
 * - mototv / organizacion / voluntario: tokens del catálogo con ese gps_role
 *   (mototv = moto de grafismo/TV; las motos enlace van en organizacion)
 * Sin kind, el mapa muestra todo (comportamiento histórico).
 */
export type TrackMapKind = 'corredores' | 'mototv' | 'organizacion' | 'voluntario';

interface CamberasTrackMapProps {
  eventId?: string;        // filtrar por evento (opcional)
  kind?: TrackMapKind;     // filtrar por concepto (opcional)
  mapboxToken?: string;    // si no se pasa, se carga de Supabase Edge Function
  showSOSPanel?: boolean;  // solo para organizador
  showDistanceSelector?: boolean; // ocultar si el padre pone su propio selector
  autoCenter?: boolean;    // centrado controlado desde fuera (oculta el conmutador interno)
  centerSignal?: number;   // incrementarlo desde fuera = "centrar el mapa AHORA"
  height?: string;
  roadbookId?: string;     // roadbook para mostrar el recorrido
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
  kind,
  mapboxToken: mapboxTokenProp,
  showSOSPanel = false,
  showDistanceSelector = true,
  autoCenter: autoCenterProp,
  centerSignal,
  height = '600px',
  roadbookId,
}: CamberasTrackMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  // Límites del recorrido pintado (para el botón de centrar) y control del
  // encuadre inicial único
  const routeBounds = useRef<mapboxgl.LngLatBounds | null>(null);
  const didInitialFit = useRef(false);
  const [hasRoute, setHasRoute] = useState(false);
  // Conmutador: con el centrado activado, el mapa se encuadra al recorrido
  // cada vez que este (re)carga; desactivado, el operador manda
  const [autoCenter, setAutoCenter] = useState(autoCenterProp ?? true);
  const autoCenterRef = useRef(autoCenterProp ?? true);

  // Modo controlado: el padre (panel admin) maneja el conmutador
  useEffect(() => {
    if (autoCenterProp === undefined) return;
    autoCenterRef.current = autoCenterProp;
    setAutoCenter(autoCenterProp);
    if (autoCenterProp && routeBounds.current && map.current) {
      map.current.fitBounds(routeBounds.current, { padding: 60, maxZoom: 14 });
    }
  }, [autoCenterProp]);

  // Orden imperativa desde fuera: "centrar el mapa AHORA"
  useEffect(() => {
    if (!centerSignal) return;
    if (routeBounds.current && map.current) {
      map.current.fitBounds(routeBounds.current, { padding: 60, maxZoom: 14 });
    }
  }, [centerSignal]);

  // Marcadores de Salida/Meta del recorrido (para limpiarlos al cambiar)
  const routeMarkers = useRef<mapboxgl.Marker[]>([]);

  // Limpiar recorridos anteriores: capas del rutómetro y de los GPX + S/M.
  // Sin esto, al cambiar de carrera se quedaban pintados los de la anterior.
  const clearRouteArtifacts = useCallback(() => {
    if (!map.current) return;
    routeMarkers.current.forEach(m => m.remove());
    routeMarkers.current = [];
    const style = map.current.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.startsWith('gpx-route-') || layer.id.startsWith('roadbook-route-')) {
        map.current.removeLayer(layer.id);
      }
    }
    for (const srcId of Object.keys(style.sources ?? {})) {
      if (srcId.startsWith('gpx-route-') || srcId === 'roadbook-route') {
        map.current.removeSource(srcId);
      }
    }
  }, []);
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

  // ── Favoritos + repetición de grupo (reloj maestro, como en LiveGPSMap) ──
  // Los favoritos se recuerdan por carrera en localStorage: se marcan una
  // vez y siguen marcados al volver a abrir el mapa.
  const favsKey = `track-favs-${eventId || 'global'}`;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`track-favs-${eventId || 'global'}`) || '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(favsKey, JSON.stringify(Array.from(selectedIds)));
    } catch { /* almacenamiento lleno o bloqueado: los favoritos no persisten */ }
  }, [selectedIds, favsKey]);
  const [replayTracks, setReplayTracks] = useState<Map<string, ReplayTrack> | null>(null);
  const [replayRange, setReplayRange] = useState<{ t0: number; t1: number } | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const replayMarkers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const replayActiveRef = useRef(false);

  const [runners, setRunners] = useState<TrackedRunner[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [selectedRunner, setSelectedRunner] = useState<TrackedRunner | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [, setTick] = useState(0); // force re-render to update timeAgo / active status

  // Tick every 15s to refresh timeAgo and active/inactive indicators
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Resolver el filtro de evento ─────────────────────────────────────────
  // El eventId puede ser un race_id (panel admin) o un race_distance_id
  // (página pública), pero los tokens llevan SIEMPRE el race_distance_id.
  // Resolvemos: si es una carrera, el filtro incluye todas sus pruebas.
  // null = resolviendo · [] = sin filtro · [ids] = filtrar por estos

  const [effectiveEventIds, setEffectiveEventIds] = useState<string[] | null>(
    eventId ? null : []
  );
  // Eventos (pruebas) de la carrera, cada uno con su propio GPX
  const [raceDistances, setRaceDistances] = useState<
    { id: string; name: string; gpx_file_url: string | null }[]
  >([]);
  const [selectedDistanceId, setSelectedDistanceId] = useState(''); // '' = todos

  useEffect(() => {
    if (!eventId) { setEffectiveEventIds([]); setRaceDistances([]); return; }
    setEffectiveEventIds(null);
    setSelectedDistanceId('');
    // cambia la carrera: limpiar TODO lo de la anterior de inmediato
    // (corredores, alertas, encuadre y rutómetro detectado — si no, se
    // quedaban pegados hasta que llegaba el fetch de la nueva)
    setRunners([]);
    setSosAlerts([]);
    setSelectedRunner(null);
    setDetectedRoadbookId(roadbookId || '');
    routeBounds.current = null;
    didInitialFit.current = false;
    setHasRoute(false);

    let cancelled = false; // cambio rápido de carrera: descartar respuestas viejas
    (async () => {
      // eventId puede ser una carrera (race_id) o una prueba (race_distance_id)
      let { data: dists } = await supabase
        .from('race_distances')
        .select('id, name, gpx_file_url')
        .eq('race_id', eventId)
        .order('display_order', { ascending: true, nullsFirst: false });
      if (!dists || dists.length === 0) {
        const { data: single } = await supabase
          .from('race_distances')
          .select('id, name, gpx_file_url')
          .eq('id', eventId);
        dists = single ?? [];
      }
      if (cancelled) return;
      setRaceDistances(dists);
      setEffectiveEventIds([eventId, ...dists.map(d => d.id)]);
    })();
    return () => { cancelled = true; };
  }, [eventId, roadbookId]);

  // El selector de evento acota el filtro de corredores/SOS/recorrido
  useEffect(() => {
    if (!eventId || raceDistances.length === 0) return;
    setEffectiveEventIds(
      selectedDistanceId
        ? [selectedDistanceId]
        : [eventId, ...raceDistances.map(d => d.id)]
    );
  }, [selectedDistanceId, raceDistances, eventId]);

  // ── Filtro por concepto (kind): papel de cada token según race_motos ─────
  // El catálogo dice qué tokens son de organización y con qué papel; los
  // corredores son los tokens que no aparecen en él.
  const [catalogRoles, setCatalogRoles] = useState<Record<string, string> | null>(null);
  const catalogRolesRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (!kind || !eventId) {
      setCatalogRoles(null);
      catalogRolesRef.current = null;
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('race_motos')
        .select('token_id, gps_role')
        .eq('race_id', eventId);
      if (cancelled) return;
      const roles: Record<string, string> = {};
      for (const m of data || []) {
        if (m.token_id) roles[m.token_id] = m.gps_role || 'mototv';
      }
      setCatalogRoles(roles);
      catalogRolesRef.current = roles;
    };
    load();
    return () => { cancelled = true; };
  }, [kind, eventId]);

  /** ¿Este token pasa el filtro por concepto? (sin kind pasa todo) */
  const passesKind = useCallback((tokenId: string, roles: Record<string, string> | null) => {
    if (!kind) return true;
    const role = roles?.[tokenId];
    return kind === 'corredores' ? !role : role === kind;
  }, [kind]);

  // ── Fetch inicial de posiciones ───────────────────────────────────────────
  // Con los intervalos cortos de la V23 (moto TV / rally a 1-2 s) traer el
  // histórico entero y quedarse con la última en el cliente no escala: el
  // RPC get_latest_gps_positions resuelve el DISTINCT ON en el servidor.
  // Si el RPC aún no existe (migración sin aplicar), cae al camino antiguo.

  // Caché token_id → datos del token, para no consultar en cada INSERT
  // del realtime (a 1 s por dispositivo eran N consultas por segundo)
  const tokenCacheRef = useRef<Map<string, { bib_number: string; participant_name: string; event_id: string }>>(new Map());

  const fetchPositions = useCallback(async () => {
    if (effectiveEventIds === null) return; // aún resolviendo el filtro
    if (kind && catalogRoles === null) return; // catálogo aún cargando

    let rows: any[] | null = null;

    const { data, error } = await (supabase as any).rpc('get_latest_gps_positions', {
      p_event_ids: effectiveEventIds.length > 0 ? effectiveEventIds : null,
    });
    if (!error) {
      rows = (data || []).map((r: any) => ({
        token_id: r.token_id,
        lat: r.lat, lng: r.lng, speed: r.speed, altitude: r.altitude,
        battery: r.battery, timestamp: r.timestamp,
        gps_tokens: { bib_number: r.bib_number, participant_name: r.participant_name, event_id: r.event_id },
      }));
    } else {
      // Fallback: la consulta histórica (todas las filas, última en cliente)
      let query = supabase
        .from('gps_positions')
        .select(`
          token_id,
          lat, lng, speed, altitude, battery, timestamp,
          gps_tokens!inner(bib_number, participant_name, event_id, active)
        `)
        .eq('gps_tokens.active', true)
        .order('timestamp', { ascending: false });
      if (effectiveEventIds.length > 0) {
        query = query.in('gps_tokens.event_id', effectiveEventIds);
      }
      const legacy = await query;
      if (legacy.error) { console.error('[TrackMap] Error fetch:', legacy.error); return; }
      rows = legacy.data || [];
    }

    // Agrupar por token_id → solo la más reciente (el RPC ya viene única)
    const byToken = new Map<string, TrackedRunner>();
    for (const row of rows) {
      const token = row.gps_tokens as any;
      // Alimentar la caché del realtime con lo que ya sabemos
      tokenCacheRef.current.set(row.token_id, {
        bib_number: token.bib_number,
        participant_name: token.participant_name,
        event_id: token.event_id,
      });
      if (!passesKind(row.token_id, catalogRoles)) continue;
      if (!byToken.has(row.token_id)) {
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
  }, [effectiveEventIds, kind, catalogRoles, passesKind]);

  // ── Fetch alertas SOS ─────────────────────────────────────────────────────

  const fetchSOS = useCallback(async () => {
    if (effectiveEventIds === null) return; // aún resolviendo el filtro
    let query = supabase
      .from('gps_sos_alerts')
      .select(`
        id, token_id, lat, lng, triggered_at,
        gps_tokens!inner(bib_number, participant_name, event_id)
      `)
      .is('resolved_at', null)
      .order('triggered_at', { ascending: false });

    // Sin este filtro, el panel mostraba las alertas de TODAS las carreras
    if (effectiveEventIds.length > 0) {
      query = query.in('gps_tokens.event_id', effectiveEventIds);
    }

    const { data, error } = await query;
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
  }, [effectiveEventIds]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken) return;

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

          // Datos del token: primero la caché (a 1-2 s por dispositivo,
          // consultar en cada INSERT eran N consultas por segundo)
          let tokenData = tokenCacheRef.current.get(pos.token_id) ?? null;
          if (!tokenData) {
            const { data } = await supabase
              .from('gps_tokens')
              .select('bib_number, participant_name, event_id, active')
              .eq('id', pos.token_id)
              .single();
            if (!data?.active) return;
            tokenData = { bib_number: data.bib_number, participant_name: data.participant_name, event_id: data.event_id };
            tokenCacheRef.current.set(pos.token_id, tokenData);
          }
          if (
            effectiveEventIds === null ||
            (effectiveEventIds.length > 0 && !effectiveEventIds.includes(tokenData.event_id))
          ) return;
          // Filtro por concepto: mismo criterio que el fetch inicial
          if (!passesKind(pos.token_id, catalogRolesRef.current)) return;

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
  }, [effectiveEventIds, fetchSOS, passesKind]);

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

    // En repetición, el directo no debe verse: los marcadores en vivo se
    // ocultan (incluidos los que acaban de nacer por realtime)
    if (replayActiveRef.current) {
      markers.current.forEach(m => { m.getElement().style.display = 'none'; });
    }

    // Encuadre inicial UNA sola vez y solo si no hay recorrido pintado:
    // un GPS lejano (pruebas a 1.000 km) no debe arrastrar la vista, y los
    // reencuadres continuos pisaban el zoom manual del operador
    if (runners.length > 0 && !didInitialFit.current && !routeBounds.current) {
      didInitialFit.current = true;
      const bounds = new mapboxgl.LngLatBounds();
      runners.forEach(r => bounds.extend([r.lng, r.lat]));
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
    }
  }, [runners, mapReady]);

  // ── Auto-detectar roadbook si no se pasa ─────────────────────────────────
  const [detectedRoadbookId, setDetectedRoadbookId] = useState(roadbookId || '');

  useEffect(() => {
    if (roadbookId) { setDetectedRoadbookId(roadbookId); return; }
    if (!eventId) return;
    let cancelled = false;

    // Intentar encontrar roadbook via race_distances → roadbooks
    // O buscar directamente si el eventId está en roadbooks o race_distances
    const findRoadbook = async () => {
      // 1. Buscar race_distances con race_id = eventId
      const { data: dists } = await supabase
        .from('race_distances')
        .select('id')
        .eq('race_id', eventId);

      if (dists && dists.length > 0) {
        const distIds = dists.map(d => d.id);
        const { data: rbs } = await supabase
          .from('roadbooks')
          .select('id')
          .in('race_distance_id', distIds)
          .limit(1);
        if (cancelled) return;
        if (rbs && rbs.length > 0) {
          setDetectedRoadbookId(rbs[0].id);
          return;
        }
      }
      if (cancelled) return;

      // 2. Buscar en gps_tokens los race_distance_id asociados al evento
      //    El eventId podría no ser un race_id real, así que buscamos roadbooks
      //    que tengan puntos geográficamente cercanos a los corredores
      const { data: allRoadbooks } = await supabase
        .from('roadbooks')
        .select('id, name')
        .limit(20);

      if (allRoadbooks && allRoadbooks.length === 1 && !cancelled) {
        // Solo hay un roadbook, úsalo
        setDetectedRoadbookId(allRoadbooks[0].id);
        return;
      }
      // Si hay más de uno, no auto-detectamos para evitar confusión.
      // Sin rutómetro, el recorrido sale de los GPX de las pruebas (efecto aparte).
    };

    findRoadbook();
    return () => { cancelled = true; };
  }, [eventId, roadbookId]);

  // ── Recorrido del roadbook ───────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !map.current || !detectedRoadbookId) return;

    const loadRoute = async () => {
      // Cargar todos los puntos del roadbook ordenados
      const allPoints: { latitude: number; longitude: number; altitude: number; description: string; is_checkpoint: boolean; item_order: number }[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('roadbook_items')
          .select('latitude, longitude, altitude, description, is_checkpoint, item_order')
          .eq('roadbook_id', detectedRoadbookId)
          .order('item_order', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error || !data || data.length === 0) break;
        allPoints.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (allPoints.length < 2) return;

      // Crear GeoJSON LineString
      const coordinates = allPoints
        .filter(p => p.latitude && p.longitude)
        .map(p => [p.longitude, p.latitude]);

      const geojson: any = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      };

      // Eliminar cualquier recorrido anterior (rutómetro o GPX)
      clearRouteArtifacts();

      // Añadir fuente y capas
      map.current!.addSource('roadbook-route', {
        type: 'geojson',
        data: geojson,
      });

      // Línea de borde (más gruesa, oscura)
      map.current!.addLayer({
        id: 'roadbook-route-outline',
        type: 'line',
        source: 'roadbook-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1a1a2e', 'line-width': 6, 'line-opacity': 0.6 },
      });

      // Línea principal
      map.current!.addLayer({
        id: 'roadbook-route-line',
        type: 'line',
        source: 'roadbook-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#e94560', 'line-width': 3, 'line-opacity': 0.85 },
      });

      // Marcadores de salida y meta
      const start = allPoints[0];
      const end = allPoints[allPoints.length - 1];

      const startEl = document.createElement('div');
      startEl.innerHTML = `<div style="background:#4ade80;color:#000;font-weight:bold;font-size:11px;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">S</div>`;
      routeMarkers.current.push(
        new mapboxgl.Marker(startEl)
          .setLngLat([start.longitude, start.latitude])
          .setPopup(new mapboxgl.Popup().setHTML('<b>🏁 Salida</b>'))
          .addTo(map.current!)
      );

      const endEl = document.createElement('div');
      endEl.innerHTML = `<div style="background:#e94560;color:#fff;font-weight:bold;font-size:11px;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">M</div>`;
      routeMarkers.current.push(
        new mapboxgl.Marker(endEl)
          .setLngLat([end.longitude, end.latitude])
          .setPopup(new mapboxgl.Popup().setHTML('<b>🏆 Meta</b>'))
          .addTo(map.current!)
      );

      // Centrar en el recorrido (es el marco de referencia de la carrera)
      if (coordinates.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach(c => bounds.extend(c as [number, number]));
        routeBounds.current = bounds;
        setHasRoute(true);
        if (autoCenterRef.current) {
          map.current!.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }
      }
    };

    loadRoute();
  }, [mapReady, detectedRoadbookId, clearRouteArtifacts]);

  // ── Recorridos desde los GPX (cuando no hay rutómetro) ───────────────────
  // Una carrera puede tener varios eventos, cada uno con su GPX: se pintan
  // TODOS a la vez (un color por evento) o solo el elegido en el selector.

  useEffect(() => {
    if (!mapReady || !map.current || detectedRoadbookId) return;

    const GPX_COLORS = ['#e94560', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899'];
    const toDraw = raceDistances
      .filter(d => d.gpx_file_url)
      .filter(d => !selectedDistanceId || d.id === selectedDistanceId);

    let cancelled = false;

    const loadAll = async () => {
      clearRouteArtifacts();
      const bounds = new mapboxgl.LngLatBounds();
      let total = 0;

      for (let i = 0; i < toDraw.length; i++) {
        const dist = toDraw[i];
        try {
          const res = await fetch(dist.gpx_file_url!);
          const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
          const coordinates = Array.from(xml.getElementsByTagName('trkpt'))
            .map(p => [parseFloat(p.getAttribute('lon') || ''), parseFloat(p.getAttribute('lat') || '')])
            .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
          if (cancelled || coordinates.length < 2) continue;

          const srcId = `gpx-route-${dist.id}`;
          map.current!.addSource(srcId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            } as any,
          });
          map.current!.addLayer({
            id: `${srcId}-outline`,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#1a1a2e', 'line-width': 6, 'line-opacity': 0.5 },
          });
          map.current!.addLayer({
            id: `${srcId}-line`,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': GPX_COLORS[i % GPX_COLORS.length], 'line-width': 3, 'line-opacity': 0.9 },
          });

          coordinates.forEach(c => bounds.extend(c as [number, number]));
          total += coordinates.length;
        } catch (e) {
          console.error(`[TrackMap] Error cargando GPX de ${dist.name}:`, e);
        }
      }

      if (!cancelled && total > 0) {
        routeBounds.current = bounds;
        setHasRoute(true);
        if (autoCenterRef.current) {
          map.current!.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [mapReady, detectedRoadbookId, raceDistances, selectedDistanceId, clearRouteArtifacts]);

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

  // ── Repetición de grupo: cargar tracks, reproducir, salir ────────────────

  const toggleSelected = (tokenId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  };

  /** Track completo de un token, paginado (a 1-2 s puede haber miles de filas) */
  const loadTrackPoints = async (tokenId: string): Promise<ReplayPoint[]> => {
    const points: ReplayPoint[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('gps_positions')
        .select('lat, lng, timestamp')
        .eq('token_id', tokenId)
        .order('timestamp', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const p of data) {
        points.push({ t: new Date(p.timestamp).getTime(), lat: p.lat, lng: p.lng });
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return points;
  };

  const startReplay = async () => {
    if (selectedIds.size === 0) return;
    setReplayLoading(true);
    try {
      const tracks = new Map<string, ReplayTrack>();
      for (const id of selectedIds) {
        const runner = runners.find(r => r.token_id === id);
        if (!runner) continue;
        const points = await loadTrackPoints(id);
        if (points.length >= 2) {
          tracks.set(id, { bib: runner.bib_number, name: runner.participant_name, points });
        }
      }
      if (tracks.size === 0) return; // nadie con track suficiente
      let t0 = Infinity;
      let t1 = -Infinity;
      for (const tr of tracks.values()) {
        t0 = Math.min(t0, tr.points[0].t);
        t1 = Math.max(t1, tr.points[tr.points.length - 1].t);
      }
      replayActiveRef.current = true;
      setReplayTracks(tracks);
      setReplayRange({ t0, t1 });
      // El directo se esconde mientras dura la repetición
      markers.current.forEach(m => { m.getElement().style.display = 'none'; });
      setSelectedRunner(null);
    } finally {
      setReplayLoading(false);
    }
  };

  const stopReplay = () => {
    replayActiveRef.current = false;
    setReplayTracks(null);
    setReplayRange(null);
    replayMarkers.current.forEach(m => m.remove());
    replayMarkers.current.clear();
    markers.current.forEach(m => { m.getElement().style.display = ''; });
  };

  /** El reloj maestro mueve a cada seleccionado a donde estaba en ese instante */
  const handleReplayTime = useCallback((timeMs: number) => {
    if (!replayTracks || !map.current) return;
    for (const [id, tr] of replayTracks) {
      const pos = positionAt(tr.points, timeMs);
      let marker = replayMarkers.current.get(id);
      if (!pos) {
        // Aún no había salido en ese instante
        if (marker) {
          marker.remove();
          replayMarkers.current.delete(id);
        }
        continue;
      }
      if (!marker) {
        const el = document.createElement('div');
        el.innerHTML = markerHTML(tr.bib, false, null);
        marker = new mapboxgl.Marker(el).setLngLat(pos).addTo(map.current);
        replayMarkers.current.set(id, marker);
      } else {
        marker.setLngLat(pos);
      }
    }
  }, [replayTracks]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeRunners = runners.filter(r => {
    const ago = (Date.now() - new Date(r.timestamp).getTime()) / 1000;
    return ago < 300; // activo si posición < 5 min
  });

  // Búsqueda por dorsal o nombre (filtra solo la lista, no el mapa)
  const visibleRunners = runners.filter(r => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.bib_number || '').toLowerCase().includes(q) ||
      (r.participant_name || '').toLowerCase().includes(q)
    );
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

        {/* Conmutador de centrado en el recorrido (un GPS lejano no debe mandar).
            Oculto en modo controlado: el padre pone su propio botón */}
        {hasRoute && autoCenterProp === undefined && (
          <div className="absolute bottom-6 right-3 z-10">
            <button
              onClick={() => {
                const nuevo = !autoCenterRef.current;
                autoCenterRef.current = nuevo;
                setAutoCenter(nuevo);
                if (nuevo && routeBounds.current && map.current) {
                  map.current.fitBounds(routeBounds.current, { padding: 60, maxZoom: 14 });
                }
              }}
              className={`text-xs rounded-full px-3 py-1.5 border cursor-pointer flex items-center gap-2 ${
                autoCenter
                  ? 'bg-green-600/90 text-white border-green-400'
                  : 'bg-black/70 text-gray-300 border-white/20'
              }`}
              title="Con el centrado activado, el mapa se encuadra al recorrido; desactívalo para moverte libremente"
            >
              <span className={`h-2 w-2 rounded-full ${autoCenter ? 'bg-green-300' : 'bg-gray-500'}`} />
              🎯 Centrar recorrido {autoCenter ? 'ON' : 'OFF'}
            </button>
          </div>
        )}

        {/* Selector de evento (solo si el padre no pone el suyo) */}
        {showDistanceSelector && raceDistances.length > 1 && (
          <div className="absolute top-12 left-3 z-10">
            <select
              value={selectedDistanceId}
              onChange={e => setSelectedDistanceId(e.target.value)}
              className="bg-black/70 text-white text-xs rounded-full px-3 py-1.5 border border-white/20 outline-none cursor-pointer"
            >
              <option value="">Todos los eventos</option>
              {raceDistances.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

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

        {/* Reproductor de la repetición: reloj maestro del grupo elegido */}
        {replayTracks && replayRange && (
          <div className="absolute inset-x-3 bottom-3 z-20 space-y-2 md:inset-x-auto md:left-1/2 md:w-[560px] md:-translate-x-1/2">
            <div className="flex items-center justify-between rounded-full bg-black/70 px-3 py-1">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <Repeat className="h-3 w-3 text-[#e94560]" />
                REPETICIÓN · {replayTracks.size} {replayTracks.size === 1 ? 'participante' : 'participantes'}
              </span>
              <button
                onClick={stopReplay}
                className="text-xs font-bold text-[#e94560] hover:underline"
              >
                Volver al directo ✕
              </button>
            </div>
            <GroupPlaybackControls
              t0={replayRange.t0}
              t1={replayRange.t1}
              participantes={replayTracks.size}
              onTimeChange={handleReplayTime}
            />
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

        {/* Lista de corredores: búsqueda + selección para la repetición */}
        <div className="bg-[#16213e] rounded-xl border border-border flex-1 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Todos los corredores</span>
              {selectedIds.size > 0 && !replayTracks && (
                <button
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                  onClick={() => setSelectedIds(new Set())}
                  title="Vaciar la lista de favoritos"
                >
                  <Star className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" />
                  {selectedIds.size} · quitar
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar dorsal o nombre…"
                className="w-full rounded-full border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-gray-500 focus:border-[#e94560]/60"
              />
            </div>
            {/* Repetición del grupo seleccionado */}
            {selectedIds.size > 0 && !replayTracks && (
              <button
                onClick={startReplay}
                disabled={replayLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#e94560] py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {replayLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando tracks…
                  </>
                ) : (
                  <>
                    <Repeat className="h-3.5 w-3.5" />
                    Repetición de favoritos ({selectedIds.size})
                  </>
                )}
              </button>
            )}
          </div>
          <ScrollArea className="h-64 md:h-full md:flex-1">
            {visibleRunners.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {runners.length === 0 ? (
                  <>Sin posiciones aún.<br />Esperando datos de la app...</>
                ) : (
                  <>Nadie coincide con la búsqueda.</>
                )}
              </div>
            ) : (
              visibleRunners
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map(runner => {
                  const ago = (Date.now() - new Date(runner.timestamp).getTime()) / 1000;
                  const isActive = ago < 60;
                  return (
                    <div
                      key={runner.token_id}
                      className="flex w-full items-center border-b border-border/50 transition-colors hover:bg-white/5"
                    >
                      {/* Favorito: entra en la repetición de grupo */}
                      <button
                        type="button"
                        className="shrink-0 cursor-pointer py-2 pl-3 pr-1"
                        onClick={e => {
                          e.stopPropagation();
                          toggleSelected(runner.token_id);
                        }}
                        aria-label={`${selectedIds.has(runner.token_id) ? 'Quitar de' : 'Añadir a'} favoritos: ${runner.participant_name}`}
                        title="Favorito (para la repetición de grupo)"
                      >
                        <Star
                          className={`h-4 w-4 transition-colors ${
                            selectedIds.has(runner.token_id)
                              ? 'fill-[#f59e0b] text-[#f59e0b]'
                              : 'text-gray-600 hover:text-gray-400'
                          }`}
                        />
                      </button>
                      <button
                        className="min-w-0 flex-1 px-2 py-2 text-left"
                        onClick={() => {
                          setSelectedRunner(runner);
                          map.current?.flyTo({ center: [runner.lng, runner.lat], zoom: 14 });
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[#e94560] font-bold text-sm w-8">{runner.bib_number}</span>
                            <span className="text-xs text-white truncate max-w-[110px]">{runner.participant_name}</span>
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
                    </div>
                  );
                })
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
