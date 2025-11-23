import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Calendar as CalendarIcon, MapPin, Upload, Image as ImageIcon } from "lucide-react";
import { z } from "zod";
import { ImageCropper } from "./ImageCropper";

const raceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
  location: z.string().trim().min(1, "La ubicación es requerida").max(200, "Máximo 200 caracteres"),
  date: z.string().min(1, "La fecha es requerida"),
  max_participants: z.number().positive().optional(),
  image_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

interface Race {
  id: string;
  name: string;
  description: string | null;
  location: string;
  date: string;
  max_participants: number | null;
  image_url: string | null;
  created_at: string;
  organizer_id: string | null;
}

interface RaceManagementProps {
  isOrganizer?: boolean;
}

export function RaceManagement({ isOrganizer = false }: RaceManagementProps) {
  const { toast } = useToast();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRace, setEditingRace] = useState<Race | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    date: "",
    max_participants: "",
    image_url: "",
    cover_image_url: "",
    logo_url: "",
    poster_url: "",
    gps_tracking_enabled: false,
    gps_update_frequency: "30",
    gpx_file_url: "",
  });
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [uploadingGpx, setUploadingGpx] = useState(false);
  
  // Image cropper states
  const [cropperOpen, setCropperOpen] = useState(false);
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [currentImageType, setCurrentImageType] = useState<"race" | "distance" | "logo" | "cover" | "poster">("race");
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      let query = supabase
        .from("races")
        .select("*")
        .order("date", { ascending: false });
      
      // If organizer mode, filter by current user's races
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
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (race?: Race) => {
    if (race) {
      setEditingRace(race);
      setFormData({
        name: race.name,
        description: race.description || "",
        location: race.location,
        date: race.date,
        max_participants: race.max_participants?.toString() || "",
        image_url: race.image_url || "",
        cover_image_url: (race as any).cover_image_url || "",
        logo_url: (race as any).logo_url || "",
        poster_url: (race as any).poster_url || "",
        gps_tracking_enabled: (race as any).gps_tracking_enabled || false,
        gps_update_frequency: (race as any).gps_update_frequency?.toString() || "30",
        gpx_file_url: (race as any).gpx_file_url || "",
      });
    } else {
      setEditingRace(null);
      setFormData({
        name: "",
        description: "",
        location: "",
        date: "",
        max_participants: "",
        image_url: "",
        cover_image_url: "",
        logo_url: "",
        poster_url: "",
        gps_tracking_enabled: false,
        gps_update_frequency: "30",
        gpx_file_url: "",
      });
    }
    setGpxFile(null);
    setIsDialogOpen(true);
  };

  const handleGpxFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.gpx')) {
        toast({
          title: "Archivo inválido",
          description: "Por favor selecciona un archivo GPX válido",
          variant: "destructive",
        });
        return;
      }
      setGpxFile(file);
    }
  };

  const handleImageSelect = (type: "race" | "cover" | "logo" | "poster") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setCurrentImageFile(file);
        setCurrentImageType(type);
        setCropperOpen(true);
      }
    };
    input.click();
  };

  const generateFileName = (raceName: string, date: string, type: string): string => {
    // Normalize race name for filename
    const normalizedName = raceName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    
    const year = new Date(date).getFullYear();
    const extension = type === "logo" ? "png" : "jpg";
    
    return `${normalizedName}-${year}_${type}.${extension}`;
  };

  const getStoragePath = (raceName: string, date: string, type: string): string => {
    const year = new Date(date).getFullYear();
    const folderName = `${raceName} ${year}`;
    const fileName = generateFileName(raceName, date, type);
    
    return `${year}/${folderName}/${fileName}`;
  };

  const uploadImage = async (blob: Blob, type: string): Promise<string | null> => {
    if (!formData.name || !formData.date) {
      toast({
        title: "Error",
        description: "Debes completar el nombre y fecha de la carrera antes de subir imágenes",
        variant: "destructive",
      });
      return null;
    }

    setUploadingImage(true);
    try {
      const filePath = getStoragePath(formData.name, formData.date, type);

      const { error: uploadError } = await supabase.storage
        .from("race-images")
        .upload(filePath, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: type === "logo" ? "image/png" : "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("race-images")
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({
        title: "Error al subir imagen",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob, _filename: string) => {
    const imageUrl = await uploadImage(croppedBlob, currentImageType);
    
    if (imageUrl) {
      const urlField = currentImageType === "race" ? "image_url" :
                       currentImageType === "cover" ? "cover_image_url" :
                       currentImageType === "logo" ? "logo_url" : "poster_url";
      
      setFormData({ ...formData, [urlField]: imageUrl });
      
      toast({
        title: "Imagen subida",
        description: "La imagen se ha subido correctamente",
      });
    }
  };

  const uploadGpxFile = async (raceId: string): Promise<string | null> => {
    if (!gpxFile) return null;

    setUploadingGpx(true);
    try {
      const fileExt = gpxFile.name.split('.').pop();
      const fileName = `${raceId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('race-gpx')
        .upload(filePath, gpxFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('race-gpx')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({
        title: "Error al subir archivo GPX",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingGpx(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validatedData = raceSchema.parse({
        ...formData,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : undefined,
        image_url: formData.image_url || undefined,
        description: formData.description || undefined,
      });

      let gpxUrl = formData.gpx_file_url;

      if (editingRace) {
        // Upload GPX if new file selected
        if (gpxFile) {
          const uploadedUrl = await uploadGpxFile(editingRace.id);
          if (uploadedUrl) gpxUrl = uploadedUrl;
        }

        const { error } = await supabase
          .from("races")
          .update({
            name: validatedData.name,
            description: validatedData.description || null,
            location: validatedData.location,
            date: validatedData.date,
            max_participants: validatedData.max_participants || null,
            image_url: validatedData.image_url || null,
            cover_image_url: formData.cover_image_url || null,
            logo_url: formData.logo_url || null,
            gps_tracking_enabled: formData.gps_tracking_enabled,
            gps_update_frequency: parseInt(formData.gps_update_frequency),
            gpx_file_url: gpxUrl || null,
          })
          .eq("id", editingRace.id);

        if (error) throw error;

        toast({
          title: "Carrera actualizada",
          description: "La carrera se ha actualizado exitosamente",
        });
      } else {
        // Create race first to get ID
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data: newRace, error: insertError } = await supabase
          .from("races")
          .insert([{
            name: validatedData.name,
            description: validatedData.description || null,
            location: validatedData.location,
            date: validatedData.date,
            max_participants: validatedData.max_participants || null,
            image_url: validatedData.image_url || null,
            cover_image_url: formData.cover_image_url || null,
            logo_url: formData.logo_url || null,
            gps_tracking_enabled: formData.gps_tracking_enabled,
            gps_update_frequency: parseInt(formData.gps_update_frequency),
            organizer_id: isOrganizer ? user?.id : null,
          }])
          .select()
          .single();

        if (insertError) throw insertError;

        // Upload GPX if file selected
        if (gpxFile && newRace) {
          const uploadedUrl = await uploadGpxFile(newRace.id);
          if (uploadedUrl) {
            const { error: updateError } = await supabase
              .from("races")
              .update({ gpx_file_url: uploadedUrl })
              .eq("id", newRace.id);
            
            if (updateError) throw updateError;
          }
        }

        toast({
          title: "Carrera creada",
          description: "La carrera se ha creado exitosamente",
        });
      }

      setIsDialogOpen(false);
      fetchRaces();
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
    }
  };

  const handleDelete = async (raceId: string) => {
    try {
      const { error } = await supabase
        .from("races")
        .delete()
        .eq("id", raceId);

      if (error) throw error;

      toast({
        title: "Carrera eliminada",
        description: "La carrera se ha eliminado exitosamente",
      });

      fetchRaces();
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando carreras...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Carreras</h2>
          <p className="text-muted-foreground">Crea, edita y elimina carreras</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Carrera
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRace ? "Editar Carrera" : "Nueva Carrera"}</DialogTitle>
              <DialogDescription>
                {editingRace ? "Modifica los datos de la carrera" : "Completa los datos para crear una nueva carrera"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Carrera *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Ubicación *</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_participants">Máximo de Participantes</Label>
                <Input
                  id="max_participants"
                  type="number"
                  min="1"
                  value={formData.max_participants}
                  onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Imágenes de la Carrera</h3>
                <p className="text-sm text-muted-foreground">
                  Las imágenes se recortarán automáticamente al tamaño correcto
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Imagen Principal (16:9 - 1920x1080px)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleImageSelect("race")}
                        disabled={uploadingImage || !formData.name || !formData.date}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.image_url ? "Cambiar" : "Subir"}
                      </Button>
                      {formData.image_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(formData.image_url, "_blank")}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {formData.image_url && (
                      <div className="mt-2">
                        <img 
                          src={formData.image_url} 
                          alt="Vista previa" 
                          className="w-full h-32 object-cover rounded-md border"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Imagen de Portada (2.4:1 - 1920x800px)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleImageSelect("cover")}
                        disabled={uploadingImage || !formData.name || !formData.date}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.cover_image_url ? "Cambiar" : "Subir"}
                      </Button>
                      {formData.cover_image_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(formData.cover_image_url, "_blank")}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {formData.cover_image_url && (
                      <div className="mt-2">
                        <img 
                          src={formData.cover_image_url} 
                          alt="Vista previa portada" 
                          className="w-full h-24 object-cover rounded-md border"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Logo (1:1 - 400x400px)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleImageSelect("logo")}
                        disabled={uploadingImage || !formData.name || !formData.date}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.logo_url ? "Cambiar" : "Subir"}
                      </Button>
                      {formData.logo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(formData.logo_url, "_blank")}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {formData.logo_url && (
                      <div className="mt-2">
                        <img 
                          src={formData.logo_url} 
                          alt="Vista previa logo" 
                          className="w-24 h-24 object-cover rounded-md border mx-auto"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Cartel (2:3 - 800x1200px)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleImageSelect("poster")}
                        disabled={uploadingImage || !formData.name || !formData.date}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.poster_url ? "Cambiar" : "Subir"}
                      </Button>
                      {formData.poster_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(formData.poster_url, "_blank")}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {formData.poster_url && (
                      <div className="mt-2">
                        <img 
                          src={formData.poster_url} 
                          alt="Vista previa cartel" 
                          className="w-32 h-48 object-cover rounded-md border mx-auto"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {(!formData.name || !formData.date) && (
                  <p className="text-xs text-muted-foreground">
                    * Completa primero el nombre y fecha de la carrera para poder subir imágenes
                  </p>
                )}
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Configuración GPS</h3>
                
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
                  <div className="space-y-4">
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

                    <div className="space-y-2">
                      <Label htmlFor="gpx_file">Archivo GPX de la ruta</Label>
                      <Input
                        id="gpx_file"
                        type="file"
                        accept=".gpx"
                        onChange={handleGpxFileChange}
                      />
                      {formData.gpx_file_url && !gpxFile && (
                        <p className="text-xs text-muted-foreground">
                          ✓ Archivo GPX cargado
                        </p>
                      )}
                      {gpxFile && (
                        <p className="text-xs text-muted-foreground">
                          Archivo seleccionado: {gpxFile.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Sube el archivo GPX con el recorrido de la carrera para mostrarlo en el mapa GPS
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || uploadingImage}>
                {isSubmitting ? "Guardando..." : editingRace ? "Actualizar Carrera" : "Crear Carrera"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ImageCropper
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        onCropComplete={handleCropComplete}
        imageFile={currentImageFile}
        imageType={currentImageType}
      />

      <div className="grid grid-cols-1 gap-4">
        {races.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarIcon className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No hay carreras</h3>
              <p className="text-muted-foreground">Crea tu primera carrera para comenzar</p>
            </CardContent>
          </Card>
        ) : (
          races.map((race) => (
            <Card key={race.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">{race.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {race.description || "Sin descripción"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleOpenDialog(race)}>
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
                          <AlertDialogTitle>¿Eliminar carrera?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente <strong>{race.name}</strong> y todas sus distancias e inscripciones relacionadas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(race.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {new Date(race.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{race.location}</span>
                  </div>
                  {race.max_participants && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Capacidad:</span>
                      <span>{race.max_participants} participantes</span>
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
