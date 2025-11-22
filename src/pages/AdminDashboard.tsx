import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { RaceManagement } from "@/components/admin/RaceManagement";
import { RegistrationManagement } from "@/components/admin/RegistrationManagement";
import { ResultsManagement } from "@/components/admin/ResultsManagement";
import { SplitTimesManagement } from "@/components/admin/SplitTimesManagement";
import { EdgeFunctionsManagement } from "@/components/admin/EdgeFunctionsManagement";
import { Loader2 } from "lucide-react";

type AdminView = "races" | "registrations" | "results" | "splits" | "edge-functions";

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>("races");

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
        
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger />
            <h1 className="text-2xl font-bold ml-4">Panel de Administración</h1>
          </header>

          <main className="flex-1 p-6">
            {currentView === "races" && <RaceManagement />}
            {currentView === "registrations" && <RegistrationManagement />}
            {currentView === "results" && <ResultsManagement />}
            {currentView === "splits" && <SplitTimesManagement />}
            {currentView === "edge-functions" && <EdgeFunctionsManagement />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
