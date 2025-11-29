import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Route, TrendingUp, Users, Clock, MapPin, Upload, Eye, EyeOff, AlertTriangle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { parseGpxFile } from "@/lib/gpxParser";

const distanceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  distance_km: z.number().positive("La distancia debe ser positiva"),
  elevation_gain: z.number().positive("El desnivel debe ser positivo").optional(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  max_participants: z.number().positive().optional(),
  cutoff_time: z.string().max(50).optional(),
  start_location: z.string().trim().max(200).optional(),
  finish_location: z.string().trim().max(200).optional(),
  image_url: z.string().url("URL inválida").optional().or(z.literal("")),
  gpx_file_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

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
    cutoff_time: "",
    start_location: "",
    finish_location: "",
    image_url: "",
    is_visible: true,
    bib_start: "",
    bib_end: "",
    next_bib: "",
    gps_tracking_enabled: false,
    gps_update_frequency: "30",
  });

  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
      let query = supabase
        .from("race_distances")
        .select("*")
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
      setDistances(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar distancias",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (distance?: Distance) => {
    if (distance) {
      setEditingDistance(distance);
      setFormData({
        race_id: distance.race_id,
        name: distance.name,
        distance_km: distance.distance_km.toString(),
        elevation_gain: distance.elevation_gain?.toString() || "",
        price: distance.price.toString(),
        max_participants: distance.max_participants?.toString() || "",
        cutoff_time: distance.cutoff_time || "",
        start_location: distance.start_location || "",
        finish_location: distance.finish_location || "",
        image_url: distance.image_url || "",
        is_visible: distance.is_visible ?? true,
        bib_start: distance.bib_start?.toString() || "",
        bib_end: distance.bib_end?.toString() || "",
        next_bib: distance.next_bib?.toString() || "",
        gps_tracking_enabled: distance.gps_tracking_enabled ?? false,
        gps_update_frequency: distance.gps_update_frequency?.toString() || "30",
      });
    } else {
      setEditingDistance(null);
      setFormData({
        race_id: "",
        name: "",
        distance_km: "",
        elevation_gain: "",
        price: "",
        max_participants: "",
        cutoff_time: "",
        start_location: "",
        finish_location: "",
        image_url: "",
        is_visible: true,
        bib_start: "",
        bib_end: "",
        next_bib: "",
        gps_tracking_enabled: false,
        gps_update_frequency: "30",
      });
    }
    setGpxFile(null);
    setImageFile(null);
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

  // Calculate distance between two points using Haversine formula
  const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Import checkpoints from GPX file
  const importCheckpointsFromGpx = async (
    gpxFileContent: string,
    raceId: string,
    distanceId: string
  ): Promise<number> => {
    try {
      const gpx = parseGpxFile(gpxFileContent);
      
      // Build route points from track for distance calculation
      interface RoutePoint {
        lat: number;
        lon: number;
        cumulativeDistance: number;
      }
      
      let routePoints: RoutePoint[] = [];
      let totalTrackDistance = 0;
      
      if (gpx.tracks.length > 0) {
        const track = gpx.tracks[0];
        let cumulativeDist = 0;
        
        track.points.forEach((point, index) => {
          if (index > 0) {
            const prevPoint = track.points[index - 1];
            cumulativeDist += calculateHaversineDistance(
              prevPoint.lat,
              prevPoint.lon,
              point.lat,
              point.lon
            );
          }
          routePoints.push({
            lat: point.lat,
            lon: point.lon,
            cumulativeDistance: cumulativeDist,
          });
        });
        totalTrackDistance = cumulativeDist;
      }
      
      // Helper function to find distance along route
      const findDistanceOnRoute = (lat: number, lon: number): number => {
        if (routePoints.length === 0) return 0;
        
        let closestDistance = Infinity;
        let resultKm = 0;
        
        routePoints.forEach((point) => {
          const dist = calculateHaversineDistance(lat, lon, point.lat, point.lon);
          if (dist < closestDistance) {
            closestDistance = dist;
            resultKm = point.cumulativeDistance;
          }
        });
        
        return Math.round(resultKm * 1000) / 1000;
      };
      
      // Process waypoints
      interface GpxWaypoint {
        name: string;
        lat: number;
        lon: number;
        ele?: number;
        desc?: string;
        distanceKm: number;
      }
      
      let waypoints: GpxWaypoint[] = [];
      
      // Filter valid waypoints
      const validWaypoints = gpx.waypoints.filter(wp => 
        wp.lat !== 0 && wp.lon !== 0 && !isNaN(wp.lat) && !isNaN(wp.lon)
      );
      
      if (validWaypoints.length > 0) {
        waypoints = validWaypoints.map((wp) => ({
          name: wp.name,
          lat: wp.lat,
          lon: wp.lon,
          ele: wp.ele,
          desc: wp.desc || wp.cmt || "",
          distanceKm: routePoints.length > 0 ? findDistanceOnRoute(wp.lat, wp.lon) : 0,
        }));
      }
      
      // Add Salida and Meta from track if they don't exist
      if (gpx.tracks.length > 0 && routePoints.length > 0) {
        const firstPoint = routePoints[0];
        const lastPoint = routePoints[routePoints.length - 1];
        
        const hasSalida = waypoints.some(wp => {
          const name = wp.name.toLowerCase();
          return name.includes('salida') || name.includes('start') || name.includes('inicio');
        });
        
        const hasMeta = waypoints.some(wp => {
          const name = wp.name.toLowerCase();
          return name.includes('meta') || name.includes('finish') || name.includes('llegada') || name.includes('fin');
        });
        
        if (!hasSalida) {
          waypoints.unshift({
            name: "Salida",
            lat: firstPoint.lat,
            lon: firstPoint.lon,
            desc: "Punto de salida",
            distanceKm: 0,
          });
        }
        
        if (!hasMeta) {
          waypoints.push({
            name: "Meta",
            lat: lastPoint.lat,
            lon: lastPoint.lon,
            desc: "Punto de llegada",
            distanceKm: Math.round(totalTrackDistance * 1000) / 1000,
          });
        }
        
        // Recalculate distances
        waypoints = waypoints.map(wp => ({
          ...wp,
          distanceKm: wp.name === "Salida" ? 0 : 
                      wp.name === "Meta" ? Math.round(totalTrackDistance * 1000) / 1000 :
                      findDistanceOnRoute(wp.lat, wp.lon)
        }));
      }
      
      if (waypoints.length === 0) {
        return 0;
      }
      
      // Sort waypoints by distance
      waypoints.sort((a, b) => a.distanceKm - b.distanceKm);
      
      // Delete existing checkpoints for this distance
      await supabase
        .from("race_checkpoints")
        .delete()
        .eq("race_distance_id", distanceId);
      
      // Get max checkpoint_order for the race to avoid conflicts
      const { data: maxOrderData } = await supabase
        .from("race_checkpoints")
        .select("checkpoint_order")
        .eq("race_id", raceId)
        .order("checkpoint_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const startOrder = (maxOrderData?.checkpoint_order || 0) + 1;
      
      // Create checkpoints
      const checkpointsToInsert = waypoints.map((wp, index) => ({
        race_id: raceId,
        race_distance_id: distanceId,
        name: wp.name,
        lugar: wp.desc || null,
        checkpoint_order: startOrder + index,
        distance_km: wp.distanceKm,
        latitude: wp.lat,
        longitude: wp.lon,
      }));
      
      const { error } = await supabase
        .from("race_checkpoints")
        .insert(checkpointsToInsert);
      
      if (error) {
        console.error("Error inserting checkpoints:", error);
        throw error;
      }
      
      return waypoints.length;
    } catch (error) {
      console.error("Error importing checkpoints from GPX:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUploading(true);

    try {
      const validatedData = distanceSchema.parse({
        name: formData.name,
        distance_km: parseFloat(formData.distance_km),
        elevation_gain: formData.elevation_gain ? parseInt(formData.elevation_gain) : undefined,
        price: parseFloat(formData.price),
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : undefined,
        cutoff_time: formData.cutoff_time || undefined,
        start_location: formData.start_location || undefined,
        finish_location: formData.finish_location || undefined,
        image_url: formData.image_url || undefined,
      });

      let gpxUrl = editingDistance?.gpx_file_url || null;
      let imageUrl = formData.image_url || null;
      let gpxContent: string | null = null;

      // Read GPX content BEFORE uploading (file can only be read once)
      if (gpxFile) {
        gpxContent = await gpxFile.text();
      }

      // Upload files
      if (gpxFile && gpxContent) {
        const raceName = getRaceName(formData.race_id);
        const gpxCustomName = `${raceName} - ${validatedData.name}`;
        // Create a new Blob from the content for upload
        const gpxBlob = new Blob([gpxContent], { type: 'application/gpx+xml' });
        const gpxFileForUpload = new File([gpxBlob], gpxFile.name, { type: 'application/gpx+xml' });
        const uploadedUrl = await uploadFile(gpxFileForUpload, 'race-gpx', `distance-${formData.race_id}`, gpxCustomName);
        if (uploadedUrl) gpxUrl = uploadedUrl;
      }

      if (imageFile) {
        const uploadedUrl = await uploadFile(imageFile, 'race-photos', `distance-${formData.race_id}`);
        if (uploadedUrl) imageUrl = uploadedUrl;
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
      };

      if (editingDistance) {
        const { error } = await supabase
          .from("race_distances")
          .update(distanceData)
          .eq("id", editingDistance.id);

        if (error) throw error;

        // Import checkpoints from GPX if a new GPX file was uploaded
        if (gpxContent) {
          try {
            const importedCount = await importCheckpointsFromGpx(gpxContent, formData.race_id, editingDistance.id);
            toast({
              title: "Distancia actualizada",
              description: `Se han importado ${importedCount} puntos de control desde el GPX`,
            });
          } catch (gpxError) {
            console.error("Error importing checkpoints:", gpxError);
            toast({
              title: "Distancia actualizada",
              description: "La distancia se ha actualizado pero hubo un error al importar los puntos de control",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Distancia actualizada",
            description: "La distancia se ha actualizado exitosamente",
          });
        }
      } else {
        const { data: insertedDistance, error } = await supabase
          .from("race_distances")
          .insert([distanceData])
          .select()
          .single();

        if (error) throw error;

        // Import checkpoints from GPX if a GPX file was uploaded
        if (gpxContent && insertedDistance) {
          try {
            const importedCount = await importCheckpointsFromGpx(gpxContent, formData.race_id, insertedDistance.id);
            toast({
              title: "Distancia creada",
              description: `Se han importado ${importedCount} puntos de control desde el GPX`,
            });
          } catch (gpxError) {
            console.error("Error importing checkpoints:", gpxError);
            toast({
              title: "Distancia creada",
              description: "La distancia se ha creado pero hubo un error al importar los puntos de control",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Distancia creada",
            description: "La distancia se ha creado exitosamente",
          });
        }
      }

      setIsDialogOpen(false);
      fetchDistances();
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
        title: "Distancia eliminada",
        description: "La distancia se ha eliminado exitosamente",
      });

      fetchDistances();
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
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
    return <div className="text-muted-foreground">Cargando distancias...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Distancias</h2>
          <p className="text-muted-foreground">Crea, edita y elimina distancias de tus carreras</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Distancia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDistance ? "Editar Distancia" : "Nueva Distancia"}</DialogTitle>
              <DialogDescription>
                {editingDistance ? "Modifica los datos de la distancia" : "Completa los datos para crear una nueva distancia"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="race_id">Carrera *</Label>
                <Select 
                  value={formData.race_id} 
                  onValueChange={(value) => setFormData({ ...formData, race_id: value })}
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

              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Distancia *</Label>
                <Input
                  id="name"
                  placeholder="ej: Ultra Trail 100K"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

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
                  <Label htmlFor="price">Precio (€) *</Label>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="cutoff_time">Tiempo Límite</Label>
                <Input
                  id="cutoff_time"
                  placeholder="ej: 14 horas"
                  value={formData.cutoff_time}
                  onChange={(e) => setFormData({ ...formData, cutoff_time: e.target.value })}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Gestión de Dorsales
                </h3>
                
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

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Archivos
                </h3>
                
                <div className="space-y-2">
                  <Label htmlFor="image_file">Imagen de la Distancia</Label>
                  <Input
                    id="image_file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                  {formData.image_url && !imageFile && (
                    <p className="text-xs text-muted-foreground">✓ Imagen cargada</p>
                  )}
                  {imageFile && (
                    <p className="text-xs text-muted-foreground">
                      Archivo seleccionado: {imageFile.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gpx_file">Archivo GPX del Recorrido</Label>
                  <Input
                    id="gpx_file"
                    type="file"
                    accept=".gpx"
                    onChange={(e) => setGpxFile(e.target.files?.[0] || null)}
                  />
                  {editingDistance?.gpx_file_url && !gpxFile && (
                    <p className="text-xs text-muted-foreground">✓ Archivo GPX cargado</p>
                  )}
                  {gpxFile && (
                    <p className="text-xs text-muted-foreground">
                      Archivo seleccionado: {gpxFile.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">URL de Imagen (alternativa)</Label>
                  <Input
                    id="image_url"
                    type="url"
                    placeholder="https://ejemplo.com/imagen.jpg"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Configuración GPS
                </h3>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="gps_tracking_enabled"
                    checked={formData.gps_tracking_enabled}
                    onChange={(e) => setFormData({ ...formData, gps_tracking_enabled: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="gps_tracking_enabled">Habilitar seguimiento GPS en vivo</Label>
                </div>

                {formData.gps_tracking_enabled && (
                  <div className="space-y-2">
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

              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_visible_distance" className="flex items-center gap-2">
                    {formData.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    Visible para usuarios
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Si está desactivado, solo los organizadores y administradores podrán ver esta distancia
                  </p>
                </div>
                <Switch
                  id="is_visible_distance"
                  checked={formData.is_visible}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_visible: checked })}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || uploading}>
                {uploading ? "Subiendo archivos..." : isSubmitting ? "Guardando..." : editingDistance ? "Actualizar Distancia" : "Crear Distancia"}
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
              <h3 className="text-xl font-semibold mb-2">No hay distancias</h3>
              <p className="text-muted-foreground">Crea tu primera distancia para comenzar</p>
            </CardContent>
          </Card>
          ) : (
          distances.map((distance) => (
            <Card key={distance.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl">{distance.name}</CardTitle>
                      {!distance.is_visible && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                          <EyeOff className="h-3 w-3" />
                          Oculta
                        </span>
                      )}
                    </div>
                    <CardDescription className="mt-1 text-base font-medium">
                      {getRaceName(distance.race_id)}
                    </CardDescription>
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
                          <AlertDialogTitle>¿Eliminar distancia?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente la distancia.
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
                    <span className="text-2xl">€</span>
                    <div>
                      <p className="text-xs text-muted-foreground">Precio</p>
                      <p className="font-semibold">{distance.price.toFixed(2)} €</p>
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
                  
                  {distance.cutoff_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Tiempo límite</p>
                        <p className="font-semibold">{distance.cutoff_time}</p>
                      </div>
                    </div>
                  )}
                  
                  {distance.bib_start && distance.bib_end && (
                    <div className="flex items-center gap-2">
                      {distance.next_bib && distance.next_bib > distance.bib_end ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : distance.next_bib && (distance.bib_end - distance.next_bib + 1) <= 10 ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <Users className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Dorsales</p>
                        <p className="font-semibold">{distance.bib_start} - {distance.bib_end}</p>
                        {distance.next_bib && (
                          <>
                            {distance.next_bib > distance.bib_end ? (
                              <p className="text-xs text-destructive font-medium">
                                ¡Agotados! No hay dorsales disponibles
                              </p>
                            ) : (
                              <p className={`text-xs ${(distance.bib_end - distance.next_bib + 1) <= 10 ? 'text-yellow-600 font-medium' : 'text-muted-foreground'}`}>
                                Disponibles: {distance.bib_end - distance.next_bib + 1} (Siguiente: {distance.next_bib})
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {distance.start_location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Salida</p>
                        <p className="font-semibold text-sm">{distance.start_location}</p>
                      </div>
                    </div>
                  )}
                  
                  {distance.finish_location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Meta</p>
                        <p className="font-semibold text-sm">{distance.finish_location}</p>
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
