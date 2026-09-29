// Confirma una inscripción GRATUITA hecha con cuenta desde la ficha de la
// carrera (RaceDetail). Hasta sep-2026 la confirmaba el propio navegador con
// un update de status y payment_status, y con esa misma puerta cualquiera con
// cuenta podía marcar como pagada su inscripción de una carrera de pago. Ahora
// el navegador solo crea la inscripción pendiente (la migración
// 20260929120000_inscripciones_las_confirma_el_servidor.sql no le deja más) y
// aquí se decide si es gratis.
//
// El total se recalcula como lo cobraría redsys-init-payment: precio vigente
// (tramo o base), extras de las respuestas guardadas y cupón revalidado. Solo
// si sale 0 € queda confirmada, con su dorsal (assign_next_bib).
//
// Si NO sale gratis (cambió el tramo de precio, el cupón se agotó entre
// medias…), la inscripción pasa a ser de pasarela y se devuelve 409
// NO_GRATUITA: la ficha lleva al corredor al pago, donde redsys-init-payment
// calcula el importe de verdad.

import { COLUMNAS_CAMPO, camposYValoresDeRespuestas, suplementos } from "../_shared/suplementos.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ahoraPared } from "../_shared/horaLocal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const redondear = (n: number) => Math.round(n * 100) / 100;

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
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Quién llama: solo el dueño de la inscripción, con su sesión ────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "No autenticado" }, 401);

    let body: { registrationId?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Cuerpo de la petición no válido" }, 400);
    }
    const id = typeof body.registrationId === "string" ? body.registrationId.trim() : "";
    if (!UUID.test(id)) return json({ error: "Falta el id de la inscripción" }, 400);

    const { data: r, error: errReg } = await service
      .from("registrations")
      .select("id, user_id, race_id, race_distance_id, status, payment_status, team_id, coupon_id, bib_number")
      .eq("id", id)
      .maybeSingle();
    if (errReg) throw new Error(`registrations: ${errReg.message}`);
    if (!r || r.user_id !== user.id) return json({ error: "Inscripción no encontrada" }, 404);

    // Doble clic o reintento: ya está hecha
    if (r.status === "confirmed" && r.payment_status === "not_required") {
      return json({ ok: true, bibNumber: r.bib_number ?? null });
    }
    if (r.status !== "pending" || r.payment_status !== "pending" || r.team_id) {
      return json({ error: "Esta inscripción no se puede confirmar como gratuita", code: "ESTADO" }, 409);
    }

    // ── Total, como en redsys-init-payment ─────────────────────────────────
    // Los tramos de precio son hora de pared de Madrid (+00): se comparan con
    // «ahora» en hora de pared, no en UTC
    const nowIso = ahoraPared();
    const { data: tier } = await service
      .from("race_distance_prices")
      .select("price")
      .eq("race_distance_id", r.race_distance_id)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();
    let basePrice = tier?.price != null ? Number(tier.price) : null;
    if (basePrice == null) {
      const { data: dist } = await service.from("race_distances").select("price").eq("id", r.race_distance_id).single();
      basePrice = dist?.price != null ? Number(dist.price) : 0;
    }

    // Extras desde las respuestas guardadas; todos los campos del recorrido,
    // porque una casilla sin marcar no se guarda y aun así decide si se ve un
    // campo condicional (_shared/suplementos.ts)
    const [{ data: respRows }, { data: camposRecorrido }] = await Promise.all([
      service
        .from("registration_responses")
        .select(`field_value, registration_form_fields(${COLUMNAS_CAMPO})`)
        .eq("registration_id", id),
      service.from("registration_form_fields").select(COLUMNAS_CAMPO).eq("race_distance_id", r.race_distance_id),
    ]);
    const { campos, valores } = camposYValoresDeRespuestas(camposRecorrido ?? [], respRows ?? []);
    const sup = suplementos(campos, valores);

    // Cupón anclado a la inscripción: se revalida aquí. El límite por
    // persona se mira con el email de la CUENTA, no con el de la fila
    let couponDiscount = 0;
    let cuponInvalido: string | null = null;
    if (r.coupon_id) {
      const { data: coupon } = await service.from("coupons").select("*").eq("id", r.coupon_id).maybeSingle();
      const ahora = new Date();
      const email = (user.email ?? "").trim().toLowerCase();
      if (!coupon || !coupon.active) cuponInvalido = "El cupón ya no está activo";
      else if (coupon.valid_from && ahora < new Date(coupon.valid_from)) cuponInvalido = "El cupón aún no está en vigor";
      else if (coupon.valid_until && ahora > new Date(coupon.valid_until)) cuponInvalido = "El cupón ha caducado";
      else {
        const { data: usos } = await service.rpc("coupon_uses", { p_coupon_id: coupon.id });
        if (coupon.max_uses != null && (usos ?? 0) >= coupon.max_uses) cuponInvalido = "El cupón ya ha agotado sus usos";
        else if (email && coupon.max_uses_per_email != null) {
          const { data: usosEmail } = await service.rpc("coupon_uses", { p_coupon_id: coupon.id, p_email: email });
          if ((usosEmail ?? 0) >= coupon.max_uses_per_email) cuponInvalido = "Ya has usado este cupón";
        }
      }
      if (!cuponInvalido) {
        const base = Math.max(0, coupon.applies_to === "total" ? basePrice + sup.descontable : basePrice);
        const bruto =
          coupon.discount_type === "percent" ? (base * Number(coupon.discount_value)) / 100 : Number(coupon.discount_value);
        couponDiscount = Math.min(Math.max(0, redondear(bruto)), redondear(base));
      }
    }

    const total = Math.max(0, redondear(basePrice + redondear(sup.total) - couponDiscount));

    // ── No es gratis: pasa a pago ──────────────────────────────────────────
    if (total > 0) {
      const { error: errPago } = await service
        .from("registrations")
        .update({
          source: "gateway",
          // Un cupón que ya no vale no se queda anclado: redsys-init-payment
          // lo rechazaría y el corredor no podría pagar
          ...(cuponInvalido ? { coupon_id: null, coupon_discount: null } : {}),
        })
        .eq("id", id)
        .eq("status", "pending")
        .eq("payment_status", "pending");
      if (errPago) throw new Error(`registrations: ${errPago.message}`);
      console.log(`confirmar-inscripcion-gratuita: ${id} no es gratis (${total} €${cuponInvalido ? `, ${cuponInvalido}` : ""})`);
      return json(
        {
          error: cuponInvalido
            ? `${cuponInvalido}: la inscripción tiene un importe de ${total.toFixed(2)} €`
            : `El precio ha cambiado: la inscripción tiene un importe de ${total.toFixed(2)} €`,
          code: "NO_GRATUITA",
          importe: total,
        },
        409,
      );
    }

    // ── Gratis: dorsal y confirmada ────────────────────────────────────────
    let bib: number | null = r.bib_number ?? null;
    if (bib == null) {
      const { data: siguiente, error: errBib } = await service.rpc("assign_next_bib", {
        p_distance_id: r.race_distance_id,
      });
      if (errBib) console.error("assign_next_bib:", errBib.message);
      else bib = siguiente ?? null;
    }

    const { data: hecha, error: errConf } = await service
      .from("registrations")
      .update({
        status: "confirmed",
        payment_status: "not_required",
        source: "free",
        bib_number: bib,
        // El trigger del canje de cupones usa este importe
        ...(r.coupon_id ? { coupon_discount: couponDiscount } : {}),
      })
      .eq("id", id)
      .eq("status", "pending")
      .eq("payment_status", "pending")
      .select("id, bib_number")
      .maybeSingle();
    if (errConf) throw new Error(`registrations: ${errConf.message}`);
    if (!hecha) {
      // Otra llamada se adelantó: vale si la dejó confirmada
      const { data: ahora } = await service
        .from("registrations")
        .select("status, payment_status, bib_number")
        .eq("id", id)
        .maybeSingle();
      if (ahora?.status === "confirmed" && ahora?.payment_status === "not_required") {
        return json({ ok: true, bibNumber: ahora.bib_number ?? null });
      }
      return json({ error: "Esta inscripción no se puede confirmar como gratuita", code: "ESTADO" }, 409);
    }

    console.log(`confirmar-inscripcion-gratuita: ${id} confirmada, dorsal ${hecha.bib_number ?? "sin asignar"}`);
    return json({ ok: true, bibNumber: hecha.bib_number ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("confirmar-inscripcion-gratuita:", msg);
    return json({ error: msg }, 500);
  }
});
