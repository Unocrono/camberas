import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Calendar, MapPin, Trophy } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { z } from "zod";

const profileSchema = z.object({
  first_name: z.string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(50, "El nombre debe tener menos de 50 caracteres"),
  last_name: z.string()
    .trim()
    .min(1, "Los apellidos son requeridos")
    .max(100, "Los apellidos deben tener menos de 100 caracteres"),
  dni_passport: z.string()
    .trim()
    .min(1, "El DNI/Pasaporte es requerido")
    .max(20, "El DNI/Pasaporte debe tener menos de 20 caracteres"),
  phone: z.string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, "Formato de teléfono inválido")
    .max(20, "El teléfono debe tener menos de 20 caracteres"),
  birth_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)")
    .refine((date) => {
      const birthDate = new Date(date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      return age >= 0 && age <= 120;
    }, "Fecha de nacimiento inválida"),
  gender: z.string()
    .optional()
    .nullable(),
  address: z.string()
    .trim()
    .max(200, "La dirección debe tener menos de 200 caracteres")
    .optional()
    .nullable(),
  city: z.string()
    .trim()
    .min(1, "La localidad es requerida")
    .max(100, "La localidad debe tener menos de 100 caracteres"),
  province: z.string()
    .trim()
    .min(1, "La provincia es requerida")
    .max(100, "La provincia debe tener menos de 100 caracteres"),
  autonomous_community: z.string()
    .trim()
    .min(1, "La comunidad autónoma es requerida")
    .max(100, "La comunidad autónoma debe tener menos de 100 caracteres"),
  club: z.string()
    .trim()
    .max(100, "El club debe tener menos de 100 caracteres")
    .optional()
    .nullable(),
  team: z.string()
    .trim()
    .max(100, "El equipo debe tener menos de 100 caracteres")
    .optional()
    .nullable(),
});

interface Profile {
  first_name: string;
  last_name: string;
  dni_passport: string;
  phone: string;
  birth_date: string;
  gender: string;
  address: string;
  city: string;
  province: string;
  autonomous_community: string;
  club: string;
  team: string;
}

interface Registration {
  id: string;
  race: {
    name: string;
    date: string;
    location: string;
  };
  race_distance: {
    name: string;
    distance_km: number;
  };
  bib_number: number | null;
  status: string;
}

const Profile = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    first_name: "",
    last_name: "",
    dni_passport: "",
    phone: "",
    birth_date: "",
    gender: "",
    address: "",
    city: "",
    province: "",
    autonomous_community: "",
    club: "",
    team: "",
  });
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle auth and data loading
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    
    if (!dataLoaded) {
      setDataLoaded(true);
      loadProfile();
      loadRegistrations();
    }
  }, [authLoading, user]);

  const loadProfile = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          dni_passport: data.dni_passport || "",
          phone: data.phone || "",
          birth_date: data.birth_date || "",
          gender: data.gender || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          autonomous_community: data.autonomous_community || "",
          club: data.club || "",
          team: data.team || "",
        });
      }
    } catch (error: any) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrations = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          id,
          bib_number,
          status,
          race:races(name, date, location),
          race_distance:race_distances(name, distance_km)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRegistrations(data || []);
    } catch (error: any) {
      console.error("Error loading registrations:", error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Validate input data
      const validatedProfile = profileSchema.parse(profile);

      const { error } = await supabase
        .from("profiles")
        .update(validatedProfile)
        .eq("id", user?.id);

      if (error) throw error;

      toast({
        title: "Perfil actualizado",
        description: "Tus datos se han guardado correctamente.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error al guardar",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      // Navigate first to avoid state updates on unmounted component
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "Error al cerrar sesión",
        description: "Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mi Perfil</CardTitle>
              <CardDescription>
                Actualiza tu información personal y de contacto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                {/* Datos personales */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Datos Personales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">Nombre</Label>
                      <Input
                        id="first_name"
                        value={profile.first_name}
                        onChange={(e) =>
                          setProfile({ ...profile, first_name: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Apellidos</Label>
                      <Input
                        id="last_name"
                        value={profile.last_name}
                        onChange={(e) =>
                          setProfile({ ...profile, last_name: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dni_passport">DNI/Pasaporte</Label>
                      <Input
                        id="dni_passport"
                        value={profile.dni_passport}
                        onChange={(e) =>
                          setProfile({ ...profile, dni_passport: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile({ ...profile, phone: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="birth_date">Fecha de Nacimiento</Label>
                      <Input
                        id="birth_date"
                        type="date"
                        value={profile.birth_date}
                        onChange={(e) =>
                          setProfile({ ...profile, birth_date: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Género</Label>
                      <RadioGroup
                        value={profile.gender}
                        onValueChange={(value) =>
                          setProfile({ ...profile, gender: value })
                        }
                        className="flex gap-4 pt-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Masculino" id="gender-m" />
                          <Label htmlFor="gender-m" className="cursor-pointer">Masculino</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Femenino" id="gender-f" />
                          <Label htmlFor="gender-f" className="cursor-pointer">Femenino</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Dirección</h3>
                  <div className="space-y-2">
                    <Label htmlFor="address">Domicilio</Label>
                    <Input
                      id="address"
                      value={profile.address}
                      onChange={(e) =>
                        setProfile({ ...profile, address: e.target.value })
                      }
                      placeholder="Calle, número, piso..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Localidad</Label>
                      <Input
                        id="city"
                        value={profile.city}
                        onChange={(e) =>
                          setProfile({ ...profile, city: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="province">Provincia</Label>
                      <Input
                        id="province"
                        value={profile.province}
                        onChange={(e) =>
                          setProfile({ ...profile, province: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="autonomous_community">Comunidad Autónoma</Label>
                      <Input
                        id="autonomous_community"
                        value={profile.autonomous_community}
                        onChange={(e) =>
                          setProfile({ ...profile, autonomous_community: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Club y Equipo */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Club / Equipo</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="club">Club</Label>
                      <Input
                        id="club"
                        value={profile.club}
                        onChange={(e) =>
                          setProfile({ ...profile, club: e.target.value })
                        }
                        placeholder="Club deportivo (opcional)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="team">Equipo</Label>
                      <Input
                        id="team"
                        value={profile.team}
                        onChange={(e) =>
                          setProfile({ ...profile, team: e.target.value })
                        }
                        placeholder="Equipo (opcional)"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      "Guardar Cambios"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSignOut}>
                    Cerrar Sesión
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis Inscripciones</CardTitle>
              <CardDescription>
                Carreras en las que estás inscrito
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registrations.length === 0 ? (
                <p className="text-muted-foreground">
                  No tienes inscripciones activas.
                </p>
              ) : (
                <div className="space-y-4">
                  {registrations.map((reg) => {
                    // Guard against null/undefined related data
                    const raceName = reg.race?.name || "Carrera";
                    const raceDate = reg.race?.date;
                    const raceLocation = reg.race?.location || "Ubicación no disponible";
                    const distanceName = reg.race_distance?.name || "Distancia";
                    const distanceKm = reg.race_distance?.distance_km;
                    
                    return (
                      <div key={reg.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg">{raceName}</h3>
                          <span className="text-sm px-2 py-1 bg-primary/10 text-primary rounded">
                            {reg.status === "confirmed" ? "Confirmada" : "Pendiente"}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4" />
                            <span>{distanceName}{distanceKm ? ` - ${distanceKm}km` : ""}</span>
                          </div>
                          {raceDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>{new Date(raceDate).toLocaleDateString("es-ES")}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{raceLocation}</span>
                          </div>
                        </div>
                        {reg.bib_number && (
                          <div className="mt-2 pt-2 border-t">
                            <span className="font-semibold">Dorsal: {reg.bib_number}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Profile;
