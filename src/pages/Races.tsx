import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const Races = () => {
  const [allRaces, setAllRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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
            location: race.location,
            distances: (distancesData || []).map((d) => d.name),
            participants: registrationsData?.length || 0,
            imageUrl: race.image_url,
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

  const filteredRaces = allRaces.filter(
    (race) =>
      race.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      race.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Todas las Carreras
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Encuentra tu próximo desafío en la montaña
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
              
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <Button variant="outline" size="sm">Todas</Button>
                <Button variant="outline" size="sm">10K-21K</Button>
                <Button variant="outline" size="sm">30K-42K</Button>
                <Button variant="outline" size="sm">50K+</Button>
                <Button variant="outline" size="sm">Ultra</Button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando carreras...</p>
            </div>
          ) : filteredRaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredRaces.map((race) => (
                <RaceCard key={race.id} {...race} />
              ))}
            </div>
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
