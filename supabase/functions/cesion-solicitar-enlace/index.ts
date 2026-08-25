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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paleta Camberas (docs/paleta-camberas.md)
const VERDE = "#235940";
const NARANJA = "#EC7C2B";
const CREMA = "#FAF6EC";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

interface Cedible {
  registration_id: string;
  race_name: string;
  race_date: string;
  distance_name: string;
  dorsal: number | null;
  token: string;
}

function cuerpo(nombre: string | null, items: Cedible[], siteUrl: string): string {
  const filas = items
    .map(
      (i) => `
      <div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 16px 18px; margin: 16px 0;">
        <p style="margin: 0 0 4px; font-size: 16px; font-weight: bold; color: #1f2937;">${esc(i.race_name)}</p>
        <p style="margin: 0 0 2px; color: #4b5563; font-size: 14px;">${esc(i.distance_name)}${
          i.dorsal != null ? ` · dorsal ${i.dorsal}` : ""
        }</p>
        <p style="margin: 0 0 14px; color: #6b7280; font-size: 13px;">${fechaLarga(i.race_date)}</p>
        <a href="${siteUrl}/ceder/${i.token}"
           style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
                  padding: 11px 22px; border-radius: 6px; font-size: 14px; font-weight: bold;">
          Ceder este dorsal
        </a>
      </div>`,
    )
    .join("");

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${VERDE}; padding: 28px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px;">Camberas</h1>
      <p style="color: ${CREMA}; margin: 8px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>
    <div style="padding: 34px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 14px; font-size: 21px;">Ceder tu dorsal</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 6px;">
        ${nombre ? `Hola ${esc(nombre)},` : "Hola,"}
      </p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">
        Has pedido el enlace para pasarle tu plaza a otra persona. Aquí lo tienes:
      </p>
      ${filas}
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 18px 0 6px;">
        Pásale el enlace a quien vaya a correr. Rellenará sus datos, aceptará el reglamento y el
        dorsal pasará a su nombre. <strong>Tú dejarás de figurar en la salida.</strong>
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 6px;">
        El enlace caduca en 72 horas y solo sirve una vez. Mándaselo únicamente a quien de verdad
        vaya a usarlo.
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0;">
        Si no has pedido esto, ignora el correo: mientras nadie abra el enlace, tu inscripción
        sigue igual.
      </p>
    </div>
    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Enviado desde <strong>camberas.com</strong> a petición tuya.
      </p>
    </div>
  </div>`;
}

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
    const { error: errEnvio } = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [correo],
      subject:
        items.length === 1
          ? `Tu enlace para ceder el dorsal de ${items[0].race_name}`
          : "Tus enlaces para ceder dorsal",
      html: cuerpo(nombre, items, SITE_URL),
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
