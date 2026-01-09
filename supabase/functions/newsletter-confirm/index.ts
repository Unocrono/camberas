import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(renderPage("error", "Token inválido"), {
        status: 400,
        headers: { "Content-Type": "text/html" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find subscriber by token
    const { data: subscriber, error: findError } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, status")
      .eq("confirmation_token", token)
      .single();

    if (findError || !subscriber) {
      console.error("Token not found:", token);
      return new Response(renderPage("error", "Enlace inválido o expirado"), {
        status: 404,
        headers: { "Content-Type": "text/html" }
      });
    }

    if (subscriber.status === "confirmed") {
      return new Response(renderPage("already", "Ya estabas suscrito"), {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }

    // Confirm subscription
    const { error: updateError } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmation_token: null // Invalidate token
      })
      .eq("id", subscriber.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(renderPage("error", "Error al confirmar"), {
        status: 500,
        headers: { "Content-Type": "text/html" }
      });
    }

    console.log(`Newsletter confirmed for ${subscriber.email}`);

    return new Response(renderPage("success", "¡Suscripción confirmada!"), {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });

  } catch (error: any) {
    console.error("Newsletter confirm error:", error);
    return new Response(renderPage("error", error.message), {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
});

function renderPage(type: "success" | "error" | "already", message: string): string {
  const icon = type === "success" ? "✅" : type === "already" ? "ℹ️" : "❌";
  const color = type === "success" ? "#22c55e" : type === "already" ? "#3b82f6" : "#ef4444";
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${message} - Camberas</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    h1 {
      color: ${color};
      margin: 0 0 16px 0;
      font-size: 24px;
    }
    p {
      color: #666;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }
    a {
      display: inline-block;
      background: ${color};
      color: white;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    a:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${message}</h1>
    <p>${type === "success" 
      ? "Gracias por confirmar tu suscripción. Recibirás nuestras últimas noticias sobre carreras de trail y montaña." 
      : type === "already"
      ? "Tu email ya estaba confirmado en nuestra lista de suscriptores."
      : "Ha ocurrido un problema. Por favor, intenta suscribirte de nuevo."
    }</p>
    <a href="https://camberas.com">Ir a Camberas</a>
  </div>
</body>
</html>
  `;
}
