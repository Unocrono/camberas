import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { z } from "zod";

// Función para traducir mensajes de error de Supabase al español
const translateAuthError = (message: string): string => {
  const translations: Record<string, string> = {
    "User already registered": "Este usuario ya está registrado",
    "Invalid login credentials": "Credenciales de inicio de sesión inválidas",
    "Email not confirmed": "El email no ha sido confirmado",
    "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres",
    "Unable to validate email address: invalid format": "Formato de email inválido",
    "Signup requires a valid password": "Se requiere una contraseña válida para registrarse",
    "Email rate limit exceeded": "Has excedido el límite de intentos. Intenta más tarde",
    "For security purposes, you can only request this once every 60 seconds": "Por seguridad, solo puedes solicitar esto una vez cada 60 segundos",
    "New password should be different from the old password": "La nueva contraseña debe ser diferente a la anterior",
    "Auth session missing!": "Sesión de autenticación no encontrada",
    "User not found": "Usuario no encontrado",
  };
  
  return translations[message] || message;
};

const loginSchema = z.object({
  email: z.string()
    .trim()
    .email("Formato de email inválido")
    .max(255, "El email debe tener menos de 255 caracteres"),
  password: z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un número"),
});

const signupSchema = loginSchema.extend({
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
});

const organizerSchema = signupSchema.extend({
  club: z.string()
    .trim()
    .min(1, "El nombre del club es requerido")
    .max(200, "El nombre debe tener menos de 200 caracteres"),
});

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [club, setClub] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });
  }, [navigate]);

  const handleSignUp = async (e: React.FormEvent, isOrganizerSignup: boolean = false) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate input data based on user type
      const baseData = {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      };

      let validatedData;
      if (isOrganizerSignup) {
        validatedData = organizerSchema.parse({
          ...baseData,
          club,
        });
      } else {
        validatedData = signupSchema.parse(baseData);
      }

      const userData: any = {
        first_name: validatedData.first_name,
        last_name: validatedData.last_name,
        is_organizer: isOrganizerSignup,
      };

      // Add organizer-specific data
      if (isOrganizerSignup && 'club' in validatedData) {
        userData.club = validatedData.club;
      }

      const { error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          data: userData,
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: "¡Cuenta creada!",
        description: isOrganizerSignup 
          ? "Tu solicitud como organizador será revisada. Por favor, revisa tu email para confirmar tu cuenta."
          : "Por favor, revisa tu email para confirmar tu cuenta.",
      });
      
      // Clear form
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setClub("");
      setIsOrganizer(false);
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate input data
      const validatedData = loginSchema.parse({
        email,
        password,
      });

      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });

      if (error) throw error;

      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión correctamente.",
      });
      
      navigate("/");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error al iniciar sesión",
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
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-subtle">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Bienvenido a Camberas</CardTitle>
            <CardDescription>
              Inicia sesión o crea una cuenta para inscribirte en carreras
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
                <TabsTrigger value="register">Registrarse</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Contraseña</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando...
                      </>
                    ) : (
                      "Iniciar Sesión"
                    )}
                  </Button>
                  <div className="text-center mt-2">
                    <Link 
                      to="/forgot-password" 
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de cuenta</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={!isOrganizer ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setIsOrganizer(false)}
                      >
                        Corredor
                      </Button>
                      <Button
                        type="button"
                        variant={isOrganizer ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setIsOrganizer(true)}
                      >
                        Organizador
                      </Button>
                    </div>
                    {isOrganizer && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Tu cuenta de organizador será revisada por nuestro equipo antes de ser aprobada.
                      </p>
                    )}
                  </div>
                  
                  <form onSubmit={(e) => handleSignUp(e, isOrganizer)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-firstname">Nombre</Label>
                        <Input
                          id="register-firstname"
                          type="text"
                          placeholder="Juan"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-lastname">Apellidos</Label>
                        <Input
                          id="register-lastname"
                          type="text"
                          placeholder="Pérez García"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    
                    {isOrganizer && (
                      <div className="space-y-2">
                        <Label htmlFor="register-club">Nombre del Club</Label>
                        <Input
                          id="register-club"
                          type="text"
                          placeholder="Club Deportivo"
                          value={club}
                          onChange={(e) => setClub(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder={isOrganizer ? "organizador@email.com" : "tu@email.com"}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Contraseña</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creando cuenta...
                        </>
                      ) : (
                        isOrganizer ? "Registrarse como Organizador" : "Registrarse como Corredor"
                      )}
                    </Button>
                  </form>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Auth;
