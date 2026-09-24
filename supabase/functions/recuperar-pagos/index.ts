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

// Cabecera ilustrada (cielo arena, sol melocotón y las tres colinas: la firma
// de la casa, docs/paleta-camberas.md). Es una imagen servida desde la web
// porque las formas dibujadas con HTML no se ven igual en todos los correos;
// si el cliente bloquea imágenes queda la franja arena con el nombre.
const CABECERA = `${Deno.env.get("SITE_URL") ?? "https://camberas.com"}/email/cabecera-colinas.png`;
const ARENA = "#FCEBD6";
const TINTA = "#0E2419";
const COLINA_OSCURA = "#1E5B38";

function asunto(a: Aviso): string {
  if (a.tipo === "equipo") {
    return a.ronda === 1
      ? `⛰️ ¡A ${a.team_name} le queda un paso para correr ${a.race_name}!`
      : `⛰️ Las plazas de ${a.team_name} en ${a.race_name} os están esperando`;
  }
  return a.ronda === 1
    ? `⛰️ ¡Te queda un paso para correr ${a.race_name}!`
    : `⛰️ Tu plaza en ${a.race_name} te está esperando`;
}

function cuerpo(a: Aviso, enlace: string): string {
  const equipo = a.tipo === "equipo";
  const saludo = a.nombre ? `¡Hola ${esc(a.nombre)}!` : "¡Hola!";
  const carrera = `<strong>${esc(a.race_name)}</strong>`;

  const titulo = equipo
    ? a.ronda === 1 ? "¡Tu equipo está a un paso de la salida!" : "¡Las plazas de tu equipo os esperan!"
    : a.ronda === 1 ? "¡Estás a un paso de la salida!" : "¡Tu plaza te está esperando!";

  const texto = equipo
    ? a.ronda === 1
      ? `Empezaste la inscripción de <strong>${esc(a.team_name ?? "tu equipo")}</strong>
         (${a.n_corredores} ${a.n_corredores === 1 ? "corredor" : "corredores"}) en ${carrera}
         y solo falta el pago. Los datos del equipo siguen guardados: en un minuto lo tenéis hecho.`
      : `La inscripción de <strong>${esc(a.team_name ?? "tu equipo")}</strong> en ${carrera} sigue a
         medias, y las plazas no quedan reservadas hasta que se pague. ¡Que no se os escapen!`
    : a.ronda === 1
      ? `Empezaste tu inscripción en ${carrera} y solo falta el pago. Tus datos siguen guardados:
         en un minuto lo tienes hecho.`
      : `Tu inscripción en ${carrera} sigue a medias, y la plaza no queda reservada hasta que
         pagues. ¡Que no se te escape!`;

  const detalles = [a.distance_name, fechaLarga(a.race_date), a.race_location]
    .filter((x): x is string => !!x)
    .map((x) => esc(x))
    .join(" · ");

  const importe =
    a.importe != null
      ? `<p style="margin: 14px 0 0; color: #4b5563; font-size: 15px;">
           Te falta pagar <strong style="color: ${VERDE}; font-size: 18px;">${euros(Number(a.importe))}</strong>
         </p>`
      : "";

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${ARENA}; padding: 24px 30px 6px; text-align: center;">
      <h1 style="color: ${TINTA}; margin: 0; font-size: 28px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${COLINA_OSCURA}; margin: 6px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>
    <img src="${CABECERA}" width="600" alt=""
         style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; background: ${ARENA};">

    <div style="padding: 32px 30px 36px;">
      <h2 style="color: ${TINTA}; margin: 0 0 16px; font-size: 24px;">${titulo}</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${saludo}</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">${texto}</p>

      <div style="background: ${CREMA}; border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center;">
        <p style="margin: 0; color: ${TINTA}; font-size: 19px; font-weight: bold;">${esc(a.race_name)}</p>
        <p style="margin: 6px 0 0; color: #4b5563; font-size: 14px;">${detalles}</p>
        ${importe}
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${enlace}"
           style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
                  padding: 16px 36px; border-radius: 30px; font-size: 17px; font-weight: bold;">
          ${equipo ? "¡Completar la inscripción del equipo!" : "¡Completar mi inscripción!"}
        </a>
      </div>

      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 6px;">
        El importe es el vigente al pagar: si la carrera tiene tramos de precio, puede haber cambiado.
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
        ¿Ya lo hiciste o has cambiado de planes? No pasa nada: ignora este correo, no te escribiremos
        más de dos veces.
      </p>

      <p style="color: ${VERDE}; font-size: 17px; font-weight: bold; text-align: center; margin: 0;">
        ¡Nos vemos en la línea de salida!
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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Quién llama: el robot con su clave, o un admin con su sesión ─────
    // La clave del robot vive en el Vault de la base de datos (la crea la
    // migración 20260923210000 y el cron la lee de allí); el secreto de
    // entorno se sigue aceptando por si algún día se configura a mano.
    const cronKey = req.headers.get("x-cron-key");
    let autorizado = false;

    if (cronKey && CRON_KEY && cronKey === CRON_KEY) {
      autorizado = true;
    } else if (cronKey) {
      const { data: valida, error: errClave } = await supabase.rpc("clave_cron_valida", {
        p_nombre: "recuperar_pagos_cron_key",
        p_clave: cronKey,
      });
      if (errClave) console.error("clave_cron_valida:", errClave.message);
      autorizado = valida === true;
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

    // El ensayo no escribe NADA. Antes cerraba y daba de alta filas aunque
    // fuera ensayo, y las altas ponían en marcha el reloj de los avisos. A
    // cambio, el ensayo solo ve los abandonos que ya estaban dados de alta.
    let cerradas = 0;
    let nuevas = 0;
    if (!dryRun) {
      // 1. Cerrar las que ya se pagaron, para no escribirles
      const { data: nCerradas, error: errCerrar } = await supabase.rpc("cerrar_recuperaciones_pagadas");
      if (errCerrar) throw new Error(`cerrar_recuperaciones_pagadas: ${errCerrar.message}`);
      cerradas = nCerradas ?? 0;

      // 2. Dar de alta los abandonos nuevos
      const { data: nNuevas, error: errRegistrar } = await supabase.rpc("registrar_pagos_a_medias", {
        p_ventana_horas: ventanaHoras,
      });
      if (errRegistrar) throw new Error(`registrar_pagos_a_medias: ${errRegistrar.message}`);
      nuevas = nNuevas ?? 0;
    }

    // 3. Los avisos que tocan ahora
    const { data: avisos, error: errAvisos } = await supabase.rpc("avisos_pago_pendientes");
    if (errAvisos) throw new Error(`avisos_pago_pendientes: ${errAvisos.message}`);

    const cola = ((avisos ?? []) as Aviso[]).slice(0, limite);

    if (dryRun) {
      console.log(`recuperar-pagos [ENSAYO]: ${cola.length} avisos saldrían ahora`);
      return json({
        ensayo: true,
        nota: "El ensayo no escribe: no incluye abandonos que el robot aún no ha dado de alta",
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

    for (const [i, a] of cola.entries()) {
      // Resend admite unas 2 peticiones por segundo
      if (i > 0) await new Promise((r) => setTimeout(r, 550));
      const enlace = `${SITE_URL}/retomar-pago/${a.token}`;
      try {
        const { error: sendError } = await resend.emails.send({
          from: "Camberas <noreply@camberas.com>",
          to: [a.email],
          subject: asunto(a),
          html: cuerpo(a, enlace),
        });
        if (sendError) {
          // Dirección que Resend rechaza ("Invalid `to` field"): no va a
          // mejorar sola. Se sella la ronda para no reintentarla cada hora
          // hasta que caduque. Solo ese caso: un validation_error por el
          // dominio remitente afectaría a todos y no debe darse por enviado.
          if (
            (sendError as { name?: string }).name === "validation_error" &&
            /invalid\s+`?to`?\s+field/i.test(sendError.message ?? "")
          ) {
            await supabase.rpc("marcar_aviso_pago", { p_id: a.id, p_ronda: a.ronda, p_importe: a.importe });
          }
          throw new Error(sendError.message ?? String(sendError));
        }

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
