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
import { Loader2, Volume2, VolumeX, RefreshCw } from "lucide-react";

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
  amount: number | null;
}

interface RaceSummary {
  total_registrations: number;
  paid_registrations: number;
  revenue_total: number;
  registrations_today: number;
  revenue_today: number;
  by_distance: DistanceSummary[];
  last_registrations: LastRegistration[];
}

interface RaceOption {
  id: string;
  name: string;
  date: string;
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

const OrganizerApp = () => {
  const { user, isAdmin, isOrganizer, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { groupedItems } = useMenuItems({ menuType: "organizer" });

  const [races, setRaces] = useState<RaceOption[]>([]);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("org-clinc") !== "off");
  const paidCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/org");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    localStorage.setItem("org-clinc", soundOn ? "on" : "off");
  }, [soundOn]);

  // Carreras del organizador (admin: todas)
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let query = supabase.from("races").select("id, name, date").order("date", { ascending: false });
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
      return;
    }
    const s = data as RaceSummary;
    // Clinc si han entrado pagos nuevos desde la última lectura
    if (
      paidCountRef.current !== null &&
      s.paid_registrations > paidCountRef.current
    ) {
      const last = s.last_registrations.find((r) => r.payment_status === "paid");
      if (localStorage.getItem("org-clinc") !== "off") playClinc();
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
              variant="ghost"
              size="icon"
              title={soundOn ? "Silenciar el clinc" : "Activar el clinc"}
              onClick={() => setSoundOn((s) => !s)}
            >
              {soundOn ? <Volume2 className="h-5 w-5 text-secondary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
            </Button>
            <Button variant="ghost" size="icon" title="Actualizar" onClick={() => raceId && fetchSummary(raceId)}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 pt-4">
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

        {raceId && !summary && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-secondary" />
          </div>
        )}

        {summary && (
          <>
            {/* Números clave */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inscritos</p>
                <p className="font-archivo text-3xl text-primary">{summary.total_registrations}</p>
                <p className="text-xs text-muted-foreground">{summary.paid_registrations} pagados</p>
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

            {/* Últimas inscripciones */}
            <section>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Últimas inscripciones</p>
              {summary.last_registrations.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay inscripciones.</p>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {summary.last_registrations.map((r, i) => (
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
          </>
        )}

        {/* Menú del panel: mismos items de BD que el sidebar */}
        {groupedItems.length > 0 && (
          <section>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Panel completo</p>
            <div className="grid grid-cols-3 gap-2">
              {groupedItems.flatMap((g) => g.items).map((item) => {
                const Icon = getIcon(item.icon);
                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      item.view_name
                        ? navigate(`/organizer?view=${item.view_name}`)
                        : item.route && navigate(item.route)
                    }
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-center transition-colors hover:border-secondary"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-[11px] font-medium leading-tight">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default OrganizerApp;
