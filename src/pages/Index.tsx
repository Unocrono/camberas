import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin, Calendar, Mountain, TrendingUp } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const RACES_PER_PAGE = 8;

interface HomeRace {
  id: string;
  slug: string | null;
  name: string;
  date: string;
  rawDate: string;
  location: string;
  distances: string[];
  participants: number;
  coverImageUrl?: string;
  imageUrl?: string;
  raceType: "trail" | "mtb";
  priceLabel: string | null;
  maxDistanceKm: number;
  maxElevation: number;
  plazas: number | null;
  gpsEnabled: boolean;
  isPast: boolean;
  distancesFull: { name: string; km: number; elevation: number }[];
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

const priceRange = (prices: number[]): string | null => {
  const paid = prices.filter((p) => p > 0);
  if (paid.length === 0) return "Gratis";
  const min = Math.min(...paid);
  const max = Math.max(...paid);
  return min === max ? `${min}€` : `${min}–${max}€`;
};

const Index = () => {
  const [races, setRaces] = useState<HomeRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data: racesData, error } = await supabase
        .from("races")
        .select("*")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (error) throw error;

      const enriched = await Promise.all(
        (racesData || []).map(async (race): Promise<HomeRace> => {
          const { data: distancesData } = await supabase
            .from("race_distances")
            .select("name, distance_km, elevation_gain, price, gps_tracking_enabled, max_participants")
            .eq("race_id", race.id)
            .eq("is_visible", true)
            .order("display_order", { ascending: true });

          const { count } = await supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("race_id", race.id);

          const dists = distancesData || [];
          return {
            id: race.id,
            slug: race.slug,
            name: race.name,
            date: formatDate(race.date),
            rawDate: race.date,
            location: race.location,
            distances: dists.map((d) => d.name),
            participants: count || 0,
            coverImageUrl: race.cover_image_url || undefined,
            imageUrl: race.image_url || undefined,
            raceType: (race.race_type as "trail" | "mtb") || "trail",
            priceLabel: priceRange(dists.map((d) => Number(d.price) || 0)),
            maxDistanceKm: Math.max(0, ...dists.map((d) => Number(d.distance_km) || 0)),
            maxElevation: Math.max(0, ...dists.map((d) => Number(d.elevation_gain) || 0)),
            plazas: race.max_participants || null,
            gpsEnabled: dists.some((d) => d.gps_tracking_enabled),
            isPast: false,
            distancesFull: dists.map((d) => ({
              name: d.name,
              km: Number(d.distance_km) || 0,
              elevation: Number(d.elevation_gain) || 0,
            })),
          };
        })
      );
      setRaces(enriched);
    } catch (err) {
      console.error("Error fetching races:", err);
    } finally {
      setLoading(false);
    }
  };

  const featured = races[0];
  const rest = races.slice(1);
  const totalPages = Math.ceil(rest.length / RACES_PER_PAGE);
  const paginatedRaces = useMemo(() => {
    const start = (currentPage - 1) * RACES_PER_PAGE;
    return rest.slice(start, start + RACES_PER_PAGE);
  }, [rest, currentPage]);

  const raceUrl = (r: HomeRace) => (r.slug ? `/race/${r.slug}` : `/race/${r.id}`);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* HERO — carrera destacada */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-28 md:pb-20">
        <div className="absolute -right-32 -top-24 h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="container relative mx-auto px-4">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">Cargando…</div>
          ) : featured ? (
            <div className="grid items-center gap-10 md:grid-cols-2">
              {/* Izquierda */}
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary">
                  Próxima carrera destacada
                </p>
                <h1 className="font-archivo mt-3 text-4xl uppercase leading-[0.98] text-foreground md:text-6xl">
                  {featured.name}
                </h1>
                <p className="mt-4 max-w-md text-lg text-muted-foreground">
                  {featured.location} · {featured.date}
                </p>

                <div className="mt-6 flex gap-8">
                  {featured.maxDistanceKm > 0 && (
                    <div>
                      <div className="font-archivo text-3xl text-primary">
                        {featured.maxDistanceKm}
                        <span className="text-sm">KM</span>
                      </div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Distancia máx.
                      </div>
                    </div>
                  )}
                  {featured.maxElevation > 0 && (
                    <div>
                      <div className="font-archivo text-3xl text-primary">
                        +{featured.maxElevation}
                        <span className="text-sm">M</span>
                      </div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Desnivel
                      </div>
                    </div>
                  )}
                  {featured.plazas && (
                    <div>
                      <div className="font-archivo text-3xl text-primary">{featured.plazas}</div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Plazas
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-7 flex gap-3">
                  <Button asChild size="lg" variant="secondary">
                    <Link to={raceUrl(featured)}>Inscribirme</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to={raceUrl(featured)}>Ver detalles</Link>
                  </Button>
                </div>
              </div>

              {/* Derecha — cartel */}
              <Link to={raceUrl(featured)} className="group relative block">
                <div className="relative aspect-video overflow-hidden rounded-3xl bg-primary shadow-elevated">
                  {(featured.imageUrl || featured.coverImageUrl) && (
                    <img
                      src={featured.imageUrl || featured.coverImageUrl}
                      alt={featured.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-secondary/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {featured.date}
                  </span>
                </div>
              </Link>
            </div>
          ) : (
            <div className="py-16 text-center">
              <h1 className="font-archivo text-4xl uppercase text-foreground">Camberas</h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Cronometraje, inscripciones y seguimiento GPS de carreras de montaña
              </p>
            </div>
          )}
        </div>
      </section>

      {/* PÍLDORA de datos (banda oscura de acento) */}
      {featured && !loading && (
        <div className="container mx-auto px-4">
          <div className="mx-auto -mt-6 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-primary px-8 py-5 shadow-elevated">
            {featured.distancesFull.slice(0, 3).map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                {d.km > 0 && (
                  <div className="font-archivo text-2xl text-secondary">
                    {d.km}<span className="text-xs">KM</span>
                  </div>
                )}
                <div>
                  <div className="font-archivo text-xl text-primary-foreground">{d.name}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/60">
                    {d.elevation > 0 ? `+${d.elevation} m desnivel` : "Recorrido"}
                  </div>
                </div>
              </div>
            ))}
            {featured.gpsEnabled && (
              <div className="flex items-center gap-3">
                <MapPin className="h-7 w-7 text-secondary fill-secondary" />
                <div>
                  <div className="font-archivo text-lg text-primary-foreground">GPS</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/60">
                    En directo
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRÓXIMAS CARRERAS */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="font-archivo text-2xl uppercase text-foreground md:text-3xl">
              Próximas carreras
            </h2>
            <Link to="/races" className="text-sm font-bold text-primary hover:underline">
              Ver todas <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando carreras…</div>
          ) : races.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No hay carreras próximas disponibles</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {paginatedRaces.map((race) => (
                  <RaceCard key={race.id} {...race} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination className="mt-10">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </div>
      </section>

      {/* Servicios */}
      <section className="border-t border-border bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl bg-card p-8 text-center shadow-sm transition-all hover:shadow-elevated">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-hero">
                <Mountain className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Trail y montaña</h3>
              <p className="text-muted-foreground">Descubre carreras por las mejores sierras y descarga sus recorridos GPX.</p>
            </div>
            <div className="rounded-2xl bg-card p-8 text-center shadow-sm transition-all hover:shadow-elevated">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-hero">
                <MapPin className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Seguimiento GPS</h3>
              <p className="text-muted-foreground">Tus familiares te siguen en tiempo real en el mapa durante la carrera.</p>
            </div>
            <div className="rounded-2xl bg-card p-8 text-center shadow-sm transition-all hover:shadow-elevated">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-hero">
                <TrendingUp className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Cronometraje profesional</h3>
              <p className="text-muted-foreground">Resultados y clasificaciones al instante para tu evento.</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
