import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
    const { email, firstName, confirmationUrl }: WelcomeEmailRequest = await req.json();
    
    console.log("Sending welcome email to:", email);
    console.log("First name:", firstName);
    console.log("Confirmation URL provided:", confirmationUrl ? "yes" : "no");

    const userName = firstName || email.split("@")[0];
    
    let htmlContent: string;
    let subject: string;

    if (confirmationUrl) {
      // Email de confirmación de cuenta
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
              <a href="${confirmationUrl}" 
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
              ${confirmationUrl}
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
    } else {
      // Email de bienvenida (sin confirmación)
      subject = "¡Bienvenido/a a Camberas!";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Camberas</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Carreras de Trail Running y Montaña</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin-top: 0;">¡Bienvenido/a, ${userName}!</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Tu cuenta en <strong>Camberas</strong> ha sido creada exitosamente. Ya puedes empezar a explorar las mejores carreras de trail running y montaña en España.
            </p>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2563eb;">
              <h3 style="color: #1e40af; margin-top: 0; font-size: 16px;">¿Qué puedes hacer ahora?</h3>
              <ul style="color: #4b5563; font-size: 14px; line-height: 1.8; padding-left: 20px; margin-bottom: 0;">
                <li>Explorar las próximas carreras disponibles</li>
                <li>Inscribirte en tus carreras favoritas</li>
                <li>Completar tu perfil de corredor</li>
                <li>Seguir tu historial de participaciones</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="https://camberas.com/races" 
                 style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                        color: #ffffff; 
                        padding: 16px 40px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                Ver carreras disponibles
              </a>
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
    }

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
