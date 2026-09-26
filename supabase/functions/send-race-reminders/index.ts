import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { correoRecordatorio } from "./plantilla.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to check if user is admin
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin'
  });
  
  if (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
  
  return data === true;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication - only admins can trigger race reminders
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // First, verify the user is authenticated and is an admin
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const userIsAdmin = await isAdmin(authClient, user.id);
    if (!userIsAdmin) {
      console.error("User is not an admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated admin user:", user.id);

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking for races 7 days from now...");

    // Calculate the date 7 days from now
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const targetDate = sevenDaysFromNow.toISOString().split('T')[0];

    console.log("Target date:", targetDate);

    // Find races happening 7 days from now
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('*')
      .eq('date', targetDate);

    if (racesError) {
      console.error("Error fetching races:", racesError);
      throw racesError;
    }

    if (!races || races.length === 0) {
      console.log("No races found for 7 days from now");
      return new Response(JSON.stringify({ message: "No hay carreras para recordar" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${races.length} races happening in 7 days`);

    let emailsSent = 0;
    let emailsFailed = 0;

    // For each race, find all confirmed registrations
    for (const race of races) {
      const { data: registrations, error: registrationsError } = await supabase
        .from('registrations')
        .select(`
          *,
          race_distances (
            name,
            distance_km,
            cutoff_time
          ),
          profiles (
            first_name,
            last_name
          )
        `)
        .eq('race_id', race.id)
        .eq('status', 'confirmed');

      if (registrationsError) {
        console.error("Error fetching registrations:", registrationsError);
        continue;
      }

      if (!registrations || registrations.length === 0) {
        console.log(`No confirmed registrations for race: ${race.name}`);
        continue;
      }

      console.log(`Found ${registrations.length} confirmed registrations for ${race.name}`);

      // Send reminder email to each participant
      for (const registration of registrations) {
        try {
          // Get user email from auth
          const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(registration.user_id);
          
          if (userError || !user) {
            console.error("Error fetching user:", userError);
            emailsFailed++;
            continue;
          }

          const userName = registration.profiles?.first_name 
            ? `${registration.profiles.first_name} ${registration.profiles.last_name || ''}`
            : user.email;

          const distanceName = registration.race_distances?.name || 'N/A';
          const distanceKm = registration.race_distances?.distance_km || 'N/A';
          const cutoffTime = registration.race_distances?.cutoff_time || 'N/A';

          const correo = correoRecordatorio({
            nombre: userName,
            carrera: race.name,
            fecha: race.date,
            lugar: race.location,
            recorrido: distanceName,
            km: distanceKm,
            dorsal: registration.bib_number ?? null,
            corte: cutoffTime !== 'N/A' ? cutoffTime : null,
          });
          await resend.emails.send({
            from: "Camberas <noreply@camberas.com>",
            to: [user.email!],
            subject: correo.asunto,
            html: correo.html,
          });

          console.log(`Reminder email sent to ${user.email}`);
          emailsSent++;
        } catch (emailError: any) {
          console.error(`Failed to send email to user ${registration.user_id}:`, emailError);
          emailsFailed++;
        }
      }
    }

    console.log(`Race reminders sent: ${emailsSent} successful, ${emailsFailed} failed`);

    return new Response(
      JSON.stringify({ 
        message: "Recordatorios de carrera procesados",
        emailsSent,
        emailsFailed,
        racesProcessed: races.length
      }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-race-reminders function:", error);
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
