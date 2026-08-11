import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { CarruselControles, useCarruselIndice, useCarruselAltura } from "@/components/carrusel";
import { MessageCircle, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HELP_ICONS } from "@/components/admin/HelpContentManagement";

interface HelpFaq {
  id: string;
  section_id: string;
  question: string;
  answer: string;
  display_order: number;
}

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  display_order: number;
  faqs: HelpFaq[];
}

// Tablas nuevas aún no presentes en los types generados
const db = supabase as any;

const Help = () => {
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  const indice = useCarruselIndice(api);
  useCarruselAltura(api);
  // Tira de accesos rápidos: el chip activo se trae a la vista al cambiar de sección
  const chipsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    chipsRef.current[indice]?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [indice]);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: secs }, { data: faqs }] = await Promise.all([
          db.from("help_sections").select("*").order("display_order"),
          db.from("help_faqs").select("*").order("display_order"),
        ]);
        setSections(
          (secs ?? []).map((s: any) => ({
            ...s,
            faqs: (faqs ?? []).filter((f: any) => f.section_id === s.id),
          }))
        );
      } catch (err) {
        console.error("Error loading help content:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary">Soporte</p>
            <h1 className="font-archivo mt-2 text-4xl uppercase leading-[0.98] mb-4">Centro de Ayuda</h1>
            <p className="text-lg text-muted-foreground">
              Encuentra respuestas a las preguntas más frecuentes sobre cómo usar Camberas
            </p>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-12">Cargando...</p>
          ) : (
            <>
              {/* Accesos rápidos: son la navegación del carrusel de secciones */}
              <div className="-mx-4 mb-8 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max min-w-full gap-3 md:grid md:w-auto md:grid-cols-4">
                  {sections.map((section, i) => {
                    const Icon = HELP_ICONS[section.icon] ?? HelpCircle;
                    const activa = i === indice;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        ref={(el) => {
                          chipsRef.current[i] = el;
                        }}
                        onClick={() => api?.scrollTo(i)}
                        aria-current={activa}
                        className={`flex w-32 flex-shrink-0 flex-col items-center gap-2 rounded-lg border p-4 transition-colors md:w-auto ${
                          activa
                            ? "border-primary bg-primary/10"
                            : "bg-card hover:bg-accent"
                        }`}
                      >
                        <Icon className="h-8 w-8 text-primary" />
                        <span className="text-center text-sm font-medium">{section.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Carrusel de secciones: una sección de preguntas por diapositiva */}
              <Carousel setApi={setApi}>
                <CarouselContent className="items-start">
                  {sections.map((section) => {
                    const Icon = HELP_ICONS[section.icon] ?? HelpCircle;
                    return (
                      <CarouselItem key={section.id}>
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-3">
                              <Icon className="h-6 w-6 text-primary" />
                              {section.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Accordion type="single" collapsible className="w-full">
                              {section.faqs.map((faq) => (
                                <AccordionItem key={faq.id} value={faq.id}>
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
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </Carousel>

              <CarruselControles
                api={api}
                total={sections.length}
                indice={indice}
                etiquetaPunto={(i) => `Ir a ${sections[i]?.title ?? `la sección ${i + 1}`}`}
                etiquetaAnterior="Sección anterior"
                etiquetaSiguiente="Sección siguiente"
              />
            </>
          )}

          {/* Contact CTA */}
          <Card className="mt-12 bg-primary/5 border-primary/20">
            <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-8">
              <div className="flex items-center gap-4">
                <MessageCircle className="h-10 w-10 text-primary" />
                <div>
                  <h3 className="font-semibold text-lg">¿No encuentras lo que buscas?</h3>
                  <p className="text-muted-foreground">
                    Escríbenos y te ayudaremos lo antes posible
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link to="/contact">Contactar</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Help;
