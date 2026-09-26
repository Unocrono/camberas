import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
const MapaElegirPunto = lazy(() => import("./MapaElegirPunto").then((m) => ({ default: m.MapaElegirPunto })));
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, Map as MapIcon, Eye, ChevronLeft, ChevronRight, MapPin, Flag, Coffee, AlertTriangle, Mountain, Droplet, Trophy, Camera, GlassWater, Utensils, Home, Star, CircleDot, Upload, FileUp, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { construirPuntosRutometro, type ResultadoRutometro } from "@/lib/rutometro";
import { formatLocalTime } from "@/lib/timezoneUtils";

interface Roadbook {
  id: string;
  race_distance_id: string;
  name: string;
  description: string | null;
  start_time: string | null;
  created_at: string;
  updated_at: string;
}

interface RoadbookItem {
  id: string;
  roadbook_id: string;
  item_order: number;
  item_type: string;
  item_type_id: string | null;
  description: string;
  km_total: number;
  km_partial: number | null;
  km_remaining: number | null;
  altitude: number | null;
  latitude: number | null;
  longitude: number | null;
  via: string | null;
  notes: string | null;
  is_highlighted: boolean;
  is_checkpoint: boolean;
}

interface RoadbookItemType {
  id: string;
  name: string;
  label: string;
  icon: string;
  race_type: string;
}

interface DistanceInfo {
  id: string;
  name: string;
  race_id: string;
  distance_km: number;
  gpx_file_url: string | null;
  race_name: string | null;
}

interface RoadbookManagementProps {
  distanceId: string;
  raceType?: string;
}

const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  Flag, MapPin, Droplet, GlassWater, AlertTriangle, Camera, Trophy, Mountain, Coffee, Utensils, Home, Star, CircleDot,
};

const getIconComponent = (iconName: string) => iconComponents[iconName] || MapPin;

const ITEMS_PER_PAGE = 50;


export function RoadbookManagement({ distanceId, raceType = 'trail' }: RoadbookManagementProps) {
  const [distanceInfo, setDistanceInfo] = useState<DistanceInfo | null>(null);
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [itemTypes, setItemTypes] = useState<RoadbookItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  
  // Filter states
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCheckpoint, setFilterCheckpoint] = useState<string>("all");
  const [filterHighlighted, setFilterHighlighted] = useState<string>("all");
  
  // Dialog states
  const [roadbookDialogOpen, setRoadbookDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RoadbookItem | null>(null);
  
  const [roadbookFormData, setRoadbookFormData] = useState({
    name: "",
    description: "",
  });
  // Hora de salida de la oleada del recorrido (hora local, tal cual): el
  // rutómetro no tiene hora propia
  const [salidaOleada, setSalidaOleada] = useState<string | null>(null);
  const [regenerarDialogOpen, setRegenerarDialogOpen] = useState(false);
  
  const [itemFormData, setItemFormData] = useState({
    item_type: "checkpoint",
    description: "",
    km_total: "",
    km_partial: "",
    km_remaining: "",
    altitude: "",
    latitude: "",
    longitude: "",
    via: "",
    notes: "",
    is_highlighted: false,
    is_checkpoint: false,
  });
  
  const { toast } = useToast();
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  useEffect(() => {
    if (distanceId) {
      fetchDistanceInfo();
      fetchItemTypes();
      fetchRoadbook();
    }
  }, [distanceId]);

  useEffect(() => {
    if (roadbook) {
      fetchItems();
    }
  }, [roadbook, currentPage, filterType, filterCheckpoint, filterHighlighted]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterCheckpoint, filterHighlighted]);

  const fetchDistanceInfo = async () => {
    const { data, error } = await supabase
      .from("race_distances")
      .select("id, name, race_id, distance_km, gpx_file_url, races(name)")
      .eq("id", distanceId)
      .single();

    if (!error && data) {
      const fila = data as unknown as Omit<DistanceInfo, "race_name"> & { races?: { name: string } | null };
      setDistanceInfo({
        id: fila.id,
        name: fila.name,
        race_id: fila.race_id,
        distance_km: fila.distance_km,
        gpx_file_url: fila.gpx_file_url,
        race_name: fila.races?.name ?? null,
      });
    }

    const { data: oleada } = await supabase
      .from("race_waves")
      .select("start_time")
      .eq("race_distance_id", distanceId)
      .not("start_time", "is", null)
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    setSalidaOleada(oleada?.start_time ? formatLocalTime(oleada.start_time).slice(0, 5) : null);
  };

  const fetchItemTypes = async () => {
    const { data } = await supabase
      .from("roadbook_item_types")
      .select("id, name, label, icon, race_type")
      .eq("is_active", true)
      .order("display_order");
    
    if (data) {
      // Filter by race type
      const filtered = data.filter(t => t.race_type === 'both' || t.race_type === raceType);
      setItemTypes(filtered as RoadbookItemType[]);
    }
  };

  const fetchRoadbook = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roadbooks")
        .select("*")
        .eq("race_distance_id", distanceId)
        .maybeSingle();

      if (error) throw error;
      setRoadbook(data);
      
      if (data) {
        setRoadbookFormData({
          name: data.name,
          description: data.description || "",
        });
      }
    } catch (error: any) {
      console.error("Error fetching roadbook:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    if (!roadbook) return;
    
    try {
      // Build query with filters
      let query = supabase
        .from("roadbook_items")
        .select("*", { count: "exact" })
        .eq("roadbook_id", roadbook.id);
      
      if (filterType !== "all") {
        query = query.eq("item_type", filterType);
      }
      if (filterCheckpoint === "yes") {
        query = query.eq("is_checkpoint", true);
      } else if (filterCheckpoint === "no") {
        query = query.eq("is_checkpoint", false);
      }
      if (filterHighlighted === "yes") {
        query = query.eq("is_highlighted", true);
      } else if (filterHighlighted === "no") {
        query = query.eq("is_highlighted", false);
      }
      
      // Get count first
      const { count } = await query;
      setTotalItems(count || 0);
      
      // Then get paginated data
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      let dataQuery = supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbook.id);
      
      if (filterType !== "all") {
        dataQuery = dataQuery.eq("item_type", filterType);
      }
      if (filterCheckpoint === "yes") {
        dataQuery = dataQuery.eq("is_checkpoint", true);
      } else if (filterCheckpoint === "no") {
        dataQuery = dataQuery.eq("is_checkpoint", false);
      }
      if (filterHighlighted === "yes") {
        dataQuery = dataQuery.eq("is_highlighted", true);
      } else if (filterHighlighted === "no") {
        dataQuery = dataQuery.eq("is_highlighted", false);
      }
      
      const { data, error } = await dataQuery
        .order("item_order")
        .range(from, to);

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error("Error fetching items:", error);
    }
  };

  const handleSaveRoadbook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (roadbook) {
        const { error } = await supabase
          .from("roadbooks")
          .update({
            name: roadbookFormData.name,
            description: roadbookFormData.description || null,
          })
          .eq("id", roadbook.id);

        if (error) throw error;
        toast({ title: "Éxito", description: "Rutómetro actualizado" });
        setRoadbookDialogOpen(false);
        fetchRoadbook();
      } else {
        const { data: nuevo, error } = await supabase
          .from("roadbooks")
          .insert({
            race_distance_id: distanceId,
            name: roadbookFormData.name,
            description: roadbookFormData.description || null,
          })
          .select()
          .single();

        if (error) throw error;
        setRoadbookDialogOpen(false);
        if (distanceInfo?.gpx_file_url) {
          // El recorrido ya tiene GPX: los puntos se generan solos, sin subirlo otra vez
          await generarDesdeGpxDelRecorrido(nuevo.id);
        } else {
          toast({ title: "Rutómetro creado", description: "El recorrido no tiene GPX: súbelo o añade los puntos a mano" });
          fetchRoadbook();
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const nombrePorDefecto = () => `${distanceInfo?.race_name || "Carrera"} - ${distanceInfo?.name || ""}`.trim();

  // Genera (o regenera) los puntos desde el texto de un GPX: borra los que
  // hubiera e inserta el track y los waypoints (ver lib/rutometro)
  const generarPuntos = async (gpxText: string, roadbookId: string): Promise<ResultadoRutometro> => {
    if (!distanceInfo) throw new Error("No hay datos del recorrido");
    let tipos = itemTypes;
    if (tipos.length === 0) {
      const { data } = await supabase
        .from("roadbook_item_types")
        .select("id, name, label, icon, race_type")
        .eq("is_active", true);
      tipos = ((data || []) as RoadbookItemType[]).filter((t) => t.race_type === "both" || t.race_type === raceType);
    }
    const idPorTipo = new Map(tipos.map((t) => [t.name, t.id]));
    const resultado = construirPuntosRutometro(gpxText, distanceInfo.distance_km, new Set(idPorTipo.keys()));
    if (resultado.puntos.length === 0) throw new Error("El GPX no tiene track ni waypoints");

    const { error: errorBorrar } = await supabase.from("roadbook_items").delete().eq("roadbook_id", roadbookId);
    if (errorBorrar) throw errorBorrar;

    const filas = resultado.puntos.map((p) => ({
      ...p,
      roadbook_id: roadbookId,
      item_type_id: idPorTipo.get(p.item_type) ?? null,
    }));
    const batchSize = 500;
    for (let i = 0; i < filas.length; i += batchSize) {
      const { error } = await supabase.from("roadbook_items").insert(filas.slice(i, i + batchSize));
      if (error) throw error;
    }
    return resultado;
  };

  const textoGeneracion = (r: ResultadoRutometro) => {
    let texto = `${r.puntos.length} puntos: ${r.waypointsIncluidos} waypoints del GPX destacados, más salida, meta y el track`;
    if (r.waypointsFuera.length) {
      texto += `. Quedan fuera por estar lejos del recorrido: ${r.waypointsFuera.join(", ")}`;
    }
    return texto;
  };

  // Los puntos salen del GPX que ya tiene el recorrido
  const generarDesdeGpxDelRecorrido = async (roadbookId = roadbook?.id) => {
    if (!roadbookId || !distanceInfo?.gpx_file_url) return;
    setImporting(true);
    try {
      const respuesta = await fetch(distanceInfo.gpx_file_url, { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`No se pudo descargar el GPX del recorrido (${respuesta.status})`);
      const resultado = await generarPuntos(await respuesta.text(), roadbookId);
      toast({ title: "Puntos generados", description: textoGeneracion(resultado) });
      await fetchRoadbook();
      setCurrentPage(1);
    } catch (error: any) {
      toast({ title: "No se pudieron generar los puntos", description: error.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  // Subir un GPX a mano: crea el rutómetro si no existe y genera sus puntos
  const createRoadbookFromGpx = async (gpxFileContent: string): Promise<ResultadoRutometro> => {
    if (!distanceInfo) throw new Error("No hay datos del recorrido");
    let roadbookId = roadbook?.id;
    if (!roadbookId) {
      const { data: nuevo, error } = await supabase
        .from("roadbooks")
        .insert({ race_distance_id: distanceId, name: nombrePorDefecto() })
        .select()
        .single();
      if (error) throw error;
      roadbookId = nuevo.id;
      setRoadbook(nuevo);
    }
    return generarPuntos(gpxFileContent, roadbookId);
  };

  const handleGpxFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      toast({ title: "Error", description: "Por favor selecciona un archivo GPX", variant: "destructive" });
      return;
    }

    setImporting(true);
    try {
      const gpxContent = await file.text();
      const resultado = await createRoadbookFromGpx(gpxContent);
      
      // Upload GPX file to storage and update distance
      if (distanceInfo) {
        const fileName = `${distanceInfo.race_id}/${distanceInfo.id}-${Date.now()}.gpx`;
        const { error: uploadError } = await supabase.storage
          .from('race-gpx')
          .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('race-gpx')
            .getPublicUrl(fileName);

          // Update distance with GPX URL and enable map display
          await supabase
            .from('race_distances')
            .update({ 
              gpx_file_url: publicUrl,
              show_route_map: true 
            })
            .eq('id', distanceId);

          // Update local state
          setDistanceInfo(prev => prev ? { ...prev, gpx_file_url: publicUrl } : null);
        }
      }
      
      toast({ 
        title: "GPX importado", 
        description: textoGeneracion(resultado) 
      });
      
      // Refresh data
      await fetchRoadbook();
      setCurrentPage(1);
    } catch (error: any) {
      console.error("Error importing GPX:", error);
      toast({ 
        title: "Error al importar GPX", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setImporting(false);
      // Reset input
      if (gpxInputRef.current) {
        gpxInputRef.current.value = '';
      }
    }
  };

  const handleQuickTypeChange = async (itemId: string, newTypeName: string) => {
    setUpdatingItemId(itemId);
    try {
      const selectedType = itemTypes.find(t => t.name === newTypeName);
      
      const { error } = await supabase
        .from("roadbook_items")
        .update({
          item_type: newTypeName,
          item_type_id: selectedType?.id || null,
        })
        .eq("id", itemId);

      if (error) throw error;

      setItems(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, item_type: newTypeName, item_type_id: selectedType?.id || null }
          : item
      ));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleOpenItemDialog = (item?: RoadbookItem) => {
    if (item) {
      setSelectedItem(item);
      setItemFormData({
        item_type: item.item_type,
        description: item.description,
        km_total: String(item.km_total),
        km_partial: item.km_partial ? String(item.km_partial) : "",
        km_remaining: item.km_remaining ? String(item.km_remaining) : "",
        altitude: item.altitude ? String(item.altitude) : "",
        latitude: item.latitude ? String(item.latitude) : "",
        longitude: item.longitude ? String(item.longitude) : "",
        via: item.via || "",
        notes: item.notes || "",
        is_highlighted: item.is_highlighted,
        is_checkpoint: item.is_checkpoint,
      });
    } else {
      setSelectedItem(null);
      setItemFormData({
        item_type: "checkpoint",
        description: "",
        km_total: "",
        km_partial: "",
        km_remaining: "",
        altitude: "",
        latitude: "",
        longitude: "",
        via: "",
        notes: "",
        is_highlighted: false,
        is_checkpoint: false,
      });
    }
    setItemDialogOpen(true);
  };

  const handleQuickToggle = async (itemId: string, field: 'is_highlighted' | 'is_checkpoint', newValue: boolean) => {
    setUpdatingItemId(itemId);
    try {
      const { error } = await supabase
        .from("roadbook_items")
        .update({ [field]: newValue } as any)
        .eq("id", itemId);

      if (error) throw error;

      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, [field]: newValue } : item
      ));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roadbook) return;

    try {
      const selectedType = itemTypes.find(t => t.name === itemFormData.item_type);
      
      const itemData = {
        roadbook_id: roadbook.id,
        item_type: itemFormData.item_type,
        item_type_id: selectedType?.id || null,
        description: itemFormData.description,
        km_total: parseFloat(itemFormData.km_total),
        km_partial: itemFormData.km_partial ? parseFloat(itemFormData.km_partial) : null,
        km_remaining: itemFormData.km_remaining ? parseFloat(itemFormData.km_remaining) : null,
        altitude: itemFormData.altitude ? parseFloat(itemFormData.altitude) : null,
        latitude: itemFormData.latitude ? parseFloat(itemFormData.latitude) : null,
        longitude: itemFormData.longitude ? parseFloat(itemFormData.longitude) : null,
        via: itemFormData.via || null,
        notes: itemFormData.notes || null,
        is_highlighted: itemFormData.is_highlighted,
        is_checkpoint: itemFormData.is_checkpoint,
      };

      if (selectedItem) {
        const { error } = await supabase
          .from("roadbook_items")
          .update(itemData)
          .eq("id", selectedItem.id);
        if (error) throw error;
        toast({ title: "Éxito", description: "Ítem actualizado" });
      } else {
        const { error } = await supabase
          .from("roadbook_items")
          .insert({ ...itemData, item_order: totalItems });
        if (error) throw error;
        toast({ title: "Éxito", description: "Ítem creado" });
      }

      setItemDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    try {
      const { error } = await supabase
        .from("roadbook_items")
        .delete()
        .eq("id", selectedItem.id);
      if (error) throw error;
      toast({ title: "Éxito", description: "Ítem eliminado" });
      setDeleteDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getItemTypeInfo = (type: string) => {
    return itemTypes.find(t => t.name === type) || { name: type, label: type, icon: 'MapPin' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden GPX input */}
      <input
        ref={gpxInputRef}
        type="file"
        accept=".gpx"
        onChange={handleGpxFileSelect}
        className="hidden"
      />

      {/* Roadbook Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapIcon className="h-5 w-5" />
                {roadbook ? roadbook.name : "Sin rutómetro"}
              </CardTitle>
              {roadbook?.description && (
                <CardDescription>{roadbook.description}</CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              {roadbook && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/roadbook/${roadbook.id}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="mr-2 h-4 w-4" />
                    Ver Público
                  </a>
                </Button>
              )}
              <Dialog open={roadbookDialogOpen} onOpenChange={(open) => {
                if (open) {
                  // Al abrir, el formulario refleja el rutómetro actual (o un nombre por defecto si es nuevo)
                  setRoadbookFormData(
                    roadbook
                      ? { name: roadbook.name, description: roadbook.description || "" }
                      : { name: nombrePorDefecto(), description: "" }
                  );
                }
                setRoadbookDialogOpen(open);
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant={roadbook ? "outline" : "default"}>
                    <Edit className="mr-2 h-4 w-4" />
                    {roadbook ? "Editar" : "Crear Rutómetro"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{roadbook ? "Editar Rutómetro" : "Crear Rutómetro"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveRoadbook} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <Input
                        value={roadbookFormData.name}
                        onChange={(e) => setRoadbookFormData({ ...roadbookFormData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción</Label>
                      <Textarea
                        value={roadbookFormData.description}
                        onChange={(e) => setRoadbookFormData({ ...roadbookFormData, description: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {salidaOleada
                        ? `Salida a las ${salidaOleada}: es la hora de la oleada del recorrido y se cambia en Recorridos.`
                        : "La hora de salida es la de la oleada del recorrido; se pone en Recorridos."}
                      {!roadbook && distanceInfo?.gpx_file_url && " Al crearlo, los puntos se generan del GPX del recorrido."}
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setRoadbookDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">{roadbook ? "Actualizar" : "Crear"}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          {/* GPX Import button - shown below title */}
          <div className="flex items-center gap-4 pt-2 border-t mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => gpxInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : distanceInfo?.gpx_file_url ? (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Editar GPX
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar GPX
                </>
              )}
            </Button>
            {roadbook && distanceInfo?.gpx_file_url && (
              <Button
                variant={totalItems === 0 ? "default" : "outline"}
                size="sm"
                disabled={importing}
                onClick={() => (totalItems === 0 ? generarDesdeGpxDelRecorrido() : setRegenerarDialogOpen(true))}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {totalItems === 0 ? "Generar puntos desde el GPX del recorrido" : "Regenerar desde el GPX del recorrido"}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {distanceInfo?.gpx_file_url 
                ? "El recorrido ya tiene GPX: los puntos se generan de él" 
                : "El recorrido no tiene GPX: súbelo para generar los puntos"}
            </span>
          </div>

          {roadbook && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <span>{totalItems} puntos</span>
              {salidaOleada && <span>Salida: {salidaOleada}</span>}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Items Section */}
      {roadbook && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Puntos del Rutómetro</h3>
            <div className="flex gap-2">
              {totalPages > 1 && (
                <div className="flex items-center gap-1 mr-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">{currentPage}/{totalPages}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => handleOpenItemDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo Punto
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{selectedItem ? "Editar Punto" : "Nuevo Punto"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveItem} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo *</Label>
                        <Select
                          value={itemFormData.item_type}
                          onValueChange={(v) => setItemFormData({ ...itemFormData, item_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {itemTypes.map((t) => (
                              <SelectItem key={t.name} value={t.name}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>KM Total *</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={itemFormData.km_total}
                          onChange={(e) => setItemFormData({ ...itemFormData, km_total: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción *</Label>
                      <Input
                        value={itemFormData.description}
                        onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>KM Parcial</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={itemFormData.km_partial}
                          onChange={(e) => setItemFormData({ ...itemFormData, km_partial: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>KM Restante</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={itemFormData.km_remaining}
                          onChange={(e) => setItemFormData({ ...itemFormData, km_remaining: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Altitud (m)</Label>
                        <Input
                          type="number"
                          value={itemFormData.altitude}
                          onChange={(e) => setItemFormData({ ...itemFormData, altitude: e.target.value })}
                        />
                      </div>
                    </div>
                    {/* Elegir el punto en el mapa: se pega al track y rellena km, restante, altitud y coordenadas */}
                    {distanceInfo?.gpx_file_url && itemDialogOpen && (
                      <Suspense fallback={<div className="h-[280px] rounded-md border" />}>
                        <MapaElegirPunto
                          gpxUrl={distanceInfo.gpx_file_url}
                          lat={itemFormData.latitude ? parseFloat(itemFormData.latitude) : null}
                          lon={itemFormData.longitude ? parseFloat(itemFormData.longitude) : null}
                          onElegir={(p) =>
                            setItemFormData((f) => ({
                              ...f,
                              latitude: String(p.lat),
                              longitude: String(p.lon),
                              km_total: String(p.km),
                              km_remaining: String(p.kmRestante),
                              altitude: p.altitud != null ? String(p.altitud) : f.altitude,
                            }))
                          }
                        />
                      </Suspense>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Latitud</Label>
                        <Input
                          type="number"
                          step="any"
                          value={itemFormData.latitude}
                          onChange={(e) => setItemFormData({ ...itemFormData, latitude: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Longitud</Label>
                        <Input
                          type="number"
                          step="any"
                          value={itemFormData.longitude}
                          onChange={(e) => setItemFormData({ ...itemFormData, longitude: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Vía / Camino</Label>
                      <Input
                        value={itemFormData.via}
                        onChange={(e) => setItemFormData({ ...itemFormData, via: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notas</Label>
                      <Textarea
                        value={itemFormData.notes}
                        onChange={(e) => setItemFormData({ ...itemFormData, notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is_highlighted"
                          checked={itemFormData.is_highlighted}
                          onCheckedChange={(c) => setItemFormData({ ...itemFormData, is_highlighted: c as boolean })}
                        />
                        <Label htmlFor="is_highlighted" className="font-normal">Destacar punto</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is_checkpoint"
                          checked={itemFormData.is_checkpoint}
                          onCheckedChange={(c) => setItemFormData({ ...itemFormData, is_checkpoint: c as boolean })}
                        />
                        <Label htmlFor="is_checkpoint" className="font-normal">Punto de Control</Label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">{selectedItem ? "Actualizar" : "Crear"}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Tipo:</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {itemTypes.map((t) => (
                    <SelectItem key={t.name} value={t.name}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">P. Control:</Label>
              <Select value={filterCheckpoint} onValueChange={setFilterCheckpoint}>
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Sí</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Destacado:</Label>
              <Select value={filterHighlighted} onValueChange={setFilterHighlighted}>
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Sí</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No hay puntos en este rutómetro. Genéralos desde el GPX del recorrido o añádelos a mano.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-14">#</TableHead>
                    <TableHead className="w-24">KM</TableHead>
                    <TableHead className="w-44">Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-16 text-center" title="Punto de Control">PC</TableHead>
                    <TableHead className="w-16 text-center" title="Destacado">★</TableHead>
                    <TableHead className="w-16">Alt</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const typeInfo = getItemTypeInfo(item.item_type);
                    const IconComp = getIconComponent(typeInfo.icon);
                    return (
                      <TableRow key={item.id} className={item.is_highlighted ? "bg-primary/5" : ""}>
                        <TableCell className="font-mono text-xs">{item.item_order + 1}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">{item.km_total.toFixed(3)}</TableCell>
                        <TableCell>
                          <Select
                            value={item.item_type}
                            onValueChange={(v) => handleQuickTypeChange(item.id, v)}
                            disabled={updatingItemId === item.id}
                          >
                            <SelectTrigger className="h-8">
                              <div className="flex items-center gap-2">
                                {updatingItemId === item.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <IconComp className="h-3 w-3" />
                                )}
                                <span className="text-xs truncate">{typeInfo.label}</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              {itemTypes.map((t) => {
                                const TIcon = getIconComponent(t.icon);
                                return (
                                  <SelectItem key={t.name} value={t.name}>
                                    <div className="flex items-center gap-2">
                                      <TIcon className="h-3 w-3" />
                                      <span>{t.label}</span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-sm truncate block" title={item.description}>
                            {item.description}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={item.is_checkpoint}
                            onCheckedChange={(checked) => handleQuickToggle(item.id, 'is_checkpoint', !!checked)}
                            disabled={updatingItemId === item.id}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={item.is_highlighted}
                            onCheckedChange={(checked) => handleQuickToggle(item.id, 'is_highlighted', !!checked)}
                            disabled={updatingItemId === item.id}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.altitude || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenItemDialog(item)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setSelectedItem(item);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                Primera
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 text-sm">{currentPage} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                Última
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={regenerarDialogOpen} onOpenChange={setRegenerarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regenerar los puntos desde el GPX?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran los {totalItems} puntos actuales, también los añadidos o corregidos a mano, y se vuelven a
              crear desde el GPX del recorrido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRegenerarDialogOpen(false);
                generarDesdeGpxDelRecorrido();
              }}
            >
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
