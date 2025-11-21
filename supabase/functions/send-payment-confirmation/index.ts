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
      from: "Race Registration <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Payment Confirmed: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #16a34a;">Payment Confirmed!</h1>
          <p>Hello ${userName},</p>
          <p>We've received your payment for <strong>${raceName}</strong>. Your registration is now complete!</p>
          
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
            <h2 style="margin-top: 0; color: #1f2937;">Registration Details</h2>
            <p><strong>Race:</strong> ${raceName}</p>
            <p><strong>Distance:</strong> ${distanceName}</p>
            <p><strong>Date:</strong> ${new Date(raceDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Amount Paid:</strong> €${price.toFixed(2)}</p>
            ${bibNumber ? `<p><strong>Bib Number:</strong> ${bibNumber}</p>` : ''}
          </div>
          
          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">What's Next?</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>We'll send you a race reminder 7 days before the event</li>
              <li>Check your dashboard for race packet pickup information</li>
              <li>Start training and prepare for race day!</li>
            </ul>
          </div>
          
          <p style="margin-top: 30px;">See you at the starting line!</p>
          
          <p style="margin-top: 30px;">
            Best regards,<br>
            The Race Team
          </p>
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
