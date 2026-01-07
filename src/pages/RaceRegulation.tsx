import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Calendar, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RegulationSection {
  id: string;
  title: string;
  content: string;
  section_order: number;
  section_type: string;
}

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
}

const isValidUUID = (str: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

const RaceRegulation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [race, setRace] = useState<Race | null>(null);
  const [sections, setSections] = useState<RegulationSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [raceId, setRaceId] = useState<string | null>(null);

  // Resolve race ID from slug or UUID
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!id) return;
      
      if (isValidUUID(id)) {
        setRaceId(id);
      } else {
        // Try to find race by slug
        const { data, error } = await supabase
          .from("races")
          .select("id")
          .eq("slug", id)
          .maybeSingle();
        
        if (error || !data) {
          toast({
            title: "Error",
            description: "Carrera no encontrada",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        setRaceId(data.id);
      }
    };
    
    resolveRaceId();
  }, [id]);

  useEffect(() => {
    if (raceId) {
      fetchRegulation();
    }
  }, [raceId]);

  const fetchRegulation = async () => {
    if (!raceId) return;
    
    try {
      // Fetch race info
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("id, name, date, location")
        .eq("id", raceId)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      // Fetch published regulation
      const { data: regulationData, error: regulationError } = await supabase
        .from("race_regulations")
        .select("id")
        .eq("race_id", raceId)
        .eq("published", true)
        .maybeSingle();

      if (regulationError) throw regulationError;

      if (regulationData) {
        // Fetch sections
        const { data: sectionsData, error: sectionsError } = await supabase
          .from("race_regulation_sections")
          .select("*")
          .eq("regulation_id", regulationData.id)
          .order("section_order");

        if (sectionsError) throw sectionsError;
        setSections(sectionsData || []);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const replaceVariables = (content: string) => {
    if (!race) return content;
    return content
      .replace(/\{\{race_name\}\}/g, race.name)
      .replace(/\{\{race_date\}\}/g, new Date(race.date).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }))
      .replace(/\{\{race_location\}\}/g, race.location);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Cargando reglamento...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Carrera no encontrada</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-24">
        <Button
          variant="ghost"
          onClick={() => navigate(`/race/${id}`)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a la carrera
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl">Reglamento</CardTitle>
                <p className="text-lg text-muted-foreground">{race.name}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {new Date(race.date).toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {race.location}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {sections.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>El reglamento aún no ha sido publicado.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {sections.map((section) => (
                  <div key={section.id} className="border-b border-border pb-6 last:border-0">
                    <h2 className="text-xl font-semibold mb-4">{section.title}</h2>
                    <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
                      {replaceVariables(section.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default RaceRegulation;
