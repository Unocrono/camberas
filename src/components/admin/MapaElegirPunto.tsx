import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseGpxFile, getAllTrackPoints, calculateDistanceFromStartToPoint, findClosestTrackPoint, type GpxTrackPoint } from "@/lib/gpxParser";

/**
 * Mapa para colocar un punto del rutómetro pulsando sobre el recorrido: el
 * punto se pega al track del GPX y se devuelven latitud, longitud, kilómetro,
 * kilómetros restantes y altitud, listos para el formulario. Con lat/lon ya
 * dados, los enseña; el marcador también se puede arrastrar.
 */
export interface PuntoElegido {
  lat: number;
  lon: number;
  km: number;
  kmRestante: number;
  altitud: number | null;
}

interface Props {
  gpxUrl: string;
  lat?: number | null;
  lon?: number | null;
  onElegir: (p: PuntoElegido) => void;
}

export function MapaElegirPunto({ gpxUrl, lat, lon, onElegir }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<mapboxgl.Map | null>(null);
  const marcador = useRef<mapboxgl.Marker | null>(null);
  const puntos = useRef<GpxTrackPoint[]>([]);
  const kmTotal = useRef(0);
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [mensaje, setMensaje] = useState("");

  // Pega una posición al track y avisa
  const pegar = (latC: number, lonC: number) => {
    if (puntos.current.length === 0) return;
    const { index } = findClosestTrackPoint(puntos.current, latC, lonC);
    const p = puntos.current[index];
    const km = Math.round(calculateDistanceFromStartToPoint(puntos.current, index) * 1000) / 1000;
    marcador.current?.setLngLat([p.lon, p.lat]);
    onElegirRef.current({
      lat: Math.round(p.lat * 1e6) / 1e6,
      lon: Math.round(p.lon * 1e6) / 1e6,
      km,
      kmRestante: Math.max(0, Math.round((kmTotal.current - km) * 1000) / 1000),
      altitud: typeof p.ele === "number" ? Math.round(p.ele) : null,
    });
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [{ data, error }, xml] = await Promise.all([
          supabase.functions.invoke("get-mapbox-token"),
          fetch(gpxUrl, { cache: "no-store" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`GPX ${r.status}`)))),
        ]);
        if (error || !data?.token) throw new Error("Token de mapa no disponible");
        const pts = getAllTrackPoints(parseGpxFile(xml));
        if (pts.length < 2) throw new Error("El GPX no tiene track");
        if (!vivo || !contenedor.current) return;
        puntos.current = pts;
        kmTotal.current = calculateDistanceFromStartToPoint(pts, pts.length - 1);

        mapboxgl.accessToken = data.token;
        const coords: [number, number][] = pts.map((p) => [p.lon, p.lat]);
        const m = new mapboxgl.Map({ container: contenedor.current, style: "mapbox://styles/mapbox/outdoors-v12", center: coords[0], zoom: 12 });
        mapa.current = m;
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => {
          m.addSource("track", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
          m.addLayer({ id: "track", type: "line", source: "track", paint: { "line-color": "#235940", "line-width": 4 } });
          const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
          m.fitBounds(bounds, { padding: 40, duration: 0 });

          const el = document.createElement("div");
          el.style.cssText = "width:22px;height:22px;border-radius:50%;background:#EC7C2B;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:grab";
          marcador.current = new mapboxgl.Marker({ element: el, draggable: true })
            .setLngLat(lat != null && lon != null ? [lon, lat] : coords[0])
            .addTo(m);
          marcador.current.on("dragend", () => {
            const ll = marcador.current!.getLngLat();
            pegar(ll.lat, ll.lng);
          });
          m.on("click", (e) => pegar(e.lngLat.lat, e.lngLat.lng));
          m.getCanvas().style.cursor = "crosshair";
          setEstado("listo");
        });
      } catch (e) {
        if (!vivo) return;
        setMensaje(e instanceof Error ? e.message : "No se pudo cargar el mapa");
        setEstado("error");
      }
    })();
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxUrl]);

  // Si el formulario cambia lat/lon a mano, el marcador sigue
  useEffect(() => {
    if (marcador.current && lat != null && lon != null && !isNaN(lat) && !isNaN(lon)) marcador.current.setLngLat([lon, lat]);
  }, [lat, lon]);

  return (
    <div className="space-y-1.5">
      <div className="relative h-[280px] w-full overflow-hidden rounded-md border">
        <div ref={contenedor} className="h-full w-full" />
        {estado === "cargando" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando el recorrido…
          </div>
        )}
        {estado === "error" && <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive">{mensaje}</div>}
      </div>
      <p className="text-xs text-muted-foreground">Pulsa sobre el recorrido (o arrastra el marcador): el punto se pega al track y rellena kilómetro, restante, altitud, latitud y longitud.</p>
    </div>
  );
}
