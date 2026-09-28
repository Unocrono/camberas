// Correo «¡Inscripción confirmada!» justo después de una inscripción GRATUITA:
// ficha de la carrera (con cuenta o como invitado) y diálogo de inscripción de
// la web de la carrera. Las de pago reciben su comprobante al pagar
// (send-payment-confirmation, desde redsys-webhook).
//
// Del navegador solo llega el id de la inscripción. Ni el email, ni el nombre,
// ni la carrera, ni el precio se aceptan del cliente. Hasta sep-2026 los
// aceptaba y, con isGuest, no comprobaba nada: con la clave pública de la web
// cualquiera mandaba desde noreply@camberas.com el texto que quisiera a quien
// quisiera (relé de spam con nuestro dominio).
//
// Solo se manda si:
//  - la inscripción es gratuita y está confirmada;
//  - se creó hace menos de 15 minutos (la web llama justo al inscribirse);
//  - no se ha mandado ya: la clave de idempotencia de Resend dura 24 h, más
//    que la ventana, así que una segunda llamada no manda otro correo.
// Destinatario: el email de la CUENTA si la inscripción tiene cuenta (el de la
// fila lo puede reescribir su dueño), o el de la inscripción si es de invitado.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { correoConfirmacionInscripcion } from "./plantilla.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pasado este plazo desde que se creó la inscripción, ya no se manda */
const VENTANA_MS = 15 * 60 * 1000;
/** El nombre va en el saludo: largo de nombre, no de párrafo */
const MAX_NOMBRE = 100;

type Motivo =
  | "no_existe"
  | "fuera_de_plazo"
  | "no_es_gratuita_confirmada"
  | "sin_email"
  | "ya_enviado";

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
    let body: { registrationId?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Cuerpo de la petición no válido" }, 400);
    }
    const id = typeof body.registrationId === "string" ? body.registrationId.trim() : "";
    if (!UUID.test(id)) return json({ error: "Falta el id de la inscripción" }, 400);

    // No es un error: la web no espera nada de vuelta y no hay que dar pistas
    const omitir = (motivo: Motivo) => {
      console.log(`send-registration-confirmation: ${id} no se manda (${motivo})`);
      return json({ enviado: false, motivo });
    };

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: r, error: errReg } = await service
      .from("registrations")
      .select("id, user_id, race_id, race_distance_id, email, first_name, last_name, status, payment_status, created_at")
      .eq("id", id)
      .maybeSingle();
    if (errReg) throw new Error(`registrations: ${errReg.message}`);
    if (!r) return omitir("no_existe");
    if (!(Date.now() - Date.parse(r.created_at) < VENTANA_MS)) return omitir("fuera_de_plazo");
    if (r.status !== "confirmed" || r.payment_status !== "not_required") return omitir("no_es_gratuita_confirmada");

    let email = "";
    if (r.user_id) {
      const { data: cuenta } = await service.auth.admin.getUserById(r.user_id);
      email = cuenta?.user?.email ?? "";
    } else {
      email = r.email ?? "";
    }
    email = email.trim().toLowerCase();
    if (!EMAIL.test(email)) return omitir("sin_email");

    const [{ data: carrera, error: errCarrera }, { data: recorrido, error: errRecorrido }] = await Promise.all([
      service.from("races").select("name, date, location").eq("id", r.race_id).maybeSingle(),
      service.from("race_distances").select("name").eq("id", r.race_distance_id).maybeSingle(),
    ]);
    if (errCarrera) throw new Error(`races: ${errCarrera.message}`);
    if (errRecorrido) throw new Error(`race_distances: ${errRecorrido.message}`);
    if (!carrera) return omitir("no_existe");

    const nombre = [r.first_name, r.last_name]
      .map((x: string | null) => (x ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_NOMBRE);

    const correo = correoConfirmacionInscripcion({
      nombre,
      carrera: carrera.name,
      fecha: carrera.date ?? "",
      lugar: carrera.location ?? "",
      recorrido: recorrido?.name ?? "",
      precio: 0,
      invitado: !r.user_id,
    });

    // API de Resend directa: el SDK 2.0.0 no pasa la clave de idempotencia
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `confirmacion-inscripcion/${id}`,
      },
      body: JSON.stringify({
        from: "Camberas <noreply@camberas.com>",
        to: [email],
        subject: correo.asunto,
        html: correo.html,
      }),
    });
    const respuesta = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
    // 409: la misma clave con otro contenido (la inscripción cambió entre dos
    // llamadas) o una llamada anterior aún en curso. En los dos casos ya hay
    // un envío con esta clave: no se manda otro.
    if (res.status === 409) return omitir("ya_enviado");
    if (!res.ok) throw new Error(`Resend ${res.status}: ${respuesta.message ?? respuesta.name ?? "error"}`);

    console.log(`send-registration-confirmation: ${id} enviada (${respuesta.id ?? "sin id"})`);
    return json({ enviado: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("send-registration-confirmation:", msg);
    return json({ error: msg }, 500);
  }
});
