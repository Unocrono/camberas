import { supabase } from "@/integrations/supabase/client";

/**
 * Llamada a una RPC que todavía no está en src/integrations/supabase/types.ts
 * (el fichero es generado y se regenera a mano tras aplicar las migraciones).
 * Un único punto con el cast, en vez de un `as any` en cada llamada. Cuando
 * los tipos se regeneren, las llamadas pueden pasar a supabase.rpc() directo.
 */
export async function rpcSinTipos<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(nombre, args);
  if (error) throw error;
  return data as T;
}

/**
 * Tabla que todavía no está en los tipos generados (race_web, race_sponsors,
 * race_domains, race_tpv). Devuelve el query builder sin tipar; el que llama
 * pone el tipo de fila.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tablaSinTipos(nombre: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.from as any)(nombre);
}
