import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import penaPrietaImg from "@/assets/pena-prieta-skyrace.jpg";
import trailCarabeosImg from "@/assets/trail-los-carabeos.jpg";
import turtziozImg from "@/assets/turtzioz-walk-run.jpg";
import loiuTrailImg from "@/assets/loiu-trail.jpg";
import trailComillasImg from "@/assets/trail-comillas.jpg";

const Races = () => {
  const allRaces = [
    {
      id: "1",
      name: "VI Trail Villa de Comillas",
      date: "11 de Mayo, 2025",
      location: "Comillas, Cantabria",
      distances: ["25K", "16K", "14K"],
      participants: 500,
      imageUrl: trailComillasImg,
    },
    {
      id: "2",
      name: "II Loiu 500 Trail",
      date: "1 de Junio, 2025",
      location: "Loiu, Vizcaya",
      distances: ["10K", "1.8K"],
      participants: 350,
      imageUrl: loiuTrailImg,
    },
    {
      id: "3",
      name: "Turtzioz Walk Run",
      date: "29 de Junio, 2025",
      location: "Trucios-Turtzioz, Vizcaya",
      distances: ["15K"],
      participants: 280,
      imageUrl: turtziozImg,
    },
    {
      id: "4",
      name: "IX Trail Los Carabeos",
      date: "27 de Julio, 2025",
      location: "Los Carabeos, Cantabria",
      distances: ["21K"],
      participants: 320,
      imageUrl: trailCarabeosImg,
    },
    {
      id: "5",
      name: "Peña Prieta SkyRace",
      date: "4 de Octubre, 2025",
      location: "Vega de Liébana, Cantabria",
      distances: ["36K", "8K"],
      participants: 450,
      imageUrl: penaPrietaImg,
    },
  ];

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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {allRaces.map((race) => (
              <RaceCard key={race.id} {...race} />
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Races;
