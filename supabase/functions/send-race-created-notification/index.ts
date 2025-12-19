import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  raceName: z.string().min(1).max(200),
  raceDate: z.string().min(1),
  raceLocation: z.string().min(1).max(200),
  raceType: z.string().optional(),
  organizerName: z.string().optional(),
  organizerEmail: z.string().email().optional(),
  raceId: z.string().uuid().optional(),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawInput = await req.json();
    const input = requestSchema.parse(rawInput);
    
    const { raceName, raceDate, raceLocation, raceType, organizerName, organizerEmail, raceId } = input;

    console.log("Sending race created notification for:", raceName);

    const formattedDate = new Date(raceDate).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const raceTypeLabel = raceType === "mtb" ? "MTB" : "Trail";

    // Insert notification in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: notifError } = await supabase
      .from("admin_notifications")
      .insert({
        type: "new_race",
        title: `Nueva carrera: ${raceName}`,
        message: `${organizerName || "Un organizador"} ha creado la carrera "${raceName}" en ${raceLocation} para el ${formattedDate}.`,
        metadata: {
          race_id: raceId,
          race_name: raceName,
          race_date: raceDate,
          race_location: raceLocation,
          race_type: raceType,
          organizer_name: organizerName,
          organizer_email: organizerEmail,
        },
      });

    if (notifError) {
      console.error("Error inserting notification:", notifError);
    } else {
      console.log("Notification inserted successfully");
    }

    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: ["soporte@camberas.com"],
      subject: `[Nueva Carrera] ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 14px;">Nueva Carrera Creada</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-top: 0;">🏃 Nueva carrera añadida</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Un organizador ha creado una nueva carrera en la plataforma.
            </p>
            
            <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #10b981;">
              <h3 style="margin-top: 0; color: #065f46; font-size: 16px;">Datos de la Carrera</h3>
              <p style="margin: 8px 0; color: #047857;"><strong>Nombre:</strong> ${raceName}</p>
              <p style="margin: 8px 0; color: #047857;"><strong>Fecha:</strong> ${formattedDate}</p>
              <p style="margin: 8px 0; color: #047857;"><strong>Ubicación:</strong> ${raceLocation}</p>
              <p style="margin: 8px 0; color: #047857;"><strong>Tipo:</strong> ${raceTypeLabel}</p>
            </div>
            
            ${organizerName || organizerEmail ? `
            <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
              <h3 style="margin-top: 0; color: #92400e; font-size: 16px;">Organizador</h3>
              ${organizerName ? `<p style="margin: 8px 0; color: #78350f;"><strong>Nombre:</strong> ${organizerName}</p>` : ''}
              ${organizerEmail ? `<p style="margin: 8px 0; color: #78350f;"><strong>Email:</strong> ${organizerEmail}</p>` : ''}
            </div>
            ` : ''}
            
            <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>Info:</strong> Puedes revisar los detalles de la carrera desde el panel de administración.
              </p>
            </div>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="https://camberas.com/admin" 
                 style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                        color: #ffffff; 
                        padding: 16px 40px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                Ir al Panel de Admin
              </a>
            </div>
          </div>
          
          <div style="background-color: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Este es un email automático del sistema de <strong style="color: #2563eb;">camberas.com</strong>
            </p>
          </div>
        </div>
      `,
    });

    console.log("Race created notification sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Notificación enviada correctamente" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-race-created-notification function:", error);
    
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
