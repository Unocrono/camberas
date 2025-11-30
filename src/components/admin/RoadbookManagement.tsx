import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, Map as MapIcon, Eye, ChevronLeft, ChevronRight, MapPin, Flag, Coffee, AlertTriangle, Mountain, Droplet, Trophy, Camera, GlassWater, Utensils, Home, Star, CircleDot, Upload, FileUp } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { parseGpxFile } from "@/lib/gpxParser";

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

// Determine item type based on waypoint name
const determineItemType = (name: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('salida') || lowerName.includes('start') || lowerName.includes('inicio')) {
    return 'start';
  }
  if (lowerName.includes('meta') || lowerName.includes('finish') || lowerName.includes('llegada') || lowerName.includes('fin')) {
    return 'finish';
  }
  if (lowerName.includes('avituallamiento') || lowerName.includes('avit') || lowerName.includes('aid')) {
    return 'aid_station';
  }
  if (lowerName.includes('agua') || lowerName.includes('water') || lowerName.includes('refresco')) {
    return 'refreshment';
  }
  if (lowerName.includes('peligro') || lowerName.includes('danger') || lowerName.includes('técnic')) {
    return 'technical';
  }
  if (lowerName.includes('foto') || lowerName.includes('mirador') || lowerName.includes('vista') || lowerName.includes('poi')) {
    return 'poi';
  }
  return 'checkpoint';
};

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
  
  // Dialog states
  const [roadbookDialogOpen, setRoadbookDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RoadbookItem | null>(null);
  
  const [roadbookFormData, setRoadbookFormData] = useState({
    name: "",
    description: "",
    start_time: "",
  });
  
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
  }, [roadbook, currentPage]);

  const fetchDistanceInfo = async () => {
    const { data, error } = await supabase
      .from("race_distances")
      .select("id, name, race_id, distance_km, gpx_file_url")
      .eq("id", distanceId)
      .single();
    
    if (!error && data) {
      setDistanceInfo(data);
    }
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
          start_time: data.start_time || "",
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
      const { count } = await supabase
        .from("roadbook_items")
        .select("*", { count: "exact", head: true })
        .eq("roadbook_id", roadbook.id);
      
      setTotalItems(count || 0);
      
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      const { data, error } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbook.id)
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
            start_time: roadbookFormData.start_time || null,
          })
          .eq("id", roadbook.id);

        if (error) throw error;
        toast({ title: "Éxito", description: "Rutómetro actualizado" });
      } else {
        const { error } = await supabase.from("roadbooks").insert({
          race_distance_id: distanceId,
          name: roadbookFormData.name,
          description: roadbookFormData.description || null,
          start_time: roadbookFormData.start_time || null,
        });

        if (error) throw error;
        toast({ title: "Éxito", description: "Rutómetro creado" });
      }
      setRoadbookDialogOpen(false);
      fetchRoadbook();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Create roadbook from GPX file
  const createRoadbookFromGpx = async (gpxFileContent: string): Promise<number> => {
    if (!distanceInfo) throw new Error("No distance info available");

    const gpx = parseGpxFile(gpxFileContent);
    
    // Build route points from track with cumulative distance
    interface RoutePoint {
      lat: number;
      lon: number;
      ele?: number;
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
          ele: point.ele,
          cumulativeDistance: cumulativeDist,
        });
      });
      totalTrackDistance = cumulativeDist;
    }
    
    // Use distance_km from distance info or calculated distance
    const finalTotalDistance = distanceInfo.distance_km > 0 ? distanceInfo.distance_km : totalTrackDistance;
    
    // Delete existing roadbook items if roadbook exists
    if (roadbook) {
      await supabase
        .from("roadbook_items")
        .delete()
        .eq("roadbook_id", roadbook.id);
      
      // Update roadbook description
      await supabase
        .from("roadbooks")
        .update({
          description: `Rutómetro generado automáticamente desde GPX con ${routePoints.length} puntos`,
        })
        .eq("id", roadbook.id);
    } else {
      // Create new roadbook
      const { data: race } = await supabase
        .from("races")
        .select("name")
        .eq("id", distanceInfo.race_id)
        .single();
      
      const roadbookName = `${race?.name || 'Carrera'} - ${distanceInfo.name}`;
      const { data: newRoadbook, error: roadbookError } = await supabase
        .from("roadbooks")
        .insert({
          race_distance_id: distanceId,
          name: roadbookName,
          description: `Rutómetro generado automáticamente desde GPX con ${routePoints.length} puntos`,
        })
        .select()
        .single();
      
      if (roadbookError) throw roadbookError;
      setRoadbook(newRoadbook);
    }
    
    const currentRoadbookId = roadbook?.id;
    if (!currentRoadbookId && !roadbook) {
      // Fetch the newly created roadbook
      const { data: freshRoadbook } = await supabase
        .from("roadbooks")
        .select("*")
        .eq("race_distance_id", distanceId)
        .single();
      
      if (!freshRoadbook) throw new Error("Could not find roadbook");
      setRoadbook(freshRoadbook);
    }
    
    // Get the roadbook ID to use
    const targetRoadbookId = roadbook?.id || (await supabase
      .from("roadbooks")
      .select("id")
      .eq("race_distance_id", distanceId)
      .single()).data?.id;
    
    if (!targetRoadbookId) throw new Error("Could not find roadbook ID");
    
    // Fetch item type IDs
    const { data: itemTypesData } = await supabase
      .from("roadbook_item_types")
      .select("id, name");
    
    const itemTypeMap = new Map<string, string>();
    if (itemTypesData) {
      itemTypesData.forEach(t => {
        itemTypeMap.set(t.name, t.id);
      });
    }
    
    // Process waypoints to mark special points
    const waypointPositions = new Map<string, { name: string; itemType: string }>();
    
    gpx.waypoints.forEach(wp => {
      if (wp.lat !== 0 && wp.lon !== 0) {
        // Find closest track point
        let minDist = Infinity;
        let closestIdx = 0;
        routePoints.forEach((rp, idx) => {
          const dist = calculateHaversineDistance(wp.lat, wp.lon, rp.lat, rp.lon);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        });
        if (minDist < 0.1) { // Within 100m
          waypointPositions.set(closestIdx.toString(), {
            name: wp.name,
            itemType: determineItemType(wp.name),
          });
        }
      }
    });
    
    // Create roadbook items from ALL track points
    // All trkpt get type "point", except waypoints which get their specific type
    const roadbookItems = routePoints.map((point, index) => {
      const prevPoint = index > 0 ? routePoints[index - 1] : null;
      const kmTotal = Math.round(point.cumulativeDistance * 1000) / 1000;
      const kmPartial = prevPoint 
        ? Math.round((point.cumulativeDistance - prevPoint.cumulativeDistance) * 1000) / 1000 
        : 0;
      const kmRemaining = Math.round((finalTotalDistance - point.cumulativeDistance) * 1000) / 1000;
      
      // Default: all trackpoints are type "point"
      let itemType = 'point';
      let description = `Punto ${index + 1}`;
      let isHighlighted = false;
      
      // Check if this is a special waypoint
      const wpInfo = waypointPositions.get(index.toString());
      if (wpInfo) {
        itemType = wpInfo.itemType;
        description = wpInfo.name;
        isHighlighted = true;
      }
      
      // First point is start
      if (index === 0) {
        itemType = 'start';
        description = 'Salida';
        isHighlighted = true;
      }
      
      // Last point is finish
      if (index === routePoints.length - 1) {
        itemType = 'finish';
        description = 'Meta';
        isHighlighted = true;
      }
      
      return {
        roadbook_id: targetRoadbookId,
        item_order: index,
        item_type: itemType,
        item_type_id: itemTypeMap.get(itemType) || null,
        description: description,
        km_total: kmTotal,
        km_partial: kmPartial,
        km_remaining: kmRemaining,
        altitude: point.ele ? Math.round(point.ele) : null,
        latitude: point.lat,
        longitude: point.lon,
        is_highlighted: isHighlighted,
      };
    });
    
    // Insert in batches to avoid payload size limits
    const batchSize = 500;
    for (let i = 0; i < roadbookItems.length; i += batchSize) {
      const batch = roadbookItems.slice(i, i + batchSize);
      const { error: itemsError } = await supabase
        .from("roadbook_items")
        .insert(batch);
      
      if (itemsError) throw itemsError;
    }
    
    return routePoints.length;
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
      const itemCount = await createRoadbookFromGpx(gpxContent);
      
      toast({ 
        title: "GPX importado", 
        description: `Se han creado ${itemCount} puntos en el rutómetro` 
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
      });
    }
    setItemDialogOpen(true);
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
              <Dialog open={roadbookDialogOpen} onOpenChange={setRoadbookDialogOpen}>
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
                    <div className="space-y-2">
                      <Label>Hora de Salida</Label>
                      <Input
                        type="time"
                        value={roadbookFormData.start_time}
                        onChange={(e) => setRoadbookFormData({ ...roadbookFormData, start_time: e.target.value })}
                      />
                    </div>
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
            <span className="text-sm text-muted-foreground">
              {distanceInfo?.gpx_file_url 
                ? "Ya hay un GPX asignado a esta distancia" 
                : "Importa un archivo GPX para generar puntos automáticamente"}
            </span>
          </div>

          {roadbook && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <span>{totalItems} puntos</span>
              {roadbook.start_time && <span>Salida: {roadbook.start_time}</span>}
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
                <DialogContent className="max-w-2xl">
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
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is_highlighted"
                        checked={itemFormData.is_highlighted}
                        onCheckedChange={(c) => setItemFormData({ ...itemFormData, is_highlighted: c as boolean })}
                      />
                      <Label htmlFor="is_highlighted" className="font-normal">Destacar punto</Label>
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

          {items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No hay puntos en este rutómetro. Sube un GPX o añade puntos manualmente.
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
                    <TableHead className="w-20">Parcial</TableHead>
                    <TableHead className="w-20">Restante</TableHead>
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
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.km_partial?.toFixed(3) || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.km_remaining?.toFixed(3) || "-"}
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
