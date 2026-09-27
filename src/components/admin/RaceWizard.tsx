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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageCropper } from "./ImageCropper";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Hash,
  Image as ImageIcon,
  Loader2,
  Mountain,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Recorrido {
  nombre: string;
  km: string;
  desnivel: string; // m D+, opcional
  precio: string;
  plazas: string;
  hora: string; // HH:MM, opcional
}

const RECORRIDO_VACIO: Recorrido = { nombre: "", km: "", desnivel: "", precio: "", plazas: "", hora: "" };

type Paso = "origen" | "carrera" | "recorridos" | "cartel" | "resumen" | "creada";

/** Lo que devuelve la función leer-carrera (Claude lee el cartel o el reglamento) */
interface LecturaCarrera {
  carrera?: {
    nombre?: string | null;
    fecha?: string | null;
    localidad?: string | null;
    tipo?: "trail" | "mtb" | null;
    cierre_inscripciones?: string | null;
  };
  recorridos?: {
    nombre?: string | null;
    km?: number | null;
    desnivel?: number | null;
    precio?: number | null;
    plazas?: number | null;
    hora?: string | null;
  }[];
  /** Lo que no se pudo leer o queda en duda, para que el organizador lo mire */
  avisos?: string[];
}

/** Reduce el cartel a 1600 px y lo pasa a base64 (JPEG): de sobra para leerlo y ligero de enviar */
async function imagenABase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo abrir la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  origen: {
    titulo: "¿Cómo empezamos?",
    texto: "Si tienes el cartel o el reglamento, lo leemos y te rellenamos el asistente. Tú revisas y creas.",
  },
  carrera: { titulo: "La carrera", texto: "Lo mínimo que la define. Todo lo demás se puede completar después." },
  recorridos: { titulo: "Los recorridos", texto: "Al menos uno: sin recorrido no hay dónde inscribirse." },
  cartel: { titulo: "El cartel", texto: "Si lo tienes a mano, súbelo ya. Si no, se puede añadir después." },
  resumen: { titulo: "Revisa y crea", texto: "Esto es lo que se va a crear, visible en la web desde ya." },
};

export function RaceWizard({ open, onOpenChange, isOrganizer, onCreated }: Props) {
  const { toast } = useToast();
  const [paso, setPaso] = useState<Paso>("origen");
  const [creando, setCreando] = useState(false);

  const [carrera, setCarrera] = useState({
    name: "",
    date: "",
    location: "",
    race_type: "trail" as "trail" | "mtb",
    // Último día de inscripción (opcional). Se escribe en cada recorrido
    // (registration_closes), que es lo que mira la ficha pública
    cierre: "",
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
  const [idCreado, setIdCreado] = useState<string | null>(null);

  // Lectura del cartel o del reglamento (función leer-carrera, Claude)
  const [leyendo, setLeyendo] = useState(false);
  const [leidoDe, setLeidoDe] = useState<"cartel" | "reglamento" | null>(null);
  const [textoReglamento, setTextoReglamento] = useState("");
  const [avisosLectura, setAvisosLectura] = useState<string[]>([]);

  const reiniciar = () => {
    setPaso("origen");
    setCarrera({ name: "", date: "", location: "", race_type: "trail", cierre: "" });
    setRecorridos([]);
    setActual(RECORRIDO_VACIO);
    setCartelUrl(null);
    setCartelFile(null);
    setSlugCreado(null);
    setIdCreado(null);
    setLeidoDe(null);
    setTextoReglamento("");
    setAvisosLectura([]);
  };

  // ── Paso 0: leer el cartel o el reglamento ──────────────────────────────
  // La función devuelve los datos ya estructurados; aquí solo se vuelcan al
  // asistente y el organizador los revisa paso a paso antes de crear nada
  const aplicarLectura = (datos: LecturaCarrera, fuente: "cartel" | "reglamento") => {
    const c = datos.carrera ?? {};
    setCarrera({
      name: c.nombre ?? "",
      date: c.fecha ?? "",
      location: c.localidad ?? "",
      race_type: c.tipo === "mtb" ? "mtb" : "trail",
      cierre: c.cierre_inscripciones ?? "",
    });
    setRecorridos(
      (datos.recorridos ?? [])
        .filter((r) => r.nombre)
        .map((r) => ({
          nombre: r.nombre ?? "",
          km: r.km != null ? String(r.km) : "",
          desnivel: r.desnivel != null ? String(r.desnivel) : "",
          precio: r.precio != null ? String(r.precio) : "",
          plazas: r.plazas != null ? String(r.plazas) : "",
          hora: r.hora ?? "",
        })),
    );
    setAvisosLectura(datos.avisos ?? []);
    setLeidoDe(fuente);
    setPaso("carrera");
  };

  const leer = async (
    cuerpo: { texto?: string; imagen?: { base64: string; mediaType: string } },
    fuente: "cartel" | "reglamento",
  ) => {
    setLeyendo(true);
    try {
      const { data, error } = await supabase.functions.invoke("leer-carrera", { body: cuerpo });
      if (error) {
        // El error genérico de invoke esconde el motivo; el cuerpo lo trae
        let detalle = error.message;
        try {
          const c = await (error as any).context?.json();
          if (c?.error) detalle = c.error;
        } catch { /* sin cuerpo legible */ }
        throw new Error(detalle);
      }
      if (data?.error) throw new Error(data.error);
      aplicarLectura(data as LecturaCarrera, fuente);
    } catch (e: any) {
      toast({ title: "No se pudo leer", description: e.message, variant: "destructive" });
    } finally {
      setLeyendo(false);
    }
  };

  const elegirCartelParaLeer = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Se guarda por si luego lo quiere también de imagen de la carrera
      setCartelFile(file);
      try {
        const imagen = await imagenABase64(file);
        await leer({ imagen }, "cartel");
      } catch (err: any) {
        toast({ title: "No se pudo abrir la imagen", description: err.message, variant: "destructive" });
      }
    };
    input.click();
  };

  const cerrar = (abierto: boolean) => {
    onOpenChange(abierto);
    if (!abierto) reiniciar();
  };

  // ── Paso 1: la carrera ───────────────────────────────────────────────────
  const carreraCompleta =
    carrera.name.trim() !== "" && carrera.date !== "" && carrera.location.trim() !== "";

  const continuarDesdeCarrera = () => {
    if (carrera.cierre && carrera.cierre > carrera.date) {
      toast({
        title: "El cierre de inscripciones es después de la carrera",
        description: "Pon un día igual o anterior a la fecha de la carrera, o déjalo vacío.",
        variant: "destructive",
      });
      return;
    }
    setPaso("recorridos");
  };

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
        }])
        .select("id, slug")
        .single();

      if (errorCarrera) throw errorCarrera;

      // Los recorridos, uno a uno: si alguno falla se dice cuál, y la carrera
      // ya creada se queda (se puede completar por el camino largo)
      // Recorridos cuya hora no se pudo guardar: la carrera ya existe, así que
      // no se aborta (reintentar la duplicaría); se avisa al final
      const horasSinGuardar: string[] = [];
      for (const r of recorridos) {
        const { data: dist, error: errorDist } = await supabase
          .from("race_distances")
          .insert([{
            race_id: nuevaCarrera.id,
            name: r.nombre.trim(),
            distance_km: parseFloat(r.km),
            elevation_gain: r.desnivel ? parseInt(r.desnivel) : null,
            price: parseFloat(r.precio),
            max_participants: r.plazas ? parseInt(r.plazas) : null,
            // Misma convención que DistanceManagement: la hora tal cual la
            // teclea el organizador, sin huso
            registration_closes: carrera.cierre ? `${carrera.cierre}T23:59:00` : null,
            is_visible: true,
          }])
          .select("id")
          .single();

        if (errorDist) throw new Error(`El recorrido "${r.nombre}" no se pudo crear: ${errorDist.message}`);

        // La salida vive en race_waves (la crea vacía el trigger del insert).
        // Al crear, la prevista y la oficial nacen iguales (fecha de la carrera
        // + hora, hora de pared sin zona); la oficial se ajusta luego en
        // Cronometraje › Horas de Salida o en /start
        if (dist && r.hora) {
          const salida = `${carrera.date}T${r.hora}`;
          const { error: errorWave } = await supabase
            .from("race_waves")
            .update({ hora_prevista: salida, start_time: salida } as never)
            .eq("race_distance_id", dist.id);
          if (errorWave) horasSinGuardar.push(r.nombre);
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
      setIdCreado(nuevaCarrera.id);
      if (horasSinGuardar.length > 0) {
        toast({
          title: "Carrera creada, pero falta alguna hora de salida",
          description: `No se guardó la hora de: ${horasSinGuardar.join(", ")}. Ponla en Recorridos.`,
          variant: "destructive",
        });
      }
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

  const numeroPaso: Record<Exclude<Paso, "creada" | "origen">, number> = { carrera: 1, recorridos: 2, cartel: 3, resumen: 4 };

  // Lo que queda por hacer tras crear, cada cosa con su pantalla. Navegación
  // completa a propósito: el panel lee la carrera seleccionada de localStorage
  // solo al arrancar (useRaceSelection), así la nueva sale ya elegida al llegar.
  const irAlPanel = (view: string) => {
    if (idCreado) {
      localStorage.setItem(isOrganizer ? "organizer_selected_race" : "admin_selected_race", idCreado);
    }
    window.location.assign(isOrganizer ? `/organizer?view=${view}` : `/admin/${view}`);
  };

  const tareasPendientes: { view: string; icon: LucideIcon; titulo: string; texto: string }[] = [
    { view: "distances", icon: Mountain, titulo: "Track GPX de cada recorrido", texto: "Mapa, perfil y vuelo 3D en la ficha" },
    { view: "regulations", icon: FileText, titulo: "Reglamento", texto: "El corredor lo acepta al inscribirse" },
    { view: "form-fields", icon: ClipboardList, titulo: "Formulario de inscripción", texto: "Talla, club y las preguntas propias de la carrera" },
    { view: "categories", icon: Users, titulo: "Categorías", texto: "Por edad y sexo, o de elección" },
    { view: "distances", icon: Hash, titulo: "Tramos de precio y numeración de dorsales", texto: "En la ficha de cada recorrido" },
    ...(cartelUrl ? [] : [{ view: "races", icon: ImageIcon, titulo: "Cartel y fotos", texto: "Imagen principal y portada de la ficha" }]),
  ];

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {paso !== "creada" ? (
          <DialogHeader>
            {paso !== "origen" && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paso {numeroPaso[paso]} de 4
              </p>
            )}
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

        {/* ── Paso 0: de dónde partimos ── */}
        {paso === "origen" && (
          <div className="space-y-3 mt-2">
            {leyendo ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-secondary" />
                <p className="text-sm">Leyendo… unos segundos.</p>
              </div>
            ) : (
              <>
                <button
                  onClick={elegirCartelParaLeer}
                  className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-4 text-left transition-colors hover:border-secondary"
                >
                  <ImageIcon className="h-6 w-6 shrink-0 text-primary" />
                  <span>
                    <span className="block font-medium">Desde el cartel</span>
                    <span className="block text-xs text-muted-foreground">
                      Sube la imagen: leemos nombre, fecha, lugar, recorridos, precios y horas.
                    </span>
                  </span>
                </button>

                <div className="space-y-2 rounded-lg border border-border px-4 py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 shrink-0 text-primary" />
                    <span>
                      <span className="block font-medium">Desde el reglamento</span>
                      <span className="block text-xs text-muted-foreground">
                        Pega el texto del reglamento o de la convocatoria.
                      </span>
                    </span>
                  </div>
                  <Textarea
                    rows={5}
                    placeholder="Artículo 1. El Desafío Sarrio se celebrará el 29 de noviembre de 2026…"
                    value={textoReglamento}
                    onChange={(e) => setTextoReglamento(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={textoReglamento.trim().length < 40}
                    onClick={() => leer({ texto: textoReglamento.trim() }, "reglamento")}
                  >
                    Leer el reglamento
                  </Button>
                </div>

                <div className="flex justify-end pt-1">
                  <Button variant="ghost" onClick={() => setPaso("carrera")} className="gap-2">
                    Rellenar a mano
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Paso 1: la carrera ── */}
        {paso === "carrera" && (
          <div className="space-y-4 mt-2">
            {leidoDe && (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  Leído del {leidoDe}. Revisa cada dato en los pasos siguientes: la lectura puede equivocarse.
                </p>
                {avisosLectura.map((a, i) => (
                  <p key={i} className="text-xs">· {a}</p>
                ))}
              </div>
            )}
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
            <div className="space-y-2">
              <Label htmlFor="wiz-cierre">Inscripciones abiertas hasta</Label>
              <Input
                id="wiz-cierre"
                type="date"
                max={carrera.date || undefined}
                value={carrera.cierre}
                onChange={(e) => setCarrera({ ...carrera, cierre: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Ese día a las 23:59 se cierran. Vacío = hasta el día de la carrera.
              </p>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setPaso("origen")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button onClick={continuarDesdeCarrera} disabled={!carreraCompleta} className="gap-2">
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
                        {r.km} km{r.desnivel ? ` · +${r.desnivel} m` : ""} · {euro(r.precio)}
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
                  <Label htmlFor="wiz-dist-desnivel">Desnivel (m D+)</Label>
                  <Input
                    id="wiz-dist-desnivel"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="850"
                    value={actual.desnivel}
                    onChange={(e) => setActual({ ...actual, desnivel: e.target.value })}
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
                  <Label htmlFor="wiz-dist-hora">Hora de salida prevista</Label>
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
            {!cartelUrl && cartelFile && leidoDe === "cartel" && (
              <Button variant="outline" size="sm" onClick={() => setCropperOpen(true)} disabled={subiendoCartel} className="gap-2">
                <ImageIcon className="h-4 w-4" />
                Usar el cartel que hemos leído
              </Button>
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
                    {r.km} km{r.desnivel ? ` · +${r.desnivel} m` : ""} · {euro(r.precio)}
                    {r.hora ? ` · salida prevista ${r.hora}` : ""}
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
              Lo que falta se completa cuando quieras. Cada punto abre su pantalla con esta carrera ya
              seleccionada:
            </p>
            <div className="space-y-2">
              {tareasPendientes.map((t) => (
                <button
                  key={`${t.view}-${t.titulo}`}
                  onClick={() => irAlPanel(t.view)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-secondary"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <t.icon className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-medium">{t.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{t.texto}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
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
