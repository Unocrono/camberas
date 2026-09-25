// Devolución de un cobro Redsys desde el panel (solo admin).
//
// Acciones (POST JSON, con la sesión del admin):
//  · devolver: reserva en la BD (devolucion_reservar) y pide a Redsys una
//    devolución (TransactionType 3) sobre el pedido ORIGINAL. Apunta el
//    resultado con devolucion_resolver y, si salió, avisa al corredor.
//  · externa:  registra una devolución ya hecha en el portal de Redsys
//    (Canales) para que cuadre el tope; no llama a Redsys.
//  · resolver: el admin marca una 'dudosa' como hecha o no hecha después de
//    mirarla en Canales.
//
// Nunca se reintenta sola: si no hay respuesta clara, queda 'dudosa'. El id
// de la devolución lo genera el panel, así que repetir la misma petición
// devuelve lo que ya hay y no pide otra devolución a Redsys.
//
// v1: cobros individuales con el TPV de UNO. Ver la migración
// 20260925213000_devoluciones_redsys.sql.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  REDSYS_URLS,
  decodificarParametros,
  generateSignature,
  merchantParamsB64,
  type Entorno,
} from "../_shared/redsys.ts";
import { interpretarRespuesta, type Resultado } from "./respuesta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Comercio de pruebas público de Redsys (pagosonline.redsys.es, "Tarjetas y
// entornos de prueba"): sus cobros se devuelven en sis-t con su clave pública
const FUC_PRUEBAS = "999008881";
const CLAVE_PRUEBAS_PUBLICA = "sq7HjrUOBfKmC576ILgskD5srU870gJ7";

// Redsys espera 30 s al emisor; se le da margen para que siempre conteste
const ESPERA_REDSYS_MS = 45_000;

// Paleta Camberas (docs/paleta-camberas.md)
const VERDE = "#235940";
const CREMA = "#FAF6EC";
const ARENA = "#FCEBD6";
const TINTA = "#0E2419";
const COLINA_OSCURA = "#1E5B38";
const CABECERA = `${Deno.env.get("SITE_URL") ?? "https://camberas.com"}/email/cabecera-colinas.png`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 1.174,50 € a partir de céntimos */
const euros = (cent: number) =>
  (cent / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) +
  " €";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Solo admin: el dinero sale del TPV de UNO ─────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autenticado" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { data: esAdmin } = await authClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (esAdmin !== true) return json({ error: "Solo un administrador puede hacer devoluciones" }, 403);

    const service = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const accion = body?.accion;

    // ── resolver: una 'dudosa' tras mirarla en Canales ───────────────────
    if (accion === "resolver") {
      if (typeof body.id !== "string" || !UUID.test(body.id)) return json({ error: "Falta la devolución" }, 400);
      if (body.estado !== "hecha" && body.estado !== "rechazada") {
        return json({ error: "El estado tiene que ser 'hecha' o 'rechazada'" }, 400);
      }
      const nota = typeof body.nota === "string" ? body.nota.slice(0, 500) : null;
      // Una 'pendiente' reciente puede estar esperando a Redsys en otra
      // llamada: no se resuelve a mano hasta que pase a dudosa (10 minutos)
      const { data: actual } = await service
        .from("devoluciones")
        .select("estado, created_at")
        .eq("id", body.id)
        .maybeSingle();
      if (!actual) return json({ error: "No existe esa devolución" }, 404);
      const minutos = (Date.now() - new Date(actual.created_at).getTime()) / 60_000;
      if (actual.estado === "pendiente" && minutos < 10) {
        return json({ error: "Esa devolución aún está esperando respuesta de Redsys", motivo: "en_curso" }, 409);
      }
      // Redsys puede terminar una devolución un rato después de un corte: no
      // se da por NO hecha hasta que haya tiempo de que aparezca en Canales
      if (body.estado === "rechazada" && minutos < 15) {
        return json({ error: "Espera 15 minutos desde la petición antes de darla por no hecha", motivo: "demasiado_pronto" }, 409);
      }
      const { data, error } = await service.rpc("devolucion_resolver", {
        p_id: body.id,
        p_estado: body.estado,
        p_ds_response: null,
        p_auth: null,
        p_error_code: body.estado === "rechazada" ? "MANUAL_NO_HECHA" : null,
        p_respuesta: { resolucion_manual: { estado: body.estado, nota, por: user.email ?? user.id, en: new Date().toISOString() } },
        p_usuario: user.id,
      });
      if (error) throw new Error(`devolucion_resolver: ${error.message}`);
      if (!data?.ok) return json({ error: "No se puede resolver", motivo: data?.motivo, estado: data?.estado }, 409);
      if (body.estado === "hecha") await avisarSiToca(service, body.id);
      return json({ ok: true, estado: body.estado });
    }

    if (accion !== "devolver" && accion !== "externa") {
      return json({ error: "Acción no válida" }, 400);
    }

    // ── Datos de la petición ─────────────────────────────────────────────
    const { id, payment_intent_id, registration_id } = body;
    const importe = body.importe_cent;
    if (![id, payment_intent_id, registration_id].every((v) => typeof v === "string" && UUID.test(v))) {
      return json({ error: "Faltan identificadores" }, 400);
    }
    if (!Number.isInteger(importe) || importe < 1 || importe > 10_000_000) {
      return json({ error: "Importe no válido (en céntimos, entero)" }, 400);
    }
    const motivo = typeof body.motivo === "string" ? body.motivo.slice(0, 500) : null;
    if (accion === "externa" && !motivo?.trim()) {
      return json({ error: "Para apuntar una devolución hecha fuera, pon la fecha o la referencia que ves en Canales" }, 400);
    }
    const visto = Number.isInteger(body.comprometido_visto_cent) ? body.comprometido_visto_cent : null;

    // ── Reserva: tope, una en curso por cobro, id repetido ───────────────
    const { data: reserva, error: errReserva } = await service.rpc("devolucion_reservar", {
      p_id: id,
      p_payment_intent_id: payment_intent_id,
      p_registration_id: registration_id,
      p_importe_cent: importe,
      p_origen: accion === "externa" ? "externa" : "redsys",
      p_motivo: motivo,
      p_cancelar: body.cancelar !== false,
      p_notificar: body.notificar !== false,
      p_usuario: user.id,
      p_comprometido_visto: visto,
    });
    if (errReserva) throw new Error(`devolucion_reservar: ${errReserva.message}`);
    if (!reserva?.ok) return json({ error: "No se puede devolver", ...reserva }, 409);

    // La misma petición otra vez: se contesta con lo que ya hay
    if (reserva.repetida) return json({ ok: true, repetida: true, ...reserva });

    if (accion === "externa") {
      await avisarSiToca(service, id);
      return json({ ok: true, estado: "hecha", importe_cent: importe });
    }

    // ── Comercio y entorno del cobro ─────────────────────────────────────
    const fuc = String(reserva.fuc ?? "");
    const terminal = String(reserva.terminal ?? "1");
    const order = String(reserva.order_number);
    let entorno: Entorno | null = null;
    let clave: string | null = null;
    if (Number(fuc) === Number(FUC_PRUEBAS)) {
      entorno = "test";
      clave = Deno.env.get("REDSYS_TEST_SECRET_KEY") ?? CLAVE_PRUEBAS_PUBLICA;
    } else if (fuc && Number(fuc) === Number(Deno.env.get("REDSYS_MERCHANT_CODE") ?? "")) {
      entorno = "prod";
      clave = Deno.env.get("REDSYS_SECRET_KEY") ?? null;
    }
    if (!entorno || !clave) {
      // No se ha llamado a Redsys: se puede dar por no hecha con seguridad
      await resolver(service, id, {
        estado: "rechazada",
        dsResponse: null,
        auth: null,
        errorCode: "CAMBERAS_TPV",
        respuesta: { fuc, motivo: "Comercio del cobro desconocido o sin clave" },
      }, user.id);
      return json({ ok: false, estado: "rechazada", error_code: "CAMBERAS_TPV" }, 422);
    }

    // ── Petición a Redsys ────────────────────────────────────────────────
    const parametros = merchantParamsB64({
      DS_MERCHANT_ORDER: order,
      DS_MERCHANT_MERCHANTCODE: fuc,
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_TRANSACTIONTYPE: "3",
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_AMOUNT: String(importe),
      // Vuelve en la respuesta: nuestro id de devolución
      DS_MERCHANT_MERCHANTDATA: id,
    });
    const peticion = {
      Ds_SignatureVersion: "HMAC_SHA256_V1",
      Ds_MerchantParameters: parametros,
      Ds_Signature: generateSignature(parametros, order, clave),
    };

    let resultado: Resultado;
    try {
      const res = await fetch(REDSYS_URLS[entorno].rest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(peticion),
        signal: AbortSignal.timeout(ESPERA_REDSYS_MS),
      });
      // Redsys contesta con text/plain: se lee como texto
      const texto = await res.text();
      resultado = interpretarRespuesta(
        res.status,
        texto,
        { order, importeCent: importe, fuc, terminal },
        (p, o) => generateSignature(p, o, clave!),
        decodificarParametros,
      );
    } catch (e) {
      // Sin respuesta (tiempo agotado, red): pudo salir o no
      resultado = {
        estado: "dudosa",
        dsResponse: null,
        auth: null,
        errorCode: "CAMBERAS_SIN_RESPUESTA",
        respuesta: { error: e instanceof Error ? e.message : String(e) },
      };
    }

    const apuntada = await resolver(service, id, { ...resultado, respuesta: { ...resultado.respuesta, entorno } }, user.id);
    if (!apuntada) {
      // La fila sigue 'pendiente' y a los 10 minutos pasa a 'dudosa'
      resultado = { ...resultado, estado: "dudosa", errorCode: "CAMBERAS_NO_APUNTADA" };
    } else if (resultado.estado === "hecha") {
      await avisarSiToca(service, id);
    }

    console.log(
      `redsys-devolucion: pedido ${order} ${euros(importe)} → ${resultado.estado} ` +
        `(${resultado.dsResponse ?? resultado.errorCode ?? "-"}) por ${user.email ?? user.id}`,
    );

    return json({
      ok: resultado.estado === "hecha",
      estado: resultado.estado,
      importe_cent: importe,
      ds_response: resultado.dsResponse,
      error_code: resultado.errorCode,
    });
  } catch (e) {
    console.error("redsys-devolucion:", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

/** Apunta el resultado; false si no se pudo (la fila se queda 'pendiente') */
// deno-lint-ignore no-explicit-any
async function resolver(service: any, id: string, r: Resultado, usuario: string): Promise<boolean> {
  const { data, error } = await service.rpc("devolucion_resolver", {
    p_id: id,
    p_estado: r.estado,
    p_ds_response: r.dsResponse,
    p_auth: r.auth,
    p_error_code: r.errorCode,
    p_respuesta: r.respuesta,
    p_usuario: usuario,
  });
  if (error || !data?.ok) {
    // La fila se queda 'pendiente' y a los 10 minutos pasa a 'dudosa': nadie
    // puede pedir otra devolución de ese cobro sin mirarlo antes
    console.error(`redsys-devolucion: no se pudo apuntar ${id} como ${r.estado}:`, error?.message ?? data?.motivo);
    return false;
  }
  return true;
}

// Aviso al corredor si la devolución lo pide y aún no se ha mandado
// deno-lint-ignore no-explicit-any
async function avisarSiToca(service: any, id: string) {
  try {
    const { data: d } = await service
      .from("devoluciones")
      .select("id, importe_cent, cancelar, notificar, estado, aviso_enviado_at, registration_id")
      .eq("id", id)
      .single();
    if (!d || d.estado !== "hecha" || !d.notificar || d.aviso_enviado_at || !d.registration_id) return;

    // Con el dorsal cedido, la inscripción ya es de otra persona y el dinero
    // vuelve a la tarjeta de quien pagó: no se le escribe al titular actual
    const { count: cesiones } = await service
      .from("cesiones_dorsal")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", d.registration_id)
      .eq("estado", "completada");
    if ((cesiones ?? 0) > 0) return;

    const { data: reg } = await service
      .from("registrations")
      .select("first_name, email, user_id, races(name)")
      .eq("id", d.registration_id)
      .single();
    if (!reg) return;

    let email: string | null = (reg.email ?? "").trim() || null;
    let nombre: string = (reg.first_name ?? "").trim();
    if ((!email || !nombre) && reg.user_id) {
      const { data: perfil } = await service
        .from("profiles")
        .select("email, first_name")
        .eq("id", reg.user_id)
        .maybeSingle();
      email = email ?? ((perfil?.email ?? "").trim() || null);
      nombre = nombre || (perfil?.first_name ?? "").trim();
      if (!email) {
        const { data: u } = await service.auth.admin.getUserById(reg.user_id);
        email = u?.user?.email ?? null;
      }
    }
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!email || !resendKey) return;

    const carrera: string = reg.races?.name ?? "la carrera";
    const html = correoDevolucion(nombre, carrera, d.importe_cent, d.cancelar);
    // Con tiempo límite: el aviso no puede retener la respuesta al panel
    const { error } = await Promise.race([
      new Resend(resendKey).emails.send({
        from: "Camberas <noreply@camberas.com>",
        to: [email],
        subject: `Te hemos devuelto ${euros(d.importe_cent)} · ${carrera}`,
        html,
      }),
      new Promise<{ error: { message: string } }>((r) =>
        setTimeout(() => r({ error: { message: "Resend no contestó en 10 s" } }), 10_000)
      ),
    ]);
    if (error) {
      console.error(`redsys-devolucion: aviso de ${id} no enviado:`, (error as { message?: string }).message ?? error);
      return;
    }
    await service.from("devoluciones").update({ aviso_enviado_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    // El aviso no puede tumbar una devolución que ya salió
    console.error(`redsys-devolucion: aviso de ${id}:`, e);
  }
}

function correoDevolucion(nombre: string, carrera: string, importeCent: number, anulada: boolean): string {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : "Hola:";
  const anulacion = anulada
    ? `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
         Tu inscripción en <strong>${esc(carrera)}</strong> queda anulada.
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
      <h2 style="color: ${TINTA}; margin: 0 0 16px; font-size: 24px;">Te hemos hecho una devolución</h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 14px;">${saludo}</p>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
        Hemos ordenado la devolución de tu pago de <strong>${esc(carrera)}</strong>.
      </p>
      <div style="background: ${CREMA}; border-radius: 10px; padding: 16px 20px; margin: 0 0 18px; text-align: center;">
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">Importe devuelto</p>
        <p style="color: ${VERDE}; font-size: 26px; font-weight: bold; margin: 0;">${euros(importeCent)}</p>
      </div>
      ${anulacion}
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
        El dinero vuelve a la misma tarjeta con la que pagaste. Según tu banco, puede tardar
        unos días en aparecer en tu cuenta.
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 18px 0 0;">
        Si tienes cualquier duda, escribe a la organización de la carrera.
      </p>
    </div>
    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Inscripción gestionada con <strong>camberas.com</strong>
      </p>
    </div>
  </div>`;
}
