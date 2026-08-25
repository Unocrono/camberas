// Robot de recuperación de inscripciones a medias (carrito abandonado).
//
// Quien empieza una inscripción de pago ya existe en `registrations` con
// payment_status='pending'. Si no vuelve de la pasarela, nadie le escribe y
// la plaza se libera sola a los 30 minutos. Esto le manda dos avisos con un
// enlace para retomar el pago: a las 2 h y a las 24 h del abandono.
//
// Toda la selección vive en SQL (ver la migración
// 20260825120000_recuperar_pagos_a_medias.sql): aquí solo se redactan y se
// mandan los correos, y se sella cada envío.
//
// Se llama desde pg_cron con la cabecera x-cron-key, o a mano por un admin
// con su sesión. Acepta dryRun para ver a quién escribiría sin escribir.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

// Paleta Camberas (docs/paleta-camberas.md)
const VERDE = "#235940";
const NARANJA = "#EC7C2B";
const CREMA = "#FAF6EC";

interface Aviso {
  id: string;
  token: string;
  ronda: number;
  tipo: "individual" | "equipo";
  email: string;
  nombre: string | null;
  race_name: string;
  race_slug: string | null;
  race_date: string;
  race_location: string | null;
  distance_name: string;
  team_name: string | null;
  n_corredores: number;
  importe: number | null;
}

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * 1.174,50 € — en un correo en español el punto decimal canta, y un lote de
 * equipo llega a cuatro cifras. useGrouping va explícito porque no todos los
 * runtimes agrupan por defecto.
 */
const euros = (n: number) =>
  n.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }) + " €";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function asunto(a: Aviso): string {
  if (a.tipo === "equipo") {
    return a.ronda === 1
      ? `Falta el pago del equipo ${a.team_name} en ${a.race_name}`
      : `Las plazas de ${a.team_name} en ${a.race_name} siguen sin confirmar`;
  }
  return a.ronda === 1
    ? `Te queda un paso para correr ${a.race_name}`
    : `Tu plaza en ${a.race_name} sigue sin confirmar`;
}

function cuerpo(a: Aviso, enlace: string): string {
  const saludo = a.nombre ? `Hola ${esc(a.nombre)},` : "Hola,";

  const queEs =
    a.tipo === "equipo"
      ? `Empezaste la inscripción de <strong>${esc(a.team_name ?? "tu equipo")}</strong>
         (${a.n_corredores} ${a.n_corredores === 1 ? "corredor" : "corredores"})
         y el pago se quedó a medias.`
      : "Empezaste tu inscripción y el pago se quedó a medias.";

  const suyos = a.tipo === "equipo" ? "Los datos del equipo siguen" : "Tus datos siguen";
  const plazas = a.tipo === "equipo" ? "las plazas no quedan reservadas" : "la plaza no queda reservada";
  const urgencia =
    a.ronda === 1
      ? `${suyos} guardados: solo falta completar el pago.`
      : `${suyos} guardados, pero ${plazas} hasta que el pago se confirme.`;

  const filaImporte =
    a.importe != null
      ? `<tr>
           <td style="padding: 6px 0; color: #4b5563;">Importe pendiente</td>
           <td style="padding: 6px 0; color: ${VERDE}; font-weight: bold; text-align: right;">
             ${euros(Number(a.importe))}
           </td>
         </tr>`
      : "";

  const filaLugar = a.race_location
    ? `<tr>
         <td style="padding: 6px 0; color: #4b5563;">Lugar</td>
         <td style="padding: 6px 0; color: #1f2937; text-align: right;">${esc(a.race_location)}</td>
       </tr>`
    : "";

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${VERDE}; padding: 28px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${CREMA}; margin: 8px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>

    <div style="padding: 36px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 21px;">${
        a.tipo === "equipo" ? "La inscripción de tu equipo se quedó a medias" : "Tu inscripción se quedó a medias"
      }</h2>

      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${saludo}</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        ${queEs} ${urgencia}
      </p>

      <div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 18px 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
          <tr>
            <td style="padding: 6px 0; color: #4b5563;">Carrera</td>
            <td style="padding: 6px 0; color: #1f2937; font-weight: bold; text-align: right;">${esc(a.race_name)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #4b5563;">Recorrido</td>
            <td style="padding: 6px 0; color: #1f2937; text-align: right;">${esc(a.distance_name)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #4b5563;">Fecha</td>
            <td style="padding: 6px 0; color: #1f2937; text-align: right;">${fechaLarga(a.race_date)}</td>
          </tr>
          ${filaLugar}
          ${filaImporte}
        </table>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${enlace}"
           style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
                  padding: 15px 34px; border-radius: 8px; font-size: 16px; font-weight: bold;">
          Completar el pago
        </a>
      </div>

      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 6px;">
        El importe definitivo es el vigente en el momento de pagar: si la carrera tiene tramos de
        precio y el tramo ha cambiado, el que verás al abrir el enlace es el bueno.
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0;">
        Si ya has pagado o has cambiado de idea, no tienes que hacer nada: este aviso se manda como
        mucho dos veces y no volverás a recibirlo.
      </p>
    </div>

    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Este correo es sobre la inscripción que empezaste en <strong>camberas.com</strong>.
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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_KEY = Deno.env.get("RECUPERAR_PAGOS_CRON_KEY");
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://camberas.com";

    // ── Quién llama: el robot con su clave, o un admin con su sesión ─────
    const cronKey = req.headers.get("x-cron-key");
    let autorizado = false;

    if (CRON_KEY && cronKey && cronKey === CRON_KEY) {
      autorizado = true;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const authClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await authClient.auth.getUser();
        if (user) {
          const { data: esAdmin } = await authClient.rpc("has_role", {
            _user_id: user.id,
            _role: "admin",
          });
          autorizado = esAdmin === true;
        }
      }
    }

    if (!autorizado) {
      return json({ error: "No autorizado" }, 401);
    }

    let params: { ventanaHoras?: number; dryRun?: boolean; limite?: number } = {};
    try {
      params = await req.json();
    } catch {
      // pg_cron manda '{}', pero una llamada sin cuerpo también vale
    }
    const ventanaHoras = params.ventanaHoras ?? 48;
    const dryRun = params.dryRun === true;
    const limite = params.limite ?? 200;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Cerrar las que ya se pagaron, para no escribirles
    const { data: cerradas, error: errCerrar } = await supabase.rpc("cerrar_recuperaciones_pagadas");
    if (errCerrar) throw new Error(`cerrar_recuperaciones_pagadas: ${errCerrar.message}`);

    // 2. Dar de alta los abandonos nuevos
    const { data: nuevas, error: errRegistrar } = await supabase.rpc("registrar_pagos_a_medias", {
      p_ventana_horas: ventanaHoras,
    });
    if (errRegistrar) throw new Error(`registrar_pagos_a_medias: ${errRegistrar.message}`);

    // 3. Los avisos que tocan ahora
    const { data: avisos, error: errAvisos } = await supabase.rpc("avisos_pago_pendientes");
    if (errAvisos) throw new Error(`avisos_pago_pendientes: ${errAvisos.message}`);

    const cola = ((avisos ?? []) as Aviso[]).slice(0, limite);

    if (dryRun) {
      console.log(`recuperar-pagos [ENSAYO]: ${cola.length} avisos saldrían ahora`);
      return json({
        ensayo: true,
        cerradas,
        nuevas,
        pendientes: cola.length,
        avisos: cola.map((a) => ({
          ronda: a.ronda,
          tipo: a.tipo,
          email: a.email,
          carrera: a.race_name,
          recorrido: a.distance_name,
          corredores: a.n_corredores,
          importe: a.importe,
          asunto: asunto(a),
          enlace: `${SITE_URL}/retomar-pago/${a.token}`,
        })),
      });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    let enviados = 0;
    const fallos: { email: string; error: string }[] = [];

    for (const a of cola) {
      const enlace = `${SITE_URL}/retomar-pago/${a.token}`;
      try {
        const { error: sendError } = await resend.emails.send({
          from: "Camberas <noreply@camberas.com>",
          to: [a.email],
          subject: asunto(a),
          html: cuerpo(a, enlace),
        });
        if (sendError) throw new Error(sendError.message ?? String(sendError));

        // Se sella en cuanto el envío sale: mejor perder un aviso que
        // mandar el mismo dos veces
        const { error: errMarcar } = await supabase.rpc("marcar_aviso_pago", {
          p_id: a.id,
          p_ronda: a.ronda,
          p_importe: a.importe,
        });
        if (errMarcar) console.error("marcar_aviso_pago:", errMarcar.message);

        enviados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`recuperar-pagos: fallo enviando a ${a.email}: ${msg}`);
        fallos.push({ email: a.email, error: msg });
      }
    }

    console.log(
      `recuperar-pagos: ${nuevas} nuevas, ${cerradas} cerradas, ${enviados}/${cola.length} avisos enviados`,
    );

    return json({ cerradas, nuevas, pendientes: cola.length, enviados, fallos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("recuperar-pagos:", msg);
    return json({ error: msg }, 500);
  }
});
