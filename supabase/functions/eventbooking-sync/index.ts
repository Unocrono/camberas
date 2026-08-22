// Sincroniza los inscritos de un evento de EventBooking (uno.es) con una
// carrera de Camberas. El origen es el fichero camberas-sync.php subido a
// la raíz de Joomla, que devuelve los inscritos en JSON protegidos por
// clave. La clave de idempotencia es el ID del inscrito en EventBooking
// (registrations.external_id): repetir la sincronización nunca duplica.
//
// Secretos necesarios en Lovable:
//   EVENTBOOKING_ENDPOINT  p.ej. https://uno.es/camberas-sync.php
//   EVENTBOOKING_KEY       la misma CLAVE_API escrita en el fichero PHP
//
// La configuración por carrera (evento de EB + mapeo Modalidad→recorrido)
// vive en la tabla eventbooking_sync. Una modalidad sin mapear se reporta
// como error y esa fila NO se importa: el mapeo es explícito, no se deduce.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Busca un campo personalizado por su título visible, tolerando tildes,
// mayúsculas y puntuación ("DNI / Pasaporte" ≈ "dni pasaporte").
function campo(fields: Record<string, string>, ...candidatos: string[]): string | null {
  const mapa = new Map(Object.entries(fields).map(([k, v]) => [normalizar(k), v]));
  for (const c of candidatos) {
    const v = mapa.get(normalizar(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// "13-07-1980" | "13/07/1980" | "1980-07-13" → "1980-07-13"
function fechaISO(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// EventBooking guarda las fechas en hora de Madrid sin zona; para que la
// columna "Fecha y hora" salga bien hay que convertir a UTC respetando
// el horario de verano de la fecha en cuestión.
function madridAUtc(s: string | null): string | null {
  if (!s || s.startsWith("0000")) return null;
  const local = new Date(s.replace(" ", "T") + "Z"); // fingimos UTC
  if (isNaN(local.getTime())) return null;
  const enMadrid = new Date(
    local.toLocaleString("en-US", { timeZone: "Europe/Madrid" }),
  );
  const offsetMs = enMadrid.getTime() - local.getTime();
  return new Date(local.getTime() - offsetMs).toISOString();
}

const GENERO: Record<string, { gender: string; gender_id: number }> = {
  masculino: { gender: "Masculino", gender_id: 1 },
  hombre: { gender: "Masculino", gender_id: 1 },
  m: { gender: "Masculino", gender_id: 1 },
  h: { gender: "Masculino", gender_id: 1 },
  femenino: { gender: "Femenino", gender_id: 2 },
  mujer: { gender: "Femenino", gender_id: 2 },
  f: { gender: "Femenino", gender_id: 2 },
};

// Campos que la sincronización mantiene alineados con EventBooking.
// El dorsal queda fuera a propósito: aquí no se asigna ni se toca.
const CAMPOS_SYNC = [
  "first_name", "last_name", "email", "phone", "dni_passport",
  "gender", "gender_id", "birth_date", "city", "autonomous_community",
  "tshirt_size", "race_distance_id", "status", "payment_status",
] as const;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { race_id } = await req.json();
    if (!race_id) return json({ error: "Falta race_id" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ¿Quién llama? Solo admin o el organizador de la carrera.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;

    const [{ data: roles }, { data: race }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", uid),
      service.from("races").select("id, organizer_id").eq("id", race_id).single(),
    ]);
    const esAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!esAdmin && race?.organizer_id !== uid) {
      return json({ error: "Sin permiso sobre esta carrera" }, 403);
    }

    const { data: cfg } = await service
      .from("eventbooking_sync")
      .select("*")
      .eq("race_id", race_id)
      .single();
    if (!cfg || !cfg.enabled) {
      return json({ error: "Esta carrera no tiene sincronización EventBooking configurada" }, 404);
    }

    const endpoint = Deno.env.get("EVENTBOOKING_ENDPOINT");
    const apiKey = Deno.env.get("EVENTBOOKING_KEY");
    if (!endpoint || !apiKey) {
      return json({ error: "Faltan los secretos EVENTBOOKING_ENDPOINT / EVENTBOOKING_KEY" }, 500);
    }

    const resp = await fetch(`${endpoint}?event_id=${cfg.event_id}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!resp.ok) {
      return json({ error: `uno.es respondió ${resp.status} al pedir los inscritos` }, 502);
    }
    const origen = await resp.json();
    const registrants: any[] = origen.registrants ?? [];

    // Mapeo Modalidad → recorrido, con claves normalizadas
    const mapaDistancias = new Map<string, string>(
      Object.entries(cfg.distance_map as Record<string, string>).map(
        ([k, v]) => [normalizar(k), v],
      ),
    );

    // Inscripciones ya sincronizadas de esta carrera
    const { data: existentes } = await service
      .from("registrations")
      .select("id, external_id, " + CAMPOS_SYNC.join(", "))
      .eq("race_id", race_id)
      .not("external_id", "is", null);
    const porExternalId = new Map(
      (existentes ?? []).map((r: any) => [String(r.external_id), r]),
    );

    let nuevos = 0, actualizados = 0, sinCambios = 0;
    const errores: string[] = [];
    const inserciones: any[] = [];

    for (const r of registrants) {
      const externalId = String(r.id);
      const fields: Record<string, string> = r.fields ?? {};
      const nombre = (r.first_name ?? campo(fields, "Nombre") ?? "").trim();
      const apellidos = (r.last_name ?? campo(fields, "Apellidos") ?? "").trim();
      const etiqueta = `${nombre} ${apellidos}`.trim() || `EB #${externalId}`;

      const modalidad = campo(fields, "Modalidad") ?? "";
      const distanceId = mapaDistancias.get(normalizar(modalidad));
      if (!distanceId) {
        errores.push(`${etiqueta}: modalidad "${modalidad || "(vacía)"}" sin mapear`);
        continue;
      }

      // published de EventBooking: 0 pendiente, 1 pagado, 2 cancelado
      const pub = Number(r.published);
      const status = pub === 2 ? "cancelled" : pub === 1 ? "confirmed" : "pending";
      const paymentStatus = pub === 1 ? "paid" : "pending";

      const sexo = campo(fields, "Sexo", "Genero", "Género");
      const genero = sexo ? GENERO[normalizar(sexo)] : undefined;

      const deseado: Record<string, unknown> = {
        first_name: nombre || null,
        last_name: apellidos || null,
        email: (r.email ?? campo(fields, "Email")) || null,
        phone: (r.phone ?? campo(fields, "Tel. Movil", "Telefono", "Teléfono", "Tel. Móvil")) || null,
        dni_passport: campo(fields, "DNI / Pasaporte", "DNI", "NIF"),
        gender: genero?.gender ?? null,
        gender_id: genero?.gender_id ?? null,
        birth_date: fechaISO(campo(fields, "Fecha de Nacimiento")),
        city: campo(fields, "Localidad", "Poblacion", "Población", "Ciudad"),
        autonomous_community: campo(fields, "Com Autonoma", "Comunidad Autonoma", "Com Autónoma"),
        tshirt_size: campo(fields, "Talla camiseta", "Talla"),
        race_distance_id: distanceId,
        status,
        payment_status: paymentStatus,
      };

      const existente = porExternalId.get(externalId);
      if (!existente) {
        inserciones.push({
          ...deseado,
          race_id,
          external_id: externalId,
          source: "external",
          created_at: madridAUtc(r.register_date) ?? undefined,
        });
        nuevos++;
      } else {
        const cambios: Record<string, unknown> = {};
        for (const c of CAMPOS_SYNC) {
          if ((existente[c] ?? null) !== (deseado[c] ?? null)) cambios[c] = deseado[c];
        }
        if (Object.keys(cambios).length > 0) {
          const { error } = await service
            .from("registrations")
            .update(cambios)
            .eq("id", existente.id);
          if (error) errores.push(`${etiqueta}: ${error.message}`);
          else actualizados++;
        } else {
          sinCambios++;
        }
      }
    }

    // Altas en lotes de 100
    for (let i = 0; i < inserciones.length; i += 100) {
      const lote = inserciones.slice(i, i + 100);
      const { error } = await service.from("registrations").insert(lote);
      if (error) {
        nuevos -= lote.length;
        errores.push(`Lote de altas ${i / 100 + 1}: ${error.message}`);
      }
    }

    const resultado = {
      total_eventbooking: registrants.length,
      nuevos,
      actualizados,
      sin_cambios: sinCambios,
      errores,
    };

    await service
      .from("eventbooking_sync")
      .update({ last_sync_at: new Date().toISOString(), last_result: resultado })
      .eq("race_id", race_id);

    return json(resultado);
  } catch (e) {
    console.error("eventbooking-sync:", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});
