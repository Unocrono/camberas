import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Inscripción de EQUIPO en lote — el capitán inscribe a N miembros de su
// roster de una vez. Corre con service role (mismo criterio que
// guest-register: no depender de RLS para flujos sensibles), pero exige
// el JWT del capitán: solo él inscribe a su equipo.
//
// Precio AUTORITATIVO en servidor, por miembro:
//   base (tarifa vigente) + suplementos − descuento_equipo − descuento_cupón
// Descuento de equipo: tramo más alto de race_team_discount_tiers con
// min_members <= N (percent sobre la tarifa base; fixed = € por corredor).
// Cupón: se valida aquí y se calcula sobre la base YA reducida por el
// descuento de equipo; el canje lo registra el trigger al confirmar pago.
//
// El pago del lote (un solo cargo del capitán) va en team-init-payment;
// aquí solo se crean las inscripciones pendientes y se devuelve el total.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  raceId: z.string().uuid(),
  distanceId: z.string().uuid(),
  teamId: z.string().uuid(),
  members: z
    .array(
      z.object({
        teamMemberId: z.string().uuid(),
        formData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullish()),
      }),
    )
    .min(1)
    .max(100),
  couponCode: z.string().trim().max(60).optional(),
});

/** Texto del formulario -> gender_id (1=M, 2=F, 3=X), como en guest-register */
function genderToId(value: unknown): number | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("M")) return 1;
  if (v.startsWith("F")) return 2;
  if (v.startsWith("X")) return 3;
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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Capitán autenticado ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Necesitas iniciar sesión" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Sesión no válida" }, 401);

    const input = requestSchema.parse(await req.json());
    const { raceId, distanceId, teamId, members, couponCode } = input;

    const { data: team } = await supabase
      .from("teams")
      .select("id, name, captain_user_id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team) return json({ error: "Equipo no encontrado" }, 404);
    if (team.captain_user_id !== user.id) {
      return json({ error: "Solo el capitán puede inscribir a su equipo" }, 403);
    }

    // Miembros del lote: deben pertenecer al equipo, sin repetidos
    const memberIds = members.map((m) => m.teamMemberId);
    if (new Set(memberIds).size !== memberIds.length) {
      return json({ error: "Hay miembros repetidos en el lote" }, 400);
    }
    const { data: roster } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId)
      .in("id", memberIds);
    if ((roster ?? []).length !== memberIds.length) {
      return json({ error: "Algún miembro no pertenece a este equipo" }, 400);
    }
    const rosterById = new Map((roster ?? []).map((m: any) => [m.id, m]));

    // ── Carrera / distancia ──────────────────────────────────────────────
    const { data: distance, error: distErr } = await supabase
      .from("race_distances")
      .select("id, race_id, name, price, max_participants")
      .eq("id", distanceId)
      .eq("race_id", raceId)
      .single();
    if (distErr || !distance) return json({ error: "Distancia no encontrada" }, 404);

    // Aforo para N (reserva de 30 min para pendientes recientes)
    const N = members.length;
    if (distance.max_participants) {
      const holdCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count: taken } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("race_distance_id", distanceId)
        .neq("status", "cancelled")
        .or(`payment_status.in.(paid,not_required),created_at.gte.${holdCutoff}`);
      if ((taken ?? 0) + N > distance.max_participants) {
        return json(
          { error: `No quedan plazas para ${N} corredores (libres: ${Math.max(0, distance.max_participants - (taken ?? 0))})` },
          409,
        );
      }
    }

    // ── Datos por miembro (roster + formulario) y duplicados ─────────────
    const str = (v: unknown) => (v == null ? "" : String(v).trim());
    type Prepared = {
      teamMemberId: string;
      formData: Record<string, unknown>;
      firstName: string;
      lastName: string;
      email: string | null;
      basePrice: number;
      supplement: number;
      discountableSupplement: number;
      teamDiscount: number;
      couponDiscount: number;
      price: number;
    };
    const prepared: Prepared[] = [];
    for (const m of members) {
      const r = rosterById.get(m.teamMemberId)!;
      const firstName = str(m.formData.first_name) || str(r.first_name);
      const lastName = str(m.formData.last_name) || str(r.last_name);
      const email = (str(m.formData.email) || str(r.email)).toLowerCase() || null;
      if (!firstName || !lastName) {
        return json({ error: `Faltan nombre y apellidos de "${r.nick ?? r.first_name ?? "un miembro"}"` }, 400);
      }
      prepared.push({
        teamMemberId: m.teamMemberId,
        formData: m.formData,
        firstName,
        lastName,
        email,
        basePrice: 0,
        supplement: 0,
        discountableSupplement: 0,
        teamDiscount: 0,
        couponDiscount: 0,
        price: 0,
      });
    }

    // Duplicados dentro del lote (por email, cuando lo hay)
    const emails = prepared.map((p) => p.email).filter(Boolean) as string[];
    if (new Set(emails).size !== emails.length) {
      return json({ error: "Hay emails repetidos dentro del lote" }, 409);
    }
    // Duplicados contra inscripciones existentes: mismo email o mismo
    // miembro del roster ya inscrito en esta carrera
    if (emails.length > 0) {
      const { data: dupEmail } = await supabase
        .from("registrations")
        .select("email")
        .eq("race_id", raceId)
        .neq("status", "cancelled")
        .in("email", emails)
        .limit(1);
      if (dupEmail && dupEmail.length > 0) {
        return json({ error: `El email ${dupEmail[0].email} ya tiene inscripción en esta carrera`, code: "DUPLICATE" }, 409);
      }
    }
    {
      const { data: dupMember } = await supabase
        .from("registrations")
        .select("team_member_id")
        .eq("race_id", raceId)
        .neq("status", "cancelled")
        .in("team_member_id", memberIds)
        .limit(1);
      if (dupMember && dupMember.length > 0) {
        return json({ error: "Algún miembro del lote ya está inscrito en esta carrera", code: "DUPLICATE" }, 409);
      }
    }

    // ── Precio base vigente (tarifa por tramos o precio de la distancia) ─
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

    // Suplementos de campos con importe (misma lógica que guest-register)
    const { data: fields } = await supabase
      .from("registration_form_fields")
      .select("id, field_name, field_type, field_options")
      .eq("race_distance_id", distanceId);

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

    for (const p of prepared) {
      p.basePrice = basePrice;
      let supplement = 0;
      let discountable = 0;
      for (const f of fields ?? []) {
        const fee = fieldFee(f, p.formData[f.field_name]);
        supplement += fee;
        if (fee > 0 && (f.field_options as any)?.discountable !== false) discountable += fee;
      }
      p.supplement = Math.round(supplement * 100) / 100;
      p.discountableSupplement = discountable;
    }

    // ── Descuento de equipo: tramo más alto con min_members <= N ─────────
    const { data: teamTiers } = await supabase
      .from("race_team_discount_tiers")
      .select("min_members, discount_type, discount_value")
      .eq("race_id", raceId)
      .lte("min_members", N)
      .order("min_members", { ascending: false })
      .limit(1);
    const teamTier = teamTiers?.[0] ?? null;
    if (teamTier) {
      for (const p of prepared) {
        const raw =
          teamTier.discount_type === "percent"
            ? (p.basePrice * Number(teamTier.discount_value)) / 100
            : Number(teamTier.discount_value);
        // Acotado a la tarifa base: el descuento de equipo no toca suplementos
        p.teamDiscount = Math.min(Math.max(0, Math.round(raw * 100) / 100), p.basePrice);
      }
    }

    // ── Cupón opcional ENCIMA del descuento de equipo ────────────────────
    let couponId: string | null = null;
    if (couponCode) {
      const code = couponCode.toUpperCase().replace(/\s/g, "");
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("race_id", raceId)
        .eq("code", code)
        .maybeSingle();

      const couponError = (msg: string) => json({ error: msg, code: "COUPON" }, 400);
      if (!coupon) return couponError("El código de descuento no existe para esta carrera");
      if (!coupon.active) return couponError("Este cupón ya no está activo");
      if (coupon.race_distance_id && coupon.race_distance_id !== distanceId) {
        return couponError("Este cupón no es válido para el recorrido elegido");
      }
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        return couponError("Este cupón aún no está en vigor");
      }
      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return couponError("Este cupón ha caducado");
      }
      // El lote canjea N usos de golpe
      const { data: totalUses } = await supabase.rpc("coupon_uses", { p_coupon_id: coupon.id });
      if (coupon.max_uses != null && (totalUses ?? 0) + N > coupon.max_uses) {
        return couponError(`A este cupón le quedan ${Math.max(0, coupon.max_uses - (totalUses ?? 0))} usos y el lote necesita ${N}`);
      }
      for (const p of prepared) {
        if (!p.email) continue;
        const { data: emailUses } = await supabase.rpc("coupon_uses", {
          p_coupon_id: coupon.id,
          p_email: p.email,
        });
        if ((emailUses ?? 0) >= coupon.max_uses_per_email) {
          return couponError(`${p.email} ya ha usado este cupón`);
        }
      }
      for (const p of prepared) {
        // Base del cupón: tarifa YA reducida por el descuento de equipo
        // (+ suplementos descontables si el cupón va sobre el total)
        const reducedBase = Math.max(0, p.basePrice - p.teamDiscount);
        const discountBase = Math.max(
          0,
          coupon.applies_to === "total" ? reducedBase + p.discountableSupplement : reducedBase,
        );
        if (coupon.min_amount != null && discountBase + (coupon.applies_to === "total" ? 0 : p.supplement) < Number(coupon.min_amount)) {
          return couponError(`Este cupón requiere un importe mínimo de ${Number(coupon.min_amount)}€ por inscripción`);
        }
        const raw =
          coupon.discount_type === "percent"
            ? (discountBase * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
        p.couponDiscount = Math.min(
          Math.max(0, Math.round(raw * 100) / 100),
          Math.round(discountBase * 100) / 100,
        );
      }
      couponId = coupon.id;
    }

    // ── Total (redondeo a céntimos POR corredor, luego suma) ─────────────
    for (const p of prepared) {
      p.price = Math.max(
        0,
        Math.round((p.basePrice + p.supplement - p.teamDiscount - p.couponDiscount) * 100) / 100,
      );
    }
    const total = Math.round(prepared.reduce((s, p) => s + p.price, 0) * 100) / 100;
    const isFree = !(total > 0);

    // ── Crear las N inscripciones (un solo INSERT: o todas o ninguna) ────
    const rows = prepared.map((p) => ({
      race_id: raceId,
      race_distance_id: distanceId,
      status: isFree ? "confirmed" : "pending",
      payment_status: isFree ? "not_required" : "pending",
      source: isFree ? "free" : "gateway",
      team_id: teamId,
      team_member_id: p.teamMemberId,
      team: team.name,
      team_discount: p.teamDiscount > 0 ? p.teamDiscount : null,
      coupon_id: couponId,
      coupon_discount: couponId ? p.couponDiscount : null,
      user_id: rosterById.get(p.teamMemberId)!.user_id ?? null,
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email,
      phone: str(p.formData.phone) || str(rosterById.get(p.teamMemberId)!.phone) || null,
      dni_passport: str(p.formData.document_number) || str(rosterById.get(p.teamMemberId)!.dni_passport) || null,
      birth_date: str(p.formData.birth_date) || rosterById.get(p.teamMemberId)!.birth_date || null,
      gender: str(p.formData.gender) || rosterById.get(p.teamMemberId)!.gender || null,
      gender_id: genderToId(str(p.formData.gender) || rosterById.get(p.teamMemberId)!.gender),
      tshirt_size: p.formData.tshirt_size ? String(p.formData.tshirt_size) : null,
      club: p.formData.club ? String(p.formData.club) : null,
      country: p.formData.country ? String(p.formData.country) : null,
      address: p.formData.address ? String(p.formData.address) : null,
      city: p.formData.city ? String(p.formData.city) : null,
      province: p.formData.province ? String(p.formData.province) : null,
      autonomous_community: p.formData.autonomous_community
        ? String(p.formData.autonomous_community)
        : null,
    }));

    const { data: created, error: regErr } = await supabase
      .from("registrations")
      .insert(rows)
      .select("id, team_member_id");
    if (regErr || !created || created.length !== rows.length) {
      console.error("team-register insert error:", regErr?.message);
      return json({ error: "No se pudieron crear las inscripciones" }, 500);
    }
    const regIdByMember = new Map(created.map((c: any) => [c.team_member_id, c.id]));

    // Respuestas del formulario por inscripción
    if (fields && fields.length > 0) {
      const responses: { registration_id: string; field_id: string; field_value: string }[] = [];
      for (const p of prepared) {
        const regId = regIdByMember.get(p.teamMemberId);
        if (!regId) continue;
        for (const f of fields) {
          const v = p.formData[f.field_name];
          if (v !== undefined && v !== "" && v !== null) {
            responses.push({ registration_id: regId, field_id: f.id, field_value: String(v) });
          }
        }
      }
      if (responses.length > 0) {
        const { error: respErr } = await supabase.from("registration_responses").insert(responses);
        if (respErr) console.error("team-register responses error:", respErr.message);
      }
    }

    // Gratis: dorsal ya (los de pago lo reciben en el webhook al confirmar)
    if (isFree) {
      for (const p of prepared) {
        const regId = regIdByMember.get(p.teamMemberId);
        if (!regId) continue;
        const { data: bib, error: bibErr } = await supabase
          .rpc("assign_next_bib", { p_distance_id: distanceId });
        if (bibErr) {
          console.error("assign_next_bib error:", bibErr.message);
          continue;
        }
        await supabase.from("registrations").update({ bib_number: bib ?? null }).eq("id", regId);
      }
    }

    console.log(
      `team-register: ${created.length} inscripciones de "${team.name}" (${distance.name}) total=${total} capitan=${user.id}`,
    );

    return json({
      success: true,
      registrationIds: created.map((c: any) => c.id),
      total,
      isFree,
      breakdown: prepared.map((p) => ({
        teamMemberId: p.teamMemberId,
        registrationId: regIdByMember.get(p.teamMemberId),
        name: `${p.firstName} ${p.lastName}`,
        base: p.basePrice,
        supplement: p.supplement,
        teamDiscount: p.teamDiscount,
        couponDiscount: p.couponDiscount,
        price: p.price,
      })),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return json({ error: "Datos de inscripción inválidos", details: error.errors }, 400);
    }
    console.error("team-register error:", error);
    return json({ error: error.message ?? "Error desconocido" }, 500);
  }
});
