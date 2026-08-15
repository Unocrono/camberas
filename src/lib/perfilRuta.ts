/**
 * Perfil de una ruta y detección de sus puertos, para el cartel de RRSS.
 *
 * La gracia de un perfil publicable no es la línea: son los PUERTOS
 * marcados con su nombre, altura y categoría (el lenguaje que todo
 * ciclista lee de un vistazo). Aquí se sacan del propio GPX.
 */

import { calculateHaversineDistance, type GpxTrackPoint } from './gpxParser';

export interface PuntoPerfil {
  km: number;
  ele: number;
}

export interface Puerto {
  /** Km donde corona */
  km: number;
  /** Altitud de la cima (m) */
  cima: number;
  /** Desnivel del puerto (m) */
  desnivel: number;
  /** Longitud del puerto (km) */
  longitud: number;
  /** Pendiente media (%) */
  pendiente: number;
  /** 1 = más duro … 4, y 'ESP' para los de categoría especial */
  categoria: string;
  /** Nombre, si el GPX trae un waypoint cerca de la cima */
  nombre?: string;
}

/** Un waypoint del capo colocado sobre el recorrido */
export interface Hito {
  km: number;
  ele: number;
  nombre: string;
  tipo: 'avituallamiento' | 'punto';
}

export interface PerfilRuta {
  puntos: PuntoPerfil[];
  km: number;
  desnivel: number;
  altMin: number;
  altMax: number;
  puertos: Puerto[];
  /** Waypoints del GPX que no son cima de puerto: avituallamientos y
   *  puntos de interés. Esto SÍ lo pone el capo — del relieve no se
   *  deduce dónde hay una fuente o un bar. */
  hitos: Hito[];
}

/** Media móvil: el GPS mete ruido de ±5 m que inventa cuestas que no existen */
const suavizar = (valores: number[], ventana = 9): number[] => {
  const out: number[] = [];
  const mitad = Math.floor(ventana / 2);
  for (let i = 0; i < valores.length; i++) {
    let suma = 0;
    let n = 0;
    for (let j = Math.max(0, i - mitad); j <= Math.min(valores.length - 1, i + mitad); j++) {
      suma += valores[j];
      n++;
    }
    out.push(suma / n);
  }
  return out;
};

/**
 * Categoría al estilo ciclista: producto de desnivel × pendiente media.
 * No es la fórmula del Tour (que es secreta y discutida), pero ordena los
 * puertos como los ordenaría cualquiera que los haya subido.
 */
const categorizar = (desnivel: number, pendiente: number): string => {
  const dureza = desnivel * pendiente;
  if (dureza >= 8000) return 'ESP';
  if (dureza >= 4000) return '1';
  if (dureza >= 2000) return '2';
  if (dureza >= 900) return '3';
  return '4';
};

/**
 * Detección de puertos: se recorre el perfil buscando tramos de subida
 * sostenida. Un puerto es un tramo que gana al menos MIN_DESNIVEL metros
 * sin bajar más de TOLERANCIA seguidos (los repechos y falsos llanos de
 * dentro de un puerto no lo parten en dos).
 */
const MIN_DESNIVEL = 120;   // m — por debajo, es un repecho
const TOLERANCIA = 30;      // m de bajada que no rompen la subida
const MIN_PENDIENTE = 2.5;  // % — por debajo es falso llano, no puerto

export const detectarPuertos = (
  puntos: PuntoPerfil[],
  waypoints: { name: string; lat: number; lon: number }[] = [],
  trackPoints: GpxTrackPoint[] = [],
): Puerto[] => {
  const puertos: Puerto[] = [];
  if (puntos.length < 10) return puertos;

  let inicio = 0;
  let cimaIdx = 0;

  for (let i = 1; i < puntos.length; i++) {
    // Nueva cima del tramo en curso
    if (puntos[i].ele >= puntos[cimaIdx].ele) {
      cimaIdx = i;
      continue;
    }
    // ¿Ha bajado lo suficiente como para dar el puerto por coronado?
    const caida = puntos[cimaIdx].ele - puntos[i].ele;
    if (caida < TOLERANCIA) continue;

    const desnivel = puntos[cimaIdx].ele - puntos[inicio].ele;
    const longitud = puntos[cimaIdx].km - puntos[inicio].km;
    const pendiente = longitud > 0 ? (desnivel / (longitud * 1000)) * 100 : 0;

    if (desnivel >= MIN_DESNIVEL && pendiente >= MIN_PENDIENTE) {
      puertos.push({
        km: Math.round(puntos[cimaIdx].km * 10) / 10,
        cima: Math.round(puntos[cimaIdx].ele),
        desnivel: Math.round(desnivel),
        longitud: Math.round(longitud * 10) / 10,
        pendiente: Math.round(pendiente * 10) / 10,
        categoria: categorizar(desnivel, pendiente),
        nombre: nombreCercano(puntos[cimaIdx], waypoints, trackPoints),
      });
    }
    // El valle actual arranca el siguiente tramo
    inicio = i;
    cimaIdx = i;
  }

  // Como mucho 6 puertos en el cartel: más nombres no caben ni se leen
  return puertos.sort((a, b) => b.desnivel - a.desnivel).slice(0, 6)
    .sort((a, b) => a.km - b.km);
};

/** ¿Hay un waypoint del GPX cerca de esta cima? Ese es su nombre */
const nombreCercano = (
  cima: PuntoPerfil,
  waypoints: { name: string; lat: number; lon: number }[],
  trackPoints: GpxTrackPoint[],
): string | undefined => {
  if (waypoints.length === 0 || trackPoints.length === 0) return undefined;
  // Punto del track que corresponde a esa cima (por índice proporcional)
  const idx = Math.min(
    trackPoints.length - 1,
    Math.round((cima.km / (puntosKmTotal(trackPoints) || 1)) * (trackPoints.length - 1)),
  );
  const p = trackPoints[idx];
  if (!p) return undefined;

  let mejor: { name: string; d: number } | null = null;
  for (const w of waypoints) {
    const d = calculateHaversineDistance(p.lat, p.lon, w.lat, w.lon);
    if (d < 0.5 && (!mejor || d < mejor.d)) mejor = { name: w.name, d };
  }
  return mejor?.name;
};

/** ¿El nombre del waypoint habla de avituallamiento? */
const esAvituallamiento = (nombre: string): boolean =>
  /avitu|agua|fuente|bar|caf[eé]|repost|comida|bocata|parada/i.test(nombre);

/**
 * Waypoints colocados sobre el perfil, con su km. Se descartan los que
 * ya dan nombre a un puerto (si no, saldría dos veces lo mismo).
 */
const situarHitos = (
  waypoints: { name: string; lat: number; lon: number }[],
  trackPoints: GpxTrackPoint[],
  puntos: PuntoPerfil[],
  puertos: Puerto[],
): Hito[] => {
  if (waypoints.length === 0 || trackPoints.length === 0) return [];
  const kmTotal = puntos[puntos.length - 1]?.km ?? 0;
  const usados = new Set(puertos.map((p) => p.nombre).filter(Boolean) as string[]);

  const hitos: Hito[] = [];
  for (const w of waypoints) {
    if (usados.has(w.name)) continue;
    // Punto del track más cercano al waypoint → su km
    let mejor = { i: -1, d: Infinity };
    for (let i = 0; i < trackPoints.length; i++) {
      const d = calculateHaversineDistance(trackPoints[i].lat, trackPoints[i].lon, w.lat, w.lon);
      if (d < mejor.d) mejor = { i, d };
    }
    if (mejor.i < 0 || mejor.d > 0.4) continue;  // fuera de ruta: no es un hito
    const km = (mejor.i / Math.max(1, trackPoints.length - 1)) * kmTotal;
    const cercano = puntos.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a), puntos[0]);
    hitos.push({
      km: Math.round(km * 10) / 10,
      ele: Math.round(cercano.ele),
      nombre: w.name,
      tipo: esAvituallamiento(w.name) ? 'avituallamiento' : 'punto',
    });
  }
  // Como mucho 5, y los de avituallamiento primero (son los que importan)
  return hitos
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'avituallamiento' ? -1 : 1))
    .slice(0, 5)
    .sort((a, b) => a.km - b.km);
};

const puntosKmTotal = (trackPoints: GpxTrackPoint[]): number => {
  let km = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    km += calculateHaversineDistance(
      trackPoints[i - 1].lat, trackPoints[i - 1].lon,
      trackPoints[i].lat, trackPoints[i].lon,
    );
  }
  return km;
};

/** Perfil completo a partir de los puntos del track */
export const construirPerfil = (
  trackPoints: GpxTrackPoint[],
  waypoints: { name: string; lat: number; lon: number }[] = [],
): PerfilRuta => {
  const conEle = trackPoints.filter((p) => p.ele != null);
  const base = conEle.length > 10 ? conEle : trackPoints;

  const elevaciones = suavizar(base.map((p) => p.ele ?? 0));
  const puntos: PuntoPerfil[] = [];
  let km = 0;
  let desnivel = 0;

  for (let i = 0; i < base.length; i++) {
    if (i > 0) {
      km += calculateHaversineDistance(base[i - 1].lat, base[i - 1].lon, base[i].lat, base[i].lon);
      const subida = elevaciones[i] - elevaciones[i - 1];
      if (subida > 0) desnivel += subida;
    }
    puntos.push({ km, ele: elevaciones[i] });
  }

  // Aligerar para el dibujo: ~600 puntos bastan y el SVG vuela
  const paso = Math.max(1, Math.ceil(puntos.length / 600));
  const ligeros = puntos.filter((_, i) => i % paso === 0 || i === puntos.length - 1);

  const eles = ligeros.map((p) => p.ele);
  const puertos = detectarPuertos(ligeros, waypoints, base);
  return {
    puntos: ligeros,
    km: Math.round(km * 10) / 10,
    desnivel: Math.round(desnivel),
    altMin: Math.round(Math.min(...eles)),
    altMax: Math.round(Math.max(...eles)),
    puertos,
    hitos: situarHitos(waypoints, base, ligeros, puertos),
  };
};
