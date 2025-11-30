import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  redirectTo: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo }: PasswordResetRequest = await req.json();
    
    console.log("Password reset requested for:", email);

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Generate password reset link using admin API
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (linkError) {
      console.error("Error generating reset link:", linkError);
      // Don't reveal if user exists or not
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resetLink = data.properties?.action_link;
    
    if (!resetLink) {
      console.error("No reset link generated");
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get user name from metadata if available
    const userName = data.user?.user_metadata?.first_name || 
                     data.user?.user_metadata?.name || 
                     email.split("@")[0];

    // Send email via Resend in Spanish
    const emailResponse = await resend.emails.send({
      from: "Camberas <onboarding@resend.dev>",
      to: [email],
      subject: "Recupera tu contraseña - Camberas",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-top: 0;">Recuperación de contraseña</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Hola ${userName}, hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>Camberas</strong>.
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetLink}" 
                 style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                        color: #ffffff; 
                        padding: 16px 40px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                Restablecer contraseña
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:
            </p>
            <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; color: #4b5563;">
              ${resetLink}
            </p>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 25px; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; font-size: 13px; margin: 0;">
                <strong>Nota de seguridad:</strong> Este enlace expirará en 24 horas. Si no solicitaste restablecer tu contraseña, ignora este email.
              </p>
            </div>
          </div>
          
          <div style="background-color: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Un saludo,<br>
              El equipo de <strong style="color: #2563eb;">camberas.com</strong>
            </p>
          </div>
        </div>
      `,
    });

    console.log("Password reset email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-password-reset function:", error);
    // Always return success to not reveal user existence
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
