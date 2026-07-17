/**
 * Proyección de posiciones GPS sobre el recorrido GPX.
 *
 * Permite calcular, para cada corredor, los km recorridos, los km restantes
 * hasta meta y el % de progreso — base de la "clasificación virtual" del
 * mapa en vivo (quién va primero, cuánto le queda).
 *
 * Limitación v1: usa el vértice más cercano del track. En recorridos con
 * varias vueltas o tramos que se cruzan puede saltar entre pasadas.
 */

export interface RouteIndex {
  /** Coordenadas [lng, lat] del track */
  coords: [number, number][];
  /** Km acumulados en cada vértice */
  cumKm: number[];
  totalKm: number;
}

export interface RouteProgress {
  km: number;
  remainingKm: number;
  pct: number;
  /** Distancia del corredor al track, en metros */
  offRouteM: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function buildRouteIndex(coords: [number, number][]): RouteIndex {
  const cumKm: number[] = new Array(coords.length);
  let total = 0;
  cumKm[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(
      coords[i - 1][1],
      coords[i - 1][0],
      coords[i][1],
      coords[i][0]
    );
    cumKm[i] = total;
  }
  return { coords, cumKm, totalKm: total };
}

export function projectOnRoute(
  index: RouteIndex,
  lng: number,
  lat: number
): RouteProgress | null {
  if (index.coords.length === 0) return null;

  let bestIdx = -1;
  let bestKm = Infinity;
  for (let i = 0; i < index.coords.length; i++) {
    const d = haversineKm(lat, lng, index.coords[i][1], index.coords[i][0]);
    if (d < bestKm) {
      bestKm = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;

  const km = index.cumKm[bestIdx];
  return {
    km,
    remainingKm: Math.max(0, index.totalKm - km),
    pct: index.totalKm > 0 ? (km / index.totalKm) * 100 : 0,
    offRouteM: bestKm * 1000,
  };
}
