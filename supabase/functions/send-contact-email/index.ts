import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Server-side validation schema
const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters").trim(),
  email: z.string().email("Invalid email address").max(255, "Email must be less than 255 characters").trim(),
  subject: z.string().min(3, "Subject must be at least 3 characters").max(200, "Subject must be less than 200 characters").trim(),
  message: z.string().min(10, "Message must be at least 10 characters").max(5000, "Message must be less than 5000 characters").trim(),
});

type ContactEmailRequest = z.infer<typeof contactSchema>;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Server-side validation
    const parseResult = contactSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Validation failed", 
          details: parseResult.error.errors.map(e => e.message) 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { name, email, subject, message }: ContactEmailRequest = parseResult.data;

    console.log("Processing contact form:", { name, email: email.substring(0, 3) + "***", subject });

    // Enviar email al equipo de Camberas
    // Usando onboarding@resend.dev porque el dominio camberas.com no está verificado en Resend
    const emailToSupport = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: ["soporte@camberas.com"],
      reply_to: email,
      subject: `[Contacto Web] ${subject}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>De:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
        <p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>
        <hr>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    });

    // Enviar confirmación al usuario
    const confirmationEmail = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: [email],
      subject: "Hemos recibido tu mensaje - Camberas",
      html: `
        <h1>¡Gracias por contactarnos, ${escapeHtml(name)}!</h1>
        <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
        <hr>
        <p><strong>Tu mensaje:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <hr>
        <p>Saludos,<br><strong>El equipo de Camberas</strong></p>
      `,
    });

    console.log("Emails sent successfully");

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
      JSON.stringify({ error: "Error processing request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

// Helper function to escape HTML and prevent XSS in emails
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

serve(handler);
