import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentConfirmationRequest {
  userEmail: string;
  userName: string;
  raceName: string;
  raceDate: string;
  distanceName: string;
  price: number;
  bibNumber?: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, userName, raceName, raceDate, distanceName, price, bibNumber }: PaymentConfirmationRequest = await req.json();

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
