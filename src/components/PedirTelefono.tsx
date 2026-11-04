/**
 * Usuarios antiguos sin teléfono: al entrar se les pide una vez por sesión.
 * El teléfono es lo que identifica a la persona en el asistente de WhatsApp
 * (Maika solo atiende a teléfonos que estén en un perfil), y a 4-nov-2026
 * solo 31 de 84 perfiles lo tenían. Los nuevos ya lo dan al registrarse.
 *
 * Se puede posponer («Ahora no»): no vuelve a salir hasta la siguiente
 * sesión del navegador. Al guardarlo deja de aparecer.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const CLAVE_POSPUESTO = "camberas-telefono-pospuesto";
/** Donde no molesta: paneles, cronometraje, overlays, pantallas, login. */
const SIN_AVISO = [/^\/admin/, /^\/timing/, /^\/overlay/, /^\/pantalla/, /^\/vuelo/, /^\/start-control/, /^\/auth/, /^\/profile/];

const limpiar = (v: string) => v.replace(/[\s.-]/g, "");
const valido = (v: string) => /^(\+?\d{1,3})?\d{9}$/.test(limpiar(v));

export default function PedirTelefono() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    try {
      if (sessionStorage.getItem(CLAVE_POSPUESTO)) return;
    } catch {
      /* sin sessionStorage: se pregunta igual */
    }
    let vivo = true;
    supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo && data && !(data.phone ?? "").trim()) setAbierto(true);
      });
    return () => {
      vivo = false;
    };
  }, [user, loading]);

  if (!user || SIN_AVISO.some((r) => r.test(pathname))) return null;

  const posponer = () => {
    try {
      sessionStorage.setItem(CLAVE_POSPUESTO, "1");
    } catch {
      /* nada */
    }
    setAbierto(false);
  };

  const guardar = async () => {
    if (!valido(telefono)) {
      toast.error("Escribe un teléfono válido (9 cifras, con o sin prefijo)");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("profiles").update({ phone: limpiar(telefono) }).eq("id", user.id);
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar el teléfono");
      return;
    }
    toast.success("Teléfono guardado. Ya puedes escribir a Maika por WhatsApp.");
    setAbierto(false);
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : posponer())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nos falta tu teléfono</DialogTitle>
          <DialogDescription>
            Con tu móvil podrás consultar tus inscripciones, tu dorsal y tus tiempos por WhatsApp con Maika, la asistente de
            Camberas. Solo lo usamos para eso.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <Label htmlFor="telefono-perfil">Teléfono móvil</Label>
          <Input
            id="telefono-perfil"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="600 123 456"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            autoFocus
          />
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={posponer} disabled={guardando}>
              Ahora no
            </Button>
            <Button type="submit" disabled={guardando || !telefono.trim()} className="bg-[#EC7C2B] hover:bg-[#EC7C2B]/90">
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
