import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { correoConfirmacionInscripcion } from "./plantilla.ts";

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
  raceLocation: z.string().trim().min(1).max(200),
  distanceName: z.string().trim().min(1).max(100),
  price: z.number().nonnegative().max(100000),
  isGuest: z.boolean().optional().default(false),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    // Parse and validate input first
    const rawInput = await req.json();
    const input = requestSchema.parse(rawInput);
    
    const { userEmail, userName, raceName, raceDate, raceLocation, distanceName, price, isGuest } = input;

    // For non-guest registrations, verify authentication
    if (!isGuest) {
      if (!authHeader) {
        console.error("Missing authorization header for authenticated registration");
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
    } else {
      console.log("Processing guest registration for:", userEmail);
    }

    console.log("Sending registration confirmation to:", userEmail);

    const correo = correoConfirmacionInscripcion({
      nombre: userName,
      carrera: raceName,
      fecha: raceDate,
      lugar: raceLocation,
      recorrido: distanceName,
      precio: price,
      invitado: isGuest,
    });

    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [userEmail],
      subject: correo.asunto,
      html: correo.html,
    });

    console.log("Registration confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-registration-confirmation function:", error);
    
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
