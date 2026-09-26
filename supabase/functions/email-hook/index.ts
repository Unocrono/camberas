import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { correoAcceso } from "./plantilla.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const rawHookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

// Process the hook secret - Supabase uses format "v1,whsec_BASE64" 
// We need to extract the base64 part after "whsec_"
function getProcessedSecret(secret: string | undefined): string | null {
  if (!secret) return null;
  
  // If secret contains "whsec_", extract the base64 part
  if (secret.includes("whsec_")) {
    const parts = secret.split("whsec_");
    if (parts.length > 1) {
      return parts[1];
    }
  }
  
  // If it has comma (v1,base64), get the base64 part
  if (secret.includes(",")) {
    const parts = secret.split(",");
    return parts[parts.length - 1];
  }
  
  return secret;
}

const hookSecret = getProcessedSecret(rawHookSecret);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailHookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      first_name?: string;
      name?: string;
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

serve(async (req: Request): Promise<Response> => {
  console.log("Email hook called - method:", req.method);
  console.log("Raw hook secret configured:", rawHookSecret ? "yes" : "no");
  console.log("Processed hook secret:", hookSecret ? "yes (length: " + hookSecret.length + ")" : "no");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get raw payload for signature verification
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    
    console.log("Received payload length:", payload.length);
    console.log("Headers received:", Object.keys(headers).join(", "));
    console.log("Hook secret configured:", hookSecret ? "yes" : "no");

    let verifiedPayload: EmailHookPayload;

    // Require a configured hook secret and a valid signature. No fallback.
    if (!hookSecret) {
      console.error("Email hook secret is not configured; rejecting request");
      return new Response(
        JSON.stringify({ error: { http_code: 500, message: "Hook secret not configured" } }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    try {
      const wh = new Webhook(hookSecret);
      verifiedPayload = wh.verify(payload, headers) as EmailHookPayload;
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: { http_code: 401, message: "Invalid signature" } }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email hook received (verified):", JSON.stringify(verifiedPayload, null, 2));

    const { user, email_data } = verifiedPayload;
    const { token_hash, redirect_to, email_action_type, site_url } = email_data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? site_url;
    const userName = user.user_metadata?.first_name || user.user_metadata?.name || user.email.split("@")[0];

    let subject = "";
    let htmlContent = "";

    // Build the confirmation/action URL
    const actionUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to || site_url)}`;

    // El texto y el diseño viven en plantilla.ts (diseño de la casa); el
    // enlace de acción, con su token, llega intacto
    const correo = correoAcceso(email_action_type, { nombre: userName, actionUrl });
    if (!["signup", "email_confirmation", "recovery", "magiclink", "invite", "email_change"].includes(email_action_type)) {
      console.log("Unknown email action type:", email_action_type);
    }
    subject = correo.asunto;
    htmlContent = correo.html;

    console.log(`Sending ${email_action_type} email to ${user.email}`);
    console.log("RESEND_API_KEY configured:", Deno.env.get("RESEND_API_KEY") ? "yes (length: " + Deno.env.get("RESEND_API_KEY")?.length + ")" : "NO - THIS IS THE PROBLEM!");

    // Using verified domain camberas.com
    const fromEmail = "Camberas <noreply@camberas.com>";
    
    console.log("Sending email with from:", fromEmail);

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse, null, 2));
    
    if (emailResponse.error) {
      console.error("Resend returned an error:", emailResponse.error);
      throw new Error(`Resend error: ${JSON.stringify(emailResponse.error)}`);
    }

    console.log("Email sent successfully! ID:", emailResponse.data?.id);

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in email-hook function:", error);
    return new Response(
      JSON.stringify({ error: { http_code: error.code || 500, message: error.message } }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
