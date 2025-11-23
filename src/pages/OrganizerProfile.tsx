import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Loader2, User, Shield, Mail, Calendar, MapPin, Phone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  dni_passport: string | null;
  birth_date: string | null;
  city: string | null;
  province: string | null;
  autonomous_community: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
}

const OrganizerProfile = () => {
  const { user, isOrganizer, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    phone: "",
    dni_passport: "",
    birth_date: "",
    city: "",
    province: "",
    autonomous_community: "",
    emergency_contact: "",
    emergency_phone: "",
  });
  const [rolesChecked, setRolesChecked] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && user) {
      const timer = setTimeout(() => {
        setRolesChecked(true);
        if (!isOrganizer) {
          toast({
            title: "Acceso denegado",
            description: "Solo organizadores pueden acceder a esta página",
            variant: "destructive",
          });
          navigate("/");
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [user, authLoading, isOrganizer, navigate, toast]);

  useEffect(() => {
    if (rolesChecked && isOrganizer && user) {
      loadProfile();
    }
  }, [isOrganizer, rolesChecked, user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfileData(data);
      }
    } catch (error: any) {
      console.error("Error loading profile:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el perfil",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(profileData)
        .eq("id", user!.id);

      if (error) throw error;

      toast({
        title: "Perfil actualizado",
        description: "Los cambios se han guardado correctamente",
      });
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el perfil",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof ProfileData, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  if (authLoading || loading || !rolesChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Perfil de Organizador</h1>
            <p className="text-muted-foreground">
              Gestiona tu información personal y visualiza tus permisos
            </p>
          </div>

          {/* Roles Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Roles y Permisos
              </CardTitle>
              <CardDescription>
                Los roles que tienes asignados en la plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <Badge variant="default" className="text-sm">
                    <Shield className="h-3 w-3 mr-1" />
                    Administrador
                  </Badge>
                )}
                {isOrganizer && (
                  <Badge variant="secondary" className="text-sm">
                    <User className="h-3 w-3 mr-1" />
                    Organizador
                  </Badge>
                )}
                <Badge variant="outline" className="text-sm">
                  <User className="h-3 w-3 mr-1" />
                  Usuario
                </Badge>
              </div>
              
              <Separator className="my-4" />
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Como organizador, tienes acceso a crear y gestionar carreras, inscripciones, resultados y más.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Account Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Información de la Cuenta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-lg font-medium">{user?.email}</p>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Información Personal
              </CardTitle>
              <CardDescription>
                Actualiza tu información personal y de contacto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Nombre</Label>
                  <Input
                    id="first_name"
                    value={profileData.first_name || ""}
                    onChange={(e) => handleInputChange("first_name", e.target.value)}
                    placeholder="Introduce tu nombre"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="last_name">Apellidos</Label>
                  <Input
                    id="last_name"
                    value={profileData.last_name || ""}
                    onChange={(e) => handleInputChange("last_name", e.target.value)}
                    placeholder="Introduce tus apellidos"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dni_passport">DNI/Pasaporte</Label>
                  <Input
                    id="dni_passport"
                    value={profileData.dni_passport || ""}
                    onChange={(e) => handleInputChange("dni_passport", e.target.value)}
                    placeholder="12345678A"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birth_date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Fecha de Nacimiento
                  </Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={profileData.birth_date || ""}
                    onChange={(e) => handleInputChange("birth_date", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Teléfono
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={profileData.phone || ""}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="+34 600 000 000"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Ubicación
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">Ciudad</Label>
                    <Input
                      id="city"
                      value={profileData.city || ""}
                      onChange={(e) => handleInputChange("city", e.target.value)}
                      placeholder="Madrid"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="province">Provincia</Label>
                    <Input
                      id="province"
                      value={profileData.province || ""}
                      onChange={(e) => handleInputChange("province", e.target.value)}
                      placeholder="Madrid"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="autonomous_community">Comunidad Autónoma</Label>
                    <Input
                      id="autonomous_community"
                      value={profileData.autonomous_community || ""}
                      onChange={(e) => handleInputChange("autonomous_community", e.target.value)}
                      placeholder="Comunidad de Madrid"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Contacto de Emergencia
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact">Nombre del Contacto</Label>
                    <Input
                      id="emergency_contact"
                      value={profileData.emergency_contact || ""}
                      onChange={(e) => handleInputChange("emergency_contact", e.target.value)}
                      placeholder="Nombre completo"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergency_phone">Teléfono de Emergencia</Label>
                    <Input
                      id="emergency_phone"
                      type="tel"
                      value={profileData.emergency_phone || ""}
                      onChange={(e) => handleInputChange("emergency_phone", e.target.value)}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate("/organizer")}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar Cambios"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrganizerProfile;
