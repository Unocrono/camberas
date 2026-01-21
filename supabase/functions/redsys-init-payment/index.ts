import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Redsys configuration
const REDSYS_URL_TEST = "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST";
const REDSYS_URL_PROD = "https://sis.redsys.es/sis/rest/trataPeticionREST";
const REDSYS_INSITE_URL_TEST = "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js";
const REDSYS_INSITE_URL_PROD = "https://sis.redsys.es/sis/NC/redsysV3.js";

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Generate Redsys signature using HMAC-SHA256
async function generateSignature(merchantParams: string, orderNumber: string, secretKey: string): Promise<string> {
  const keyBytes = base64UrlDecode(secretKey);
  
  const encoder = new TextEncoder();
  
  // Import the secret key
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // First, derive key with order number using HMAC
  const orderKey = await crypto.subtle.sign("HMAC", key, encoder.encode(orderNumber));
  
  // Then sign the merchant params with derived key
  const derivedKey = await crypto.subtle.importKey(
    "raw",
    orderKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", derivedKey, encoder.encode(merchantParams));
  
  return base64UrlEncode(new Uint8Array(signature));
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
      amount, 
      registrationId, 
      description, 
      userEmail,
      isTest = true 
    } = await req.json();

    if (!amount || !registrationId) {
      return new Response(
        JSON.stringify({ error: "Amount and registrationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Encode merchant params to base64
    const merchantParamsJson = JSON.stringify(merchantParams);
    const merchantParamsB64 = btoa(merchantParamsJson);

    // Generate signature
    const signature = await generateSignature(merchantParamsB64, orderNumber, SECRET_KEY);

    // Store payment intent in database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    
    const { error: insertError } = await supabase
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
  } catch (error) {
    console.error("Error initializing payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
