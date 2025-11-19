import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RaceCard from "@/components/RaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import raceScene from "@/assets/race-scene.jpg";

const Races = () => {
  const allRaces = [
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
    {
      id: "4",
      name: "Desafío Montaña Vertical",
      date: "5 de Septiembre, 2025",
      location: "Pirineos",
      distances: ["100K", "50K"],
      participants: 180,
      imageUrl: raceScene,
    },
    {
      id: "5",
      name: "Trail Running Festival",
      date: "20 de Octubre, 2025",
      location: "Granada",
      distances: ["42K", "21K", "10K"],
      participants: 520,
      imageUrl: raceScene,
    },
    {
      id: "6",
      name: "Carrera del Bosque",
      date: "12 de Noviembre, 2025",
      location: "Cantabria",
      distances: ["30K", "15K"],
      participants: 210,
      imageUrl: raceScene,
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
