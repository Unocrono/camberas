import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import timingSystem1 from "@/assets/timing-system1.jpg";
import timingSystem2 from "@/assets/timing-system2.jpg";
import timingSystem3 from "@/assets/timing-system3.jpg";
const TimingShop = () => {
  const timingPackages = [
    {
      name: "Básico",
      description: "Perfecto para carreras pequeñas hasta 200 participantes",
      price: "350€",
      image: timingSystem1,
      features: [
        "0% comosión inscripciones",
        "Sistema de cronometraje RFID timing",
        "Cronometro-Reloj en meta",
        "200 chips desechables incluidos",
        "Cronometraje electrónico en meta",
        "Infinitos puntos de Cronometraje manual",
        "Software de gestión básico",
        "Clasificaciones en tiempo real",
        "Grabación en vídeo de la meta",
        "Soporte técnico durante el evento",
      ],
      maxParticipants: "200",
    },
    {
      name: "Standard",
      description: "Ideal para carreras medianas hasta 350 participantes",
      price: "500€",
      popular: true,
      image: timingSystem2,
      features: [
        "Sistema de cronometraje RFID premium",
        "Cronometro-Reloj en meta",
        "350 chips desechables incluidos",
        "Cronometraje electrónico en meta",
        "Infinitos puntos de Cronometraje manual",
        "Software de gestión avanzado",
        "Clasificaciones en tiempo real",
        "1 Punto intermedio Cronometraje electrónico",
        "Streaming de la cámara de línea de meta",
        "Soporte técnico durante el evento",
      ],
      maxParticipants: "300",
    },
    {
      name: "Profesional",
      description: "Para grandes eventos",
      price: "700€",
      image: timingSystem3,
      features: [
        "Sistema de cronometraje RFID ULTRA",
        "Cronometro Reloj en meta",
        "500 chips desechables incluidos",
        "Cronometraje electrónico en meta",
        "Streaming de la cámara de línea de meta",
        "2 puntos intermedios con Cronometraje electrónico ",
        "Streaming de la cámara de puntos de intermedios",
        "Infinitos puntos de Cronometraje manual",
        "Software profesional de cronometraje",
        "Seguimiento live",
        "Seguimiento GPS",
        "Clasificaciones en tiempo real",
        "Una persona técnico de cronometraje en la carrera",
        "Soporte técnico previo al evento",
      ],
      maxParticipants: "500",
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
              Equipos profesionales de cronometraje RFID para tu carrera de trail. Precisión, fiabilidad y
              resultados en tiempo real.
            </p>
          </div>

          {/* Packages */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {timingPackages.map((pkg, index) => (
              <Card key={index} className={`relative ${pkg.popular ? "border-2 border-primary shadow-elevated" : ""}`}>
                {pkg.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground shadow-lg font-semibold px-4 py-1 text-sm z-10">
                    Más Popular
                  </Badge>
                )}

                <div className="relative h-48 overflow-hidden rounded-t-lg">
                  <img src={pkg.image} alt={pkg.name} className="w-full h-full object-cover" />
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
                  <Button className="w-full" variant={pkg.popular ? "default" : "outline"}>
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
                Nuestro equipo puede diseñar una solución de cronometraje específica para las necesidades de tu evento,
                sin importar el tamaño o la complejidad del recorrido.
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
