// Últimas publicaciones del Instagram de una carrera, para su web propia.
// Pública (verify_jwt = false): la llama la plantilla, sin sesión, también
// desde los dominios propios.
//
// Entrada: { slug }. La cuenta sale de race_web.contenido.contacto.redes
// .instagram, que pone el organizador en Web propia › Contenido. La función
// NO acepta un @ suelto: así nadie puede gastar el cupo de llamadas de la
// cuenta de Camberas leyendo cuentas que no son de ninguna carrera.
//
// Se lee con Business Discovery desde la cuenta de Camberas: el club no
// autoriza nada, pero su cuenta tiene que ser profesional (Empresa o Creador).
//
// Caché de 1 h en instagram_feed_cache, también de los errores (una cuenta
// personal no se reintenta en cada visita). Las URLs de imagen del CDN de
// Instagram caducan en días: con una hora van sobradas.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { credenciales, descubrir, usuarioDeUrl } from "../_shared/instagram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIGENCIA_MS = 60 * 60_000;
const CUANTAS = 6;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const NO_HAY = { disponible: false };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let slug = "";
  try {
    slug = String((await req.json())?.slug ?? "");
  } catch {
    return json({ error: "JSON no válido" }, 400);
  }
  if (!SLUG.test(slug)) return json({ error: "slug no válido" }, 400);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: carrera } = await service.from("races").select("id").eq("slug", slug).maybeSingle();
  if (!carrera) return json(NO_HAY);
  const { data: web } = await service.from("race_web").select("contenido").eq("race_id", carrera.id).maybeSingle();
  const usuario = usuarioDeUrl(web?.contenido?.contacto?.redes?.instagram);
  if (!usuario) return json(NO_HAY);

  const clave = usuario.toLowerCase();
  const { data: cache } = await service
    .from("instagram_feed_cache")
    .select("datos, error, generado")
    .eq("usuario", clave)
    .maybeSingle();
  if (cache && Date.now() - new Date(cache.generado).getTime() < VIGENCIA_MS) {
    return json(cache.datos ?? NO_HAY);
  }

  // Sin secrets todavía: no se guarda nada, para que funcione en cuanto estén
  let c;
  try {
    c = credenciales();
  } catch {
    return json(NO_HAY);
  }

  try {
    const cuenta = await descubrir(c, usuario, CUANTAS);
    const datos = {
      disponible: true,
      usuario: cuenta.username,
      nombre: cuenta.name ?? null,
      foto: cuenta.profile_picture_url ?? null,
      seguidores: cuenta.followers_count ?? null,
      perfil: `https://www.instagram.com/${cuenta.username}/`,
      publicaciones: (cuenta.media?.data ?? [])
        .map((m) => ({
          id: m.id,
          tipo: m.media_type,
          // Vídeo: la miniatura (media_url sería el vídeo, o no viene si lleva música con derechos)
          imagen: m.media_type === "VIDEO" ? m.thumbnail_url ?? null : m.media_url ?? null,
          enlace: m.permalink,
          texto: (m.caption ?? "").slice(0, 300),
          fecha: m.timestamp,
        }))
        .filter((p) => p.imagen),
    };
    await service
      .from("instagram_feed_cache")
      .upsert({ usuario: clave, datos, error: null, generado: new Date().toISOString() });
    return json(datos);
  } catch (e) {
    const error = (e as Error).message;
    console.error(`instagram-feed @${usuario}:`, error);
    await service
      .from("instagram_feed_cache")
      .upsert({ usuario: clave, datos: null, error, generado: new Date().toISOString() });
    return json(NO_HAY);
  }
});
