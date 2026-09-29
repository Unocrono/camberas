import { COLUMNAS_CAMPO, camposYValoresDeRespuestas, suplementos } from "../_shared/suplementos.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ahoraPared } from "../_shared/horaLocal.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Inscripción de invitados (sin cuenta) — todo el flujo corre con service
// role en servidor: no depende de políticas RLS para anon (que las
// revisiones de seguridad tienden a eliminar) y asigna el dorsal de forma
// atómica vía assign_next_bib().

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  raceId: z.string().uuid(),
  distanceId: z.string().uuid(),
  formData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullish()),
  couponCode: z.string().trim().max(60).optional(),
});

/**
 * Texto del formulario -> gender_id de la tabla genders (1=M, 2=F, 3=X).
 * Las estadísticas del panel usan gender_id, no el texto.
 */
function genderToId(value: unknown): number | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("M")) return 1; // M / Masculino / Male
  if (v.startsWith("F")) return 2; // F / Femenino / Female
  if (v.startsWith("X")) return 3; // X / Mixto / Otro
  return null;
}

serve(async (req) => {
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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const input = requestSchema.parse(await req.json());
    const { raceId, distanceId, formData, couponCode } = input;

    // Campos de sistema extraídos del formulario dinámico
    const str = (v: unknown) => (v == null ? "" : String(v).trim());
    const firstName = str(formData.first_name);
    const lastName = str(formData.last_name);
    const email = str(formData.email).toLowerCase();
    const phone = str(formData.phone);
    const documentNumber = str(formData.document_number);
    const birthDate = str(formData.birth_date);
    const gender = str(formData.gender);

    if (!email || !firstName || !lastName) {
      return json({ error: "Faltan campos obligatorios (nombre, apellidos, email)" }, 400);
    }

    // La distancia debe pertenecer a la carrera indicada
    const { data: distance, error: distErr } = await supabase
      .from("race_distances")
      .select("id, race_id, name, price, max_participants")
      .eq("id", distanceId)
      .eq("race_id", raceId)
      .single();
    if (distErr || !distance) {
      return json({ error: "Distancia no encontrada" }, 404);
    }

    // Inscripción previa en la misma carrera. Mirar solo el email dejaba a
    // la gente encerrada: una pendiente sin pagar bloqueaba para siempre,
    // aunque la plaza llevara horas libre. La regla vive en SQL para que el
    // camino con cuenta (RaceDetail) decida exactamente lo mismo.
    const { data: previa, error: previaErr } = await supabase.rpc("resolver_inscripcion_previa", {
      p_race_id: raceId,
      p_race_distance_id: distanceId,
      p_email: email,
    });
    // Si la RPC no esta (migracion sin aplicar todavia, o funcion desplegada
    // antes que el SQL), se vuelve al control de siempre en vez de tumbar
    // TODAS las inscripciones de invitado, tambien las de quien nunca se
    // habia inscrito. Es peor comportamiento, pero es el de ayer.
    if (previaErr) {
      console.error("resolver_inscripcion_previa no disponible, se usa el control antiguo:", previaErr.message);
      const { data: existing } = await supabase
        .from("registrations")
        .select("id")
        .eq("race_id", raceId)
        .ilike("email", email)
        .neq("status", "cancelled")
        .limit(1)
        .maybeSingle();
      if (existing) {
        return json({ error: "Este email ya tiene una inscripción para esta carrera", code: "DUPLICATE" }, 409);
      }
    }

    if (previa?.verdicto === "duplicada") {
      return json({ error: "Este email ya tiene una inscripción para esta carrera", code: "DUPLICATE" }, 409);
    }

    // Empezó y no llegó a pagar el mismo recorrido: no es un duplicado, es
    // un pago sin terminar. Sin cupón se le devuelve la puerta, no el muro.
    // CON cupón, el cupón se aplica a esa inscripción a medias (y si sale a
    // 0 € queda confirmada aquí mismo): quien se inscribió sin poner el
    // código no se queda encerrado en «te falta un paso», que no tiene
    // casilla de cupón (pasó en la Peña Prieta con el cupón del 100 %).
    let pendienteId: string | null = null;
    let pendienteBib: number | null = null;
    if (previa?.verdicto === "retomar") {
      const puerta = () =>
        json(
          {
            error: "Ya empezaste esta inscripción y el pago se quedó a medias. Te llevamos a terminarlo.",
            code: "PENDIENTE",
            // Ruta relativa a propósito: vale igual en producción y en local
            retomarPath: `/retomar-pago/${previa.token}`,
          },
          409,
        );
      if (!couponCode?.trim()) return puerta();

      // La RPC devuelve el token de recuperación, no la inscripción: se
      // localiza por él y se comprueba que sigue a medias en este recorrido
      const { data: rp } = await supabase
        .from("recuperacion_pagos")
        .select("registration_id")
        .eq("token", previa.token)
        .maybeSingle();
      const { data: pend } = rp?.registration_id
        ? await supabase
            .from("registrations")
            .select("id, dni_passport, first_name, last_name, bib_number")
            .eq("id", rp.registration_id)
            .eq("race_distance_id", distanceId)
            .eq("status", "pending")
            .eq("payment_status", "pending")
            .eq("source", "gateway")
            .maybeSingle()
        : { data: null };
      if (!pend) return puerta();

      // La inscripción a medias se encuentra por el email, y el email no se
      // verifica: solo se rehace si es la MISMA persona (el documento, o sin
      // documento nombre y apellidos). Si no, la puerta de siempre, sin
      // tocar los datos de nadie.
      const normDoc = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const normNombre = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const mismaPersona = normDoc(pend.dni_passport)
        ? normDoc(pend.dni_passport) === normDoc(documentNumber)
        : normNombre(pend.first_name) === normNombre(firstName) &&
          normNombre(pend.last_name) === normNombre(lastName);
      if (!mismaPersona) return puerta();

      pendienteId = pend.id;
      pendienteBib = pend.bib_number ?? null;
    }

    // Aforo, comprobado en servidor (la UI sola no basta: se podría
    // saltar llamando directamente a la función). Ocupan plaza las de
    // pago resuelto y las pendientes recientes (reserva de 30 min
    // mientras se paga); los carritos abandonados no.
    if (distance.max_participants) {
      const holdCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let aforo = supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("race_distance_id", distanceId)
        .neq("status", "cancelled")
        .or(`payment_status.in.(paid,not_required),created_at.gte.${holdCutoff}`);
      // La inscripción a medias que se va a rehacer ya es su plaza: no cuenta dos veces
      if (pendienteId) aforo = aforo.neq("id", pendienteId);
      const { count: taken } = await aforo;
      if ((taken ?? 0) >= distance.max_participants) {
        return json({ error: "No quedan plazas disponibles en este recorrido" }, 409);
      }
    }


    // Precio vigente: tarifa por tramos si existe, si no el precio base
    // Los tramos de precio son hora de pared de Madrid (+00): se comparan con
    // «ahora» en hora de pared, no en UTC (Loiu cobraba el tramo viejo de 00:00 a 02:00)
    const nowIso = ahoraPared();
    const { data: tier } = await supabase
      .from("race_distance_prices")
      .select("price")
      .eq("race_distance_id", distanceId)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();
    const basePrice = tier?.price != null ? Number(tier.price) : (distance.price != null ? Number(distance.price) : 0);

    // Campos del formulario (también se usan luego para guardar respuestas)
    const { data: fields } = await supabase
      .from("registration_form_fields")
      .select(COLUMNAS_CAMPO)
      .eq("race_distance_id", distanceId);

    // Suplemento de los campos con importe (fee_enabled en field_options):
    //  - select/radio: fees[] paralelo a options
    //  - number: fee_amount × valor · checkbox/otros: fee_amount si se marca
    // Además del suplemento total, se separa la parte descontable por si el
    // cupón aplica sobre el total: positiva y sin discountable=false (los
    // suplementos negativos ya son un descuento y no se amplifican).
    // Solo cuentan los campos a la vista (condicionales incluidos): _shared/suplementos.ts
    const sup = suplementos(fields ?? [], formData);
    let supplement = sup.total;
    const discountableSupplement = sup.descontable;
    supplement = Math.round(supplement * 100) / 100;
    const grossPrice = Math.max(0, Math.round((basePrice + supplement) * 100) / 100);

    // Cupón: revalidación completa en servidor (el cliente ya validó con
    // validate-coupon, pero aquí se decide el precio de verdad). Si el cupón
    // ya no vale se corta con error — nunca cobrar de más en silencio.
    let couponId: string | null = null;
    let couponDiscount = 0;
    if (couponCode) {
      const code = couponCode.toUpperCase().replace(/\s/g, "");
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("race_id", raceId)
        .eq("code", code)
        .maybeSingle();

      const couponError = (msg: string) => json({ error: msg, code: "COUPON" }, 400);
      if (!coupon) return couponError("El código de descuento no existe para esta carrera");
      if (!coupon.active) return couponError("Este cupón ya no está activo");
      if (coupon.race_distance_id && coupon.race_distance_id !== distanceId) {
        return couponError("Este cupón no es válido para el recorrido elegido");
      }
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        return couponError("Este cupón aún no está en vigor");
      }
      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return couponError("Este cupón ha caducado");
      }
      if (coupon.min_amount != null && grossPrice < Number(coupon.min_amount)) {
        return couponError(`Este cupón requiere un importe mínimo de ${Number(coupon.min_amount)}€`);
      }
      const { data: totalUses } = await supabase.rpc("coupon_uses", { p_coupon_id: coupon.id });
      if (coupon.max_uses != null && (totalUses ?? 0) >= coupon.max_uses) {
        return couponError("Este cupón ya ha agotado sus usos");
      }
      const { data: emailUses } = await supabase.rpc("coupon_uses", {
        p_coupon_id: coupon.id,
        p_email: email,
      });
      if ((emailUses ?? 0) >= coupon.max_uses_per_email) {
        return couponError("Ya has usado este cupón");
      }

      // Descuento: sobre la tarifa, o sobre tarifa + suplementos descontables
      // si applies_to='total'. Redondeado a céntimos y acotado a su base.
      const discountBase = Math.max(
        0,
        coupon.applies_to === "total" ? basePrice + discountableSupplement : basePrice,
      );
      const raw =
        coupon.discount_type === "percent"
          ? (discountBase * Number(coupon.discount_value)) / 100
          : Number(coupon.discount_value);
      couponDiscount = Math.min(
        Math.max(0, Math.round(raw * 100) / 100),
        Math.round(discountBase * 100) / 100,
      );
      couponId = coupon.id;
    }

    const price = Math.max(0, Math.round((basePrice + supplement - couponDiscount) * 100) / 100);

    const isFree = !(price > 0);

    // Dorsal atómico — SOLO para inscripciones gratuitas. Las de pago lo
    // reciben en redsys-webhook al confirmarse el cobro, para no quemar
    // dorsales con inscripciones que nunca llegan a pagar.
    // (una inscripción a medias que ya tuviera dorsal lo conserva)
    let bibNumber: number | null = pendienteBib;
    if (isFree && bibNumber === null) {
      const { data, error: bibErr } = await supabase
        .rpc("assign_next_bib", { p_distance_id: distanceId });
      if (bibErr) {
        console.error("assign_next_bib error:", bibErr.message);
      } else {
        bibNumber = data ?? null;
      }
    }

    // Los mismos datos para crear la inscripción o para rehacer la que
    // estaba a medias (el corredor ha vuelto a rellenar el formulario)
    const datos = {
        status: isFree ? "confirmed" : "pending",
        payment_status: isFree ? "not_required" : "pending",
        // Origen para facturación: la de pago va por la pasarela
        source: isFree ? "free" : "gateway",
        // El canje lo registra el trigger de la tabla cuando el pago queda
        // resuelto (aquí mismo si es gratis; en el webhook si va a pasarela)
        coupon_id: couponId,
        coupon_discount: couponId ? couponDiscount : null,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        dni_passport: documentNumber,
        birth_date: birthDate || null,
        gender: gender || null,
        // gender_id es lo que usan las estadísticas (1=M, 2=F, 3=X).
        // Sin esto, el panel contaba a todo el mundo como "X".
        gender_id: genderToId(gender),
        bib_number: bibNumber ?? null,
        // Estos llegan como campos del formulario; se copian a sus columnas
        // para que el panel, los informes y los exports los vean
        tshirt_size: formData.tshirt_size ? String(formData.tshirt_size) : null,
        club: formData.club ? String(formData.club) : null,
        team: formData.team ? String(formData.team) : null,
        country: formData.country ? String(formData.country) : null,
        address: formData.address ? String(formData.address) : null,
        city: formData.city ? String(formData.city) : null,
        province: formData.province ? String(formData.province) : null,
        autonomous_community: formData.autonomous_community
          ? String(formData.autonomous_community)
          : null,
    };

    // Crear la inscripción, o aplicar el cupón a la que estaba a medias.
    // La condición de «sigue a medias» va en el UPDATE: si entretanto se
    // pagó o se anuló, no se toca y el corredor recibe un error claro.
    const { data: registration, error: regErr } = pendienteId
      ? await supabase
          .from("registrations")
          // La inscripción efectiva es la de ahora: así sale el correo de
          // confirmación (send-registration-confirmation solo envía en los 15
          // min siguientes a created_at) y, si aún hay que pagar, la reserva
          // de plaza de 30 min vuelve a empezar
          .update({ ...datos, created_at: new Date().toISOString() })
          .eq("id", pendienteId)
          .eq("status", "pending")
          .eq("payment_status", "pending")
          .select("id, bib_number")
          .single()
      : await supabase
          .from("registrations")
          .insert({ race_id: raceId, race_distance_id: distanceId, ...datos })
          .select("id, bib_number")
          .single();
    if (regErr || !registration) {
      console.error("Error creating registration:", regErr?.message);
      return json(
        { error: pendienteId ? "No se pudo aplicar el cupón a tu inscripción pendiente. Vuelve a intentarlo." : "No se pudo crear la inscripción" },
        500,
      );
    }

    // Guardar todas las respuestas del formulario. En una inscripción a
    // medias, las nuevas sustituyen a las antiguas (son las que fijan el
    // importe): primero se insertan y solo si entran se borran las viejas,
    // para que nunca se quede sin respuestas
    if (fields && fields.length > 0) {
      const responses = fields
        .filter((f) => formData[f.field_name] !== undefined && formData[f.field_name] !== "" && formData[f.field_name] !== null)
        .map((f) => ({
          registration_id: registration.id,
          field_id: f.id,
          field_value: String(formData[f.field_name]),
        }));
      const { data: nuevas, error: respErr } = responses.length > 0
        ? await supabase.from("registration_responses").insert(responses).select("id")
        : { data: [] as { id: string }[], error: null };
      if (respErr) {
        console.error("Error saving form responses:", respErr.message);
      } else if (pendienteId) {
        let viejas = supabase.from("registration_responses").delete().eq("registration_id", registration.id);
        const ids = (nuevas ?? []).map((r) => r.id);
        if (ids.length > 0) viejas = viejas.not("id", "in", `(${ids.join(",")})`);
        const { error: borrarErr } = await viejas;
        if (borrarErr) console.error("Error replacing form responses:", borrarErr.message);
      }
    }

    console.log(
      `Guest registration ${registration.id} (${email}) bib=${registration.bib_number} price=${price}` +
        (pendienteId ? " (cupón aplicado a la inscripción que estaba a medias)" : ""),
    );

    return json({
      success: true,
      registrationId: registration.id,
      bibNumber: registration.bib_number,
      price,
      discount: couponDiscount,
      isFree,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return json({ error: "Datos de inscripción inválidos", details: error.errors }, 400);
    }
    console.error("guest-register error:", error);
    return json({ error: error.message ?? "Error desconocido" }, 500);
  }
});
