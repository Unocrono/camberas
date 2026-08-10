/**
 * Camberas Org — portada de la PWA del organizador (/org).
 * Informe en vivo: inscritos, recaudación, plazas y últimas
 * inscripciones, con "clinc" en tiempo real cuando entra una
 * inscripción PAGADA (las gratuitas entran en silencio).
 *
 * El menú es PROPIO de la app (ORG_MENU, más abajo): árbol fijo en
 * código, independiente de la tabla menu_items del panel. Si el panel
 * estrena algo útil para el móvil, se añade aquí a mano.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CamberasLogo } from "@/components/CamberasLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { qrConLogo } from "@/lib/qrConLogo";
import { OrgDistancesSummary } from "@/components/org/OrgDistancesSummary";
import { OrgVolunteers } from "@/components/org/OrgVolunteers";
import { OrgAddGuest } from "@/components/org/OrgAddGuest";
import { OrgRegistrations } from "@/components/org/OrgRegistrations";
import { OrgStats } from "@/components/org/OrgStats";
import { OrgResults } from "@/components/org/OrgResults";
import { OrgLastRegistrations } from "@/components/org/OrgLastRegistrations";
import { OrgProfile } from "@/components/org/OrgProfile";
import { CamberasTrackMap, type TrackMapKind } from "@/components/CamberasTrackMap";
import {
  Loader2, BellRing, RefreshCw, AlertCircle, ChevronLeft, ChevronDown, Home, QrCode, Download,
  Route as RouteIcon, Users, Trophy, MapPin, UserCircle, UserPlus,
  ClipboardList, HeartHandshake, BarChart3,
  Bike, ShieldCheck, Timer,
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

interface RaceOption {
  id: string;
  name: string;
  date: string;
  slug: string | null;
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

/**
 * Menú PROPIO de la app, independiente de la tabla menu_items del panel.
 * Árbol fijo en código: si el panel estrena algo interesante para el
 * móvil (como Voluntariado), se añade aquí a mano.
 *
 * Orden de los grupos = ciclo de vida de la carrera: primero preparar
 * (carreras, recorridos), luego el periodo de inscripción (corredores,
 * voluntariado, estadísticas), después el día D (GPS) y el final
 * (resultados). Mi Perfil cierra siempre.
 *
 * Cada item abre, en este orden de preferencia:
 * - screen: pantalla NATIVA de la app (formato móvil, sin salir de /org)
 * - view:   vista del panel de escritorio (/organizer?view=X&from=org)
 *           — TRANSITORIO hasta tener pantalla nativa; from=org pinta
 *           el botón de volver a la app en el panel
 * - route:  ruta normal de la web
 */
interface OrgMenuItem {
  id: string;
  title: string;
  icon: LucideIcon;
  screen?: "recorridos" | "voluntarios" | "invitado" | "mapa" | "inscripciones" | "estadisticas" | "resultados" | "perfil";
  /** Para screen "mapa": qué concepto se pinta (corredores, motos…) */
  mapKind?: TrackMapKind;
  view?: string;
  route?: string;
}

interface OrgMenuGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: OrgMenuItem[];
}

const ORG_MENU: OrgMenuGroup[] = [
  // (Sin grupo "Carreras": crear/configurar la carrera, reglamentos,
  // FAQs y archivos son trabajo de escritorio, no de la app)
  {
    key: "recorridos", label: "Recorridos", icon: RouteIcon,
    items: [
      // Pantalla nativa: resumen de solo lectura (km, desnivel, salida,
      // plazas). Para EDITAR recorridos: panel de escritorio.
      { id: "distances-summary", title: "Resumen de eventos", icon: RouteIcon, screen: "recorridos" },
    ],
  },
  {
    key: "corredores", label: "Corredores", icon: Users,
    items: [
      // Pantallas nativas: alta de invitado e inscripciones (buscar,
      // ficha, marcar pagado, dar dorsal)
      { id: "guest-add", title: "Añadir invitado", icon: UserPlus, screen: "invitado" },
      { id: "registrations-app", title: "Inscripciones", icon: ClipboardList, screen: "inscripciones" },
    ],
  },
  {
    // Un solo item nativo con la gestión COMPLETA: alta rápida, buscar,
    // llamar, puesto, activo, ficha, importar de Excel y borrar
    key: "voluntariado", label: "Voluntariado", icon: HeartHandshake,
    items: [
      { id: "voluntarios", title: "Voluntarios", icon: HeartHandshake, screen: "voluntarios" },
    ],
  },
  {
    // Un solo item nativo: el grupo abre la pantalla directamente
    // (inscritos por evento + tallas de camisetas)
    key: "estadisticas", label: "Estadísticas", icon: BarChart3,
    items: [
      { id: "stats", title: "Estadísticas", icon: BarChart3, screen: "estadisticas" },
    ],
  },
  {
    key: "gps", label: "Seguimiento GPS", icon: MapPin,
    // El MISMO mapa en vivo, filtrado por concepto. El papel de cada GPS
    // de organización sale de race_motos.gps_role (migración 5-ago);
    // corredores = tokens que no están en ese catálogo.
    items: [
      { id: "map-corredores", title: "Corredores", icon: MapPin, screen: "mapa", mapKind: "corredores" },
      { id: "map-organizacion", title: "Organización", icon: ShieldCheck, screen: "mapa", mapKind: "organizacion" },
      { id: "map-voluntarios", title: "Voluntarios", icon: HeartHandshake, screen: "mapa", mapKind: "voluntario" },
      // MotoTV = moto de grafismo/overlay; las motos enlace van en Organización
      { id: "map-mototv", title: "Moto TV", icon: Bike, screen: "mapa", mapKind: "mototv" },
    ],
  },
  {
    key: "resultados", label: "Resultados", icon: Trophy,
    items: [
      // Pantalla nativa: clasificación con búsqueda y último parcial
      { id: "results-app", title: "Resultados", icon: Trophy, screen: "resultados" },
      { id: "splits", title: "Parciales por punto", icon: Timer, view: "splits" },
    ],
  },
  {
    // Un solo item nativo: datos de contacto, modo de avisos (el clinc
    // que antes vivía en la cabecera) y cerrar sesión
    key: "perfil", label: "Mi Perfil", icon: UserCircle,
    items: [
      { id: "u-profile", title: "Mi Perfil", icon: UserCircle, screen: "perfil" },
    ],
  },
];

const OrganizerApp = () => {
  const { user, isAdmin, isOrganizer, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [races, setRaces] = useState<RaceOption[]>([]);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RaceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openScreen, setOpenScreen] = useState<OrgMenuItem | null>(null);
  // Lista de carreras desplegada bajo la portada (solo si hay más de una)
  const [showRacePicker, setShowRacePicker] = useState(false);
  // QR del minisite de la carrera (formato de los QR de GPS, logo al centro)
  const [qrSite, setQrSite] = useState<{ url: string; dataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  // El modo de aviso se elige en Mi Perfil (pantalla nativa); aquí solo
  // se aplica: sonido en la portada y sincronización con el push
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
        .select("id, name, date, slug, cover_image_url, image_url, logo_url")
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
    setOpenScreen(null);
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

  const selectedRace = races.find((r) => r.id === raceId);
  // La misma que el índice de /races: la Imagen Principal (16:9). Se
  // recorta a esa proporción en el admin, así que encaja sin deformar.
  const coverImage = selectedRace?.image_url || selectedRace?.cover_image_url || null;

  const activeGroup = ORG_MENU.find((g) => g.key === openGroup) ?? null;

  const openItem = (item: OrgMenuItem, groupKey?: string) => {
    if (item.screen) {
      // Pantalla nativa: se abre DENTRO de la app
      if (groupKey) setOpenGroup(groupKey);
      setOpenScreen(item);
    } else if (item.view) {
      // Transitorio: vista del panel de escritorio, con vuelta a la app
      navigate(`/organizer?view=${item.view}&from=org`);
    } else if (item.route) {
      navigate(item.route);
    }
  };

  // Grupos de un solo item: abrirlo directamente, sin pantalla intermedia
  const openGroupOrItem = (g: OrgMenuGroup) => {
    if (g.items.length === 1) openItem(g.items[0], g.key);
    else setOpenGroup(g.key);
  };

  /**
   * QR del minisite público de la carrera (camberas.com/race/slug), con
   * el mismo formato que los QR de GPS impresos: logo al centro y
   * corrección H. Para carteles, dorsales o enseñarlo en el móvil.
   */
  const abrirQrSite = async () => {
    if (!selectedRace) return;
    const url = `https://camberas.com/race/${selectedRace.slug || selectedRace.id}`;
    setQrLoading(true);
    try {
      const dataUrl = await qrConLogo(url, 480);
      setQrSite({ url, dataUrl });
    } finally {
      setQrLoading(false);
    }
  };

  // Volver: de la pantalla nativa al grupo (o a la portada si el grupo
  // solo tenía ese item), y del grupo a la portada
  const goBack = () => {
    if (openScreen) {
      setOpenScreen(null);
      if (activeGroup && activeGroup.items.length === 1) setOpenGroup(null);
    } else {
      setOpenGroup(null);
    }
  };

  const goHome = () => {
    setOpenScreen(null);
    setOpenGroup(null);
  };

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
        {races.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            No tienes carreras asignadas todavía.
          </p>
        )}

        {/* Portada de la carrera. La imagen ES el selector: la app elige
            sola la próxima carrera y, si hay más de una, un toque
            despliega la lista para cambiar. (Antes había una barra de
            selección aparte — innecesaria.) */}
        {raceId && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              className="relative block w-full text-left"
              onClick={() => races.length > 1 && setShowRacePicker((v) => !v)}
            >
              {coverImage ? (
                <img src={coverImage} alt={selectedRace?.name} className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-primary/10">
                  <span className="px-4 text-center font-archivo uppercase text-primary">{selectedRace?.name}</span>
                </div>
              )}
              {/* Nombre y fecha sobre la imagen */}
              {coverImage && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2.5 pt-10">
                  <span className="block font-archivo uppercase leading-tight text-white">{selectedRace?.name}</span>
                  {selectedRace?.date && (
                    <span className="block text-xs text-white/80">
                      {new Date(selectedRace.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  )}
                </span>
              )}
              {races.length > 1 && (
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-3 py-1 text-xs font-bold uppercase backdrop-blur-sm">
                  Cambiar
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRacePicker ? "rotate-180" : ""}`} />
                </span>
              )}
            </button>
            {/* Lista de carreras, desplegada bajo la imagen */}
            {showRacePicker && (
              <div className="divide-y divide-border border-t border-border">
                {races
                  .filter((r) => r.id !== raceId)
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRaceId(r.id);
                        setShowRacePicker(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString("es-ES")}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* El panel del organizador ES esta portada: el informe de abajo.
            (Sin botones de acción aquí: la portada es informe; las
            gestiones están en GESTIÓN, al final.) */}

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
            {/* Por recorrido: lo primero del informe — es lo que se mira
                a diario (cómo va llenándose cada evento) */}
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

            {/* La portada se queda con la foto y el desglose por
                recorrido. Los números clave y "Por origen" están en
                Estadísticas; "Últimas inscripciones", en Corredores. */}
          </>
        )}

        </>
        )}

        {/* Menú de dos niveles: grupos → opciones (árbol PROPIO, ORG_MENU) */}
        <section>
          {!activeGroup ? (
            <>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Gestión</p>
              <div className="grid grid-cols-2 gap-3">
                {ORG_MENU.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => openGroupOrItem(g)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-secondary"
                  >
                    <g.icon className="h-6 w-6 shrink-0 text-secondary" />
                    <span className="font-archivo text-sm uppercase leading-tight">{g.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Volver (atrás) + Inicio, siempre visibles dentro de un grupo */}
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {openScreen ? openScreen.title : activeGroup.label}
                </button>
                <button
                  onClick={goHome}
                  title="Inicio"
                  className="rounded-full border border-border bg-card p-2 text-secondary transition-colors hover:border-secondary"
                >
                  <Home className="h-4 w-4" />
                </button>
              </div>
              {openScreen?.screen === "recorridos" ? (
                <OrgDistancesSummary raceId={raceId} byDistance={summary?.by_distance ?? []} />
              ) : openScreen?.screen === "voluntarios" ? (
                <OrgVolunteers raceId={raceId} />
              ) : openScreen?.screen === "invitado" ? (
                <OrgAddGuest raceId={raceId} />
              ) : openScreen?.screen === "inscripciones" ? (
                <OrgRegistrations raceId={raceId} />
              ) : openScreen?.screen === "estadisticas" ? (
                <OrgStats
                  raceId={raceId}
                  totals={summary}
                  bySource={summary?.by_source ?? []}
                />
              ) : openScreen?.screen === "resultados" ? (
                <OrgResults raceId={raceId} />
              ) : openScreen?.screen === "perfil" ? (
                <OrgProfile clincMode={clincMode} onClincModeChange={setClincMode} />
              ) : openScreen?.screen === "mapa" ? (
                /* Mapa único en vivo, filtrado por concepto; SOS solo en el
                   de corredores (los avisos son de sus pulseras/tokens) */
                <CamberasTrackMap
                  eventId={raceId ?? undefined}
                  kind={openScreen.mapKind}
                  showSOSPanel={openScreen.mapKind === "corredores"}
                  height="68vh"
                />
              ) : (
                <>
                  {/* Corredores abre con las últimas inscripciones (antes
                      estaban en la portada), encima de sus botones */}
                  {activeGroup.key === "corredores" && summary && (
                    <OrgLastRegistrations
                      registrations={summary.last_registrations}
                      timeAgo={timeAgo}
                      euro={euro}
                    />
                  )}
                  {/* Mismo formato que los grupos de la portada, pero con el
                      icono en verde para distinguir que es el segundo nivel */}
                  <div className="grid grid-cols-2 gap-3">
                    {activeGroup.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openItem(item)}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-secondary"
                      >
                        <item.icon className="h-6 w-6 shrink-0 text-primary" />
                        <span className="font-archivo text-sm uppercase leading-tight">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {/* QR del minisite de la carrera, al pie de la portada */}
        {!activeGroup && raceId && (
          <button
            onClick={abrirQrSite}
            disabled={qrLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 font-archivo text-sm uppercase transition-colors hover:border-secondary disabled:opacity-60"
          >
            {qrLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-secondary" />
            ) : (
              <QrCode className="h-5 w-5 text-secondary" />
            )}
            QR Site
          </button>
        )}

      </main>

      {/* El QR del minisite: para carteles o enseñarlo en pantalla */}
      <Dialog open={!!qrSite} onOpenChange={(o) => !o && setQrSite(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Site — {selectedRace?.name}</DialogTitle>
            <DialogDescription>
              Lleva al minisite público de la carrera. Mismo formato que los QR de GPS
              (logo al centro); listo para carteles o para enseñarlo en pantalla.
            </DialogDescription>
          </DialogHeader>
          {qrSite && (
            <div className="space-y-3">
              <img
                src={qrSite.dataUrl}
                alt={`QR del minisite de ${selectedRace?.name}`}
                className="mx-auto w-full max-w-[300px] rounded-xl border border-border bg-white p-2"
              />
              <p className="break-all text-center text-xs text-muted-foreground">{qrSite.url}</p>
              <a
                href={qrSite.dataUrl}
                download={`qr-site-${selectedRace?.slug || selectedRace?.id}.png`}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-2 text-sm font-bold text-secondary-foreground transition-opacity hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Descargar PNG
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizerApp;
