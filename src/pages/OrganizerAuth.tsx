import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Briefcase, ArrowLeft, CheckCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { z } from "zod";

const translateAuthError = (message: string): string => {
  const translations: Record<string, string> = {
    "User already registered": "Este usuario ya está registrado",
    "Invalid login credentials": "Credenciales de inicio de sesión inválidas",
    "Email not confirmed": "El email no ha sido confirmado",
    "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres",
    "Unable to validate email address: invalid format": "Formato de email inválido",
    "Signup requires a valid password": "Se requiere una contraseña válida para registrarse",
    "Email rate limit exceeded": "Has excedido el límite de intentos. Intenta más tarde",
  };
  return translations[message] || message;
};

const organizerSchema = z.object({
  email: z.string()
    .trim()
    .email("Formato de email inválido")
    .max(255, "El email debe tener menos de 255 caracteres"),
  password: z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un número"),
  first_name: z.string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(50, "El nombre debe tener menos de 50 caracteres")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, "El nombre solo puede contener letras"),
  last_name: z.string()
    .trim()
    .min(1, "Los apellidos son requeridos")
    .max(100, "Los apellidos deben tener menos de 100 caracteres")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, "Los apellidos solo pueden contener letras"),
  club: z.string()
    .trim()
    .min(1, "El nombre del club/empresa es requerido")
    .max(200, "El nombre debe tener menos de 200 caracteres"),
});

const benefits = [
  "Gestión completa de inscripciones",
  "Panel de control con analíticas",
  "Cronometraje profesional",
  "Seguimiento GPS en vivo",
  "Soporte técnico prioritario"
];

const OrganizerAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [club, setClub] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const returnTo = searchParams.get('returnTo') || '/organizer';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate(returnTo);
      }
    });
  }, [navigate, returnTo]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validatedData = organizerSchema.parse({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        club,
      });

      const { error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          data: {
            first_name: validatedData.first_name,
            last_name: validatedData.last_name,
            is_organizer: true,
            club: validatedData.club,
          },
          emailRedirectTo: `${window.location.origin}${returnTo}`,
        },
      });

      if (error) throw error;

      // Send welcome email
      try {
        await supabase.functions.invoke('send-welcome-email', {
          body: {
            email: validatedData.email,
            firstName: validatedData.first_name,
          },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }

      // Send organizer notification
      try {
        await supabase.functions.invoke('send-organizer-request-notification', {
          body: {
            organizerName: `${validatedData.first_name} ${validatedData.last_name}`,
            organizerEmail: validatedData.email,
            clubName: validatedData.club,
          },
        });
      } catch (notifyErr) {
        console.error("Failed to send organizer notification:", notifyErr);
      }

      toast({
        title: "¡Solicitud enviada!",
        description: "Tu cuenta de organizador será revisada por nuestro equipo. Te contactaremos pronto.",
      });
      
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setClub("");
      
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error al registrarse",
          description: translateAuthError(error.message),
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Benefits Section */}
          <div className="hidden lg:block">
            <div className="mb-6">
              <Link 
                to="/organizers" 
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a información
              </Link>
            </div>
            
            <h1 className="text-3xl font-bold mb-4">
              Únete como Organizador
            </h1>
            <p className="text-muted-foreground mb-8">
              Accede a todas las herramientas profesionales para gestionar tus carreras.
            </p>
            
            <div className="space-y-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="h-4 w-4 text-primary" />
                  </div>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Form Section */}
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Registro de Organizador</CardTitle>
              <CardDescription>
                Tu cuenta será revisada por nuestro equipo antes de ser aprobada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">Nombre</Label>
                    <Input
                      id="first-name"
                      type="text"
                      placeholder="Juan"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Apellidos</Label>
                    <Input
                      id="last-name"
                      type="text"
                      placeholder="Pérez García"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="club">Club / Empresa Organizadora</Label>
                  <Input
                    id="club"
                    type="text"
                    placeholder="Club Deportivo Trail"
                    value={club}
                    onChange={(e) => setClub(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="organizador@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres, con mayúscula, minúscula y número
                  </p>
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando solicitud...
                    </>
                  ) : (
                    "Solicitar cuenta de Organizador"
                  )}
                </Button>
              </form>
              
              <div className="mt-6 text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link to="/auth" className="text-primary hover:underline font-medium">
                  Iniciar sesión
                </Link>
              </div>
              
              <div className="mt-4 text-center">
                <Link 
                  to="/auth" 
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ¿Eres corredor? Regístrate aquí
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default OrganizerAuth;
