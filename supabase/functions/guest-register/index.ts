import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Inscripción de invitados (sin cuenta) — todo el flujo corre con service
// role en servidor: no depende de políticas RLS para anon (que las
// revisiones de seguridad tienden a eliminar) y asigna el dorsal de forma
// atómica vía assign_next_bib().

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  raceId: z.string().uuid(),
  distanceId: z.string().uuid(),
  formData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullish()),
});

/**
 * Texto del formulario -> gender_id de la tabla genders (1=M, 2=F, 3=X).
 * Las estadísticas del panel usan gender_id, no el texto.
 */
function genderToId(value: unknown): number | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("M")) return 1; // M / Masculino / Male
  if (v.startsWith("F")) return 2; // F / Femenino / Female
  if (v.startsWith("X")) return 3; // X / Mixto / Otro
  return null;
}

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const input = requestSchema.parse(await req.json());
    const { raceId, distanceId, formData } = input;

    // Campos de sistema extraídos del formulario dinámico
    const str = (v: unknown) => (v == null ? "" : String(v).trim());
    const firstName = str(formData.first_name);
    const lastName = str(formData.last_name);
    const email = str(formData.email).toLowerCase();
    const phone = str(formData.phone);
    const documentNumber = str(formData.document_number);
    const birthDate = str(formData.birth_date);
    const gender = str(formData.gender);

    if (!email || !firstName || !lastName) {
      return json({ error: "Faltan campos obligatorios (nombre, apellidos, email)" }, 400);
    }

    // La distancia debe pertenecer a la carrera indicada
    const { data: distance, error: distErr } = await supabase
      .from("race_distances")
      .select("id, race_id, name, price")
      .eq("id", distanceId)
      .eq("race_id", raceId)
      .single();
    if (distErr || !distance) {
      return json({ error: "Distancia no encontrada" }, 404);
    }

    // Duplicado: mismo email en la misma carrera (con service role el
    // check funciona también para invitados, cosa que RLS impedía)
    const { data: existing } = await supabase
      .from("registrations")
      .select("id")
      .eq("race_id", raceId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return json({ error: "Este email ya tiene una inscripción para esta carrera", code: "DUPLICATE" }, 409);
    }

    // Precio vigente: tarifa por tramos si existe, si no el precio base
    const nowIso = new Date().toISOString();
    const { data: tier } = await supabase
      .from("race_distance_prices")
      .select("price")
      .eq("race_distance_id", distanceId)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();
    const basePrice = tier?.price != null ? Number(tier.price) : (distance.price != null ? Number(distance.price) : 0);

    // Campos del formulario (también se usan luego para guardar respuestas)
    const { data: fields } = await supabase
      .from("registration_form_fields")
      .select("id, field_name, field_type, field_options")
      .eq("race_distance_id", distanceId);

    // Suplemento de los campos con importe (fee_enabled en field_options):
    //  - select/radio: fees[] paralelo a options
    //  - number: fee_amount × valor · checkbox/otros: fee_amount si se marca
    const fieldFee = (f: any, value: unknown): number => {
      const o = f.field_options;
      if (!o || Array.isArray(o) || o.fee_enabled !== true || value == null || value === "") return 0;
      if (Array.isArray(o.options) && Array.isArray(o.fees)) {
        const idx = o.options.indexOf(String(value));
        return idx >= 0 ? Number(o.fees[idx]) || 0 : 0;
      }
      const amount = Number(o.fee_amount) || 0;
      if (f.field_type === "number") {
        const n = parseFloat(String(value));
        return isNaN(n) ? 0 : amount * n;
      }
      const checked = value === true || value === "true" || value === "on" || value === "1";
      return checked ? amount : 0;
    };
    const supplement = (fields ?? []).reduce((sum, f) => sum + fieldFee(f, formData[f.field_name]), 0);
    const price = Math.max(0, Math.round((basePrice + supplement) * 100) / 100);

    const isFree = !(price > 0);

    // Dorsal atómico — SOLO para inscripciones gratuitas. Las de pago lo
    // reciben en redsys-webhook al confirmarse el cobro, para no quemar
    // dorsales con inscripciones que nunca llegan a pagar.
    let bibNumber: number | null = null;
    if (isFree) {
      const { data, error: bibErr } = await supabase
        .rpc("assign_next_bib", { p_distance_id: distanceId });
      if (bibErr) {
        console.error("assign_next_bib error:", bibErr.message);
      } else {
        bibNumber = data ?? null;
      }
    }

    // Crear la inscripción
    const { data: registration, error: regErr } = await supabase
      .from("registrations")
      .insert({
        race_id: raceId,
        race_distance_id: distanceId,
        status: isFree ? "confirmed" : "pending",
        payment_status: isFree ? "not_required" : "pending",
        // Origen para facturación: la de pago va por la pasarela
        source: isFree ? "free" : "gateway",
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        dni_passport: documentNumber,
        birth_date: birthDate || null,
        gender: gender || null,
        // gender_id es lo que usan las estadísticas (1=M, 2=F, 3=X).
        // Sin esto, el panel contaba a todo el mundo como "X".
        gender_id: genderToId(gender),
        bib_number: bibNumber ?? null,
        // Estos llegan como campos del formulario; se copian a sus columnas
        // para que el panel, los informes y los exports los vean
        tshirt_size: formData.tshirt_size ? String(formData.tshirt_size) : null,
        club: formData.club ? String(formData.club) : null,
        team: formData.team ? String(formData.team) : null,
        country: formData.country ? String(formData.country) : null,
        address: formData.address ? String(formData.address) : null,
        city: formData.city ? String(formData.city) : null,
        province: formData.province ? String(formData.province) : null,
        autonomous_community: formData.autonomous_community
          ? String(formData.autonomous_community)
          : null,
      })
      .select("id, bib_number")
      .single();
    if (regErr || !registration) {
      console.error("Error creating registration:", regErr?.message);
      return json({ error: "No se pudo crear la inscripción" }, 500);
    }

    // Guardar todas las respuestas del formulario
    if (fields && fields.length > 0) {
      const responses = fields
        .filter((f) => formData[f.field_name] !== undefined && formData[f.field_name] !== "" && formData[f.field_name] !== null)
        .map((f) => ({
          registration_id: registration.id,
          field_id: f.id,
          field_value: String(formData[f.field_name]),
        }));
      if (responses.length > 0) {
        const { error: respErr } = await supabase.from("registration_responses").insert(responses);
        if (respErr) {
          console.error("Error saving form responses:", respErr.message);
        }
      }
    }

    console.log(`Guest registration ${registration.id} (${email}) bib=${registration.bib_number} price=${price}`);

    return json({
      success: true,
      registrationId: registration.id,
      bibNumber: registration.bib_number,
      price,
      isFree,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return json({ error: "Datos de inscripción inválidos", details: error.errors }, 400);
    }
    console.error("guest-register error:", error);
    return json({ error: error.message ?? "Error desconocido" }, 500);
  }
});
