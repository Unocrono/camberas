import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      return new Response(JSON.stringify({ message: "No races to remind about" }), {
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

          await resend.emails.send({
            from: "Race Registration <onboarding@resend.dev>",
            to: [user.email!],
            subject: `Race Reminder: ${race.name} - 7 Days Away!`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2563eb;">Your Race is Coming Up!</h1>
                <p>Hello ${userName},</p>
                <p>This is a friendly reminder that <strong>${race.name}</strong> is just <strong>7 days away</strong>!</p>
                
                <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                  <h2 style="margin-top: 0; color: #1f2937;">Race Information</h2>
                  <p><strong>Race:</strong> ${race.name}</p>
                  <p><strong>Your Distance:</strong> ${distanceName} (${distanceKm} km)</p>
                  <p><strong>Date:</strong> ${new Date(race.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p><strong>Location:</strong> ${race.location}</p>
                  ${registration.bib_number ? `<p><strong>Your Bib Number:</strong> ${registration.bib_number}</p>` : ''}
                  ${cutoffTime !== 'N/A' ? `<p><strong>Cutoff Time:</strong> ${cutoffTime}</p>` : ''}
                </div>
                
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #92400e;">Race Day Checklist</h3>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li>Pick up your race packet (check race details for pickup times)</li>
                    <li>Prepare your race gear and nutrition</li>
                    <li>Get a good night's sleep before race day</li>
                    <li>Arrive early to warm up and find your starting position</li>
                    <li>Check the weather forecast and dress appropriately</li>
                  </ul>
                </div>
                
                <p style="margin-top: 30px;">We're excited to see you at the starting line!</p>
                
                <p style="margin-top: 30px;">
                  Best regards,<br>
                  The Race Team
                </p>
              </div>
            `,
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
        message: "Race reminders processed",
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
