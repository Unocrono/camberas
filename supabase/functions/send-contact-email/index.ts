import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactEmailRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, message }: ContactEmailRequest = await req.json();

    console.log("Processing contact form:", { name, email, subject });

    // Enviar email al equipo de Camberas
    const emailToSupport = await resend.emails.send({
      from: "Camberas Contact <onboarding@resend.dev>",
      to: ["soporte@camberas.com"], // Cambiar por email real
      reply_to: email,
      subject: `[Contacto Web] ${subject}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>De:</strong> ${name} (${email})</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <hr>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
    });

    // Enviar confirmación al usuario
    const confirmationEmail = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: [email],
      subject: "Hemos recibido tu mensaje - Camberas",
      html: `
        <h1>¡Gracias por contactarnos, ${name}!</h1>
        <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
        <hr>
        <p><strong>Tu mensaje:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p>Saludos,<br><strong>El equipo de Camberas</strong></p>
      `,
    });

    console.log("Emails sent successfully:", { emailToSupport, confirmationEmail });

    return new Response(
      JSON.stringify({ success: true, message: "Email enviado correctamente" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
