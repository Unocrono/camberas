import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mountain, Bike, Calendar, Trophy } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(() => {
    const filter = searchParams.get('filter');
    if (filter === 'upcoming' || filter === 'past') return filter;
    return 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);

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
            .select("name")
            .eq("race_id", race.id);

          if (distancesError) throw distancesError;

          const { data: registrationsData, error: registrationsError } = await supabase
            .from("registrations")
            .select("id")
            .eq("race_id", race.id);

          if (registrationsError) throw registrationsError;

          return {
            id: race.id,
            name: race.name,
            date: new Date(race.date).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            rawDate: race.date,
            location: race.location,
            distances: (distancesData || []).map((d) => d.name),
            participants: registrationsData?.length || 0,
            imageUrl: race.image_url,
            raceType: race.race_type as 'trail' | 'mtb',
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
    if (timeFilter === 'upcoming') return 'Inscríbete en las próximas carreras de Trail Running y MTB';
    if (timeFilter === 'past') return 'Consulta los resultados de carreras anteriores';
    return 'Encuentra tu próximo desafío en Trail Running o MTB';
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
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
