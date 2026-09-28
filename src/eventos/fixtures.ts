import { useEffect, useState } from "react";
import type { EventoPublico } from "./tipos";
import { normalizarEvento } from "./normalizar";

// Fixtures de docs/eventos/eventos/ (solo desarrollo): Vite los resuelve en
// build y no entran en el bundle si no se usan
const FIXTURES = import.meta.glob<{ default: unknown }>("../../docs/eventos/eventos/*.json");

/**
 * Solo en desarrollo: ?fixture=<nombre> pinta la web con un JSON de
 * docs/eventos/eventos/ en vez de la RPC, para trabajar la plantilla sin base
 * de datos. undefined = cargando o sin fixture; null = no existe.
 */
export function useEventoFixture(nombre: string | null): EventoPublico | null | undefined {
  const [evento, setEvento] = useState<EventoPublico | null | undefined>(undefined);
  useEffect(() => {
    if (!nombre) return;
    // Vite puede normalizar la clave (relativa o desde la raíz): se busca por sufijo
    const clave = Object.keys(FIXTURES).find((k) => k.endsWith(`/${nombre}.json`));
    const cargador = clave ? FIXTURES[clave] : undefined;
    if (!cargador) {
      console.warn(`[web propia] No existe el fixture docs/eventos/eventos/${nombre}.json. Disponibles:`, Object.keys(FIXTURES));
      setEvento(null);
      return;
    }
    cargador()
      .then((m) => setEvento(normalizarEvento((m.default ?? m) as EventoPublico)))
      .catch((e) => {
        console.error("[web propia] No se pudo cargar el fixture:", e);
        setEvento(null);
      });
  }, [nombre]);
  return evento;
}
