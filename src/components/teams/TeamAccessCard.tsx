/**
 * Acceso de capitanes — login y alta instantánea, embebido donde haga
 * falta (landing /equipos y herramienta /equipo).
 *
 * OJO: NO es un censo de cuentas aparte. Es la MISMA cuenta de Camberas
 * entrando por la puerta del club; si el capitán se creara una segunda
 * cuenta "de equipo", la auto-vinculación por email/DNI dejaría de
 * reconocerle y tendríamos a la misma persona duplicada.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface TeamAccessCardProps {
  /** A dónde vuelve el usuario tras confirmar el email */
  redirectTo?: string;
}

export const TeamAccessCard = ({ redirectTo = "/equipo" }: TeamAccessCardProps) => {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCapitan, setNombreCapitan] = useState("");

  const alta = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: nombreCapitan, last_name: "", is_organizer: false },
          emailRedirectTo: `${window.location.origin}${redirectTo}`,
        },
      });
      if (error) throw error;
      try {
        await supabase.functions.invoke("send-welcome-email", {
          body: { email, firstName: nombreCapitan },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
      toast({
        title: "¡Cuenta creada! 🎽",
        description: "Confirma tu correo si te lo pide y ya puedes crear tu equipo.",
      });
    } catch (e: any) {
      toast({ title: "No se pudo crear la cuenta", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const login = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: "No se pudo iniciar sesión", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tabs defaultValue="login">
      <TabsList className="grid grid-cols-2 w-full">
        <TabsTrigger value="login">Ya tengo cuenta</TabsTrigger>
        <TabsTrigger value="alta">Crear cuenta</TabsTrigger>
      </TabsList>
      <TabsContent value="login" className="space-y-3 pt-3">
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button className="w-full" onClick={login} disabled={cargando || !email || !password}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "INICIAR SESIÓN"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Es tu cuenta de Camberas de siempre: si ya corres con nosotros, entra con ella.
        </p>
      </TabsContent>
      <TabsContent value="alta" className="space-y-3 pt-3">
        <Input placeholder="Tu nombre" value={nombreCapitan} onChange={(e) => setNombreCapitan(e.target.value)} />
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" placeholder="Contraseña (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button
          variant="secondary"
          className="w-full"
          onClick={alta}
          disabled={cargando || !email || !password || !nombreCapitan}
        >
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "🎽 CREAR MI CUENTA"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Alta instantánea y gratuita. Con ella gestionas tu equipo y, si corres, tus
          propias inscripciones.
        </p>
      </TabsContent>
    </Tabs>
  );
};
