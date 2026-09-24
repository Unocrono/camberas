/**
 * Vuelo 3D de un recorrido a pantalla completa, para incrustarlo en la web
 * del organizador (widget.js → <div data-camberas-vuelo="ID">).
 *
 * Es el mismo vuelo que abre el botón de la ficha de la carrera
 * (RouteFlightViewer), sin cabecera ni pie: solo el mapa, el nombre del
 * recorrido y un enlace a la carrera en Camberas. Mismas reglas que la ficha:
 * recorrido y carrera visibles, con GPX y con el mapa del recorrido activado.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RouteFlightViewer } from "@/components/RouteFlightViewer";
import { Loader2 } from "lucide-react";

interface Recorrido {
  name: string;
  gpx_file_url: string | null;
  show_route_map: boolean | null;
  races: { name: string; slug: string | null; id: string } | null;
}

const VueloEmbebido = () => {
  const { distanceId } = useParams();
  const [recorrido, setRecorrido] = useState<Recorrido | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "no_disponible">("cargando");

  useEffect(() => {
    if (!distanceId) return;
    supabase
      .from("race_distances")
      .select("name, gpx_file_url, show_route_map, races(id, name, slug)")
      .eq("id", distanceId)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as unknown as Recorrido | null;
        if (!r || !r.gpx_file_url || r.show_route_map === false) {
          setEstado("no_disponible");
          return;
        }
        setRecorrido(r);
        setEstado("ok");
      });
  }, [distanceId]);

  const carrera = recorrido?.races;
  const enlaceCarrera = carrera
    ? `https://camberas.com/${carrera.slug || carrera.id}?utm_source=widget&utm_medium=vuelo-3d`
    : "https://camberas.com";

  return (
    <div className="fixed inset-0 bg-[#10201a] text-[#FAF6EC]">
      {estado === "cargando" && (
        <div className="flex h-full items-center justify-center gap-2 text-sm opacity-80">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando el recorrido…
        </div>
      )}

      {estado === "no_disponible" && (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm opacity-80">
          Este recorrido no tiene vuelo 3D disponible.
        </div>
      )}

      {estado === "ok" && recorrido?.gpx_file_url && (
        <>
          <RouteFlightViewer gpxUrl={recorrido.gpx_file_url} llenar />
          <div className="pointer-events-none absolute left-3 top-3 right-3 flex items-start justify-between gap-3">
            <div className="rounded-lg bg-black/55 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm">
              {carrera?.name}
              {recorrido.name ? <span className="font-normal opacity-80"> · {recorrido.name}</span> : null}
            </div>
            <a
              href={enlaceCarrera}
              target="_blank"
              rel="noopener"
              className="pointer-events-auto rounded-lg bg-[#EC7C2B] px-3 py-1.5 text-sm font-bold text-white shadow"
            >
              Inscríbete
            </a>
          </div>
        </>
      )}
    </div>
  );
};

export default VueloEmbebido;
