import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { AdminSidebar } from "@/components/AdminSidebar";
import { RaceManagement } from "@/components/admin/RaceManagement";
import { DistanceManagement } from "@/components/admin/DistanceManagement";
import { RegistrationManagement } from "@/components/admin/RegistrationManagement";
import { ResultsManagement } from "@/components/admin/ResultsManagement";
import { SplitTimesManagement } from "@/components/admin/SplitTimesManagement";
import { EdgeFunctionsManagement } from "@/components/admin/EdgeFunctionsManagement";
import OrganizerFaqsManagement from "@/components/admin/OrganizerFaqsManagement";
import RaceFaqsManagement from "@/components/admin/RaceFaqsManagement";
import { StorageManagement } from "@/components/admin/StorageManagement";
import OrganizerApprovalManagement from "@/components/admin/OrganizerApprovalManagement";
import { RoadbookManagement } from "@/components/admin/RoadbookManagement";
import RaceRegulationManagement from "@/components/admin/RaceRegulationManagement";
import { FormFieldsManagement } from "@/components/admin/FormFieldsManagement";
import { CheckpointsManagement } from "@/components/admin/CheckpointsManagement";
import { Loader2 } from "lucide-react";

type AdminView = "races" | "distances" | "checkpoints" | "registrations" | "results" | "splits" | "edge-functions" | "organizer-faqs" | "storage" | "race-faqs" | "organizer-approval" | "roadbooks" | "regulations" | "form-fields";

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>("races");
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
      checkAdminRole();
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchRaces();
    }
  }, [isAdmin]);

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

  const checkAdminRole = async () => {
    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });

      if (error) throw error;

      if (!data) {
        toast({
          title: "Acceso denegado",
          description: "No tienes permisos de administrador",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(data);
    } catch (error: any) {
      console.error("Error checking admin role:", error);
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

  if (!isAdmin) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
        
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border flex items-center gap-4 px-6 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger />
            <h1 className="text-2xl font-bold">Panel de Administración</h1>
            
            {currentView !== "races" && currentView !== "edge-functions" && currentView !== "organizer-faqs" && currentView !== "organizer-approval" && races.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="race-selector" className="text-sm text-muted-foreground whitespace-nowrap">
                  Filtrar por carrera:
                </Label>
                <select
                  id="race-selector"
                  value={selectedRaceId}
                  onChange={(e) => setSelectedRaceId(e.target.value)}
                  className="h-9 px-3 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
                >
                  <option value="">Todas las carreras</option>
                  {races.map((race) => (
                    <option key={race.id} value={race.id}>
                      {race.name} - {new Date(race.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                {(currentView === "roadbooks" || currentView === "form-fields" || currentView === "checkpoints") && distances.length > 0 && (
                  <>
                    <Label htmlFor="distance-selector" className="text-sm text-muted-foreground whitespace-nowrap">
                      Distancia:
                    </Label>
                    <select
                      id="distance-selector"
                      value={selectedDistanceId}
                      onChange={(e) => setSelectedDistanceId(e.target.value)}
                      className="h-9 px-3 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
                    >
                      <option value="">Selecciona una distancia</option>
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

          <main className="flex-1 p-6">
            {currentView === "races" && <RaceManagement />}
            {currentView === "distances" && <DistanceManagement isOrganizer={false} selectedRaceId={selectedRaceId} />}
            {currentView === "checkpoints" && (
              <CheckpointsManagement selectedRaceId={selectedRaceId} selectedDistanceId={selectedDistanceId} />
            )}
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
                <FormFieldsManagement distanceId={selectedDistanceId} raceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera y una distancia para gestionar sus campos de formulario</p>
                </div>
              )
            )}
            {currentView === "registrations" && <RegistrationManagement selectedRaceId={selectedRaceId} />}
            {currentView === "results" && <ResultsManagement selectedRaceId={selectedRaceId} />}
            {currentView === "splits" && <SplitTimesManagement selectedRaceId={selectedRaceId} />}
            {currentView === "storage" && <StorageManagement selectedRaceId={selectedRaceId} />}
            {currentView === "organizer-faqs" && <OrganizerFaqsManagement isAdmin={true} />}
            {currentView === "organizer-approval" && <OrganizerApprovalManagement />}
            {currentView === "race-faqs" && (
              selectedRaceId ? (
                <RaceFaqsManagement raceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar sus FAQs</p>
                </div>
              )
            )}
            {currentView === "edge-functions" && <EdgeFunctionsManagement />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
