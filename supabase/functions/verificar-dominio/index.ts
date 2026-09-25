import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Verifica el dominio propio de una carrera (race_domains) mirando el DNS:
//  - CNAME de www.<dominio> (o del propio dominio) apuntando a Camberas, o
//  - TXT en _camberas.<dominio> con "camberas-verificacion=<race_id>".
// Cualquiera de los dos vale. Si se cumple, marca verificado con service
// role (el trigger de la tabla impide que lo haga el organizador).
//
// Lo llama el organizador desde el panel (verify_jwt = true) y solo puede
// verificar dominios de sus carreras (puede_gestionar_carrera).
//
// DNS por HTTPS (Cloudflare): más fiable que Deno.resolveDns en el runtime
// de Supabase y no depende del resolver local.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DESTINOS_VALIDOS = ["sitios.camberas.com", "camberas.com", "camberas.pages.dev"];

async function dns(nombre: string, tipo: "CNAME" | "TXT"): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nombre)}&type=${tipo}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const answers: { type: number; data: string }[] = json.Answer ?? [];
  const tipoNum = tipo === "CNAME" ? 5 : 16;
  return answers.filter((a) => a.type === tipoNum).map((a) => a.data.replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Necesitas iniciar sesión" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Sesión no válida" }, 401);

    const { domainId } = await req.json();
    if (!domainId) return json({ error: "domainId is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: dominio } = await admin.from("race_domains").select("id, race_id, hostname, verificado").eq("id", domainId).maybeSingle();
    if (!dominio) return json({ error: "Dominio no encontrado" }, 404);

    // Permiso: el organizador de esa carrera o un admin (la RPC valida con el JWT del usuario)
    const { data: puede } = await authClient.rpc("puede_gestionar_carrera", { p_race_id: dominio.race_id });
    if (!puede) return json({ error: "Sin permiso sobre esta carrera" }, 403);

    const host = String(dominio.hostname);
    const [cnameWww, cnameRaiz, txt] = await Promise.all([dns(`www.${host}`, "CNAME"), dns(host, "CNAME"), dns(`_camberas.${host}`, "TXT")]);
    const cnameOk = [...cnameWww, ...cnameRaiz].some((d) => DESTINOS_VALIDOS.some((v) => d === v || d.endsWith(`.${v}`)));
    const txtOk = txt.some((t) => t === `camberas-verificacion=${dominio.race_id}`);

    if (!cnameOk && !txtOk) {
      return json({
        verificado: false,
        cname: [...cnameWww, ...cnameRaiz],
        txt,
        ayuda: `Añade en tu DNS: www.${host} CNAME sitios.camberas.com, o un TXT en _camberas.${host} con el valor camberas-verificacion=${dominio.race_id}. Los cambios de DNS pueden tardar hasta una hora.`,
      });
    }

    const { error: updError } = await admin.from("race_domains").update({ verificado: true, verificado_at: new Date().toISOString() }).eq("id", domainId);
    if (updError) return json({ error: updError.message }, 500);

    return json({ verificado: true, por: cnameOk ? "cname" : "txt" });
  } catch (err) {
    console.error("verificar-dominio:", err);
    return json({ error: err instanceof Error ? err.message : "Error" }, 500);
  }
});
