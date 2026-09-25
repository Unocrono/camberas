import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RaceDetail from "@/pages/RaceDetail";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import type { EventoPublico } from "@/eventos/tipos";
import PaginaCarrera from "./PaginaCarrera";
import { Cargando } from "./Cargando";

// Fixtures de docs/eventos/ (solo desarrollo): Vite los resuelve en build y
// no entran en el bundle si no se usan
const FIXTURES = import.meta.glob<{ default: unknown }>("../../../docs/eventos/eventos/*.json");

/**
 * camberas.com/{slug}: decide entre la web con plantilla (race_web.activa) y
 * la ficha clásica (RaceDetail). Así cada carrera pasa a la plantilla cuando
 * el organizador la activa, sin tocar las demás.
 *
 *   ?previa=1  fuerza la plantilla aunque no esté activa (vista previa del panel)
 *
 * Si la RPC no devuelve la carrera (oculta o inexistente), RaceDetail sigue
 * su camino de siempre (toast + /races); no se cambia ese comportamiento.
 */
export default function FichaCarrera() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const previa = searchParams.get("previa") === "1";
  // Solo en desarrollo: ?fixture=<nombre> pinta la plantilla con un JSON de
  // docs/eventos/ en vez de la RPC (para trabajar la plantilla sin base de datos)
  const fixture = import.meta.env.DEV ? searchParams.get("fixture") : null;
  const { data: evento, isLoading } = useEventoPublico(fixture ? undefined : slug);
  const [eventoFixture, setEventoFixture] = useState<EventoPublico | null | undefined>(undefined);

  useEffect(() => {
    if (!fixture) return;
    // Vite puede normalizar la clave (relativa o desde la raíz): se busca por sufijo
    const clave = Object.keys(FIXTURES).find((k) => k.endsWith(`/${fixture}.json`));
    const cargador = clave ? FIXTURES[clave] : undefined;
    if (!cargador) {
      console.warn(`[web propia] No existe el fixture docs/eventos/${fixture}.json. Disponibles:`, Object.keys(FIXTURES));
      setEventoFixture(null);
      return;
    }
    cargador()
      .then((m) => setEventoFixture((m.default ?? m) as EventoPublico))
      .catch((e) => {
        console.error("[web propia] No se pudo cargar el fixture:", e);
        setEventoFixture(null);
      });
  }, [fixture]);

  if (fixture) {
    if (eventoFixture === undefined) return <Cargando />;
    if (eventoFixture === null) return <RaceDetail />;
    return <PaginaCarrera evento={eventoFixture} />;
  }

  if (isLoading) return <Cargando />;
  if (evento && (evento.web?.activa || previa)) return <PaginaCarrera evento={evento} />;
  return <RaceDetail />;
}
