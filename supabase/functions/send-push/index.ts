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

    const { userId, title, body, url, raceId } = await req.json();
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
      .select("id, endpoint, p256dh, auth, clinc_mode")
      .eq("user_id", userId);

    if (error) {
      console.error("Error leyendo suscripciones:", error.message);
      return json({ error: "Error leyendo suscripciones" }, 500);
    }
    if (!subs?.length) {
      return json({ sent: 0, reason: "sin suscripciones" });
    }

    // ¿Este pago es un "hito"? Solo se calcula si alguna suscripción está
    // en modo milestones, para no hacer consultas de más.
    let isMilestone = false;
    const needsMilestone = subs.some((s: any) => (s.clinc_mode ?? "each") === "milestones");
    if (needsMilestone && raceId) {
      // Hito 1: cruzar cada 10 pagados (el contador sube de uno en uno)
      const { count: paidCount } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("race_id", raceId)
        .eq("payment_status", "paid");
      const crossedTen = !!paidCount && paidCount > 0 && paidCount % 10 === 0;

      // Hito 2: a algún recorrido le quedan pocas plazas
      let lowPlaces = false;
      const { data: dists } = await supabase
        .from("race_distances")
        .select("id, max_participants")
        .eq("race_id", raceId);
      for (const d of dists ?? []) {
        if (!d.max_participants) continue;
        const { count: taken } = await supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("race_distance_id", d.id)
          .in("payment_status", ["paid", "not_required"]);
        const left = d.max_participants - (taken ?? 0);
        if (left > 0 && left <= 10) {
          lowPlaces = true;
          break;
        }
      }
      isMilestone = crossedTen || lowPlaces;
    }

    const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/org" });
    let sent = 0;
    let skipped = 0;
    const dead: string[] = [];

    for (const s of subs) {
      // El modo de aviso manda: se decide aquí, en el servidor
      const mode = (s as any).clinc_mode ?? "each";
      if (mode === "off" || (mode === "milestones" && !isMilestone)) {
        skipped++;
        continue;
      }
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

    return json({ sent, skipped, removed: dead.length });
  } catch (err: any) {
    console.error("Error en send-push:", err);
    return json({ error: "Error procesando la solicitud" }, 500);
  }
});
