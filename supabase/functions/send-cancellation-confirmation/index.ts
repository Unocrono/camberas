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
          <h3 style="margin-top: 0; color: #92400e; font-size: 16px;">Información del Reembolso</h3>
          <p style="margin: 8px 0; color: #92400e; font-size: 14px;">Como ya habías pagado esta inscripción, se procesará un reembolso de <strong>${price.toFixed(2)}€</strong> en un plazo de 5-7 días hábiles.</p>
          <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">El reembolso se abonará en el método de pago original.</p>
        </div>`
      : `<div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 0; color: #059669; font-size: 14px;">No se realizó ningún pago por esta inscripción, por lo que no es necesario ningún reembolso.</p>
        </div>`;

    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [userEmail],
      subject: `Inscripción Cancelada: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #dc2626; margin-top: 0;">Inscripción Cancelada</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Hola ${userName}, tu inscripción en <strong>${raceName}</strong> ha sido cancelada correctamente.
            </p>
            
            <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #dc2626;">
              <h3 style="margin-top: 0; color: #1f2937; font-size: 16px;">Detalles de la Inscripción Cancelada</h3>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Carrera:</strong> ${raceName}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Distancia:</strong> ${distanceName}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Fecha:</strong> ${new Date(raceDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Precio de Inscripción:</strong> ${price.toFixed(2)}€</p>
            </div>
            
            ${refundMessage}
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 25px;">
              Sentimos que no puedas participar, ¡pero esperamos verte en futuros eventos!
            </p>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Si tienes alguna pregunta sobre tu cancelación o reembolso, no dudes en contactarnos.
            </p>
          </div>
          
          <div style="background-color: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Un saludo,<br>
              El equipo de <strong style="color: #2563eb;">camberas.com</strong>
            </p>
          </div>
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
