import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Validación de cupones para el formulario de inscripción. Solo LEE: no
// consume usos ni crea nada — el canje lo registra el trigger de
// registrations cuando el pago queda resuelto. El descuento que devuelve es
// informativo (desglose en pantalla); el importe que se cobra lo recalculan
// guest-register / redsys-init-payment con estas mismas reglas.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  code: z.string().trim().min(1).max(60),
  raceId: z.string().uuid(),
  distanceId: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  formData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullish()).optional(),
});

/** Mismo cálculo de suplemento que guest-register / redsys-init-payment */
function fieldFee(f: any, value: unknown): number {
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
}

/**
 * Descuento del cupón, redondeado a céntimos y nunca mayor que su base:
 *  - applies_to='base':  descuenta solo la tarifa de inscripción.
 *  - applies_to='total': tarifa + suplementos descontables. Un suplemento es
 *    descontable si es positivo y su campo no marca discountable=false (los
 *    negativos ya son un descuento: no se amplifican con el cupón).
 */
export function computeCouponDiscount(
  coupon: { discount_type: string; discount_value: unknown; applies_to: string },
  basePrice: number,
  discountableSupplement: number,
): number {
  const base = Math.max(
    0,
    coupon.applies_to === "total" ? basePrice + discountableSupplement : basePrice,
  );
  const raw =
    coupon.discount_type === "percent"
      ? (base * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(Math.max(0, rounded), Math.round(base * 100) / 100);
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
  const invalid = (reason: string) => json({ valid: false, reason });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const input = requestSchema.parse(await req.json());
    const code = input.code.toUpperCase().replace(/\s/g, "");

    // Cupón por carrera + código (el trigger de la tabla ya guarda el código
    // normalizado en mayúsculas y sin espacios)
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("race_id", input.raceId)
      .eq("code", code)
      .maybeSingle();

    if (!coupon) return invalid("El código no existe para esta carrera");
    if (!coupon.active) return invalid("Este cupón ya no está activo");
    if (coupon.race_distance_id && coupon.race_distance_id !== input.distanceId) {
      return invalid("Este cupón no es válido para el recorrido elegido");
    }

    const now = new Date();
    if (coupon.valid_from && now < new Date(coupon.valid_from)) {
      return invalid("Este cupón aún no está en vigor");
    }
    if (coupon.valid_until && now > new Date(coupon.valid_until)) {
      return invalid("Este cupón ha caducado");
    }

    // Usos: canjes de inscripciones NO canceladas (cancelar libera el uso)
    const { data: totalUses } = await supabase.rpc("coupon_uses", { p_coupon_id: coupon.id });
    if (coupon.max_uses != null && (totalUses ?? 0) >= coupon.max_uses) {
      return invalid("Este cupón ya ha agotado sus usos");
    }
    if (input.email) {
      const { data: emailUses } = await supabase.rpc("coupon_uses", {
        p_coupon_id: coupon.id,
        p_email: input.email,
      });
      if ((emailUses ?? 0) >= coupon.max_uses_per_email) {
        return invalid("Ya has usado este cupón");
      }
    }

    // Precio vigente: tarifa por tramos si existe, si no el precio base
    const nowIso = now.toISOString();
    const { data: tier } = await supabase
      .from("race_distance_prices")
      .select("price")
      .eq("race_distance_id", input.distanceId)
      .lte("start_datetime", nowIso)
      .gte("end_datetime", nowIso)
      .order("start_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();
    let basePrice: number;
    if (tier?.price != null) {
      basePrice = Number(tier.price);
    } else {
      const { data: dist } = await supabase
        .from("race_distances")
        .select("price")
        .eq("id", input.distanceId)
        .eq("race_id", input.raceId)
        .single();
      basePrice = dist?.price != null ? Number(dist.price) : 0;
    }

    // Suplementos, separando la parte descontable (positiva y sin
    // discountable=false) por si el cupón aplica sobre el total
    const { data: fields } = await supabase
      .from("registration_form_fields")
      .select("field_name, field_type, field_options")
      .eq("race_distance_id", input.distanceId);

    let supplement = 0;
    let discountableSupplement = 0;
    for (const f of fields ?? []) {
      const fee = fieldFee(f, input.formData?.[f.field_name]);
      supplement += fee;
      if (fee > 0 && f.field_options?.discountable !== false) {
        discountableSupplement += fee;
      }
    }
    supplement = Math.round(supplement * 100) / 100;

    const grossTotal = Math.max(0, Math.round((basePrice + supplement) * 100) / 100);
    if (coupon.min_amount != null && grossTotal < Number(coupon.min_amount)) {
      return invalid(`Este cupón requiere un importe mínimo de ${Number(coupon.min_amount)}€`);
    }

    const discount = computeCouponDiscount(coupon, basePrice, discountableSupplement);
    const newTotal = Math.max(0, Math.round((basePrice + supplement - discount) * 100) / 100);

    return json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value),
      appliesTo: coupon.applies_to,
      couponId: coupon.id,
      basePrice,
      supplement,
      discount,
      newTotal,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return json({ valid: false, reason: "Datos inválidos" }, 400);
    }
    console.error("validate-coupon error:", error);
    return json({ error: error.message ?? "Error desconocido" }, 500);
  }
});
