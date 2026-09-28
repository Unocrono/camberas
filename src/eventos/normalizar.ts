import type { Avituallamiento, EventoPublico, Prueba, PuntoRutometro } from "./tipos";
import { horaDePaso, ritmosDe } from "@/lib/ritmos";

/**
 * Ajustes del evento que se calculan en el cliente con lo que ya trae
 * evento_publico (sin tocar la función). Se aplica al cargar el evento
 * (useEventoPublico) y a los fixtures de desarrollo.
 *
 * Avituallamientos: evento_publico da los puntos de control de cronometraje
 * (race_checkpoints) y, SOLO si no hay ninguno, los del rutómetro. En Gurriana
 * los controles existen (salida, meta y pasos cronometrados), así que los
 * avituallamientos del rutómetro no llegaban a la web. Aquí mandan los del
 * rutómetro cuando los hay, y los controles se les suman con su hora de
 * corte: si un control cae en el mismo sitio que un avituallamiento (±300 m),
 * el avituallamiento queda marcado como control y hereda el corte.
 */

/** Tipos de ítem del rutómetro que son avituallamientos → tipo de la web */
const TIPO_AVITUALLAMIENTO: Record<string, string> = {
  aid_station: "completo",
  refreshment: "liquido",
  aid_gluten_free: "sin_gluten",
};

const MISMO_SITIO_KM = 0.3;

function desdeRutometro(p: PuntoRutometro, tipo: string): Avituallamiento {
  return {
    km: p.km,
    nombre: (p.descripcion ?? p.etiqueta ?? "").trim() || (p.etiqueta ?? ""),
    tipo,
    etiqueta: p.etiqueta,
    icono: p.icono,
    lat: p.lat,
    lon: p.lon,
  };
}

export function avituallamientosDePrueba(prueba: Prueba): Avituallamiento[] | undefined {
  const puntos = [...(prueba.rutometro?.puntos ?? [])].sort((a, b) => a.km - b.km);
  const base = prueba.avituallamientos ?? [];
  const avitRutometro = puntos.filter((p) => TIPO_AVITUALLAMIENTO[p.tipo]);
  if (avitRutometro.length === 0) return base.length ? conHoras(base, prueba) : undefined;

  const lista: Avituallamiento[] = [];
  // Avituallamientos del rutómetro, sin repetidos (mismo tipo en el mismo sitio)
  for (const p of avitRutometro) {
    const tipo = TIPO_AVITUALLAMIENTO[p.tipo];
    if (lista.some((a) => a.tipo === tipo && Math.abs(a.km - p.km) < 0.1)) continue;
    lista.push(desdeRutometro(p, tipo));
  }

  // Controles: los de cronometraje (con su corte) y, si no hay, los del rutómetro
  const controlesBase = base.filter((a) => a.tipo !== "start" && a.tipo !== "finish");
  const controles: Avituallamiento[] = controlesBase.length
    ? controlesBase
    : puntos.filter((p) => p.tipo === "checkpoint" || p.control).map((p) => desdeRutometro(p, "control"));
  for (const c of controles) {
    const cerca = lista.find((a) => Math.abs(a.km - c.km) <= MISMO_SITIO_KM);
    if (cerca) {
      cerca.control = true;
      if (c.corte && !cerca.corte) cerca.corte = c.corte;
    } else if (!lista.some((a) => a.control && Math.abs(a.km - c.km) < 0.1)) {
      lista.push({ ...c, control: true });
    }
  }

  // Salida y meta: las del rutómetro, para que sus km casen con los de los
  // avituallamientos (la meta de cronometraje lleva la distancia oficial y
  // quedaba antes del avituallamiento de meta); el corte, el de cronometraje
  const salidaRut = puntos.find((p) => p.tipo === "start");
  const metaRut = [...puntos].reverse().find((p) => p.tipo === "finish");
  const salidaBase = base.find((a) => a.tipo === "start");
  const metaBase = base.find((a) => a.tipo === "finish");
  const salida = salidaRut ? { ...desdeRutometro(salidaRut, "start"), nombre: salidaBase?.nombre ?? "Salida", corte: salidaBase?.corte } : salidaBase;
  const meta = metaRut ? { ...desdeRutometro(metaRut, "finish"), nombre: metaBase?.nombre ?? "Meta", corte: metaBase?.corte } : metaBase;

  lista.sort((a, b) => a.km - b.km);
  const resultado = [...(salida ? [salida] : []), ...lista, ...(meta ? [meta] : [])];
  return conHoras(resultado, prueba);
}

/** Hora de paso del primero y cierre estimado por el ritmo de corte del rutómetro */
function conHoras(lista: Avituallamiento[], prueba: Prueba): Avituallamiento[] {
  const { primero, corte } = ritmosDe(prueba.rutometro?.ritmos);
  if (!prueba.salida || (!primero && !corte)) return lista;
  // En la salida (km 0) la hora es la de salida: no se repite
  return lista.map((a) =>
    a.km > 0
      ? { ...a, pasoPrimero: horaDePaso(prueba.salida, a.km, primero) ?? undefined, cierreEstimado: horaDePaso(prueba.salida, a.km, corte) ?? undefined }
      : a,
  );
}

/**
 * Notas del rutómetro sin repetir: al generar los puntos desde el GPX, la
 * descripción y el comentario del waypoint a veces son el mismo texto y se
 * guardan unidos («A · A»).
 */
function sinRepetir(texto: string | undefined): string | undefined {
  if (!texto) return texto;
  const partes = texto.split(" · ").map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set(partes)).join(" · ");
}

function limpiarRutometro(prueba: Prueba): Prueba {
  if (!prueba.rutometro?.puntos) return prueba;
  return {
    ...prueba,
    rutometro: {
      ...prueba.rutometro,
      puntos: prueba.rutometro.puntos.map((p) => ({ ...p, descripcion: (p.descripcion ?? "").trim(), notas: sinRepetir(p.notas) })),
    },
  };
}

export function normalizarEvento(evento: EventoPublico | null): EventoPublico | null {
  if (!evento) return evento;
  return {
    ...evento,
    pruebas: (evento.pruebas ?? []).map(limpiarRutometro).map((p) => ({ ...p, avituallamientos: avituallamientosDePrueba(p) })),
  };
}

// ── Cómo llegar: salida, meta y aparcamientos del rutómetro ─────────────

export interface LugarAcceso {
  tipo: "salida" | "meta" | "salida-meta" | "parking";
  nombre: string;
  detalle?: string;
  lat: number;
  lon: number;
  /** Recorridos que salen o llegan aquí */
  pruebas: string[];
}

/** Distancia en metros entre dos coordenadas */
function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MISMO_LUGAR_M = 150;

/**
 * Los sitios a los que hay que llegar: salida y meta de cada recorrido y los
 * aparcamientos (tipo de ítem «parking»), juntando los que están a menos de
 * 150 m (la salida de GT20 y GT40 es la misma). Solo puntos con coordenadas.
 */
export function lugaresDeAcceso(evento: EventoPublico): LugarAcceso[] {
  const lugares: LugarAcceso[] = [];
  const anadir = (tipo: "salida" | "meta" | "parking", p: PuntoRutometro, prueba: string) => {
    if (p.lat == null || p.lon == null) return;
    const punto = { lat: p.lat, lon: p.lon };
    const mismo = lugares.find(
      (l) => metros(l, punto) < MISMO_LUGAR_M && (tipo === "parking" ? l.tipo === "parking" : l.tipo !== "parking"),
    );
    if (mismo) {
      if (!mismo.pruebas.includes(prueba)) mismo.pruebas.push(prueba);
      if (tipo !== "parking" && mismo.tipo !== tipo && mismo.tipo !== "salida-meta") mismo.tipo = "salida-meta";
      return;
    }
    lugares.push({
      tipo,
      nombre: tipo === "parking" ? (p.descripcion ?? "Aparcamiento").trim() : tipo === "salida" ? "Salida" : "Meta",
      detalle: tipo === "parking" ? p.notas?.trim() : undefined,
      lat: p.lat,
      lon: p.lon,
      pruebas: [prueba],
    });
  };
  for (const prueba of evento.pruebas ?? []) {
    const puntos = prueba.rutometro?.puntos ?? [];
    const salida = puntos.find((p) => p.tipo === "start");
    const meta = [...puntos].reverse().find((p) => p.tipo === "finish");
    if (salida) anadir("salida", salida, prueba.nombre);
    if (meta) anadir("meta", meta, prueba.nombre);
    for (const p of puntos.filter((x) => x.tipo === "parking")) anadir("parking", p, prueba.nombre);
  }
  const orden = { "salida-meta": 0, salida: 1, meta: 2, parking: 3 };
  return lugares.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

/** Enlace de Google Maps con la ruta hasta el punto (desde donde esté el corredor) */
export function urlComoLlegar(l: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`;
}
