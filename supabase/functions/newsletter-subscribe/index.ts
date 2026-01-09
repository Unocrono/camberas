import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      
      await sendEmail(
        email,
        "Confirma tu suscripción a Camberas",
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">¡Bienvenido a Camberas!</h1>
          <p>Confirma tu suscripción haciendo clic en el siguiente botón:</p>
          <a href="${confirmUrl}" style="display: inline-block; background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Confirmar suscripción
          </a>
          <p style="color: #666; font-size: 14px;">Si no solicitaste esta suscripción, puedes ignorar este email.</p>
        </div>`
      );

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
      await sendEmail(
        email,
        "Confirma tu suscripción a Camberas",
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">¡Bienvenido a Camberas!</h1>
          <p>Gracias por suscribirte a nuestro newsletter. Recibirás las últimas noticias sobre carreras de trail y montaña.</p>
          <p>Para confirmar tu suscripción, haz clic en el siguiente botón:</p>
          <a href="${confirmUrl}" style="display: inline-block; background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Confirmar suscripción
          </a>
          <p style="color: #666; font-size: 14px;">Si no solicitaste esta suscripción, puedes ignorar este email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">© 2025 Camberas - Tu plataforma de carreras de montaña</p>
        </div>`
      );
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
