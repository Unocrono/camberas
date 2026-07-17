import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Redsys configuration
const REDSYS_URL_TEST = "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST";
const REDSYS_URL_PROD = "https://sis.redsys.es/sis/rest/trataPeticionREST";
const REDSYS_INSITE_URL_TEST = "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js";
const REDSYS_INSITE_URL_PROD = "https://sis.redsys.es/sis/NC/redsysV3.js";

// Firma Redsys HMAC_SHA256_V1:
// 1. Derivar clave de operación cifrando el nº de pedido con 3DES-CBC
//    (clave = secreto del comercio en base64, IV = ceros, padding = ceros)
// 2. HMAC-SHA256 de Ds_MerchantParameters con la clave derivada
// 3. Codificar en Base64 estándar
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

  try {
    const MERCHANT_CODE = Deno.env.get("REDSYS_MERCHANT_CODE");
    const TERMINAL = Deno.env.get("REDSYS_TERMINAL");
    const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!MERCHANT_CODE || !TERMINAL || !SECRET_KEY) {
      throw new Error("Redsys credentials not configured");
    }

    const { 
      registrationId, 
      description, 
      userEmail,
      isTest = true 
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
      .select("id, race_distance_id")
      .eq("id", registrationId)
      .single();
    if (regErr || !registration) {
      return new Response(
        JSON.stringify({ error: "Registration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const supplement = (respRows ?? []).reduce(
      (sum: number, r: any) => sum + fieldFee(r.registration_form_fields, r.field_value),
      0
    );

    const totalPrice = Math.max(0, Math.round(((resolvedPrice ?? 0) + supplement) * 100) / 100);
    if (!(totalPrice > 0)) {
      return new Response(
        JSON.stringify({ error: "No price configured for this distance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const amount = totalPrice;

    // Generate unique order number (12 digits max)
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    const orderNumber = timestamp + random;

    // Amount in cents (Redsys requires amount * 100)
    const amountCents = Math.round(amount * 100).toString();

    // Build merchant parameters
    const merchantParams = {
      DS_MERCHANT_AMOUNT: amountCents,
      DS_MERCHANT_ORDER: orderNumber,
      DS_MERCHANT_MERCHANTCODE: MERCHANT_CODE,
      DS_MERCHANT_CURRENCY: "978", // EUR
      DS_MERCHANT_TRANSACTIONTYPE: "0", // Authorization
      DS_MERCHANT_TERMINAL: TERMINAL,
      DS_MERCHANT_MERCHANTURL: `${SUPABASE_URL}/functions/v1/redsys-webhook`,
      DS_MERCHANT_URLOK: `${req.headers.get("origin")}/dashboard?payment=success`,
      DS_MERCHANT_URLKO: `${req.headers.get("origin")}/dashboard?payment=error`,
      DS_MERCHANT_PRODUCTDESCRIPTION: description || "Inscripción carrera",
      DS_MERCHANT_TITULAR: userEmail || "",
      DS_MERCHANT_PAYMETHODS: "C", // Card only
    };

    // Encode merchant params to base64 en UTF-8 — btoa() a secas es Latin-1
    // y rompe ñ/acentos en la descripción del producto (se ve "Pe�a" en Redsys)
    const merchantParamsJson = JSON.stringify(merchantParams);
    const utf8Bytes = new TextEncoder().encode(merchantParamsJson);
    let binary = "";
    for (const b of utf8Bytes) binary += String.fromCharCode(b);
    const merchantParamsB64 = btoa(binary);

    // Generate signature
    const signature = await generateSignature(merchantParamsB64, orderNumber, SECRET_KEY);

    // Store payment intent — con service role (operación de servidor, no
    // sujeta a RLS). Si no se puede registrar el intent, NO se inicia el
    // pago: el webhook nunca podría confirmarlo y el cobro quedaría huérfano.
    const { error: insertError } = await supabaseAuth
      .from("payment_intents")
      .insert({
        order_number: orderNumber,
        registration_id: registrationId,
        amount: amount,
        status: "pending",
        merchant_params: merchantParams,
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
        merchantParams: merchantParamsB64,
        signature,
        signatureVersion: "HMAC_SHA256_V1",
        insiteUrl: isTest ? REDSYS_INSITE_URL_TEST : REDSYS_INSITE_URL_PROD,
        redsysUrl: isTest ? REDSYS_URL_TEST : REDSYS_URL_PROD,
        merchantCode: MERCHANT_CODE,
        terminal: TERMINAL,
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
