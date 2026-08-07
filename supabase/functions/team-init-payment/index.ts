import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

// Pago de EQUIPO en lote — un solo cargo Redsys del capitán que cubre N
// inscripciones (creadas antes por team-register). El importe se
// RECALCULA aquí entero (tarifa vigente + suplementos − descuento de
// equipo − cupón, por corredor): este es el importe que se firma y se
// cobra, nunca el del cliente. Un payment_intent con registration_id
// NULL + payment_intent_items enlaza el lote; redsys-webhook confirma
// todas las inscripciones al llegar el cobro.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDSYS_URL_TEST = "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST";
const REDSYS_URL_PROD = "https://sis.redsys.es/sis/rest/trataPeticionREST";
const REDSYS_INSITE_URL_TEST = "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js";
const REDSYS_INSITE_URL_PROD = "https://sis.redsys.es/sis/NC/redsysV3.js";

// Misma firma HMAC_SHA256_V1 que redsys-init-payment
function generateSignature(merchantParams: string, orderNumber: string, secretKey: string): string {
  const key = CryptoJS.enc.Base64.parse(secretKey);
  const iv = CryptoJS.enc.Hex.parse("0000000000000000");
  const derivedKey = CryptoJS.TripleDES.encrypt(orderNumber, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  }).ciphertext;
  const hmac = CryptoJS.HmacSHA256(merchantParams, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
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
    const MERCHANT_CODE = Deno.env.get("REDSYS_MERCHANT_CODE");
    const TERMINAL = Deno.env.get("REDSYS_TERMINAL");
    const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!MERCHANT_CODE || !TERMINAL || !SECRET_KEY) {
      throw new Error("Redsys credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Capitán autenticado ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Necesitas iniciar sesión" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Sesión no válida" }, 401);

    const { registrationIds, isTest = true } = await req.json();
    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      return json({ error: "registrationIds is required" }, 400);
    }

    // ── El lote: mismas carrera/distancia/equipo, pendientes, del capitán ─
    const { data: regs, error: regsErr } = await supabase
      .from("registrations")
      .select("id, race_id, race_distance_id, email, team_id, team_member_id, coupon_id")
      .in("id", registrationIds);
    if (regsErr || !regs || regs.length !== registrationIds.length) {
      return json({ error: "Alguna inscripción del lote no existe" }, 404);
    }
    const teamId = regs[0].team_id;
    const distanceId = regs[0].race_distance_id;
    const raceId = regs[0].race_id;
    if (!teamId || regs.some((r: any) => r.team_id !== teamId || r.race_distance_id !== distanceId)) {
      return json({ error: "El lote debe ser de un mismo equipo y recorrido" }, 400);
    }
    const { data: team } = await supabase
      .from("teams")
      .select("id, name, captain_user_id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team || team.captain_user_id !== user.id) {
      return json({ error: "Solo el capitán puede pagar el lote de su equipo" }, 403);
    }
    // Solo pendientes: nada de recobrar pagadas ni resucitar canceladas
    const { count: pendientes } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .in("id", registrationIds)
      .eq("status", "pending")
      .eq("payment_status", "pending");
    if ((pendientes ?? 0) !== registrationIds.length) {
      return json({ error: "El lote incluye inscripciones que no están pendientes de pago" }, 409);
    }

    const N = regs.length;

    // ── Tarifa base vigente ──────────────────────────────────────────────
    const nowIso = new Date().toISOString();
    const { data: tier } = await supabase
      .from("race_distance_prices")
      .select("price")
      .eq("race_distance_id", distanceId)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();
    let basePrice: number;
    if (tier?.price != null) {
      basePrice = Number(tier.price);
    } else {
      const { data: dist } = await supabase
        .from("race_distances")
        .select("price")
        .eq("id", distanceId)
        .single();
      basePrice = dist?.price != null ? Number(dist.price) : 0;
    }

    // ── Descuento de equipo vigente para N ───────────────────────────────
    const { data: teamTiers } = await supabase
      .from("race_team_discount_tiers")
      .select("min_members, discount_type, discount_value")
      .eq("race_id", raceId)
      .lte("min_members", N)
      .order("min_members", { ascending: false })
      .limit(1);
    const teamTier = teamTiers?.[0] ?? null;

    // ── Cupón del lote (todas las inscripciones llevan el mismo) ─────────
    const couponId = regs[0].coupon_id ?? null;
    if (regs.some((r: any) => (r.coupon_id ?? null) !== couponId)) {
      return json({ error: "El lote mezcla cupones distintos" }, 400);
    }
    let coupon: any = null;
    if (couponId) {
      const { data } = await supabase.from("coupons").select("*").eq("id", couponId).maybeSingle();
      const couponError = (msg: string) => json({ error: msg, code: "COUPON" }, 409);
      coupon = data;
      if (!coupon || !coupon.active) return couponError("El cupón de este lote ya no está activo");
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        return couponError("El cupón de este lote aún no está en vigor");
      }
      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return couponError("El cupón de este lote ha caducado");
      }
      const { data: totalUses } = await supabase.rpc("coupon_uses", { p_coupon_id: coupon.id });
      if (coupon.max_uses != null && (totalUses ?? 0) + N > coupon.max_uses) {
        return couponError("El cupón de este lote ya no tiene usos suficientes");
      }
    }

    // ── Importe por inscripción: base + suplementos − equipo − cupón ─────
    let total = 0;
    let totalDiscount = 0;
    const items: { registration_id: string; amount: number }[] = [];

    for (const r of regs) {
      // Suplementos desde las respuestas guardadas de la inscripción
      const { data: respRows } = await supabase
        .from("registration_responses")
        .select("field_value, registration_form_fields(field_name, field_type, field_options)")
        .eq("registration_id", r.id);

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
      let supplement = 0;
      let discountableSupplement = 0;
      for (const row of respRows ?? []) {
        const fee = fieldFee(row.registration_form_fields, row.field_value);
        supplement += fee;
        if (fee > 0 && (row.registration_form_fields as any)?.field_options?.discountable !== false) {
          discountableSupplement += fee;
        }
      }

      let teamDiscount = 0;
      if (teamTier) {
        const raw =
          teamTier.discount_type === "percent"
            ? (basePrice * Number(teamTier.discount_value)) / 100
            : Number(teamTier.discount_value);
        teamDiscount = Math.min(Math.max(0, Math.round(raw * 100) / 100), basePrice);
      }

      let couponDiscount = 0;
      if (coupon) {
        const reducedBase = Math.max(0, basePrice - teamDiscount);
        const discountBase = Math.max(
          0,
          coupon.applies_to === "total" ? reducedBase + discountableSupplement : reducedBase,
        );
        const raw =
          coupon.discount_type === "percent"
            ? (discountBase * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
        couponDiscount = Math.min(
          Math.max(0, Math.round(raw * 100) / 100),
          Math.round(discountBase * 100) / 100,
        );
      }

      const price = Math.max(
        0,
        Math.round((basePrice + supplement - teamDiscount - couponDiscount) * 100) / 100,
      );
      total += price;
      totalDiscount += teamDiscount + couponDiscount;
      items.push({ registration_id: r.id, amount: price });

      // Los triggers/canjes y la recaudación leen estos importes
      await supabase
        .from("registrations")
        .update({
          team_discount: teamDiscount > 0 ? teamDiscount : null,
          coupon_discount: coupon ? couponDiscount : null,
        })
        .eq("id", r.id);
    }

    total = Math.round(total * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    if (!(total > 0)) {
      return json({ error: "El lote sale gratis: no hay nada que cobrar (repite la inscripción)" }, 400);
    }

    // ── Pedido Redsys ────────────────────────────────────────────────────
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
    const orderNumber = timestamp + random;
    const amountCents = Math.round(total * 100).toString();

    const merchantParams = {
      DS_MERCHANT_AMOUNT: amountCents,
      DS_MERCHANT_ORDER: orderNumber,
      DS_MERCHANT_MERCHANTCODE: MERCHANT_CODE,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: TERMINAL,
      DS_MERCHANT_MERCHANTURL: `${SUPABASE_URL}/functions/v1/redsys-webhook`,
      DS_MERCHANT_URLOK: `${req.headers.get("origin")}/equipo?payment=success`,
      DS_MERCHANT_URLKO: `${req.headers.get("origin")}/equipo?payment=error`,
      DS_MERCHANT_PRODUCTDESCRIPTION: `Inscripción equipo ${team.name} (${N})`,
      DS_MERCHANT_TITULAR: user.email || "",
      DS_MERCHANT_PAYMETHODS: "C",
    };

    // Base64 en UTF-8 (btoa a secas rompe ñ/acentos)
    const merchantParamsJson = JSON.stringify(merchantParams);
    const utf8Bytes = new TextEncoder().encode(merchantParamsJson);
    let binary = "";
    for (const b of utf8Bytes) binary += String.fromCharCode(b);
    const merchantParamsB64 = btoa(binary);

    const signature = generateSignature(merchantParamsB64, orderNumber, SECRET_KEY);

    // Intent del lote: registration_id NULL, el detalle va en los items.
    // Si no se puede registrar, NO se inicia el pago (cobro huérfano).
    const { data: intent, error: insertError } = await supabase
      .from("payment_intents")
      .insert({
        order_number: orderNumber,
        registration_id: null,
        amount: total,
        discount_amount: totalDiscount > 0 ? totalDiscount : null,
        status: "pending",
        merchant_params: merchantParams,
      })
      .select("id")
      .single();
    if (insertError || !intent) {
      console.error("Error storing team payment intent:", insertError?.message);
      return json({ error: "No se pudo registrar el intento de pago" }, 500);
    }
    const { error: itemsError } = await supabase
      .from("payment_intent_items")
      .insert(items.map((i) => ({ ...i, payment_intent_id: intent.id })));
    if (itemsError) {
      // Sin items el webhook no sabría qué confirmar: se anula el intent
      console.error("Error storing intent items:", itemsError.message);
      await supabase.from("payment_intents").delete().eq("id", intent.id);
      return json({ error: "No se pudo registrar el detalle del lote" }, 500);
    }

    console.log(`team-init-payment: lote de ${N} (${team.name}) order=${orderNumber} total=${total}`);

    return json({
      success: true,
      orderNumber,
      amount: total,
      merchantParams: merchantParamsB64,
      signature,
      signatureVersion: "HMAC_SHA256_V1",
      insiteUrl: isTest ? REDSYS_INSITE_URL_TEST : REDSYS_INSITE_URL_PROD,
      redsysUrl: isTest ? REDSYS_URL_TEST : REDSYS_URL_PROD,
      merchantCode: MERCHANT_CODE,
      terminal: TERMINAL,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Error initializing team payment:", err);
    return json({ error: errorMessage }, 500);
  }
});
