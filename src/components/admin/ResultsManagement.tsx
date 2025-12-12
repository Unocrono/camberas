import { useState, useEffect, useRef } from "react";
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
import { Upload, Plus, Search, Image as ImageIcon, Pencil, Trash2, FileUp, Download, AlertCircle, CheckCircle2, Calculator, RefreshCw, Play, Clock, Trophy, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface RaceResult {
  id: string;
  finish_time: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
  race_distance_id: string;
  registration: {
    bib_number: number | null;
    race: { name: string; organizer_id?: string | null };
    race_distance: { name: string };
    profiles: { first_name: string | null; last_name: string | null; gender: string | null } | null;
  };
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

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
  const [calculating, setCalculating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<{
    step: 'idle' | 'splits' | 'results' | 'done';
    message: string;
    splitCount?: number;
    resultCount?: number;
  }>({ step: 'idle', message: '' });
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
  
  const [formData, setFormData] = useState({
    registration_id: "",
    finish_time: "",
    overall_position: "",
    category_position: "",
    status: "FIN",
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

  const fetchResults = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_results")
      .select(`
        *,
        registration:registrations (
          bib_number,
          race:races (name, organizer_id),
          race_distance:race_distances (name),
          profiles (first_name, last_name, gender)
        )
      `)
      .eq("race_distance_id", selectedDistance)
      .order("status", { ascending: true })
      .order("overall_position", { ascending: true, nullsFirst: false })
      .order("finish_time", { ascending: true });

    if (error) {
      toast({ title: "Error cargando resultados", description: error.message, variant: "destructive" });
    } else {
      setResults(data as any || []);
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

  const handleProcessTimesAndResults = async () => {
    if (!selectedDistance) {
      toast({ title: "Selecciona un evento", description: "Debes seleccionar un evento para procesar", variant: "destructive" });
      return;
    }

    setProcessing(true);
    setProcessProgress({ step: 'splits', message: 'Generando split times desde lecturas...' });

    try {
      // Step 1: Generate split times from timing_readings
      const { data: splitData, error: splitError } = await supabase.rpc('generate_split_times', {
        p_race_distance_id: selectedDistance
      });

      if (splitError) throw splitError;

      const splitResult = splitData?.[0];
      setProcessProgress({ 
        step: 'results', 
        message: 'Calculando clasificaciones y resultados...',
        splitCount: (splitResult?.inserted_count || 0) + (splitResult?.updated_count || 0)
      });

      // Step 2: Process event results (calculate positions)
      const { data: resultData, error: resultError } = await supabase.rpc('process_event_results', {
        p_race_distance_id: selectedDistance
      });

      if (resultError) throw resultError;

      const result = resultData?.[0];
      setProcessProgress({ 
        step: 'done', 
        message: 'Procesamiento completado',
        splitCount: (splitResult?.inserted_count || 0) + (splitResult?.updated_count || 0),
        resultCount: result?.processed_count || 0
      });

      toast({
        title: "Procesamiento completado",
        description: `Splits: ${(splitResult?.inserted_count || 0) + (splitResult?.updated_count || 0)} | Resultados: ${result?.processed_count || 0} (${result?.finished_count || 0} finalizados, ${result?.in_progress_count || 0} en carrera)`,
      });

      fetchResults();
    } catch (error: any) {
      setProcessProgress({ step: 'idle', message: '' });
      toast({ title: "Error en procesamiento", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      // Reset progress after 3 seconds
      setTimeout(() => {
        setProcessProgress({ step: 'idle', message: '' });
      }, 3000);
    }
  };

  const handleCalculateResults = async () => {
    if (!selectedDistance) {
      toast({ title: "Selecciona un evento", description: "Debes seleccionar un evento para calcular resultados", variant: "destructive" });
      return;
    }

    setCalculating(true);
    try {
      const { data, error } = await supabase.rpc('process_event_results', {
        p_race_distance_id: selectedDistance
      });

      if (error) throw error;

      const result = data?.[0];
      toast({
        title: "Resultados calculados",
        description: `Procesados: ${result?.processed_count || 0}, Finalizados: ${result?.finished_count || 0}, En carrera: ${result?.in_progress_count || 0}`,
      });

      fetchResults();
    } catch (error: any) {
      toast({ title: "Error calculando resultados", description: error.message, variant: "destructive" });
    } finally {
      setCalculating(false);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const timeParts = formData.finish_time.split(':');
      const hours = parseInt(timeParts[0] || '0');
      const minutes = parseInt(timeParts[1] || '0');
      const seconds = parseInt(timeParts[2] || '0');
      const intervalString = `${hours} hours ${minutes} minutes ${seconds} seconds`;

      let photoUrl = editingResult?.photo_url || null;
      if (photoFile) {
        photoUrl = await handlePhotoUpload(formData.registration_id);
      }

      const resultData = {
        registration_id: formData.registration_id,
        race_distance_id: selectedDistance,
        finish_time: intervalString,
        overall_position: formData.overall_position ? parseInt(formData.overall_position) : null,
        category_position: formData.category_position ? parseInt(formData.category_position) : null,
        status: formData.status,
        photo_url: photoUrl,
        notes: formData.notes || null,
      };

      let error;
      if (editingResult) {
        ({ error } = await supabase
          .from("race_results")
          .update(resultData)
          .eq("id", editingResult.id));
      } else {
        ({ error } = await supabase
          .from("race_results")
          .insert(resultData));
      }

      if (error) throw error;

      toast({
        title: editingResult ? "Resultado actualizado" : "Resultado añadido",
        description: "El resultado se ha guardado correctamente",
      });

      setIsDialogOpen(false);
      resetForm();
      fetchResults();
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
    
    const timeMatch = result.finish_time.match(/(\d+):(\d+):(\d+)/);
    const timeString = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : "";

    setFormData({
      registration_id: result.registration.bib_number?.toString() || "",
      finish_time: timeString,
      overall_position: result.overall_position?.toString() || "",
      category_position: result.category_position?.toString() || "",
      status: result.status,
      notes: result.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      registration_id: "",
      finish_time: "",
      overall_position: "",
      category_position: "",
      status: "FIN",
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

  const filteredResults = results.filter(result => {
    const search = searchTerm.toLowerCase();
    const bibNumber = result.registration.bib_number?.toString() || "";
    const firstName = result.registration.profiles?.first_name?.toLowerCase() || "";
    const lastName = result.registration.profiles?.last_name?.toLowerCase() || "";
    
    return bibNumber.includes(search) || 
           firstName.includes(search) || 
           lastName.includes(search);
  });

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

          const resultData = {
            registration_id: registration.id,
            race_distance_id: selectedDistance,
            finish_time: intervalTime,
            overall_position: row.overall_position ? parseInt(row.overall_position) : null,
            category_position: row.category_position ? parseInt(row.category_position) : null,
            status: row.status?.toUpperCase() || 'FIN',
            notes: row.notes || null,
          };

          let error;
          if (existingResult) {
            ({ error } = await supabase
              .from("race_results")
              .update(resultData)
              .eq("id", existingResult.id));
          } else {
            ({ error } = await supabase
              .from("race_results")
              .insert(resultData));
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
        toast({
          title: "Importación completada",
          description: `Importados ${newStatus.success} resultados${newStatus.failed > 0 ? `, ${newStatus.failed} fallaron` : ''}`,
        });
        fetchResults();
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Resultados por Evento</CardTitle>
          <CardDescription>Calcula, importa y gestiona los resultados de cada evento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Carrera</Label>
              <Select value={selectedRace} onValueChange={setSelectedRace}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una carrera" />
                </SelectTrigger>
                <SelectContent>
                  {races.map(race => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name} - {new Date(race.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              {/* Process Progress Card */}
              {processProgress.step !== 'idle' && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      {processProgress.step === 'done' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{processProgress.message}</p>
                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                          {processProgress.splitCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {processProgress.splitCount} splits
                            </span>
                          )}
                          {processProgress.resultCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {processProgress.resultCount} resultados
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {processProgress.step !== 'done' && (
                      <Progress value={processProgress.step === 'splits' ? 33 : 66} className="mt-3" />
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={handleProcessTimesAndResults}
                  disabled={processing || calculating}
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {processing ? "Procesando..." : "Procesar Tiempos y Resultados"}
                </Button>

                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={handleCalculateResults}
                  disabled={calculating || processing}
                >
                  {calculating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {calculating ? "Calculando..." : "Solo Clasificaciones"}
                </Button>

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
                      Introduce los datos del tiempo y sube foto del participante
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

                      <div className="space-y-2">
                        <Label>Tiempo Final (HH:MM:SS)</Label>
                        <Input
                          placeholder="01:30:45"
                          value={formData.finish_time}
                          onChange={(e) => setFormData({ ...formData, finish_time: e.target.value })}
                          pattern="\d{2}:\d{2}:\d{2}"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Posición General</Label>
                        <Input
                          type="number"
                          placeholder="1"
                          value={formData.overall_position}
                          onChange={(e) => setFormData({ ...formData, overall_position: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Posición Categoría</Label>
                        <Input
                          type="number"
                          placeholder="1"
                          value={formData.category_position}
                          onChange={(e) => setFormData({ ...formData, category_position: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FIN">Finalizado</SelectItem>
                            <SelectItem value="STD">En Carrera</SelectItem>
                            <SelectItem value="DNF">DNF (No Finalizó)</SelectItem>
                            <SelectItem value="DNS">DNS (No Salió)</SelectItem>
                            <SelectItem value="DSQ">DSQ (Descalificado)</SelectItem>
                            <SelectItem value="CUT">Fuera de Control</SelectItem>
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
          <CardHeader>
            <CardTitle>Resultados ({filteredResults.length})</CardTitle>
            <CardDescription>
              {distances.find(d => d.id === selectedDistance)?.name} - {distances.find(d => d.id === selectedDistance)?.distance_km} km
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Cargando resultados...</p>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No hay resultados para este evento</p>
                <Button onClick={handleCalculateResults} disabled={calculating}>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular desde Lecturas
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead className="w-16">Dorsal</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Género</TableHead>
                      <TableHead>Tiempo</TableHead>
                      <TableHead className="w-16">Pos G</TableHead>
                      <TableHead className="w-16">Pos C</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-20">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result, index) => (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium">
                          {result.status === 'FIN' ? result.overall_position || '-' : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">#{result.registration.bib_number}</Badge>
                        </TableCell>
                        <TableCell>
                          {result.registration.profiles?.first_name} {result.registration.profiles?.last_name}
                        </TableCell>
                        <TableCell>
                          {result.registration.profiles?.gender === 'Masculino' ? 'M' : 
                           result.registration.profiles?.gender === 'Femenino' ? 'F' : '-'}
                        </TableCell>
                        <TableCell className="font-mono">
                          {formatTime(result.finish_time)}
                        </TableCell>
                        <TableCell>{result.gender_position || '-'}</TableCell>
                        <TableCell>{result.category_position || '-'}</TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(result)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(result.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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
