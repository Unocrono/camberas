import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RaceManagement } from "@/components/admin/RaceManagement";
import { RegistrationManagement } from "@/components/admin/RegistrationManagement";
import { ResultsManagement } from "@/components/admin/ResultsManagement";
import { SplitTimesManagement } from "@/components/admin/SplitTimesManagement";
import { FormFieldsManagement } from "@/components/admin/FormFieldsManagement";
import { supabase } from "@/integrations/supabase/client";

const OrganizerDashboard = () => {
  const { user, isOrganizer, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalRaces: 0,
    activeRaces: 0,
    totalRegistrations: 0,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    } else if (!loading && !isOrganizer) {
      navigate("/");
    }
  }, [user, isOrganizer, loading, navigate]);

  useEffect(() => {
    if (user && isOrganizer) {
      fetchOrganizerStats();
    }
  }, [user, isOrganizer]);

  const fetchOrganizerStats = async () => {
    try {
      // Fetch races organized by this user
      const { data: races } = await supabase
        .from("races")
        .select("id, date")
        .eq("organizer_id", user!.id);

      const totalRaces = races?.length || 0;
      const activeRaces =
        races?.filter((race) => new Date(race.date) >= new Date()).length || 0;

      // Fetch registrations for organizer's races
      const raceIds = races?.map((r) => r.id) || [];
      let totalRegistrations = 0;
      
      if (raceIds.length > 0) {
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .in("race_id", raceIds);
        totalRegistrations = count || 0;
      }

      setStats({
        totalRaces,
        activeRaces,
        totalRegistrations,
      });
    } catch (error) {
      console.error("Error fetching organizer stats:", error);
    }
  };

  if (loading || !user || !isOrganizer) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-24">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Panel de Organizador</h1>

          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Total de Carreras</CardTitle>
                <CardDescription>Carreras creadas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalRaces}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Carreras Activas</CardTitle>
                <CardDescription>Próximas carreras</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.activeRaces}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Inscripciones</CardTitle>
                <CardDescription>Total en tus carreras</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalRegistrations}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="races" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="races">Mis Carreras</TabsTrigger>
              <TabsTrigger value="form-fields">Formularios</TabsTrigger>
              <TabsTrigger value="registrations">Inscripciones</TabsTrigger>
              <TabsTrigger value="results">Resultados</TabsTrigger>
              <TabsTrigger value="splits">Tiempos Parciales</TabsTrigger>
            </TabsList>

            <TabsContent value="races" className="space-y-4">
              <RaceManagement isOrganizer={true} />
            </TabsContent>

            <TabsContent value="form-fields" className="space-y-4">
              <FormFieldsManagement isOrganizer={true} />
            </TabsContent>

            <TabsContent value="registrations" className="space-y-4">
              <RegistrationManagement isOrganizer={true} />
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              <ResultsManagement isOrganizer={true} />
            </TabsContent>

            <TabsContent value="splits" className="space-y-4">
              <SplitTimesManagement isOrganizer={true} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrganizerDashboard;
