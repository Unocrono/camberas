/**
 * Asistente de creación de carrera — el camino corto.
 *
 * El formulario clásico de RaceManagement pide 18 campos de golpe y después
 * hay que descubrir solo que los recorridos se crean en otra pantalla; hasta
 * entonces la carrera no puede recibir ni una inscripción. Este asistente
 * recorre el camino mínimo en cuatro pasos: la carrera (nombre, fecha,
 * localidad, tipo), su primer recorrido (y los que quiera), el cartel si lo
 * tiene a mano, y un resumen. Al terminar existe una carrera VISIBLE con
 * recorridos inscribibles.
 *
 * No inventa convenciones: escribe lo mismo que escribirían RaceManagement y
 * DistanceManagement por el camino largo — el slug lo genera el trigger de la
 * BD, el huso se calcula de la fecha, la oleada la crea el trigger de
 * race_distances y la hora de salida se escribe después en race_waves, que es
 * la fuente de verdad. Todo lo demás (GPX, tramos de precio, dorsales,
 * formulario) se completa luego en las pantallas de siempre.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateUtcOffsetFromDateString } from "@/lib/timezoneUtils";
import { ImageCropper } from "./ImageCropper";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Mountain,
  Plus,
  Trash2,
} from "lucide-react";

interface Recorrido {
  nombre: string;
  km: string;
  precio: string;
  plazas: string;
  hora: string; // HH:MM, opcional
}

const RECORRIDO_VACIO: Recorrido = { nombre: "", km: "", precio: "", plazas: "", hora: "" };

type Paso = "carrera" | "recorridos" | "cartel" | "resumen" | "creada";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOrganizer: boolean;
  /** Para que la lista de carreras del panel se refresque al terminar */
  onCreated: () => void;
}

// Misma convención de rutas de Storage que RaceManagement: año/carrera-año/fichero
const normalizarParaFichero = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

const rutaStorage = (nombre: string, fecha: string): string => {
  const year = new Date(fecha).getFullYear();
  const carpeta = `${normalizarParaFichero(nombre)}-${year}`;
  return `${year}/${carpeta}/${normalizarParaFichero(nombre)}-${year}_race.jpg`;
};

const TITULOS: Record<Exclude<Paso, "creada">, { titulo: string; texto: string }> = {
  carrera: { titulo: "La carrera", texto: "Lo mínimo que la define. Todo lo demás se puede completar después." },
  recorridos: { titulo: "Los recorridos", texto: "Al menos uno: sin recorrido no hay dónde inscribirse." },
  cartel: { titulo: "El cartel", texto: "Si lo tienes a mano, súbelo ya. Si no, se puede añadir después." },
  resumen: { titulo: "Revisa y crea", texto: "Esto es lo que se va a crear, visible en la web desde ya." },
};

export function RaceWizard({ open, onOpenChange, isOrganizer, onCreated }: Props) {
  const { toast } = useToast();
  const [paso, setPaso] = useState<Paso>("carrera");
  const [creando, setCreando] = useState(false);

  const [carrera, setCarrera] = useState({
    name: "",
    date: "",
    location: "",
    race_type: "trail" as "trail" | "mtb",
  });
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [actual, setActual] = useState<Recorrido>(RECORRIDO_VACIO);

  // Cartel: se sube al recortar (necesita nombre y fecha, no el id) y la URL
  // se engancha a la carrera en el insert final
  const [cartelUrl, setCartelUrl] = useState<string | null>(null);
  const [cartelFile, setCartelFile] = useState<File | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [subiendoCartel, setSubiendoCartel] = useState(false);

  // Al terminar: adónde ir
  const [slugCreado, setSlugCreado] = useState<string | null>(null);

  const reiniciar = () => {
    setPaso("carrera");
    setCarrera({ name: "", date: "", location: "", race_type: "trail" });
    setRecorridos([]);
    setActual(RECORRIDO_VACIO);
    setCartelUrl(null);
    setCartelFile(null);
    setSlugCreado(null);
  };

  const cerrar = (abierto: boolean) => {
    onOpenChange(abierto);
    if (!abierto) reiniciar();
  };

  // ── Paso 1: la carrera ───────────────────────────────────────────────────
  const carreraCompleta =
    carrera.name.trim() !== "" && carrera.date !== "" && carrera.location.trim() !== "";

  // ── Paso 2: recorridos ───────────────────────────────────────────────────
  const actualEnBlanco = actual.nombre.trim() === "" && actual.km === "" && actual.precio === "";
  const actualCompleto =
    actual.nombre.trim() !== "" && actual.km !== "" && !isNaN(parseFloat(actual.km)) && actual.precio !== "" && !isNaN(parseFloat(actual.precio));

  const anadirRecorrido = () => {
    if (!actualCompleto) {
      toast({
        title: "Faltan datos del recorrido",
        description: "Nombre, kilómetros y precio (0 si es gratis).",
        variant: "destructive",
      });
      return false;
    }
    setRecorridos((r) => [...r, actual]);
    setActual(RECORRIDO_VACIO);
    return true;
  };

  const continuarDesdeRecorridos = () => {
    // Lo que haya en el formulario cuenta: nadie debería perder un recorrido
    // por no pulsar "Añadir" antes de "Continuar"
    if (!actualEnBlanco) {
      if (!anadirRecorrido()) return;
    }
    if (recorridos.length === 0 && actualEnBlanco) {
      toast({
        title: "Hace falta al menos un recorrido",
        description: "Sin recorrido no hay dónde inscribirse.",
        variant: "destructive",
      });
      return;
    }
    setPaso("cartel");
  };

  // ── Paso 3: cartel ───────────────────────────────────────────────────────
  const elegirCartel = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setCartelFile(file);
        setCropperOpen(true);
      }
    };
    input.click();
  };

  const subirCartel = async (blob: Blob) => {
    setSubiendoCartel(true);
    try {
      const ruta = rutaStorage(carrera.name, carrera.date);
      const { error } = await supabase.storage
        .from("race-images")
        .upload(ruta, blob, { cacheControl: "3600", upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("race-images").getPublicUrl(ruta);
      setCartelUrl(publicUrl);
      toast({ title: "Cartel subido" });
    } catch (error: any) {
      toast({ title: "Error al subir el cartel", description: error.message, variant: "destructive" });
    } finally {
      setSubiendoCartel(false);
    }
  };

  // ── Paso 4: crear de verdad ──────────────────────────────────────────────
  const crear = async () => {
    setCreando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: nuevaCarrera, error: errorCarrera } = await supabase
        .from("races")
        .insert([{
          name: carrera.name.trim(),
          location: carrera.location.trim(),
          date: carrera.date,
          race_type: carrera.race_type,
          image_url: cartelUrl,
          is_visible: true,
          organizer_id: isOrganizer ? user?.id : null,
          utc_offset: calculateUtcOffsetFromDateString(carrera.date),
        }])
        .select("id, slug")
        .single();

      if (errorCarrera) throw errorCarrera;

      // Los recorridos, uno a uno: si alguno falla se dice cuál, y la carrera
      // ya creada se queda (se puede completar por el camino largo)
      for (const r of recorridos) {
        const { data: dist, error: errorDist } = await supabase
          .from("race_distances")
          .insert([{
            race_id: nuevaCarrera.id,
            name: r.nombre.trim(),
            distance_km: parseFloat(r.km),
            price: parseFloat(r.precio),
            max_participants: r.plazas ? parseInt(r.plazas) : null,
            is_visible: true,
          }])
          .select("id")
          .single();

        if (errorDist) throw new Error(`El recorrido "${r.nombre}" no se pudo crear: ${errorDist.message}`);

        // La hora de salida vive en race_waves (la crea el trigger del insert);
        // misma convención que DistanceManagement: fecha de la carrera + hora
        if (dist && r.hora) {
          const { error: errorWave } = await supabase
            .from("race_waves")
            .update({ start_time: `${carrera.date}T${r.hora}` })
            .eq("race_distance_id", dist.id);
          if (errorWave) console.error("Error al poner la hora de salida:", errorWave);
        }
      }

      // El mismo aviso al equipo que manda el formulario clásico
      if (isOrganizer && user) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .single();
          await supabase.functions.invoke("send-race-created-notification", {
            body: {
              raceName: carrera.name.trim(),
              raceDate: carrera.date,
              raceLocation: carrera.location.trim(),
              raceType: carrera.race_type,
              organizerName: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "",
              organizerEmail: user.email || "",
              raceId: nuevaCarrera.id,
            },
          });
        } catch (e) {
          console.error("Error enviando el aviso de carrera creada:", e);
        }
      }

      setSlugCreado(nuevaCarrera.slug);
      setPaso("creada");
      onCreated();
    } catch (error: any) {
      toast({ title: "No se pudo crear", description: error.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const euro = (v: string) => {
    const n = parseFloat(v);
    return n === 0 ? "Gratis" : `${n.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`;
  };

  const numeroPaso: Record<Exclude<Paso, "creada">, number> = { carrera: 1, recorridos: 2, cartel: 3, resumen: 4 };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {paso !== "creada" ? (
          <DialogHeader>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Paso {numeroPaso[paso]} de 4
            </p>
            <DialogTitle>{TITULOS[paso].titulo}</DialogTitle>
            <DialogDescription>{TITULOS[paso].texto}</DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              Carrera creada
            </DialogTitle>
            <DialogDescription>Ya está visible en la web y lista para recibir inscripciones.</DialogDescription>
          </DialogHeader>
        )}

        {/* ── Paso 1: la carrera ── */}
        {paso === "carrera" && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="wiz-name">Nombre de la carrera *</Label>
              <Input
                id="wiz-name"
                placeholder="Trail Peña Cabarga 2027"
                value={carrera.name}
                onChange={(e) => setCarrera({ ...carrera, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wiz-date">Fecha *</Label>
                <Input
                  id="wiz-date"
                  type="date"
                  value={carrera.date}
                  onChange={(e) => setCarrera({ ...carrera, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={carrera.race_type}
                  onValueChange={(v: "trail" | "mtb") => setCarrera({ ...carrera, race_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trail">Trail / Montaña</SelectItem>
                    <SelectItem value="mtb">MTB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-location">Localidad *</Label>
              <Input
                id="wiz-location"
                placeholder="Medio Cudeyo, Cantabria"
                value={carrera.location}
                onChange={(e) => setCarrera({ ...carrera, location: e.target.value })}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setPaso("recorridos")} disabled={!carreraCompleta} className="gap-2">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 2: recorridos ── */}
        {paso === "recorridos" && (
          <div className="space-y-4 mt-2">
            {recorridos.length > 0 && (
              <div className="space-y-2">
                {recorridos.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Mountain className="h-4 w-4 text-secondary shrink-0" />
                      <span className="truncate font-medium">{r.nombre}</span>
                      <span className="text-muted-foreground shrink-0">
                        {r.km} km · {euro(r.precio)}
                        {r.hora ? ` · ${r.hora}` : ""}
                      </span>
                    </span>
                    <button
                      onClick={() => setRecorridos(recorridos.filter((_, j) => j !== i))}
                      title="Quitar"
                      className="shrink-0 ml-2"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="wiz-dist-name">Nombre del recorrido *</Label>
                <Input
                  id="wiz-dist-name"
                  placeholder="Trail 21K"
                  value={actual.nombre}
                  onChange={(e) => setActual({ ...actual, nombre: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="wiz-dist-km">Kilómetros *</Label>
                  <Input
                    id="wiz-dist-km"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="21"
                    value={actual.km}
                    onChange={(e) => setActual({ ...actual, km: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wiz-dist-price">Precio (€) *</Label>
                  <Input
                    id="wiz-dist-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0 si es gratis"
                    value={actual.precio}
                    onChange={(e) => setActual({ ...actual, precio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wiz-dist-hora">Hora de salida</Label>
                  <Input
                    id="wiz-dist-hora"
                    type="time"
                    value={actual.hora}
                    onChange={(e) => setActual({ ...actual, hora: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wiz-dist-plazas">Plazas (vacío = sin tope)</Label>
                  <Input
                    id="wiz-dist-plazas"
                    type="number"
                    min="1"
                    value={actual.plazas}
                    onChange={(e) => setActual({ ...actual, plazas: e.target.value })}
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={anadirRecorrido} className="gap-2 w-full">
                <Plus className="h-4 w-4" />
                Añadir otro recorrido
              </Button>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setPaso("carrera")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button onClick={continuarDesdeRecorridos} className="gap-2">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 3: cartel (opcional) ── */}
        {paso === "cartel" && (
          <div className="space-y-4 mt-2">
            {cartelUrl ? (
              <img src={cartelUrl} alt="Cartel de la carrera" className="w-full rounded-lg border border-border" />
            ) : (
              <button
                onClick={elegirCartel}
                disabled={subiendoCartel}
                className="w-full rounded-lg border border-dashed border-border py-10 flex flex-col items-center gap-2 text-muted-foreground hover:bg-muted/40"
              >
                {subiendoCartel ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImageIcon className="h-8 w-8" />}
                <span className="text-sm">{subiendoCartel ? "Subiendo…" : "Elegir imagen"}</span>
              </button>
            )}
            {cartelUrl && (
              <Button variant="outline" size="sm" onClick={elegirCartel} disabled={subiendoCartel}>
                Cambiar imagen
              </Button>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setPaso("recorridos")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button onClick={() => setPaso("resumen")} className="gap-2">
                {cartelUrl ? "Continuar" : "Saltar este paso"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 4: resumen ── */}
        {paso === "resumen" && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-muted/40 p-4 space-y-1 text-sm">
              <p className="font-semibold text-base">{carrera.name}</p>
              <p className="text-muted-foreground">
                {new Date(carrera.date + "T12:00:00").toLocaleDateString("es-ES", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </p>
              <p className="text-muted-foreground">
                {carrera.location} · {carrera.race_type === "trail" ? "Trail / Montaña" : "MTB"}
                {cartelUrl ? " · con cartel" : " · sin cartel (se puede subir después)"}
              </p>
            </div>
            <div className="space-y-2">
              {recorridos.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{r.nombre}</span>
                  <span className="text-muted-foreground">
                    {r.km} km · {euro(r.precio)}
                    {r.hora ? ` · salida ${r.hora}` : ""}
                    {r.plazas ? ` · ${r.plazas} plazas` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setPaso("cartel")} disabled={creando} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button onClick={crear} disabled={creando} className="gap-2">
                {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Crear la carrera
              </Button>
            </div>
          </div>
        )}

        {/* ── Final: creada ── */}
        {paso === "creada" && (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Cuando quieras, desde el panel puedes completar lo que falta: cartel y fotos, el track
              GPX de cada recorrido, tramos de precio, dorsales y el formulario de inscripción.
            </p>
            {slugCreado && (
              <Button asChild className="w-full gap-2">
                <a href={`/${slugCreado}`} target="_blank" rel="noopener noreferrer">
                  Ver la ficha pública
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => cerrar(false)}>
              Cerrar
            </Button>
          </div>
        )}

        <ImageCropper
          open={cropperOpen}
          onClose={() => setCropperOpen(false)}
          onCropComplete={(blob) => subirCartel(blob)}
          imageFile={cartelFile}
          imageType="race"
        />
      </DialogContent>
    </Dialog>
  );
}
