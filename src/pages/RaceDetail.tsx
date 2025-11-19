import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Users, Trophy, Clock, Mountain as MountainIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import raceScene from "@/assets/race-scene.jpg";

const RaceDetail = () => {
  const { id } = useParams();

  // Mock data - en producción vendría de una API
  const race = {
    id,
    name: "Ultra Trail Sierra Norte",
    date: "15 de Junio, 2025",
    location: "Sierra Norte, España",
    description: "Una carrera espectacular por las montañas de la Sierra Norte, con paisajes inolvidables y un desafío técnico que pondrá a prueba tu resistencia.",
    imageUrl: raceScene,
    participants: 450,
    maxParticipants: 600,
    distances: [
      {
        name: "50K",
        elevation: "+3200m",
        cutoffTime: "12 horas",
        price: "65€",
        availablePlaces: 120,
      },
      {
        name: "30K",
        elevation: "+1800m",
        cutoffTime: "7 horas",
        price: "45€",
        availablePlaces: 85,
      },
      {
        name: "15K",
        elevation: "+800m",
        cutoffTime: "4 horas",
        price: "30€",
        availablePlaces: 150,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20">
        {/* Hero Image */}
        <div className="relative h-[50vh] overflow-hidden">
          <img 
            src={race.imageUrl} 
            alt={race.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10 pb-16">
          <Card className="shadow-elevated">
            <CardHeader>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="secondary" className="text-base py-1">
                  Trail Running
                </Badge>
                <Badge variant="outline" className="text-base py-1">
                  Múltiples Distancias
                </Badge>
              </div>
              <CardTitle className="text-4xl md:text-5xl mb-4">{race.name}</CardTitle>
              <CardDescription className="text-lg">{race.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-8">
              {/* Info General */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha</p>
                    <p className="font-semibold">{race.date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ubicación</p>
                    <p className="font-semibold">{race.location}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Inscritos</p>
                    <p className="font-semibold">{race.participants} / {race.maxParticipants}</p>
                  </div>
                </div>
              </div>

              {/* Distancias */}
              <div>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-primary" />
                  Elige tu Distancia
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {race.distances.map((distance, index) => (
                    <Card key={index} className="border-2 hover:border-primary transition-all duration-300">
                      <CardHeader>
                        <CardTitle className="text-3xl text-primary">{distance.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MountainIcon className="h-4 w-4" />
                            <span className="text-sm">{distance.elevation}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">Tiempo límite: {distance.cutoffTime}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span className="text-sm">{distance.availablePlaces} plazas disponibles</span>
                          </div>
                        </div>
                        
                        <div className="pt-4 border-t border-border">
                          <p className="text-2xl font-bold text-foreground mb-3">{distance.price}</p>
                          <Button className="w-full">
                            Inscribirme
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Info Adicional */}
              <Card className="bg-muted/30 border-0">
                <CardHeader>
                  <CardTitle>Información Adicional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>• Cronometraje electrónico con chip</p>
                  <p>• Avituallamientos líquidos y sólidos en carrera</p>
                  <p>• Servicio médico en carrera y meta</p>
                  <p>• Seguro de accidentes incluido</p>
                  <p>• Camiseta técnica para todos los participantes</p>
                  <p>• Trofeos para los 3 primeros de cada categoría</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RaceDetail;
