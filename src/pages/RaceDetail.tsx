import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Users, Trophy, Clock, Mountain as MountainIcon, Radio, Globe, Mail, Download, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import raceScene from "@/assets/race-scene.jpg";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";

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
    firstName: "",
    lastName: "",
    phone: "",
    dni_passport: "",
    birth_date: "",
    emergency_contact: "",
    emergency_phone: "",
  });
  
  const [customFormData, setCustomFormData] = useState<Record<string, any>>({});

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
        .select("first_name, last_name, phone, dni_passport, birth_date, emergency_contact, emergency_phone")
        .eq("id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
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

  const handleCustomFieldChange = (fieldName: string, value: any) => {
    setCustomFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !selectedDistance) return;
    
    setIsSubmitting(true);

    try {
      // Validate standard form data
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
      const { data: newRegistration, error: registrationError } = await supabase
        .from("registrations")
        .insert({
          user_id: user.id,
          race_id: id,
          race_distance_id: selectedDistance.id,
          status: "pending",
          payment_status: "pending",
        })
        .select()
        .single();

      if (registrationError) throw registrationError;

      // Fetch custom form fields for this race
      const { data: formFields, error: fieldsError } = await supabase
        .from("registration_form_fields")
        .select("id, field_name")
        .eq("race_id", id);

      if (fieldsError) throw fieldsError;

      // Store custom form field responses
      if (formFields && formFields.length > 0) {
        const responses = formFields
          .filter(field => customFormData[field.field_name] !== undefined && customFormData[field.field_name] !== "")
          .map(field => ({
            registration_id: newRegistration.id,
            field_id: field.id,
            field_value: String(customFormData[field.field_name]),
          }));

        if (responses.length > 0) {
          const { error: responsesError } = await supabase
            .from("registration_responses")
            .insert(responses);

          if (responsesError) throw responsesError;
        }
      }

      // Send confirmation email
      try {
        await supabase.functions.invoke('send-registration-confirmation', {
          body: {
            userEmail: user.email,
            userName: `${formData.firstName} ${formData.lastName}`,
            raceName: race!.name,
            raceDate: race!.date,
            raceLocation: race!.location,
            distanceName: selectedDistance!.name,
            price: selectedDistance!.price,
          },
        });
        console.log("Registration confirmation email sent");
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        // Don't fail the registration if email fails
      }

      toast({
        title: "¡Inscripción exitosa!",
        description: `Te has inscrito correctamente a la distancia ${selectedDistance.name}. Redirigiendo a tu dashboard...`,
      });

      setIsDialogOpen(false);
      
      // Redirect to dashboard after 1.5 seconds
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
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

  // Countdown timer
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!race?.date) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const raceDate = new Date(race.date).getTime();
      const distance = raceDate - now;

      if (distance > 0) {
        setCountdown({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000),
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [race?.date]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20">
        {/* Hero Cover Image */}
        <div className="relative h-[60vh] overflow-hidden">
          <img 
            src={race.cover_image_url || race.image_url || raceScene} 
            alt={race.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          
          {/* Logo overlay */}
          {race.logo_url && (
            <div className="absolute top-8 left-8 bg-background/95 backdrop-blur-sm rounded-lg p-4 shadow-lg">
              <img 
                src={race.logo_url} 
                alt={`${race.name} logo`}
                className="h-20 w-auto object-contain"
              />
            </div>
          )}
          
          {/* Countdown Timer */}
          <div className="absolute bottom-8 right-8 bg-background/95 backdrop-blur-sm rounded-lg p-6 shadow-lg">
            <p className="text-sm text-muted-foreground mb-2 text-center">Cuenta atrás</p>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{countdown.days}</div>
                <div className="text-xs text-muted-foreground">días</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{countdown.hours}</div>
                <div className="text-xs text-muted-foreground">hrs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{countdown.minutes}</div>
                <div className="text-xs text-muted-foreground">min</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{countdown.seconds}</div>
                <div className="text-xs text-muted-foreground">seg</div>
              </div>
            </div>
          </div>
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
              
              {/* Contact & Web Info */}
              <div className="mt-4 flex flex-wrap gap-4">
                {race.official_website_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={race.official_website_url} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-4 w-4 mr-2" />
                      Sitio Web Oficial
                    </a>
                  </Button>
                )}
                {race.organizer_email && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${race.organizer_email}`}>
                      <Mail className="h-4 w-4 mr-2" />
                      Contactar Organizador
                    </a>
                  </Button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate(`/race/${id}/results`)}>
                  Ver Resultados
                </Button>
                <Button variant="outline" onClick={() => navigate(`/race/${id}/live`)}>
                  Resultados en Vivo
                </Button>
                {race.gps_tracking_enabled && (
                  <Button variant="outline" onClick={() => navigate(`/race/${id}/gps`)}>
                    Mapa GPS en Vivo
                  </Button>
                )}
              </div>
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
                    <Card key={distance.id} className="border-2 hover:border-primary transition-all duration-300 overflow-hidden">
                      {/* Distance Image */}
                      {distance.image_url && (
                        <div className="relative h-48 overflow-hidden">
                          <img 
                            src={distance.image_url} 
                            alt={distance.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                        </div>
                      )}
                      
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

                        {/* GPX Download */}
                        {distance.gpx_file_url && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            asChild
                          >
                            <a href={distance.gpx_file_url} download>
                              <Download className="h-4 w-4 mr-2" />
                              Descargar GPX
                            </a>
                          </Button>
                        )}
                        
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
                              
                              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                                {/* Standard Profile Fields */}
                                <div className="space-y-4 pb-4 border-b">
                                  <h3 className="font-semibold text-lg">Datos Personales</h3>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="firstName">Nombre *</Label>
                                      <Input
                                        id="firstName"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        required
                                        disabled
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="lastName">Apellidos *</Label>
                                      <Input
                                        id="lastName"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        required
                                        disabled
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="phone">Teléfono *</Label>
                                      <Input
                                        id="phone"
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        required
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="dni_passport">DNI/Pasaporte *</Label>
                                      <Input
                                        id="dni_passport"
                                        value={formData.dni_passport}
                                        onChange={(e) => setFormData({ ...formData, dni_passport: e.target.value })}
                                        required
                                      />
                                    </div>
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

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="emergency_contact">Contacto de Emergencia *</Label>
                                      <Input
                                        id="emergency_contact"
                                        value={formData.emergency_contact}
                                        onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                                        required
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="emergency_phone">Teléfono de Emergencia *</Label>
                                      <Input
                                        id="emergency_phone"
                                        type="tel"
                                        value={formData.emergency_phone}
                                        onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                                        required
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Dynamic Custom Fields */}
                                <div className="space-y-4">
                                  <h3 className="font-semibold text-lg">Información Adicional</h3>
                                  <DynamicRegistrationForm
                                    raceId={id!}
                                    formData={customFormData}
                                    onChange={handleCustomFieldChange}
                                  />
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
