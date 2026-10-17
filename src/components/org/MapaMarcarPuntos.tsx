/**
 * Mapa de «Marcar puntos en campo» (Camberas Org): el recorrido, dónde
 * estoy, los puntos que ya tiene el rutómetro y los pendientes de enviar.
 * Pulsar sobre el mapa (o arrastrar el marcador naranja) elige un punto
 * pegado al trazado: así se colocan también desde casa, sin ir al sitio.
 *
 * Va aparte y con carga diferida: mapbox solo se baja al abrir la pantalla.
 */
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  texto: string;
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
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El primer encuadre: al trazado si lo hay; si no, a mi posición cuando llegue
  const encuadrado = useRef(false);

  // ── El mapa, una vez ─────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
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
        m.addControl(new mapboxgl.AttributionControl({ compact: true }));
        m.on("load", () => {
          if (!vivo) return;
          const vacio: Coleccion = { type: "FeatureCollection", features: [] };
          m.addSource("trazado", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
          m.addLayer({ id: "trazado", type: "line", source: "trazado", paint: { "line-color": VERDE, "line-width": 4 } });
          m.addSource("existentes", { type: "geojson", data: vacio });
          m.addLayer({
            id: "existentes",
            type: "circle",
            source: "existentes",
            paint: { "circle-radius": 7, "circle-color": VERDE, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
          });
          m.addLayer({
            id: "existentes-texto",
            type: "symbol",
            source: "existentes",
            minzoom: 12,
            layout: { "text-field": ["get", "texto"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true },
            paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
          });
          m.addSource("pendientes", { type: "geojson", data: vacio });
          m.addLayer({
            id: "pendientes",
            type: "circle",
            source: "pendientes",
            paint: { "circle-radius": 7, "circle-color": "#f59e0b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
          });
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
          m.on("click", (e) => onElegirRef.current(e.lngLat.lat, e.lngLat.lng));
          setListo(true);
        });
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar el mapa");
      }
    })();
    return () => {
      vivo = false;
      marcador.current?.remove();
      marcador.current = null;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

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
    (m.getSource("existentes") as mapboxgl.GeoJSONSource | undefined)?.setData(coleccion(existentes));
    (m.getSource("pendientes") as mapboxgl.GeoJSONSource | undefined)?.setData(coleccion(pendientes));
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
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
