import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizerSidebar } from "@/components/OrganizerSidebar";
import { RaceManagement } from "@/components/admin/RaceManagement";
import { DistanceManagement } from "@/components/admin/DistanceManagement";
import { RegistrationManagement } from "@/components/admin/RegistrationManagement";
import { ResultsManagement } from "@/components/admin/ResultsManagement";
import { SplitTimesManagement } from "@/components/admin/SplitTimesManagement";
import { StorageManagement } from "@/components/admin/StorageManagement";
import RaceFaqsManagement from "@/components/admin/RaceFaqsManagement";
import { RoadbookManagement } from "@/components/admin/RoadbookManagement";
import RaceRegulationManagement from "@/components/admin/RaceRegulationManagement";
import { FormFieldsManagement } from "@/components/admin/FormFieldsManagement";
import { Loader2 } from "lucide-react";

type OrganizerView = "races" | "distances" | "registrations" | "results" | "splits" | "storage" | "race-faqs" | "roadbooks" | "regulations" | "form-fields";

const OrganizerDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentView, setCurrentView] = useState<OrganizerView>("races");
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [races, setRaces] = useState<Array<{ id: string; name: string; date: string }>>([]);
  const [distances, setDistances] = useState<Array<{ id: string; name: string; distance_km: number }>>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      checkOrganizerRole();
    }
  }, [user]);

  useEffect(() => {
    if (isOrganizer && user) {
      fetchRaces();
    }
  }, [isOrganizer, user]);

  useEffect(() => {
    if (selectedRaceId) {
      fetchDistances();
    } else {
      setDistances([]);
      setSelectedDistanceId("");
    }
  }, [selectedRaceId]);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("id, name, date")
        .eq("organizer_id", user!.id)
        .order("date", { ascending: false });

      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      console.error("Error fetching races:", error);
    }
  };

  const fetchDistances = async () => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRaceId)
        .order("distance_km", { ascending: false });

      if (error) throw error;
      setDistances(data || []);
    } catch (error: any) {
      console.error("Error fetching distances:", error);
    }
  };

  const checkOrganizerRole = async () => {
    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "organizer",
      });

      if (error) throw error;

      if (!data) {
        toast({
          title: "Acceso denegado",
          description: "No tienes permisos de organizador",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsOrganizer(data);
    } catch (error: any) {
      console.error("Error checking organizer role:", error);
      toast({
        title: "Error de autenticación",
        description: error.message,
        variant: "destructive",
      });
      navigate("/");
    } finally {
      setCheckingRole(false);
    }
  };

  if (authLoading || checkingRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!isOrganizer) {
    return null;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <OrganizerSidebar currentView={currentView} onViewChange={setCurrentView} />
        
        <div className="flex-1 flex flex-col w-full">
          <header className="h-16 border-b border-border flex items-center gap-4 px-4 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger className="mr-2" />
            <h1 className="text-xl md:text-2xl font-bold">Panel de Organizador</h1>
            
            {currentView !== "races" && races.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="race-selector" className="text-sm text-muted-foreground whitespace-nowrap hidden md:block">
                  Carrera:
                </label>
                <select
                  id="race-selector"
                  value={selectedRaceId}
                  onChange={(e) => setSelectedRaceId(e.target.value)}
                  className="h-9 px-3 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
                >
                  <option value="">Selecciona</option>
                  {races.map((race) => (
                    <option key={race.id} value={race.id}>
                      {race.name}
                    </option>
                  ))}
                </select>
                {(currentView === "roadbooks" || currentView === "form-fields") && distances.length > 0 && (
                  <>
                    <label htmlFor="distance-selector" className="text-sm text-muted-foreground whitespace-nowrap hidden md:block">
                      Distancia:
                    </label>
                    <select
                      id="distance-selector"
                      value={selectedDistanceId}
                      onChange={(e) => setSelectedDistanceId(e.target.value)}
                      className="h-9 px-3 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
                    >
                      <option value="">Selecciona</option>
                      {distances.map((distance) => (
                        <option key={distance.id} value={distance.id}>
                          {distance.name} ({distance.distance_km}km)
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </header>

          <main className="flex-1 p-4 md:p-6 w-full overflow-auto">
            {currentView === "races" && <RaceManagement isOrganizer={true} />}
            {currentView === "distances" && <DistanceManagement isOrganizer={true} selectedRaceId={selectedRaceId} />}
            {currentView === "roadbooks" && (
              selectedDistanceId ? (
                <RoadbookManagement distanceId={selectedDistanceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera y una distancia para gestionar sus rutómetros</p>
                </div>
              )
            )}
            {currentView === "regulations" && (
              selectedRaceId ? (
                <RaceRegulationManagement raceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar su reglamento</p>
                </div>
              )
            )}
            {currentView === "form-fields" && (
              selectedDistanceId ? (
                <FormFieldsManagement isOrganizer={true} distanceId={selectedDistanceId} raceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera y una distancia para gestionar sus campos de formulario</p>
                </div>
              )
            )}
            {currentView === "registrations" && <RegistrationManagement isOrganizer={true} selectedRaceId={selectedRaceId} />}
            {currentView === "results" && <ResultsManagement isOrganizer={true} selectedRaceId={selectedRaceId} />}
            {currentView === "splits" && <SplitTimesManagement isOrganizer={true} selectedRaceId={selectedRaceId} />}
            {currentView === "storage" && <StorageManagement selectedRaceId={selectedRaceId} />}
            {currentView === "race-faqs" && (
              selectedRaceId ? (
                <RaceFaqsManagement raceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar sus FAQs</p>
                </div>
              )
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default OrganizerDashboard;
