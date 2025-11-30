import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  userEmail: z.string().email().max(255),
  userName: z.string().trim().min(1).max(200),
  raceName: z.string().trim().min(1).max(200),
  raceDate: z.string().datetime(),
  distanceName: z.string().trim().min(1).max(100),
  price: z.number().nonnegative().max(100000),
  paymentStatus: z.enum(['paid', 'pending', 'cancelled']),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // Validate and parse input
    const rawInput = await req.json();
    const input = requestSchema.parse(rawInput);
    
    const { userEmail, userName, raceName, raceDate, distanceName, price, paymentStatus } = input;

    console.log("Sending cancellation confirmation to:", userEmail);

    const refundMessage = paymentStatus === 'paid' 
      ? `<div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin-top: 0; color: #92400e;">Información del Reembolso</h3>
          <p>Como ya habías pagado esta inscripción, se procesará un reembolso de <strong>${price.toFixed(2)}€</strong> en un plazo de 5-7 días hábiles.</p>
          <p>El reembolso se abonará en el método de pago original.</p>
        </div>`
      : `<p style="color: #059669;">No se realizó ningún pago por esta inscripción, por lo que no es necesario ningún reembolso.</p>`;

    const emailResponse = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Inscripción Cancelada: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Inscripción Cancelada</h1>
          <p>Hola ${userName},</p>
          <p>Tu inscripción en <strong>${raceName}</strong> ha sido cancelada correctamente.</p>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h2 style="margin-top: 0; color: #1f2937;">Inscripción Cancelada</h2>
            <p><strong>Carrera:</strong> ${raceName}</p>
            <p><strong>Distancia:</strong> ${distanceName}</p>
            <p><strong>Fecha:</strong> ${new Date(raceDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Precio de Inscripción:</strong> ${price.toFixed(2)}€</p>
          </div>
          
          ${refundMessage}
          
          <p style="margin-top: 30px;">Sentimos que no puedas participar, ¡pero esperamos verte en futuros eventos!</p>
          
          <p>Si tienes alguna pregunta sobre tu cancelación o reembolso, no dudes en contactarnos.</p>
          
          <p style="margin-top: 30px;">
            Un saludo,<br>
            El equipo de <strong>camberas.com</strong>
          </p>
        </div>
      `,
    });

    console.log("Cancellation confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-cancellation-confirmation function:", error);
    
    // Handle validation errors specifically
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: error.errors }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
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
