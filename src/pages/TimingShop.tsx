import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import timingSystem from "@/assets/timing-system.jpg";

const TimingShop = () => {
  const timingPackages = [
    {
      name: "Básico",
      description: "Perfecto para carreras pequeñas hasta 200 participantes",
      price: "350€",
      image: timingSystem,
      features: [
        "Sistema de cronometraje RFID",
        "200 chips desechables incluidos",
        "1 línea de meta",
        "Software de gestión básico",
        "Clasificaciones en tiempo real",
        "Soporte técnico durante el evento",
      ],
      maxParticipants: "200",
    },
    {
      name: "Profesional",
      description: "Ideal para carreras medianas hasta 500 participantes",
      price: "750€",
      popular: true,
      image: timingSystem,
      features: [
        "Sistema de cronometraje RFID premium",
        "500 chips reutilizables incluidos",
        "2 líneas (salida y meta)",
        "Software de gestión avanzado",
        "Clasificaciones en tiempo real + históricos",
        "Puntos intermedios de paso",
        "Pantalla LED de resultados",
        "Soporte técnico 24/7",
      ],
      maxParticipants: "500",
    },
    {
      name: "Ultra",
      description: "Para grandes eventos y ultra trails",
      price: "1.500€",
      image: timingSystem,
      features: [
        "Sistema completo multi-punto",
        "1000 chips reutilizables incluidos",
        "Puntos de control ilimitados",
        "Software profesional completo",
        "App móvil para seguimiento live",
        "Análisis detallado de rendimiento",
        "2 pantallas LED de resultados",
        "Fotografía automática en meta",
        "Equipo técnico en sitio",
        "Soporte premium 24/7",
      ],
      maxParticipants: "1000+",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Alquiler de Sistemas de Cronometraje
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Equipos profesionales de cronometraje RFID para tu carrera de trail running. 
              Precisión, fiabilidad y resultados en tiempo real.
            </p>
          </div>

          {/* Packages */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {timingPackages.map((pkg, index) => (
              <Card 
                key={index} 
                className={`relative ${pkg.popular ? 'border-2 border-primary shadow-elevated' : ''}`}
              >
                {pkg.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-secondary">
                    Más Popular
                  </Badge>
                )}
                
                <div className="relative h-48 overflow-hidden rounded-t-lg">
                  <img 
                    src={pkg.image} 
                    alt={pkg.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <CardHeader>
                  <CardTitle className="text-2xl">{pkg.name}</CardTitle>
                  <CardDescription>{pkg.description}</CardDescription>
                  <div className="pt-4">
                    <p className="text-4xl font-bold text-primary">{pkg.price}</p>
                    <p className="text-sm text-muted-foreground mt-1">por evento</p>
                    <Badge variant="outline" className="mt-2">
                      Hasta {pkg.maxParticipants} participantes
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant={pkg.popular ? "default" : "outline"}
                  >
                    Solicitar Información
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Additional Info */}
          <Card className="bg-gradient-hero text-primary-foreground">
            <CardHeader>
              <CardTitle className="text-2xl">¿Necesitas algo personalizado?</CardTitle>
              <CardDescription className="text-primary-foreground/80">
                Ofrecemos soluciones a medida para eventos especiales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Nuestro equipo puede diseñar una solución de cronometraje específica para las necesidades 
                de tu evento, sin importar el tamaño o la complejidad del recorrido.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  Carreras por etapas
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  Eventos multi-deporte
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  Ultra trails de varios días
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  Integración con plataformas existentes
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="lg">
                Contactar con Ventas
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default TimingShop;
