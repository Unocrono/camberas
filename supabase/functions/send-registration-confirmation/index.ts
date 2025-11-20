import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegistrationConfirmationRequest {
  userEmail: string;
  userName: string;
  raceName: string;
  raceDate: string;
  raceLocation: string;
  distanceName: string;
  price: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, userName, raceName, raceDate, raceLocation, distanceName, price }: RegistrationConfirmationRequest = await req.json();

    console.log("Sending registration confirmation to:", userEmail);

    const emailResponse = await resend.emails.send({
      from: "Race Registration <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Registration Confirmed: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Registration Confirmed!</h1>
          <p>Hello ${userName},</p>
          <p>Thank you for registering for <strong>${raceName}</strong>!</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: #1f2937;">Race Details</h2>
            <p><strong>Race:</strong> ${raceName}</p>
            <p><strong>Distance:</strong> ${distanceName}</p>
            <p><strong>Date:</strong> ${new Date(raceDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Location:</strong> ${raceLocation}</p>
            <p><strong>Registration Fee:</strong> €${price.toFixed(2)}</p>
          </div>
          
          <p><strong>Payment Status:</strong> Pending - Please complete your payment to confirm your spot.</p>
          
          <p style="margin-top: 30px;">We'll send you a race reminder 7 days before the event with important race day information.</p>
          
          <p>If you have any questions, please don't hesitate to contact us.</p>
          
          <p style="margin-top: 30px;">
            Best regards,<br>
            The Race Team
          </p>
        </div>
      `,
    });

    console.log("Registration confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-registration-confirmation function:", error);
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
