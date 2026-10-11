// Historias en directo en el Instagram de Camberas: «primero en meta» y
// «podio provisional», por recorrido y sexo, publicadas solas.
//
// Quién la llama:
//   · el robot de cada minuto (pg_cron, cabecera x-cron-key = Vault
//     'instagram_directo_cron_key'): repasa las carreras con el directo
//     encendido;
//   · un admin desde el panel, con su sesión:
//       { race_id }                     repasa esa carrera ya, sin esperar al minuto
//       { race_id, vista_previa: true } dibuja una historia sin publicar nada
//                                       (con datos de ejemplo si aún no hay llegadas)
//
// Cada momento espera retraso_min minutos SIN CAMBIOS antes de salir (ver
// 20261011140000_instagram_directo.sql). Solo se publica el día de la carrera y
// el siguiente (las que acaban pasada la medianoche): un directo olvidado
// encendido no publica nada días después.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { hoyLocal } from "../_shared/horaLocal.ts";
import { type Credenciales, credenciales, publicar } from "../_shared/instagram.ts";
import { cargarFuentes, cargarImagen, type DatosHistoria, dibujarHistoria, type Puesto } from "../_shared/historia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

// Historias por pasada: el resto sale al minuto siguiente
const MAX_POR_PASADA = 4;
const LOGO = "https://camberas.com/camberas-logo-512.png";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Config {
  race_id: string;
  activo: boolean;
  primero: boolean;
  podio: boolean;
  retraso_min: number;
  racetec_eids: Record<string, string>;
}

interface Carrera {
  id: string;
  name: string;
  slug: string | null;
  date: string;
  cover_image_url: string | null;
  image_url: string | null;
}

interface Momento {
  clave: string;
  datos: DatosHistoria;
}

interface Resumen {
  momentos: number;
  nuevos: number;
  esperando: number;
  publicadas: number;
  errores: string[];
  aviso?: string;
}

/** '02:20:01', '2:20:01.4', '1 day 02:00:00' → '2:20:01' (y '41:07' si no llega a la hora) */
const tiempoCorto = (t: string): string => {
  const m = String(t).match(/(?:(\d+) days? )?(\d+):(\d{2}):(\d{2})/);
  if (!m) return String(t);
  const horas = (m[1] ? +m[1] * 24 : 0) + +m[2];
  return horas > 0 ? `${horas}:${m[3]}:${m[4]}` : `${+m[3]}:${m[4]}`;
};

const nombreRaceTec = (n?: string | null, a?: string | null) => [n, a].filter(Boolean).join(" ").trim();

async function huella(datos: unknown): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(datos)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 'YYYY-MM-DD' del día anterior, sin zonas: es aritmética de calendario */
const ayer = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Los momentos de una carrera, ahora mismo: por recorrido y sexo, primero y podio */
async function momentos(service: SupabaseClient, carrera: Carrera, cfg: Config): Promise<Momento[]> {
  const { data: distancias } = await service
    .from("race_distances")
    .select("id, name, display_order")
    .eq("race_id", carrera.id)
    .order("display_order", { ascending: true });

  // Podios por recorrido y sexo: RaceTec donde hay EID, lecturas de Camberas en el resto
  const podios = new Map<string, Puesto[]>(); // `${distancia}:${sexo}` → puestos en orden
  const conRaceTec = Object.entries(cfg.racetec_eids ?? {}).filter(([, eid]) => !!eid);
  for (const [distanceId, eid] of conRaceTec) {
    const { data } = await service
      .from("racetec_results")
      .select("firstname, lastname, team, gender, gender_position, gun_time_display")
      .eq("eid", eid)
      .in("gender", ["M", "F"])
      .gte("gender_position", 1)
      .lte("gender_position", 3)
      .order("gender_position", { ascending: true });
    for (const r of data ?? []) {
      const k = `${distanceId}:${r.gender === "F" ? 2 : 1}`;
      const lista = podios.get(k) ?? [];
      lista.push({ nombre: nombreRaceTec(r.firstname, r.lastname), club: r.team || null, tiempo: tiempoCorto(r.gun_time_display ?? "") });
      podios.set(k, lista);
    }
  }
  const { data: filas, error } = await service.rpc("directo_podios", { p_race_id: carrera.id });
  if (error) throw new Error(`directo_podios: ${error.message}`);
  for (const f of filas ?? []) {
    if (cfg.racetec_eids?.[f.race_distance_id]) continue; // ese recorrido manda RaceTec
    const k = `${f.race_distance_id}:${f.sexo}`;
    const lista = podios.get(k) ?? [];
    lista.push({ nombre: f.nombre || `Dorsal ${f.dorsal}`, club: f.club ?? null, tiempo: tiempoCorto(f.tiempo) });
    podios.set(k, lista);
  }

  const salida: Momento[] = [];
  const pie = carrera.slug ? `Resultados en directo: camberas.com/${carrera.slug}/live` : null;
  for (const d of distancias ?? []) {
    for (const sexo of [1, 2, 3]) {
      const puestos = podios.get(`${d.id}:${sexo}`);
      if (!puestos?.length) continue;
      const base = { carrera: carrera.name, recorrido: d.name, sexo, pie };
      if (cfg.primero) {
        salida.push({
          clave: `historia:${carrera.id}:${d.id}:${sexo}:primero`,
          datos: { ...base, tipo: "primero", puestos: puestos.slice(0, 1) },
        });
      }
      if (cfg.podio && puestos.length >= 3) {
        salida.push({
          clave: `historia:${carrera.id}:${d.id}:${sexo}:podio`,
          datos: { ...base, tipo: "podio", puestos: puestos.slice(0, 3) },
        });
      }
    }
  }
  return salida;
}

/** Dibuja la historia, la sube al bucket y la publica. Devuelve el id de instagram_publicaciones */
async function publicarMomento(
  service: SupabaseClient, c: Credenciales, carrera: Carrera, m: Momento, jpeg: Uint8Array,
): Promise<string> {
  const ruta = `historia/${hoyLocal()}/${crypto.randomUUID()}.jpg`;
  const { error: errSubida } = await service.storage
    .from("instagram")
    .upload(ruta, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (errSubida) throw new Error(`No se pudo subir la imagen: ${errSubida.message}`);
  const url = service.storage.from("instagram").getPublicUrl(ruta).data.publicUrl;

  // Una clave por momento: un reintento reutiliza su fila del historial
  const { data: fila, error: errFila } = await service
    .from("instagram_publicaciones")
    .upsert({
      clave: m.clave,
      tipo: "historia",
      formato: "historia",
      race_id: carrera.id,
      imagenes: [url],
      pie: null,
      estado: "pendiente",
      error: null,
      creada_por: null,
    }, { onConflict: "clave" })
    .select("id")
    .single();
  if (errFila || !fila) throw new Error(`No se pudo registrar la publicación: ${errFila?.message}`);

  try {
    const r = await publicar(c, [url], null, "historia");
    await service
      .from("instagram_publicaciones")
      .update({ estado: "publicada", media_id: r.mediaId, permalink: r.permalink, publicada_at: new Date().toISOString() })
      .eq("id", fila.id);
    return fila.id;
  } catch (e) {
    await service.from("instagram_publicaciones").update({ estado: "error", error: (e as Error).message }).eq("id", fila.id);
    throw e;
  }
}

/** Una pasada por una carrera: guarda los momentos nuevos o cambiados y publica los que ya esperaron */
async function repasar(
  service: SupabaseClient, carrera: Carrera, cfg: Config, cupo: { quedan: number },
): Promise<Resumen> {
  const res: Resumen = { momentos: 0, nuevos: 0, esperando: 0, publicadas: 0, errores: [] };
  const hoy = hoyLocal();
  const enFecha = carrera.date === hoy || carrera.date === ayer(hoy);

  const lista = await momentos(service, carrera, cfg);
  res.momentos = lista.length;

  const { data: existentes } = await service
    .from("instagram_directo_eventos")
    .select("clave, firma, estado, visto_at")
    .eq("race_id", carrera.id);
  const previos = new Map((existentes ?? []).map((e) => [e.clave, e]));

  const listos: { m: Momento; firma: string }[] = [];
  for (const m of lista) {
    const firma = await huella(m.datos);
    const e = previos.get(m.clave);
    if (!e) {
      await service.from("instagram_directo_eventos").insert({ clave: m.clave, race_id: carrera.id, datos: m.datos, firma });
      res.nuevos++;
      if (cfg.retraso_min === 0) listos.push({ m, firma });
      else res.esperando++;
      continue;
    }
    if (e.estado !== "esperando") continue;
    if (e.firma !== firma) {
      // Ha cambiado (corrección, otro más rápido…): vuelve a esperar desde ahora
      await service
        .from("instagram_directo_eventos")
        .update({ datos: m.datos, firma, visto_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
        .eq("clave", m.clave);
      res.esperando++;
      continue;
    }
    const esperado = Date.now() - new Date(e.visto_at).getTime();
    if (esperado >= cfg.retraso_min * 60_000) listos.push({ m, firma });
    else res.esperando++;
  }

  if (listos.length === 0) return res;
  if (!cfg.activo) {
    res.aviso = "El directo está apagado: no se publica nada";
    return res;
  }
  if (!enFecha) {
    res.aviso = `La carrera es el ${carrera.date}: solo se publica ese día y el siguiente`;
    return res;
  }

  let c: Credenciales;
  try {
    c = credenciales();
  } catch (e) {
    res.errores.push((e as Error).message);
    return res;
  }
  const [fuentes, foto, logo] = await Promise.all([
    cargarFuentes(),
    cargarImagen(carrera.cover_image_url || carrera.image_url),
    cargarImagen(LOGO),
  ]);

  for (const { m, firma } of listos) {
    if (cupo.quedan <= 0) {
      res.esperando++;
      continue;
    }
    // Reclamo atómico: si otra pasada (solapada) ya lo tomó, no se publica dos veces
    const { data: tomado } = await service
      .from("instagram_directo_eventos")
      .update({ estado: "publicada", updated_at: new Date().toISOString() })
      .eq("clave", m.clave)
      .eq("estado", "esperando")
      .eq("firma", firma)
      .select("clave");
    if (!tomado?.length) continue;
    cupo.quedan--;
    try {
      const jpeg = await dibujarHistoria(m.datos, fuentes, foto, logo);
      const id = await publicarMomento(service, c, carrera, m, jpeg);
      await service.from("instagram_directo_eventos").update({ publicacion_id: id }).eq("clave", m.clave);
      res.publicadas++;
    } catch (e) {
      const mensaje = (e as Error).message;
      await service
        .from("instagram_directo_eventos")
        .update({ estado: "error", error: mensaje, updated_at: new Date().toISOString() })
        .eq("clave", m.clave);
      res.errores.push(`${m.datos.recorrido}: ${mensaje}`);
    }
  }
  return res;
}

const EJEMPLO: Omit<DatosHistoria, "carrera" | "pie"> = {
  tipo: "podio",
  recorrido: "Recorrido de ejemplo",
  sexo: 1,
  puestos: [
    { nombre: "Nombre Apellido Apellido", club: "Club de ejemplo", tiempo: "1:45:12" },
    { nombre: "Nombre Apellido", club: null, tiempo: "1:47:30" },
    { nombre: "Nombre Apellido Apellido", club: "Otro club", tiempo: "1:52:04" },
  ],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await req.json()) ?? {};
  } catch {
    // el robot manda '{}'; un cuerpo vacío vale lo mismo
  }

  // ── Rama robot ──────────────────────────────────────────────────────
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: valida } = await service.rpc("clave_cron_valida", {
      p_nombre: "instagram_directo_cron_key",
      p_clave: cronKey,
    });
    if (valida !== true) return json({ error: "Clave de cron incorrecta o sin configurar" }, 403);

    const { data: cfgs } = await service.from("instagram_directo").select("*").eq("activo", true);
    const cupo = { quedan: MAX_POR_PASADA };
    const resumenes: Record<string, Resumen | { error: string }> = {};
    for (const cfg of (cfgs ?? []) as Config[]) {
      const { data: carrera } = await service
        .from("races")
        .select("id, name, slug, date, cover_image_url, image_url")
        .eq("id", cfg.race_id)
        .single();
      if (!carrera) continue;
      try {
        resumenes[cfg.race_id] = await repasar(service, carrera as Carrera, cfg, cupo);
      } catch (e) {
        resumenes[cfg.race_id] = { error: (e as Error).message };
      }
      await service
        .from("instagram_directo")
        .update({ ultima_pasada: new Date().toISOString(), ultimo_resultado: resumenes[cfg.race_id] })
        .eq("race_id", cfg.race_id);
    }
    return json({ ok: true, carreras: resumenes });
  }

  // ── Rama panel: admin con su sesión ─────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);
  const usuario = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return json({ error: "Sesión no válida" }, 401);
  const { data: esAdmin } = await usuario.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (esAdmin !== true) return json({ error: "Solo para administradores" }, 403);

  const raceId = typeof cuerpo.race_id === "string" && UUID.test(cuerpo.race_id) ? cuerpo.race_id : null;
  if (!raceId) return json({ error: "Falta race_id" }, 400);
  const { data: carrera } = await service
    .from("races")
    .select("id, name, slug, date, cover_image_url, image_url")
    .eq("id", raceId)
    .single();
  if (!carrera) return json({ error: "Carrera no encontrada" }, 404);
  const { data: guardada } = await service.from("instagram_directo").select("*").eq("race_id", raceId).maybeSingle();
  const cfg: Config = (guardada as Config) ?? {
    race_id: raceId, activo: false, primero: true, podio: true, retraso_min: 3, racetec_eids: {},
  };

  try {
    if (cuerpo.vista_previa) {
      const lista = await momentos(service, carrera as Carrera, { ...cfg, primero: true, podio: true });
      // El momento más vistoso que haya: un podio; si no, un primero; si no, un ejemplo
      const elegido = lista.find((m) => m.datos.tipo === "podio") ?? lista[0];
      const datos: DatosHistoria = elegido?.datos ?? {
        ...EJEMPLO,
        carrera: carrera.name,
        pie: carrera.slug ? `Resultados en directo: camberas.com/${carrera.slug}/live` : null,
      };
      const [fuentes, foto, logo] = await Promise.all([
        cargarFuentes(),
        cargarImagen(carrera.cover_image_url || carrera.image_url),
        cargarImagen(LOGO),
      ]);
      const jpeg = await dibujarHistoria(datos, fuentes, foto, logo);
      return json({
        ok: true,
        ejemplo: !elegido,
        imagen: `data:image/jpeg;base64,${base64(jpeg.slice().buffer as ArrayBuffer)}`,
        momentos: lista.map((m) => ({ clave: m.clave, tipo: m.datos.tipo, recorrido: m.datos.recorrido, sexo: m.datos.sexo, puestos: m.datos.puestos })),
      });
    }

    // Repasar guarda los momentos y arranca su espera: solo con el directo configurado
    if (!guardada) return json({ error: "Guarda primero la configuración del directo de esta carrera" }, 400);
    const resumen = await repasar(service, carrera as Carrera, cfg, { quedan: MAX_POR_PASADA });
    await service
      .from("instagram_directo")
      .update({ ultima_pasada: new Date().toISOString(), ultimo_resultado: resumen })
      .eq("race_id", raceId);
    return json({ ok: true, resumen });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
