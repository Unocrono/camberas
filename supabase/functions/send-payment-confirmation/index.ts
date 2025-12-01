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
  raceDate: z.string(),
  distanceName: z.string().trim().min(1).max(100),
  price: z.number().nonnegative().max(100000),
  bibNumber: z.number().int().positive().optional(),
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
    
    const { userEmail, userName, raceName, raceDate, distanceName, price, bibNumber } = input;

    console.log("Sending payment confirmation to:", userEmail);

    const emailResponse = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Pago Confirmado: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #16a34a; margin-top: 0;">¡Pago Confirmado!</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Hola ${userName}, hemos recibido tu pago para <strong>${raceName}</strong>. ¡Tu inscripción está completa!
            </p>
            
            <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #16a34a;">
              <h3 style="margin-top: 0; color: #1f2937; font-size: 16px;">Detalles de la Inscripción</h3>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Carrera:</strong> ${raceName}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Distancia:</strong> ${distanceName}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Fecha:</strong> ${new Date(raceDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin: 8px 0; color: #4b5563;"><strong>Importe Pagado:</strong> ${price.toFixed(2)}€</p>
              ${bibNumber ? `<p style="margin: 8px 0; color: #4b5563;"><strong>Número de Dorsal:</strong> ${bibNumber}</p>` : ''}
            </div>
            
            <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2563eb;">
              <h3 style="margin-top: 0; color: #1e40af; font-size: 16px;">¿Qué viene ahora?</h3>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
                <li>Te enviaremos un recordatorio 7 días antes del evento</li>
                <li>Consulta tu panel de control para información sobre la recogida de dorsales</li>
                <li>¡Empieza a entrenar y prepárate para el día de la carrera!</li>
              </ul>
            </div>
            
            <p style="color: #16a34a; font-size: 16px; font-weight: bold; text-align: center; margin-top: 30px;">
              ¡Nos vemos en la línea de salida!
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

    console.log("Payment confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-payment-confirmation function:", error);
    
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
