import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizerSidebar } from "@/components/OrganizerSidebar";
import { RaceManagement } from "@/components/admin/RaceManagement";
import { RegistrationManagement } from "@/components/admin/RegistrationManagement";
import { ResultsManagement } from "@/components/admin/ResultsManagement";
import { SplitTimesManagement } from "@/components/admin/SplitTimesManagement";
import { Loader2 } from "lucide-react";

type OrganizerView = "races" | "registrations" | "results" | "splits";

const OrganizerDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentView, setCurrentView] = useState<OrganizerView>("races");

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
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <OrganizerSidebar currentView={currentView} onViewChange={setCurrentView} />
        
        <div className="flex-1 flex flex-col w-full">
          <header className="h-16 border-b border-border flex items-center px-4 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger className="mr-2" />
            <h1 className="text-xl md:text-2xl font-bold">Panel de Organizador</h1>
          </header>

          <main className="flex-1 p-4 md:p-6 w-full overflow-auto">
            {currentView === "races" && <RaceManagement isOrganizer={true} />}
            {currentView === "registrations" && <RegistrationManagement isOrganizer={true} />}
            {currentView === "results" && <ResultsManagement isOrganizer={true} />}
            {currentView === "splits" && <SplitTimesManagement isOrganizer={true} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default OrganizerDashboard;
