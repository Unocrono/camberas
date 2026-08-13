/**
 * Fuente doble de posición para GPS de Organización (motos):
 *
 *  - 'app'      → la app de móvil GPS ORGANIZACIÓN emite a gps_positions
 *                 por token (race_motos.token_id, tubería común de
 *                 camberas-track). Solo trae posición/velocidad crudas.
 *  - 'hardware' → rastreadores GPS vía webhook a moto_gps_tracking, con
 *                 las distancias que calcula process-moto-gps.
 *
 * Se devuelve la lectura MÁS RECIENTE de las dos. Los campos de distancia
 * solo vienen del hardware; con pipeline 'app' el consumidor los calcula
 * con el GPX (gpxParser) o los lee del canal del operador
 * (overlay_control → moto_dist_M#, ver fetchCanalMotoDist).
 *
 * Unidades: cada campo se devuelve TAL CUAL lo guarda su tabla, sin
 * convertir — gps_positions.speed está en m/s (expo-location).
 */
import { supabase } from '@/integrations/supabase/client';

export interface MotoLiveRow {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: string;
  distance_from_start: number | null;
  distance_to_finish: number | null;
  distance_to_next_checkpoint: number | null;
  next_checkpoint_name: string | null;
  source: 'app' | 'hardware';
}

export async function fetchMotoLive(
  motoId: string,
  tokenId: string | null | undefined,
): Promise<MotoLiveRow | null> {
  const [hw, app] = await Promise.all([
    supabase
      .from('moto_gps_tracking')
      .select(
        'latitude, longitude, speed, timestamp, distance_from_start, distance_to_finish, distance_to_next_checkpoint, next_checkpoint_name',
      )
      .eq('moto_id', motoId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data),
    tokenId
      ? supabase
          .from('gps_positions')
          .select('lat, lng, speed, timestamp')
          .eq('token_id', tokenId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const hwRow: MotoLiveRow | null = hw
    ? {
        latitude: Number(hw.latitude),
        longitude: Number(hw.longitude),
        speed: hw.speed != null ? Number(hw.speed) : null,
        timestamp: hw.timestamp as string,
        distance_from_start:
          hw.distance_from_start != null ? Number(hw.distance_from_start) : null,
        distance_to_finish:
          hw.distance_to_finish != null ? Number(hw.distance_to_finish) : null,
        distance_to_next_checkpoint:
          hw.distance_to_next_checkpoint != null
            ? Number(hw.distance_to_next_checkpoint)
            : null,
        next_checkpoint_name: hw.next_checkpoint_name ?? null,
        source: 'hardware',
      }
    : null;

  const appRow: MotoLiveRow | null = app
    ? {
        latitude: Number(app.lat),
        longitude: Number(app.lng),
        speed: app.speed != null ? Number(app.speed) : null,
        timestamp: app.timestamp as string,
        distance_from_start: null,
        distance_to_finish: null,
        distance_to_next_checkpoint: null,
        next_checkpoint_name: null,
        source: 'app',
      }
    : null;

  if (hwRow && appRow) {
    return new Date(appRow.timestamp).getTime() >= new Date(hwRow.timestamp).getTime()
      ? appRow
      : hwRow;
  }
  return appRow ?? hwRow;
}

/**
 * Distancia a meta (km) publicada por el panel del operador en
 * overlay_control (clave moto_dist_M<orden>, valor JSON {dist_km, ...}).
 * Es el mismo canal que lee la app de la moto para "DIST META".
 */
export async function fetchCanalMotoDist(motoOrder: number): Promise<number | null> {
  const { data } = await supabase
    .from('overlay_control')
    .select('value')
    .eq('key', `moto_dist_M${motoOrder}`)
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const v = JSON.parse(data.value) as { dist_km?: number };
    return v?.dist_km ?? null;
  } catch {
    return null;
  }
}
