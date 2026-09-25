import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * «Duplicar carrera»: crea la edición siguiente a partir de una carrera
 * existente con la RPC duplicar_carrera (20260925150000). Copia recorridos,
 * precios, salidas, categorías, formulario, puntos de control, reglamento,
 * FAQ, devoluciones, patrocinadores y la web propia; no copia inscripciones,
 * pagos, cupones, resultados ni tokens. Todas las fechas se desplazan lo
 * mismo que la fecha de la carrera. La copia nace oculta.
 */
interface Props {
  carrera: { id: string; name: string; date: string; slug?: string | null } | null;
  onOpenChange: (abierto: boolean) => void;
  onDuplicada: (nuevoId: string) => void;
}

/** Misma fecha del año siguiente, ajustada al mismo día de la semana */
function fechaSiguienteEdicion(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const siguiente = new Date(d);
  siguiente.setFullYear(d.getFullYear() + 1);
  const diff = d.getDay() - siguiente.getDay();
  siguiente.setDate(siguiente.getDate() + ((diff + 7) % 7 <= 3 ? (diff + 7) % 7 : ((diff + 7) % 7) - 7));
  return siguiente.toISOString().slice(0, 10);
}

/** «V Gurriana Trail 2027» → «V Gurriana Trail 2028»; sin año, se añade */
function nombreSiguienteEdicion(nombre: string, fecha: string): string {
  const anio = fecha.slice(0, 4);
  if (/\b(19|20)\d{2}\b/.test(nombre)) return nombre.replace(/\b(19|20)\d{2}\b/, anio);
  return `${nombre} ${anio}`;
}

export function DuplicarCarreraDialog({ carrera, onOpenChange, onDuplicada }: Props) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [slug, setSlug] = useState("");
  const [copiarWeb, setCopiarWeb] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!carrera) return;
    const f = fechaSiguienteEdicion(carrera.date);
    setFecha(f);
    setNombre(nombreSiguienteEdicion(carrera.name, f));
    setSlug("");
    setCopiarWeb(true);
  }, [carrera]);

  const duplicar = async () => {
    if (!carrera) return;
    setEnviando(true);
    try {
      // RPC nueva: hasta regenerar types.ts no está tipada
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("duplicar_carrera", {
        p_race_id: carrera.id,
        p_nombre: nombre.trim(),
        p_fecha: fecha,
        p_slug: slug.trim() || null,
        p_copiar_web: copiarWeb,
      });
      if (error) throw error;
      toast({ title: "Carrera duplicada", description: `«${nombre.trim()}» creada oculta. Revisa fechas, precios y textos antes de publicarla.` });
      onDuplicada(String(data));
      onOpenChange(false);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo duplicar la carrera";
      toast({ title: "Error al duplicar", description: mensaje, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!carrera} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar carrera</DialogTitle>
          <DialogDescription>
            Nueva edición a partir de «{carrera?.name}». Se copian recorridos, precios, salidas, categorías, formulario, reglamento, FAQ, patrocinadores y web; no las inscripciones ni los resultados. Las fechas se desplazan lo mismo que la fecha de la carrera. Nace oculta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dup-nombre">Nombre</Label>
            <Input id="dup-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup-fecha">Fecha de la carrera</Label>
            <Input id="dup-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup-slug">Slug (opcional)</Label>
            <Input id="dup-slug" value={slug} placeholder="se genera del nombre si se deja vacío" onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dup-web" checked={copiarWeb} onCheckedChange={(v) => setCopiarWeb(v === true)} />
            <Label htmlFor="dup-web">Copiar también la web propia y los patrocinadores</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={duplicar} disabled={enviando || !nombre.trim() || !fecha}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
