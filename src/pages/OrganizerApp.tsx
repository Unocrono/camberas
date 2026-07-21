/**
 * Camberas Org — portada de la PWA del organizador (/org).
 * Informe en vivo: inscritos, recaudación, plazas y últimas
 * inscripciones, con "clinc" en tiempo real cuando entra una
 * inscripción PAGADA (las gratuitas entran en silencio).
 *
 * El resto de opciones enlazan al panel completo (/organizer?view=X)
 * leyendo el MISMO menú de BD que el sidebar — cero duplicación.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMenuItems } from "@/hooks/useMenuItems";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CamberasLogo } from "@/components/CamberasLogo";
import * as LucideIcons from "lucide-react";
import {
  Loader2, Volume2, VolumeX, Bell, BellRing, RefreshCw, AlertCircle, ChevronRight, ChevronLeft,
  LayoutDashboard, Flag, Route as RouteIcon, Users, Trophy, MapPin, UserCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { enablePush, pushPermission, syncPushMode } from "@/lib/pushNotifications";

interface DistanceSummary {
  distance_id: string;
  name: string;
  distance_km: number | null;
  max_participants: number | null;
  count: number;
  paid: number;
  revenue: number;
}

interface LastRegistration {
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  payment_status: string;
  bib_number: number | null;
  distance_name: string;
  source: string | null;
  amount: number | null;
}

/** Origen de la inscripción, para facturación */
interface SourceSummary {
  source: string;
  count: number;
  paid: number;
  revenue: number;
}

interface RaceSummary {
  /** Solo inscripciones con el pago resuelto (pagadas o gratuitas) */
  total_registrations: number;
  paid_registrations: number;
  /** Pendientes de pago: no cuentan en los informes, solo se avisan */
  pending_registrations?: number;
  revenue_total: number;
  registrations_today: number;
  revenue_today: number;
  by_distance: DistanceSummary[];
  by_source?: SourceSummary[];
  last_registrations: LastRegistration[];
}

const SOURCE_LABEL: Record<string, string> = {
  gateway: "Pasarela",
  manual: "Alta manual",
  free: "Gratuitas",
};

interface RaceOption {
  id: string;
  name: string;
  date: string;
  cover_image_url: string | null;
  image_url: string | null;
  logo_url: string | null;
}

/** "Clinc" de caja registradora con WebAudio (sin assets) */
function playClinc() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const tone = (freq: number, t0: number, dur: number, vol = 0.35) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    tone(1318.5, 0, 0.15);
    tone(2093, 0.08, 0.4);
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* sin audio disponible */
  }
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

const euro = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

type ClincMode = "each" | "milestones" | "off";

const CLINC_MILESTONE = 10; // suena al cruzar cada 10 pagados en modo "hitos"
const CLINC_LOW_PLACES = 10; // ...o cuando a un recorrido le quedan pocas plazas

/**
 * ¿Debe sonar el clinc al pasar de prevPaid a s.paid_registrations?
 * - each: siempre que entre un pago nuevo
 * - milestones: solo al cruzar un múltiplo de 10, o si un recorrido baja
 *   de 10 plazas libres (evita el spam en la avalancha de inscripciones)
 * - off: nunca
 */
function shouldClinc(mode: ClincMode, prevPaid: number, s: RaceSummary): boolean {
  if (mode === "off") return false;
  if (mode === "each") return true;
  const crossedMilestone =
    Math.floor(s.paid_registrations / CLINC_MILESTONE) > Math.floor(prevPaid / CLINC_MILESTONE);
  const nearlyFull = s.by_distance.some(
    (d) =>
      d.max_participants !== null &&
      d.max_participants - d.count > 0 &&
      d.max_participants - d.count <= CLINC_LOW_PLACES,
  );
  return crossedMilestone || nearlyFull;
}

const CLINC_LABEL: Record<ClincMode, string> = {
  each: "Cada inscripción",
  milestones: "Solo hitos",
  off: "Silencio",
};

/**
 * Menú de dos niveles de la app: primer nivel = grupos; al pulsar uno,
 * se muestran sus opciones. Los items reales (etiqueta, view_name/route)
 * salen de la tabla menu_items; aquí solo definimos AGRUPACIÓN y orden
 * por view_name, para tener una portada limpia. Lo que no esté mapeado
 * cae en un grupo "Más" para no perder nada.
 */
interface OrgGroupDef {
  key: string;
  label: string;
  icon: LucideIcon;
  views: string[];
}

const ORG_GROUP_DEFS: OrgGroupDef[] = [
  { key: "carreras", label: "Carreras", icon: Flag, views: ["races", "regulations", "race-faqs", "storage"] },
  { key: "recorridos", label: "Recorridos", icon: RouteIcon, views: ["distances", "roadbooks", "checkpoints", "timing-points", "waves"] },
  { key: "corredores", label: "Corredores", icon: Users, views: ["registrations", "form-fields", "categories", "tshirt-sizes"] },
  { key: "resultados", label: "Resultados", icon: Trophy, views: ["results", "splits", "timing-readings", "gps-readings", "bib-chips", "timer-assignments"] },
  { key: "gps", label: "Seguimiento GPS", icon: MapPin, views: ["camberas-track", "motos", "moto-map"] },
];

interface MenuButton {
  id: string;
  title: string;
  icon: string;
  view_name?: string | null;
  route?: string | null;
}

// Grupo "Mi Perfil": no está en menu_items, es navegación fija.
// (Diseñador de Dorsales fuera: no se puede usar desde el móvil)
const ORG_USER_ITEMS: MenuButton[] = [
  { id: "u-profile", title: "Mi Perfil", icon: "UserCircle", route: "/profile" },
  { id: "u-site", title: "Volver al sitio", icon: "Home", route: "/" },
];

const OrganizerApp = () => {
  const { user, isAdmin, isOrganizer, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { groupedItems } = useMenuItems({ menuType: "organizer" });

  const [races, setRaces] = useState<RaceOption[]>([]);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RaceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clincMode, setClincMode] = useState<ClincMode>(
    () => (localStorage.getItem("org-clinc-mode") as ClincMode) || "each",
  );
  const [pushState, setPushState] = useState(() => pushPermission());
  const paidCountRef = useRef<number | null>(null);
  const clincModeRef = useRef<ClincMode>(clincMode);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/org");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    localStorage.setItem("org-clinc-mode", clincMode);
    clincModeRef.current = clincMode;
    // El push lo decide el servidor: hay que llevarle el modo elegido
    syncPushMode(clincMode);
  }, [clincMode]);

  // Carreras del organizador (admin: todas)
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let query = supabase
        .from("races")
        .select("id, name, date, cover_image_url, image_url, logo_url")
        .order("date", { ascending: false });
      if (!isAdmin) query = query.eq("organizer_id", user.id);
      const { data } = await query;
      setRaces(data || []);
      if (data?.length && !raceId) {
        // Por defecto: la próxima carrera futura, o la más reciente
        const upcoming = [...data].reverse().find((r) => new Date(r.date) >= new Date());
        setRaceId((upcoming || data[0]).id);
      }
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  const fetchSummary = useCallback(async (id: string) => {
    const { data, error } = await (supabase as any).rpc("get_organizer_race_summary", {
      p_race_id: id,
    });
    if (error) {
      console.error("Resumen no disponible:", error.message);
      setSummaryError(error.message);
      return;
    }
    setSummaryError(null);
    const s = data as RaceSummary;
    // Si han entrado pagos nuevos desde la última lectura: aviso visual
    // siempre, y clinc según el modo elegido (cada / hitos / silencio)
    if (
      paidCountRef.current !== null &&
      s.paid_registrations > paidCountRef.current
    ) {
      const last = s.last_registrations.find((r) => r.payment_status === "paid");
      if (shouldClinc(clincModeRef.current, paidCountRef.current, s)) playClinc();
      toast({
        title: "💶 ¡Nueva inscripción pagada!",
        description: last
          ? `${last.first_name ?? ""} ${last.last_name ?? ""} — ${last.distance_name}${last.amount ? ` · ${euro(last.amount)}` : ""}`
          : undefined,
      });
    }
    paidCountRef.current = s.paid_registrations;
    setSummary(s);
  }, [toast]);

  // Resumen inicial + al cambiar de carrera
  useEffect(() => {
    if (!raceId) return;
    paidCountRef.current = null;
    setSummary(null);
    setSummaryError(null);
    setOpenGroup(null);
    fetchSummary(raceId);
  }, [raceId, fetchSummary]);

  // Tiempo real: cualquier cambio en inscripciones de esta carrera
  useEffect(() => {
    if (!raceId) return;
    const channel = supabase
      .channel(`org-app-${raceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `race_id=eq.${raceId}` },
        () => fetchSummary(raceId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, fetchSummary]);

  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Circle;
  };

  const selectedRace = races.find((r) => r.id === raceId);
  const coverImage = selectedRace?.cover_image_url || selectedRace?.image_url || null;

  // Todos los items del menú de BD, planos
  const allItems = groupedItems.flatMap((g) => g.items);
  const itemByView = (v: string) => allItems.find((i) => i.view_name === v);

  // El "Panel de Organizador" (dashboard) va aparte, como botón destacado
  const dashboardItem = allItems.find((i) => i.view_name === "dashboard");

  // Grupos de primer nivel (solo los que tienen algún item disponible)
  const orgGroups = ORG_GROUP_DEFS.map((def) => ({
    ...def,
    items: def.views.map(itemByView).filter(Boolean) as typeof allItems,
  })).filter((g) => g.items.length > 0);

  // Grupo "Usuario": navegación fija de la app
  const userItems = ORG_USER_ITEMS;

  // Items no mapeados en ningún grupo → "Más", para no perder nada
  const mappedViews = new Set(ORG_GROUP_DEFS.flatMap((d) => d.views).concat("dashboard"));
  const extraItems = allItems.filter((i) => i.view_name && !mappedViews.has(i.view_name));

  const openItem = (item: MenuButton) => {
    if (item.view_name) navigate(`/organizer?view=${item.view_name}`);
    else if (item.route) navigate(item.route);
  };

  const activeGroup =
    openGroup === "usuario"
      ? { key: "usuario", label: "Mi Perfil", icon: UserCircle, items: userItems }
      : openGroup === "mas"
        ? { key: "mas", label: "Más", icon: LucideIcons.LayoutGrid, items: extraItems }
        : orgGroups.find((g) => g.key === openGroup);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (!isOrganizer && !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <CamberasLogo size={56} />
        <p className="font-archivo text-xl uppercase">Camberas Org</p>
        <p className="text-muted-foreground">
          Esta app es para organizadores. Si crees que deberías tener acceso, contacta con Camberas.
        </p>
        <Button variant="secondary" onClick={() => navigate("/")}>Ir a la web</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Cabecera */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/org-icon-192.png" alt="" className="h-9 w-9 rounded-full" />
            <span className="font-archivo text-lg uppercase tracking-wide">Camberas Org</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              title="Modo de aviso sonoro: cada inscripción, solo hitos o silencio"
              onClick={() =>
                setClincMode((m) => (m === "each" ? "milestones" : m === "milestones" ? "off" : "each"))
              }
            >
              {clincMode === "each" ? (
                <Volume2 className="h-4 w-4 text-secondary" />
              ) : clincMode === "milestones" ? (
                <Bell className="h-4 w-4 text-secondary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs">{CLINC_LABEL[clincMode]}</span>
            </Button>
            {/* Avisos con la app cerrada */}
            {pushState !== "unsupported" && pushState !== "granted" && (
              <Button
                variant="ghost"
                size="icon"
                title="Recibir avisos con la app cerrada"
                onClick={async () => {
                  if (!user) return;
                  const err = await enablePush(user.id, clincMode);
                  setPushState(pushPermission());
                  toast(
                    err
                      ? { title: "No se activaron los avisos", description: err, variant: "destructive" }
                      : { title: "Avisos activados", description: "Te avisaremos aunque la app esté cerrada." },
                  );
                }}
              >
                <BellRing className="h-5 w-5 text-muted-foreground" />
              </Button>
            )}
            <Button variant="ghost" size="icon" title="Actualizar" onClick={() => raceId && fetchSummary(raceId)}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 pt-4">
        {/* Portada: solo cuando no hay un grupo abierto. Al entrar en un
            grupo la pantalla queda limpia, solo con sus botones. */}
        {!activeGroup && (
        <>
        {/* Selector de carrera */}
        {races.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No tienes carreras asignadas todavía.
          </p>
        ) : (
          <Select value={raceId ?? undefined} onValueChange={setRaceId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elige carrera" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              {races.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Imagen de portada de la carrera */}
        {raceId && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {coverImage ? (
              <img src={coverImage} alt={selectedRace?.name} className="aspect-[2.4/1] w-full object-cover" />
            ) : (
              <div className="flex aspect-[2.4/1] w-full items-center justify-center bg-primary/10">
                <span className="px-4 text-center font-archivo uppercase text-primary">{selectedRace?.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Botón destacado: Panel de Organizador */}
        {raceId && dashboardItem && (
          <button
            onClick={() => navigate(`/organizer?view=dashboard`)}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-secondary bg-secondary/5 px-5 py-4 transition-colors hover:bg-secondary/10"
          >
            <span className="flex items-center gap-3">
              <LayoutDashboard className="h-6 w-6 text-secondary" />
              <span className="font-archivo text-lg uppercase">Panel de Organizador</span>
            </span>
            <ChevronRight className="h-5 w-5 text-secondary" />
          </button>
        )}

        {/* Informe: cargando / error */}
        {raceId && !summary && !summaryError && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-secondary" />
          </div>
        )}
        {summaryError && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">No se pudo cargar el informe</p>
              <p className="text-sm text-muted-foreground">{summaryError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => raceId && fetchSummary(raceId)}>
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <>
            {/* Números clave */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inscritos</p>
                <p className="font-archivo text-3xl text-primary">{summary.total_registrations}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.pending_registrations
                    ? `+${summary.pending_registrations} sin pagar`
                    : "pago confirmado"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Recaudación</p>
                <p className="font-archivo text-3xl text-secondary">{euro(summary.revenue_total)}</p>
                <p className="text-xs text-muted-foreground">pagos confirmados</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hoy</p>
                <p className="font-archivo text-3xl text-primary">+{summary.registrations_today}</p>
                <p className="text-xs text-muted-foreground">inscripciones</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hoy €</p>
                <p className="font-archivo text-3xl text-secondary">{euro(summary.revenue_today)}</p>
                <p className="text-xs text-muted-foreground">cobrado hoy</p>
              </div>
            </section>

            {/* Por distancia */}
            <section>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Por recorrido</p>
              <div className="space-y-2">
                {summary.by_distance.map((d) => (
                  <div key={d.distance_id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <div>
                      <p className="font-archivo uppercase">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.count}
                        {d.max_participants ? ` / ${d.max_participants}` : ""} inscritos
                        {d.max_participants ? ` · quedan ${Math.max(0, d.max_participants - d.count)}` : ""}
                      </p>
                    </div>
                    <p className="font-archivo text-lg text-secondary">{euro(d.revenue)}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Por origen — para facturación (pasarela vs alta manual) */}
            {summary.by_source && summary.by_source.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Por origen</p>
                <div className="space-y-2">
                  {summary.by_source.map((s) => (
                    <div key={s.source} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                      <div>
                        <p className="font-archivo uppercase">{SOURCE_LABEL[s.source] ?? s.source}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.count} inscripciones · {s.paid} pagadas
                        </p>
                      </div>
                      <p className="font-archivo text-lg text-secondary">{euro(s.revenue)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </>
        )}

        {/* Últimas inscripciones: las 5 más recientes */}
        {summary && (
          <section>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Últimas inscripciones</p>
            {summary.last_registrations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay inscripciones.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {summary.last_registrations.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.first_name} {r.last_name}
                        {r.bib_number ? <span className="ml-1.5 text-xs text-muted-foreground">#{r.bib_number}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.distance_name} · {timeAgo(r.created_at)}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 text-sm font-bold ${
                        r.payment_status === "paid"
                          ? "text-secondary"
                          : r.payment_status === "not_required"
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {r.payment_status === "paid"
                        ? r.amount ? euro(r.amount) : "Pagado"
                        : r.payment_status === "not_required"
                          ? "Gratis"
                          : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        </>
        )}

        {/* Menú de dos niveles: grupos → opciones */}
        {allItems.length > 0 && (
          <section>
            {!activeGroup ? (
              <>
                <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Gestión</p>
                <div className="grid grid-cols-2 gap-3">
                  {orgGroups.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setOpenGroup(g.key)}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-secondary"
                    >
                      <g.icon className="h-6 w-6 shrink-0 text-secondary" />
                      <span className="font-archivo text-sm uppercase leading-tight">{g.label}</span>
                    </button>
                  ))}
                  {extraItems.length > 0 && (
                    <button
                      onClick={() => setOpenGroup("mas")}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-secondary"
                    >
                      <LucideIcons.LayoutGrid className="h-6 w-6 shrink-0 text-secondary" />
                      <span className="font-archivo text-sm uppercase leading-tight">Más</span>
                    </button>
                  )}
                  {userItems.length > 0 && (
                    <button
                      onClick={() => setOpenGroup("usuario")}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-secondary"
                    >
                      <UserCircle className="h-6 w-6 shrink-0 text-secondary" />
                      <span className="font-archivo text-sm uppercase leading-tight">Mi Perfil</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setOpenGroup(null)}
                  className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {activeGroup.label}
                </button>
                <div className="grid grid-cols-3 gap-2">
                  {activeGroup.items.map((item) => {
                    const Icon = getIcon(item.icon);
                    return (
                      <button
                        key={item.id}
                        onClick={() => openItem(item)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-center transition-colors hover:border-secondary"
                      >
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-[11px] font-medium leading-tight">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

      </main>
    </div>
  );
};

export default OrganizerApp;
