import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendNewsletterRequest {
  campaignId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaignId }: SendNewsletterRequest = await req.json();

    if (!campaignId) {
      throw new Error("campaignId is required");
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("newsletter_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft") {
      throw new Error("Campaign has already been sent or is not in draft status");
    }

    // Update campaign status to sending
    await supabase
      .from("newsletter_campaigns")
      .update({ status: "sending" })
      .eq("id", campaignId);

    // Get subscribers
    let query = supabase
      .from("newsletter_subscribers")
      .select("*")
      .eq("status", "confirmed");

    // Filter by segments if specified
    if (campaign.target_segments && campaign.target_segments.length > 0) {
      query = query.overlaps("segments", campaign.target_segments);
    }

    const { data: subscribers, error: subscribersError } = await query;

    if (subscribersError) {
      throw new Error("Error fetching subscribers");
    }

    if (!subscribers || subscribers.length === 0) {
      await supabase
        .from("newsletter_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaignId);

      return new Response(
        JSON.stringify({ success: true, sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    const errors: string[] = [];

    // Send emails in batches
    for (const subscriber of subscribers) {
      try {
        // Personalize content
        const personalizedContent = campaign.content
          .replace(/\{\{name\}\}/g, subscriber.first_name || "Suscriptor");

        const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?email=${encodeURIComponent(subscriber.email)}`;

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="padding: 30px;">
                ${personalizedContent}
              </div>
              <div style="padding: 20px 30px; background: #f9f9f9; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #666;">
                <p>Has recibido este email porque estás suscrito a nuestra newsletter.</p>
                <p><a href="${unsubscribeUrl}" style="color: #666;">Darse de baja</a></p>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Camberas <newsletter@camberas.com>",
            to: [subscriber.email],
            subject: campaign.subject,
            html: htmlContent,
          }),
        });

        if (emailResponse.ok) {
          // Record send
          await supabase.from("newsletter_sends").insert({
            campaign_id: campaignId,
            subscriber_id: subscriber.id,
            sent_at: new Date().toISOString(),
          });
          sentCount++;
        } else {
          const errorData = await emailResponse.text();
          console.error(`Failed to send to ${subscriber.email}:`, errorData);
          errors.push(subscriber.email);
        }
      } catch (emailError) {
        console.error(`Error sending to ${subscriber.email}:`, emailError);
        errors.push(subscriber.email);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update campaign status
    await supabase
      .from("newsletter_campaigns")
      .update({ 
        status: errors.length === subscribers.length ? "failed" : "sent",
        sent_at: new Date().toISOString()
      })
      .eq("id", campaignId);

    console.log(`Newsletter sent: ${sentCount}/${subscribers.length} emails`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount,
        failed: errors.length,
        total: subscribers.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-newsletter:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
