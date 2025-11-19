import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy, Timer, Mountain } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import heroImage from "@/assets/hero-trail.jpg";
import raceScene from "@/assets/race-scene.jpg";

const Index = () => {
  const upcomingRaces = [
    {
      id: "1",
      name: "Ultra Trail Sierra Norte",
      date: "15 de Junio, 2025",
      location: "Sierra Norte, España",
      distances: ["50K", "30K", "15K"],
      participants: 450,
      imageUrl: raceScene,
    },
    {
      id: "2",
      name: "Camberas Mountain Race",
      date: "22 de Julio, 2025",
      location: "Picos de Europa",
      distances: ["42K", "21K"],
      participants: 320,
      imageUrl: raceScene,
    },
    {
      id: "3",
      name: "Trail Nocturno Luna Llena",
      date: "10 de Agosto, 2025",
      location: "Montseny",
      distances: ["25K", "12K"],
      participants: 280,
      imageUrl: raceScene,
    },
  ];

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
            Vive la Montaña
          </h1>
          <p className="text-xl md:text-2xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Descubre las mejores carreras de trail running y encuentra el sistema de cronometraje perfecto para tu evento
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" variant="secondary" className="text-lg px-8">
              <Link to="/races">
                Ver Carreras <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 bg-background/20 backdrop-blur-sm border-primary-foreground/30 text-primary-foreground hover:bg-background/30">
              <Link to="/timing-shop">
                Alquiler Cronometraje
              </Link>
            </Button>
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
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
