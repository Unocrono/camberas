import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, MapPin, Trophy, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const helpSections = [
  {
    id: "inscripcion",
    title: "Inscripción en Carreras",
    icon: UserPlus,
    faqs: [
      {
        question: "¿Cómo me inscribo en una carrera?",
        answer: "1. Navega a la sección 'Carreras' desde el menú principal.\n2. Selecciona la carrera que te interese.\n3. Haz clic en 'Inscribirme' y elige la distancia/modalidad.\n4. Completa el formulario con tus datos personales.\n5. Realiza el pago si es necesario.\n6. Recibirás un email de confirmación con tu dorsal asignado."
      },
      {
        question: "¿Necesito crear una cuenta para inscribirme?",
        answer: "Sí, necesitas crear una cuenta gratuita para inscribirte. Esto te permite:\n- Gestionar tus inscripciones\n- Ver tu historial de carreras\n- Acceder a tus resultados\n- Usar la app de seguimiento GPS"
      },
      {
        question: "¿Puedo modificar mis datos después de inscribirme?",
        answer: "Algunos datos pueden modificarse desde tu perfil antes de la carrera. Para cambios importantes (como la distancia), contacta directamente con el organizador de la carrera."
      },
      {
        question: "¿Cómo cancelo mi inscripción?",
        answer: "Desde tu panel 'Mi Perfil' puedes ver tus inscripciones activas. La política de cancelación y reembolso depende de cada organizador - consulta el reglamento de la carrera."
      },
      {
        question: "¿Dónde veo mi dorsal asignado?",
        answer: "Tu número de dorsal aparece en:\n- El email de confirmación\n- Tu panel 'Mi Perfil' > 'Mis Carreras'\n- La página de detalle de la carrera una vez inscrito"
      }
    ]
  },
  {
    id: "gps",
    title: "App de Seguimiento GPS",
    icon: MapPin,
    faqs: [
      {
        question: "¿Qué es la app de seguimiento GPS?",
        answer: "Es una aplicación web que permite a tus familiares y amigos seguir tu posición en tiempo real durante la carrera. Tu ubicación se actualiza cada pocos segundos en un mapa interactivo."
      },
      {
        question: "¿Cómo activo el seguimiento GPS?",
        answer: "1. Accede a 'Tracking GPS' desde el menú (debes estar logueado).\n2. Selecciona la carrera en la que estás inscrito.\n3. Pulsa 'Iniciar Seguimiento' antes de empezar la carrera.\n4. Permite el acceso a tu ubicación cuando el navegador lo solicite.\n5. Mantén la pantalla activa o instala la app como PWA."
      },
      {
        question: "¿Consume mucha batería?",
        answer: "El seguimiento GPS consume batería, pero la app incluye:\n- Modo de bajo consumo automático cuando la batería baja del 20%\n- Almacenamiento offline si pierdes conexión\n- Recomendamos llevar el móvil cargado al 100%"
      },
      {
        question: "¿Cómo pueden seguirme mis familiares?",
        answer: "Comparte el enlace de seguimiento en vivo de la carrera. Desde ahí pueden:\n- Ver todos los corredores en el mapa\n- Buscar tu dorsal o nombre\n- Ver tu posición, ritmo y estadísticas en tiempo real"
      },
      {
        question: "¿Qué pasa si pierdo la conexión durante la carrera?",
        answer: "La app guarda los puntos GPS localmente y los sincroniza automáticamente cuando recuperas conexión. No perderás ningún dato de tu recorrido."
      },
      {
        question: "¿Puedo instalar la app en mi móvil?",
        answer: "Sí, es una Progressive Web App (PWA). Cuando accedas desde el móvil, verás la opción de 'Añadir a pantalla de inicio'. Esto te da acceso directo como una app nativa."
      }
    ]
  },
  {
    id: "resultados",
    title: "Ver Resultados",
    icon: Trophy,
    faqs: [
      {
        question: "¿Dónde veo los resultados de una carrera?",
        answer: "Los resultados se publican en la página de cada carrera, en la pestaña 'Resultados'. También puedes acceder desde 'Carreras' > seleccionar carrera > 'Ver Resultados'."
      },
      {
        question: "¿Cuándo se publican los resultados?",
        answer: "Los resultados provisionales suelen publicarse poco después de que finalice la carrera. Los resultados definitivos pueden tardar unas horas mientras el organizador verifica los tiempos."
      },
      {
        question: "¿Qué información incluyen los resultados?",
        answer: "Dependiendo de la carrera, puedes ver:\n- Tiempo final (tiempo chip y tiempo pistola)\n- Posición general\n- Posición por categoría de edad\n- Posición por género\n- Tiempos parciales en cada punto de control\n- Ritmo promedio"
      },
      {
        question: "¿Puedo ver mis resultados históricos?",
        answer: "Sí, desde tu perfil puedes ver el historial de todas las carreras en las que has participado, con tus tiempos y posiciones."
      },
      {
        question: "Creo que mi tiempo es incorrecto, ¿qué hago?",
        answer: "Contacta directamente con el organizador de la carrera a través de la página de contacto de la carrera o el email del organizador que aparece en los detalles de la carrera."
      }
    ]
  },
  {
    id: "contacto",
    title: "Contactar con el Organizador",
    icon: MessageCircle,
    faqs: [
      {
        question: "¿Cómo contacto con el organizador de una carrera?",
        answer: "En la página de detalle de cada carrera encontrarás:\n- Email del organizador\n- Enlace a su web oficial (si tiene)\n- Información de contacto adicional"
      },
      {
        question: "¿Cómo contacto con el soporte de Camberas?",
        answer: "Para problemas técnicos con la plataforma (no relacionados con una carrera específica), puedes:\n- Usar el formulario de contacto en '/contacto'\n- Escribir por WhatsApp\n- Usar el chat de soporte si está disponible"
      },
      {
        question: "¿El organizador no responde, qué hago?",
        answer: "Si tienes problemas para contactar con un organizador, escríbenos a través del formulario de contacto indicando la carrera y el problema. Intentaremos ayudarte a establecer comunicación."
      }
    ]
  }
];

const Help = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Centro de Ayuda</h1>
            <p className="text-lg text-muted-foreground">
              Encuentra respuestas a las preguntas más frecuentes sobre cómo usar Camberas
            </p>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {helpSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
              >
                <section.icon className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-center">{section.title}</span>
              </a>
            ))}
          </div>

          {/* FAQ Sections */}
          <div className="space-y-8">
            {helpSections.map((section) => (
              <Card key={section.id} id={section.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <section.icon className="h-6 w-6 text-primary" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {section.faqs.map((faq, index) => (
                      <AccordionItem key={index} value={`${section.id}-${index}`}>
                        <AccordionTrigger className="text-left">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="text-muted-foreground whitespace-pre-wrap">
                            {faq.answer}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Contact CTA */}
          <Card className="mt-12 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-2">¿No encuentras lo que buscas?</h3>
                <p className="text-muted-foreground mb-4">
                  Contacta con nosotros y te ayudaremos
                </p>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  Ir a Contacto
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Help;
