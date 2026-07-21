import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webpush from "https://esm.sh/web-push@3.6.7";

// Envío de notificaciones push (el "clinc" con la app cerrada).
// Solo se invoca desde el servidor (service role): normalmente desde
// redsys-webhook al confirmarse un cobro.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Solo server-to-server: exige la service role key
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return json({ error: "No autorizado" }, 401);
    }

    const { userId, title, body, url } = await req.json();
    if (!userId || !title) {
      return json({ error: "Faltan userId o title" }, 400);
    }

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!publicKey || !privateKey) {
      console.error("VAPID keys no configuradas");
      return json({ error: "Push no configurado" }, 500);
    }
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:info@camberas.com",
      publicKey,
      privateKey,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error) {
      console.error("Error leyendo suscripciones:", error.message);
      return json({ error: "Error leyendo suscripciones" }, 500);
    }
    if (!subs?.length) {
      return json({ sent: 0, reason: "sin suscripciones" });
    }

    const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/org" });
    let sent = 0;
    const dead: string[] = [];

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        // 404/410 = suscripción caducada: se limpia sola
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(s.id);
        } else {
          console.error("Fallo enviando push:", err?.statusCode, err?.body);
        }
      }
    }

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("id", dead);
    }

    return json({ sent, removed: dead.length });
  } catch (err: any) {
    console.error("Error en send-push:", err);
    return json({ error: "Error procesando la solicitud" }, 500);
  }
});
