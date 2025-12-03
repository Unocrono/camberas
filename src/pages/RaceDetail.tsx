import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Users, Trophy, Clock, Mountain as MountainIcon, Radio, Globe, Mail, Download, Image as ImageIcon, TrendingUp, Navigation, Map } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import raceScene from "@/assets/race-scene.jpg";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";
import { RoutePreviewMap } from "@/components/RoutePreviewMap";

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
  
  const [isGuestRegistration, setIsGuestRegistration] = useState(false);
  const [customFormData, setCustomFormData] = useState<Record<string, any>>({});
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [faqs, setFaqs] = useState<any[]>([]);
  const [roadbooks, setRoadbooks] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fetchRaceDetails();
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);

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

  const fetchRaceDetails = async () => {
    try {
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (raceError) throw raceError;
      
      if (!raceData) {
        toast({
          title: "Carrera no encontrada",
          description: "La carrera que buscas no existe",
          variant: "destructive",
        });
        navigate("/races");
        return;
      }

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

      // Fetch waves for start times
      const { data: wavesData, error: wavesError } = await supabase
        .from("race_waves")
        .select("race_distance_id, start_time, wave_name")
        .eq("race_id", id);

      if (wavesError) throw wavesError;

      const distancesWithAvailability = distancesData.map((distance: any) => {
        const registeredCount = registrationsData.filter(
          (reg: any) => reg.race_distance_id === distance.id
        ).length;
        const availablePlaces = distance.max_participants 
          ? distance.max_participants - registeredCount 
          : null;
        
        // Find the wave for this distance
        const wave = wavesData?.find((w: any) => w.race_distance_id === distance.id);
        
        return {
          ...distance,
          registeredCount,
          availablePlaces,
          start_time: wave?.start_time || null,
          wave_name: wave?.wave_name || null,
        };
      });

      // Load FAQs
      const { data: faqsData, error: faqsError } = await supabase
        .from("race_faqs")
        .select("*")
        .eq("race_id", id)
        .order("display_order");

      if (!faqsError && faqsData) {
        setFaqs(faqsData);
      }

      // Load Roadbooks for all distances
      const { data: roadbooksData, error: roadbooksError } = await supabase
        .from("roadbooks")
        .select("*")
        .in("race_distance_id", distancesData.map((d: any) => d.id))
        .order("created_at", { ascending: false });

      if (!roadbooksError && roadbooksData) {
        // Group roadbooks by distance_id
        const roadbooksByDistance: Record<string, any[]> = {};
        roadbooksData.forEach((roadbook: any) => {
          if (!roadbooksByDistance[roadbook.race_distance_id]) {
            roadbooksByDistance[roadbook.race_distance_id] = [];
          }
          roadbooksByDistance[roadbook.race_distance_id].push(roadbook);
        });
        setRoadbooks(roadbooksByDistance);
      }

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
        .select("first_name, last_name, phone, dni_passport, birth_date, gender, address, city, province, autonomous_community, club, team")
        .eq("id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        // Pre-fill customFormData with profile data for system fields
        setCustomFormData(prev => ({
          ...prev,
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          phone: data.phone || "",
          document_number: data.dni_passport || "",
          birth_date: data.birth_date || "",
          gender: data.gender || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          autonomous_community: data.autonomous_community || "",
          club: data.club || "",
          team: data.team || "",
          email: user!.email || "",
        }));
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleRegisterClick = (distance: any) => {
    setSelectedDistance(distance);
    setIsGuestRegistration(!user);
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
    
    if (!selectedDistance) return;
    
    setIsSubmitting(true);

    try {
      // Extract system field data from customFormData
      const firstName = customFormData.first_name || "";
      const lastName = customFormData.last_name || "";
      const email = customFormData.email || "";
      const phone = customFormData.phone || "";
      const documentNumber = customFormData.document_number || "";
      const birthDate = customFormData.birth_date || "";
      const emergencyContact = customFormData.emergency_contact || "";
      const emergencyPhone = customFormData.emergency_phone || "";

      if (isGuestRegistration) {
        // Validate required fields for guest
        if (!email || !firstName || !lastName) {
          toast({
            title: "Campos requeridos",
            description: "Por favor completa todos los campos obligatorios",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Check if guest email is already registered for this race
        const { data: existingRegistration, error: checkError } = await supabase
          .from("registrations")
          .select("id")
          .eq("guest_email", email)
          .eq("race_id", id)
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingRegistration) {
          toast({
            title: "Email ya inscrito",
            description: "Este email ya tiene una inscripción para esta carrera",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Get next bib number from distance
        let assignedBib: number | null = null;
        if (selectedDistance.next_bib && selectedDistance.bib_end) {
          if (selectedDistance.next_bib <= selectedDistance.bib_end) {
            assignedBib = selectedDistance.next_bib;
          }
        }

        // Create guest registration
        const { data: newRegistration, error: registrationError } = await supabase
          .from("registrations")
          .insert({
            race_id: id,
            race_distance_id: selectedDistance.id,
            status: "pending",
            payment_status: "pending",
            guest_email: email,
            guest_first_name: firstName,
            guest_last_name: lastName,
            guest_phone: phone,
            guest_dni_passport: documentNumber,
            guest_birth_date: birthDate || null,
            guest_emergency_contact: emergencyContact,
            guest_emergency_phone: emergencyPhone,
            bib_number: assignedBib,
          })
          .select()
          .single();

        if (registrationError) throw registrationError;

        // Update next_bib in the distance if a bib was assigned
        if (assignedBib) {
          await supabase
            .from("race_distances")
            .update({ next_bib: assignedBib + 1 })
            .eq("id", selectedDistance.id);
        }

        // Store all form field responses
        await saveCustomFormResponses(newRegistration.id, selectedDistance.id);

        // Send confirmation email
        try {
          await supabase.functions.invoke('send-registration-confirmation', {
            body: {
              userEmail: email,
              userName: `${firstName} ${lastName}`,
              raceName: race!.name,
              raceDate: race!.date,
              raceLocation: race!.location,
              distanceName: selectedDistance!.name,
              price: selectedDistance!.price,
              isGuest: true,
            },
          });
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }

        toast({
          title: "¡Inscripción exitosa!",
          description: `Te has inscrito correctamente como invitado. Revisa tu email (${email}) para más información.`,
        });

        setIsDialogOpen(false);
        setCustomFormData({});
        fetchRaceDetails(); // Refresh to update available spots
        
      } else {
        // Authenticated user registration
        if (!user) return;

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
          setIsSubmitting(false);
          return;
        }

        // Update profile with registration data
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            phone: phone || undefined,
            dni_passport: documentNumber || undefined,
            birth_date: birthDate || undefined,
            emergency_contact: emergencyContact || undefined,
            emergency_phone: emergencyPhone || undefined,
          })
          .eq("id", user.id);

        if (profileError) throw profileError;

        // Get next bib number from distance
        let assignedBib: number | null = null;
        if (selectedDistance.next_bib && selectedDistance.bib_end) {
          if (selectedDistance.next_bib <= selectedDistance.bib_end) {
            assignedBib = selectedDistance.next_bib;
          }
        }

        // Create registration
        const { data: newRegistration, error: registrationError } = await supabase
          .from("registrations")
          .insert({
            user_id: user.id,
            race_id: id,
            race_distance_id: selectedDistance.id,
            status: "pending",
            payment_status: "pending",
            bib_number: assignedBib,
          })
          .select()
          .single();

        if (registrationError) throw registrationError;

        // Update next_bib in the distance if a bib was assigned
        if (assignedBib) {
          await supabase
            .from("race_distances")
            .update({ next_bib: assignedBib + 1 })
            .eq("id", selectedDistance.id);
        }

        // Store all form field responses
        await saveCustomFormResponses(newRegistration.id, selectedDistance.id);

        // Send confirmation email
        try {
          await supabase.functions.invoke('send-registration-confirmation', {
            body: {
              userEmail: user.email,
              userName: `${firstName} ${lastName}`,
              raceName: race!.name,
              raceDate: race!.date,
              raceLocation: race!.location,
              distanceName: selectedDistance!.name,
              price: selectedDistance!.price,
            },
          });
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }

        toast({
          title: "¡Inscripción exitosa!",
          description: `Te has inscrito correctamente a la distancia ${selectedDistance.name}. Redirigiendo a tu dashboard...`,
        });

        setIsDialogOpen(false);
        setCustomFormData({});
        
        // Redirect to dashboard after 1.5 seconds
        setTimeout(() => {
          navigate("/dashboard");
        }, 1500);
      }
    } catch (error: any) {
      toast({
        title: "Error al inscribirse",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveCustomFormResponses = async (registrationId: string, distanceId: string) => {
    // Fetch form fields for this distance
    const { data: fields, error: fieldsError } = await supabase
      .from("registration_form_fields")
      .select("id, field_name")
      .eq("race_distance_id", distanceId);

    if (fieldsError) throw fieldsError;

    // Store all form field responses
    if (fields && fields.length > 0) {
      const responses = fields
        .filter(field => customFormData[field.field_name] !== undefined && customFormData[field.field_name] !== "")
        .map(field => ({
          registration_id: registrationId,
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
                <Button variant="outline" onClick={() => navigate(`/race/${id}/regulation`)}>
                  Reglamento
                </Button>
                {race.distances?.some((d: any) => d.gps_tracking_enabled) && (
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {race.distances.map((distance: any) => (
                    <Card key={distance.id} className="border-2 hover:border-primary hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
                      {/* Distance Image */}
                      {distance.image_url && (
                        <div className="relative h-48 overflow-hidden">
                          <img 
                            src={distance.image_url} 
                            alt={distance.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                          <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground font-bold text-base px-3 py-1">
                            {distance.price}€
                          </Badge>
                        </div>
                      )}
                      
                      <CardHeader className="pb-3">
                        <CardTitle className="text-2xl text-primary">{distance.name}</CardTitle>
                        {!distance.image_url && (
                          <div className="text-3xl font-bold text-primary mt-2">{distance.price}€</div>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col">
                        {/* Main Stats */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-foreground font-medium">
                            <MountainIcon className="h-5 w-5 text-primary" />
                            <span>{distance.distance_km} km</span>
                          </div>
                          {distance.elevation_gain && (
                            <div className="flex items-center gap-2 text-foreground font-medium">
                              <TrendingUp className="h-5 w-5 text-primary" />
                              <span>+{distance.elevation_gain}m desnivel</span>
                            </div>
                          )}
                          {distance.start_time && (
                            <div className="flex items-center gap-2 text-foreground font-medium">
                              <Clock className="h-5 w-5 text-primary" />
                              <span>
                                Salida: {new Date(distance.start_time).toLocaleTimeString("es-ES", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}h
                              </span>
                            </div>
                          )}
                          {distance.cutoff_time && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">Límite: {distance.cutoff_time}</span>
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

                        {/* Start/Finish Locations */}
                        {(distance.start_location || distance.finish_location) && (
                          <div className="space-y-1.5 pt-2 border-t">
                            {distance.start_location && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Navigation className="h-4 w-4 text-green-600" />
                                <span className="text-xs">Salida: {distance.start_location}</span>
                              </div>
                            )}
                            {distance.finish_location && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Navigation className="h-4 w-4 text-red-600 rotate-180" />
                                <span className="text-xs">Meta: {distance.finish_location}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* GPX View, Roadbook & Download */}
                        {(distance.gpx_file_url || (roadbooks[distance.id] && roadbooks[distance.id].length > 0)) && (
                          <div className="space-y-2">
                            {distance.gpx_file_url && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full"
                                  >
                                    <Map className="h-4 w-4 mr-2" />
                                    Ver Recorrido
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[90vh]">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <Map className="h-5 w-5 text-primary" />
                                      Recorrido - {distance.name}
                                    </DialogTitle>
                                    <DialogDescription>
                                      {distance.distance_km} km {distance.elevation_gain && `• +${distance.elevation_gain}m desnivel`}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <RoutePreviewMap 
                                    gpxUrl={distance.gpx_file_url} 
                                    distanceName={distance.name}
                                  />
                                </DialogContent>
                              </Dialog>
                            )}
                            
                            {/* Roadbook Button */}
                            {roadbooks[distance.id] && roadbooks[distance.id].length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                asChild
                              >
                                <a href={`/roadbook/${roadbooks[distance.id][0].id}`} target="_blank" rel="noopener noreferrer">
                                  <Map className="h-4 w-4 mr-2" />
                                  Rutómetro
                                </a>
                              </Button>
                            )}
                            
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
                          </div>
                        )}
                        
                        <div className="pt-3 mt-auto">
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
                                  {isGuestRegistration 
                                    ? "Completa tus datos para inscribirte como invitado. Si ya tienes cuenta, puedes iniciar sesión para vincular tu inscripción."
                                    : "Completa tus datos para inscribirte a la carrera"
                                  }
                                </DialogDescription>
                              </DialogHeader>
                              
                              {isGuestRegistration && (
                                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                                  <p className="text-sm text-muted-foreground">
                                    ¿Ya tienes cuenta?{" "}
                                    <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/auth")}>
                                      Inicia sesión
                                    </Button>
                                    {" "}para vincular tu inscripción a tu perfil.
                                  </p>
                                </div>
                              )}
                              
                              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                                {/* Dynamic Form Fields - All configurable */}
                                <DynamicRegistrationForm
                                  distanceId={distance.id}
                                  formData={customFormData}
                                  onChange={handleCustomFieldChange}
                                />
                                
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
                                    {isSubmitting ? "Procesando..." : isGuestRegistration ? "Inscribirme como Invitado" : "Confirmar Inscripción"}
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
              {race.additional_info && (
                <Card className="bg-muted/30 border-0">
                  <CardHeader>
                    <CardTitle>Información Adicional</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-muted-foreground whitespace-pre-line">
                    {race.additional_info}
                  </CardContent>
                </Card>
              )}

              {/* FAQs */}
              {faqs.length > 0 && (
                <Card className="bg-muted/30 border-0">
                  <CardHeader>
                    <CardTitle>Preguntas Frecuentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {faqs.map((faq, index) => (
                        <AccordionItem key={faq.id} value={`faq-${index}`}>
                          <AccordionTrigger className="text-left">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground whitespace-pre-line">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RaceDetail;
