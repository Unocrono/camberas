import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  FileText,
  Users,
  MapPin,
  Timer,
  Trophy,
  Settings,
  ArrowRight,
  Lightbulb,
  AlertCircle,
  Rocket,
} from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Crear tu Carrera",
    icon: FileText,
    description: "Configura los datos básicos de tu evento deportivo",
    color: "bg-blue-500",
    details: [
      "Accede al Panel de Organizador desde el menú principal",
      "Haz clic en 'Nueva Carrera' para comenzar",
      "Completa el nombre, fecha, ubicación y tipo de carrera (trail, asfalto, MTB...)",
      "Añade una descripción atractiva para los participantes",
      "Sube el logo y las imágenes de portada de tu carrera",
      "Configura el email de contacto del organizador",
    ],
    tips: [
      "Usa un nombre descriptivo que incluya el año",
      "Las imágenes de alta calidad aumentan las inscripciones",
      "Incluye información sobre el entorno y la dificultad",
    ],
  },
  {
    number: 2,
    title: "Configurar Distancias/Modalidades",
    icon: MapPin,
    description: "Define las diferentes modalidades de tu carrera",
    color: "bg-green-500",
    details: [
      "Dentro de tu carrera, ve a la sección 'Distancias'",
      "Crea cada modalidad: 10K, 21K, 42K, Trail, etc.",
      "Configura para cada una: distancia, desnivel, precio, límite de participantes",
      "Asigna rangos de dorsales (ej: 1-500 para Maratón, 501-1000 para Media)",
      "Sube el archivo GPX del recorrido si lo tienes",
      "Activa el seguimiento GPS si quieres que los corredores puedan ser seguidos en vivo",
    ],
    tips: [
      "Los rangos de dorsales ayudan a identificar rápidamente la modalidad",
      "El archivo GPX permite mostrar el recorrido en el mapa",
      "Configura precios early bird creando nuevas distancias temporales",
    ],
  },
  {
    number: 3,
    title: "Personalizar el Formulario de Inscripción",
    icon: Users,
    description: "Adapta qué datos pides a los participantes",
    color: "bg-purple-500",
    details: [
      "Cada distancia tiene su propio formulario de inscripción",
      "Por defecto incluye: nombre, email, DNI, teléfono, género, fecha nacimiento, talla camiseta",
      "Puedes ocultar campos que no necesites",
      "Añade campos personalizados: alergias, club, licencia federativa, etc.",
      "Marca qué campos son obligatorios",
      "Reordena los campos arrastrando y soltando",
    ],
    tips: [
      "Pide solo los datos que realmente necesitas",
      "El campo 'Club' es útil para clasificaciones por equipos",
      "Añade un campo de texto para observaciones médicas importantes",
    ],
  },
  {
    number: 4,
    title: "Crear el Roadbook",
    icon: FileText,
    description: "Documenta el recorrido punto por punto",
    color: "bg-orange-500",
    details: [
      "El roadbook es la guía detallada del recorrido",
      "Añade puntos de interés: avituallamientos, cambios de dirección, peligros...",
      "Para cada punto indica: km, descripción, coordenadas (opcional)",
      "Puedes subir fotos de referencia para cada punto",
      "Configura diferentes ritmos estimados (3h, 4h, 5h...)",
      "Los corredores podrán ver los tiempos estimados de paso según su ritmo",
    ],
    tips: [
      "Incluye fotos en cruces confusos",
      "Marca claramente los avituallamientos y qué ofrecen",
      "Indica puntos con cobertura móvil limitada",
    ],
  },
  {
    number: 5,
    title: "Configurar Puntos de Cronometraje",
    icon: Timer,
    description: "Define dónde se tomarán los tiempos",
    color: "bg-red-500",
    details: [
      "Crea los puntos de cronometraje: Salida, intermedios, Meta",
      "Cada punto necesita: nombre, km, coordenadas (opcional)",
      "Los checkpoints se vinculan a las distancias correspondientes",
      "Asigna cronometradores a cada punto desde la sección 'Cronometradores'",
      "Los cronometradores usan la app /timing para registrar tiempos",
      "Los tiempos parciales aparecerán automáticamente en los resultados",
    ],
    tips: [
      "Sitúa checkpoints en puntos accesibles para los cronometradores",
      "Un checkpoint cada 10-15km es recomendable para carreras largas",
      "Asegura cobertura móvil o prepara modo offline",
    ],
  },
  {
    number: 6,
    title: "Gestionar Inscripciones",
    icon: Users,
    description: "Administra los participantes inscritos",
    color: "bg-teal-500",
    details: [
      "Visualiza todas las inscripciones en tiempo real",
      "Filtra por distancia, estado de pago, fecha...",
      "Exporta listados a Excel/CSV para imprimir",
      "Gestiona cancelaciones y cambios de distancia",
      "Los dorsales se asignan automáticamente según el rango configurado",
      "Puedes reasignar dorsales manualmente si es necesario",
    ],
    tips: [
      "Revisa las inscripciones pendientes de pago regularmente",
      "Exporta el listado final una semana antes para preparar dorsales",
      "Comunica cambios importantes por email a los inscritos",
    ],
  },
  {
    number: 7,
    title: "Día de Carrera: Cronometraje",
    icon: Timer,
    description: "Registra los tiempos en vivo",
    color: "bg-amber-500",
    details: [
      "Los cronometradores acceden a /timing con sus credenciales",
      "Seleccionan la carrera y el punto de control asignado",
      "Registran dorsales escribiendo el número y pulsando el botón de tiempo",
      "Los tiempos se sincronizan automáticamente si hay conexión",
      "En modo offline, los tiempos se guardan localmente y se suben al recuperar conexión",
      "Pueden marcar retirados (DNF) indicando el motivo",
    ],
    tips: [
      "Haz una prueba con los cronometradores antes de la carrera",
      "Cada cronometrador debe tener batería suficiente",
      "Ten un backup manual por si falla la tecnología",
    ],
  },
  {
    number: 8,
    title: "Publicar Resultados",
    icon: Trophy,
    description: "Comparte las clasificaciones con los participantes",
    color: "bg-indigo-500",
    details: [
      "Accede a 'Resultados' dentro de tu carrera",
      "Los tiempos de meta generan resultados automáticamente",
      "Revisa y corrige posibles errores antes de publicar",
      "Las clasificaciones se calculan automáticamente: general, género, categoría",
      "Publica los resultados para que sean visibles públicamente",
      "Los corredores reciben notificación y pueden ver sus tiempos y splits",
    ],
    tips: [
      "Revisa los primeros puestos manualmente para evitar errores",
      "Publica resultados provisionales rápidamente, luego revisa",
      "Responde rápido a reclamaciones sobre tiempos",
    ],
  },
];

const OrganizerGuide = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <Badge className="mb-4" variant="secondary">
              <Rocket className="h-3 w-3 mr-1" />
              Guía Completa
            </Badge>
            <h1 className="text-4xl font-bold mb-4">Guía para Organizadores</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Aprende paso a paso cómo crear y gestionar tu carrera en Camberas,
              desde la configuración inicial hasta la publicación de resultados.
            </p>
          </div>

          {/* Quick access */}
          <Card className="mb-12 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold mb-1">¿Ya tienes cuenta de organizador?</h3>
                  <p className="text-sm text-muted-foreground">
                    Accede al panel de organizador para gestionar tus carreras
                  </p>
                </div>
                <Button asChild>
                  <Link to="/organizer">
                    Ir al Panel
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Steps Timeline */}
          <div className="space-y-6">
            {steps.map((step, index) => (
              <Card key={step.number} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    {/* Step number */}
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-full ${step.color} text-white flex items-center justify-center font-bold text-xl`}
                    >
                      {step.number}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <step.icon className="h-5 w-5 text-muted-foreground" />
                        {step.title}
                      </CardTitle>
                      <p className="text-muted-foreground mt-1">{step.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="details" className="border-none">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        Ver instrucciones detalladas
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {/* Steps list */}
                          <div className="space-y-2">
                            {step.details.map((detail, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                <span className="text-sm">{detail}</span>
                              </div>
                            ))}
                          </div>

                          {/* Tips */}
                          {step.tips && step.tips.length > 0 && (
                            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                              <div className="flex items-center gap-2 mb-2">
                                <Lightbulb className="h-4 w-4 text-amber-600" />
                                <span className="font-medium text-sm text-amber-800 dark:text-amber-200">
                                  Consejos
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {step.tips.map((tip, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"
                                  >
                                    <span className="text-amber-500">•</span>
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="flex justify-center -mb-3 relative z-10">
                    <div className="w-0.5 h-6 bg-border" />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Additional resources */}
          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertCircle className="h-5 w-5 text-blue-500" />
                  ¿Tienes dudas?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Consulta las preguntas frecuentes para organizadores o contacta con nosotros.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/faqs">Ver FAQs</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/contact">Contactar</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5 text-purple-500" />
                  Solicitar acceso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  ¿Aún no tienes cuenta de organizador? Solicita acceso desde tu perfil.
                </p>
                <Button size="sm" asChild>
                  <Link to="/organizer-profile">Solicitar ser organizador</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrganizerGuide;
