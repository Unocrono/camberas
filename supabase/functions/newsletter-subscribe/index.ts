import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { correoAltaSuscripcion, correoReenvioConfirmacion } from "./plantilla.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Camberas <no-reply@camberas.com>",
      to: [to],
      subject,
      html,
    }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Email error: ${error}`);
  }
  
  return res.json();
}



serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, source, segments } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if subscriber already exists
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status, confirmation_token")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (existing) {
      if (existing.status === "confirmed") {
        return new Response(
          JSON.stringify({ already_subscribed: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Resend confirmation email
      const confirmUrl = `${supabaseUrl}/functions/v1/newsletter-confirm?token=${existing.confirmation_token}`;
      const reenvio = correoReenvioConfirmacion({ confirmUrl });

      await sendEmail(email, reenvio.asunto, reenvio.html);

      return new Response(
        JSON.stringify({ success: true, resent: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new subscriber
    const { data: newSubscriber, error: insertError } = await supabase
      .from("newsletter_subscribers")
      .insert({
        email: email.toLowerCase().trim(),
        source: source || "footer",
        segments: segments || ["general"],
        status: "pending"
      })
      .select("confirmation_token")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Error creating subscription");
    }

    // Send confirmation email
    const confirmUrl = `${supabaseUrl}/functions/v1/newsletter-confirm?token=${newSubscriber.confirmation_token}`;

    try {
      const alta = correoAltaSuscripcion({ confirmUrl });
      await sendEmail(email, alta.asunto, alta.html);
    } catch (emailError: any) {
      console.error("Email error:", emailError);
      // Don't fail the request, subscription is created
    }

    console.log(`Newsletter subscription created for ${email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Newsletter subscribe error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
