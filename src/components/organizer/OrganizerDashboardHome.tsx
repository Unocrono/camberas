import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Euro, 
  Gift, 
  Clock, 
  MapPin, 
  Tag,
  Route,
  Timer
} from "lucide-react";
import { RegistrationMetrics } from "./dashboard/RegistrationMetrics";
import { RegistrationChart } from "./dashboard/RegistrationChart";
import { DistributionByDistance } from "./dashboard/DistributionByDistance";
import { GenderCategoryDistribution } from "./dashboard/GenderCategoryDistribution";
import { TshirtSummary } from "./dashboard/TshirtSummary";
import { RunnersWithoutBib } from "./dashboard/RunnersWithoutBib";
import { CommunityDistribution } from "./dashboard/CommunityDistribution";
import { EventsSummary } from "./dashboard/EventsSummary";
import { TimingPointsSummary } from "./dashboard/TimingPointsSummary";
import { WavesSummary } from "./dashboard/WavesSummary";
import { CheckpointsSummary } from "./dashboard/CheckpointsSummary";
import { ChipsSummary } from "./dashboard/ChipsSummary";

interface OrganizerDashboardHomeProps {
  selectedRaceId: string;
  raceName?: string;
}

export function OrganizerDashboardHome({ selectedRaceId, raceName }: OrganizerDashboardHomeProps) {
  if (!selectedRaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="max-w-md space-y-4">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Route className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Bienvenido al Panel de Organizador</h2>
          <p className="text-muted-foreground">
            Selecciona una carrera en el menú superior para ver el resumen de inscripciones, 
            eventos y cronometraje.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con nombre de carrera */}
      <div className="flex items-center gap-3">
        <Timer className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-semibold">{raceName || "Carrera seleccionada"}</h2>
      </div>

      {/* Sección Inscripciones */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
          <Users className="w-5 h-5 text-primary" />
          Inscripciones
        </h3>
        
        {/* Métricas principales con animación */}
        <RegistrationMetrics raceId={selectedRaceId} />
        
        {/* Gráfico de evolución */}
        <RegistrationChart raceId={selectedRaceId} />
        
        {/* Grid de distribuciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <DistributionByDistance raceId={selectedRaceId} />
          <GenderCategoryDistribution raceId={selectedRaceId} />
          <TshirtSummary raceId={selectedRaceId} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RunnersWithoutBib raceId={selectedRaceId} />
          <CommunityDistribution raceId={selectedRaceId} />
        </div>
      </section>

      {/* Sección Eventos */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
          <Route className="w-5 h-5 text-primary" />
          Eventos
        </h3>
        <EventsSummary raceId={selectedRaceId} />
      </section>

      {/* Sección Cronometraje */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
          <Clock className="w-5 h-5 text-primary" />
          Cronometraje
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <TimingPointsSummary raceId={selectedRaceId} />
          <WavesSummary raceId={selectedRaceId} />
          <CheckpointsSummary raceId={selectedRaceId} />
          <ChipsSummary raceId={selectedRaceId} />
        </div>
      </section>
    </div>
  );
}
