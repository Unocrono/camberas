import { supabase } from "@/integrations/supabase/client";

/**
 * Categoría (nombre) que se enseña en los formularios de inscripción, de la
 * RPC get_race_category. Con el recorrido, la función prefiere las categorías
 * de ese recorrido y las generales de la carrera, igual que el trigger que
 * guarda la categoría (resolver_race_category_id); sin él, miraba todas las
 * de la carrera y enseñaba la de otro recorrido (Peña Prieta: «Marcha» en la
 * Skyrace).
 *
 * El cuarto parámetro llega con 20260928150000. Hasta aplicarlo, la función
 * de producción solo tiene tres y la llamada con cuatro da PGRST202: entonces
 * se repite sin recorrido, así la web se puede publicar antes que el SQL.
 */
export async function categoriaCalculada(
  raceId: string,
  distanceId: string | null | undefined,
  birthDate: string,
  gender: string,
): Promise<string | null> {
  const base = { p_race_id: raceId, p_birth_date: birthDate, p_gender: gender };
  if (distanceId) {
    // types.ts aún no conoce el cuarto parámetro
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("get_race_category", { ...base, p_race_distance_id: distanceId });
    if (!error) return (data as string | null) ?? null;
    if (error.code !== "PGRST202") {
      console.error("Error calculando la categoría:", error);
      return null;
    }
  }
  const { data, error } = await supabase.rpc("get_race_category", base);
  if (error) {
    console.error("Error calculando la categoría:", error);
    return null;
  }
  return data ?? null;
}
