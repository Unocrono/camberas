import { useCallback, useEffect, useState } from "react";
import { tablaSinTipos } from "./rpc";

/**
 * Fila de race_web de una carrera (patrón de useOverlayConfig: carga con
 * valores por defecto si no hay fila, guarda con upsert). El contenido es el
 * JSON de secciones de la web (docs/eventos/evento.schema.json) y el tema el
 * libro de diseño (src/plantillas/libroDiseno.ts).
 */
export interface RaceWeb {
  race_id: string;
  contenido: Record<string, unknown>;
  tema: Record<string, unknown>;
  plantilla: string;
  activa: boolean;
}

const porDefecto = (raceId: string): RaceWeb => ({
  race_id: raceId,
  contenido: {},
  tema: {},
  plantilla: "gurriana",
  activa: false,
});

export function useRaceWeb(raceId: string | undefined) {
  const [web, setWeb] = useState<RaceWeb | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!raceId) {
      setWeb(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await tablaSinTipos("race_web").select("race_id, contenido, tema, plantilla, activa").eq("race_id", raceId).maybeSingle();
      if (error) throw error;
      setWeb((data as RaceWeb | null) ?? porDefecto(raceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la web de la carrera");
      setWeb(porDefecto(raceId));
    } finally {
      setCargando(false);
    }
  }, [raceId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** Guarda solo lo que se pasa; devuelve true si fue bien */
  const guardar = useCallback(
    async (parcial: Partial<Omit<RaceWeb, "race_id">>): Promise<boolean> => {
      if (!raceId) return false;
      setGuardando(true);
      setError(null);
      try {
        const fila = { race_id: raceId, ...(web ?? porDefecto(raceId)), ...parcial };
        const { error } = await tablaSinTipos("race_web").upsert(fila, { onConflict: "race_id" });
        if (error) throw error;
        setWeb(fila);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [raceId, web],
  );

  return { web, cargando, guardando, error, guardar, recargar };
}
