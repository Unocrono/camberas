import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationConfirmationRequest {
  userEmail: string;
  userName: string;
  raceName: string;
  raceDate: string;
  distanceName: string;
  price: number;
  paymentStatus: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, userName, raceName, raceDate, distanceName, price, paymentStatus }: CancellationConfirmationRequest = await req.json();

    console.log("Sending cancellation confirmation to:", userEmail);

    const refundMessage = paymentStatus === 'paid' 
      ? `<div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin-top: 0; color: #92400e;">Refund Information</h3>
          <p>Since you have already paid for this registration, a refund of <strong>€${price.toFixed(2)}</strong> will be processed within 5-7 business days.</p>
          <p>The refund will be credited back to your original payment method.</p>
        </div>`
      : `<p style="color: #059669;">No payment was made for this registration, so no refund is necessary.</p>`;

    const emailResponse = await resend.emails.send({
      from: "Race Registration <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Registration Cancelled: ${raceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Registration Cancelled</h1>
          <p>Hello ${userName},</p>
          <p>Your registration for <strong>${raceName}</strong> has been successfully cancelled.</p>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h2 style="margin-top: 0; color: #1f2937;">Cancelled Registration</h2>
            <p><strong>Race:</strong> ${raceName}</p>
            <p><strong>Distance:</strong> ${distanceName}</p>
            <p><strong>Date:</strong> ${new Date(raceDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Registration Fee:</strong> €${price.toFixed(2)}</p>
          </div>
          
          ${refundMessage}
          
          <p style="margin-top: 30px;">We're sorry to see you go, but we hope to see you at future events!</p>
          
          <p>If you have any questions about your cancellation or refund, please don't hesitate to contact us.</p>
          
          <p style="margin-top: 30px;">
            Best regards,<br>
            The Race Team
          </p>
        </div>
      `,
    });

    console.log("Cancellation confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-cancellation-confirmation function:", error);
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
