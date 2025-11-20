import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, MapPin, Trophy, CreditCard, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Registration {
  id: string;
  status: string;
  payment_status: string;
  bib_number: number | null;
  created_at: string;
  race: {
    id: string;
    name: string;
    date: string;
    location: string;
    image_url: string | null;
  };
  race_distance: {
    name: string;
    distance_km: number;
    price: number;
  };
}

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchRegistrations();
    }
  }, [user]);

  const fetchRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          id,
          status,
          payment_status,
          bib_number,
          created_at,
          race:races (
            id,
            name,
            date,
            location,
            image_url
          ),
          race_distance:race_distances (
            name,
            distance_km,
            price
          )
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRegistrations(data as any);
    } catch (error: any) {
      toast({
        title: "Error al cargar inscripciones",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canCancelRegistration = (raceDate: string): boolean => {
    const race = new Date(raceDate);
    const today = new Date();
    const daysUntilRace = Math.ceil((race.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilRace >= 7; // Can cancel if race is 7+ days away
  };

  const handleCancelRegistration = async (registrationId: string) => {
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ status: "cancelled" })
        .eq("id", registrationId);

      if (error) throw error;

      toast({
        title: "Inscripción cancelada",
        description: "Tu inscripción ha sido cancelada exitosamente",
      });

      fetchRegistrations(); // Refresh the list
    } catch (error: any) {
      toast({
        title: "Error al cancelar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      pending: { variant: "secondary", label: "Pendiente" },
      confirmed: { variant: "default", label: "Confirmada" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };

    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentBadge = (paymentStatus: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      pending: { variant: "secondary", label: "Pago Pendiente" },
      completed: { variant: "default", label: "Pagado" },
      refunded: { variant: "outline", label: "Reembolsado" },
    };

    const config = variants[paymentStatus] || { variant: "outline", label: paymentStatus };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Mi Dashboard</h1>
          <p className="text-muted-foreground">Gestiona tus inscripciones y carreras</p>
        </div>

        {registrations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Trophy className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No tienes inscripciones</h3>
              <p className="text-muted-foreground mb-6">Explora nuestras carreras y comienza tu aventura</p>
              <Button onClick={() => navigate("/races")}>
                Ver Carreras Disponibles
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {registrations.map((registration) => {
              const raceDate = new Date(registration.race.date);
              const canCancel = canCancelRegistration(registration.race.date) && 
                               registration.status !== "cancelled";
              
              return (
                <Card key={registration.id} className="overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Race Image */}
                    {registration.race.image_url && (
                      <div className="md:col-span-1 h-48 md:h-auto">
                        <img
                          src={registration.race.image_url}
                          alt={registration.race.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    {/* Race Details */}
                    <div className={registration.race.image_url ? "md:col-span-3" : "md:col-span-4"}>
                      <CardHeader>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {getStatusBadge(registration.status)}
                          {getPaymentBadge(registration.payment_status)}
                          {registration.bib_number && (
                            <Badge variant="outline">Dorsal: {registration.bib_number}</Badge>
                          )}
                        </div>
                        <CardTitle className="text-2xl">{registration.race.name}</CardTitle>
                        <CardDescription className="text-lg font-semibold text-primary">
                          {registration.race_distance.name} - {registration.race_distance.distance_km}km
                        </CardDescription>
                      </CardHeader>

                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">Fecha</p>
                              <p className="font-medium">
                                {raceDate.toLocaleDateString("es-ES", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">Ubicación</p>
                              <p className="font-medium">{registration.race.location}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">Precio</p>
                              <p className="font-medium">{registration.race_distance.price}€</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/races/${registration.race.id}`)}
                          >
                            Ver Detalles
                          </Button>

                          {canCancel && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="gap-2">
                                  <X className="h-4 w-4" />
                                  Cancelar Inscripción
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Cancelar inscripción?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción cancelará tu inscripción a <strong>{registration.race.name}</strong> 
                                    ({registration.race_distance.name}). 
                                    {registration.payment_status === "completed" && 
                                      " Si has realizado el pago, deberás contactar con organización para gestionar el reembolso."}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>No, mantener</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancelRegistration(registration.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Sí, cancelar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {!canCancel && registration.status !== "cancelled" && (
                            <p className="text-sm text-muted-foreground self-center">
                              No se puede cancelar (carrera en menos de 7 días)
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Dashboard;
