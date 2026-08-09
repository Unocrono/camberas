/**
 * Mi Perfil — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * Lo que el organizador necesita en la app: sus datos de contacto
 * (nombre, teléfono — tabla profiles), el modo de los avisos de
 * inscripción (el "clinc": cada una / hitos / silencio, que se respeta
 * también en el push del servidor) y cerrar sesión. La ficha completa
 * del perfil (dirección, club…) sigue en la web.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enablePush, pushPermission } from "@/lib/pushNotifications";
import {
  Loader2, Volume2, Bell, VolumeX, BellRing, LogOut, UserCircle, CheckCircle2,
} from "lucide-react";

export type ClincMode = "each" | "milestones" | "off";

interface Props {
  clincMode: ClincMode;
  onClincModeChange: (mode: ClincMode) => void;
}

const CLINC_OPTIONS: { value: ClincMode; label: string; hint: string; icon: typeof Volume2 }[] = [
  { value: "each", label: "Cada inscripción", hint: "Suena (y avisa) con cada pago", icon: Volume2 },
  { value: "milestones", label: "Solo hitos", hint: "Cada 10 pagados o quedando ≤10 plazas", icon: Bell },
  { value: "off", label: "Silencio", hint: "Sin sonido ni avisos", icon: VolumeX },
];

export const OrgProfile = ({ clincMode, onClincModeChange }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [pushState, setPushState] = useState(() => pushPermission());

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFirstName(data?.first_name || "");
        setLastName(data?.last_name || "");
        setPhone(data?.phone || "");
        setLoading(false);
      });
  }, [user]);

  const guardar = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil guardado" });
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate("/auth?returnTo=/org");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cuenta */}
      <section className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-secondary">
          <UserCircle className="h-4 w-4" /> Mi cuenta
        </p>
        <p className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          {user?.email}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-nombre">Nombre</Label>
            <Input id="p-nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-apellidos">Apellidos</Label>
            <Input id="p-apellidos" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="p-telefono">Teléfono</Label>
          <Input id="p-telefono" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button onClick={guardar} disabled={saving} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          La ficha completa (dirección, club, contraseña) se edita en la web.
        </p>
      </section>

      {/* Avisos de inscripción */}
      <section className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-secondary">
          <BellRing className="h-4 w-4" /> Avisos de inscripción
        </p>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {CLINC_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onClincModeChange(opt.value)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <opt.icon className={`h-5 w-5 shrink-0 ${clincMode === opt.value ? "text-secondary" : "text-muted-foreground"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
              </span>
              {clincMode === opt.value && <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary" />}
            </button>
          ))}
        </div>
        {/* Push con la app cerrada: mismo criterio, decidido en el servidor */}
        {pushState === "granted" ? (
          <p className="text-center text-xs text-muted-foreground">
            Avisos con la app cerrada: activados. El modo elegido también los controla.
          </p>
        ) : pushState === "unsupported" ? (
          <p className="text-center text-xs text-muted-foreground">
            Este navegador no admite avisos con la app cerrada.
          </p>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-1.5"
            onClick={async () => {
              if (!user) return;
              const err = await enablePush(user.id, clincMode);
              setPushState(pushPermission());
              toast(
                err
                  ? { title: "No se activaron los avisos", description: err, variant: "destructive" }
                  : { title: "Avisos activados", description: "Te avisaremos aunque la app esté cerrada." },
              );
            }}
          >
            <BellRing className="h-4 w-4" />
            Activar avisos con la app cerrada
          </Button>
        )}
      </section>

      {/* Sesión */}
      <Button variant="outline" onClick={cerrarSesion} className="w-full gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5">
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );
};
