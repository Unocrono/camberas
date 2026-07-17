import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Redsys response codes
const RESPONSE_CODES: Record<string, string> = {
  "0000": "Transacción autorizada",
  "0001": "Transacción autorizada previa identificación",
  "0099": "Operación completada",
  "0900": "Transacción autorizada (devolución/anulación)",
  "0101": "Tarjeta caducada",
  "0102": "Tarjeta bloqueada",
  "0104": "Operación no permitida",
  "0116": "Disponible insuficiente",
  "0118": "Tarjeta no registrada",
  "0180": "Tarjeta no válida",
  "0184": "Error autenticación titular",
  "0190": "Denegación sin motivo",
  "0191": "Fecha caducidad errónea",
  "9915": "Cancelada por el usuario",
};

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  // Decodificar como UTF-8 (atob devuelve Latin-1 y rompe ñ/acentos)
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// Misma derivación que redsys-init-payment: clave de operación = 3DES(order, clave
// comercio), firma = HMAC-SHA256(params, clave operación). Redsys envía la firma
// de la notificación en base64url.
function computeSignature(merchantParamsB64: string, orderNumber: string, secretKey: string): string {
  const key = CryptoJS.enc.Base64.parse(secretKey);
  const iv = CryptoJS.enc.Hex.parse("0000000000000000");
  const derivedKey = CryptoJS.TripleDES.encrypt(orderNumber, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  }).ciphertext;
  const hmac = CryptoJS.HmacSHA256(merchantParamsB64, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

// Normaliza base64/base64url sin padding para comparar firmas
function normalizeB64(sig: string): string {
  return sig.replace(/-/g, '+').replace(/_/g, '/').replace(/=/g, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SECRET_KEY) {
      throw new Error("Credentials not configured");
    }

    // Parse the webhook payload (Redsys envía form-urlencoded)
    const formData = await req.formData();
    const merchantParamsB64 = formData.get("Ds_MerchantParameters") as string;
    const signature = formData.get("Ds_Signature") as string;

    if (!merchantParamsB64 || !signature) {
      console.error("Missing Ds_MerchantParameters or Ds_Signature");
      return new Response("OK", { status: 200 });
    }

    // Decode merchant parameters
    const merchantParamsJson = base64UrlDecode(merchantParamsB64);
    const merchantParams = JSON.parse(merchantParamsJson);

    const orderNumber = merchantParams.Ds_Order;
    const responseCode = merchantParams.Ds_Response;
    const authCode = merchantParams.Ds_AuthorisationCode;

    // Verificar la firma — rechazar notificaciones no autenticadas
    const expected = computeSignature(merchantParamsB64, orderNumber, SECRET_KEY);
    if (normalizeB64(expected) !== normalizeB64(signature)) {
      console.error(`Invalid signature for order ${orderNumber} — notification rejected`);
      return new Response("OK", { status: 200 });
    }

    // Determine if payment was successful (codes 0000-0099 are success)
    const responseNum = parseInt(responseCode);
    const isSuccess = responseNum >= 0 && responseNum <= 99;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find payment intent
    const { data: paymentIntent, error: fetchError } = await supabase
      .from("payment_intents")
      .select("*, registrations(*)")
      .eq("order_number", orderNumber)
      .single();

    if (fetchError || !paymentIntent) {
      console.error("Payment intent not found:", orderNumber, fetchError?.message);
      return new Response("OK", { status: 200 });
    }

    // Update payment intent status
    const { error: intentError } = await supabase
      .from("payment_intents")
      .update({
        status: isSuccess ? "completed" : "failed",
        response_code: responseCode,
        auth_code: authCode,
        response_message: RESPONSE_CODES[responseCode] || "Unknown",
        completed_at: new Date().toISOString(),
      })
      .eq("order_number", orderNumber);

    if (intentError) {
      console.error("Error updating payment intent:", intentError.message);
    }

    // If successful, confirm the registration
    if (isSuccess && paymentIntent.registration_id) {
      // Asignar dorsal AHORA que el pago está confirmado (las inscripciones
      // de pago se crean sin dorsal para no quemar números con impagos)
      const regData = paymentIntent.registrations;
      let assignedBib: number | null = regData?.bib_number ?? null;
      if (assignedBib == null && regData?.race_distance_id) {
        const { data: newBib, error: bibErr } = await supabase
          .rpc("assign_next_bib", { p_distance_id: regData.race_distance_id });
        if (bibErr) {
          console.error("assign_next_bib error:", bibErr.message);
        } else {
          assignedBib = newBib ?? null;
        }
      }

      const { error: regError } = await supabase
        .from("registrations")
        .update({
          status: "confirmed",
          payment_status: "paid",
          ...(assignedBib != null && regData?.bib_number == null
            ? { bib_number: assignedBib }
            : {}),
        })
        .eq("id", paymentIntent.registration_id);

      if (regError) {
        console.error("Error updating registration:", regError.message);
      }

      // Send payment confirmation email with real race/distance names,
      // full form responses, and a copy to the race organizer
      try {
        const registration = paymentIntent.registrations;
        if (registration) {
          const [{ data: race }, { data: distance }, { data: responses }] = await Promise.all([
            supabase.from("races").select("name, organizer_email, organizer_id").eq("id", registration.race_id).single(),
            supabase.from("race_distances").select("name").eq("id", registration.race_distance_id).single(),
            supabase
              .from("registration_responses")
              .select("field_value, registration_form_fields(field_label, field_order)")
              .eq("registration_id", paymentIntent.registration_id),
          ]);

          // Email del organizador: organizer_email de la carrera como override,
          // si no, el email del perfil del usuario organizador
          let organizerEmail: string | null = race?.organizer_email ?? null;
          if (!organizerEmail && race?.organizer_id) {
            const { data: organizerProfile } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", race.organizer_id)
              .single();
            organizerEmail = organizerProfile?.email ?? null;
          }

          const formData = (responses ?? [])
            .map((r: any) => ({
              label: r.registration_form_fields?.field_label ?? "",
              value: r.field_value ?? "",
              order: r.registration_form_fields?.field_order ?? 999,
            }))
            .filter((f: any) => f.label && f.value)
            .sort((a: any, b: any) => a.order - b.order)
            .map(({ label, value }: any) => ({ label, value }));

          await fetch(`${SUPABASE_URL}/functions/v1/send-payment-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              email: registration.email,
              firstName: registration.first_name,
              lastName: registration.last_name,
              raceName: race?.name ?? "Carrera",
              distanceName: distance?.name ?? "",
              amount: paymentIntent.amount,
              orderNumber: orderNumber,
              bibNumber: assignedBib ?? registration.bib_number,
              formData,
              organizerEmail,
            }),
          });
        }
      } catch (emailError) {
        console.error("Error sending confirmation email:", emailError);
      }
    }

    console.log(`Payment ${orderNumber}: ${isSuccess ? 'SUCCESS' : 'FAILED'} - Code: ${responseCode}`);

    return new Response("OK", {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 });
  }
});
