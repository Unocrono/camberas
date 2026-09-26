import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { avisoSolicitudOrganizador } from "./plantilla.ts";

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
    const aviso = avisoSolicitudOrganizador({ nombre: organizerName, email: organizerEmail, club: clubName });
    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: ["soporte@camberas.com"],
      subject: aviso.asunto,
      html: aviso.html,
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
