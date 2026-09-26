/**
 * Rutómetro a partir del GPX del recorrido.
 *
 * El track (trkpt) da el recorrido punto a punto, como tipo «point»; los mapas
 * lo usan para dibujar la línea. Los waypoints (wpt) son los puntos que
 * interesan de verdad —avituallamientos, controles, ambulancia, cruces— y van
 * destacados (is_highlighted), que es lo que enseñan el rutómetro público y
 * los mapas en directo. Cada waypoint se coloca en el km del punto del track
 * más cercano; los que están lejos del recorrido (aparcamientos, duchas…) no
 * tienen km y se devuelven aparte para avisar.
 */
import { parseGpxFile, type GpxWaypoint } from "@/lib/gpxParser";

export interface PuntoRutometro {
  item_order: number;
  item_type: string;
  description: string;
  notes: string | null;
  km_total: number;
  km_partial: number;
  km_remaining: number;
  altitude: number | null;
  latitude: number;
  longitude: number;
  is_highlighted: boolean;
  is_checkpoint: boolean;
}

export interface ResultadoRutometro {
  puntos: PuntoRutometro[];
  /** puntos del track */
  trackpoints: number;
  /** waypoints colocados sobre el recorrido */
  waypointsIncluidos: number;
  /** nombres de los waypoints que quedan lejos del recorrido y no se incluyen */
  waypointsFuera: string[];
}

/** A más de esto del track, el waypoint no es del recorrido (aparcamientos, duchas…) */
export const DISTANCIA_MAX_WAYPOINT_KM = 0.3;

export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Primero por lo que dice el nombre (es lo que escribe el organizador), después
// por el símbolo del GPX (Garmin/Wikiloc/BaseCamp), y si no, punto de interés.
// El orden importa: «Avituallamiento Meta» es un avituallamiento, «Control de
// Salida-Meta» es un control.
const POR_NOMBRE: [RegExp, string][] = [
  [/avitu|\baid\b|refresco/i, "aid_station"],
  [/\bagua\b|water|hidrat/i, "refreshment"],
  [/ambulanc|m[eé]dic|sanitari|enfermer|\bsvb\b|\bdya\b|cruz roja|hospital/i, "medical"],
  [/control|cronometr|\bcp\s?\d*\b|\bpc\s?\d*\b|\bpaso\b/i, "checkpoint"],
  [/salida|\bstart\b|inicio/i, "start"],
  [/\bmeta\b|finish|llegada|\bfinal\b/i, "finish"],
  [/peligro|danger|t[eé]cnic|cruce|desv[ií]o/i, "technical"],
];
const POR_SIMBOLO: [RegExp, string][] = [
  [/drinking water|^water/i, "refreshment"],
  [/picnic|food|fuel/i, "aid_station"],
  [/pharmacy|medical|first aid|hospital/i, "medical"],
  [/information|checkpoint|flag/i, "checkpoint"],
  [/crossing|danger|caution|skull/i, "technical"],
];
// Tipos que no existen para esta modalidad («refreshment» solo trail,
// «technical» solo MTB) o que no están dados de alta
const RESPALDO: Record<string, string> = {
  refreshment: "aid_station",
  technical: "poi",
  medical: "checkpoint",
};

/** Tipo de punto (name de roadbook_item_types) para un waypoint del GPX */
export function tipoDeWaypoint(wp: { name: string; sym?: string }, tiposDisponibles: Set<string>): string {
  let tipo = POR_NOMBRE.find(([re]) => re.test(wp.name))?.[1];
  if (!tipo && wp.sym) tipo = POR_SIMBOLO.find(([re]) => re.test(wp.sym as string))?.[1];
  tipo = tipo ?? "poi";
  while (!tiposDisponibles.has(tipo) && RESPALDO[tipo]) tipo = RESPALDO[tipo];
  return tiposDisponibles.has(tipo) ? tipo : "poi";
}

const redondea3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Construye los puntos del rutómetro desde el texto de un GPX. No escribe en
 * la BD: devuelve las filas (sin roadbook_id ni item_type_id) y el resumen.
 * @param distanciaKmOficial distancia del recorrido en la ficha; si es 0 se usa la del track
 */
export function construirPuntosRutometro(
  gpxText: string,
  distanciaKmOficial: number,
  tiposDisponibles: Set<string>
): ResultadoRutometro {
  const gpx = parseGpxFile(gpxText);
  const track = gpx.tracks[0]?.points ?? [];

  // Km acumulado de cada punto del track
  const acumulado: number[] = [];
  let km = 0;
  track.forEach((p, i) => {
    if (i > 0) km += distanciaKm(track[i - 1].lat, track[i - 1].lon, p.lat, p.lon);
    acumulado.push(km);
  });
  const total = distanciaKmOficial > 0 ? distanciaKmOficial : km;

  // Cada waypoint, al punto del track más cercano (puede haber varios en el mismo)
  const porIndice = new Map<number, GpxWaypoint[]>();
  const waypointsFuera: string[] = [];
  const sueltos: GpxWaypoint[] = []; // sin track: los waypoints van tal cual, en su orden
  gpx.waypoints.forEach((wp) => {
    if (!wp.lat || !wp.lon) return;
    if (track.length === 0) {
      sueltos.push(wp);
      return;
    }
    let mejor = 0;
    let dMin = Infinity;
    track.forEach((p, i) => {
      const d = distanciaKm(wp.lat, wp.lon, p.lat, p.lon);
      if (d < dMin) {
        dMin = d;
        mejor = i;
      }
    });
    if (dMin <= DISTANCIA_MAX_WAYPOINT_KM) {
      porIndice.set(mejor, [...(porIndice.get(mejor) ?? []), wp]);
    } else {
      waypointsFuera.push(wp.name);
    }
  });

  const puntos: PuntoRutometro[] = [];
  let kmAnterior = 0;
  const añade = (p: Omit<PuntoRutometro, "item_order" | "km_partial" | "km_remaining">) => {
    puntos.push({
      ...p,
      item_order: puntos.length,
      km_partial: redondea3(Math.max(0, p.km_total - kmAnterior)),
      km_remaining: redondea3(Math.max(0, total - p.km_total)),
    });
    kmAnterior = p.km_total;
  };
  const deWaypoint = (wp: GpxWaypoint, kmTotal: number, altitudTrack?: number) => {
    let tipo = tipoDeWaypoint(wp, tiposDisponibles);
    // En un circuito, «Salida/Meta» es el mismo sitio: lo que está en la
    // segunda mitad del recorrido es la meta, y lo que está al principio, la salida
    if (total > 0 && (tipo === "start" || tipo === "finish")) {
      tipo = kmTotal > total / 2 ? "finish" : "start";
    }
    const nota = [wp.desc, wp.cmt].filter((t) => t && t.trim()).join(" · ") || null;
    añade({
      item_type: tipo,
      description: wp.name,
      notes: nota,
      km_total: redondea3(kmTotal),
      altitude: wp.ele != null && wp.ele > 0 ? Math.round(wp.ele) : altitudTrack != null ? Math.round(altitudTrack) : null,
      latitude: wp.lat,
      longitude: wp.lon,
      is_highlighted: true,
      is_checkpoint: tipo === "checkpoint",
    });
  };

  track.forEach((p, i) => {
    const ultimo = i === track.length - 1;
    const primero = i === 0;
    añade({
      item_type: primero ? "start" : ultimo ? "finish" : "point",
      description: primero ? "Salida" : ultimo ? "Meta" : `Punto ${i + 1}`,
      notes: null,
      km_total: redondea3(acumulado[i]),
      altitude: p.ele != null ? Math.round(p.ele) : null,
      latitude: p.lat,
      longitude: p.lon,
      is_highlighted: primero || ultimo,
      is_checkpoint: false,
    });
    porIndice.get(i)?.forEach((wp) => deWaypoint(wp, acumulado[i], p.ele));
  });
  sueltos.forEach((wp) => deWaypoint(wp, 0));

  return {
    puntos,
    trackpoints: track.length,
    waypointsIncluidos: puntos.filter((p) => p.is_highlighted && p.item_type !== "point").length - (track.length ? 2 : 0),
    waypointsFuera,
  };
}
