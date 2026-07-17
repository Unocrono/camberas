import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mountain, Bike, Calendar, Trophy, MapPin } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";

type RaceTypeFilter = 'all' | 'trail' | 'mtb';
type TimeFilter = 'all' | 'upcoming' | 'past';

const RACES_PER_PAGE = 9;

const Races = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allRaces, setAllRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [raceTypeFilter, setRaceTypeFilter] = useState<RaceTypeFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Sync timeFilter with URL params on mount and when URL changes
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'upcoming' || filter === 'past') {
      setTimeFilter(filter);
    } else {
      setTimeFilter('all');
    }
  }, [searchParams]);

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data: racesData, error: racesError } = await supabase
        .from("races")
        .select("*")
        .order("date", { ascending: true });

      if (racesError) throw racesError;

      const racesWithDistances = await Promise.all(
        (racesData || []).map(async (race) => {
          const { data: distancesData, error: distancesError } = await supabase
            .from("race_distances")
            .select("name, price, distance_km, elevation_gain, gps_tracking_enabled")
            .eq("race_id", race.id)
            .eq("is_visible", true)
            .order("display_order", { ascending: true });

          if (distancesError) throw distancesError;

          const { count } = await supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("race_id", race.id);

          const dists = distancesData || [];
          const paidPrices = dists.map((d) => Number(d.price) || 0).filter((p) => p > 0);
          const priceLabel = paidPrices.length === 0
            ? "Gratis"
            : Math.min(...paidPrices) === Math.max(...paidPrices)
              ? `${Math.min(...paidPrices)}€`
              : `${Math.min(...paidPrices)}–${Math.max(...paidPrices)}€`;

          return {
            id: race.id,
            slug: race.slug,
            name: race.name,
            subtitle: (race as any).subtitle || null,
            date: new Date(race.date).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            rawDate: race.date,
            location: race.location,
            distances: dists.map((d) => d.name),
            participants: count || 0,
            coverImageUrl: race.cover_image_url,
            imageUrl: race.image_url,
            raceType: race.race_type as 'trail' | 'mtb',
            priceLabel,
            isPast: race.date < new Date().toISOString().split("T")[0],
            maxDistanceKm: Math.max(0, ...dists.map((d) => Number(d.distance_km) || 0)),
            maxElevation: Math.max(0, ...dists.map((d) => Number(d.elevation_gain) || 0)),
            plazas: race.max_participants || null,
            gpsEnabled: dists.some((d) => d.gps_tracking_enabled),
            distancesFull: dists.map((d) => ({
              name: d.name,
              km: Number(d.distance_km) || 0,
              elevation: Number(d.elevation_gain) || 0,
            })),
          };
        })
      );

      setAllRaces(racesWithDistances);
    } catch (error) {
      console.error("Error fetching races:", error);
    } finally {
      setLoading(false);
    }
  };

  // Carrera destacada para el hero: la próxima (más cercana en el futuro)
  const featured = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return allRaces.find((r) => r.rawDate >= today) || null;
  }, [allRaces]);

  // El hero solo se muestra en la vista limpia (sin filtros ni búsqueda)
  const showHero = timeFilter === 'all' && raceTypeFilter === 'all' && !searchTerm && !!featured;

  const raceUrl = (r: any) => (r.slug ? `/race/${r.slug}` : `/race/${r.id}`);

  const filteredRaces = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return allRaces.filter((race) => {
      const matchesSearch = race.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        race.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = raceTypeFilter === 'all' || race.raceType === raceTypeFilter;
      const matchesTime = timeFilter === 'all' || 
        (timeFilter === 'upcoming' && race.rawDate >= today) ||
        (timeFilter === 'past' && race.rawDate < today);
      return matchesSearch && matchesType && matchesTime;
    });
  }, [allRaces, searchTerm, raceTypeFilter, timeFilter]);

  const totalPages = Math.ceil(filteredRaces.length / RACES_PER_PAGE);
  
  const paginatedRaces = useMemo(() => {
    const startIndex = (currentPage - 1) * RACES_PER_PAGE;
    return filteredRaces.slice(startIndex, startIndex + RACES_PER_PAGE);
  }, [filteredRaces, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, raceTypeFilter, timeFilter]);

  const handleTimeFilterChange = (filter: TimeFilter) => {
    setTimeFilter(filter);
    if (filter === 'all') {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', filter);
    }
    setSearchParams(searchParams);
  };

  const getPageTitle = () => {
    if (timeFilter === 'upcoming') return 'Inscripciones Abiertas';
    if (timeFilter === 'past') return 'Clasificaciones';
    return 'Todas las Carreras';
  };

  const getPageSubtitle = () => {
    if (timeFilter === 'upcoming') return 'Inscríbete en las próximas carreras de Trail y MTB';
    if (timeFilter === 'past') return 'Consulta los resultados de carreras anteriores';
    return 'Encuentra tu próximo desafío en Trail o MTB';
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* HERO — carrera destacada (solo en la vista limpia) */}
      {showHero && featured && (
        <>
          <section className="relative overflow-hidden pt-24 pb-14">
            <div className="absolute -right-32 -top-24 h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
            <div className="container relative mx-auto px-4">
              <div className="grid items-center gap-10 md:grid-cols-2">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary">
                    Próxima carrera destacada
                  </p>
                  <h1 className="font-archivo mt-3 text-4xl uppercase leading-[0.98] text-foreground md:text-6xl">
                    {featured.name}
                  </h1>
                  {featured.subtitle && (
                    <p className="mt-2 text-xl font-semibold text-primary">{featured.subtitle}</p>
                  )}
                  <p className="mt-4 max-w-md text-lg text-muted-foreground">
                    {featured.location} · {featured.date}
                  </p>
                  <div className="mt-6 flex gap-8">
                    {featured.maxDistanceKm > 0 && (
                      <div>
                        <div className="font-archivo text-3xl text-primary">
                          {featured.maxDistanceKm}<span className="text-sm">KM</span>
                        </div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Distancia máx.</div>
                      </div>
                    )}
                    {featured.maxElevation > 0 && (
                      <div>
                        <div className="font-archivo text-3xl text-primary">
                          +{featured.maxElevation}<span className="text-sm">M</span>
                        </div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Desnivel</div>
                      </div>
                    )}
                    {featured.plazas && (
                      <div>
                        <div className="font-archivo text-3xl text-primary">{featured.plazas}</div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Plazas</div>
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

                <Link to={raceUrl(featured)} className="group relative block">
                  {/* Imagen Principal (16:9) — la Portada panorámica queda para
                      la cabecera de la página de la carrera */}
                  <div className="relative aspect-video overflow-hidden rounded-3xl bg-primary shadow-elevated">
                    {(featured.imageUrl || featured.coverImageUrl) && (
                      <img
                        src={featured.imageUrl || featured.coverImageUrl}
                        alt={featured.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    {/* Sin texto encima: el nombre ya está al lado y taparía
                        la franja panorámica */}
                    <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-secondary/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {featured.date}
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          </section>

          {/* Píldora de datos (banda oscura de acento) */}
          <div className="container mx-auto px-4">
            <div className="-mt-4 mb-4 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-primary px-8 py-5 shadow-elevated">
              {(featured.distancesFull || []).slice(0, 3).map((d: any, i: number) => (
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
                    <div className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/60">En directo</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className={showHero ? "pb-16" : "pt-24 pb-16"}>
        <div className="container mx-auto px-4">
          <div className={showHero ? "text-center mb-12 mt-8" : "text-center mb-12"}>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {getPageTitle()}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              {getPageSubtitle()}
            </p>
            
            <div className="max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  placeholder="Buscar carreras..." 
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              {/* Time filters */}
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <Button 
                  variant={timeFilter === 'all' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => handleTimeFilterChange('all')}
                >
                  Todas
                </Button>
                <Button 
                  variant={timeFilter === 'upcoming' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => handleTimeFilterChange('upcoming')}
                  className="flex items-center gap-1"
                >
                  <Calendar className="h-4 w-4" />
                  Próximas
                </Button>
                <Button 
                  variant={timeFilter === 'past' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => handleTimeFilterChange('past')}
                  className="flex items-center gap-1"
                >
                  <Trophy className="h-4 w-4" />
                  Pasadas
                </Button>
              </div>
              
              {/* Type filters */}
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                <Button 
                  variant={raceTypeFilter === 'all' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => setRaceTypeFilter('all')}
                >
                  Todas
                </Button>
                <Button 
                  variant={raceTypeFilter === 'trail' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => setRaceTypeFilter('trail')}
                  className="flex items-center gap-1"
                >
                  <Mountain className="h-4 w-4" />
                  Trail
                </Button>
                <Button 
                  variant={raceTypeFilter === 'mtb' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => setRaceTypeFilter('mtb')}
                  className="flex items-center gap-1"
                >
                  <Bike className="h-4 w-4" />
                  MTB
                </Button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando carreras...</p>
            </div>
          ) : filteredRaces.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Mostrando {paginatedRaces.length} de {filteredRaces.length} carreras
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {paginatedRaces.map((race) => (
                  <RaceCard key={race.id} {...race} />
                ))}
              </div>
              
              {totalPages > 1 && (
                <Pagination className="mt-8">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No se encontraron carreras</p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Races;
