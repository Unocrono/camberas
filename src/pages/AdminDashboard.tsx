import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRaceSelection } from "@/hooks/useRaceSelection";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { AdminSidebar } from "@/components/AdminSidebar";
import { RaceSelectorHeader } from "@/components/admin/RaceSelectorHeader";
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
import { UsersManagement } from "@/components/admin/UsersManagement";
import { RoadbookItemTypesManagement } from "@/components/admin/RoadbookItemTypesManagement";
import ContactSettingsManagement from "@/components/admin/ContactSettingsManagement";
import { TimerAssignmentsManagement } from "@/components/admin/TimerAssignmentsManagement";
import { TimingReadingsManagement } from "@/components/admin/TimingReadingsManagement";
import { TimingPointsManagement } from "@/components/admin/TimingPointsManagement";
import { RaceResultsStatusManagement } from "@/components/admin/RaceResultsStatusManagement";
import { WavesManagement } from "@/components/admin/WavesManagement";
import { GPSTrackingViewer } from "@/components/admin/GPSTrackingViewer";
import { TshirtSizesSummary } from "@/components/admin/TshirtSizesSummary";
import { BibChipsManagement } from "@/components/admin/BibChipsManagement";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { MenuManagement } from "@/components/admin/MenuManagement";
import { MotosManagement } from "@/components/admin/MotosManagement";
import { MotoAssignmentsManagement } from "@/components/admin/MotoAssignmentsManagement";
import { MotoMapViewer } from "@/components/admin/MotoMapViewer";
import GPSPositionsDeletion from "@/components/admin/GPSPositionsDeletion";
import { GPSDevicesManagement } from "@/components/admin/GPSDevicesManagement";
import { CategoriesManagement } from "@/components/admin/CategoriesManagement";
import { CategoryTemplatesManagement } from "@/components/admin/CategoryTemplatesManagement";
import BlogPostsManagement from "@/components/admin/BlogPostsManagement";
import NewsletterSubscribersManagement from "@/components/admin/NewsletterSubscribersManagement";
import NewsletterCampaignsManagement from "@/components/admin/NewsletterCampaignsManagement";
import { Loader2, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminView = string;

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { view: urlView } = useParams<{ view?: string }>();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>(urlView || "races");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Sync URL param with currentView
  useEffect(() => {
    if (urlView && urlView !== currentView) {
      setCurrentView(urlView);
    }
  }, [urlView]);

  const {
    selectedRaceId,
    setSelectedRaceId,
    selectedDistanceId,
    setSelectedDistanceId,
    races,
    distances,
    selectedRace,
    loadingRaces,
    clearSelection,
  } = useRaceSelection({ type: "admin" });

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

  // Views that don't need race selector at all
  const viewsWithoutRaceSelector = ["races", "edge-functions", "organizer-faqs", "organizer-approval", "users", "roadbook-item-types", "contact-settings", "results-status", "menu-management", "gps-deletion", "gps-devices", "blog-posts", "newsletter-subscribers", "newsletter-campaigns"];
  const showRaceSelector = !viewsWithoutRaceSelector.includes(currentView);
  
  // Views that need distance filter
  const needsDistanceFilter = ["roadbooks", "form-fields", "checkpoints", "splits"].includes(currentView);
  const showSecondaryFilters = needsDistanceFilter && distances.length > 0;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
        
        <div className="flex-1 flex flex-col">
          <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 h-14">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-xl md:text-2xl font-bold truncate">Panel de Administración</h1>
              </div>
              <AdminNotificationsPanel />
            </div>
            {showRaceSelector && (
              <div className="px-4 md:px-6 pb-3">
                <RaceSelectorHeader
                  races={races}
                  selectedRaceId={selectedRaceId}
                  selectedRace={selectedRace}
                  onSelectRace={setSelectedRaceId}
                  onClearSelection={clearSelection}
                  loading={loadingRaces}
                />
              </div>
            )}
            
            {showSecondaryFilters && (
              <div className="px-4 md:px-6 pb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden mb-2 w-full justify-between"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filtros
                  </span>
                  {filtersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <div className={`flex flex-wrap items-center gap-2 ${filtersExpanded ? 'flex' : 'hidden md:flex'}`}>
                  <Label htmlFor="distance-selector" className="text-sm text-muted-foreground whitespace-nowrap">
                    Evento:
                  </Label>
                  <select
                    id="distance-selector"
                    value={selectedDistanceId}
                    onChange={(e) => setSelectedDistanceId(e.target.value)}
                    className="h-9 px-3 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1 min-w-[150px] max-w-[300px]"
                  >
                    <option value="">Todos los eventos</option>
                    {distances.map((distance) => (
                      <option key={distance.id} value={distance.id}>
                        {distance.name} ({distance.distance_km}km)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 p-6">
            {currentView === "races" && <RaceManagement />}
            {currentView === "distances" && <DistanceManagement isOrganizer={false} selectedRaceId={selectedRaceId} />}
            {currentView === "timing-points" && (
              selectedRaceId ? (
                <TimingPointsManagement selectedRaceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar sus puntos de cronometraje</p>
                </div>
              )
            )}
            {currentView === "checkpoints" && (
              <CheckpointsManagement selectedRaceId={selectedRaceId} selectedDistanceId={selectedDistanceId} />
            )}
            {currentView === "roadbooks" && (
              selectedDistanceId ? (
                <RoadbookManagement distanceId={selectedDistanceId} raceType={races.find(r => r.id === selectedRaceId)?.race_type} />
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
            {currentView === "waves" && <WavesManagement selectedRaceId={selectedRaceId} />}
            {currentView === "results" && <ResultsManagement selectedRaceId={selectedRaceId} />}
            {currentView === "results-status" && <RaceResultsStatusManagement />}
            {currentView === "splits" && <SplitTimesManagement selectedRaceId={selectedRaceId} selectedDistanceId={selectedDistanceId} />}
            {currentView === "timing-readings" && <TimingReadingsManagement selectedRaceId={selectedRaceId} />}
            {currentView === "gps-readings" && <GPSTrackingViewer selectedRaceId={selectedRaceId} />}
            {currentView === "tshirt-sizes" && <TshirtSizesSummary selectedRaceId={selectedRaceId} />}
            {currentView === "timer-assignments" && <TimerAssignmentsManagement selectedRaceId={selectedRaceId} />}
            {currentView === "bib-chips" && (
              selectedRaceId ? (
                <BibChipsManagement selectedRaceId={selectedRaceId} selectedDistanceId={selectedDistanceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar los chips RFID</p>
                </div>
              )
            )}
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
            {currentView === "users" && <UsersManagement />}
            {currentView === "roadbook-item-types" && <RoadbookItemTypesManagement />}
            {currentView === "contact-settings" && <ContactSettingsManagement />}
            {currentView === "menu-management" && <MenuManagement />}
            {currentView === "motos" && (
              selectedRaceId ? (
                <MotosManagement selectedRaceId={selectedRaceId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Selecciona una carrera para gestionar sus motos GPS</p>
                </div>
              )
            )}
            {currentView === "moto-assignments" && <MotoAssignmentsManagement selectedRaceId={selectedRaceId} />}
            {currentView === "moto-map" && <MotoMapViewer selectedRaceId={selectedRaceId} />}
            {currentView === "gps-deletion" && <GPSPositionsDeletion />}
            {currentView === "gps-devices" && <GPSDevicesManagement />}
            {currentView === "categories" && <CategoriesManagement selectedRaceId={selectedRaceId} />}
            {currentView === "category-templates" && <CategoryTemplatesManagement />}
            {currentView === "blog-posts" && <BlogPostsManagement />}
            {currentView === "newsletter-subscribers" && <NewsletterSubscribersManagement />}
            {currentView === "newsletter-campaigns" && <NewsletterCampaignsManagement />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
