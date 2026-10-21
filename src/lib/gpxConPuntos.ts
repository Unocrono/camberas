// «Descargar GPX» con los puntos del rutómetro dentro (21-oct-2026).
//
// El botón era un enlace al archivo subido: los PC y los destacados que el
// organizador marca después en el rutómetro no salían en el reloj. Ahora, al
// descargar, se lee el GPX, se le añaden como <wpt> los puntos del rutómetro
// que son PC o destacados (con coordenadas) y se baja el resultado. El archivo
// guardado no se toca: el visor, el vuelo 3D y la app siguen leyendo el mismo.
// Si algo falla, se baja el original.
import { supabase } from "@/integrations/supabase/client";

interface Punto {
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  km_total: number | null;
  item_type: string | null;
  is_checkpoint: boolean;
  is_highlighted: boolean;
}

// Símbolos de Garmin (los demás relojes usan el suyo si no lo conocen)
const SIMBOLO: Record<string, string> = {
  start: "Flag, Green",
  finish: "Flag, Red",
  aid_station: "Food Source",
};

/** Metros entre dos coordenadas (para no repetir un waypoint que ya traía el GPX) */
function metros(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function bajar(contenido: Blob | string, nombre: string) {
  const blob = typeof contenido === "string" ? new Blob([contenido], { type: "application/gpx+xml" }) : contenido;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Baja el GPX del recorrido con los PC y destacados del rutómetro como
 * waypoints. Devuelve cuántos puntos añadió (0 = el original tal cual).
 */
export async function descargarGpxConPuntos(gpxUrl: string, roadbookId: string | null, nombre: string): Promise<number> {
  const archivo = `${nombre.replace(/[\\/:*?"<>|]+/g, "-").trim() || "recorrido"}.gpx`;
  let texto: string;
  try {
    const r = await fetch(gpxUrl);
    if (!r.ok) throw new Error(String(r.status));
    texto = await r.text();
  } catch {
    // Sin poder leerlo aquí, que el navegador baje el original
    window.open(gpxUrl, "_blank", "noopener");
    return 0;
  }

  try {
    if (!roadbookId) throw new Error("sin rutómetro");
    const { data, error } = await supabase
      .from("roadbook_items")
      .select("description, latitude, longitude, altitude, km_total, item_type, is_checkpoint, is_highlighted")
      .eq("roadbook_id", roadbookId)
      .or("is_checkpoint.eq.true,is_highlighted.eq.true")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("item_order");
    if (error) throw error;
    const puntos = (data ?? []) as Punto[];
    if (puntos.length === 0) throw new Error("sin puntos");

    const { data: tipos } = await supabase.from("roadbook_item_types").select("name, label");
    const etiqueta = new Map((tipos ?? []).map((t) => [t.name, t.label]));

    const doc = new DOMParser().parseFromString(texto, "application/xml");
    const gpx = doc.documentElement;
    if (doc.getElementsByTagName("parsererror").length > 0 || gpx.localName !== "gpx") throw new Error("GPX ilegible");
    const ns = gpx.namespaceURI;
    const nuevo = (tag: string, contenido?: string) => {
      const el = ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
      if (contenido != null) el.textContent = contenido;
      return el;
    };

    // Los que ya traía el archivo: no se repiten
    const yaEstan = Array.from(gpx.getElementsByTagNameNS(ns ?? "*", "wpt")).map((w) => ({
      lat: Number(w.getAttribute("lat")),
      lon: Number(w.getAttribute("lon")),
    }));
    // En GPX 1.1 los <wpt> van antes de <rte> y <trk>
    const antesDe = Array.from(gpx.children).find((c) => c.localName === "rte" || c.localName === "trk" || c.localName === "extensions") ?? null;

    let añadidos = 0;
    for (const p of puntos) {
      const lat = Number(p.latitude);
      const lon = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (yaEstan.some((w) => metros(w.lat, w.lon, lat, lon) < 25)) continue;
      const tipo = p.item_type && p.item_type !== "point" ? etiqueta.get(p.item_type) ?? null : null;
      const km = p.km_total != null ? `km ${Number(p.km_total).toLocaleString("es-ES", { maximumFractionDigits: 2 })}` : null;
      const wpt = nuevo("wpt");
      wpt.setAttribute("lat", lat.toFixed(6));
      wpt.setAttribute("lon", lon.toFixed(6));
      if (p.altitude != null && Number.isFinite(Number(p.altitude))) wpt.appendChild(nuevo("ele", String(Number(p.altitude))));
      wpt.appendChild(nuevo("name", (p.description ?? "").trim() || tipo || km || "Punto"));
      const desc = [p.is_checkpoint ? "PC" : null, tipo, km].filter(Boolean).join(" · ");
      if (desc) wpt.appendChild(nuevo("desc", desc));
      wpt.appendChild(nuevo("sym", SIMBOLO[p.item_type ?? ""] ?? (p.is_checkpoint ? "Flag, Blue" : "Waypoint")));
      if (tipo || p.is_checkpoint) wpt.appendChild(nuevo("type", tipo ?? "PC"));
      gpx.insertBefore(wpt, antesDe);
      añadidos++;
    }
    if (añadidos === 0) throw new Error("nada que añadir");

    let salida = new XMLSerializer().serializeToString(doc);
    if (!salida.startsWith("<?xml")) salida = `<?xml version="1.0" encoding="UTF-8"?>\n${salida}`;
    bajar(salida, archivo);
    return añadidos;
  } catch {
    // Sin rutómetro, sin puntos o un GPX raro: el original tal cual
    bajar(texto, archivo);
    return 0;
  }
}
