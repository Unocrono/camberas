/**
 * Alta de un corredor por la organización — el MISMO componente en Camberas
 * Org («Añadir corredor», móvil) y en el panel (Inscripciones → «Nueva
 * inscripción»).
 *
 * El caso: llega a la mesa de recogida un despistado que no se inscribió o
 * no pagó. Se le inscribe en el momento con el formulario COMPLETO del
 * recorrido (el mismo que ve el corredor en la web: preguntas propias,
 * condiciones, categoría, comentarios), se anota cómo entra (pagado en mano,
 * invitado o pendiente de pago) y se le da dorsal: el siguiente libre del
 * rango del recorrido o uno a mano.
 *
 * - Funciona con las inscripciones cerradas: la fecha de cierre es de la web
 *   pública, no de la organización. Con el recorrido lleno avisa, pero deja.
 * - Si faltan obligatorios, avisa y deja guardar: se completan luego en el
 *   panel. Solo nombre y apellidos son imprescindibles.
 * - Alta manual (source 'manual'): no pasa por la pasarela ni factura
 *   comisión; lo cobrado en mano va a importe_manual, aparte de la pasarela.
 * - Respuestas y dorsal: política «Organizadores gestionan respuestas de sus
 *   carreras» y RPC asignar_dorsal_siguiente (20261019120000).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from "lucide-react";

interface Recorrido {
  id: string;
  name: string;
  distance_km: number | null;
  price: number | null;
  bib_start: number | null;
}

type ComoEntra = "pagado" | "invitado" | "pendiente";
type ModoDorsal = "siguiente" | "manual" | "ninguno";

interface Hecho {
  nombre: string;
  recorrido: string;
  dorsal: number | null;
  como: ComoEntra;
  importe: number | null;
  avisoDorsal: string | null;
}

interface Props {
  raceId: string;
  /** Tras cada alta (el panel recarga la lista) */
  onHecho?: () => void;
}

/** gender_id que usan las estadísticas (1=M, 2=F, 3=X): igual que RaceDetail */
function genderToId(value: unknown): number | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("M")) return 1;
  if (v.startsWith("F")) return 2;
  if (v.startsWith("X")) return 3;
  return null;
}

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

const dniNorm = (s: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const euros = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €";

const ETIQUETA_COMO: Record<ComoEntra, string> = {
  pagado: "Pagado en mano",
  invitado: "Invitado (gratis)",
  pendiente: "Pendiente de pago",
};

export const AltaCorredor = ({ raceId, onHecho }: Props) => {
  const { toast } = useToast();
  const [recorridos, setRecorridos] = useState<Recorrido[] | null>(null);
  const [distanceId, setDistanceId] = useState("");
  // ¿El recorrido tiene formulario? Si no, nombre y poco más a mano
  const [hayFormulario, setHayFormulario] = useState<boolean | null>(null);
  const [datos, setDatos] = useState<Record<string, any>>({});
  const [suplemento, setSuplemento] = useState(0);
  const [faltan, setFaltan] = useState<string[]>([]);
  const [como, setComo] = useState<ComoEntra>("pagado");
  const [importe, setImporte] = useState("");
  const [importeTocado, setImporteTocado] = useState(false);
  const [modoDorsal, setModoDorsal] = useState<ModoDorsal>("siguiente");
  const [dorsalManual, setDorsalManual] = useState("");
  const [plazasLibres, setPlazasLibres] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  // Para remontar el formulario vacío tras cada alta
  const [vuelta, setVuelta] = useState(0);

  const recorrido = recorridos?.find((r) => r.id === distanceId) ?? null;
  const numeraSolo = recorrido?.bib_start != null;

  // ── Recorridos de la carrera ──────────────────────────────────────────
  useEffect(() => {
    setRecorridos(null);
    setDistanceId("");
    if (!raceId) return;
    let vivo = true;
    supabase
      .from("race_distances")
      .select("id, name, distance_km, price, bib_start")
      .eq("race_id", raceId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("distance_km", { ascending: true })
      .then(({ data }) => {
        if (!vivo) return;
        const lista = (data ?? []) as Recorrido[];
        setRecorridos(lista);
        // Con un solo recorrido no hay nada que elegir
        if (lista.length === 1) setDistanceId(lista[0].id);
      });
    return () => { vivo = false; };
  }, [raceId]);

  // ── Al elegir recorrido: formulario, plazas y dorsal por defecto ─────
  useEffect(() => {
    setDatos({});
    setFaltan([]);
    setSuplemento(0);
    setHayFormulario(null);
    setPlazasLibres(null);
    if (!distanceId) return;
    let vivo = true;
    (async () => {
      const [{ count }, { data: plazas }] = await Promise.all([
        supabase
          .from("registration_form_fields")
          .select("id", { count: "exact", head: true })
          .eq("race_distance_id", distanceId)
          .eq("is_visible", true),
        supabase.rpc("plazas_libres", { p_distance_id: distanceId }),
      ]);
      if (!vivo) return;
      setHayFormulario((count ?? 0) > 0);
      setPlazasLibres(typeof plazas === "number" ? plazas : null);
    })();
    return () => { vivo = false; };
  }, [distanceId, vuelta]);

  useEffect(() => {
    setModoDorsal(numeraSolo ? "siguiente" : "manual");
  }, [distanceId, numeraSolo]);

  // El importe sugerido sigue al precio y a los extras hasta que se toca a mano
  useEffect(() => {
    if (importeTocado) return;
    const base = Number(recorrido?.price ?? 0) + suplemento;
    setImporte(base > 0 ? String(Math.round(base * 100) / 100) : "");
  }, [recorrido?.price, suplemento, importeTocado]);

  const cambiar = useCallback((campo: string, valor: any) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }, []);

  const otro = () => {
    setHecho(null);
    setDatos({});
    setFaltan([]);
    setImporteTocado(false);
    setDorsalManual("");
    setComo("pagado");
    setVuelta((v) => v + 1);
  };

  const guardar = async () => {
    if (!recorrido) {
      toast({ title: "Falta el recorrido", description: "Elige en qué recorrido corre.", variant: "destructive" });
      return;
    }
    const nombre = texto(datos.first_name);
    const apellidos = texto(datos.last_name);
    if (!nombre || !apellidos) {
      toast({ title: "Faltan datos", description: "Nombre y apellidos son imprescindibles.", variant: "destructive" });
      return;
    }
    const dni = texto(datos.document_number) ?? texto(datos.dni_passport);
    const dorsalPuesto = modoDorsal === "manual" && dorsalManual ? parseInt(dorsalManual, 10) : null;
    if (modoDorsal === "manual" && dorsalManual && (!Number.isFinite(dorsalPuesto) || (dorsalPuesto ?? 0) <= 0)) {
      toast({ title: "Dorsal no válido", description: "Pon un número de dorsal o elige «Siguiente libre».", variant: "destructive" });
      return;
    }
    const importeNum = como === "pagado" && importe !== "" ? Number(importe) : null;
    if (importeNum != null && (!Number.isFinite(importeNum) || importeNum < 0)) {
      toast({ title: "Importe no válido", description: "Pon lo cobrado en euros.", variant: "destructive" });
      return;
    }

    setGuardando(true);
    try {
      // ¿Ya está inscrito? (mismo DNI, o mismo nombre y apellidos) — se pregunta
      const { data: yaHay } = await supabase
        .from("registrations")
        .select("id, first_name, last_name, dni_passport, bib_number, status")
        .eq("race_id", raceId)
        .neq("status", "cancelled");
      const dniN = dniNorm(dni);
      const nombreN = `${nombre} ${apellidos}`.toLowerCase().replace(/\s+/g, " ");
      const repetida = (yaHay ?? []).find(
        (r: any) =>
          (dniN && dniNorm(r.dni_passport) === dniN) ||
          `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim() === nombreN,
      ) as any;
      if (
        repetida &&
        !window.confirm(
          `Ya hay una inscripción de ${repetida.first_name ?? ""} ${repetida.last_name ?? ""}` +
            `${repetida.bib_number ? ` (dorsal ${repetida.bib_number})` : ""} en esta carrera.\n\n¿Inscribir igualmente?`,
        )
      ) {
        setGuardando(false);
        return;
      }
      if (dorsalPuesto != null && (yaHay ?? []).some((r: any) => r.bib_number === dorsalPuesto)) {
        if (!window.confirm(`El dorsal ${dorsalPuesto} ya lo tiene otro corredor de esta carrera. ¿Ponerlo igualmente?`)) {
          setGuardando(false);
          return;
        }
      }

      // 1) La inscripción, con las columnas que copia también la web
      const { data: nueva, error } = await supabase
        .from("registrations")
        .insert({
          race_id: raceId,
          race_distance_id: recorrido.id,
          first_name: nombre,
          last_name: apellidos,
          email: texto(datos.email)?.toLowerCase() ?? null,
          phone: texto(datos.phone),
          dni_passport: dni,
          birth_date: texto(datos.birth_date),
          gender: texto(datos.gender),
          gender_id: genderToId(datos.gender),
          tshirt_size: texto(datos.tshirt_size),
          club: texto(datos.club),
          team: texto(datos.team),
          country: texto(datos.country),
          address: texto(datos.address),
          city: texto(datos.city),
          province: texto(datos.province),
          autonomous_community: texto(datos.autonomous_community),
          status: como === "pendiente" ? "pending" : "confirmed",
          payment_status: como === "pagado" ? "paid" : como === "invitado" ? "not_required" : "pending",
          importe_manual: importeNum,
          bib_number: dorsalPuesto,
          // Alta de la organización: no pasa por la pasarela, no factura comisión
          source: "manual",
        } as any)
        .select("id")
        .single();
      if (error || !nueva) throw error ?? new Error("No se pudo crear la inscripción");

      // 2) Las respuestas del formulario (como la web: todas las que tienen
      //    valor; un comentario no guarda nada)
      let avisoRespuestas: string | null = null;
      const { data: campos } = await supabase
        .from("registration_form_fields")
        .select("id, field_name, field_type")
        .eq("race_distance_id", recorrido.id);
      const respuestas = ((campos ?? []) as { id: string; field_name: string; field_type: string }[])
        .filter((c) => c.field_type !== "comment")
        .filter((c) => datos[c.field_name] !== undefined && datos[c.field_name] !== null && String(datos[c.field_name]).trim() !== "")
        .map((c) => ({ registration_id: nueva.id, field_id: c.id, field_value: String(datos[c.field_name]) }));
      if (respuestas.length) {
        const { error: errResp } = await supabase.from("registration_responses").insert(respuestas);
        if (errResp) avisoRespuestas = `Inscrito, pero no se guardaron las respuestas: ${errResp.message}`;
      }

      // 3) El dorsal siguiente, si se pidió
      let dorsal = dorsalPuesto;
      let avisoDorsal: string | null = avisoRespuestas;
      if (modoDorsal === "siguiente") {
        const { data: bib, error: errBib } = await supabase.rpc("asignar_dorsal_siguiente" as never, {
          p_registration_id: nueva.id,
        } as never);
        if (errBib) avisoDorsal = `Inscrito sin dorsal: ${errBib.message}`;
        else if (bib == null) avisoDorsal = "Inscrito sin dorsal: el recorrido no tiene rango o se ha agotado. Pónselo a mano.";
        else dorsal = Number(bib);
      }

      setHecho({ nombre: `${nombre} ${apellidos}`, recorrido: recorrido.name, dorsal, como, importe: importeNum, avisoDorsal });
      onHecho?.();
    } catch (e: any) {
      toast({ title: "No se pudo inscribir", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  if (!raceId) return <p className="py-6 text-center text-sm text-muted-foreground">Elige una carrera.</p>;
  if (recorridos === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }
  if (recorridos.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Esta carrera no tiene recorridos todavía.</p>;
  }

  // ── Hecho: lo que hay que decirle al corredor ─────────────────────────
  if (hecho) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-secondary bg-secondary/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-secondary" />
          <p className="mt-2 text-lg font-bold">{hecho.nombre}</p>
          <p className="text-sm text-muted-foreground">{hecho.recorrido}</p>
          <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">Dorsal</p>
          <p className="text-5xl font-bold leading-none">{hecho.dorsal ?? "—"}</p>
          <p className="mt-3 text-sm">
            {ETIQUETA_COMO[hecho.como]}
            {hecho.como === "pagado" && hecho.importe != null && ` · ${euros(hecho.importe)}`}
          </p>
        </div>
        {hecho.avisoDorsal && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {hecho.avisoDorsal}
          </p>
        )}
        <Button onClick={otro} className="w-full">
          <UserPlus className="mr-2 h-4 w-4" /> Inscribir a otro
        </Button>
      </div>
    );
  }

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
      activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
    }`;

  return (
    <div className="space-y-4">
      {/* Recorrido */}
      <div className="space-y-1.5">
        <Label htmlFor="alta-recorrido">Recorrido *</Label>
        <Select value={distanceId} onValueChange={setDistanceId}>
          <SelectTrigger id="alta-recorrido">
            <SelectValue placeholder="¿En qué recorrido corre?" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            {recorridos.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}{d.distance_km ? ` (${d.distance_km} km)` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {plazasLibres != null && plazasLibres <= 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Recorrido completo: se inscribe igualmente, por encima del cupo.
          </p>
        )}
      </div>

      {/* Datos del corredor: el formulario completo del recorrido */}
      {distanceId && hayFormulario === null && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
        </div>
      )}
      {distanceId && hayFormulario === true && (
        <DynamicRegistrationForm
          key={`${distanceId}-${vuelta}`}
          raceId={raceId}
          distanceId={distanceId}
          formData={datos}
          onChange={cambiar}
          onSupplementChange={setSuplemento}
          onMissingRequiredChange={setFaltan}
          prefillFromProfile={false}
        />
      )}
      {distanceId && hayFormulario === false && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alta-nombre">Nombre *</Label>
              <Input id="alta-nombre" value={datos.first_name ?? ""} onChange={(e) => cambiar("first_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alta-apellidos">Apellidos *</Label>
              <Input id="alta-apellidos" value={datos.last_name ?? ""} onChange={(e) => cambiar("last_name", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alta-dni">DNI</Label>
              <Input id="alta-dni" value={datos.document_number ?? ""} onChange={(e) => cambiar("document_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alta-tel">Teléfono</Label>
              <Input id="alta-tel" type="tel" value={datos.phone ?? ""} onChange={(e) => cambiar("phone", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alta-email">Email</Label>
            <Input id="alta-email" type="email" value={datos.email ?? ""} onChange={(e) => cambiar("email", e.target.value)} />
          </div>
        </div>
      )}

      {distanceId && (
        <>
          {/* Cómo entra */}
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <p className="text-sm font-bold">¿Cómo entra?</p>
            <div className="flex flex-wrap gap-2">
              {(["pagado", "invitado", "pendiente"] as ComoEntra[]).map((c) => (
                <button key={c} type="button" onClick={() => setComo(c)} className={chip(como === c)}>
                  {ETIQUETA_COMO[c]}
                </button>
              ))}
            </div>
            {como === "pagado" && (
              <div className="space-y-1">
                <Label htmlFor="alta-importe">Cobrado (€) — efectivo, Bizum…</Label>
                <Input
                  id="alta-importe"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={importe}
                  onChange={(e) => { setImporte(e.target.value); setImporteTocado(true); }}
                />
                <p className="text-xs text-muted-foreground">Sale aparte de la pasarela, como cobrado a mano.</p>
              </div>
            )}
          </div>

          {/* Dorsal */}
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <p className="text-sm font-bold">Dorsal</p>
            <div className="flex flex-wrap gap-2">
              {numeraSolo && (
                <button type="button" onClick={() => setModoDorsal("siguiente")} className={chip(modoDorsal === "siguiente")}>
                  Siguiente libre
                </button>
              )}
              <button type="button" onClick={() => setModoDorsal("manual")} className={chip(modoDorsal === "manual")}>
                Lo pongo yo
              </button>
              <button type="button" onClick={() => setModoDorsal("ninguno")} className={chip(modoDorsal === "ninguno")}>
                Sin dorsal
              </button>
            </div>
            {modoDorsal === "manual" && (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={dorsalManual}
                onChange={(e) => setDorsalManual(e.target.value)}
                placeholder="Número de dorsal"
              />
            )}
            {modoDorsal === "siguiente" && (
              <p className="text-xs text-muted-foreground">Se le da el siguiente número libre del rango del recorrido al guardar.</p>
            )}
            {!numeraSolo && (
              <p className="text-xs text-muted-foreground">Este recorrido no tiene rango de dorsales: pónselo a mano.</p>
            )}
          </div>

          {/* Obligatorios sin rellenar: se avisa, no se bloquea */}
          {faltan.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Faltan: {faltan.join(", ")}. Se puede guardar y completar luego en el panel.
            </p>
          )}

          <Button onClick={guardar} disabled={guardando} className="w-full">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span className="ml-2">Inscribir{modoDorsal === "siguiente" ? " y dar dorsal" : ""}</span>
          </Button>
        </>
      )}
    </div>
  );
};
