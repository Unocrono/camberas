import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Calendar, MapPin, Trophy } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { z } from "zod";

const profileSchema = z.object({
  full_name: z.string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre debe tener menos de 100 caracteres"),
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
  emergency_contact: z.string()
    .trim()
    .min(1, "El contacto de emergencia es requerido")
    .max(100, "El contacto debe tener menos de 100 caracteres"),
  emergency_phone: z.string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, "Formato de teléfono inválido")
    .max(20, "El teléfono debe tener menos de 20 caracteres"),
});

interface Profile {
  full_name: string;
  phone: string;
  birth_date: string;
  emergency_contact: string;
  emergency_phone: string;
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
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    phone: "",
    birth_date: "",
    emergency_contact: "",
    emergency_phone: "",
  });
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadRegistrations();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          phone: data.phone || "",
          birth_date: data.birth_date || "",
          emergency_contact: data.emergency_contact || "",
          emergency_phone: data.emergency_phone || "",
        });
      }
    } catch (error: any) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrations = async () => {
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
        .eq("user_id", user?.id)
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
    await signOut();
    navigate("/");
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
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nombre Completo</Label>
                    <Input
                      id="full_name"
                      value={profile.full_name}
                      onChange={(e) =>
                        setProfile({ ...profile, full_name: e.target.value })
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Fecha de Nacimiento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={profile.birth_date}
                      onChange={(e) =>
                        setProfile({ ...profile, birth_date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact">Contacto de Emergencia</Label>
                    <Input
                      id="emergency_contact"
                      value={profile.emergency_contact}
                      onChange={(e) =>
                        setProfile({ ...profile, emergency_contact: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_phone">Teléfono de Emergencia</Label>
                    <Input
                      id="emergency_phone"
                      type="tel"
                      value={profile.emergency_phone}
                      onChange={(e) =>
                        setProfile({ ...profile, emergency_phone: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2">
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
                  {registrations.map((reg) => (
                    <div key={reg.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg">{reg.race.name}</h3>
                        <span className="text-sm px-2 py-1 bg-primary/10 text-primary rounded">
                          {reg.status === "confirmed" ? "Confirmada" : "Pendiente"}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4" />
                          <span>{reg.race_distance.name} - {reg.race_distance.distance_km}km</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(reg.race.date).toLocaleDateString("es-ES")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{reg.race.location}</span>
                        </div>
                        {reg.bib_number && (
                          <div className="mt-2 pt-2 border-t">
                            <span className="font-semibold">Dorsal: {reg.bib_number}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
