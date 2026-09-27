/**
 * Mapa ligero — el enlace que SÍ se puede reenviar a todo el mundo.
 *
 * Nace en la marcha ADEMCO (27-sep-2026): el enlace de la pantalla de la
 * carpa acabó en diez móviles, cada uno con el mapa completo (panel de
 * corredores, cálculos por dorsal, cuatro canales de tiempo real, pantalla
 * siempre encendida) y la máquina de Supabase se reinició varias veces.
 *
 * Aquí solo hay lo que un familiar quiere ver: el recorrido y dónde está
 * cada uno. Por diseño:
 *   - una sola consulta cada 30 s (la del mapa en vivo, ya optimizada), y
 *     NINGÚN canal de tiempo real: cien espectadores son ~3 consultas/s
 *   - se detiene cuando la pestaña no se ve (móvil bloqueado, otra app) y
 *     vuelve a pedir al volver
 *   - sin panel lateral, sin tracks, sin SOS, sin cronometraje, sin
 *     mantener la pantalla despierta
 *   - los tres recorridos a la vez, cada uno de un color
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { parseGpxFile } from "@/lib/gpxParser";

const CADA_MS = 30_000;
const SIN_SENAL_MS = 10 * 60_000;
// Paleta Camberas y compañía: un color por recorrido
const COLORES = ["#EC7C2B", "#235940", "#2563EB", "#9333EA", "#C8E85C"];

interface Carrera { id: string; name: string; date: string; slug: string }
interface Recorrido { id: string; name: string; gpx_file_url: string | null }
interface Posicion {
  registration_id: string;
  latitude: number;
  longitude: number;
  gps_timestamp: string;
  bib_number: string | null;
  runner_name: string | null;
  race_distance_id: string | null;
  source: string;
}

const hora = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const MapaLigero = () => {
  const { slug } = useParams<{ slug: string }>();
  const [carrera, setCarrera] = useState<Carrera | null>(null);
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enMapa, setEnMapa] = useState(0);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [pausado, setPausado] = useState(() => typeof document !== "undefined" && document.visibilityState !== "visible");

  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<mapboxgl.Map | null>(null);
  const marcadores = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const encuadrado = useRef(false);
  const colorDe = useRef<Map<string, string>>(new Map());

  // ── Carrera, recorridos y clave del mapa: tres consultas, una sola vez ──
  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    (async () => {
      const { data: r, error: e1 } = await supabase
        .from("races").select("id, name, date, slug").eq("slug", slug).maybeSingle();
      if (!vivo) return;
      if (e1 || !r) { setError("No encontramos esa carrera"); return; }
      setCarrera(r as Carrera);

      const [{ data: ds }, { data: tk }] = await Promise.all([
        supabase.from("race_distances").select("id, name, gpx_file_url").eq("race_id", r.id).order("name"),
        supabase.from("app_settings").select("value").eq("key", "mapbox_token").maybeSingle(),
      ]);
      if (!vivo) return;
      const lista = (ds || []) as Recorrido[];
      lista.forEach((d, i) => colorDe.current.set(d.id, COLORES[i % COLORES.length]));
      setRecorridos(lista);
      if (tk?.value) setToken(tk.value);
      else setError("El mapa no está configurado");
    })();
    return () => { vivo = false; };
  }, [slug]);

  // ── El mapa y los recorridos ──────────────────────────────────────────
  useEffect(() => {
    if (!token || !contenedor.current || mapa.current) return;
    mapboxgl.accessToken = token;
    const m = new mapboxgl.Map({
      container: contenedor.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-3.8, 43.3],
      zoom: 10,
      attributionControl: false,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapa.current = m;

    m.on("load", async () => {
      // Los GPX vienen del almacén (CDN): no cargan la base de datos
      const limites = new mapboxgl.LngLatBounds();
      let hayRuta = false;
      await Promise.all(recorridos.filter((d) => d.gpx_file_url).map(async (d) => {
        try {
          const res = await fetch(d.gpx_file_url as string);
          const gpx = parseGpxFile(await res.text());
          const coords: [number, number][] = [];
          gpx.tracks.forEach((t) => t.points.forEach((p) => coords.push([p.lon, p.lat])));
          if (coords.length < 2 || !mapa.current) return;
          coords.forEach((c) => limites.extend(c));
          hayRuta = true;
          const id = `ruta-${d.id}`;
          m.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
          m.addLayer({ id, type: "line", source: id,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": colorDe.current.get(d.id) || COLORES[0], "line-width": 4, "line-opacity": 0.85 } });
        } catch { /* un GPX roto no tumba el mapa */ }
      }));
      if (hayRuta && !encuadrado.current) {
        m.fitBounds(limites, { padding: 40, maxZoom: 14 });
        encuadrado.current = true;
      }
    });

    return () => { m.remove(); mapa.current = null; };
    // recorridos llega antes que token (misma carga): no hace falta re-crear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Las posiciones: una consulta cada 30 s, solo con la pestaña visible ──
  useEffect(() => {
    if (!carrera || !token) return;
    let vivo = true;
    let temporizador: number | null = null;

    const pintar = (posiciones: Posicion[]) => {
      const m = mapa.current;
      if (!m) return;
      const vistos = new Set<string>();
      const ahora = Date.now();
      const limites = new mapboxgl.LngLatBounds();
      posiciones.forEach((p) => {
        if (p.latitude == null || p.longitude == null) return;
        vistos.add(p.registration_id);
        limites.extend([p.longitude, p.latitude]);
        const antiguo = ahora - new Date(p.gps_timestamp).getTime() > SIN_SENAL_MS;
        let mk = marcadores.current.get(p.registration_id);
        if (!mk) {
          const el = document.createElement("div");
          el.className = "ml-marca";
          mk = new mapboxgl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(m);
          marcadores.current.set(p.registration_id, mk);
        } else {
          mk.setLngLat([p.longitude, p.latitude]);
        }
        const el = mk.getElement();
        el.textContent = p.bib_number || "·";
        el.title = `${p.bib_number || ""} ${p.runner_name || ""}`.trim();
        el.style.background = colorDe.current.get(p.race_distance_id || "") || COLORES[0];
        el.style.opacity = antiguo ? "0.35" : "1";
      });
      // Quien ya no está en la respuesta, fuera del mapa
      marcadores.current.forEach((mk, id) => { if (!vistos.has(id)) { mk.remove(); marcadores.current.delete(id); } });
      setEnMapa(vistos.size);
      // Sin recorrido, el primer encuadre lo dan las posiciones
      if (!encuadrado.current && vistos.size > 0) {
        m.fitBounds(limites, { padding: 60, maxZoom: 14 });
        encuadrado.current = true;
      }
    };

    const pedir = async () => {
      if (!vivo || document.visibilityState !== "visible") return;
      const { data, error: e } = await supabase.rpc("get_live_gps_positions", { p_race_id: carrera.id });
      if (!vivo) return;
      if (!e && Array.isArray(data)) {
        pintar(data as unknown as Posicion[]);
        setActualizado(new Date());
      }
    };

    const programar = () => {
      if (temporizador !== null) window.clearTimeout(temporizador);
      // Un poco de desfase aleatorio: cien espectadores no piden todos en el mismo segundo
      temporizador = window.setTimeout(async () => { await pedir(); programar(); }, CADA_MS + Math.random() * 5000);
    };

    const alCambiarVisibilidad = () => {
      const visible = document.visibilityState === "visible";
      setPausado(!visible);
      if (visible) { pedir(); programar(); }
      else if (temporizador !== null) { window.clearTimeout(temporizador); temporizador = null; }
    };

    pedir();
    programar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      vivo = false;
      if (temporizador !== null) window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [carrera, token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0E2419" }}>
      <style>{`
        .ml-marca { min-width: 26px; height: 26px; padding: 0 6px; border-radius: 13px; border: 2px solid #fff;
          color: #fff; font: 700 12px/22px system-ui, sans-serif; text-align: center;
          box-shadow: 0 1px 4px rgba(0,0,0,.5); cursor: default; white-space: nowrap; }
      `}</style>

      {/* Posición en línea, no solo Tailwind: el CSS de Mapbox se carga después y pisa .absolute */}
      <div ref={contenedor} style={{ position: "absolute", inset: 0 }} />

      {/* Cabecera mínima */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "10px 14px",
        background: "linear-gradient(rgba(14,36,25,.92), rgba(14,36,25,0))", color: "#FAF6EC", pointerEvents: "none" }}>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: .3 }}>{carrera?.name ?? "Cargando…"}</div>
        <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
          {enMapa} en el mapa
          {actualizado && <> · actualizado {hora(actualizado)}</>}
          {pausado && <> · en pausa (pestaña oculta)</>}
        </div>
        {recorridos.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, marginTop: 6 }}>
            {recorridos.map((d) => (
              <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 4, borderRadius: 2, background: colorDe.current.get(d.id) }} />
                {d.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pie: de dónde sale y el enlace al mapa completo */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 14px", fontSize: 11,
        color: "#FAF6EC", background: "linear-gradient(rgba(14,36,25,0), rgba(14,36,25,.85))",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <span>Camberas Track · se actualiza cada 30 s</span>
        {carrera && (
          <Link to={`/${carrera.slug}/gps`} style={{ color: "#C8E85C", pointerEvents: "auto" }}>
            Mapa completo →
          </Link>
        )}
      </div>
    </div>
  );
};

export default MapaLigero;
