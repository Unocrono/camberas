/**
 * Añadir invitado — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * El caso de uso: el organizador mete a un invitado (compromiso, prensa,
 * autoridades, colaborador) en segundos, desde el móvil. Mismo camino que
 * el alta manual del panel: insert directo en registrations con
 * source="manual" — no pasa por la pasarela y no factura comisión — y
 * queda confirmado y sin pago desde el primer momento.
 *
 * Solo lo imprescindible: recorrido, nombre y apellidos. Email, teléfono,
 * DNI y dorsal son opcionales; el resto de la ficha, en el panel.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";

interface DistanceOption {
  id: string;
  name: string;
  distance_km: number;
}

interface Props {
  raceId: string | null;
}

const VACIO = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  dni_passport: "",
  bib_number: "",
};

export const OrgAddGuest = ({ raceId }: Props) => {
  const { toast } = useToast();

  const [distances, setDistances] = useState<DistanceOption[] | null>(null);
  const [distanceId, setDistanceId] = useState("");
  const [ficha, setFicha] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  // El último invitado dado de alta, para confirmar en pantalla
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;
    setDistances(null);
    setDistanceId("");
    const load = async () => {
      const { data } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", raceId)
        .order("distance_km", { ascending: true });
      const opts = (data || []) as DistanceOption[];
      setDistances(opts);
      // Con un solo recorrido no hay nada que elegir
      if (opts.length === 1) setDistanceId(opts[0].id);
    };
    load();
  }, [raceId]);

  const set = (campo: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFicha((f) => ({ ...f, [campo]: e.target.value }));

  const guardar = async () => {
    if (!raceId || !distanceId) {
      toast({ title: "Falta el recorrido", description: "Elige en qué recorrido corre.", variant: "destructive" });
      return;
    }
    if (!ficha.first_name.trim() || !ficha.last_name.trim()) {
      toast({ title: "Faltan datos", description: "Nombre y apellidos son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("registrations").insert({
      race_id: raceId,
      race_distance_id: distanceId,
      first_name: ficha.first_name.trim(),
      last_name: ficha.last_name.trim(),
      email: ficha.email.trim() || null,
      phone: ficha.phone.trim() || null,
      dni_passport: ficha.dni_passport.trim() || null,
      bib_number: ficha.bib_number ? parseInt(ficha.bib_number) : null,
      // Invitado: confirmado y sin pago desde el primer momento
      status: "confirmed",
      payment_status: "not_required",
      // Alta desde la app: no pasa por la pasarela, no factura comisión
      source: "manual",
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo inscribir", description: error.message, variant: "destructive" });
      return;
    }
    setUltimo(`${ficha.first_name.trim()} ${ficha.last_name.trim()}`);
    // El recorrido se queda puesto: los invitados suelen ir en tandas
    setFicha(VACIO);
  };

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }
  if (distances === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }
  if (distances.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Esta carrera no tiene recorridos todavía.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Confirmación del último alta, sin taparle el formulario */}
      {ultimo && (
        <div className="flex items-start gap-2 rounded-xl border border-secondary/40 bg-secondary/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <p>
            <strong>{ultimo}</strong> inscrito como invitado. Ya cuenta en el informe de la portada
            (origen: alta manual).
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor="g-recorrido">Recorrido *</Label>
          <Select value={distanceId} onValueChange={setDistanceId}>
            <SelectTrigger id="g-recorrido">
              <SelectValue placeholder="¿En qué recorrido corre?" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              {distances.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.distance_km} km)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="g-nombre">Nombre *</Label>
          <Input id="g-nombre" value={ficha.first_name} onChange={set("first_name")} placeholder="María" />
        </div>
        <div>
          <Label htmlFor="g-apellidos">Apellidos *</Label>
          <Input id="g-apellidos" value={ficha.last_name} onChange={set("last_name")} placeholder="Etxebarria" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="g-telefono">Teléfono</Label>
            <Input id="g-telefono" type="tel" value={ficha.phone} onChange={set("phone")} placeholder="600 123 456" />
          </div>
          <div>
            <Label htmlFor="g-dni">DNI</Label>
            <Input id="g-dni" value={ficha.dni_passport} onChange={set("dni_passport")} placeholder="12345678Z" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="g-email">Email</Label>
            <Input id="g-email" type="email" value={ficha.email} onChange={set("email")} />
          </div>
          <div>
            <Label htmlFor="g-dorsal">Dorsal</Label>
            <Input
              id="g-dorsal"
              type="number"
              inputMode="numeric"
              value={ficha.bib_number}
              onChange={set("bib_number")}
              placeholder="Se puede dar luego"
            />
          </div>
        </div>
      </div>

      <Button onClick={guardar} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        <span className="ml-2">Inscribir invitado</span>
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Invitado = confirmado, sin pago y origen "alta manual" (no factura comisión).
        Para editar la ficha completa: Inscripciones, en el panel.
      </p>
    </div>
  );
};
