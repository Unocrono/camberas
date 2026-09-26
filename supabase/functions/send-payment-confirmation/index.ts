import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { correoCorredor, correoOrganizador } from "./plantilla.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Contrato del único llamador: redsys-webhook (server-to-server)
const requestSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().trim().max(200).nullish(),
  lastName: z.string().trim().max(200).nullish(),
  raceName: z.string().trim().min(1).max(200),
  distanceName: z.string().trim().max(100).nullish(),
  amount: z.number().nonnegative().max(100000),
  orderNumber: z.string().max(20).nullish(),
  bibNumber: z.number().int().nullish(),
  // URL de la página "Mi dorsal" del corredor (con su QR para la recogida)
  miDorsalUrl: z.string().url().max(300).nullish(),
  formData: z.array(z.object({
    label: z.string().max(200),
    value: z.string().max(1000),
  })).max(50).nullish(),
  organizerEmail: z.string().email().max(255).nullish(),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Función interna: solo acepta llamadas con la service role key
    // (el webhook de Redsys la invoca server-to-server; los invitados
    // no tienen sesión de usuario, así que getUser() no es viable aquí)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey || token !== serviceRoleKey) {
      console.error("Unauthorized: caller is not service role");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and parse input
    const rawInput = await req.json();
    const input = requestSchema.parse(rawInput);

    const { email, organizerEmail } = input;

    console.log("Sending payment confirmation to:", email);

    const correo = correoCorredor(input);
    const emailResponse = await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [email],
      subject: correo.asunto,
      html: correo.html,
    });

    console.log("Payment confirmation email sent successfully:", emailResponse);

    // Copia al organizador con todos los datos de la inscripción
    if (organizerEmail) {
      try {
        const copia = correoOrganizador(input);
        await resend.emails.send({
          from: "Camberas <noreply@camberas.com>",
          to: [organizerEmail],
          subject: copia.asunto,
          html: copia.html,
        });
        console.log("Organizer copy sent to:", organizerEmail);
      } catch (organizerError) {
        console.error("Error sending organizer copy:", organizerError);
      }
    }

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-payment-confirmation function:", error);

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
