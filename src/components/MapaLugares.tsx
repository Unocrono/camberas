import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/integrations/supabase/client";
import { iconoRutometro } from "@/lib/iconosRutometro";

/** Un sitio a marcar: salida, meta, aparcamiento… */
export interface LugarMapa {
  lat: number;
  lon: number;
  nombre: string;
  /** Tipo para el icono: start, finish, parking… */
  tipo: string;
  detalle?: string;
}

/**
 * Mapa de sitios sueltos (sin track): «Cómo llegar» de la web de la carrera.
 * Encuadra todos los puntos; con uno solo, zoom de calle. Token de Mapbox por
 * la función get-mapbox-token, como el resto de mapas.
 */
export function MapaLugares({ lugares, color = "#235940" }: { lugares: LugarMapa[]; color?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke("get-mapbox-token");
        if (e || !data?.token) throw e ?? new Error("sin token");
        if (cancelado || !contenedor.current || mapa.current) return;
        mapboxgl.accessToken = data.token;
        const m = new mapboxgl.Map({ container: contenedor.current, style: "mapbox://styles/mapbox/outdoors-v12", center: [lugares[0].lon, lugares[0].lat], zoom: 14 });
        mapa.current = m;
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        m.scrollZoom.disable();
        const limites = new mapboxgl.LngLatBounds();
        for (const l of lugares) {
          const el = document.createElement("div");
          const burbuja = document.createElement("div");
          burbuja.style.cssText = `display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)`;
          el.appendChild(burbuja);
          createRoot(burbuja).render(createElement(iconoRutometro(undefined, l.tipo), { size: 17, strokeWidth: 2.5, color: "#fff" }));
          const popup = document.createElement("div");
          const titulo = document.createElement("strong");
          titulo.textContent = l.nombre;
          popup.appendChild(titulo);
          if (l.detalle) {
            const d = document.createElement("div");
            d.textContent = l.detalle;
            d.style.marginTop = "4px";
            popup.appendChild(d);
          }
          new mapboxgl.Marker(el).setLngLat([l.lon, l.lat]).setPopup(new mapboxgl.Popup({ offset: 22 }).setDOMContent(popup)).addTo(m);
          limites.extend([l.lon, l.lat]);
        }
        if (lugares.length > 1) m.fitBounds(limites, { padding: 60, maxZoom: 15, duration: 0 });
      } catch (e) {
        console.error("Mapa de lugares:", e);
        if (!cancelado) setError("No se pudo cargar el mapa");
      }
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Los lugares vienen del evento y no cambian mientras la página está abierta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="flex h-[360px] items-center justify-center text-sm">{error}</div>;
  return (
    <div className="relative h-[360px] w-full overflow-hidden lg:h-[420px]">
      {/* Posición en línea: mapbox-gl.css llega después y pisaría el absolute (ver RoutePreviewMap) */}
      <div ref={contenedor} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
