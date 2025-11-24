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
  company_name: z.string()
    .trim()
    .min(1, "El nombre de la empresa es requerido")
    .max(200, "El nombre debe tener menos de 200 caracteres"),
  cif: z.string()
    .trim()
    .min(9, "El CIF debe tener 9 caracteres")
    .max(9, "El CIF debe tener 9 caracteres")
    .regex(/^[A-Z][0-9]{8}$/, "El CIF debe tener el formato: letra seguida de 8 números (ej: A12345678)"),
  company_address: z.string()
    .trim()
    .min(1, "La dirección de la empresa es requerida")
    .max(300, "La dirección debe tener menos de 300 caracteres"),
  company_phone: z.string()
    .trim()
    .regex(/^(\+34)?[6-9][0-9]{8}$/, "El teléfono debe ser válido (ej: 612345678 o +34612345678)"),
});

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [cif, setCif] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
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
          company_name: companyName,
          cif: cif.toUpperCase(),
          company_address: companyAddress,
          company_phone: companyPhone,
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
      if (isOrganizerSignup && 'company_name' in validatedData) {
        userData.company_name = validatedData.company_name;
        userData.cif = validatedData.cif;
        userData.company_address = validatedData.company_address;
        userData.company_phone = validatedData.company_phone;
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
      setCompanyName("");
      setCif("");
      setCompanyAddress("");
      setCompanyPhone("");
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
          description: error.message,
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
          description: error.message,
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
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="register-company">Nombre de la Empresa</Label>
                          <Input
                            id="register-company"
                            type="text"
                            placeholder="Mi Empresa S.L."
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="register-cif">CIF</Label>
                            <Input
                              id="register-cif"
                              type="text"
                              placeholder="A12345678"
                              value={cif}
                              onChange={(e) => setCif(e.target.value.toUpperCase())}
                              required
                              maxLength={9}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="register-phone">Teléfono de Empresa</Label>
                            <Input
                              id="register-phone"
                              type="tel"
                              placeholder="612345678"
                              value={companyPhone}
                              onChange={(e) => setCompanyPhone(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-address">Dirección de la Empresa</Label>
                          <Input
                            id="register-address"
                            type="text"
                            placeholder="Calle Principal, 123, Madrid"
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                            required
                          />
                        </div>
                      </>
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
