import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateSignature,
  merchantParamsB64 as codificarParams,
  nuevoOrderNumber,
  resolverRetorno,
  resolverTpv,
  urlsParaCliente,
} from "../_shared/redsys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    // retorno: a dónde vuelve el corredor tras pagar.
    //  - "dashboard" (por defecto): /dashboard?payment=… en camberas.com, como siempre
    //  - "web": la página de resultado de la web de la carrera
    //    (/{slug}/inscripcion/ok|ko en camberas.com, o /inscripcion/ok|ko en su dominio)
    const {
      registrationId,
      description,
      userEmail,
      isTest = true,
      retorno = "dashboard",
    } = await req.json();

    if (!registrationId) {
      return new Response(
        JSON.stringify({ error: "registrationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve authoritative amount server-side from the registration's race_distance
    const supabaseAuth = createClient(SUPABASE_URL!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? SUPABASE_ANON_KEY!);
    const { data: registration, error: regErr } = await supabaseAuth
      .from("registrations")
      .select("id, race_distance_id, race_id, email, coupon_id, races(slug)")
      .eq("id", registrationId)
      .single();
    if (regErr || !registration) {
      return new Response(
        JSON.stringify({ error: "Registration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const raceId: string | null = registration.race_id ?? null;
    const raceSlug: string | null = (registration as any).races?.slug ?? null;

    // Comercio con el que se cobra: el del organizador si lo tiene, si no el de UNO
    const tpv = await resolverTpv(supabaseAuth, raceId);
    const vuelta = await resolverRetorno(supabaseAuth, req.headers.get("origin"), raceId, raceSlug);

    // Prefer active price tier (race_distance_prices covering now), else base price on race_distances
    const nowIso = new Date().toISOString();
    const { data: tier } = await supabaseAuth
      .from("race_distance_prices")
      .select("price, start_datetime, end_datetime")
      .eq("race_distance_id", registration.race_distance_id)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();

    let resolvedPrice: number | null = tier?.price != null ? Number(tier.price) : null;
    if (resolvedPrice == null) {
      const { data: dist } = await supabaseAuth
        .from("race_distances")
        .select("price")
        .eq("id", registration.race_distance_id)
        .single();
      resolvedPrice = dist?.price != null ? Number(dist.price) : null;
    }

    // Suplementos de los campos con importe, desde las respuestas guardadas
    // de esta inscripción (fee_enabled en field_options)
    const { data: respRows } = await supabaseAuth
      .from("registration_responses")
      .select("field_value, registration_form_fields(field_name, field_type, field_options)")
      .eq("registration_id", registrationId);

    const fieldFee = (f: any, value: unknown): number => {
      const o = f?.field_options;
      if (!o || Array.isArray(o) || o.fee_enabled !== true || value == null || value === "") return 0;
      if (Array.isArray(o.options) && Array.isArray(o.fees)) {
        const idx = o.options.indexOf(String(value));
        return idx >= 0 ? Number(o.fees[idx]) || 0 : 0;
      }
      const feeAmount = Number(o.fee_amount) || 0;
      if (f.field_type === "number") {
        const n = parseFloat(String(value));
        return isNaN(n) ? 0 : feeAmount * n;
      }
      const checked = value === true || value === "true" || value === "on" || value === "1";
      return checked ? feeAmount : 0;
    };
    // Suplemento total y su parte descontable por cupón: positiva y sin
    // discountable=false (los negativos ya son descuento, no se amplifican)
    let supplement = 0;
    let discountableSupplement = 0;
    for (const r of respRows ?? []) {
      const fee = fieldFee(r.registration_form_fields, r.field_value);
      supplement += fee;
      if (fee > 0 && (r.registration_form_fields as any)?.field_options?.discountable !== false) {
        discountableSupplement += fee;
      }
    }

    const basePrice = resolvedPrice ?? 0;

    // Cupón anclado a la inscripción al crearla — se revalida y recalcula
    // AQUÍ, porque este es el importe que se firma y se cobra en Redsys.
    // Nunca se cobra de más en silencio: si el cupón ya no vale, error.
    let couponDiscount = 0;
    if (registration.coupon_id) {
      const { data: coupon } = await supabaseAuth
        .from("coupons")
        .select("*")
        .eq("id", registration.coupon_id)
        .maybeSingle();

      const couponError = (msg: string) =>
        new Response(
          JSON.stringify({ error: msg, code: "COUPON" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      if (!coupon || !coupon.active) return couponError("El cupón de esta inscripción ya no está activo");
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        return couponError("El cupón de esta inscripción aún no está en vigor");
      }
      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return couponError("El cupón de esta inscripción ha caducado");
      }
      const { data: totalUses } = await supabaseAuth.rpc("coupon_uses", { p_coupon_id: coupon.id });
      if (coupon.max_uses != null && (totalUses ?? 0) >= coupon.max_uses) {
        return couponError("El cupón de esta inscripción ya ha agotado sus usos");
      }
      if (registration.email) {
        const { data: emailUses } = await supabaseAuth.rpc("coupon_uses", {
          p_coupon_id: coupon.id,
          p_email: registration.email,
        });
        if ((emailUses ?? 0) >= coupon.max_uses_per_email) {
          return couponError("Este email ya ha usado el cupón");
        }
      }

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

      // El trigger de registrations usará este importe al registrar el canje
      // cuando el webhook confirme el pago
      await supabaseAuth
        .from("registrations")
        .update({ coupon_discount: couponDiscount })
        .eq("id", registrationId);
    }

    const totalPrice = Math.max(0, Math.round((basePrice + supplement - couponDiscount) * 100) / 100);
    if (!(totalPrice > 0)) {
      return new Response(
        JSON.stringify({ error: "No price configured for this distance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const amount = totalPrice;

    // Generate unique order number (12 digits max)
    const orderNumber = nuevoOrderNumber();

    // Amount in cents (Redsys requires amount * 100)
    const amountCents = Math.round(amount * 100).toString();

    // URL de vuelta: derivada en servidor (nunca una URL libre del cliente)
    const urlOk = retorno === "web"
      ? `${vuelta.base}${vuelta.prefijo}/inscripcion/ok?ref=${registrationId}`
      : `${vuelta.base}/dashboard?payment=success`;
    const urlKo = retorno === "web"
      ? `${vuelta.base}${vuelta.prefijo}/inscripcion/ko?ref=${registrationId}`
      : `${vuelta.base}/dashboard?payment=error`;

    // Build merchant parameters
    const merchantParams = {
      DS_MERCHANT_AMOUNT: amountCents,
      DS_MERCHANT_ORDER: orderNumber,
      DS_MERCHANT_MERCHANTCODE: tpv.merchantCode,
      DS_MERCHANT_CURRENCY: "978", // EUR
      DS_MERCHANT_TRANSACTIONTYPE: "0", // Authorization
      DS_MERCHANT_TERMINAL: tpv.terminal,
      DS_MERCHANT_MERCHANTURL: `${SUPABASE_URL}/functions/v1/redsys-webhook`,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: urlKo,
      DS_MERCHANT_PRODUCTDESCRIPTION: description || "Inscripción carrera",
      DS_MERCHANT_TITULAR: userEmail || "",
      DS_MERCHANT_PAYMETHODS: "C", // Card only
    };

    // Base64 en UTF-8 (btoa a secas rompe ñ/acentos en la descripción)
    const merchantParamsB64 = codificarParams(merchantParams);

    // Firma con la clave del comercio que cobra
    const signature = generateSignature(merchantParamsB64, orderNumber, tpv.secretKey);

    // Store payment intent — con service role (operación de servidor, no
    // sujeta a RLS). Si no se puede registrar el intent, NO se inicia el
    // pago: el webhook nunca podría confirmarlo y el cobro quedaría huérfano.
    const { error: insertError } = await supabaseAuth
      .from("payment_intents")
      .insert({
        order_number: orderNumber,
        registration_id: registrationId,
        amount: amount,
        // Desglose para la recaudación: amount ya lleva el descuento aplicado
        discount_amount: couponDiscount > 0 ? couponDiscount : null,
        status: "pending",
        merchant_params: merchantParams,
        // Con qué comercio se firmó: el webhook verifica con esta clave
        merchant_code: tpv.merchantCode,
        secret_ref: tpv.secretRef,
      });

    if (insertError) {
      console.error("Error storing payment intent:", insertError);
      return new Response(
        JSON.stringify({ error: "No se pudo registrar el intento de pago" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber,
        // Importe autoritativo: el que se acaba de firmar. El cliente lo
        // muestra en vez del suyo, que puede venir de un precio caducado
        // (team-init-payment ya lo devolvia asi)
        amount,
        merchantParams: merchantParamsB64,
        signature,
        signatureVersion: "HMAC_SHA256_V1",
        // Entorno y URLs del comercio que cobra (con TPV propio manda su
        // entorno; con el de UNO, lo que pidió el cliente)
        ...urlsParaCliente(tpv, isTest),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Error initializing payment:", err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
