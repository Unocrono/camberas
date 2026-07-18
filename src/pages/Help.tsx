import { useState, useEffect } from "react";
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
              {/* Quick links */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                {sections.map((section) => {
                  const Icon = HELP_ICONS[section.icon] ?? HelpCircle;
                  return (
                    <a
                      key={section.id}
                      href={`#s-${section.id}`}
                      className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
                    >
                      <Icon className="h-8 w-8 text-primary" />
                      <span className="text-sm font-medium text-center">{section.title}</span>
                    </a>
                  );
                })}
              </div>

              {/* FAQ Sections */}
              <div className="space-y-8">
                {sections.map((section) => {
                  const Icon = HELP_ICONS[section.icon] ?? HelpCircle;
                  return (
                    <Card key={section.id} id={`s-${section.id}`}>
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
                  );
                })}
              </div>
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
