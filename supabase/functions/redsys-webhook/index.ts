import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Redsys response codes
const RESPONSE_CODES: Record<string, string> = {
  "0000": "Transacción autorizada",
  "0001": "Transacción autorizada previa identificación",
  "0099": "Operación completada",
  "0900": "Transacción autorizada (devolución/anulación)",
  "0101": "Tarjeta caducada",
  "0102": "Tarjeta bloqueada",
  "0104": "Operación no permitida",
  "0116": "Disponible insuficiente",
  "0118": "Tarjeta no registrada",
  "0180": "Tarjeta no válida",
  "0184": "Error autenticación titular",
  "0190": "Denegación sin motivo",
  "0191": "Fecha caducidad errónea",
  "9915": "Cancelada por el usuario",
};

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  // Decodificar como UTF-8 (atob devuelve Latin-1 y rompe ñ/acentos)
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// Misma derivación que redsys-init-payment: clave de operación = 3DES(order, clave
// comercio), firma = HMAC-SHA256(params, clave operación). Redsys envía la firma
// de la notificación en base64url.
function computeSignature(merchantParamsB64: string, orderNumber: string, secretKey: string): string {
  const key = CryptoJS.enc.Base64.parse(secretKey);
  const iv = CryptoJS.enc.Hex.parse("0000000000000000");
  const derivedKey = CryptoJS.TripleDES.encrypt(orderNumber, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  }).ciphertext;
  const hmac = CryptoJS.HmacSHA256(merchantParamsB64, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

// Normaliza base64/base64url sin padding para comparar firmas
function normalizeB64(sig: string): string {
  return sig.replace(/-/g, '+').replace(/_/g, '/').replace(/=/g, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SECRET_KEY) {
      throw new Error("Credentials not configured");
    }

    // Parse the webhook payload (Redsys envía form-urlencoded)
    const formData = await req.formData();
    const merchantParamsB64 = formData.get("Ds_MerchantParameters") as string;
    const signature = formData.get("Ds_Signature") as string;

    if (!merchantParamsB64 || !signature) {
      console.error("Missing Ds_MerchantParameters or Ds_Signature");
      return new Response("OK", { status: 200 });
    }

    // Decode merchant parameters
    const merchantParamsJson = base64UrlDecode(merchantParamsB64);
    const merchantParams = JSON.parse(merchantParamsJson);

    const orderNumber = merchantParams.Ds_Order;
    const responseCode = merchantParams.Ds_Response;
    const authCode = merchantParams.Ds_AuthorisationCode;

    // Verificar la firma — rechazar notificaciones no autenticadas
    const expected = computeSignature(merchantParamsB64, orderNumber, SECRET_KEY);
    if (normalizeB64(expected) !== normalizeB64(signature)) {
      console.error(`Invalid signature for order ${orderNumber} — notification rejected`);
      return new Response("OK", { status: 200 });
    }

    // Determine if payment was successful (codes 0000-0099 are success)
    const responseNum = parseInt(responseCode);
    const isSuccess = responseNum >= 0 && responseNum <= 99;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find payment intent
    const { data: paymentIntent, error: fetchError } = await supabase
      .from("payment_intents")
      .select("*, registrations(*)")
      .eq("order_number", orderNumber)
      .single();

    if (fetchError || !paymentIntent) {
      console.error("Payment intent not found:", orderNumber, fetchError?.message);
      return new Response("OK", { status: 200 });
    }

    // Update payment intent status
    const { error: intentError } = await supabase
      .from("payment_intents")
      .update({
        status: isSuccess ? "completed" : "failed",
        response_code: responseCode,
        auth_code: authCode,
        response_message: RESPONSE_CODES[responseCode] || "Unknown",
        completed_at: new Date().toISOString(),
      })
      .eq("order_number", orderNumber);

    if (intentError) {
      console.error("Error updating payment intent:", intentError.message);
    }

    // If successful, confirm the registration
    if (isSuccess && paymentIntent.registration_id) {
      // Asignar dorsal AHORA que el pago está confirmado (las inscripciones
      // de pago se crean sin dorsal para no quemar números con impagos)
      const regData = paymentIntent.registrations;
      let assignedBib: number | null = regData?.bib_number ?? null;
      if (assignedBib == null && regData?.race_distance_id) {
        const { data: newBib, error: bibErr } = await supabase
          .rpc("assign_next_bib", { p_distance_id: regData.race_distance_id });
        if (bibErr) {
          console.error("assign_next_bib error:", bibErr.message);
        } else {
          assignedBib = newBib ?? null;
        }
      }

      const { error: regError } = await supabase
        .from("registrations")
        .update({
          status: "confirmed",
          payment_status: "paid",
          ...(assignedBib != null && regData?.bib_number == null
            ? { bib_number: assignedBib }
            : {}),
        })
        .eq("id", paymentIntent.registration_id);

      if (regError) {
        console.error("Error updating registration:", regError.message);
      }

      // Send payment confirmation email with real race/distance names,
      // full form responses, and a copy to the race organizer
      try {
        const registration = paymentIntent.registrations;
        if (registration) {
          const [{ data: race }, { data: distance }, { data: responses }] = await Promise.all([
            supabase.from("races").select("name, organizer_email, organizer_id").eq("id", registration.race_id).single(),
            supabase.from("race_distances").select("name").eq("id", registration.race_distance_id).single(),
            supabase
              .from("registration_responses")
              .select("field_value, registration_form_fields(field_label, field_order)")
              .eq("registration_id", paymentIntent.registration_id),
          ]);

          // Email del organizador: organizer_email de la carrera como override,
          // si no, el email del perfil del usuario organizador
          let organizerEmail: string | null = race?.organizer_email ?? null;
          if (!organizerEmail && race?.organizer_id) {
            const { data: organizerProfile } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", race.organizer_id)
              .single();
            organizerEmail = organizerProfile?.email ?? null;
          }

          const formData = (responses ?? [])
            .map((r: any) => ({
              label: r.registration_form_fields?.field_label ?? "",
              value: r.field_value ?? "",
              order: r.registration_form_fields?.field_order ?? 999,
            }))
            .filter((f: any) => f.label && f.value)
            .sort((a: any, b: any) => a.order - b.order)
            .map(({ label, value }: any) => ({ label, value }));

          await fetch(`${SUPABASE_URL}/functions/v1/send-payment-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              email: registration.email,
              firstName: registration.first_name,
              lastName: registration.last_name,
              raceName: race?.name ?? "Carrera",
              distanceName: distance?.name ?? "",
              amount: paymentIntent.amount,
              orderNumber: orderNumber,
              bibNumber: assignedBib ?? registration.bib_number,
              formData,
              organizerEmail,
            }),
          });

          // "Clinc" con la app cerrada: push al organizador de la carrera
          if (race?.organizer_id) {
            try {
              const runner = [registration.first_name, registration.last_name]
                .filter(Boolean).join(" ") || "Nueva inscripción";
              await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  userId: race.organizer_id,
                  title: "💶 ¡Nueva inscripción pagada!",
                  body: `${runner} — ${distance?.name ?? ""} · ${paymentIntent.amount}€`,
                  url: "/org",
                  // Necesario para el modo "solo hitos"
                  raceId: registration.race_id,
                }),
              });
            } catch (pushError) {
              console.error("Error sending push:", pushError);
            }
          }
        }
      } catch (emailError) {
        console.error("Error sending confirmation email:", emailError);
      }
    }

    // Lote de EQUIPO: el intent no apunta a una inscripción
    // (registration_id NULL) sino a payment_intent_items. Un solo cargo
    // del capitán confirma N inscripciones: dorsal + paid a cada una (el
    // trigger de cupones registra los canjes solo con eso), un email
    // resumen al capitán y un push al organizador.
    if (isSuccess && !paymentIntent.registration_id) {
      const { data: items } = await supabase
        .from("payment_intent_items")
        .select("registration_id, amount")
        .eq("payment_intent_id", paymentIntent.id);

      if (items && items.length > 0) {
        const runners: { name: string; bib: number | null }[] = [];
        let firstReg: any = null;
        for (const it of items) {
          const { data: reg } = await supabase
            .from("registrations")
            .select("id, race_id, race_distance_id, first_name, last_name, bib_number, team_id, team")
            .eq("id", it.registration_id)
            .maybeSingle();
          if (!reg) continue;
          if (!firstReg) firstReg = reg;

          let bib: number | null = reg.bib_number ?? null;
          if (bib == null) {
            const { data: newBib, error: bibErr } = await supabase
              .rpc("assign_next_bib", { p_distance_id: reg.race_distance_id });
            if (bibErr) console.error("assign_next_bib (team) error:", bibErr.message);
            else bib = newBib ?? null;
          }

          const { error: teamRegErr } = await supabase
            .from("registrations")
            .update({
              status: "confirmed",
              payment_status: "paid",
              ...(bib != null && reg.bib_number == null ? { bib_number: bib } : {}),
            })
            .eq("id", reg.id);
          if (teamRegErr) console.error("Error confirming team registration:", teamRegErr.message);

          runners.push({
            name: [reg.first_name, reg.last_name].filter(Boolean).join(" "),
            bib,
          });
        }

        // Email resumen al CAPITÁN (él pagó; los miembros pueden no tener email)
        try {
          if (firstReg) {
            const [{ data: race }, { data: distance }] = await Promise.all([
              supabase.from("races").select("name, organizer_id").eq("id", firstReg.race_id).single(),
              supabase.from("race_distances").select("name").eq("id", firstReg.race_distance_id).single(),
            ]);
            let captain: { email: string | null; first_name: string | null } | null = null;
            if (firstReg.team_id) {
              const { data: team } = await supabase
                .from("teams")
                .select("captain_user_id")
                .eq("id", firstReg.team_id)
                .maybeSingle();
              if (team?.captain_user_id) {
                const { data: prof } = await supabase
                  .from("profiles")
                  .select("email, first_name")
                  .eq("id", team.captain_user_id)
                  .maybeSingle();
                captain = prof ?? null;
              }
            }

            if (captain?.email) {
              await fetch(`${SUPABASE_URL}/functions/v1/send-payment-confirmation`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  email: captain.email,
                  firstName: captain.first_name ?? "Capitán",
                  lastName: "",
                  raceName: race?.name ?? "Carrera",
                  distanceName: `${distance?.name ?? ""} — equipo ${firstReg.team ?? ""} (${runners.length} corredores)`,
                  amount: paymentIntent.amount,
                  orderNumber: orderNumber,
                  bibNumber: null,
                  formData: runners.map((r) => ({
                    label: r.bib != null ? `Dorsal ${r.bib}` : "Inscrito",
                    value: r.name,
                  })),
                  organizerEmail: null,
                }),
              });
            }

            // Push al organizador: un solo aviso para todo el lote
            if (race?.organizer_id) {
              try {
                await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({
                    userId: race.organizer_id,
                    title: "💶 ¡Inscripción de equipo pagada!",
                    body: `${firstReg.team ?? "Equipo"} — ${runners.length} corredores · ${paymentIntent.amount}€`,
                    url: "/org",
                    raceId: firstReg.race_id,
                  }),
                });
              } catch (pushError) {
                console.error("Error sending team push:", pushError);
              }
            }
          }
        } catch (emailError) {
          console.error("Error sending team confirmation email:", emailError);
        }
      }
    }

    console.log(`Payment ${orderNumber}: ${isSuccess ? 'SUCCESS' : 'FAILED'} - Code: ${responseCode}`);

    return new Response("OK", {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 });
  }
});
