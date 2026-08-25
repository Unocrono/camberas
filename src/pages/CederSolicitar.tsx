/**
 * Pedir el enlace de cesión cuando no tienes cuenta.
 *
 * Quien se inscribió como invitado tiene user_id NULL y no ve /dashboard
 * jamás, así que sin esta puerta se queda fuera justo la gente que más usa
 * el WhatsApp para colocar su dorsal.
 *
 * Funciona como el "he olvidado mi contraseña": se escribe el email y el
 * enlace se manda ahí. La respuesta es siempre la misma, haya inscripciones
 * o no — si cambiara, esto sería un comprobador de quién está inscrito en
 * cada carrera para cualquiera que pasara por aquí.
 */
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CederSolicitar = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const pedir = async () => {
    if (!email.includes("@")) {
      toast({ title: "Escribe un email válido", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.functions.invoke("cesion-solicitar-enlace", {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) throw error;
      setEnviado(true);
    } catch (e: any) {
      toast({
        title: "No se ha podido enviar",
        description: e.message ?? "Inténtalo de nuevo en un momento.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Ceder mi dorsal
            </CardTitle>
            <CardDescription>
              ¿No puedes correr? Pasa tu plaza a otra persona. Escribe el email con el que te
              inscribiste y te mandamos el enlace para compartir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {enviado ? (
              <div className="space-y-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                <p className="font-semibold">Mira tu correo</p>
                <p className="text-sm text-muted-foreground">
                  Si ese email tiene alguna inscripción que se pueda ceder, te llega el enlace en
                  unos minutos. Revisa también la carpeta de spam.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email de tu inscripción</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    placeholder="el que usaste al inscribirte"
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && pedir()}
                  />
                </div>
                <Button className="w-full" onClick={pedir} disabled={enviando}>
                  {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviarme el enlace
                </Button>
                <p className="text-xs text-muted-foreground">
                  Solo funciona en carreras cuyo organizador permita la cesión, y antes de su fecha
                  límite. Si tienes cuenta en Camberas, lo tienes más a mano en tu panel.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default CederSolicitar;
