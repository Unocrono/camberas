import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface OrganizerFaq {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

const Faqs = () => {
  const { user, isOrganizer, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [faqs, setFaqs] = useState<OrganizerFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesChecked, setRolesChecked] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Wait for roles to be checked before verifying access
  useEffect(() => {
    if (!authLoading && user) {
      // Give time for roles to load
      const timer = setTimeout(() => {
        setRolesChecked(true);
        if (!isOrganizer) {
          toast({
            title: "Acceso denegado",
            description: "Solo organizadores pueden ver esta sección",
            variant: "destructive",
          });
          navigate("/");
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [user, authLoading, isOrganizer, navigate, toast]);

  useEffect(() => {
    if (rolesChecked && isOrganizer) {
      loadFaqs();
    }
  }, [isOrganizer, rolesChecked]);

  const loadFaqs = async () => {
    try {
      const { data, error } = await supabase
        .from("organizer_faqs")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setFaqs(data || []);
    } catch (error: any) {
      console.error("Error loading FAQs:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las FAQs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading || !rolesChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Preguntas Frecuentes</h1>
          <p className="text-muted-foreground mb-8">
            Información útil para organizadores de carreras
          </p>

          {faqs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No hay FAQs disponibles</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
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
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Faqs;
