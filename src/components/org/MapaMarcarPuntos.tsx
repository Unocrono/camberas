/**
 * Mapa de «Marcar puntos en campo» (Camberas Org): el recorrido, dónde
 * estoy, los puntos que ya tiene el rutómetro y los pendientes de enviar.
 * Pulsar sobre el mapa (o arrastrar el marcador naranja) elige un punto
 * pegado al trazado: así se colocan también desde casa, sin ir al sitio.
 *
 * En Camberas Org va con import normal (mapbox ya viaja con la app y así no
 * depende de bajar otro trozo con mala cobertura); el panel lo carga diferido.
 */
import { createElement, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { iconoRutometro } from "@/lib/iconosRutometro";

export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  texto: string;
  /** roadbook_item_types.icon del tipo (si no, se deduce del tipo) */
  icono?: string | null;
  /** item_type del rutómetro */
  tipo?: string | null;
  km?: number | null;
}

interface Props {
  /** Trazado del recorrido [lng, lat] (vacío si no tiene GPX) */
  trazado: [number, number][];
  /** Mi posición GPS */
  yo: { lat: number; lng: number } | null;
  /** Puntos que ya tiene el rutómetro */
  existentes: PuntoMapa[];
  /** Marcas guardadas en el móvil que aún no han subido */
  pendientes: PuntoMapa[];
  /** Punto elegido en el mapa (null = se marcará donde estoy) */
  elegido: { lat: number; lng: number } | null;
  /** Pulsación o arrastre: la posición CRUDA (la pantalla la pega al trazado) */
  onElegir: (lat: number, lng: number) => void;
  /** Alto en píxeles (300 en el móvil) */
  alto?: number;
}

const VERDE = "#235940";
const NARANJA = "#EC7C2B";
const AMBAR = "#d97706";

/** Burbuja con el icono del tipo (la misma del mapa público y la web propia) y su ficha al pulsar */
function marcadorConIcono(p: PuntoMapa, fondo: string, pie: string | null): { marker: mapboxgl.Marker; root: Root } {
  const el = document.createElement("div");
  el.className = "marcador-rutometro";
  el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${fondo};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer`;
  const root = createRoot(el);
  root.render(createElement(iconoRutometro(p.icono ?? undefined, p.tipo ?? undefined), { size: 15, strokeWidth: 2.5, color: "#fff" }));
  // Ficha con DOM, no HTML: la descripción la escribe cualquiera
  const ficha = document.createElement("div");
  ficha.style.cssText = "font-size:12px;line-height:1.35";
  const nombre = document.createElement("strong");
  nombre.textContent = p.texto;
  ficha.appendChild(nombre);
  const linea2 = [p.km != null ? `km ${String(Math.round(p.km * 10) / 10).replace(".", ",")}` : null, pie].filter(Boolean).join(" · ");
  if (linea2) {
    const extra = document.createElement("div");
    extra.style.color = "#6b7280";
    extra.textContent = linea2;
    ficha.appendChild(extra);
  }
  const marker = new mapboxgl.Marker({ element: el })
    .setLngLat([p.lng, p.lat])
    .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setDOMContent(ficha));
  return { marker, root };
}

/** Quitar marcadores con icono (la raíz de React se desmonta fuera del render en curso) */
function quitarMarcadores(lista: { marker: mapboxgl.Marker; root: Root }[]) {
  for (const { marker, root } of lista) {
    marker.remove();
    setTimeout(() => root.unmount(), 0);
  }
}

type Coleccion = GeoJSON.FeatureCollection<GeoJSON.Point, { texto: string }>;
const coleccion = (ps: PuntoMapa[]): Coleccion => ({
  type: "FeatureCollection",
  features: ps.map((p) => ({
    type: "Feature",
    properties: { texto: p.texto },
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  })),
});

export function MapaMarcarPuntos({ trazado, yo, existentes, pendientes, elegido, onElegir, alto = 300 }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<mapboxgl.Map | null>(null);
  const marcador = useRef<mapboxgl.Marker | null>(null);
  // Los puntos del rutómetro y los pendientes, con su icono
  const marcadoresPuntos = useRef<{ marker: mapboxgl.Marker; root: Root }[]>([]);
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sube con «Reintentar» (o al volver la señal): rehace el mapa entero
  const [intento, setIntento] = useState(0);
  // El primer encuadre: al trazado si lo hay; si no, a mi posición cuando llegue
  const encuadrado = useRef(false);

  // ── El mapa (otra vez solo si se reintenta) ──────────────────────────
  useEffect(() => {
    let vivo = true;
    let cargado = false;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    // Un toque elige y un doble toque solo acerca: el click espera un poco y
    // se cancela si empieza otro toque (con el dedo, el zoom de doble toque
    // anula el click del 2.º toque pero no el del 1.º, y no llega dblclick),
    // si llega dblclick (ratón) o si empieza un zoom
    let pulsacion: ReturnType<typeof setTimeout> | undefined;
    const cancelarPulsacion = () => {
      clearTimeout(pulsacion);
      pulsacion = undefined;
    };
    setListo(false);
    setError(null);
    encuadrado.current = false;
    (async () => {
      try {
        const { data, error: errToken } = await supabase.functions.invoke("get-mapbox-token");
        if (errToken || !data?.token) throw new Error("Token de mapa no disponible");
        if (!vivo || !contenedor.current) return;
        mapboxgl.accessToken = data.token;
        const m = new mapboxgl.Map({
          container: contenedor.current,
          style: "mapbox://styles/mapbox/outdoors-v12",
          center: [-3.8, 43.2],
          zoom: 8,
          attributionControl: false,
        });
        mapa.current = m;
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        // Abajo a la izquierda, sobre el logo: abajo a la derecha va «Dónde estoy»
        m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
        // Si el estilo no llega no hay 'load' y mapbox solo lo dice en consola:
        // avisar y dejar reintentar (los fallos de teselas llevan sourceId y no
        // impiden cargar)
        m.on("error", (ev) => {
          console.error("mapa marcar puntos:", ev.error);
          if (vivo && !cargado && !(ev as { sourceId?: string }).sourceId) setError("No se pudo cargar el mapa");
        });
        reloj = setTimeout(() => {
          if (vivo && !cargado) setError("El mapa no responde");
        }, 20_000);
        m.on("load", () => {
          if (!vivo) return;
          cargado = true;
          clearTimeout(reloj);
          setError(null);
          const vacio: Coleccion = { type: "FeatureCollection", features: [] };
          m.addSource("trazado", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
          m.addLayer({ id: "trazado", type: "line", source: "trazado", paint: { "line-color": VERDE, "line-width": 4 } });
          m.addSource("yo", { type: "geojson", data: vacio });
          m.addLayer({
            id: "yo-halo",
            type: "circle",
            source: "yo",
            paint: { "circle-radius": 14, "circle-color": "#2563eb", "circle-opacity": 0.18 },
          });
          m.addLayer({
            id: "yo",
            type: "circle",
            source: "yo",
            paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
          });
          m.on("click", (e) => {
            // Pulsar un punto ya puesto abre su ficha: no elige sitio
            if ((e.originalEvent?.target as HTMLElement | null)?.closest?.(".marcador-rutometro")) return;
            const { lat, lng } = e.lngLat;
            cancelarPulsacion();
            pulsacion = setTimeout(() => {
              pulsacion = undefined;
              onElegirRef.current(lat, lng);
            }, 350);
          });
          m.on("touchstart", cancelarPulsacion);
          m.on("dblclick", cancelarPulsacion);
          m.on("zoomstart", cancelarPulsacion);
          setListo(true);
        });
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar el mapa");
      }
    })();
    return () => {
      vivo = false;
      cancelarPulsacion();
      clearTimeout(reloj);
      quitarMarcadores(marcadoresPuntos.current);
      marcadoresPuntos.current = [];
      marcador.current?.remove();
      marcador.current = null;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, [intento]);

  // Sin señal al abrir: al volver, otro intento solo
  useEffect(() => {
    if (!error) return;
    const otraVez = () => setIntento((i) => i + 1);
    window.addEventListener("online", otraVez);
    return () => window.removeEventListener("online", otraVez);
  }, [error]);

  // ── El trazado (cambia con el recorrido) ─────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    (m.getSource("trazado") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: trazado },
    });
    if (trazado.length > 1) {
      const limites = trazado.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(trazado[0], trazado[0]));
      m.fitBounds(limites, { padding: 30, duration: encuadrado.current ? 600 : 0 });
      encuadrado.current = true;
    }
  }, [listo, trazado]);

  // ── Puntos del rutómetro y pendientes ────────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    quitarMarcadores(marcadoresPuntos.current);
    marcadoresPuntos.current = [
      ...existentes.map((p) => marcadorConIcono(p, VERDE, null)),
      ...pendientes.map((p) => marcadorConIcono(p, AMBAR, "pendiente de enviar")),
    ];
    for (const { marker } of marcadoresPuntos.current) marker.addTo(m);
  }, [listo, existentes, pendientes]);

  // ── Dónde estoy ──────────────────────────────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    (m.getSource("yo") as mapboxgl.GeoJSONSource | undefined)?.setData(
      coleccion(yo ? [{ id: "yo", lat: yo.lat, lng: yo.lng, texto: "" }] : []),
    );
    // Sin trazado que encuadrar, el mapa se va a donde estoy la primera vez
    if (yo && !encuadrado.current && trazado.length < 2) {
      m.jumpTo({ center: [yo.lng, yo.lat], zoom: 15 });
      encuadrado.current = true;
    }
  }, [listo, yo, trazado.length]);

  // ── El punto elegido: marcador naranja arrastrable ───────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    if (!elegido) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }
    if (!marcador.current) {
      const el = document.createElement("div");
      el.style.cssText = `width:24px;height:24px;border-radius:50%;background:${NARANJA};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:grab`;
      marcador.current = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat([elegido.lng, elegido.lat]).addTo(m);
      marcador.current.on("dragend", () => {
        const ll = marcador.current?.getLngLat();
        if (ll) onElegirRef.current(ll.lat, ll.lng);
      });
    } else {
      marcador.current.setLngLat([elegido.lng, elegido.lat]);
    }
    // Pegado al trazado puede caer fuera de lo que se ve: que se vea
    const vista = m.getBounds();
    if (vista && !vista.contains([elegido.lng, elegido.lat])) m.easeTo({ center: [elegido.lng, elegido.lat], duration: 500 });
  }, [listo, elegido]);

  const irAMi = () => {
    if (yo && mapa.current) mapa.current.flyTo({ center: [yo.lng, yo.lat], zoom: Math.max(mapa.current.getZoom(), 15) });
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border" style={{ height: alto }}>
      <div ref={contenedor} className="h-full w-full" />
      {yo && listo && (
        <button
          onClick={irAMi}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-bold uppercase shadow-md"
        >
          <LocateFixed className="h-4 w-4 text-blue-600" /> Dónde estoy
        </button>
      )}
      {!listo && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando el mapa…
        </div>
      )}
      {error && !listo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center text-sm text-destructive">
          {error}
          <button
            onClick={() => setIntento((i) => i + 1)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase text-foreground"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
