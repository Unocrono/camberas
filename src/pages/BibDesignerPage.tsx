import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BibDesigner } from "@/components/bib-designer/BibDesigner";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Race {
  id: string;
  name: string;
}

interface BibDesign {
  id: string;
  name: string;
  created_at: string;
}

const BibDesignerPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>(searchParams.get("raceId") || "");
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [designs, setDesigns] = useState<BibDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(searchParams.get("designId") || null);
  const [isEditing, setIsEditing] = useState(!!searchParams.get("designId"));
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDesignId, setDeleteDesignId] = useState<string | null>(null);

  // Check role and fetch races
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/auth");
      return;
    }

    const checkRoleAndFetchRaces = async () => {
      // Check if user is organizer or admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, status")
        .eq("user_id", user.id);

      const isOrganizer = roles?.some(r => r.role === "organizer" && r.status === "approved");
      const isAdmin = roles?.some(r => r.role === "admin");

      if (!isOrganizer && !isAdmin) {
        toast.error("No tienes permisos para acceder a esta página");
        navigate("/");
        return;
      }

      // Fetch races for organizer
      let query = supabase.from("races").select("id, name").order("date", { ascending: false });
      
      if (isOrganizer && !isAdmin) {
        query = query.eq("organizer_id", user.id);
      }

      const { data: racesData, error } = await query;
      
      if (error) {
        console.error("Error fetching races:", error);
        toast.error("Error al cargar las carreras");
      } else {
        setRaces(racesData || []);
        
        // If race is preselected
        if (selectedRaceId && racesData) {
          const race = racesData.find(r => r.id === selectedRaceId);
          if (race) setSelectedRace(race);
        }
      }
      
      setIsLoading(false);
    };

    checkRoleAndFetchRaces();
  }, [user, authLoading, navigate, selectedRaceId]);

  // Fetch designs when race is selected
  useEffect(() => {
    if (!selectedRaceId) {
      setDesigns([]);
      return;
    }

    const fetchDesigns = async () => {
      const { data, error } = await supabase
        .from("bib_designs")
        .select("id, name, created_at")
        .eq("race_id", selectedRaceId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching designs:", error);
      } else {
        setDesigns(data || []);
      }
    };

    fetchDesigns();
  }, [selectedRaceId]);

  const handleRaceChange = (raceId: string) => {
    setSelectedRaceId(raceId);
    const race = races.find(r => r.id === raceId);
    setSelectedRace(race || null);
    setSelectedDesignId(null);
    setIsEditing(false);
    setSearchParams({ raceId });
  };

  const handleNewDesign = () => {
    setSelectedDesignId(null);
    setIsEditing(true);
    setSearchParams({ raceId: selectedRaceId });
  };

  const handleEditDesign = (designId: string) => {
    setSelectedDesignId(designId);
    setIsEditing(true);
    setSearchParams({ raceId: selectedRaceId, designId });
  };

  const handleDeleteDesign = async () => {
    if (!deleteDesignId) return;

    const { error } = await supabase
      .from("bib_designs")
      .delete()
      .eq("id", deleteDesignId);

    if (error) {
      toast.error("Error al eliminar el diseño");
    } else {
      toast.success("Diseño eliminado");
      setDesigns(designs.filter(d => d.id !== deleteDesignId));
      if (selectedDesignId === deleteDesignId) {
        setSelectedDesignId(null);
        setIsEditing(false);
      }
    }
    setDeleteDesignId(null);
  };

  const handleSave = (newDesignId: string) => {
    setSelectedDesignId(newDesignId);
    setSearchParams({ raceId: selectedRaceId, designId: newDesignId });
    
    // Refresh designs list
    supabase
      .from("bib_designs")
      .select("id, name, created_at")
      .eq("race_id", selectedRaceId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setDesigns(data);
      });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/organizer")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Diseñador de Dorsales</h1>
            <p className="text-muted-foreground">
              Crea diseños personalizados para los dorsales de tu carrera
            </p>
          </div>
        </div>

        {/* Race Selector */}
        {!isEditing && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Selecciona una carrera</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedRaceId} onValueChange={handleRaceChange}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue placeholder="Selecciona una carrera" />
                </SelectTrigger>
                <SelectContent>
                  {races.map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Designs List or Editor */}
        {selectedRaceId && !isEditing && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Diseños de {selectedRace?.name}</CardTitle>
              <Button onClick={handleNewDesign}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo diseño
              </Button>
            </CardHeader>
            <CardContent>
              {designs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay diseños creados. Haz clic en "Nuevo diseño" para crear uno.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {designs.map((design) => (
                    <Card key={design.id} className="hover:border-primary transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">{design.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {new Date(design.created_at).toLocaleDateString("es-ES")}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditDesign(design.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteDesignId(design.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Editor */}
        {isEditing && selectedRace && (
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setSelectedDesignId(null);
                setSearchParams({ raceId: selectedRaceId });
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a la lista
            </Button>
            
            <BibDesigner
              raceId={selectedRaceId}
              raceName={selectedRace.name}
              designId={selectedDesignId || undefined}
              onSave={handleSave}
            />
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteDesignId} onOpenChange={() => setDeleteDesignId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar diseño?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El diseño será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDesign} className="bg-destructive text-destructive-foreground">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default BibDesignerPage;
