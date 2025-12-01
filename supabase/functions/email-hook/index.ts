import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get raw payload for signature verification
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);

    // Verify webhook signature
    const wh = new Webhook(hookSecret);
    let verifiedPayload: EmailHookPayload;
    
    try {
      verifiedPayload = wh.verify(payload, headers) as EmailHookPayload;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response(
        JSON.stringify({ error: { http_code: 401, message: "Unauthorized" } }),
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

    switch (email_action_type) {
      case "signup":
      case "email_confirmation":
        subject = "Confirma tu cuenta en Camberas";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
              <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin-top: 0;">¡Bienvenido/a, ${userName}!</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Gracias por registrarte en <strong>Camberas</strong>. Para completar tu registro y activar tu cuenta, por favor confirma tu dirección de email.
              </p>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${actionUrl}" 
                   style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                          color: #ffffff; 
                          padding: 16px 40px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: bold; 
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                  Confirmar mi cuenta
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; color: #4b5563;">
                ${actionUrl}
              </p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                  Si no has creado una cuenta en Camberas, puedes ignorar este email.
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
        `;
        break;

      case "recovery":
      case "magiclink":
        subject = "Recupera tu contraseña - Camberas";
        htmlContent = `
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
                <a href="${actionUrl}" 
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
                ${actionUrl}
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
        `;
        break;

      case "invite":
        subject = "Has sido invitado a Camberas";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
              <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin-top: 0;">¡Has sido invitado!</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Has recibido una invitación para unirte a <strong>Camberas</strong>, la plataforma de carreras de trail running y montaña en España.
              </p>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${actionUrl}" 
                   style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                          color: #ffffff; 
                          padding: 16px 40px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: bold; 
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                  Aceptar invitación
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; color: #4b5563;">
                ${actionUrl}
              </p>
            </div>
            
            <div style="background-color: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Un saludo,<br>
                El equipo de <strong style="color: #2563eb;">camberas.com</strong>
              </p>
            </div>
          </div>
        `;
        break;

      case "email_change":
        subject = "Confirma tu nuevo email - Camberas";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
              <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin-top: 0;">Confirma tu nuevo email</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hola ${userName}, has solicitado cambiar tu dirección de email en <strong>Camberas</strong>. Por favor confirma tu nueva dirección de email.
              </p>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${actionUrl}" 
                   style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                          color: #ffffff; 
                          padding: 16px 40px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: bold; 
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                  Confirmar nuevo email
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; color: #4b5563;">
                ${actionUrl}
              </p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                  Si no solicitaste este cambio, ignora este email y tu dirección de email no será modificada.
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
        `;
        break;

      default:
        console.log("Unknown email action type:", email_action_type);
        subject = "Notificación de Camberas";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Camberas</h1>
            <p>Hola ${userName},</p>
            <p>Has recibido esta notificación de Camberas.</p>
            <a href="${actionUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Continuar
            </a>
            <p style="margin-top: 30px;">
              Un saludo,<br>
              El equipo de <strong>camberas.com</strong>
            </p>
          </div>
        `;
    }

    console.log(`Sending ${email_action_type} email to ${user.email}`);

    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [user.email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

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
