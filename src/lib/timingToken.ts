/**
 * Cronometraje por TOKEN de puesto.
 *
 * La identidad es el PUESTO, no la persona: el panel genera un token por
 * punto de cronometraje, se reparte como QR (enlace /timing?t=UUID) y el
 * móvil que lo abre queda vinculado. Sin altas, sin contraseñas.
 *
 * Todo el tráfico del dispositivo pasa por RPCs SECURITY DEFINER que
 * validan el token y acotan el alcance a su carrera y su puesto
 * (migración 20260804120000_cronometrador_tokens.sql).
 */
import { supabase } from "@/integrations/supabase/client";
import { parseCamberasToken } from "@/lib/camberasToken";

// El cliente tipado no conoce las RPCs nuevas hasta regenerar types.ts
type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

export const rpc = <T>(fn: string, args: Record<string, unknown>): RpcResult<T> =>
  (
    supabase as unknown as {
      rpc: (f: string, a: Record<string, unknown>) => RpcResult<T>;
    }
  ).rpc(fn, args);

const DEVICE_KEY = "timing_device_id";

export interface PuestoContexto {
  race: { id: string; name: string; date: string };
  punto: { id: string; name: string; notes: string | null; point_order: number | null };
  bib: string;
  distance_id: string | null;
  device_id: string | null;
  start_time: string | null;
  /** Ventana en la que el puesto puede escribir; fuera de ella solo se lee. */
  ventana: { ini: string | null; fin: string | null } | null;
}

export interface StartlistRow {
  bib_number: number;
  first_name: string;
  last_name: string;
  event_name: string;
  registration_id: string;
  race_distance_id: string;
}

export interface LecturaRow {
  id: string;
  bib_number: number;
  timing_timestamp: string;
  status_code: string | null;
  notes: string | null;
}

/** Fila que devuelve link_gps_token (compartida con corredores y motos). */
interface LinkRow {
  id: string;
  bib_number: string;
  participant_name: string | null;
  device_id: string | null;
  needs_transfer: boolean;
}

export interface RetiradaRow {
  id: string;
  bib_number: number;
  abandon_type: string;
  reason: string;
  timing_point_id: string | null;
  created_at: string;
  registration_id: string;
  /** Solo el puesto que la registró puede corregirla o borrarla. */
  es_de_este_puesto: boolean;
}

/** Identificador estable de este navegador, para saber a qué móvil está vinculado el puesto. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Extrae el UUID del token de un QR, un enlace (/timing?t=UUID) o el UUID
 * pelado. Delega en la lectura unificada de tokens de Camberas, común a
 * corredores, motos y cronometraje (src/lib/camberasToken.ts).
 */
export function extraerToken(texto: string): string | null {
  return parseCamberasToken(texto)?.token ?? null;
}

/**
 * Vincula el puesto a este dispositivo. Si ya estaba en otro y no se fuerza,
 * devuelve needsTransfer para que la app pida confirmación.
 */
export async function vincularPuesto(
  token: string,
  force = false
): Promise<{ tokenId: string; needsTransfer: boolean; deviceAnterior: string | null }> {
  const { data, error } = await rpc<LinkRow[]>("link_gps_token", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_force: force,
  });
  if (error) throw error;
  const fila = data?.[0];
  if (!fila) throw new Error("Token no válido o inactivo");
  return {
    tokenId: fila.id,
    needsTransfer: !!fila.needs_transfer,
    deviceAnterior: fila.device_id ?? null,
  };
}

export async function desvincularPuesto(tokenId: string): Promise<void> {
  await rpc<boolean>("unlink_gps_token", { p_token_id: tokenId, p_device_id: getDeviceId() });
}

export async function contextoPuesto(token: string): Promise<PuestoContexto> {
  const { data, error } = await rpc<PuestoContexto>("cronometrador_contexto", {
    p_token: token,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  return data as PuestoContexto;
}

export async function startlistPuesto(token: string): Promise<StartlistRow[]> {
  const { data, error } = await rpc<StartlistRow[]>("cronometrador_startlist", {
    p_token: token,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  return data || [];
}

export async function lecturasPuesto(token: string, limite = 100): Promise<LecturaRow[]> {
  const { data, error } = await rpc<LecturaRow[]>("cronometrador_lecturas", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_limit: limite,
  });
  if (error) throw error;
  return data || [];
}

export async function ficharDorsal(
  token: string,
  bib: number,
  timestamp: string,
  statusCode?: string | null,
  notes?: string | null
): Promise<string | null> {
  const { data, error } = await rpc<string>("cronometrador_fichar", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_bib: bib,
    p_timestamp: timestamp,
    p_status_code: statusCode ?? null,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data || null;
}

export async function editarLectura(
  token: string,
  readingId: string,
  bib: number,
  timestamp: string
): Promise<void> {
  const { error } = await rpc<boolean>("cronometrador_editar_lectura", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_reading_id: readingId,
    p_bib: bib,
    p_timestamp: timestamp,
  });
  if (error) throw error;
}

export async function borrarLectura(token: string, readingId: string): Promise<void> {
  const { error } = await rpc<boolean>("cronometrador_borrar_lectura", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_reading_id: readingId,
  });
  if (error) throw error;
}

export async function retiradasPuesto(token: string): Promise<RetiradaRow[]> {
  const { data, error } = await rpc<RetiradaRow[]>("cronometrador_retiradas", {
    p_token: token,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  return data || [];
}

export async function registrarRetirada(
  token: string,
  bib: number,
  tipo: string,
  motivo: string
): Promise<void> {
  const { error } = await rpc<string>("cronometrador_retirada", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_bib: bib,
    p_tipo: tipo,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function editarRetirada(
  token: string,
  id: string,
  tipo: string,
  motivo: string
): Promise<void> {
  const { error } = await rpc<boolean>("cronometrador_editar_retirada", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_id: id,
    p_tipo: tipo,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function borrarRetirada(token: string, id: string): Promise<void> {
  const { error } = await rpc<boolean>("cronometrador_borrar_retirada", {
    p_token: token,
    p_device_id: getDeviceId(),
    p_id: id,
  });
  if (error) throw error;
}
