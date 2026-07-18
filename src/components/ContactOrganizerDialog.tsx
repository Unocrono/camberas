/**
 * Formulario de contacto con el organizador de una carrera.
 * El email del organizador se resuelve en el servidor (edge function
 * contact-organizer): nunca se expone en el HTML de la página.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";

interface ContactOrganizerDialogProps {
  raceId: string;
  raceName: string;
}

export function ContactOrganizerDialog({ raceId, raceName }: ContactOrganizerDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke("contact-organizer", {
        body: { raceId, name, email, message },
      });

      if (error) {
        // El cuerpo real del error viene en context (FunctionsHttpError)
        let detail = "No se pudo enviar el mensaje";
        try {
          const body = await (error as any).context?.json();
          detail = body?.error || detail;
        } catch { /* respuesta sin JSON */ }
        throw new Error(detail);
      }

      toast({
        title: "Mensaje enviado",
        description: "Tu consulta ha llegado al organizador. Te responderá a tu email.",
      });
      setOpen(false);
      setMessage("");
    } catch (err: any) {
      toast({
        title: "Error al enviar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-2" />
          Contactar Organizador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-archivo text-xl uppercase">
            Contactar con el organizador
          </DialogTitle>
          <DialogDescription>
            Tu consulta sobre {raceName} le llegará por email y te responderá directamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="co-name">Nombre</Label>
              <Input
                id="co-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-email">Email</Label>
              <Input
                id="co-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                maxLength={255}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-message">Mensaje</Label>
            <Textarea
              id="co-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe aquí tu consulta sobre la carrera..."
              rows={5}
              required
              minLength={10}
              maxLength={5000}
            />
          </div>
          <Button type="submit" variant="secondary" className="w-full" disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar consulta"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
