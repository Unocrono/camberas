import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import planGrupetta from "@/assets/plan-grupetta.svg";
import planQuedada from "@/assets/plan-quedada.svg";
import planProfesional from "@/assets/plan-profesional.svg";
const Planes = () => {
  const timingPackages = [
    {
      name: "Grupetta",
      description: "Para rodar con los tuyos, sin líos",
      price: "0€",
      priceNote: "gratis, para siempre",
      cta: "Empezar gratis",
      ctaLink: "/grupetta",
      tagline: "Hasta 20 · controla tu salida y a los tuyos",
      image: planGrupetta,
      features: [
        { group: "Panel web · Capo de la Grupetta" },
        "Horario, punto de encuentro y ruta",
        "App del Capo: todo en tu móvil",
        "El Capo no pierde a nadie por el camino",
        "Sin cuentas, sin publicidad — gratis de verdad",
        { group: "App de localización · miembros de la Grupetta" },
        "Mapa en vivo: os veis todos, en tiempo real",
        "Todos en el mapa, como las estrellas",
        "Funciona con la pantalla apagada (sin gastar batería)",
        "Os unís con un QR — sin registros ni contraseñas",
        "Botón de pinchazo / avería: que nadie se quede tirado en la cuneta",
        "Aviso si alguien se descuelga del grupo",
        "Distancia y hueco entre compañeros",
      ],
    },
    {
      name: "Quedada",
      description: "Ideal para la versión beta de tu carrera",
      price: "50€",
      priceNote: "por evento",
      cta: "Quiero mi Quedada",
      popular: true,
      tagline: "Hasta 50 participantes",
      image: planQuedada,
      features: [
        "App de Organizador",
        "App Seguimiento participànte",
        "50 dorsales · Publicidad inferior exclusivo Camberas",
        "Inscripciones online free\u00a0",
        "Cobra con tarjeta — pasarela de pago incluida",
        "Puntos de cronometraje manual",
        "Software de gestión avanzado",
        "Clasificaciones en tiempo real",
        "Seguimiento GPS en vivo de los participantes",
        "Diseñador de dorsales y reglamento online",
        "Soporte técnico para crear tu Quedada en Camberas",
      ],
    },
    {
      name: "Profesional",
      description: "Para grandes eventos",
      price: "700€",
      priceNote: "por evento",
      cta: "Solicitar información",
      tagline: "Hasta 500 participantes",
      image: planProfesional,
      features: [
        { group: "Todo lo de la Quedada, y además:" },
        "Sistema de cronometraje Profesional",
        "Cronómetro-Reloj en meta",
        "500 chips desechables incluidos",
        "Cronometraje electrónico en meta",
        "2 puntos intermedios con cronometraje electrónico",
        "Streaming de la cámara de línea de meta",
        "Streaming de la cámara de puntos intermedios",
        "Infinitos puntos de cronometraje manual",
        "Clasificaciones en tiempo real",
        "Seguimiento live y GPS",
        "Técnico de cronometraje en la carrera",
        "Soporte técnico previo al evento",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="font-archivo text-4xl leading-[0.98] text-foreground mb-4 md:text-5xl">
              Ponme cuarto y mitad de Camberas
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Conocer Camberas es sencillo: tres opciones para dar el salto. Empieza gratis con tu grupeta y sube de nivel cuando quieras.
            </p>
          </div>

          {/* Packages */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {timingPackages.map((pkg, index) => (
              <Card key={index} className={`relative ${pkg.popular ? "border-2 border-primary shadow-elevated" : ""}`}>
                <div className="relative h-48 overflow-hidden rounded-t-lg group">
                  <img 
                    src={pkg.image} 
                    alt={pkg.name} 
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                <CardHeader>
                  <CardTitle className="font-archivo text-2xl uppercase">{pkg.name}</CardTitle>
                  <CardDescription>{pkg.description}</CardDescription>
                  <div className="pt-4">
                    <p className="font-archivo text-4xl text-secondary">{pkg.price}</p>
                    <p className="text-sm text-muted-foreground mt-1">{pkg.priceNote}</p>
                    <Badge variant="outline" className="mt-2">
                      {pkg.tagline}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3">
                    {pkg.features.map((feature, i) =>
                      typeof feature === "object" ? (
                        <li key={i} className="pt-2 first:pt-0">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                            {feature.group}
                          </span>
                        </li>
                      ) : (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground">{feature}</span>
                        </li>
                      )
                    )}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button className="w-full" variant={pkg.popular ? "secondary" : "outline"} asChild>
                    <Link to={(pkg as any).ctaLink ?? "/contact"}>{pkg.cta}</Link>
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
              <Button variant="secondary" size="lg" asChild>
                <Link to="/contact">Contactar con Ventas</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Planes;
