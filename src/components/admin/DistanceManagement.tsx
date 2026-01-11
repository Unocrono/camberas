import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from "@/hooks/useDataRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Route, TrendingUp, Users, Clock, MapPin, Upload, Eye, EyeOff, AlertTriangle, CheckCircle, Euro, Navigation, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Format timestamp to local time HH:MM
const formatTimeLocal = (isoString: string | null): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
};
const distanceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  distance_km: z.number().positive("La distancia debe ser positiva"),
  elevation_gain: z.number().positive("El desnivel debe ser positivo").optional(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  max_participants: z.number().positive().optional(),
  cutoff_time: z.string().max(50).optional(),
  start_location: z.string().trim().max(200).optional(),
  finish_location: z.string().trim().max(200).optional(),
});

interface PriceRange {
  id?: string;
  start_datetime: string;
  end_datetime: string;
  price: string;
}

interface Distance {
  id: string;
  race_id: string;
  name: string;
  distance_km: number;
  elevation_gain: number | null;
  price: number;
  max_participants: number | null;
  cutoff_time: string | null;
  start_location: string | null;
  finish_location: string | null;
  image_url: string | null;
  gpx_file_url: string | null;
  created_at: string;
  is_visible: boolean;
  bib_start: number | null;
  bib_end: number | null;
  next_bib: number | null;
  gps_tracking_enabled: boolean | null;
  gps_update_frequency: number | null;
  show_route_map: boolean | null;
  registration_opens: string | null;
  registration_closes: string | null;
  display_order: number | null;
  // From race_waves join
  wave_start_time: string | null;
}

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
}

interface DistanceManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

export function DistanceManagement({ isOrganizer = false, selectedRaceId }: DistanceManagementProps) {
  const { toast } = useToast();
  const [distances, setDistances] = useState<Distance[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDistance, setEditingDistance] = useState<Distance | null>(null);
  
  const [formData, setFormData] = useState({
    race_id: "",
    name: "",
    distance_km: "",
    elevation_gain: "",
    price: "",
    max_participants: "",
    start_date: "",
    start_time_value: "",
    cutoff_time: "",
    start_location: "",
    finish_location: "",
    is_visible: true,
    bib_start: "",
    bib_end: "",
    next_bib: "",
    gps_tracking_enabled: false,
    gps_update_frequency: "30",
    show_route_map: true,
    registration_opens_date: "",
    registration_opens_time: "",
    registration_closes_date: "",
    registration_closes_time: "",
    display_order: "",
  });

  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentGpxUrl, setCurrentGpxUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    fetchDistances();
  }, [selectedRaceId]);

  const fetchRaces = async () => {
    try {
      let query = supabase
        .from("races")
        .select("id, name, date, location")
        .order("date", { ascending: false });
      
      if (isOrganizer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.eq("organizer_id", user.id);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar carreras",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchDistances = async () => {
    try {
      // Fetch distances with wave start_time
      let query = supabase
        .from("race_distances")
        .select(`
          *,
          race_waves!race_waves_race_distance_id_fkey(start_time)
        `)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      // Filter by selected race if provided
      if (selectedRaceId) {
        query = query.eq("race_id", selectedRaceId);
      } else if (isOrganizer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get races from this organizer
          const { data: userRaces } = await supabase
            .from("races")
            .select("id")
            .eq("organizer_id", user.id);
          
          if (userRaces && userRaces.length > 0) {
            const raceIds = userRaces.map(r => r.id);
            query = query.in("race_id", raceIds);
          }
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Map wave start_time to distance
      const distancesWithWaveTime = (data || []).map((d: any) => ({
        ...d,
        wave_start_time: d.race_waves?.start_time || null,
        race_waves: undefined, // Clean up the nested object
      }));
      
      setDistances(distancesWithWaveTime);
    } catch (error: any) {
      toast({
        title: "Error al cargar recorridos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to parse timestamp into date and time parts
  const parseTimestamp = (timestamp: string | null): { date: string; time: string } => {
    if (!timestamp) return { date: "", time: "" };
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
  };

  const fetchPriceRanges = async (distanceId: string) => {
    const { data, error } = await supabase
      .from("race_distance_prices")
      .select("*")
      .eq("race_distance_id", distanceId)
      .order("start_datetime", { ascending: true });
    
    if (!error && data) {
      setPriceRanges(data.map(pr => {
        const start = parseTimestamp(pr.start_datetime);
        const end = parseTimestamp(pr.end_datetime);
        return {
          id: pr.id,
          start_datetime: `${start.date}T${start.time}`,
          end_datetime: `${end.date}T${end.time}`,
          price: pr.price.toString(),
        };
      }));
    } else {
      setPriceRanges([]);
    }
  };

  const handleOpenDialog = async (distance?: Distance) => {
    if (distance) {
      setEditingDistance(distance);
      // Parse wave start_time into date and time using LOCAL timezone
      const waveStart = parseTimestamp(distance.wave_start_time);
      const regOpens = parseTimestamp(distance.registration_opens);
      const regCloses = parseTimestamp(distance.registration_closes);
      
      setFormData({
        race_id: distance.race_id,
        name: distance.name,
        distance_km: distance.distance_km.toString(),
        elevation_gain: distance.elevation_gain?.toString() || "",
        price: distance.price.toString(),
        max_participants: distance.max_participants?.toString() || "",
        start_date: waveStart.date,
        start_time_value: waveStart.time ? `${waveStart.time}:00` : "",
        cutoff_time: distance.cutoff_time || "",
        start_location: distance.start_location || "",
        finish_location: distance.finish_location || "",
        is_visible: distance.is_visible ?? true,
        bib_start: distance.bib_start?.toString() || "",
        bib_end: distance.bib_end?.toString() || "",
        next_bib: distance.next_bib?.toString() || "",
        gps_tracking_enabled: distance.gps_tracking_enabled ?? false,
        gps_update_frequency: distance.gps_update_frequency?.toString() || "30",
        show_route_map: distance.show_route_map ?? true,
        registration_opens_date: regOpens.date,
        registration_opens_time: regOpens.time,
        registration_closes_date: regCloses.date,
        registration_closes_time: regCloses.time,
        display_order: distance.display_order?.toString() || "",
      });
      setCurrentImageUrl(distance.image_url);
      setCurrentGpxUrl(distance.gpx_file_url);
      await fetchPriceRanges(distance.id);
    } else {
      setEditingDistance(null);
      // Get default date from selected race
      const selectedRace = races.find(r => r.id === selectedRaceId);
      const defaultDate = selectedRace?.date || "";
      setFormData({
        race_id: selectedRaceId || "",
        name: "",
        distance_km: "",
        elevation_gain: "",
        price: "",
        max_participants: "",
        start_date: defaultDate,
        start_time_value: "",
        cutoff_time: "",
        start_location: "",
        finish_location: "",
        is_visible: true,
        bib_start: "",
        bib_end: "",
        next_bib: "",
        gps_tracking_enabled: false,
        gps_update_frequency: "30",
        show_route_map: true,
        registration_opens_date: "",
        registration_opens_time: "",
        registration_closes_date: "",
        registration_closes_time: "",
        display_order: "",
      });
      setCurrentImageUrl(null);
      setCurrentGpxUrl(null);
      setPriceRanges([]);
    }
    setImageFile(null);
    setGpxFile(null);
    setIsDialogOpen(true);
  };

  // Helper to sanitize filename (remove special characters)
  const sanitizeFilename = (name: string): string => {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .trim();
  };

  const uploadFile = async (file: File, bucket: string, prefix: string, customName?: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = customName 
        ? `${sanitizeFilename(customName)}.${fileExt}`
        : `${prefix}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({
        title: "Error al subir archivo",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUploading(true);

    try {
      // Parse numeric values safely, treating empty strings as undefined/0
      const distanceKm = formData.distance_km ? parseFloat(formData.distance_km) : 0;
      const elevationGain = formData.elevation_gain ? parseInt(formData.elevation_gain) : undefined;
      const price = formData.price ? parseFloat(formData.price) : 0;
      const maxParticipants = formData.max_participants ? parseInt(formData.max_participants) : undefined;

      // Check for NaN values before validation
      if (isNaN(distanceKm) || (formData.price && isNaN(price))) {
        toast({
          title: "Error de validación",
          description: "Por favor, introduce valores numéricos válidos para distancia y precio",
          variant: "destructive",
        });
        setIsSubmitting(false);
        setUploading(false);
        return;
      }

      const validatedData = distanceSchema.parse({
        name: formData.name,
        distance_km: distanceKm,
        elevation_gain: elevationGain,
        price: price,
        max_participants: maxParticipants,
        cutoff_time: formData.cutoff_time || undefined,
        start_location: formData.start_location || undefined,
        finish_location: formData.finish_location || undefined,
      });

      let imageUrl = currentImageUrl;
      let gpxUrl = currentGpxUrl;

      if (imageFile) {
        const uploadedUrl = await uploadFile(imageFile, 'race-photos', `distance-${formData.race_id}`);
        if (uploadedUrl) imageUrl = uploadedUrl;
      }

      if (gpxFile) {
        const uploadedGpx = await uploadFile(gpxFile, 'race-gpx', `distance-${formData.race_id}`);
        if (uploadedGpx) gpxUrl = uploadedGpx;
      }

      const bibStart = formData.bib_start ? parseInt(formData.bib_start) : null;
      const bibEnd = formData.bib_end ? parseInt(formData.bib_end) : null;
      let nextBib = formData.next_bib ? parseInt(formData.next_bib) : null;
      
      // Validate bib range
      if (bibStart && bibEnd && bibStart > bibEnd) {
        toast({
          title: "Error de validación",
          description: "El dorsal inicial no puede ser mayor que el dorsal final",
          variant: "destructive",
        });
        setIsSubmitting(false);
        setUploading(false);
        return;
      }

      // If bib_start is set but next_bib is not, initialize next_bib to bib_start
      if (bibStart && !nextBib) {
        nextBib = bibStart;
      }

      // Warn if next_bib exceeds bib_end
      if (nextBib && bibEnd && nextBib > bibEnd) {
        toast({
          title: "Advertencia",
          description: "El siguiente dorsal supera el rango final. No se podrán asignar dorsales automáticamente.",
          variant: "destructive",
        });
      }

      // Build start_time from date and time for race_waves
      let startTime: string | null = null;
      if (formData.start_date && formData.start_time_value) {
        startTime = `${formData.start_date}T${formData.start_time_value}`;
      }

      // Build registration window timestamps
      let registrationOpens: string | null = null;
      let registrationCloses: string | null = null;
      if (formData.registration_opens_date && formData.registration_opens_time) {
        registrationOpens = `${formData.registration_opens_date}T${formData.registration_opens_time}:00`;
      }
      if (formData.registration_closes_date && formData.registration_closes_time) {
        registrationCloses = `${formData.registration_closes_date}T${formData.registration_closes_time}:00`;
      }

      const distanceData = {
        race_id: formData.race_id,
        name: validatedData.name,
        distance_km: validatedData.distance_km,
        elevation_gain: validatedData.elevation_gain || null,
        price: validatedData.price,
        max_participants: validatedData.max_participants || null,
        cutoff_time: validatedData.cutoff_time || null,
        start_location: validatedData.start_location || null,
        finish_location: validatedData.finish_location || null,
        image_url: imageUrl,
        gpx_file_url: gpxUrl,
        is_visible: formData.is_visible,
        bib_start: bibStart,
        bib_end: bibEnd,
        next_bib: nextBib,
        gps_tracking_enabled: formData.gps_tracking_enabled,
        gps_update_frequency: parseInt(formData.gps_update_frequency) || 30,
        show_route_map: formData.show_route_map,
        registration_opens: registrationOpens,
        registration_closes: registrationCloses,
        display_order: formData.display_order ? parseInt(formData.display_order) : null,
      };

      let distanceId = editingDistance?.id;

      if (editingDistance) {
        const { error } = await supabase
          .from("race_distances")
          .update(distanceData)
          .eq("id", editingDistance.id);

        if (error) throw error;

        // Update start_time in race_waves (source of truth)
        const { error: waveError } = await supabase
          .from("race_waves")
          .update({ start_time: startTime })
          .eq("race_distance_id", editingDistance.id);

        if (waveError) {
          console.error("Error updating wave start_time:", waveError);
        }

        // Manage price ranges
        // Delete existing and insert new
        await supabase
          .from("race_distance_prices")
          .delete()
          .eq("race_distance_id", editingDistance.id);

        if (priceRanges.length > 0) {
          const rangesToInsert = priceRanges
            .filter(pr => pr.start_datetime && pr.end_datetime && pr.price)
            .map(pr => ({
              race_distance_id: editingDistance.id,
              start_datetime: pr.start_datetime,
              end_datetime: pr.end_datetime,
              price: parseFloat(pr.price),
            }));
          
          if (rangesToInsert.length > 0) {
            await supabase
              .from("race_distance_prices")
              .insert(rangesToInsert);
          }
        }

        toast({
          title: "Recorrido actualizado",
          description: "El recorrido se ha actualizado exitosamente",
        });
      } else {
        // Insert new distance - wave will be created by trigger
        const { data: newDistance, error } = await supabase
          .from("race_distances")
          .insert([distanceData])
          .select('id')
          .single();

        if (error) throw error;

        distanceId = newDistance?.id;

        // Update start_time in the newly created wave
        if (newDistance && startTime) {
          const { error: waveError } = await supabase
            .from("race_waves")
            .update({ start_time: startTime })
            .eq("race_distance_id", newDistance.id);

          if (waveError) {
            console.error("Error updating wave start_time:", waveError);
          }
        }

        // Insert price ranges for new distance
        if (newDistance && priceRanges.length > 0) {
          const rangesToInsert = priceRanges
            .filter(pr => pr.start_datetime && pr.end_datetime && pr.price)
            .map(pr => ({
              race_distance_id: newDistance.id,
              start_datetime: pr.start_datetime,
              end_datetime: pr.end_datetime,
              price: parseFloat(pr.price),
            }));
          
          if (rangesToInsert.length > 0) {
            await supabase
              .from("race_distance_prices")
              .insert(rangesToInsert);
          }
        }

        toast({
          title: "Recorrido creado",
          description: "El recorrido se ha creado exitosamente",
        });
      }

      setIsDialogOpen(false);
      fetchDistances();
      triggerRefresh("distances");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
      setUploading(false);
    }
  };

  const handleDelete = async (distanceId: string) => {
    try {
      const { error } = await supabase
        .from("race_distances")
        .delete()
        .eq("id", distanceId);

      if (error) throw error;

      toast({
        title: "Recorrido eliminado",
        description: "El recorrido se ha eliminado exitosamente",
      });

      fetchDistances();
      triggerRefresh("distances");
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMoveOrder = async (distanceId: string, direction: 'up' | 'down') => {
    const index = distances.findIndex(d => d.id === distanceId);
    if (index === -1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= distances.length) return;
    
    const currentDistance = distances[index];
    const targetDistance = distances[targetIndex];
    
    // Swap display_order values
    const currentOrder = currentDistance.display_order ?? index + 1;
    const targetOrder = targetDistance.display_order ?? targetIndex + 1;
    
    try {
      // Update both distances
      const { error: error1 } = await supabase
        .from("race_distances")
        .update({ display_order: targetOrder })
        .eq("id", currentDistance.id);
      
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from("race_distances")
        .update({ display_order: currentOrder })
        .eq("id", targetDistance.id);
      
      if (error2) throw error2;
      
      toast({
        title: "Orden actualizado",
        description: "El orden de los recorridos se ha actualizado",
      });
      
      fetchDistances();
      triggerRefresh('distances');
    } catch (error: any) {
      toast({
        title: "Error al reordenar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRaceName = (raceId: string) => {
    const race = races.find(r => r.id === raceId);
    return race ? race.name : "Carrera desconocida";
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando recorridos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Recorridos</h2>
          <p className="text-muted-foreground">Crea, edita y elimina recorridos de tus carreras</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Recorrido
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDistance ? "Editar Recorrido" : "Nuevo Recorrido"}</DialogTitle>
              <DialogDescription>
                {editingDistance ? "Modifica los datos del recorrido" : "Completa los datos para crear un nuevo recorrido"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="race_id">Carrera *</Label>
                <Select 
                  value={formData.race_id} 
                  onValueChange={(value) => {
                    const selectedRace = races.find(r => r.id === value);
                    setFormData({ 
                      ...formData, 
                      race_id: value,
                      start_date: formData.start_date || selectedRace?.date || ""
                    });
                  }}
                  disabled={!!editingDistance}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una carrera" />
                  </SelectTrigger>
                  <SelectContent>
                    {races.map((race) => (
                      <SelectItem key={race.id} value={race.id}>
                        {race.name} - {new Date(race.date).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="general" className="gap-1 text-xs sm:text-sm">
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">General</span>
                  </TabsTrigger>
                  <TabsTrigger value="precios" className="gap-1 text-xs sm:text-sm">
                    <Euro className="h-4 w-4" />
                    <span className="hidden sm:inline">Precios</span>
                  </TabsTrigger>
                  <TabsTrigger value="recorrido" className="gap-1 text-xs sm:text-sm">
                    <Route className="h-4 w-4" />
                    <span className="hidden sm:inline">Recorrido</span>
                  </TabsTrigger>
                  <TabsTrigger value="horarios" className="gap-1 text-xs sm:text-sm">
                    <Clock className="h-4 w-4" />
                    <span className="hidden sm:inline">Horarios</span>
                  </TabsTrigger>
                  <TabsTrigger value="dorsales" className="gap-1 text-xs sm:text-sm">
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Dorsales</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-3 space-y-2">
                      <Label htmlFor="name">Nombre del Recorrido *</Label>
                      <Input
                        id="name"
                        placeholder="ej: Ultra Trail 100K"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="display_order">Orden</Label>
                      <Input
                        id="display_order"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={formData.display_order}
                        onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_participants">Plazas Máximas</Label>
                    <Input
                      id="max_participants"
                      type="number"
                      min="1"
                      placeholder="500"
                      value={formData.max_participants}
                      onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="image_file">Imagen del Evento</Label>
                    <Input
                      id="image_file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    />
                    {currentImageUrl && !imageFile && (
                      <p className="text-xs text-muted-foreground">✓ Imagen cargada</p>
                    )}
                    {imageFile && (
                      <p className="text-xs text-muted-foreground">
                        Archivo seleccionado: {imageFile.name}
                      </p>
                    )}
                  </div>

                  {/* Registration window */}
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-medium text-sm">Periodo de Inscripciones</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fecha Inicio Inscripciones</Label>
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={formData.registration_opens_date}
                            onChange={(e) => setFormData({ ...formData, registration_opens_date: e.target.value })}
                            className="flex-1"
                          />
                          <Input
                            type="time"
                            value={formData.registration_opens_time}
                            onChange={(e) => setFormData({ ...formData, registration_opens_time: e.target.value })}
                            className="w-28"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Fecha Fin Inscripciones</Label>
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={formData.registration_closes_date}
                            onChange={(e) => setFormData({ ...formData, registration_closes_date: e.target.value })}
                            className="flex-1"
                          />
                          <Input
                            type="time"
                            value={formData.registration_closes_time}
                            onChange={(e) => setFormData({ ...formData, registration_closes_time: e.target.value })}
                            className="w-28"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-medium text-sm">Visibilidad</h4>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="is_visible_distance" className="flex items-center gap-2">
                          {formData.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          Visible para usuarios
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Si está desactivado, solo los organizadores y administradores podrán ver este recorrido
                        </p>
                      </div>
                      <Switch
                        id="is_visible_distance"
                        checked={formData.is_visible}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_visible: checked })}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* TAB: Precios */}
                <TabsContent value="precios" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Precio Base (€) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="45.00"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Este precio se aplica cuando no hay un rango de precios activo
                    </p>
                  </div>

                  {/* Price Ranges */}
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Rangos de Precios</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPriceRanges([...priceRanges, { start_datetime: "", end_datetime: "", price: "" }])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Añadir Rango
                      </Button>
                    </div>

                    {priceRanges.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No hay rangos de precios configurados. Se usará el precio base.
                      </p>
                    )}

                    {priceRanges.map((range, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Rango {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newRanges = priceRanges.filter((_, i) => i !== index);
                              setPriceRanges(newRanges);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Desde</Label>
                            <Input
                              type="datetime-local"
                              value={range.start_datetime}
                              onChange={(e) => {
                                const newRanges = [...priceRanges];
                                newRanges[index].start_datetime = e.target.value;
                                setPriceRanges(newRanges);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Hasta</Label>
                            <Input
                              type="datetime-local"
                              value={range.end_datetime}
                              onChange={(e) => {
                                const newRanges = [...priceRanges];
                                newRanges[index].end_datetime = e.target.value;
                                setPriceRanges(newRanges);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Precio (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="35.00"
                              value={range.price}
                              onChange={(e) => {
                                const newRanges = [...priceRanges];
                                newRanges[index].price = e.target.value;
                                setPriceRanges(newRanges);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* TAB: Recorrido */}
                <TabsContent value="recorrido" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="distance_km">Distancia (km) *</Label>
                      <Input
                        id="distance_km"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="42.195"
                        value={formData.distance_km}
                        onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="elevation_gain">Desnivel Positivo (m)</Label>
                      <Input
                        id="elevation_gain"
                        type="number"
                        min="0"
                        placeholder="2500"
                        value={formData.elevation_gain}
                        onChange={(e) => setFormData({ ...formData, elevation_gain: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_location">Zona de Salida</Label>
                      <Input
                        id="start_location"
                        placeholder="ej: Plaza Mayor"
                        value={formData.start_location}
                        onChange={(e) => setFormData({ ...formData, start_location: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="finish_location">Zona de Meta</Label>
                      <Input
                        id="finish_location"
                        placeholder="ej: Parque Central"
                        value={formData.finish_location}
                        onChange={(e) => setFormData({ ...formData, finish_location: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gpx_file">Archivo GPX</Label>
                    <Input
                      id="gpx_file"
                      type="file"
                      accept=".gpx"
                      onChange={(e) => setGpxFile(e.target.files?.[0] || null)}
                    />
                    {currentGpxUrl && !gpxFile && (
                      <p className="text-xs text-muted-foreground">✓ Archivo GPX cargado</p>
                    )}
                    {gpxFile && (
                      <p className="text-xs text-muted-foreground">
                        Archivo seleccionado: {gpxFile.name}
                      </p>
                    )}
                  </div>

                  {/* GPS Tracking config */}
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-medium text-sm">Configuración de Tracking</h4>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="show_route_map" className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Mostrar mapa de recorrido
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Muestra el botón "Ver Recorrido" en la página del evento
                        </p>
                      </div>
                      <Switch
                        id="show_route_map"
                        checked={formData.show_route_map}
                        onCheckedChange={(checked) => setFormData({ ...formData, show_route_map: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="gps_tracking_enabled" className="flex items-center gap-2">
                          <Navigation className="h-4 w-4" />
                          Seguimiento GPS en vivo
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Permite a los corredores compartir su ubicación en tiempo real
                        </p>
                      </div>
                      <Switch
                        id="gps_tracking_enabled"
                        checked={formData.gps_tracking_enabled}
                        onCheckedChange={(checked) => setFormData({ ...formData, gps_tracking_enabled: checked })}
                      />
                    </div>

                    {formData.gps_tracking_enabled && (
                      <div className="space-y-2 pl-6">
                        <Label htmlFor="gps_update_frequency">Frecuencia de actualización (segundos)</Label>
                        <Input
                          id="gps_update_frequency"
                          type="number"
                          min="5"
                          max="300"
                          value={formData.gps_update_frequency}
                          onChange={(e) => setFormData({ ...formData, gps_update_frequency: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Frecuencia recomendada: 30-60 segundos para ahorrar batería
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* TAB: Horarios */}
                <TabsContent value="horarios" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_date">Fecha de Salida</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Por defecto la fecha de la carrera
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="start_time_value">Hora de Salida</Label>
                      <Input
                        id="start_time_value"
                        type="time"
                        step="1"
                        placeholder="HH:MM:SS"
                        value={formData.start_time_value}
                        onChange={(e) => setFormData({ ...formData, start_time_value: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cutoff_time">Tiempo Límite (HH:MM:SS)</Label>
                    <Input
                      id="cutoff_time"
                      type="time"
                      step="1"
                      placeholder="HH:MM:SS"
                      value={formData.cutoff_time}
                      onChange={(e) => setFormData({ ...formData, cutoff_time: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tiempo máximo permitido para completar el recorrido
                    </p>
                  </div>
                </TabsContent>

                {/* TAB: Dorsales */}
                <TabsContent value="dorsales" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bib_start">Dorsal Inicial</Label>
                      <Input
                        id="bib_start"
                        type="number"
                        min="1"
                        placeholder="ej: 1"
                        value={formData.bib_start}
                        onChange={(e) => setFormData({ ...formData, bib_start: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bib_end">Dorsal Final</Label>
                      <Input
                        id="bib_end"
                        type="number"
                        min="1"
                        placeholder="ej: 500"
                        value={formData.bib_end}
                        onChange={(e) => setFormData({ ...formData, bib_end: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="next_bib">Siguiente Dorsal</Label>
                      <Input
                        id="next_bib"
                        type="number"
                        min="1"
                        placeholder="Auto"
                        value={formData.next_bib}
                        onChange={(e) => setFormData({ ...formData, next_bib: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se asigna automáticamente si se deja vacío
                      </p>
                    </div>
                  </div>

                  {/* Validation warnings */}
                  {formData.bib_start && formData.bib_end && parseInt(formData.bib_start) > parseInt(formData.bib_end) && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        El dorsal inicial no puede ser mayor que el dorsal final
                      </AlertDescription>
                    </Alert>
                  )}

                  {formData.next_bib && formData.bib_end && parseInt(formData.next_bib) > parseInt(formData.bib_end) && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        El siguiente dorsal ({formData.next_bib}) supera el rango final ({formData.bib_end}). No se podrán asignar más dorsales automáticamente.
                      </AlertDescription>
                    </Alert>
                  )}

                  {formData.bib_start && formData.bib_end && formData.next_bib && 
                   parseInt(formData.next_bib) <= parseInt(formData.bib_end) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>
                        Dorsales disponibles: {parseInt(formData.bib_end) - parseInt(formData.next_bib) + 1} 
                        ({formData.next_bib} - {formData.bib_end})
                      </span>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Button type="submit" className="w-full" disabled={isSubmitting || uploading}>
                {uploading ? "Subiendo archivos..." : isSubmitting ? "Guardando..." : editingDistance ? "Actualizar Recorrido" : "Crear Recorrido"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {distances.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Route className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No hay recorridos</h3>
              <p className="text-muted-foreground">Crea tu primer recorrido para comenzar</p>
            </CardContent>
          </Card>
          ) : (
          distances.map((distance) => (
            <Card key={distance.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    {/* Orden buttons */}
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveOrder(distance.id, 'up')}
                        disabled={distances.indexOf(distance) === 0}
                        title="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveOrder(distance.id, 'down')}
                        disabled={distances.indexOf(distance) === distances.length - 1}
                        title="Bajar"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground font-mono">
                          #{distance.display_order ?? '-'}
                        </span>
                        <CardTitle className="text-2xl">{distance.name}</CardTitle>
                        {!distance.is_visible && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                            <EyeOff className="h-3 w-3" />
                            Oculto
                          </span>
                        )}
                      </div>
                      <CardDescription className="mt-1 text-base font-medium">
                        {getRaceName(distance.race_id)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleOpenDialog(distance)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar recorrido?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente el recorrido.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(distance.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Distancia</p>
                      <p className="font-semibold">{distance.distance_km} km</p>
                    </div>
                  </div>
                  
                  {distance.elevation_gain && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Desnivel+</p>
                        <p className="font-semibold">{distance.elevation_gain} m</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Precio</p>
                      <p className="font-semibold">{distance.price} €</p>
                    </div>
                  </div>

                  {distance.max_participants && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Plazas</p>
                        <p className="font-semibold">{distance.max_participants}</p>
                      </div>
                    </div>
                  )}

                  {distance.wave_start_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Salida</p>
                        <p className="font-semibold">
                          {formatTimeLocal(distance.wave_start_time)}
                        </p>
                      </div>
                    </div>
                  )}

                  {distance.bib_start && distance.bib_end && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Dorsales</p>
                        <p className="font-semibold">{distance.bib_start} - {distance.bib_end}</p>
                      </div>
                    </div>
                  )}

                  {distance.gps_tracking_enabled && (
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">GPS</p>
                        <p className="font-semibold text-green-600">Activo</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
