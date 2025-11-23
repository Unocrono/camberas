import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy, Timer, Mountain, Users, Calendar, Settings } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import heroImage from "@/assets/hero-trail.jpg";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [upcomingRaces, setUpcomingRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data: racesData, error: racesError } = await supabase
        .from("races")
        .select("*")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(3);

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

      setUpcomingRaces(racesWithDistances);
    } catch (error) {
      console.error("Error fetching races:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src={heroImage} 
            alt="Trail running" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/40 to-background/90" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-primary-foreground mb-6">
            Camberas
          </h1>
          <p className="text-xl md:text-2xl text-primary-foreground/90 mb-8 max-w-3xl mx-auto">
            La plataforma integral para corredores y organizadores de trail running
          </p>
          
          {/* Two Main Sections */}
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mt-12">
            {/* Para Corredores */}
            <div className="bg-card/95 backdrop-blur-sm rounded-xl p-8 shadow-elevated hover:shadow-xl transition-all duration-300 border-2 border-primary/20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-hero mb-4">
                <Mountain className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Para Corredores</h2>
              <p className="text-muted-foreground mb-6">
                Descubre carreras, inscríbete online y sigue tus resultados en tiempo real
              </p>
              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>Calendario de carreras</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Trophy className="h-4 w-4 text-primary" />
                  <span>Inscripción online</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Timer className="h-4 w-4 text-primary" />
                  <span>Resultados en vivo</span>
                </div>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link to="/races">
                  Ver Carreras <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            {/* Para Organizadores */}
            <div className="bg-card/95 backdrop-blur-sm rounded-xl p-8 shadow-elevated hover:shadow-xl transition-all duration-300 border-2 border-secondary/20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
                <Settings className="h-8 w-8 text-secondary-foreground" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Para Organizadores</h2>
              <p className="text-muted-foreground mb-6">
                Gestiona tu carrera, inscripciones y sistema de cronometraje profesional
              </p>
              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4 text-secondary" />
                  <span>Gestión de inscripciones</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Timer className="h-4 w-4 text-secondary" />
                  <span>Cronometraje profesional</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Trophy className="h-4 w-4 text-secondary" />
                  <span>Resultados automáticos</span>
                </div>
              </div>
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link to="/timing-shop">
                  Alquiler Cronometraje <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-lg bg-card shadow-sm hover:shadow-elevated transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-hero mb-6">
                <Mountain className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Carreras Épicas</h3>
              <p className="text-muted-foreground">
                Descubre rutas espectaculares en las mejores montañas de España
              </p>
            </div>
            
            <div className="text-center p-8 rounded-lg bg-card shadow-sm hover:shadow-elevated transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-hero mb-6">
                <Trophy className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Múltiples Distancias</h3>
              <p className="text-muted-foreground">
                Elige la distancia perfecta para tu nivel, desde 10K hasta ultra trails
              </p>
            </div>
            
            <div className="text-center p-8 rounded-lg bg-card shadow-sm hover:shadow-elevated transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-hero mb-6">
                <Timer className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Cronometraje Pro</h3>
              <p className="text-muted-foreground">
                Alquila sistemas de cronometraje profesional para tu evento
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Races */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-foreground mb-4">Próximas Carreras</h2>
            <p className="text-xl text-muted-foreground">
              Inscríbete ahora y asegura tu plaza
            </p>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando carreras...</p>
            </div>
          ) : upcomingRaces.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {upcomingRaces.map((race) => (
                  <RaceCard key={race.id} {...race} />
                ))}
              </div>
              
              <div className="text-center mt-12">
                <Button asChild size="lg" variant="outline">
                  <Link to="/races">
                    Ver todas las carreras <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No hay carreras próximas disponibles</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
