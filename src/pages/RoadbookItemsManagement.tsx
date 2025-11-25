import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Edit, Trash2, ArrowLeft, MapPin, Flag, Coffee, AlertTriangle, Mountain, Droplet } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface RoadbookItem {
  id: string;
  roadbook_id: string;
  item_order: number;
  item_type: string;
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

const itemTypes = [
  { value: "start", label: "Salida", icon: Flag },
  { value: "checkpoint", label: "Punto de Control", icon: MapPin },
  { value: "aid_station", label: "Avituallamiento", icon: Coffee },
  { value: "water_point", label: "Punto de Agua", icon: Droplet },
  { value: "summit", label: "Cima", icon: Mountain },
  { value: "danger", label: "Zona Peligrosa", icon: AlertTriangle },
  { value: "finish", label: "Meta", icon: Flag },
  { value: "other", label: "Otro", icon: MapPin },
];

export default function RoadbookItemsManagement() {
  const { roadbookId } = useParams<{ roadbookId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RoadbookItem | null>(null);
  const [formData, setFormData] = useState({
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

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (roadbookId && user) {
      fetchRoadbookData();
    }
  }, [roadbookId, user, authLoading]);

  const fetchRoadbookData = async () => {
    try {
      setLoading(true);
      
      // Fetch roadbook
      const { data: roadbookData, error: roadbookError } = await supabase
        .from("roadbooks")
        .select("*")
        .eq("id", roadbookId)
        .maybeSingle();

      if (roadbookError) throw roadbookError;
      if (!roadbookData) {
        toast({
          title: "Error",
          description: "Rutómetro no encontrado",
          variant: "destructive",
        });
        navigate("/organizer");
        return;
      }
      
      setRoadbook(roadbookData);

      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbookId)
        .order("item_order");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);
    } catch (error: any) {
      console.error("Error fetching roadbook data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del rutómetro",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (item?: RoadbookItem) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
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
      setFormData({
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
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const itemData = {
        roadbook_id: roadbookId!,
        item_type: formData.item_type,
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
        const newOrder = items.length > 0 ? Math.max(...items.map(i => i.item_order)) + 1 : 0;
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
      fetchRoadbookData();
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
      fetchRoadbookData();
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
    return itemTypes.find(t => t.value === type) || itemTypes[itemTypes.length - 1];
  };

  if (authLoading || loading) {
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
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/organizer")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{roadbook?.name || "Rutómetro"}</h1>
              <p className="text-muted-foreground">Gestión de ítems del rutómetro</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Ítem
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {selectedItem ? "Editar Ítem" : "Crear Ítem"}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedItem
                      ? "Modifica los datos del ítem"
                      : "Añade un nuevo punto al rutómetro"}
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
                            <SelectItem key={type.value} value={type.value}>
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
                        step="0.01"
                        value={formData.km_total}
                        onChange={(e) => setFormData({ ...formData, km_total: e.target.value })}
                        placeholder="Ej: 15.5"
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
                      placeholder="Ej: Cruce con pista forestal"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="km_partial">KM Parcial</Label>
                      <Input
                        id="km_partial"
                        type="number"
                        step="0.01"
                        value={formData.km_partial}
                        onChange={(e) => setFormData({ ...formData, km_partial: e.target.value })}
                        placeholder="Ej: 2.3"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="km_remaining">KM Restante</Label>
                      <Input
                        id="km_remaining"
                        type="number"
                        step="0.01"
                        value={formData.km_remaining}
                        onChange={(e) => setFormData({ ...formData, km_remaining: e.target.value })}
                        placeholder="Ej: 10.5"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="altitude">Altitud (m)</Label>
                      <Input
                        id="altitude"
                        type="number"
                        value={formData.altitude}
                        onChange={(e) => setFormData({ ...formData, altitude: e.target.value })}
                        placeholder="Ej: 850"
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
                        placeholder="Ej: 43.123456"
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
                        placeholder="Ej: -4.123456"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="via">Vía / Camino</Label>
                    <Input
                      id="via"
                      value={formData.via}
                      onChange={(e) => setFormData({ ...formData, via: e.target.value })}
                      placeholder="Ej: Pista forestal PR-123"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Información adicional..."
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

          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No hay ítems en este rutómetro.
                  <br />
                  Añade el primer punto para comenzar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const typeInfo = getItemTypeInfo(item.item_type);
                const IconComponent = typeInfo.icon;
                return (
                  <Card key={item.id} className={item.is_highlighted ? "border-primary" : ""}>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <IconComponent className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">KM {item.km_total}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                              {typeInfo.label}
                            </span>
                            {item.is_highlighted && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                                Destacado
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {item.description}
                          </p>
                          {item.altitude && (
                            <p className="text-xs text-muted-foreground">
                              Altitud: {item.altitude}m
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedItem(item);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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
