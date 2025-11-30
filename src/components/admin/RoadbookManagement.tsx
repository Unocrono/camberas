import { useState, useEffect } from "react";
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
import { Loader2, Plus, Edit, Trash2, Map, Eye, ChevronLeft, ChevronRight, MapPin, Flag, Coffee, AlertTriangle, Mountain, Droplet, Trophy, Camera, GlassWater, Utensils, Home, Star, CircleDot } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [itemTypes, setItemTypes] = useState<RoadbookItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  
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
      fetchItemTypes();
      fetchRoadbook();
    }
  }, [distanceId]);

  useEffect(() => {
    if (roadbook) {
      fetchItems();
    }
  }, [roadbook, currentPage]);

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
      {/* Roadbook Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
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
