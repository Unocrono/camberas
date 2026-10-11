/**
 * Panel › Instagram › Historias en directo.
 *
 * Por carrera: encender el directo, qué momentos publica (primero en meta,
 * podio provisional), cuántos minutos espera cada uno sin cambios y, para
 * los recorridos cronometrados con RaceTec, su EID. Vista previa de la
 * historia (sin publicar) y los momentos que lleva detectados el robot, con
 * descartar y reintentar. El robot es la función instagram-directo (cada
 * minuto, pg_cron); la regla completa, en 20261011140000_instagram_directo.sql.
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Radio, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { tablaSinTipos } from "@/eventos/rpc";
import { formatFechaHoraInstante, hoyLocal } from "@/lib/timezoneUtils";
import { fechaLarga, llamarInstagram } from "@/lib/instagram";

interface Carrera {
  id: string;
  name: string;
  date: string;
  group_type: string | null;
}

interface Config {
  race_id: string;
  activo: boolean;
  primero: boolean;
  podio: boolean;
  retraso_min: number;
  racetec_eids: Record<string, string>;
  ultima_pasada?: string | null;
  ultimo_resultado?: { momentos?: number; esperando?: number; publicadas?: number; errores?: string[]; aviso?: string; error?: string } | null;
}

interface Puesto {
  nombre: string;
  tiempo: string;
}

interface Evento {
  clave: string;
  datos: { tipo: "primero" | "podio"; recorrido: string; sexo: number; puestos: Puesto[] };
  estado: "esperando" | "publicada" | "error" | "descartada";
  visto_at: string;
  error: string | null;
  instagram_publicaciones: { permalink: string | null } | null;
}

interface Momento {
  clave: string;
  tipo: "primero" | "podio";
  recorrido: string;
  sexo: number;
  puestos: Puesto[];
}

const SEXO = ["", "masculino", "femenino", "mixto"];
const RETRASOS = [0, 1, 2, 3, 5, 10];
const porDefecto = (race_id: string): Config => ({
  race_id, activo: false, primero: true, podio: true, retraso_min: 3, racetec_eids: {},
});

/** 'YYYY-MM-DD' + n días, aritmética de calendario */
const sumarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const describir = (d: { tipo: string; recorrido: string; sexo: number }) =>
  `${d.recorrido} · ${SEXO[d.sexo] ?? ""} · ${d.tipo === "primero" ? "primero en meta" : "podio provisional"}`;

export function DirectoInstagram() {
  const { toast } = useToast();
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [raceId, setRaceId] = useState<string>("");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [guardadoActivo, setGuardadoActivo] = useState(false);
  const [distancias, setDistancias] = useState<{ id: string; name: string }[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [previa, setPrevia] = useState<{ imagen: string; ejemplo: boolean; momentos: Momento[] } | null>(null);
  const [ocupado, setOcupado] = useState<"" | "guardar" | "previa" | "repasar">("");
  const [confirmar, setConfirmar] = useState(false);

  // Carreras de ayer a dos meses vista (las grupettas no llevan cronometraje)
  useEffect(() => {
    const hoy = hoyLocal();
    supabase
      .from("races")
      .select("id, name, date, group_type")
      .gte("date", sumarDias(hoy, -1))
      .lte("date", sumarDias(hoy, 60))
      .order("date", { ascending: true })
      .limit(100)
      .then(({ data }) => setCarreras(((data ?? []) as Carrera[]).filter((c) => c.group_type !== "grupetta")));
  }, []);

  const cargarEventos = useCallback(async (id: string) => {
    const { data } = await tablaSinTipos("instagram_directo_eventos")
      .select("clave, datos, estado, visto_at, error, instagram_publicaciones(permalink)")
      .eq("race_id", id)
      .order("visto_at", { ascending: false });
    setEventos((data ?? []) as Evento[]);
  }, []);

  useEffect(() => {
    if (!raceId) return;
    setPrevia(null);
    (async () => {
      const [{ data: c }, { data: d }] = await Promise.all([
        tablaSinTipos("instagram_directo").select("*").eq("race_id", raceId).maybeSingle(),
        supabase.from("race_distances").select("id, name").eq("race_id", raceId).order("display_order"),
      ]);
      setCfg((c as Config) ?? porDefecto(raceId));
      setGuardadoActivo(!!(c as Config | null)?.activo);
      setDistancias(d ?? []);
      await cargarEventos(raceId);
    })();
  }, [raceId, cargarEventos]);

  const guardar = async () => {
    if (!cfg) return;
    setConfirmar(false);
    setOcupado("guardar");
    const eids = Object.fromEntries(
      Object.entries(cfg.racetec_eids).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v),
    );
    const { error } = await tablaSinTipos("instagram_directo").upsert({
      race_id: cfg.race_id,
      activo: cfg.activo,
      primero: cfg.primero,
      podio: cfg.podio,
      retraso_min: cfg.retraso_min,
      racetec_eids: eids,
      updated_at: new Date().toISOString(),
    });
    setOcupado("");
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setGuardadoActivo(cfg.activo);
    toast({ title: cfg.activo ? "Directo encendido" : "Guardado", description: cfg.activo ? "El robot lo repasa cada minuto." : undefined });
  };

  const vistaPrevia = async () => {
    setOcupado("previa");
    try {
      setPrevia(await llamarInstagram({ race_id: raceId, vista_previa: true }, "instagram-directo"));
    } catch (e) {
      toast({ title: "No se pudo dibujar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOcupado("");
    }
  };

  const repasar = async () => {
    setOcupado("repasar");
    try {
      const r = await llamarInstagram<{ resumen: Config["ultimo_resultado"] }>({ race_id: raceId }, "instagram-directo");
      const s = r.resumen;
      toast({
        title: `${s?.momentos ?? 0} momentos · ${s?.publicadas ?? 0} publicados · ${s?.esperando ?? 0} esperando`,
        description: s?.aviso ?? (s?.errores?.length ? s.errores.join(" · ") : undefined),
        variant: s?.errores?.length ? "destructive" : undefined,
      });
      await cargarEventos(raceId);
    } catch (e) {
      toast({ title: "No se pudo repasar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOcupado("");
    }
  };

  const cambiarEstado = async (clave: string, estado: "esperando" | "descartada") => {
    const { error } = await tablaSinTipos("instagram_directo_eventos")
      .update({ estado, error: null, visto_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("clave", clave);
    if (error) toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    await cargarEventos(raceId);
  };

  const pulsarGuardar = () => (cfg?.activo && !guardadoActivo ? setConfirmar(true) : guardar());
  const carrera = carreras.find((c) => c.id === raceId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Radio className="h-5 w-5" /> Historias en directo
        </CardTitle>
        <CardDescription>
          El día de la carrera, el cronometraje publica solo en las historias de Camberas «primero en meta» y
          «podio provisional» de cada recorrido y sexo. Cada momento espera unos minutos sin cambios: si corriges
          una lectura o retiras a alguien en ese rato, sale con el dato bueno (o no sale). Solo se publica el día
          de la carrera y el siguiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={raceId} onValueChange={setRaceId}>
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="Elige carrera" />
          </SelectTrigger>
          <SelectContent>
            {carreras.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {fechaLarga(c.date)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {cfg && carrera && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Switch id="directo-activo" checked={cfg.activo} onCheckedChange={(v) => setCfg({ ...cfg, activo: v })} />
              <Label htmlFor="directo-activo">Directo encendido</Label>
              {cfg.ultima_pasada && (
                <span className="text-xs text-muted-foreground">
                  Última pasada del robot: {formatFechaHoraInstante(cfg.ultima_pasada)}
                  {cfg.ultimo_resultado?.aviso && ` · ${cfg.ultimo_resultado.aviso}`}
                  {cfg.ultimo_resultado?.error && ` · ${cfg.ultimo_resultado.error}`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={cfg.primero} onCheckedChange={(v) => setCfg({ ...cfg, primero: v === true })} />
                Primero en meta
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={cfg.podio} onCheckedChange={(v) => setCfg({ ...cfg, podio: v === true })} />
                Podio provisional
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span>Esperar</span>
                <Select value={String(cfg.retraso_min)} onValueChange={(v) => setCfg({ ...cfg, retraso_min: Number(v) })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETRASOS.map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">sin cambios</span>
              </div>
            </div>

            {distancias.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Recorridos cronometrados con RaceTec</p>
                <p className="text-xs text-muted-foreground">
                  Pon el EID solo si ese recorrido se cronometra con RaceTec: sus podios salen entonces de
                  racetec_results. Sin EID, salen de las lecturas de meta de Camberas.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {distancias.map((d) => (
                    <div key={d.id} className="flex items-center gap-2">
                      <Label className="w-40 truncate text-sm" title={d.name}>{d.name}</Label>
                      <Input
                        className="h-8"
                        placeholder="EID"
                        value={cfg.racetec_eids[d.id] ?? ""}
                        onChange={(e) => setCfg({ ...cfg, racetec_eids: { ...cfg.racetec_eids, [d.id]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={pulsarGuardar} disabled={!!ocupado}>
                {ocupado === "guardar" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={vistaPrevia} disabled={!!ocupado}>
                {ocupado === "previa" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
                Vista previa
              </Button>
              <Button variant="outline" onClick={repasar} disabled={!!ocupado || !guardadoActivo}>
                {ocupado === "repasar" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Repasar ahora
              </Button>
            </div>

            {previa && (
              <div className="flex flex-col gap-4 sm:flex-row">
                <img src={previa.imagen} alt="Vista previa de la historia" className="w-full max-w-[270px] rounded-lg border" />
                <div className="text-sm space-y-1">
                  <p className="font-medium">
                    {previa.ejemplo ? "Aún no hay llegadas: la historia lleva datos de ejemplo." : "Así saldría ahora (no se ha publicado nada)."}
                  </p>
                  {previa.momentos.length > 0 && <p className="text-muted-foreground">Momentos que se ven ahora:</p>}
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {previa.momentos.map((m) => (
                      <li key={m.clave}>
                        {describir(m)}: {m.puestos.map((p) => `${p.nombre} (${p.tiempo})`).join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {eventos.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Momentos detectados por el robot</p>
                <ul className="divide-y">
                  {eventos.map((e) => (
                    <li key={e.clave} className="py-2 text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{describir(e.datos)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {e.datos.puestos.map((p) => `${p.nombre} (${p.tiempo})`).join(", ")} · desde {formatFechaHoraInstante(e.visto_at)}
                        </p>
                        {e.error && <p className="text-xs text-destructive break-words">{e.error}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={e.estado === "publicada" ? "default" : e.estado === "error" ? "destructive" : "secondary"}>
                          {e.estado}
                        </Badge>
                        {e.instagram_publicaciones?.permalink && (
                          <a href={e.instagram_publicaciones.permalink} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                            Ver
                          </a>
                        )}
                        {e.estado === "esperando" && (
                          <Button size="sm" variant="ghost" onClick={() => cambiarEstado(e.clave, "descartada")}>
                            Descartar
                          </Button>
                        )}
                        {(e.estado === "error" || e.estado === "descartada") && (
                          <Button size="sm" variant="ghost" onClick={() => cambiarEstado(e.clave, "esperando")}>
                            Reintentar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Encender el directo de {carrera?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Durante la carrera, Camberas publicará historias en su Instagram sin pedir confirmación, cada vez que
              un momento lleve {cfg?.retraso_min ?? 3} min sin cambios. Se puede apagar en cualquier momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={guardar}>Encender</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
