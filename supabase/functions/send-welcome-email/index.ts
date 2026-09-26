import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { correoBienvenida, correoConfirmarCuenta } from "./plantilla.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  firstName?: string;
  confirmationUrl?: string;
}

serve(async (req: Request): Promise<Response> => {
  console.log("Send welcome email function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication — this endpoint may only be called by a signed-in user
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json();
    const emailRaw: string | undefined = body?.email;
    const firstName: string | undefined = body?.firstName;
    const confirmationUrlRaw: string | undefined = body?.confirmationUrl;

    // Validate email format
    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) || emailRaw.length > 320) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    // Only the authenticated user may request an email to their own address
    if (userData.user.email?.toLowerCase() !== emailRaw.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const email = emailRaw;

    // Restrict confirmationUrl to trusted hosts only
    let confirmationUrl: string | undefined;
    if (confirmationUrlRaw) {
      try {
        const u = new URL(confirmationUrlRaw);
        const allowedHosts = new Set([
          "camberas.com",
          "www.camberas.com",
          "camberas.lovable.app",
          new URL(Deno.env.get("SUPABASE_URL") ?? "https://example.com").host,
        ]);
        if (u.protocol !== "https:" || !allowedHosts.has(u.host)) {
          return new Response(JSON.stringify({ error: "Invalid confirmationUrl" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        confirmationUrl = u.toString();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid confirmationUrl" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    
    console.log("Sending welcome email to:", email);
    console.log("First name:", firstName);
    console.log("Confirmation URL provided:", confirmationUrl ? "yes" : "no");

    const userName = firstName || email.split("@")[0];
    
    // El texto vive en plantilla.ts con el diseño de la casa
    const correo = confirmationUrl
      ? correoConfirmarCuenta({ nombre: userName, confirmationUrl })
      : correoBienvenida({ nombre: userName });
    const subject = correo.asunto;
    const htmlContent = correo.html;

    console.log("RESEND_API_KEY configured:", Deno.env.get("RESEND_API_KEY") ? "yes" : "no");

    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse, null, 2));

    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      throw new Error(`Resend error: ${JSON.stringify(emailResponse.error)}`);
    }

    console.log("Welcome email sent successfully! ID:", emailResponse.data?.id);

    return new Response(
      JSON.stringify({ success: true, id: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
