import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return atob(base64);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // Parse the webhook payload
    const formData = await req.formData();
    const merchantParamsB64 = formData.get("Ds_MerchantParameters") as string;
    const signature = formData.get("Ds_Signature") as string;
    const signatureVersion = formData.get("Ds_SignatureVersion") as string;

    if (!merchantParamsB64) {
      // Try JSON body
      const body = await req.json();
      if (!body.Ds_MerchantParameters) {
        throw new Error("Missing merchant parameters");
      }
    }

    // Decode merchant parameters
    const merchantParamsJson = base64UrlDecode(merchantParamsB64);
    const merchantParams = JSON.parse(merchantParamsJson);

    const orderNumber = merchantParams.Ds_Order;
    const responseCode = merchantParams.Ds_Response;
    const authCode = merchantParams.Ds_AuthorisationCode;
    const amount = parseInt(merchantParams.Ds_Amount) / 100;

    // Determine if payment was successful (codes 0000-0099 are success)
    const responseNum = parseInt(responseCode);
    const isSuccess = responseNum >= 0 && responseNum <= 99;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update payment intent
    const { data: paymentIntent, error: fetchError } = await supabase
      .from("payment_intents")
      .select("*, registrations(*)")
      .eq("order_number", orderNumber)
      .single();

    if (fetchError || !paymentIntent) {
      console.error("Payment intent not found:", orderNumber);
      return new Response("OK", { status: 200 });
    }

    // Update payment intent status
    await supabase
      .from("payment_intents")
      .update({
        status: isSuccess ? "completed" : "failed",
        response_code: responseCode,
        auth_code: authCode,
        response_message: RESPONSE_CODES[responseCode] || "Unknown",
        completed_at: new Date().toISOString(),
      })
      .eq("order_number", orderNumber);

    // If successful, update registration payment status
    if (isSuccess && paymentIntent.registration_id) {
      await supabase
        .from("registrations")
        .update({
          payment_status: "paid",
          payment_method: "card",
          payment_date: new Date().toISOString(),
        })
        .eq("id", paymentIntent.registration_id);

      // Send payment confirmation email
      try {
        const registration = paymentIntent.registrations;
        if (registration) {
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
              raceName: "Carrera", // Would need to join with race table
              distanceName: "Distancia",
              amount: amount,
              orderNumber: orderNumber,
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
