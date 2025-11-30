import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, ArrowLeft, MapPin, Flag, Coffee, AlertTriangle, Mountain, Droplet, Trophy, Camera, GlassWater, Utensils, Home, Star, CircleDot, ChevronLeft, ChevronRight } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  icon_url: string | null;
  photo_16_9_url: string | null;
  photo_9_16_url: string | null;
}

interface Roadbook {
  id: string;
  name: string;
  description: string | null;
  race_distance_id: string;
}

interface RoadbookItemType {
  id: string;
  name: string;
  label: string;
  icon: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  race_type: string;
}

const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  Flag,
  MapPin,
  Droplet,
  GlassWater,
  AlertTriangle,
  Camera,
  Trophy,
  Mountain,
  Coffee,
  Utensils,
  Home,
  Star,
  CircleDot,
};

const getIconComponent = (iconName: string) => {
  return iconComponents[iconName] || MapPin;
};

const ITEMS_PER_PAGE = 50;

export default function RoadbookItemsManagement() {
  const { roadbookId } = useParams<{ roadbookId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [itemTypes, setItemTypes] = useState<RoadbookItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RoadbookItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    item_type: "checkpoint",
    item_type_id: "",
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

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (roadbookId && user) {
      fetchItemTypes();
      fetchRoadbook();
    }
  }, [roadbookId, user, authLoading]);

  useEffect(() => {
    if (roadbookId) {
      fetchItems();
    }
  }, [roadbookId, currentPage]);

  const fetchItemTypes = async () => {
    const { data, error } = await supabase
      .from("roadbook_item_types")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (!error && data) {
      setItemTypes(data as RoadbookItemType[]);
    }
  };

  const fetchRoadbook = async () => {
    const { data, error } = await supabase
      .from("roadbooks")
      .select("*")
      .eq("id", roadbookId)
      .maybeSingle();

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo cargar el rutómetro",
        variant: "destructive",
      });
      return;
    }
    
    if (!data) {
      toast({
        title: "Error",
        description: "Rutómetro no encontrado",
        variant: "destructive",
      });
      navigate("/organizer");
      return;
    }
    
    setRoadbook(data);
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      
      // Get total count
      const { count } = await supabase
        .from("roadbook_items")
        .select("*", { count: "exact", head: true })
        .eq("roadbook_id", roadbookId);
      
      setTotalItems(count || 0);
      
      // Fetch paginated items
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      const { data, error } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbookId)
        .order("item_order")
        .range(from, to);

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error("Error fetching items:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los ítems",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

      // Update local state
      setItems(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, item_type: newTypeName, item_type_id: selectedType?.id || null }
          : item
      ));

      toast({
        title: "Actualizado",
        description: "Tipo de punto actualizado",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleOpenDialog = (item?: RoadbookItem) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        item_type: item.item_type,
        item_type_id: item.item_type_id || "",
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
      setFormData({
        item_type: "checkpoint",
        item_type_id: "",
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
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const selectedType = itemTypes.find(t => t.name === formData.item_type);
      
      const itemData = {
        roadbook_id: roadbookId!,
        item_type: formData.item_type,
        item_type_id: selectedType?.id || null,
        description: formData.description,
        km_total: parseFloat(formData.km_total),
        km_partial: formData.km_partial ? parseFloat(formData.km_partial) : null,
        km_remaining: formData.km_remaining ? parseFloat(formData.km_remaining) : null,
        altitude: formData.altitude ? parseFloat(formData.altitude) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        via: formData.via || null,
        notes: formData.notes || null,
        is_highlighted: formData.is_highlighted,
      };

      if (selectedItem) {
        const { error } = await supabase
          .from("roadbook_items")
          .update(itemData)
          .eq("id", selectedItem.id);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Ítem actualizado correctamente",
        });
      } else {
        const newOrder = totalItems;
        const { error } = await supabase
          .from("roadbook_items")
          .insert({
            ...itemData,
            item_order: newOrder,
          });

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Ítem creado correctamente",
        });
      }

      setDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      console.error("Error saving item:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    try {
      const { error } = await supabase
        .from("roadbook_items")
        .delete()
        .eq("id", selectedItem.id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Ítem eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getItemTypeInfo = (type: string) => {
    return itemTypes.find(t => t.name === type) || { name: type, label: type, icon: 'MapPin' };
  };

  if (authLoading || (loading && items.length === 0)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate("/organizer")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{roadbook?.name || "Rutómetro"}</h1>
                <p className="text-sm text-muted-foreground">{totalItems} ítems en total</p>
              </div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {selectedItem ? "Editar Ítem" : "Crear Ítem"}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedItem ? "Modifica los datos del ítem" : "Añade un nuevo punto al rutómetro"}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="item_type">Tipo de Punto *</Label>
                      <Select
                        value={formData.item_type}
                        onValueChange={(value) => setFormData({ ...formData, item_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {itemTypes.map((type) => (
                            <SelectItem key={type.name} value={type.name}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="km_total">KM Total *</Label>
                      <Input
                        id="km_total"
                        type="number"
                        step="0.001"
                        value={formData.km_total}
                        onChange={(e) => setFormData({ ...formData, km_total: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descripción *</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="km_partial">KM Parcial</Label>
                      <Input
                        id="km_partial"
                        type="number"
                        step="0.001"
                        value={formData.km_partial}
                        onChange={(e) => setFormData({ ...formData, km_partial: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="km_remaining">KM Restante</Label>
                      <Input
                        id="km_remaining"
                        type="number"
                        step="0.001"
                        value={formData.km_remaining}
                        onChange={(e) => setFormData({ ...formData, km_remaining: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="altitude">Altitud (m)</Label>
                      <Input
                        id="altitude"
                        type="number"
                        value={formData.altitude}
                        onChange={(e) => setFormData({ ...formData, altitude: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="latitude">Latitud</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="any"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="longitude">Longitud</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="any"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="via">Vía / Camino</Label>
                    <Input
                      id="via"
                      value={formData.via}
                      onChange={(e) => setFormData({ ...formData, via: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_highlighted"
                      checked={formData.is_highlighted}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_highlighted: checked as boolean })
                      }
                    />
                    <Label htmlFor="is_highlighted" className="font-normal">
                      Destacar este punto
                    </Label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      {selectedItem ? "Actualizar" : "Crear"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Pagination Top */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 && !loading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No hay ítems en este rutómetro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-24">KM</TableHead>
                    <TableHead className="w-48">Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-20">Parcial</TableHead>
                    <TableHead className="w-20">Restante</TableHead>
                    <TableHead className="w-16">Alt</TableHead>
                    <TableHead className="w-24">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const typeInfo = getItemTypeInfo(item.item_type);
                    const IconComp = getIconComponent(typeInfo.icon);
                    return (
                      <TableRow 
                        key={item.id} 
                        className={item.is_highlighted ? "bg-primary/5" : ""}
                      >
                        <TableCell className="font-mono text-xs">
                          {item.item_order + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {item.km_total.toFixed(3)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.item_type}
                            onValueChange={(value) => handleQuickTypeChange(item.id, value)}
                            disabled={updatingItemId === item.id}
                          >
                            <SelectTrigger className="h-8 w-full">
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
                              {itemTypes.map((type) => {
                                const TypeIcon = getIconComponent(type.icon);
                                return (
                                  <SelectItem key={type.name} value={type.name}>
                                    <div className="flex items-center gap-2">
                                      <TypeIcon className="h-3 w-3" />
                                      <span>{type.label}</span>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleOpenDialog(item)}
                            >
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

          {/* Pagination Bottom */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                Primera
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="px-4 text-sm">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Última
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará este punto del rutómetro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
