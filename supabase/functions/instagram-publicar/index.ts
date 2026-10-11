// Publica en el Instagram de Camberas. Solo admins: verify_jwt = true y,
// dentro, has_role. Acciones (POST, JSON):
//
//   { accion: 'estado' }
//       La cuenta conectada y el cupo de publicaciones del día (panel).
//   { accion: 'publicar', tipo, imagenes, pie?, race_id?, formato? }
//       imagenes: URLs del bucket público «instagram», que es de donde Meta
//       las descarga; la función no publica imágenes de ningún otro sitio.
//       Una = foto; varias = carrusel (máx. 10). formato 'historia' = una sola
//       imagen 9:16, sin pie.
//
// Cada intento deja su fila en instagram_publicaciones, con el error de Meta
// si falla: el historial del panel sale de ahí.
//
// Alta en Meta y secrets: docs/instagram-alta-meta.md.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  credenciales,
  estadoCuenta,
  type Formato,
  MAX_CARRUSEL,
  MAX_PIE,
  publicar,
} from "../_shared/instagram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 'historia' no está: esas las publica el robot del directo, con su clave
const TIPOS = new Set(["cartel_grupetta", "resultados", "otro"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const usuario = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: errUsuario } = await usuario.auth.getUser();
  if (errUsuario || !user) return json({ error: "Sesión no válida" }, 401);
  const { data: esAdmin, error: errRol } = await usuario.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (errRol || esAdmin !== true) {
    return json({ error: "Solo los administradores publican en Instagram" }, 403);
  }

  // deno-lint-ignore no-explicit-any
  let cuerpo: any;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "JSON no válido" }, 400);
  }

  let c;
  try {
    c = credenciales();
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }

  if (cuerpo?.accion === "estado") {
    try {
      return json({ ok: true, cuenta: await estadoCuenta(c) });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  if (cuerpo?.accion !== "publicar") return json({ error: "Acción desconocida" }, 400);

  const tipo = String(cuerpo.tipo ?? "");
  if (!TIPOS.has(tipo)) return json({ error: `Tipo de publicación desconocido: ${tipo}` }, 400);
  const formato: Formato = cuerpo.formato === "historia" ? "historia" : "feed";

  const prefijo = `${supabaseUrl}/storage/v1/object/public/instagram/`;
  const imagenes: unknown[] = Array.isArray(cuerpo.imagenes) ? cuerpo.imagenes : [];
  if (imagenes.length === 0 || imagenes.length > MAX_CARRUSEL) {
    return json({ error: `Hacen falta entre 1 y ${MAX_CARRUSEL} imágenes` }, 400);
  }
  if (!imagenes.every((u) => typeof u === "string" && u.startsWith(prefijo))) {
    return json({ error: "Las imágenes tienen que estar en el bucket «instagram»" }, 400);
  }
  const pie = typeof cuerpo.pie === "string" ? cuerpo.pie.trim() : "";
  if (pie.length > MAX_PIE) return json({ error: `El pie pasa de ${MAX_PIE} caracteres` }, 400);
  const raceId = typeof cuerpo.race_id === "string" && UUID.test(cuerpo.race_id) ? cuerpo.race_id : null;

  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: fila, error: errFila } = await service
    .from("instagram_publicaciones")
    .insert({
      tipo,
      formato,
      race_id: raceId,
      imagenes,
      pie: pie || null,
      creada_por: user.id,
    })
    .select("id")
    .single();
  if (errFila || !fila) {
    return json({ error: `No se pudo registrar la publicación: ${errFila?.message}` }, 500);
  }

  try {
    const r = await publicar(c, imagenes as string[], formato === "historia" ? null : pie || null, formato);
    await service
      .from("instagram_publicaciones")
      .update({
        estado: "publicada",
        media_id: r.mediaId,
        permalink: r.permalink,
        publicada_at: new Date().toISOString(),
      })
      .eq("id", fila.id);
    return json({ ok: true, id: fila.id, permalink: r.permalink });
  } catch (e) {
    const mensaje = (e as Error).message;
    await service
      .from("instagram_publicaciones")
      .update({ estado: "error", error: mensaje })
      .eq("id", fila.id);
    return json({ error: mensaje, id: fila.id }, 502);
  }
});
