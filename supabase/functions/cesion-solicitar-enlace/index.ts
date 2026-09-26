// Pedir el enlace de cesión sin tener cuenta.
//
// Camino OBLIGATORIO, no un extra: las inscripciones que crea guest-register
// tienen user_id NULL, y esa gente no ve /dashboard jamás. Si el único sitio
// desde donde se puede ceder es el panel del usuario, justo quien más lo
// necesita se queda fuera y sigue usando WhatsApp — que es exactamente lo que
// esto viene a sustituir.
//
// Funciona como un "he olvidado mi contraseña": se pide el email, y el enlace
// se manda A ESE EMAIL. NUNCA se devuelve en la respuesta HTTP, y la respuesta
// es siempre la misma haya inscripciones o no. Si no, esto sería un
// comprobador de "¿está fulano inscrito en esta carrera?" para cualquiera.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { correoCesion, type Cedible } from "./plantilla.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Siempre la misma respuesta, haya o no haya inscripciones: si variara,
  // esto sería un comprobador de quién está inscrito en cada carrera.
  const RESPUESTA_UNICA = {
    ok: true,
    mensaje:
      "Si ese email tiene alguna inscripción que se pueda ceder, te llega un correo con el enlace en unos minutos.",
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://camberas.com";

    const { email } = await req.json();
    const correo = String(email ?? "").trim().toLowerCase();
    if (!correo || !correo.includes("@")) {
      return json({ ok: false, error: "Escribe un email válido" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Inscripciones vivas y pagadas de ese email, en carreras futuras que
    // admitan cesión. El resto de condiciones (plazo, lecturas, equipo,
    // importada, tope) las comprueba cesion_crear, que es donde viven.
    const { data: candidatas, error: errBusca } = await supabase
      .from("registrations")
      .select(
        "id, first_name, bib_number, race_id, race_distance_id, races!inner(name, date), race_distances!inner(name)",
      )
      .ilike("email", correo)
      .neq("status", "cancelled")
      .in("payment_status", ["paid", "not_required"])
      .gte("races.date", new Date().toISOString().slice(0, 10));

    if (errBusca) {
      console.error("cesion-solicitar-enlace: buscando:", errBusca.message);
      return json(RESPUESTA_UNICA);
    }

    const items: Cedible[] = [];
    let nombre: string | null = null;

    for (const r of candidatas ?? []) {
      const { data: creada, error: errCrear } = await supabase.rpc("cesion_crear", {
        p_registration_id: (r as any).id,
      });
      if (errCrear) {
        console.error("cesion_crear:", errCrear.message);
        continue;
      }
      // Si dice que no (no permitida, fuera de plazo, ya corrió…), se salta
      if (!creada?.ok || !creada?.token) continue;

      nombre ??= (r as any).first_name ?? null;
      items.push({
        registration_id: (r as any).id,
        race_name: (r as any).races?.name ?? "",
        race_date: (r as any).races?.date ?? "",
        distance_name: (r as any).race_distances?.name ?? "",
        dorsal: (r as any).bib_number ?? null,
        token: creada.token,
      });
    }

    if (items.length === 0) {
      console.log(`cesion-solicitar-enlace: nada cedible para ${correo}`);
      return json(RESPUESTA_UNICA);
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const correoCes = correoCesion(nombre, items, SITE_URL);
    const { error: errEnvio } = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [correo],
      subject: correoCes.asunto,
      html: correoCes.html,
    });
    if (errEnvio) {
      console.error("cesion-solicitar-enlace: Resend:", errEnvio.message ?? errEnvio);
    } else {
      console.log(`cesion-solicitar-enlace: ${items.length} enlace(s) enviados a ${correo}`);
    }

    return json(RESPUESTA_UNICA);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("cesion-solicitar-enlace:", msg);
    // Ni siquiera el error cambia la respuesta hacia fuera
    return json(RESPUESTA_UNICA);
  }
});
