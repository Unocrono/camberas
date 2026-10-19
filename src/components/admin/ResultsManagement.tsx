import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Search, Image as ImageIcon, Pencil, Trash2, FileUp, Download, AlertCircle, CheckCircle2, Calculator, RefreshCw, Play, Clock, Loader2, ChevronDown, ChevronRight, Timer, FileText, Radio, Wifi, WifiOff, MapPin, Square, CheckSquare, MinusSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import jsPDF from "jspdf";
import { getGenderCode } from "@/lib/genderUtils";
import { hoyLocal } from "@/lib/timezoneUtils";

interface RaceResult {
  id: string;
  finish_time: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  status: string;
  // Motor de cronometraje (migración 20261013180000): calculado, chip y
  // correcciones del cronometrador, que el recálculo no toca
  tiempo_calculado?: string | null;
  tiempo_chip?: string | null;
  tiempo_manual?: string | null;
  penalizacion?: string | null;
  estado_manual?: string | null;
  photo_url: string | null;
  notes: string | null;
  race_distance_id: string;
  registration: {
    id: string;
    bib_number: number | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    gender_id: number | null;
    race: { name: string; organizer_id?: string | null; date: string };
    race_distance: { name: string };
    race_category: { short_name: string | null; name: string } | null;
    profiles: { first_name: string | null; last_name: string | null; gender: string | null; gender_id: number | null; birth_date: string | null } | null;
  };
}

interface SplitTime {
  id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: string;
  distance_km: number;
  lap_number: number | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

// Estado del cronometraje automático de un recorrido (RPC cronometraje_estado)
interface EstadoCrono {
  race_distance_id: string;
  recorrido: string;
  automatico: boolean;
  pendiente: boolean;
  calculado_at: string | null;
  duracion_ms: number | null;
  resumen: { finalizados?: number; en_carrera?: number; retirados?: number; corredores?: number; salida?: string } | null;
  avisos: { tipo: string; n: number; texto: string; dorsales?: (string | number)[] }[];
  error: string | null;
  error_at: string | null;
  clasificar_por: "oficial" | "chip";
}

// Orden de la lista: los que terminan (por posición), en carrera, retirados…
const ORDEN_ESTADO: Record<string, number> = { FIN: 0, STD: 1, DNF: 2, CUT: 3, DSQ: 4, DNS: 5, INS: 6 };

// «01:02:30.25» → igual; «1:2:3» → «01:02:03». Centésimas solo si las hay.
const formatTiempo = (t: string | null | undefined): string => {
  if (!t) return "-";
  const m = t.match(/^(-)?(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
  if (!m) return t;
  const cent = m[5] ? m[5].padEnd(2, "0").slice(0, 2) : "";
  return `${m[1] || ""}${m[2].padStart(2, "0")}:${m[3].padStart(2, "0")}:${m[4].padStart(2, "0")}${cent && cent !== "00" ? `.${cent}` : ""}`;
};

// «HH:MM:SS», «HH:MM:SS.cc» o «MM:SS» → intervalo de Postgres; null si no vale
const aIntervalo = (texto: string): string | null => {
  const t = texto.trim();
  let m = t.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$/);
  if (m) return `${+m[1]} hours ${+m[2]} minutes ${+m[3]}${m[4] ? `.${m[4]}` : ""} seconds`;
  m = t.match(/^(\d{1,3}):([0-5]\d)(?:[.,](\d{1,3}))?$/);
  if (m) return `${+m[1]} minutes ${+m[2]}${m[3] ? `.${m[3]}` : ""} seconds`;
  return null;
};

interface ResultsManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

export function ResultsManagement({ isOrganizer = false, selectedRaceId: propSelectedRaceId }: ResultsManagementProps) {
  const { toast } = useToast();
  const [races, setRaces] = useState<any[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("");
  const [results, setResults] = useState<RaceResult[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [estadoCrono, setEstadoCrono] = useState<EstadoCrono | null>(null);
  const [cambiandoAutomatico, setCambiandoAutomatico] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<RaceResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<{ success: number; failed: number; errors: string[] }>({ 
    success: 0, 
    failed: 0, 
    errors: [] 
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [splitTimesCache, setSplitTimesCache] = useState<Record<string, SplitTime[]>>({});
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [lastSplitsCache, setLastSplitsCache] = useState<Record<string, { checkpoint_name: string; split_time: string } | null>>({});
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  
  // Corrección del cronometrador: lo vacío vuelve a lo que salga de las lecturas
  const [formData, setFormData] = useState({
    registration_id: "",
    tiempo_manual: "",
    penalizacion: "",
    estado_manual: "AUTO",
    notes: "",
  });

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    if (propSelectedRaceId) {
      setSelectedRace(propSelectedRaceId);
    } else {
      setSelectedRace("");
    }
  }, [propSelectedRaceId]);

  useEffect(() => {
    if (selectedRace) {
      fetchDistances();
      setSelectedDistance("");
    }
  }, [selectedRace]);

  useEffect(() => {
    if (selectedDistance) {
      fetchResults();
      fetchRegistrations();
    } else {
      setResults([]);
      setRegistrations([]);
    }
  }, [selectedDistance]);

  // En vivo: el motor deja una fila por recorrido en cronometraje_recorridos
  // cada vez que calcula; con eso se recarga la lista (un aviso por cálculo,
  // no uno por corredor)
  useEffect(() => {
    if (!selectedDistance || !realtimeEnabled) return;

    const channel = supabase
      .channel(`cronometraje-${selectedDistance}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cronometraje_recorridos',
          filter: `race_distance_id=eq.${selectedDistance}`
        },
        () => {
          setLastUpdate(new Date());
          fetchResults(true);
          fetchEstadoCrono();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDistance, realtimeEnabled]);

  // Por si el realtime se corta: el estado (pendiente, último cálculo) cada 20 s
  useEffect(() => {
    if (!selectedDistance) {
      setEstadoCrono(null);
      return;
    }
    fetchEstadoCrono();
    const id = setInterval(fetchEstadoCrono, 20000);
    return () => clearInterval(id);
  }, [selectedDistance, selectedRace]);

  const fetchEstadoCrono = async () => {
    if (!selectedRace || !selectedDistance) return;
    const { data, error } = await supabase.rpc("cronometraje_estado" as never, { p_race_id: selectedRace } as never);
    if (error) return; // Sin la migración aplicada el panel sigue funcionando como antes
    const fila = ((data as unknown as EstadoCrono[]) || []).find((e) => e.race_distance_id === selectedDistance) || null;
    setEstadoCrono(fila);
  };

  const fetchRaces = async () => {
    let query = supabase
      .from("races")
      .select("id, name, date, organizer_id")
      .order("date", { ascending: false });
    
    if (isOrganizer) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        query = query.eq("organizer_id", user.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Error cargando carreras", description: error.message, variant: "destructive" });
      return;
    }
    setRaces(data || []);
  };

  const fetchDistances = async () => {
    const { data, error } = await supabase
      .from("race_distances")
      .select("id, name, distance_km")
      .eq("race_id", selectedRace)
      .order("distance_km", { ascending: true });

    if (error) {
      toast({ title: "Error cargando eventos", description: error.message, variant: "destructive" });
      return;
    }
    setDistances(data || []);
  };

  // silencioso: recarga en vivo sin vaciar la tabla («Cargando…» cada 15 s parpadea)
  const fetchResults = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    // PostgREST corta en 1.000 filas: se pide por páginas
    const PAGINA = 1000;
    let data: RaceResult[] = [];
    let error: { message: string } | null = null;
    for (let desde = 0; ; desde += PAGINA) {
      const { data: pagina, error: e } = await supabase
        .from("race_results")
        .select(`
          *,
          registration:registrations (
            id,
            bib_number,
            first_name,
            last_name,
            birth_date,
            gender,
            gender_id,
            race:races (name, organizer_id, date),
            race_distance:race_distances (name),
            race_category:race_categories (short_name, name),
            profiles (first_name, last_name, gender, gender_id, birth_date)
          )
        `)
        .eq("race_distance_id", selectedDistance)
        .order("id")
        .range(desde, desde + PAGINA - 1);
      if (e) { error = e; break; }
      data = data.concat((pagina || []) as unknown as RaceResult[]);
      if (!pagina || pagina.length < PAGINA) break;
    }

    if (error) {
      toast({ title: "Error cargando resultados", description: error.message, variant: "destructive" });
    } else {
      // Los que terminan por posición, luego en carrera y los retirados
      const resultsData = data.sort((a, b) =>
        (ORDEN_ESTADO[a.status] ?? 9) - (ORDEN_ESTADO[b.status] ?? 9)
        || (a.overall_position ?? Infinity) - (b.overall_position ?? Infinity)
        || String(a.finish_time).localeCompare(String(b.finish_time))
        || (a.registration?.bib_number ?? 0) - (b.registration?.bib_number ?? 0));
      setResults(resultsData);
      
      // Último paso de cada uno (por lotes: con varios parciales por corredor se pasa de 1.000 filas)
      if (resultsData.length > 0) {
        const resultIds = resultsData.map((r: any) => r.id);
        const lotes = [];
        for (let i = 0; i < resultIds.length; i += 50) {
          lotes.push(supabase
            .from('split_times')
            .select('race_result_id, checkpoint_name, split_time, checkpoint_order')
            .in('race_result_id', resultIds.slice(i, i + 50))
            .order('checkpoint_order', { ascending: false }));
        }
        const respuestas = await Promise.all(lotes);
        const splitsData = respuestas.flatMap((r) => r.data || []);
        
        if (splitsData) {
          const lastSplits: Record<string, { checkpoint_name: string; split_time: string } | null> = {};
          resultsData.forEach((r: any) => {
            const lastSplit = splitsData.find(s => s.race_result_id === r.id);
            lastSplits[r.id] = lastSplit ? { 
              checkpoint_name: lastSplit.checkpoint_name, 
              split_time: String(lastSplit.split_time || '') 
            } : null;
          });
          setLastSplitsCache(lastSplits);
        }
      }
    }
    setLoading(false);
  };

  const fetchRegistrations = async () => {
    const { data, error } = await supabase
      .from("registrations")
      .select(`
        id,
        bib_number,
        race_distance:race_distances (name),
        profiles (first_name, last_name, gender)
      `)
      .eq("race_distance_id", selectedDistance)
      .eq("status", "confirmed");

    if (error) {
      toast({ title: "Error cargando inscripciones", description: error.message, variant: "destructive" });
    } else {
      setRegistrations(data || []);
    }
  };

  // «Recalcular ahora»: el mismo cálculo que hace el automático
  // (lecturas → pasos por orden, vueltas, tiempo oficial y chip, estados y posiciones)
  const handleRecalcular = async () => {
    if (!selectedDistance) {
      toast({ title: "Selecciona un evento", description: "Debes seleccionar un evento para calcular", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc("cronometrar_recorrido" as never, { p_race_distance_id: selectedDistance } as never);
      if (error) throw error;
      const res = data as unknown as { ok: boolean; error?: string; finalizados?: number; en_carrera?: number; retirados?: number; parciales?: number; avisos?: number };
      if (!res?.ok) {
        toast({ title: "No se ha calculado", description: res?.error || "Error desconocido", variant: "destructive" });
      } else {
        toast({
          title: "Clasificación calculada",
          description: `${res.finalizados ?? 0} finalizados, ${res.en_carrera ?? 0} en carrera, ${res.retirados ?? 0} retirados · ${res.parciales ?? 0} parciales${res.avisos ? ` · ${res.avisos} avisos` : ""}`,
        });
      }
      fetchResults();
      fetchEstadoCrono();
    } catch (error) {
      toast({ title: "Error calculando", description: (error as Error).message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleAutomatico = async (activo: boolean) => {
    if (!selectedDistance) return;
    setCambiandoAutomatico(true);
    const { error } = await supabase.rpc("cronometraje_automatico" as never,
      { p_race_distance_id: selectedDistance, p_activo: activo } as never);
    setCambiandoAutomatico(false);
    if (error) {
      toast({ title: "No se ha podido cambiar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: activo ? "Cronometraje automático encendido" : "Cronometraje automático apagado",
      description: activo
        ? "Cada lectura, retirada o corrección recalcula la clasificación en unos segundos."
        : "La clasificación solo cambia con «Recalcular ahora».",
    });
    fetchEstadoCrono();
  };

  const handleClasificarPor = async (valor: "oficial" | "chip") => {
    if (!selectedDistance) return;
    const { error } = await supabase
      .from("race_distances")
      .update({ clasificar_por: valor } as never)
      .eq("id", selectedDistance);
    if (error) {
      toast({ title: "No se ha podido cambiar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: valor === "chip" ? "Se clasifica por tiempo chip" : "Se clasifica por tiempo oficial" });
    fetchEstadoCrono();
  };

  const handlePhotoUpload = async (registrationId: string): Promise<string | null> => {
    if (!photoFile) return null;

    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${registrationId}-${Date.now()}.${fileExt}`;
    const filePath = `${selectedRace}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('race-photos')
      .upload(filePath, photoFile);

    if (uploadError) {
      console.error("Photo upload error:", uploadError);
      toast({ title: "Error subiendo foto", description: uploadError.message, variant: "destructive" });
      return null;
    }

    const { data } = supabase.storage
      .from('race-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  // Guardar una corrección del cronometrador. Va a tiempo_manual, penalizacion
  // y estado_manual, que el motor respeta siempre; después se recalcula para
  // que se vea ya con sus posiciones.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tiempoManual = formData.tiempo_manual.trim() ? aIntervalo(formData.tiempo_manual) : null;
    if (formData.tiempo_manual.trim() && !tiempoManual) {
      toast({ title: "Tiempo no válido", description: "Usa HH:MM:SS (con centésimas si quieres: 01:02:30.25)", variant: "destructive" });
      return;
    }
    const penalizacion = formData.penalizacion.trim() ? aIntervalo(formData.penalizacion) : null;
    if (formData.penalizacion.trim() && !penalizacion) {
      toast({ title: "Penalización no válida", description: "Usa MM:SS o HH:MM:SS", variant: "destructive" });
      return;
    }
    if (!editingResult && !formData.registration_id) {
      toast({ title: "Elige el participante", variant: "destructive" });
      return;
    }
    const estadoManual = formData.estado_manual === "AUTO" ? null : formData.estado_manual;

    setLoading(true);
    try {
      let photoUrl = editingResult?.photo_url || null;
      if (photoFile) {
        photoUrl = await handlePhotoUpload(formData.registration_id);
      }

      const correccion = {
        tiempo_manual: tiempoManual,
        penalizacion,
        estado_manual: estadoManual,
        photo_url: photoUrl,
        notes: formData.notes || null,
      };

      let error;
      if (editingResult) {
        ({ error } = await supabase
          .from("race_results")
          .update(correccion as never)
          .eq("id", editingResult.id));
      } else {
        // Hasta que calcule el motor, la fila lleva lo que se ha tecleado
        ({ error } = await supabase
          .from("race_results")
          .upsert({
            registration_id: formData.registration_id,
            race_distance_id: selectedDistance,
            finish_time: tiempoManual || "0 seconds",
            status: estadoManual || (tiempoManual ? "FIN" : "INS"),
            ...correccion,
          } as never, { onConflict: "registration_id" }));
      }

      if (error) throw error;

      const { data: calc } = await supabase.rpc("cronometrar_recorrido" as never, { p_race_distance_id: selectedDistance } as never);
      const res = calc as unknown as { ok: boolean; error?: string } | null;
      if (res && !res.ok) {
        toast({
          title: "Corrección guardada, pero sin recalcular",
          description: res.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: editingResult ? "Corrección guardada" : "Resultado añadido",
          description: "La clasificación ya la tiene en cuenta",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchResults();
      fetchEstadoCrono();
    } catch (error: any) {
      toast({ title: "Error guardando resultado", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este resultado?")) return;

    const { error } = await supabase
      .from("race_results")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error eliminando resultado", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Resultado eliminado", description: "El resultado ha sido eliminado" });
      fetchResults();
    }
  };

  const handleEdit = (result: RaceResult) => {
    setEditingResult(result);
    setFormData({
      registration_id: result.registration.id, // Use UUID, not bib_number
      tiempo_manual: result.tiempo_manual ? formatTiempo(result.tiempo_manual) : "",
      penalizacion: result.penalizacion ? formatTiempo(result.penalizacion) : "",
      estado_manual: result.estado_manual || "AUTO",
      notes: result.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      registration_id: "",
      tiempo_manual: "",
      penalizacion: "",
      estado_manual: "AUTO",
      notes: "",
    });
    setPhotoFile(null);
    setEditingResult(null);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      FIN: { variant: "default", label: "Finalizado" },
      STD: { variant: "secondary", label: "En Carrera" },
      DNF: { variant: "destructive", label: "DNF" },
      DNS: { variant: "secondary", label: "DNS" },
      DSQ: { variant: "outline", label: "DSQ" },
      CUT: { variant: "destructive", label: "Fuera Control" },
      INS: { variant: "outline", label: "Inscrito" },
    };
    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Helper function to get runner name
  const getRunnerName = (result: RaceResult) => {
    const firstName = result.registration.first_name || result.registration.profiles?.first_name || '';
    const lastName = result.registration.last_name || result.registration.profiles?.last_name || '';
    return `${firstName} ${lastName}`.trim() || '-';
  };

  // Helper function to get runner gender code (M/F)
  const getRunnerGender = (result: RaceResult) => {
    const genderId = result.registration.gender_id || result.registration.profiles?.gender_id;
    if (genderId) {
      return getGenderCode(genderId);
    }
    // Fallback to text field
    const gender = result.registration.gender || result.registration.profiles?.gender;
    if (gender === 'Masculino' || gender === 'M' || gender === 'Male' || gender === 'Hombre') return 'M';
    if (gender === 'Femenino' || gender === 'F' || gender === 'Female' || gender === 'Mujer') return 'F';
    return '-';
  };

  // Helper function to get runner category short_name
  const getRunnerCategory = (result: RaceResult) => {
    const category = result.registration.race_category;
    if (category) {
      return category.short_name || category.name || '-';
    }
    return '-';
  };

  // Helper function to get last checkpoint info
  const getLastCheckpoint = (resultId: string) => {
    return lastSplitsCache[resultId] || null;
  };

  const filteredResults = results.filter(result => {
    const search = searchTerm.toLowerCase();
    const bibNumber = result.registration.bib_number?.toString() || "";
    const name = getRunnerName(result).toLowerCase();
    
    return bibNumber.includes(search) || name.includes(search);
  });

  // Selection handlers
  const handleSelectResult = (resultId: string, checked: boolean) => {
    const newSelected = new Set(selectedResults);
    if (checked) {
      newSelected.add(resultId);
    } else {
      newSelected.delete(resultId);
    }
    setSelectedResults(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedResults(new Set(filteredResults.map(r => r.id)));
    } else {
      setSelectedResults(new Set());
    }
  };

  const isAllSelected = filteredResults.length > 0 && selectedResults.size === filteredResults.length;
  const isSomeSelected = selectedResults.size > 0 && selectedResults.size < filteredResults.length;

  const handleBulkDelete = async () => {
    if (selectedResults.size === 0) return;
    if (!confirm(`¿Estás seguro de eliminar ${selectedResults.size} resultados seleccionados?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("race_results")
        .delete()
        .in("id", Array.from(selectedResults));

      if (error) throw error;

      toast({ 
        title: "Resultados eliminados", 
        description: `Se han eliminado ${selectedResults.size} resultados` 
      });
      setSelectedResults(new Set());
      fetchResults();
    } catch (error: any) {
      toast({ title: "Error eliminando resultados", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Tipo de archivo inválido",
        description: "Por favor sube un archivo CSV",
        variant: "destructive",
      });
      return;
    }

    setCsvFile(file);
    parseCsvFile(file);
  };

  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: "CSV vacío",
          description: "El archivo CSV debe contener cabeceras y al menos una fila de datos",
          variant: "destructive",
        });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['bib', 'time'];
      
      const hasRequiredHeaders = requiredHeaders.every(req => 
        headers.some(h => h.includes(req))
      );

      if (!hasRequiredHeaders) {
        toast({
          title: "Formato CSV inválido",
          description: "El CSV debe contener al menos las columnas 'bib' y 'time'",
          variant: "destructive",
        });
        return;
      }

      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim());
        const row: any = {};
        
        headers.forEach((header, i) => {
          if (header.includes('bib')) row.bib = values[i];
          else if (header.includes('time') || header.includes('finish')) row.time = values[i];
          else if (header.includes('position') || header.includes('rank') || header.includes('place')) {
            if (header.includes('overall') || header.includes('general')) {
              row.overall_position = values[i];
            } else if (header.includes('category') || header.includes('cat')) {
              row.category_position = values[i];
            } else {
              row.overall_position = values[i];
            }
          }
          else if (header.includes('status')) row.status = values[i];
          else if (header.includes('note')) row.notes = values[i];
        });

        row.lineNumber = index + 2;
        return row;
      });

      setCsvPreview(data);
      setIsCsvDialogOpen(true);
    };

    reader.onerror = () => {
      toast({
        title: "Error leyendo archivo",
        description: "No se pudo leer el archivo CSV",
        variant: "destructive",
      });
    };

    reader.readAsText(file);
  };

  const validateTimeFormat = (timeString: string): string | null => {
    const patterns = [
      /^(\d{1,2}):(\d{2}):(\d{2})$/,
      /^(\d{1,3}):(\d{2})$/,
    ];

    for (const pattern of patterns) {
      const match = timeString.match(pattern);
      if (match) {
        if (match.length === 4) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseInt(match[3]);
          return `${hours} hours ${minutes} minutes ${seconds} seconds`;
        } else if (match.length === 3) {
          const minutes = parseInt(match[1]);
          const seconds = parseInt(match[2]);
          return `0 hours ${minutes} minutes ${seconds} seconds`;
        }
      }
    }

    return null;
  };

  const handleCsvImport = async () => {
    if (csvPreview.length === 0) return;

    setLoading(true);
    setImportProgress(0);
    const newStatus = { success: 0, failed: 0, errors: [] as string[] };

    try {
      for (let i = 0; i < csvPreview.length; i++) {
        const row = csvPreview[i];
        
        try {
          const registration = registrations.find(
            reg => reg.bib_number?.toString() === row.bib?.toString()
          );

          if (!registration) {
            newStatus.failed++;
            newStatus.errors.push(`Línea ${row.lineNumber}: Dorsal #${row.bib} no encontrado en inscripciones`);
            continue;
          }

          const intervalTime = validateTimeFormat(row.time);
          if (!intervalTime) {
            newStatus.failed++;
            newStatus.errors.push(`Línea ${row.lineNumber}: Formato de tiempo inválido '${row.time}'. Usa HH:MM:SS o MM:SS`);
            continue;
          }

          const { data: existingResult } = await supabase
            .from("race_results")
            .select("id")
            .eq("registration_id", registration.id)
            .maybeSingle();

          // Un tiempo importado es una corrección: el motor lo respeta y
          // calcula las posiciones (las del fichero no se usan)
          const estado = row.status?.toUpperCase() || 'FIN';
          const resultData = {
            registration_id: registration.id,
            race_distance_id: selectedDistance,
            finish_time: intervalTime,
            status: estado,
            tiempo_manual: intervalTime,
            estado_manual: estado === 'FIN' ? null : estado,
            notes: row.notes || null,
          };

          let error;
          if (existingResult) {
            ({ error } = await supabase
              .from("race_results")
              .update(resultData as never)
              .eq("id", existingResult.id));
          } else {
            ({ error } = await supabase
              .from("race_results")
              .insert(resultData as never));
          }

          if (error) {
            newStatus.failed++;
            newStatus.errors.push(`Línea ${row.lineNumber}: ${error.message}`);
          } else {
            newStatus.success++;
          }
        } catch (error: any) {
          newStatus.failed++;
          newStatus.errors.push(`Línea ${row.lineNumber}: ${error.message}`);
        }

        setImportProgress(Math.round(((i + 1) / csvPreview.length) * 100));
      }

      setImportStatus(newStatus);

      if (newStatus.success > 0) {
        // Posiciones con los tiempos importados
        const { data: calc } = await supabase.rpc("cronometrar_recorrido" as never, { p_race_distance_id: selectedDistance } as never);
        const res = calc as unknown as { ok: boolean; error?: string } | null;
        toast({
          title: "Importación completada",
          description: `Importados ${newStatus.success} resultados${newStatus.failed > 0 ? `, ${newStatus.failed} fallaron` : ''}`
            + (res && !res.ok ? `. Sin recalcular: ${res.error}` : ''),
        });
        fetchResults();
        fetchEstadoCrono();
      }

      if (newStatus.failed > 0) {
        toast({
          title: "Importación con errores",
          description: `${newStatus.failed} resultados fallaron. Revisa el log de errores.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Importación fallida",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvTemplate = () => {
    const template = `bib,time,overall_position,category_position,status,notes
101,01:30:45,1,1,FIN,
102,01:35:20,2,2,FIN,
103,01:40:15,3,1,FIN,Gran actuación
104,DNF,,,DNF,Lesión en km 15`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_resultados.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const resetCsvImport = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setImportProgress(0);
    setImportStatus({ success: 0, failed: 0, errors: [] });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatTime = (timeString: string | null): string => {
    if (!timeString) return '-';
    const match = timeString.match(/(\d+):(\d+):(\d+)/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${match[3].padStart(2, '0')}`;
    }
    return timeString;
  };

  // Export results to PDF
  const exportToPDF = () => {
    if (results.length === 0) {
      toast({ title: "Sin resultados", description: "No hay resultados para exportar", variant: "destructive" });
      return;
    }

    const doc = new jsPDF();
    const race = races.find(r => r.id === selectedRace);
    const distance = distances.find(d => d.id === selectedDistance);
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(race?.name || "Resultados", pageWidth / 2, yPos, { align: "center" });
    yPos += 8;
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`${distance?.name} - ${distance?.distance_km} km`, pageWidth / 2, yPos, { align: "center" });
    yPos += 6;
    
    doc.setFontSize(10);
    doc.text(`Fecha: ${race?.date ? new Date(race.date).toLocaleDateString('es-ES') : '-'}`, pageWidth / 2, yPos, { align: "center" });
    yPos += 12;

    // General classification
    const finishedResults = results.filter(r => r.status === 'FIN').sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999));
    
    if (finishedResults.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("CLASIFICACIÓN GENERAL", 14, yPos);
      yPos += 6;
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Pos", 14, yPos);
      doc.text("Dorsal", 28, yPos);
      doc.text("Nombre", 45, yPos);
      doc.text("Tiempo", 120, yPos);
      doc.text("Género", 150, yPos);
      doc.text("Pos G", 175, yPos);
      yPos += 5;
      
      doc.setFont("helvetica", "normal");
      finishedResults.forEach((result) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(String(result.overall_position || '-'), 14, yPos);
        doc.text(String(result.registration.bib_number || '-'), 28, yPos);
        doc.text(`${result.registration.profiles?.first_name || ''} ${result.registration.profiles?.last_name || ''}`.substring(0, 35), 45, yPos);
        doc.text(formatTime(result.finish_time), 120, yPos);
        doc.text(result.registration.profiles?.gender === 'Masculino' ? 'M' : result.registration.profiles?.gender === 'Femenino' ? 'F' : '-', 150, yPos);
        doc.text(String(result.gender_position || '-'), 175, yPos);
        yPos += 4;
      });
      yPos += 10;
    }

    // Gender classifications
    ['Masculino', 'Femenino'].forEach((gender) => {
      const genderResults = finishedResults
        .filter(r => r.registration.profiles?.gender === gender)
        .sort((a, b) => (a.gender_position || 999) - (b.gender_position || 999));
      
      if (genderResults.length > 0) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`CLASIFICACIÓN ${gender === 'Masculino' ? 'MASCULINA' : 'FEMENINA'}`, 14, yPos);
        yPos += 6;
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Pos", 14, yPos);
        doc.text("Dorsal", 28, yPos);
        doc.text("Nombre", 45, yPos);
        doc.text("Tiempo", 120, yPos);
        doc.text("Pos Cat", 150, yPos);
        yPos += 5;
        
        doc.setFont("helvetica", "normal");
        genderResults.slice(0, 20).forEach((result) => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(String(result.gender_position || '-'), 14, yPos);
          doc.text(String(result.registration.bib_number || '-'), 28, yPos);
          doc.text(`${result.registration.profiles?.first_name || ''} ${result.registration.profiles?.last_name || ''}`.substring(0, 35), 45, yPos);
          doc.text(formatTime(result.finish_time), 120, yPos);
          doc.text(String(result.category_position || '-'), 150, yPos);
          yPos += 4;
        });
        yPos += 10;
      }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Generado el ${new Date().toLocaleString('es-ES')} - Camberas`, pageWidth / 2, 285, { align: "center" });

    // Save PDF
    const fileName = `resultados_${distance?.name?.replace(/\s+/g, '_') || 'evento'}_${hoyLocal()}.pdf`;
    doc.save(fileName);
    
    toast({ title: "PDF exportado", description: `Archivo ${fileName} descargado` });
  };

  const toggleResultExpanded = async (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
      
      // Fetch split times if not cached
      if (!splitTimesCache[resultId]) {
        const { data, error } = await supabase
          .from('split_times')
          .select('*')
          .eq('race_result_id', resultId)
          .order('checkpoint_order', { ascending: true })
          .order('lap_number', { ascending: true });
        
        if (!error && data) {
          setSplitTimesCache(prev => ({ ...prev, [resultId]: data as SplitTime[] }));
        }
      }
    }
    
    setExpandedResults(newExpanded);
  };

  const SplitTimesRow = ({ resultId }: { resultId: string }) => {
    const splits = splitTimesCache[resultId] || [];
    
    if (splits.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={14} className="bg-muted/30">
            <div className="py-3 text-center text-sm text-muted-foreground">
              <Timer className="h-4 w-4 inline mr-2" />
              No hay tiempos intermedios registrados
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow>
        <TableCell colSpan={14} className="bg-muted/30 p-0">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Tiempos Intermedios</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {splits.map((split) => (
                <div 
                  key={split.id} 
                  className="bg-background rounded-lg p-3 border text-center"
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {split.checkpoint_name}
                    {split.lap_number && split.lap_number > 1 && (
                      <Badge variant="outline" className="ml-1 text-[10px] px-1">
                        Lap {split.lap_number}
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono font-medium">
                    {formatTime(split.split_time)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    KM {split.distance_km}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Resultados por Evento</CardTitle>
          <CardDescription>Calcula, importa y gestiona los resultados de cada evento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Evento</Label>
              <Select 
                value={selectedDistance} 
                onValueChange={setSelectedDistance}
                disabled={!selectedRace}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedRace ? "Selecciona evento" : "Primero selecciona carrera"} />
                </SelectTrigger>
                <SelectContent>
                  {distances.map(distance => (
                    <SelectItem key={distance.id} value={distance.id}>
                      {distance.name} ({distance.distance_km} km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDistance && (
              <div>
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por dorsal o nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}
          </div>

          {selectedDistance && (
            <div className="space-y-4">
              {/* Cronometraje automático del recorrido */}
              {estadoCrono && (
                <Card className={estadoCrono.error ? "border-destructive/50" : "border-primary/20 bg-primary/5"}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="crono-automatico"
                          checked={estadoCrono.automatico}
                          disabled={cambiandoAutomatico}
                          onCheckedChange={handleAutomatico}
                        />
                        <Label htmlFor="crono-automatico" className="font-medium">Cronometraje automático</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">Clasificar por</Label>
                        <Select value={estadoCrono.clasificar_por} onValueChange={(v) => handleClasificarPor(v as "oficial" | "chip")}>
                          <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oficial">Tiempo oficial</SelectItem>
                            <SelectItem value="chip">Tiempo chip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {estadoCrono.calculado_at
                          ? <>Calculado a las {new Date(estadoCrono.calculado_at).toLocaleTimeString('es-ES')}
                              {estadoCrono.resumen && <> · {estadoCrono.resumen.finalizados ?? 0} finalizados, {estadoCrono.resumen.en_carrera ?? 0} en carrera, {estadoCrono.resumen.retirados ?? 0} retirados</>}</>
                          : "Sin calcular todavía"}
                      </div>
                      {estadoCrono.pendiente && (
                        <Badge variant="secondary" className="gap-1">
                          <RefreshCw className={`h-3 w-3 ${estadoCrono.automatico ? "animate-spin" : ""}`} />
                          {estadoCrono.automatico ? "Calculando cambios…" : "Hay cambios sin calcular"}
                        </Badge>
                      )}
                    </div>
                    {!estadoCrono.automatico && (
                      <p className="text-xs text-muted-foreground">
                        Apagado: las lecturas se guardan pero la clasificación solo cambia con «Recalcular ahora».
                        Las carreras que ya pasaron empiezan apagadas para no tocar lo publicado.
                      </p>
                    )}
                    {estadoCrono.error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No se ha podido calcular</AlertTitle>
                        <AlertDescription>{estadoCrono.error}</AlertDescription>
                      </Alert>
                    )}
                    {estadoCrono.avisos.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            {estadoCrono.avisos.length} {estadoCrono.avisos.length === 1 ? "aviso" : "avisos"} para revisar
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-2">
                          {estadoCrono.avisos.map((a) => (
                            <div key={a.tipo} className="rounded-md border bg-background p-2 text-sm">
                              <p className="font-medium">{a.texto}</p>
                              {a.dorsales && a.dorsales.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1 font-mono">
                                  {a.dorsales.map((d) => `#${d}`).join(" · ")}
                                  {a.n > a.dorsales.length && ` … y ${a.n - a.dorsales.length} más`}
                                </p>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={handleRecalcular}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {processing ? "Calculando..." : "Recalcular ahora"}
                </Button>

                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={exportToPDF}
                  disabled={results.length === 0}
                >
                  <FileText className="h-4 w-4" />
                  Exportar PDF
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className={realtimeEnabled ? "text-green-500" : "text-muted-foreground"}
                  onClick={() => setRealtimeEnabled(!realtimeEnabled)}
                  title={realtimeEnabled ? "Tiempo real activado" : "Tiempo real desactivado"}
                >
                  {realtimeEnabled ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </Button>

                {lastUpdate && realtimeEnabled && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                    Actualizado {lastUpdate.toLocaleTimeString('es-ES')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={downloadCsvTemplate}
              >
                <Download className="h-4 w-4" />
                Plantilla CSV
              </Button>

              <Dialog open={isCsvDialogOpen} onOpenChange={(open) => {
                setIsCsvDialogOpen(open);
                if (!open) resetCsvImport();
              }}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="gap-2">
                    <FileUp className="h-4 w-4" />
                    Importar CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Importar Resultados desde CSV</DialogTitle>
                    <DialogDescription>
                      Sube un archivo CSV con los tiempos. Los participantes se asociarán automáticamente por dorsal.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    {csvPreview.length === 0 ? (
                      <div className="space-y-4">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Requisitos del CSV</AlertTitle>
                          <AlertDescription>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                              <li><strong>Columnas requeridas:</strong> bib, time</li>
                              <li><strong>Columnas opcionales:</strong> overall_position, category_position, status, notes</li>
                              <li><strong>Formato tiempo:</strong> HH:MM:SS o MM:SS</li>
                              <li><strong>Valores status:</strong> FIN, DNF, DNS, DSQ, CUT</li>
                            </ul>
                          </AlertDescription>
                        </Alert>

                        <div>
                          <Label>Subir archivo CSV</Label>
                          <Input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleCsvUpload}
                            className="mt-2"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {importProgress > 0 && importProgress < 100 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Importando resultados...</span>
                              <span>{importProgress}%</span>
                            </div>
                            <Progress value={importProgress} />
                          </div>
                        )}

                        {importProgress === 100 && (
                          <Alert variant={importStatus.failed > 0 ? "destructive" : "default"}>
                            {importStatus.failed > 0 ? (
                              <AlertCircle className="h-4 w-4" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            <AlertTitle>Resumen de Importación</AlertTitle>
                            <AlertDescription>
                              <p>Importados correctamente: {importStatus.success}</p>
                              {importStatus.failed > 0 && (
                                <>
                                  <p className="text-destructive">Fallaron: {importStatus.failed}</p>
                                  <details className="mt-2">
                                    <summary className="cursor-pointer font-medium">Ver Errores</summary>
                                    <ul className="list-disc list-inside mt-2 text-xs space-y-1 max-h-40 overflow-y-auto">
                                      {importStatus.errors.map((error, i) => (
                                        <li key={i}>{error}</li>
                                      ))}
                                    </ul>
                                  </details>
                                </>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}

                        <div>
                          <Label>Vista previa ({csvPreview.length} filas)</Label>
                          <div className="border rounded-md mt-2 max-h-96 overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Línea</TableHead>
                                  <TableHead>Dorsal</TableHead>
                                  <TableHead>Tiempo</TableHead>
                                  <TableHead>Pos General</TableHead>
                                  <TableHead>Pos Cat</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Notas</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {csvPreview.slice(0, 50).map((row, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs text-muted-foreground">{row.lineNumber}</TableCell>
                                    <TableCell>{row.bib}</TableCell>
                                    <TableCell className="font-mono">{row.time}</TableCell>
                                    <TableCell>{row.overall_position || '-'}</TableCell>
                                    <TableCell>{row.category_position || '-'}</TableCell>
                                    <TableCell>{row.status || 'FIN'}</TableCell>
                                    <TableCell className="text-xs">{row.notes || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {csvPreview.length > 50 && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Mostrando primeras 50 de {csvPreview.length} filas
                            </p>
                          )}
                        </div>

                        <div className="flex justify-end gap-3">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setIsCsvDialogOpen(false);
                              resetCsvImport();
                            }}
                            disabled={loading}
                          >
                            Cancelar
                          </Button>
                          <Button 
                            type="button"
                            onClick={handleCsvImport}
                            disabled={loading || importProgress === 100}
                          >
                            {loading ? "Importando..." : "Importar Resultados"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Añadir Resultado
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingResult ? "Editar" : "Añadir"} Resultado</DialogTitle>
                    <DialogDescription>
                      Corrige tiempo, penalización o estado y sube la foto. Las posiciones las calcula el cronometraje.
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Participante</Label>
                        <Select
                          value={formData.registration_id}
                          onValueChange={(value) => setFormData({ ...formData, registration_id: value })}
                          disabled={!!editingResult}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona participante" />
                          </SelectTrigger>
                          <SelectContent>
                            {registrations.map(reg => (
                              <SelectItem key={reg.id} value={reg.id}>
                                #{reg.bib_number} - {reg.profiles?.first_name} {reg.profiles?.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {editingResult && (
                        <div className="md:col-span-2 rounded-md bg-muted/50 p-3 text-sm space-y-1">
                          <p>
                            <span className="text-muted-foreground">Según las lecturas:</span>{" "}
                            <span className="font-mono">{formatTiempo(editingResult.tiempo_calculado)}</span>
                            {editingResult.tiempo_chip && (
                              <> <span className="text-muted-foreground">· chip</span> <span className="font-mono">{formatTiempo(editingResult.tiempo_chip)}</span></>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Lo que pongas aquí manda sobre las lecturas y el recálculo no lo toca. Déjalo vacío para volver a lo calculado.
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Tiempo oficial corregido</Label>
                        <Input
                          placeholder="HH:MM:SS (vacío: el de las lecturas)"
                          value={formData.tiempo_manual}
                          onChange={(e) => setFormData({ ...formData, tiempo_manual: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Penalización</Label>
                        <Input
                          placeholder="MM:SS (se suma al tiempo)"
                          value={formData.penalizacion}
                          onChange={(e) => setFormData({ ...formData, penalizacion: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select
                          value={formData.estado_manual}
                          onValueChange={(value) => setFormData({ ...formData, estado_manual: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AUTO">Automático (según lecturas y retiradas)</SelectItem>
                            <SelectItem value="FIN">Finalizado</SelectItem>
                            <SelectItem value="DNF">DNF (Abandono)</SelectItem>
                            <SelectItem value="DNS">DNS (No sale)</SelectItem>
                            <SelectItem value="DSQ">DSQ (Descalificado)</SelectItem>
                            <SelectItem value="CUT">Fuera de control</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Subir Foto</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notas</Label>
                      <Textarea
                        placeholder="Notas adicionales..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                      }}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={loading}>
                        {loading ? "Guardando..." : editingResult ? "Actualizar" : "Añadir"} Resultado
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDistance && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Resultados ({filteredResults.length})
                {realtimeEnabled && (
                  <Badge variant="outline" className="text-green-500 border-green-500 gap-1">
                    <Radio className="h-3 w-3 animate-pulse" />
                    En vivo
                  </Badge>
                )}
                {selectedResults.size > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    {selectedResults.size} seleccionados
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {distances.find(d => d.id === selectedDistance)?.name} - {distances.find(d => d.id === selectedDistance)?.distance_km} km
              </CardDescription>
            </div>
            {selectedResults.size > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedResults(new Set())}
                >
                  Deseleccionar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar ({selectedResults.size})
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Cargando resultados...</p>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No hay resultados para este evento</p>
                <Button onClick={handleRecalcular} disabled={processing}>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular desde Lecturas
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={(checked) => handleSelectAll(checked === true)}
                          aria-label="Seleccionar todos"
                          className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                        />
                      </TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead className="w-16">Dorsal</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-16">Pos G</TableHead>
                      <TableHead>Género</TableHead>
                      <TableHead className="w-16">Pos C</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Último Paso</TableHead>
                      <TableHead>Tiempo</TableHead>
                      <TableHead title="Desde que pisa la alfombra de salida">Chip</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-20">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => {
                      const lastCheckpoint = getLastCheckpoint(result.id);
                      const isSelected = selectedResults.has(result.id);
                      return (
                      <>
                        <TableRow 
                          key={result.id} 
                          className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                        >
                          <TableCell className="p-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectResult(result.id, checked === true)}
                              aria-label={`Seleccionar resultado ${result.registration.bib_number}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell className="p-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleResultExpanded(result.id)}
                            >
                              {expandedResults.has(result.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            {result.status === 'FIN' ? result.overall_position || '-' : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">#{result.registration.bib_number}</Badge>
                          </TableCell>
                          <TableCell>
                            {getRunnerName(result)}
                          </TableCell>
                          <TableCell>{result.gender_position || '-'}</TableCell>
                          <TableCell>
                            {getRunnerGender(result)}
                          </TableCell>
                          <TableCell>{result.category_position || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getRunnerCategory(result)}</Badge>
                          </TableCell>
                          <TableCell>
                            {lastCheckpoint ? (
                              <div className="flex items-center gap-1 text-sm">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-24" title={lastCheckpoint.checkpoint_name}>
                                  {lastCheckpoint.checkpoint_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            {formatTiempo(result.finish_time)}
                            {result.penalizacion && (
                              <span className="ml-1 text-xs text-destructive" title="Penalización">+{formatTiempo(result.penalizacion)}</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                            {formatTiempo(result.tiempo_chip)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getStatusBadge(result.status)}
                              {(result.tiempo_manual || result.estado_manual || result.penalizacion) && (
                                <span title="Corregido a mano: el recálculo lo respeta">
                                  <Pencil className="h-3 w-3 text-amber-500" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); handleEdit(result); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); handleDelete(result.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedResults.has(result.id) && (
                          <SplitTimesRow resultId={result.id} />
                        )}
                      </>
                    );})}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
