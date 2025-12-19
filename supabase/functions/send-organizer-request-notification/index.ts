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
  organizerName: z.string().min(1).max(200),
  organizerEmail: z.string().email().max(255),
  clubName: z.string().optional(),
  userId: z.string().uuid().optional(),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawInput = await req.json();
    const input = requestSchema.parse(rawInput);
    
    const { organizerName, organizerEmail, clubName, userId } = input;

    console.log("Sending organizer request notification for:", organizerEmail);

    // Insert notification in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: notifError } = await supabase
      .from("admin_notifications")
      .insert({
        type: "new_organizer",
        title: `Nueva solicitud de organizador: ${organizerName}`,
        message: `${organizerName} (${organizerEmail}) ha solicitado el rol de organizador${clubName ? ` para el club "${clubName}"` : ""}.`,
        metadata: {
          user_id: userId,
          organizer_name: organizerName,
          organizer_email: organizerEmail,
          club_name: clubName,
        },
      });

    if (notifError) {
      console.error("Error inserting notification:", notifError);
    } else {
      console.log("Notification inserted successfully");
    }

    // Enviar email de notificación al equipo de soporte
    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: ["soporte@camberas.com"],
      subject: `[Nueva Solicitud] Organizador: ${organizerName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #fef3c7; margin: 10px 0 0 0; font-size: 14px;">Nueva Solicitud de Organizador</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-top: 0;">📋 Nueva solicitud pendiente</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Un nuevo usuario ha solicitado el rol de <strong>Organizador</strong> y requiere aprobación por parte del administrador.
            </p>
            
            <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
              <h3 style="margin-top: 0; color: #92400e; font-size: 16px;">Datos del Solicitante</h3>
              <p style="margin: 8px 0; color: #78350f;"><strong>Nombre:</strong> ${organizerName}</p>
              <p style="margin: 8px 0; color: #78350f;"><strong>Email:</strong> ${organizerEmail}</p>
              ${clubName ? `<p style="margin: 8px 0; color: #78350f;"><strong>Club/Organización:</strong> ${clubName}</p>` : ''}
            </div>
            
            <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>Acción requerida:</strong> Accede al panel de administración para aprobar o rechazar esta solicitud.
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

    console.log("Organizer request notification sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Notificación enviada correctamente" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-organizer-request-notification function:", error);
    
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
