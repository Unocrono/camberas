import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { avisoCarreraNueva } from "./plantilla.ts";

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

    const aviso = avisoCarreraNueva({
      carrera: raceName,
      fecha: formattedDate,
      lugar: raceLocation,
      tipo: raceTypeLabel,
      organizador: organizerName,
      emailOrganizador: organizerEmail,
    });
    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: ["soporte@camberas.com"],
      subject: aviso.asunto,
      html: aviso.html,
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
