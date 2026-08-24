/**
 * Inscripción de EQUIPO en lote — el capitán elige carrera y recorrido,
 * marca miembros de su roster, completa el formulario de cada uno y paga
 * TODO en un solo cargo (team-register crea las inscripciones pendientes;
 * team-init-payment cobra el lote; el webhook confirma y asigna dorsales).
 * El precio mostrado es orientativo: el autoritativo lo devuelve el
 * servidor en team-register y se recalcula al firmar el pago.
 */
import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, TicketPercent, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";
import { RedsysPaymentForm } from "@/components/payment/RedsysPaymentForm";
import type { Session } from "@supabase/supabase-js";

interface Team {
  id: string;
  name: string;
  captain_user_id: string;
}

interface Member {
  id: string;
  user_id: string | null;
  nick: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dni_passport: string | null;
  birth_date: string | null;
  gender: string | null;
}

interface RaceOption {
  id: string;
  name: string;
  date: string;
}

interface DistanceOption {
  id: string;
  name: string;
  distance_km: number | null;
  price: number | null;
  registration_opens: string | null;
  registration_closes: string | null;
}

interface TeamTier {
  min_members: number;
  discount_type: "percent" | "fixed";
  discount_value: number;
}

interface BreakdownRow {
  registrationId: string;
  name: string;
  base: number;
  supplement: number;
  teamDiscount: number;
  couponDiscount: number;
  price: number;
}

const nombreVisible = (m: Member) => m.nick?.trim() || m.first_name?.trim() || "(sin nombre)";

/** formData inicial de un miembro: sus datos estables del roster */
const formDataDesdeRoster = (m: Member): Record<string, any> => ({
  first_name: m.first_name ?? "",
  last_name: m.last_name ?? "",
  email: m.email ?? "",
  phone: m.phone ?? "",
  document_number: m.dni_passport ?? "",
  birth_date: m.birth_date ?? "",
  gender: m.gender ?? "",
});

const TeamRegister = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [cargando, setCargando] = useState(true);

  const [carreras, setCarreras] = useState<RaceOption[]>([]);
  const [carreraId, setCarreraId] = useState<string>("");
  const [distancias, setDistancias] = useState<DistanceOption[]>([]);
  const [distanciaId, setDistanciaId] = useState<string>("");
  const [tramos, setTramos] = useState<TeamTier[]>([]);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [formularios, setFormularios] = useState<Record<string, Record<string, any>>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cupon, setCupon] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Paso de pago (tras crear el lote)
  const [lote, setLote] = useState<{
    registrationIds: string[];
    total: number;
    breakdown: BreakdownRow[];
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Equipo + roster (RLS: solo el capitán los ve completos)
  useEffect(() => {
    if (!session || !teamId) return;
    (async () => {
      setCargando(true);
      const [{ data: t }, { data: ms }] = await Promise.all([
        (supabase as any).from("teams").select("id, name, captain_user_id").eq("id", teamId).maybeSingle(),
        (supabase as any).from("team_members").select("*").eq("team_id", teamId).order("created_at"),
      ]);
      setTeam((t as Team) ?? null);
      setRoster((ms ?? []) as Member[]);
      setCargando(false);
    })();
  }, [session, teamId]);

  // Carreras visibles con fecha por delante
  useEffect(() => {
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("races")
        .select("id, name, date")
        .eq("is_visible", true)
        .eq("group_type", "carrera" as any)
        .gte("date", hoy)
        .order("date", { ascending: true });
      setCarreras((data ?? []) as RaceOption[]);
    })();
  }, []);

  // Distancias y tramos de descuento de la carrera elegida
  useEffect(() => {
    setDistanciaId("");
    setTramos([]);
    if (!carreraId) {
      setDistancias([]);
      return;
    }
    (async () => {
      const [{ data: ds }, { data: ts }] = await Promise.all([
        supabase
          .from("race_distances")
          .select("id, name, distance_km, price, registration_opens, registration_closes")
          .eq("race_id", carreraId)
          .eq("is_visible", true)
          .order("distance_km", { ascending: true }),
        (supabase as any)
          .from("race_team_discount_tiers")
          .select("min_members, discount_type, discount_value")
          .eq("race_id", carreraId)
          .order("min_members", { ascending: true }),
      ]);
      const now = new Date();
      const abiertas = ((ds ?? []) as DistanceOption[]).filter((d) => {
        const opens = d.registration_opens ? new Date(d.registration_opens) : null;
        const closes = d.registration_closes ? new Date(d.registration_closes) : null;
        return (!opens || now >= opens) && (!closes || now <= closes);
      });
      setDistancias(abiertas);
      setTramos((ts ?? []) as TeamTier[]);
    })();
  }, [carreraId]);

  const toggleMiembro = (m: Member) => {
    const s = new Set(seleccion);
    if (s.has(m.id)) {
      s.delete(m.id);
    } else {
      s.add(m.id);
      if (!formularios[m.id]) {
        setFormularios((f) => ({ ...f, [m.id]: formDataDesdeRoster(m) }));
      }
      setAbierto(m.id);
    }
    setSeleccion(s);
  };

  const cambiarCampo = useCallback((memberId: string, fieldName: string, value: any) => {
    setFormularios((f) => ({
      ...f,
      [memberId]: { ...f[memberId], [fieldName]: value },
    }));
  }, []);

  const N = seleccion.size;
  const tramoAplicable = [...tramos].reverse().find((t) => t.min_members <= N) ?? null;

  const inscribir = async () => {
    if (!team || !distanciaId || N === 0) return;
    setEnviando(true);
    try {
      // Campos obligatorios del recorrido, comprobados antes de enviar
      const { data: fields } = await supabase
        .from("registration_form_fields")
        .select("field_name, field_label, is_required, is_visible")
        .eq("race_distance_id", distanciaId)
        .eq("is_visible", true);
      for (const id of seleccion) {
        const m = roster.find((r) => r.id === id)!;
        const fd = formularios[id] ?? {};
        const faltan = (fields ?? [])
          .filter((f: any) => f.is_required)
          .filter((f: any) => {
            const v = fd[f.field_name];
            return v === undefined || v === null || v === "";
          })
          .map((f: any) => f.field_label);
        if (faltan.length > 0) {
          setAbierto(id);
          throw new Error(`A ${nombreVisible(m)} le faltan: ${faltan.join(", ")}`);
        }
      }

      const { data, error } = await supabase.functions.invoke("team-register", {
        body: {
          raceId: carreraId,
          distanceId: distanciaId,
          teamId: team.id,
          members: [...seleccion].map((id) => ({
            teamMemberId: id,
            formData: formularios[id] ?? {},
          })),
          couponCode: cupon.trim() || undefined,
        },
      });
      if (error) {
        // El cuerpo del error de la función llega en context.json
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* nos quedamos con el mensaje genérico */ }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error ?? "No se pudo inscribir al equipo");

      if (data.isFree) {
        toast({
          title: "🎉 Equipo inscrito",
          description: "Inscripción gratuita: dorsales asignados. ¡Nos vemos en la salida!",
        });
        setLote(null);
        setSeleccion(new Set());
      } else {
        setLote({
          registrationIds: data.registrationIds,
          total: data.total,
          breakdown: data.breakdown,
        });
      }
    } catch (e: any) {
      toast({ title: "No se pudo inscribir", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 container max-w-3xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">
            Necesitas iniciar sesión para inscribir a tu equipo.{" "}
            <Link to="/equipo" className="underline text-foreground">Ir a Mi equipo</Link>
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="container max-w-3xl mx-auto px-4 space-y-6">
          <Link to="/equipo" className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Mi equipo
          </Link>
          <h1 className="font-archivo text-3xl uppercase leading-none flex items-center gap-3">
            <Users className="h-8 w-8 text-secondary" />
            Inscribir a {team?.name ?? "mi equipo"}
          </h1>

          {cargando ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : !team || team.captain_user_id !== session.user.id ? (
            <p className="text-muted-foreground">Solo el capitán puede inscribir a este equipo.</p>
          ) : lote ? (
            /* ── Paso 2: desglose + pago ─────────────────────────────── */
            <Card>
              <CardHeader>
                <CardTitle>Resumen del lote</CardTitle>
                <CardDescription>
                  Las inscripciones quedan reservadas mientras completas el pago.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="divide-y border rounded-lg text-sm">
                  {lote.breakdown.map((b) => (
                    <li key={b.registrationId} className="flex items-center justify-between p-2 gap-2">
                      <span className="truncate">{b.name}</span>
                      <span className="text-right whitespace-nowrap">
                        {(b.teamDiscount > 0 || b.couponDiscount > 0) && (
                          <span className="text-muted-foreground line-through mr-2">
                            {(b.base + b.supplement).toFixed(2)} €
                          </span>
                        )}
                        {b.price.toFixed(2)} €
                      </span>
                    </li>
                  ))}
                </ul>
                {lote.breakdown.some((b) => b.teamDiscount > 0) && (
                  <p className="text-sm text-primary flex items-center gap-1">
                    <TicketPercent className="h-4 w-4" />
                    Descuento de equipo aplicado
                  </p>
                )}
                <RedsysPaymentForm
                  amount={lote.total}
                  registrationIds={lote.registrationIds}
                  description={`Inscripción equipo ${team.name}`}
                  userEmail={session.user.email ?? undefined}
                  isTest={false}
                  onCancel={() => setLote(null)}
                />
              </CardContent>
            </Card>
          ) : (
            /* ── Paso 1: carrera, miembros y formularios ─────────────── */
            <>
              <Card>
                <CardHeader>
                  <CardTitle>1. Carrera y recorrido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Carrera</Label>
                    <Select value={carreraId} onValueChange={setCarreraId}>
                      <SelectTrigger><SelectValue placeholder="Elige carrera" /></SelectTrigger>
                      <SelectContent>
                        {carreras.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} — {new Date(c.date + "T00:00:00").toLocaleDateString("es-ES")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {carreraId && (
                    <div>
                      <Label>Recorrido</Label>
                      <Select value={distanciaId} onValueChange={setDistanciaId}>
                        <SelectTrigger><SelectValue placeholder="Elige recorrido" /></SelectTrigger>
                        <SelectContent>
                          {distancias.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                              {d.distance_km ? ` (${d.distance_km} km)` : ""}
                              {d.price != null ? ` — ${Number(d.price).toFixed(2)} €` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {distancias.length === 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Esta carrera no tiene inscripciones abiertas ahora mismo.
                        </p>
                      )}
                    </div>
                  )}
                  {tramos.length > 0 && (
                    <div className="text-sm bg-muted/40 border rounded-lg p-3 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <TicketPercent className="h-4 w-4" /> Descuento por equipos
                      </p>
                      {tramos.map((t) => (
                        <p key={t.min_members} className={N >= t.min_members ? "text-primary font-medium" : "text-muted-foreground"}>
                          A partir de {t.min_members} corredores:{" "}
                          {t.discount_type === "percent"
                            ? `${Number(t.discount_value)}% por corredor`
                            : `${Number(t.discount_value).toFixed(2)} € por corredor`}
                          {N >= t.min_members ? " ✓" : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {distanciaId && (
                <Card>
                  <CardHeader>
                    <CardTitle>2. Corredores del equipo {N > 0 ? `(${N})` : ""}</CardTitle>
                    <CardDescription>
                      Marca a quién inscribes y completa la ficha de cada uno. Los datos que
                      ya tienes guardados van rellenos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {roster.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Tu equipo no tiene componentes —{" "}
                        <Link to="/equipo" className="underline">añádelos primero</Link>.
                      </p>
                    )}
                    {roster.map((m) => (
                      <div key={m.id} className="border rounded-lg">
                        <div className="flex items-center gap-3 p-3">
                          <Checkbox
                            checked={seleccion.has(m.id)}
                            onCheckedChange={() => toggleMiembro(m)}
                            id={`sel-${m.id}`}
                          />
                          <label htmlFor={`sel-${m.id}`} className="flex-1 cursor-pointer text-sm font-medium">
                            {nombreVisible(m)}
                            {m.first_name && m.nick && (
                              <span className="text-muted-foreground font-normal ml-2">
                                {m.first_name} {m.last_name ?? ""}
                              </span>
                            )}
                          </label>
                          {m.user_id && <Badge variant="outline">Con cuenta</Badge>}
                          {seleccion.has(m.id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAbierto(abierto === m.id ? null : m.id)}
                            >
                              {abierto === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {seleccion.has(m.id) && abierto === m.id && (
                          <div className="border-t p-3">
                            <DynamicRegistrationForm
                              raceId={carreraId}
                              distanceId={distanciaId}
                              formData={formularios[m.id] ?? {}}
                              onChange={(campo, valor) => cambiarCampo(m.id, campo, valor)}
                              prefillFromProfile={false}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {distanciaId && N > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>3. Cupón y pago</CardTitle>
                    <CardDescription>
                      El total exacto (tarifa vigente, suplementos y descuentos) lo calcula el
                      servidor en el paso siguiente. Pagas tú por todo el lote.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Cupón (opcional, se suma al descuento de equipo)</Label>
                      <Input
                        value={cupon}
                        onChange={(e) => setCupon(e.target.value)}
                        placeholder="CÓDIGO"
                        maxLength={60}
                      />
                    </div>
                    <Button className="w-full" onClick={inscribir} disabled={enviando}>
                      {enviando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        `INSCRIBIR ${N} ${N === 1 ? "CORREDOR" : "CORREDORES"} Y VER TOTAL`
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TeamRegister;
