import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Users, Trophy, Clock, Mountain as MountainIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import raceScene from "@/assets/race-scene.jpg";

const registrationSchema = z.object({
  phone: z.string()
    .trim()
    .min(9, "El teléfono debe tener al menos 9 dígitos")
    .max(15, "El teléfono debe tener menos de 15 dígitos")
    .regex(/^[0-9+\s-]+$/, "El teléfono solo puede contener números, +, espacios y guiones"),
  dni_passport: z.string()
    .trim()
    .min(1, "El DNI/Pasaporte es requerido")
    .max(20, "El DNI/Pasaporte debe tener menos de 20 caracteres"),
  birth_date: z.string()
    .min(1, "La fecha de nacimiento es requerida"),
  emergency_contact: z.string()
    .trim()
    .min(1, "El contacto de emergencia es requerido")
    .max(100, "El contacto de emergencia debe tener menos de 100 caracteres"),
  emergency_phone: z.string()
    .trim()
    .min(9, "El teléfono de emergencia debe tener al menos 9 dígitos")
    .max(15, "El teléfono de emergencia debe tener menos de 15 dígitos")
    .regex(/^[0-9+\s-]+$/, "El teléfono solo puede contener números, +, espacios y guiones"),
});

const RaceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [race, setRace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistance, setSelectedDistance] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    phone: "",
    dni_passport: "",
    birth_date: "",
    emergency_contact: "",
    emergency_phone: "",
  });

  useEffect(() => {
    fetchRaceDetails();
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);

  const fetchRaceDetails = async () => {
    try {
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("*")
        .eq("id", id)
        .single();

      if (raceError) throw raceError;

      const { data: distancesData, error: distancesError } = await supabase
        .from("race_distances")
        .select("*")
        .eq("race_id", id)
        .order("distance_km", { ascending: true });

      if (distancesError) throw distancesError;

      const { data: registrationsData, error: registrationsError } = await supabase
        .from("registrations")
        .select("race_distance_id")
        .eq("race_id", id);

      if (registrationsError) throw registrationsError;

      const distancesWithAvailability = distancesData.map((distance: any) => {
        const registeredCount = registrationsData.filter(
          (reg: any) => reg.race_distance_id === distance.id
        ).length;
        const availablePlaces = distance.max_participants 
          ? distance.max_participants - registeredCount 
          : null;
        
        return {
          ...distance,
          registeredCount,
          availablePlaces,
        };
      });

      setRace({
        ...raceData,
        distances: distancesWithAvailability,
      });
    } catch (error: any) {
      toast({
        title: "Error al cargar la carrera",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("phone, dni_passport, birth_date, emergency_contact, emergency_phone")
        .eq("id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          phone: data.phone || "",
          dni_passport: data.dni_passport || "",
          birth_date: data.birth_date || "",
          emergency_contact: data.emergency_contact || "",
          emergency_phone: data.emergency_phone || "",
        });
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleRegisterClick = (distance: any) => {
    if (!user) {
      toast({
        title: "Autenticación requerida",
        description: "Debes iniciar sesión para inscribirte",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setSelectedDistance(distance);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !selectedDistance) return;
    
    setIsSubmitting(true);

    try {
      // Validate form data
      const validatedData = registrationSchema.parse(formData);

      // Check if user is already registered for this race
      const { data: existingRegistration, error: checkError } = await supabase
        .from("registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("race_id", id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingRegistration) {
        toast({
          title: "Ya estás inscrito",
          description: "Ya tienes una inscripción para esta carrera",
          variant: "destructive",
        });
        setIsDialogOpen(false);
        return;
      }

      // Update profile with registration data
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          phone: validatedData.phone,
          dni_passport: validatedData.dni_passport,
          birth_date: validatedData.birth_date,
          emergency_contact: validatedData.emergency_contact,
          emergency_phone: validatedData.emergency_phone,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Create registration
      const { error: registrationError } = await supabase
        .from("registrations")
        .insert({
          user_id: user.id,
          race_id: id,
          race_distance_id: selectedDistance.id,
          status: "pending",
          payment_status: "pending",
        });

      if (registrationError) throw registrationError;

      toast({
        title: "¡Inscripción exitosa!",
        description: `Te has inscrito correctamente a la distancia ${selectedDistance.name}`,
      });

      setIsDialogOpen(false);
      fetchRaceDetails(); // Refresh data
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error al inscribirse",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || authLoading) {
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
      
      <div className="pt-20">
        {/* Hero Image */}
        <div className="relative h-[50vh] overflow-hidden">
          <img 
            src={race.image_url || raceScene} 
            alt={race.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10 pb-16">
          <Card className="shadow-elevated">
            <CardHeader>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="secondary" className="text-base py-1">
                  Trail Running
                </Badge>
                <Badge variant="outline" className="text-base py-1">
                  Múltiples Distancias
                </Badge>
              </div>
              <CardTitle className="text-4xl md:text-5xl mb-4">{race.name}</CardTitle>
              <CardDescription className="text-lg">{race.description || "Información no disponible"}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-8">
              {/* Info General */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha</p>
                    <p className="font-semibold">
                      {new Date(race.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ubicación</p>
                    <p className="font-semibold">{race.location}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Capacidad</p>
                    <p className="font-semibold">
                      {race.max_participants ? `${race.max_participants} plazas` : "Sin límite"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Distancias */}
              <div>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-primary" />
                  Elige tu Distancia
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {race.distances.map((distance: any) => (
                    <Card key={distance.id} className="border-2 hover:border-primary transition-all duration-300">
                      <CardHeader>
                        <CardTitle className="text-3xl text-primary">{distance.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MountainIcon className="h-4 w-4" />
                            <span className="text-sm">Distancia: {distance.distance_km}km</span>
                          </div>
                          {distance.elevation_gain && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MountainIcon className="h-4 w-4" />
                              <span className="text-sm">Desnivel: +{distance.elevation_gain}m</span>
                            </div>
                          )}
                          {distance.cutoff_time && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">Tiempo límite: {distance.cutoff_time}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span className="text-sm">
                              {distance.availablePlaces !== null 
                                ? `${distance.availablePlaces} plazas disponibles`
                                : "Plazas ilimitadas"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="pt-4 border-t border-border">
                          <p className="text-2xl font-bold text-foreground mb-3">{distance.price}€</p>
                          <Dialog open={isDialogOpen && selectedDistance?.id === distance.id} onOpenChange={(open) => {
                            if (!open) {
                              setIsDialogOpen(false);
                              setSelectedDistance(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button 
                                className="w-full"
                                onClick={() => handleRegisterClick(distance)}
                                disabled={distance.availablePlaces === 0}
                              >
                                {distance.availablePlaces === 0 ? "Completo" : "Inscribirme"}
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Inscripción - {distance.name}</DialogTitle>
                                <DialogDescription>
                                  Completa tus datos para inscribirte a la carrera
                                </DialogDescription>
                              </DialogHeader>
                              
                              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono *</Label>
                                    <Input
                                      id="phone"
                                      type="tel"
                                      placeholder="+34 600 000 000"
                                      value={formData.phone}
                                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                      required
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor="dni_passport">DNI/Pasaporte *</Label>
                                    <Input
                                      id="dni_passport"
                                      placeholder="12345678A"
                                      value={formData.dni_passport}
                                      onChange={(e) => setFormData({ ...formData, dni_passport: e.target.value })}
                                      required
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor="birth_date">Fecha de Nacimiento *</Label>
                                    <Input
                                      id="birth_date"
                                      type="date"
                                      value={formData.birth_date}
                                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor="emergency_contact">Contacto de Emergencia *</Label>
                                    <Input
                                      id="emergency_contact"
                                      placeholder="Nombre del contacto"
                                      value={formData.emergency_contact}
                                      onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                                      required
                                    />
                                  </div>
                                  
                                  <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="emergency_phone">Teléfono de Emergencia *</Label>
                                    <Input
                                      id="emergency_phone"
                                      type="tel"
                                      placeholder="+34 600 000 000"
                                      value={formData.emergency_phone}
                                      onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                                      required
                                    />
                                  </div>
                                </div>
                                
                                <div className="pt-4 border-t border-border">
                                  <div className="flex justify-between items-center mb-4">
                                    <span className="text-sm text-muted-foreground">Precio de inscripción:</span>
                                    <span className="text-2xl font-bold">{distance.price}€</span>
                                  </div>
                                  
                                  <Button 
                                    type="submit" 
                                    className="w-full" 
                                    disabled={isSubmitting}
                                  >
                                    {isSubmitting ? "Procesando..." : "Confirmar Inscripción"}
                                  </Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Info Adicional */}
              <Card className="bg-muted/30 border-0">
                <CardHeader>
                  <CardTitle>Información Adicional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>• Cronometraje electrónico con chip</p>
                  <p>• Avituallamientos líquidos y sólidos en carrera</p>
                  <p>• Servicio médico en carrera y meta</p>
                  <p>• Seguro de accidentes incluido</p>
                  <p>• Camiseta técnica para todos los participantes</p>
                  <p>• Trofeos para los 3 primeros de cada categoría</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RaceDetail;
