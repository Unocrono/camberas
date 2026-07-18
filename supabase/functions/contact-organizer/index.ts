import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const contactSchema = z.object({
  raceId: z.string().uuid("raceId inválido"),
  name: z.string().min(2, "El nombre es muy corto").max(100).trim(),
  email: z.string().email("Email inválido").max(255).trim(),
  message: z.string().min(10, "El mensaje es muy corto").max(5000).trim(),
});

// Escapar HTML para prevenir XSS en los emails
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parseResult = contactSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Validación fallida",
          details: parseResult.error.errors.map((e) => e.message),
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { raceId, name, email, message } = parseResult.data;

    // Resolver el email del organizador EN EL SERVIDOR (no se expone al cliente):
    // organizer_email de la carrera; si está vacío, el email del perfil del organizador
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: race, error: raceError } = await supabase
      .from("races")
      .select("name, organizer_email, organizer_id")
      .eq("id", raceId)
      .single();

    if (raceError || !race) {
      console.error("Race not found:", raceId, raceError);
      return new Response(
        JSON.stringify({ error: "Carrera no encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    let organizerEmail: string | null = race.organizer_email;
    if (!organizerEmail && race.organizer_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", race.organizer_id)
        .single();
      organizerEmail = profile?.email ?? null;
    }

    if (!organizerEmail) {
      return new Response(
        JSON.stringify({ error: "Esta carrera no tiene organizador con email configurado" }),
        { status: 422, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log("Contact form for race:", race.name, "→ organizer:", organizerEmail.substring(0, 3) + "***");

    // Email al organizador con el contenido del formulario (reply-to: el participante)
    await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [organizerEmail],
      reply_to: email,
      subject: `[${race.name}] Consulta de ${name}`,
      html: `
        <h2>Nueva consulta sobre ${escapeHtml(race.name)}</h2>
        <p><strong>De:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
        <hr>
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        <hr>
        <p style="color:#6b7280;font-size:13px">
          Puedes responder directamente a este correo: la respuesta le llegará a ${escapeHtml(name)}.
          <br>Enviado desde la página de la carrera en camberas.com
        </p>
      `,
    });

    // Copia de confirmación al participante
    await resend.emails.send({
      from: "Camberas <noreply@camberas.com>",
      to: [email],
      subject: `Tu consulta sobre ${race.name} ha sido enviada`,
      html: `
        <h2>¡Hola ${escapeHtml(name)}!</h2>
        <p>Hemos hecho llegar tu consulta al organizador de <strong>${escapeHtml(race.name)}</strong>. Te responderá directamente a este email.</p>
        <hr>
        <p><strong>Tu mensaje:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        <hr>
        <p>Saludos,<br><strong>El equipo de Camberas</strong></p>
      `,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error in contact-organizer function:", error);
    return new Response(
      JSON.stringify({ error: "Error procesando la solicitud" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
