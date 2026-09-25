import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { tablaSinTipos } from "@/eventos/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Patrocinador {
  id: string;
  race_id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  level: string;
  display_order: number;
}

const NIVELES = [
  { valor: "organiza", texto: "Organiza" },
  { valor: "principal", texto: "Patrocinador principal" },
  { valor: "institucional", texto: "Institucional (ayuntamientos, federación)" },
  { valor: "beneficiario", texto: "Entidad beneficiaria" },
  { valor: "colaborador", texto: "Colaborador" },
];

/** CRUD de race_sponsors con subida del logo a race-images/{race_id}/patrocinadores/ */
export function PatrocinadoresManagement({ raceId }: { raceId: string }) {
  const { toast } = useToast();
  const [lista, setLista] = useState<Patrocinador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await tablaSinTipos("race_sponsors").select("*").eq("race_id", raceId).order("display_order").order("name");
    if (error) toast({ title: "No se pudieron cargar los patrocinadores", description: error.message, variant: "destructive" });
    setLista((data as Patrocinador[]) ?? []);
    setCargando(false);
  }, [raceId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarFila = async (p: Patrocinador) => {
    const { error } = await tablaSinTipos("race_sponsors").update({ name: p.name, website: p.website, level: p.level, logo_url: p.logo_url, display_order: p.display_order }).eq("id", p.id);
    if (error) toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
  };

  const anadir = async () => {
    const { data, error } = await tablaSinTipos("race_sponsors").insert({ race_id: raceId, name: "Nuevo patrocinador", level: "colaborador", display_order: lista.length }).select().single();
    if (error) return toast({ title: "No se pudo añadir", description: error.message, variant: "destructive" });
    setLista((l) => [...l, data as Patrocinador]);
  };

  const borrar = async (id: string) => {
    const { error } = await tablaSinTipos("race_sponsors").delete().eq("id", id);
    if (error) return toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" });
    setLista((l) => l.filter((p) => p.id !== id));
  };

  const mover = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    const renumerada = copia.map((p, k) => ({ ...p, display_order: k }));
    setLista(renumerada);
    await Promise.all([guardarFila(renumerada[i]), guardarFila(renumerada[j])]);
  };

  const subirLogo = async (p: Patrocinador, fichero: File) => {
    setSubiendo(p.id);
    try {
      const ext = fichero.name.split(".").pop()?.toLowerCase() || "png";
      const ruta = `${raceId}/patrocinadores/${p.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("race-images").upload(ruta, fichero, { cacheControl: "3600", upsert: true, contentType: fichero.type || undefined });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("race-images").getPublicUrl(ruta);
      const actualizado = { ...p, logo_url: `${publicUrl}?v=${Date.now()}` };
      setLista((l) => l.map((x) => (x.id === p.id ? actualizado : x)));
      await guardarFila(actualizado);
    } catch (e) {
      toast({ title: "No se pudo subir el logo", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSubiendo(null);
    }
  };

  const editar = (id: string, cambios: Partial<Patrocinador>) => setLista((l) => l.map((p) => (p.id === id ? { ...p, ...cambios } : p)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Patrocinadores</CardTitle>
          <CardDescription>Se agrupan en la web por nivel. Logos en PNG con fondo transparente, máximo 200 KB.</CardDescription>
        </div>
        <Button type="button" onClick={anadir}>
          <Plus className="mr-2 h-4 w-4" /> Añadir
        </Button>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay patrocinadores.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {lista.map((p, i) => (
              <li key={p.id} className="grid items-center gap-3 p-3 md:grid-cols-[64px_1fr_1fr_200px_auto]">
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded border bg-white" title="Subir logo">
                  {subiendo === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.logo_url ? <img src={p.logo_url} alt="" className="max-h-full max-w-full object-contain" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && subirLogo(p, e.target.files[0])} />
                </label>
                <Input value={p.name} onChange={(e) => editar(p.id, { name: e.target.value })} onBlur={() => guardarFila(lista.find((x) => x.id === p.id)!)} placeholder="Nombre" />
                <Input value={p.website ?? ""} onChange={(e) => editar(p.id, { website: e.target.value })} onBlur={() => guardarFila(lista.find((x) => x.id === p.id)!)} placeholder="https://…" />
                <Select value={p.level} onValueChange={(v) => { editar(p.id, { level: v }); guardarFila({ ...p, level: v }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NIVELES.map((n) => <SelectItem key={n.valor} value={n.valor}>{n.texto}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => borrar(p.id)} aria-label="Borrar"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
