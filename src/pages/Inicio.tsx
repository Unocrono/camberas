import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bike, Calendar, ChevronLeft, ChevronRight, Mountain, Search, Timer, Trophy } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard, { type EstadoListado } from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { supabase } from "@/integrations/supabase/client";
import { rpcSinTipos } from "@/eventos/rpc";

/**
 * Pantalla de inicio (camberas.com/): las 3 próximas carreras y las 3 últimas
 * celebradas, con los mismos filtros que /races (buscar, Todas / Próximas /
 * Pasadas, Todas / Trail / MTB) y «Ver más» de 3 en 3. Debajo, un carrusel
 * que algún día llevará las ventajas de Camberas; mientras no estén claras
 * esas diapositivas, enseña las 3 inscripciones que cierran antes y las 3
 * clasificaciones más recientes. El listado completo paginado sigue en /races.
 */

const POR_BLOQUE = 3;

type FiltroTiempo = "all" | "upcoming" | "past";
type FiltroTipo = "all" | "trail" | "mtb";

interface CarreraInicio {
  id: string;
  slug: string | null;
  name: string;
  subtitle: string | null;
  rawDate: string;
  date: string;
  location: string;
  distances: string[];
  coverImageUrl?: string;
  imageUrl?: string;
  raceType: "trail" | "mtb";
  groupType: "carrera" | "quedada" | "grupetta";
  priceLabel: string | null;
  isPast: boolean;
  estado?: EstadoListado;
  /** Cierre de inscripciones más próximo (carrera o recorrido) */
  cierre: string | null;
}

const hoy = () => new Date().toISOString().slice(0, 10);

const formatearFecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

const formatearCierre = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");

const rangoPrecio = (precios: number[]): string | null => {
  const pagados = precios.filter((p) => p > 0);
  if (pagados.length === 0) return "Gratis";
  const min = Math.min(...pagados);
  const max = Math.max(...pagados);
  return min === max ? `${min}€` : `${min}–${max}€`;
};

async function cargarCarreras(): Promise<CarreraInicio[]> {
  const { data: races, error } = await supabase
    .from("races")
    .select("*")
    .neq("group_type", "grupetta")
    .order("date", { ascending: true });
  if (error) throw error;
  const ids = (races ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  // Recorridos de todas las carreras en una sola consulta (nada de N+1)
  const { data: distancias, error: errDist } = await supabase
    .from("race_distances")
    .select("race_id, name, price, registration_closes, display_order")
    .in("race_id", ids)
    .eq("is_visible", true)
    .order("display_order", { ascending: true });
  if (errDist) throw errDist;

  // Estado real de inscripción (RPC estado_carreras). Sin ella, pasada / no pasada.
  let estados: Record<string, EstadoListado> = {};
  try {
    const filas = await rpcSinTipos<{ race_id: string; estado: EstadoListado }[]>("estado_carreras", {});
    estados = Object.fromEntries((filas ?? []).map((f) => [f.race_id, f.estado]));
  } catch (e) {
    console.warn("[inicio] estado_carreras no disponible:", e);
  }

  const h = hoy();
  return (races ?? []).map((race) => {
    const dists = (distancias ?? []).filter((d) => d.race_id === race.id);
    const cierres = [race.registration_closes, ...dists.map((d) => d.registration_closes)].filter((c): c is string => !!c).sort();
    return {
      id: race.id,
      slug: race.slug,
      name: race.name,
      subtitle: race.subtitle ?? null,
      rawDate: race.date,
      date: formatearFecha(race.date),
      location: race.location,
      distances: dists.map((d) => d.name),
      coverImageUrl: race.cover_image_url ?? undefined,
      imageUrl: race.image_url ?? undefined,
      raceType: (race.race_type === "mtb" ? "mtb" : "trail") as "trail" | "mtb",
      groupType: ((race.group_type ?? "carrera") as CarreraInicio["groupType"]),
      priceLabel: rangoPrecio(dists.map((d) => Number(d.price) || 0)),
      isPast: race.date < h,
      estado: estados[race.id],
      cierre: cierres[0] ?? null,
    };
  });
}

function Bloque({
  etiqueta, titulo, enlace, textoEnlace, carreras, total, cargando, vacio, onVerMas,
}: {
  etiqueta: string; titulo: string; enlace: string; textoEnlace: string;
  carreras: CarreraInicio[]; total: number; cargando: boolean; vacio: string; onVerMas: () => void;
}) {
  return (
    <section className="py-8 md:py-10">
      <div className="container mx-auto px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{etiqueta}</p>
            <h2 className="font-archivo text-2xl md:text-3xl text-foreground">{titulo}</h2>
          </div>
          <Link to={enlace} className="flex items-center gap-1 text-sm font-bold text-primary hover:gap-2 transition-all">
            {textoEnlace} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {cargando ? (
          <p className="text-muted-foreground">Cargando carreras…</p>
        ) : carreras.length === 0 ? (
          <p className="text-muted-foreground">{vacio}</p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {carreras.map((c) => <RaceCard key={c.id} {...c} participants={0} />)}
            </div>
            {total > carreras.length && (
              <div className="mt-6 text-center">
                <Button variant="outline" onClick={onVerMas}>
                  Ver más ({carreras.length} de {total})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const Inicio = () => {
  const [carreras, setCarreras] = useState<CarreraInicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTiempo, setFiltroTiempo] = useState<FiltroTiempo>("all");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("all");
  // Cuántas se enseñan por bloque: 3 de serie, «Ver más» añade 3
  const [limiteProximas, setLimiteProximas] = useState(POR_BLOQUE);
  const [limiteUltimas, setLimiteUltimas] = useState(POR_BLOQUE);
  const [api, setApi] = useState<CarouselApi>();
  const [diapositiva, setDiapositiva] = useState(0);

  useEffect(() => {
    cargarCarreras()
      .then(setCarreras)
      .catch((e) => console.error("[inicio] No se pudieron cargar las carreras:", e))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!api) return;
    const alCambiar = () => setDiapositiva(api.selectedScrollSnap());
    api.on("select", alCambiar);
    const temporizador = setInterval(() => api.scrollNext(), 7000);
    return () => {
      api.off("select", alCambiar);
      clearInterval(temporizador);
    };
  }, [api]);

  // Al cambiar de filtro se vuelve a 3 por bloque
  useEffect(() => {
    setLimiteProximas(POR_BLOQUE);
    setLimiteUltimas(POR_BLOQUE);
  }, [busqueda, filtroTiempo, filtroTipo]);

  const h = hoy();
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return carreras.filter(
      (c) =>
        (filtroTipo === "all" || c.raceType === filtroTipo) &&
        (!q || c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)),
    );
  }, [carreras, busqueda, filtroTipo]);
  const todasProximas = useMemo(() => filtradas.filter((c) => c.rawDate >= h), [filtradas, h]);
  const todasUltimas = useMemo(() => filtradas.filter((c) => c.rawDate < h).sort((a, b) => b.rawDate.localeCompare(a.rawDate)), [filtradas, h]);
  const proximas = todasProximas.slice(0, limiteProximas);
  const ultimas = todasUltimas.slice(0, limiteUltimas);

  // Carrusel: inscripciones que cierran antes (abiertas o parcialmente agotadas,
  // por fecha de cierre; sin cierre, por fecha de carrera) y últimas clasificaciones
  const cierranAntes = useMemo(
    () =>
      carreras
        .filter((c) => c.rawDate >= h && (c.estado ? c.estado === "abierta" || c.estado === "agotada_parcial" : true))
        .sort((a, b) => (a.cierre ?? `${a.rawDate}T23:59`).localeCompare(b.cierre ?? `${b.rawDate}T23:59`))
        .slice(0, POR_BLOQUE),
    [carreras, h],
  );
  const ultimasClasificaciones = useMemo(
    () => carreras.filter((c) => c.rawDate < h).sort((a, b) => b.rawDate.localeCompare(a.rawDate)).slice(0, POR_BLOQUE),
    [carreras, h],
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <header className="pt-24 pb-4 md:pt-28 md:pb-6">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-archivo text-3xl md:text-5xl text-foreground">Carreras de montaña: trail y MTB</h1>
          <p className="mt-2 text-lg text-muted-foreground">Inscripciones, cronometraje, seguimiento GPS en vivo y clasificaciones.</p>

          {/* Mismos filtros que /races */}
          <div className="mx-auto mt-6 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar carreras..." className="pl-10" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant={filtroTiempo === "all" ? "default" : "outline"} size="sm" onClick={() => setFiltroTiempo("all")}>Todas</Button>
              <Button variant={filtroTiempo === "upcoming" ? "default" : "outline"} size="sm" onClick={() => setFiltroTiempo("upcoming")} className="flex items-center gap-1">
                <Calendar className="h-4 w-4" /> Próximas
              </Button>
              <Button variant={filtroTiempo === "past" ? "default" : "outline"} size="sm" onClick={() => setFiltroTiempo("past")} className="flex items-center gap-1">
                <Trophy className="h-4 w-4" /> Pasadas
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button variant={filtroTipo === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFiltroTipo("all")}>Todas</Button>
              <Button variant={filtroTipo === "trail" ? "secondary" : "ghost"} size="sm" onClick={() => setFiltroTipo("trail")} className="flex items-center gap-1">
                <Mountain className="h-4 w-4" /> Trail
              </Button>
              <Button variant={filtroTipo === "mtb" ? "secondary" : "ghost"} size="sm" onClick={() => setFiltroTipo("mtb")} className="flex items-center gap-1">
                <Bike className="h-4 w-4" /> MTB
              </Button>
            </div>
          </div>
        </div>
      </header>

      {filtroTiempo !== "past" && (
        <Bloque
          etiqueta="Calendario"
          titulo="Próximas carreras"
          enlace="/races?filter=upcoming"
          textoEnlace="Ver todas"
          carreras={proximas}
          total={todasProximas.length}
          cargando={cargando}
          vacio="No hay carreras próximas con ese filtro."
          onVerMas={() => setLimiteProximas((n) => n + POR_BLOQUE)}
        />
      )}

      {filtroTiempo !== "upcoming" && (
        <Bloque
          etiqueta="Resultados"
          titulo="Últimas carreras"
          enlace="/races?filter=past"
          textoEnlace="Clasificaciones"
          carreras={ultimas}
          total={todasUltimas.length}
          cargando={cargando}
          vacio="No hay carreras celebradas con ese filtro."
          onVerMas={() => setLimiteUltimas((n) => n + POR_BLOQUE)}
        />
      )}

      {/* Carrusel: aquí irán las ventajas de Camberas. Mientras no estén
          decididas, dos diapositivas con datos de verdad. */}
      <section className="border-t border-border bg-muted/30 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <Carousel setApi={setApi} opts={{ loop: true }}>
            <CarouselContent>
              <CarouselItem>
                <Diapositiva icono={<Timer className="h-5 w-5" />} etiqueta="No te quedes fuera" titulo="Inscripciones que cierran antes">
                  {cierranAntes.length === 0 && !cargando && <p className="text-muted-foreground">Ahora mismo no hay inscripciones abiertas.</p>}
                  {cierranAntes.map((c) => (
                    <Fila
                      key={c.id}
                      titulo={c.name}
                      detalle={`${c.date}${c.cierre ? ` · cierra el ${formatearCierre(c.cierre)}` : ""}`}
                      extra={c.priceLabel ?? undefined}
                      enlace={`/race/${c.slug ?? c.id}`}
                      accion="Inscribirme"
                    />
                  ))}
                </Diapositiva>
              </CarouselItem>
              <CarouselItem>
                <Diapositiva icono={<Trophy className="h-5 w-5" />} etiqueta="Ya se ha corrido" titulo="Últimas clasificaciones">
                  {ultimasClasificaciones.length === 0 && !cargando && <p className="text-muted-foreground">Todavía no hay clasificaciones.</p>}
                  {ultimasClasificaciones.map((c) => (
                    <Fila key={c.id} titulo={c.name} detalle={`${c.date} · ${c.location}`} enlace={`/race/${c.slug ?? c.id}/results`} accion="Ver clasificación" />
                  ))}
                </Diapositiva>
              </CarouselItem>
            </CarouselContent>
          </Carousel>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" aria-label="Anterior" onClick={() => api?.scrollPrev()} className="rounded-full border border-border p-2 hover:bg-background">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`Diapositiva ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={`h-2 rounded-full transition-all ${diapositiva === i ? "w-6 bg-primary" : "w-2 bg-border"}`}
              />
            ))}
            <button type="button" aria-label="Siguiente" onClick={() => api?.scrollNext()} className="rounded-full border border-border p-2 hover:bg-background">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

function Diapositiva({ icono, etiqueta, titulo, children }: { icono: React.ReactNode; etiqueta: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2 text-primary">
        {icono}
        <p className="text-[11px] font-bold uppercase tracking-widest">{etiqueta}</p>
      </div>
      <h2 className="font-archivo text-2xl md:text-3xl text-foreground mb-5">{titulo}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Fila({ titulo, detalle, extra, enlace, accion }: { titulo: string; detalle: string; extra?: string; enlace: string; accion: string }) {
  return (
    <Link to={enlace} className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:shadow-elevated transition-all">
      <div className="min-w-0">
        <p className="font-bold text-foreground truncate">{titulo}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Calendar className="h-3.5 w-3.5 shrink-0" /> {detalle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {extra && <span className="font-archivo text-lg text-secondary">{extra}</span>}
        <span className="flex items-center gap-1 text-sm font-bold text-primary group-hover:gap-2 transition-all">
          {accion} <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

export default Inicio;
