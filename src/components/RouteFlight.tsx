/**
 * RouteFlight — vuelo de cámara 3D sobre el track de un recorrido.
 * Adaptado del motor RoadbookFlight (Next.js) a Vite/React con la
 * identidad de Camberas: estela verde-lima sobre HUD verde-noche.
 *
 * - `progressKm` controlado desde fuera → se sincroniza con un perfil
 * - `onProgressChange` → el vuelo puede mover otros componentes
 * - `deterministic` → modo captura para Playwright/FFmpeg
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';

/** [lng, lat, altitud_m] — tal cual salen del GPX */
export type TrackCoord = [number, number, number];

export type PoiType = 'climb' | 'sprint' | 'feed' | 'finish' | 'start' | 'danger';

export interface Poi {
  id: string;
  km: number;
  type: PoiType;
  name: string;
  category?: string;
}

export interface PaceSegment {
  km: number;
  kmh: number;
}

export interface RouteFlightProps {
  track: TrackCoord[];
  pois?: Poi[];
  pace?: PaceSegment[];
  accessToken: string;
  mapStyle?: string;
  progressKm?: number;
  onProgressChange?: (km: number) => void;
  /** Multiplicador sobre el tiempo real de carrera. 60 = 1 min de carrera por segundo. */
  timeScale?: number;
  autoPlay?: boolean;
  showHud?: boolean;
  deterministic?: boolean;
  captureFps?: number;
  onReady?: () => void;
  onFinish?: () => void;
  className?: string;
}

/* Marca Camberas */
const LIMA = '#C8E85C';
const NOCHE = '#0E2419';

const POI_COLOR: Record<PoiType, string> = {
  climb: '#E5484D',
  sprint: '#F4A468',
  feed: '#3D7D5C',
  finish: '#FFFFFF',
  start: '#FFFFFF',
  danger: '#EC7C2B',
};

interface TrackIndex {
  line: GeoJSON.Feature<GeoJSON.LineString>;
  cumKm: number[];
  totalKm: number;
  elevations: number[];
}

function buildIndex(track: TrackCoord[]): TrackIndex {
  const line = turf.lineString(track.map((c) => [c[0], c[1]]));
  const cumKm: number[] = [0];
  for (let i = 1; i < track.length; i++) {
    const d = turf.distance(
      turf.point([track[i - 1][0], track[i - 1][1]]),
      turf.point([track[i][0], track[i][1]]),
      { units: 'kilometers' },
    );
    cumKm.push(cumKm[i - 1] + d);
  }
  return {
    line,
    cumKm,
    totalKm: cumKm[cumKm.length - 1],
    elevations: track.map((c) => c[2] ?? 0),
  };
}

function sampleAt(idx: TrackIndex, km: number) {
  const clamped = Math.max(0, Math.min(km, idx.totalKm));
  const pt = turf.along(idx.line, clamped, { units: 'kilometers' });
  const [lng, lat] = pt.geometry.coordinates;

  let i = 1;
  while (i < idx.cumKm.length && idx.cumKm[i] < clamped) i++;
  const i0 = Math.max(0, i - 1);
  const span = idx.cumKm[i] - idx.cumKm[i0];
  const t = span > 0 ? (clamped - idx.cumKm[i0]) / span : 0;
  const ele = idx.elevations[i0] + (idx.elevations[i] - idx.elevations[i0]) * t;

  return { lng, lat, ele, km: clamped };
}

function gradientAt(idx: TrackIndex, km: number, windowKm = 0.25) {
  const a = sampleAt(idx, km - windowKm);
  const b = sampleAt(idx, km + windowKm);
  const runM = (b.km - a.km) * 1000;
  if (runM <= 0) return 0;
  return ((b.ele - a.ele) / runM) * 100;
}

function kmhAt(pace: PaceSegment[] | undefined, km: number): number {
  if (!pace?.length) return 10; // ritmo por defecto: trail corriendo
  let v = pace[0].kmh;
  for (const seg of pace) {
    if (seg.km <= km) v = seg.kmh;
    else break;
  }
  return Math.max(1, v);
}

const TERRAIN_EXAGGERATION = 1.3;
const MIN_CLEARANCE_M = 60; // margen mínimo sobre cualquier cresta bajo el vuelo

interface CamState {
  lng: number;
  lat: number;
  alt: number;
  bearing: number;
  pitch: number;
  initialized: boolean;
}

/**
 * Elevación del terreno RENDERIZADO (con exageración) en un punto.
 * queryTerrainElevation devuelve null si la tesela aún no está cargada;
 * en ese caso caemos a la cota del GPX multiplicada por la exageración.
 */
function groundElevation(
  map: mapboxgl.Map,
  s: { lng: number; lat: number; ele: number },
): number {
  const q = map.queryTerrainElevation([s.lng, s.lat], { exaggerated: true });
  return Math.max(q ?? -Infinity, s.ele * TERRAIN_EXAGGERATION);
}

/**
 * Cámara por detrás del punto actual mirando hacia adelante; reacciona
 * a la pendiente (subiendo: alta y atrás · bajando: baja y pegada).
 * La altitud se referencia al terreno renderizado (no al GPX) y se
 * muestrean las crestas intermedias para no atravesar montañas.
 */
function positionCamera(
  map: mapboxgl.Map,
  idx: TrackIndex,
  km: number,
  gradient: number,
  cam: CamState,
) {
  const g = Math.max(-12, Math.min(12, gradient));

  const trailKm = 1.4 + Math.max(0, g) * 0.04;
  const lookaheadKm = 0.5 + Math.max(0, -g) * 0.05;
  const heightM = 340 + Math.max(0, g) * 25;

  const behind = sampleAt(idx, km - trailKm);
  const ahead = sampleAt(idx, km + lookaheadKm);

  // Terreno bajo la cámara y crestas entre la cámara y el corredor
  let ground = groundElevation(map, behind);
  for (let f = 0.25; f <= 1.001; f += 0.25) {
    ground = Math.max(ground, groundElevation(map, sampleAt(idx, km - trailKm * (1 - f))));
  }
  const targetAlt = groundElevation(map, ahead);
  const rawAlt = Math.max(ground + heightM, targetAlt + MIN_CLEARANCE_M);

  const rawBearing = turf.bearing(
    turf.point([behind.lng, behind.lat]),
    turf.point([ahead.lng, ahead.lat]),
  );

  // Suavizado exponencial de TODO (posición, altitud, rumbo y pitch):
  // el zigzag del GPX no debe traducirse en golpes de cámara
  if (!cam.initialized) {
    cam.lng = behind.lng;
    cam.lat = behind.lat;
    cam.alt = rawAlt;
    cam.bearing = rawBearing;
    cam.pitch = 60;
    cam.initialized = true;
  } else {
    const kPos = 0.05;
    const kAlt = 0.04;
    const kBear = 0.05;
    cam.lng += (behind.lng - cam.lng) * kPos;
    cam.lat += (behind.lat - cam.lat) * kPos;
    cam.alt += (rawAlt - cam.alt) * kAlt;
    let db = rawBearing - cam.bearing;
    if (db > 180) db -= 360;
    if (db < -180) db += 360;
    cam.bearing += db * kBear;
    cam.bearing = ((cam.bearing + 540) % 360) - 180;
  }
  // Aunque el suavizado vaya por detrás, nunca por debajo del terreno
  const alt = Math.max(cam.alt, ground + 40);

  // Pitch geométrico hacia el punto de mira A SU ALTITUD real
  // (lookAtPoint apunta a cota 0 y provocaba picados hacia el mar)
  const distM = Math.max(
    1,
    turf.distance(
      turf.point([cam.lng, cam.lat]),
      turf.point([ahead.lng, ahead.lat]),
      { units: 'kilometers' },
    ) * 1000,
  );
  const rawPitch = Math.max(
    25,
    Math.min(83, (Math.atan2(distM, alt - targetAlt) * 180) / Math.PI),
  );
  cam.pitch += (rawPitch - cam.pitch) * 0.06;

  const camera = map.getFreeCameraOptions();
  camera.position = mapboxgl.MercatorCoordinate.fromLngLat(
    { lng: cam.lng, lat: cam.lat },
    alt,
  );
  camera.setPitchBearing(cam.pitch, cam.bearing);
  map.setFreeCameraOptions(camera);
}

const HUD_CSS = `
.rbf-hud {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 2;
  background: ${NOCHE}E6;
  border-left: 3px solid ${LIMA};
  border-radius: 0 8px 8px 0;
  padding: 12px 18px;
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  color: #fff;
}
.rbf-km { display: flex; align-items: baseline; gap: 6px; line-height: 1; }
.rbf-km-value { font-size: 44px; font-weight: 700; color: ${LIMA}; font-variant-numeric: tabular-nums; }
.rbf-km-unit { font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; }
.rbf-km-total { font-size: 15px; opacity: 0.5; }
.rbf-stats { display: flex; gap: 14px; margin-top: 4px; font-size: 17px; font-variant-numeric: tabular-nums; }
.rbf-grad { font-weight: 700; }
.rbf-btn {
  margin-top: 10px; background: #EC7C2B; color: #fff; border: 0;
  padding: 7px 16px; border-radius: 6px; font-family: inherit; font-size: 15px;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
}
.rbf-btn:hover { background: #C05E17; }
.rbf-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.rbf-poi {
  display: flex; align-items: center; gap: 6px;
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 13px; color: #fff; background: ${NOCHE}CC;
  padding: 3px 8px; border-radius: 5px; white-space: nowrap; transform: translateY(-8px);
}
.rbf-poi-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.rbf-poi-label b { color: ${LIMA}; margin-left: 5px; }
.rbf-pos { display: flex; align-items: center; gap: 7px; pointer-events: none; }
.rbf-pos-dot {
  width: 16px; height: 16px; border-radius: 50%; flex: none;
  background: #EC7C2B; border: 3px solid #fff;
  box-shadow: 0 0 0 4px rgba(236, 124, 43, 0.35), 0 2px 6px rgba(0, 0, 0, 0.5);
  animation: rbf-pulse 1.6s ease-out infinite;
}
.rbf-pos-ele {
  background: ${NOCHE}E6; color: ${LIMA};
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  padding: 2px 9px; border-radius: 11px; white-space: nowrap;
}
@keyframes rbf-pulse {
  0% { box-shadow: 0 0 0 4px rgba(236, 124, 43, 0.35), 0 2px 6px rgba(0, 0, 0, 0.5); }
  70% { box-shadow: 0 0 0 12px rgba(236, 124, 43, 0), 0 2px 6px rgba(0, 0, 0, 0.5); }
  100% { box-shadow: 0 0 0 4px rgba(236, 124, 43, 0), 0 2px 6px rgba(0, 0, 0, 0.5); }
}
@media (max-width: 640px) {
  .rbf-km-value { font-size: 34px; }
  .rbf-hud { left: 10px; bottom: 10px; padding: 9px 13px; }
}
`;

export default function RouteFlight({
  track,
  pois = [],
  pace,
  accessToken,
  mapStyle = 'mapbox://styles/mapbox/satellite-streets-v12',
  progressKm,
  onProgressChange,
  timeScale = 60,
  autoPlay = false,
  showHud = true,
  deterministic = false,
  captureFps = 30,
  onReady,
  onFinish,
  className,
}: RouteFlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const idxRef = useRef<TrackIndex | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const kmRef = useRef(0);
  const frameRef = useRef(0);
  const camRef = useRef<CamState>({
    lng: 0, lat: 0, alt: 0, bearing: 0, pitch: 60, initialized: false,
  });
  const posMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const posEleRef = useRef<HTMLSpanElement | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(autoPlay);
  const [hud, setHud] = useState({ km: 0, ele: 0, gradient: 0 });

  const controlled = progressKm !== undefined;

  if (!idxRef.current && track.length > 1) {
    idxRef.current = buildIndex(track);
  }

  const renderAt = useCallback((km: number) => {
    const map = mapRef.current;
    const idx = idxRef.current;
    if (!map || !idx) return;

    const s = sampleAt(idx, km);
    const g = gradientAt(idx, km);

    positionCamera(map, idx, km, g, camRef.current);

    // Punto de posición actual sobre el track
    if (posMarkerRef.current) {
      posMarkerRef.current.setLngLat([s.lng, s.lat]);
      if (posEleRef.current) {
        posEleRef.current.textContent = `${Math.round(s.ele)} m`;
      }
    }

    const done = map.getSource('track-done') as mapboxgl.GeoJSONSource | undefined;
    if (done && km > 0.01) {
      const slice = turf.lineSliceAlong(idx.line, 0, Math.max(0.01, km), {
        units: 'kilometers',
      });
      done.setData(slice as GeoJSON.Feature);
    }

    setHud({ km: s.km, ele: s.ele, gradient: g });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const idx = idxRef.current;
    if (!idx) return;

    mapboxgl.accessToken = accessToken;

    const start = sampleAt(idx, 0);
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [start.lng, start.lat],
      zoom: 13,
      pitch: 70,
      interactive: false,
      preserveDrawingBuffer: deterministic,
      attributionControl: true,
    });
    mapRef.current = map;

    map.on('style.load', () => {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION });

      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun-intensity': 12,
          'sky-atmosphere-color': '#8FC7E8',
        },
      });

      map.addSource('track-full', { type: 'geojson', data: idx.line });
      map.addLayer({
        id: 'track-full-line',
        type: 'line',
        source: 'track-full',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 4, 'line-opacity': 0.65 },
      });

      map.addSource('track-done', {
        type: 'geojson',
        data: turf.lineString([
          [start.lng, start.lat],
          [start.lng, start.lat],
        ]),
      });
      map.addLayer({
        id: 'track-done-glow',
        type: 'line',
        source: 'track-done',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIMA, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.5 },
      });
      map.addLayer({
        id: 'track-done-line',
        type: 'line',
        source: 'track-done',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIMA, 'line-width': 5 },
      });

      // Marcador de posición actual: punto naranja pulsante + altitud
      const posEl = document.createElement('div');
      posEl.className = 'rbf-pos';
      const dot = document.createElement('span');
      dot.className = 'rbf-pos-dot';
      const eleLabel = document.createElement('span');
      eleLabel.className = 'rbf-pos-ele';
      eleLabel.textContent = `${Math.round(start.ele)} m`;
      posEl.append(dot, eleLabel);
      posEleRef.current = eleLabel;
      posMarkerRef.current = new mapboxgl.Marker({ element: posEl, anchor: 'left', offset: [-11, 0] })
        .setLngLat([start.lng, start.lat])
        .addTo(map);

      for (const poi of pois) {
        const p = sampleAt(idx, poi.km);
        const el = document.createElement('div');
        el.className = 'rbf-poi';
        el.innerHTML = `
          <span class="rbf-poi-dot" style="background:${POI_COLOR[poi.type]}"></span>
          <span class="rbf-poi-label">
            ${poi.name}${poi.category ? ` · ${poi.category}` : ''}
            <b>${Math.round(p.ele)} m</b>
          </span>`;
        new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      }

      renderAt(controlled ? progressKm! : 0);
      setReady(true);
      onReady?.();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, mapStyle]);

  useEffect(() => {
    if (!ready || !controlled) return;
    kmRef.current = progressKm!;
    renderAt(progressKm!);
  }, [progressKm, ready, controlled, renderAt]);

  useEffect(() => {
    if (!ready || controlled || !playing) return;
    const idx = idxRef.current;
    if (!idx) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const step = (ts: number) => {
      let dtSec: number;

      if (deterministic) {
        dtSec = 1 / captureFps;
        frameRef.current += 1;
      } else {
        if (lastTsRef.current === null) lastTsRef.current = ts;
        dtSec = (ts - lastTsRef.current) / 1000;
        lastTsRef.current = ts;
      }

      const kmh = kmhAt(pace, kmRef.current);
      const advanceKm = (kmh / 3600) * dtSec * timeScale;
      kmRef.current += advanceKm;

      if (kmRef.current >= idx.totalKm) {
        kmRef.current = idx.totalKm;
        renderAt(kmRef.current);
        setPlaying(false);
        onFinish?.();
        return;
      }

      renderAt(kmRef.current);
      onProgressChange?.(kmRef.current);
      rafRef.current = requestAnimationFrame(step);
    };

    if (reduced && !deterministic) {
      kmRef.current = idx.totalKm;
      renderAt(idx.totalKm);
      setPlaying(false);
      return;
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [
    ready, playing, controlled, pace, timeScale,
    deterministic, captureFps, renderAt, onProgressChange, onFinish,
  ]);

  useEffect(() => {
    if (!deterministic || !ready) return;
    (window as any).__rbf = {
      seek: (km: number) => {
        kmRef.current = km;
        renderAt(km);
      },
      totalKm: () => idxRef.current?.totalKm ?? 0,
      idle: () => mapRef.current?.loaded() ?? false,
    };
  }, [deterministic, ready, renderAt]);

  const totalKm = idxRef.current?.totalKm ?? 0;

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{HUD_CSS}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {showHud && (
        <div className="rbf-hud">
          <div className="rbf-km">
            <span className="rbf-km-value">{hud.km.toFixed(1)}</span>
            <span className="rbf-km-unit">km</span>
            <span className="rbf-km-total">/ {totalKm.toFixed(1)}</span>
          </div>
          <div className="rbf-stats">
            <span>{Math.round(hud.ele)} m</span>
            <span
              className="rbf-grad"
              style={{
                color: hud.gradient > 3 ? '#FF6B66' : hud.gradient < -3 ? LIMA : '#FFFFFF',
              }}
            >
              {hud.gradient > 0 ? '+' : ''}
              {hud.gradient.toFixed(1)} %
            </span>
          </div>
          {!controlled && (
            <button className="rbf-btn" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pausar' : 'Sobrevolar el recorrido'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
