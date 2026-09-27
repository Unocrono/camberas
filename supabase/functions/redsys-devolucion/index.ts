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
//
// DESPLIEGUE, en este orden:
//  1. Aplicar 20260926200000_devoluciones_ajustes.sql. Sus secciones 5 y 6
//     frenan en la BD al redsys-webhook anterior a 87db6a9: ese webhook trata
//     el aviso de una devolución (tipo 3, Ds_Response 0900) como un cobro
//     fallido y pasaba el cobro original a 'failed'; y con un aviso de éxito
//     repetido volvía a dar por pagada una inscripción devuelta.
//  2. Desplegar redsys-webhook de main (87db6a9 o posterior), antes que esta
//     función o a la vez. La BD evita el daño en los datos, pero el webhook
//     viejo aún mandaría el correo de pago confirmado de una devuelta.
//  3. Desplegar esta función.
//  4. En la prueba de 1 €: en los logs de redsys-webhook tiene que salir
//     «Aviso de operación tipo 3 (0900) del pedido …: no toca el cobro», y el
//     payment_intent seguir 'completed'/0000 con el mismo completed_at y
//     auth_code (consulta al final de la migración de ajustes). Si sale
//     «Error updating payment intent: El cobro … ya está completado», el
//     webhook desplegado es el viejo.
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
import { euros } from "../_shared/emailCamberas.ts";
import { correoCorredor, correoOrganizador } from "./plantilla.ts";

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


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 1.174,50 € a partir de céntimos (para el log) */
const eurosCent = (cent: number) => euros(cent / 100);

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
        .select("estado, created_at, ds_response")
        .eq("id", body.id)
        .maybeSingle();
      if (!actual) return json({ error: "No existe esa devolución" }, 404);
      // Redsys ya contestó 0900 firmado (devolución aceptada) aunque algo no
      // cuadrara: darla por no hecha liberaría el tope y permitiría devolver dos veces
      if (body.estado === "rechazada" && actual.ds_response === "0900") {
        return json({ error: "Redsys contestó que la devolución estaba aceptada (0900)", motivo: "redsys_dijo_0900" }, 409);
      }
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

    const aApuntar: Resultado = { ...resultado, respuesta: { ...resultado.respuesta, entorno } };
    let apuntada = await resolver(service, id, aApuntar, user.id);
    // Plan B con una respuesta clara de Redsys (hecha o rechazada) que no se
    // pudo apuntar: dejarla al menos 'dudosa' CON lo que contestó Redsys. Así
    // el 0900 no se pierde (impide darla por no hecha) y el admin puede
    // marcarla ya, sin esperar a que la 'pendiente' caduque a los 10 minutos
    if (!apuntada && resultado.estado !== "dudosa") {
      apuntada = (await apuntarComoDudosa(service, id, aApuntar, user.id)) === "original";
    }
    if (!apuntada) {
      // La fila queda 'dudosa' (plan B) o, si ni eso, 'pendiente' (a los 10
      // minutos pasa a 'sin confirmar')
      resultado = { ...resultado, estado: "dudosa", errorCode: "CAMBERAS_NO_APUNTADA" };
    } else if (resultado.estado === "hecha") {
      await avisarSiToca(service, id);
    }

    console.log(
      `redsys-devolucion: pedido ${order} ${eurosCent(importe)} → ${resultado.estado} ` +
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

/**
 * Apunta el resultado; false si no se pudo (la fila se queda 'pendiente').
 * Con Redsys ya contestado, perder el apunte por un corte de la BD deja la
 * devolución sin confirmar: se reintenta un par de veces. Si un intento
 * anterior sí se guardó (y se perdió su respuesta), devolucion_resolver
 * contesta 'ya_resuelta' con el mismo estado, y eso cuenta como apuntada.
 */
// deno-lint-ignore no-explicit-any
async function resolver(service: any, id: string, r: Resultado, usuario: string): Promise<boolean> {
  const esperas = [0, 500, 2000];
  let ultimo = "";
  for (const espera of esperas) {
    if (espera) await new Promise((ok) => setTimeout(ok, espera));
    try {
      const { data, error } = await service.rpc("devolucion_resolver", {
        p_id: id,
        p_estado: r.estado,
        p_ds_response: r.dsResponse,
        p_auth: r.auth,
        p_error_code: r.errorCode,
        p_respuesta: r.respuesta,
        p_usuario: usuario,
      });
      if (!error && data?.ok) return true;
      if (!error && data?.motivo === "ya_resuelta" && data?.estado === r.estado) return true;
      // Una respuesta clara de la BD (no_existe, ya resuelta con otro estado) no
      // cambia por reintentar
      if (!error) {
        ultimo = String(data?.motivo ?? "sin motivo");
        break;
      }
      ultimo = error.message;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
  }
  // La fila se queda 'pendiente' (y el que llama intenta dejarla 'dudosa'):
  // nadie puede pedir otra devolución de ese cobro sin mirarlo antes
  console.error(
    `redsys-devolucion: no se pudo apuntar ${id} como ${r.estado} ` +
      `(Redsys: ${r.dsResponse ?? r.errorCode ?? "-"}):`,
    ultimo,
  );
  return false;
}

/**
 * Último recurso cuando no se pudo apuntar la respuesta clara de Redsys: la
 * deja 'dudosa' con su Ds_Response y CAMBERAS_NO_APUNTADA. Solo toca la
 * fila de devoluciones (no la inscripción), así que no depende de lo que
 * pudiera fallar al anularla.
 *  · 'dudosa':   guardada como dudosa.
 *  · 'original': el apunte original SÍ se guardó (se perdió su respuesta).
 *  · null:       tampoco; la fila sigue 'pendiente'.
 */
// deno-lint-ignore no-explicit-any
async function apuntarComoDudosa(service: any, id: string, r: Resultado, usuario: string): Promise<"dudosa" | "original" | null> {
  try {
    const { data, error } = await service.rpc("devolucion_resolver", {
      p_id: id,
      p_estado: "dudosa",
      p_ds_response: r.dsResponse,
      p_auth: r.auth,
      p_error_code: "CAMBERAS_NO_APUNTADA",
      p_respuesta: { ...r.respuesta, no_apuntada: { estado: r.estado, error_code: r.errorCode } },
      p_usuario: usuario,
    });
    if (!error && data?.ok) {
      console.error(`redsys-devolucion: ${id} queda 'dudosa' (Redsys: ${r.dsResponse ?? r.errorCode ?? "-"}, no se pudo apuntar como ${r.estado})`);
      return "dudosa";
    }
    if (!error && data?.motivo === "ya_resuelta" && data?.estado === r.estado) return "original";
    console.error(`redsys-devolucion: tampoco se pudo dejar ${id} como dudosa:`, error?.message ?? data?.motivo);
  } catch (e) {
    console.error(`redsys-devolucion: tampoco se pudo dejar ${id} como dudosa:`, e);
  }
  return null;
}

// Aviso por email si la devolución lo pide y aún no se ha mandado: al
// corredor y, como con cada inscripción pagada, copia a la organización
// deno-lint-ignore no-explicit-any
async function avisarSiToca(service: any, id: string) {
  try {
    const { data: d } = await service
      .from("devoluciones")
      .select("id, importe_cent, cancelar, notificar, estado, aviso_enviado_at, registration_id, order_number, motivo, origen")
      .eq("id", id)
      .single();
    if (!d || d.estado !== "hecha" || !d.notificar || d.aviso_enviado_at || !d.registration_id) return;

    const { data: reg } = await service
      .from("registrations")
      .select("first_name, last_name, email, user_id, bib_number, races(name, organizer_email, organizer_id), race_distances(name)")
      .eq("id", d.registration_id)
      .single();
    if (!reg) return;

    // Con el dorsal cedido, la inscripción ya es de otra persona y el dinero
    // vuelve a la tarjeta de quien pagó: no se le escribe al titular actual
    const { count: cesiones } = await service
      .from("cesiones_dorsal")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", d.registration_id)
      .eq("estado", "completada");
    const cedida = (cesiones ?? 0) > 0;

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
    if (!resendKey) return;

    // Email de la organización: organizer_email de la carrera como override,
    // si no, el del perfil del organizador (mismo criterio que redsys-webhook)
    let organizadorEmail: string | null = (reg.races?.organizer_email ?? "").trim() || null;
    if (!organizadorEmail && reg.races?.organizer_id) {
      const { data: perfilOrg } = await service
        .from("profiles")
        .select("email")
        .eq("id", reg.races.organizer_id)
        .maybeSingle();
      organizadorEmail = (perfilOrg?.email ?? "").trim() || null;
    }

    const datos = {
      nombre,
      apellidos: (reg.last_name ?? "").trim() || null,
      email,
      carrera: reg.races?.name ?? "la carrera",
      recorrido: reg.race_distances?.name ?? null,
      dorsal: reg.bib_number ?? null,
      importeCent: d.importe_cent,
      anulada: !!d.cancelar,
      orderNumber: d.order_number ?? null,
      motivo: d.motivo ?? null,
      origen: d.origen === "externa" ? "externa" as const : "redsys" as const,
      cedida,
    };

    const resend = new Resend(resendKey);
    // Con tiempo límite: el aviso no puede retener la respuesta al panel
    const enviar = (to: string, asunto: string, html: string) =>
      Promise.race([
        resend.emails.send({ from: "Camberas <noreply@camberas.com>", to: [to], subject: asunto, html }),
        new Promise<{ error: { message: string } }>((r) =>
          setTimeout(() => r({ error: { message: "Resend no contestó en 10 s" } }), 10_000)
        ),
      ]);

    let alCorredor = false;
    if (email && !cedida) {
      const correo = correoCorredor(datos);
      const { error } = await enviar(email, correo.asunto, correo.html);
      if (error) {
        console.error(`redsys-devolucion: aviso de ${id} no enviado:`, (error as { message?: string }).message ?? error);
      } else {
        alCorredor = true;
      }
    }

    // La copia interna no depende de que el corredor tenga email ni de que
    // saliera su aviso; su fallo solo se apunta en el log
    if (organizadorEmail) {
      const copia = correoOrganizador(datos);
      const { error } = await enviar(organizadorEmail, copia.asunto, copia.html);
      if (error) {
        console.error(`redsys-devolucion: copia a la organización de ${id} no enviada:`, (error as { message?: string }).message ?? error);
      }
    }

    // aviso_enviado_at es lo que el panel enseña como «Email enviado»: solo
    // cuando el aviso al corredor salió de verdad
    if (alCorredor) {
      await service.from("devoluciones").update({ aviso_enviado_at: new Date().toISOString() }).eq("id", id);
    }
  } catch (e) {
    // El aviso no puede tumbar una devolución que ya salió
    console.error(`redsys-devolucion: aviso de ${id}:`, e);
  }
}

