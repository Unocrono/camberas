import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Edit, Trash2, Flag, MapPin, Droplet, GlassWater, AlertTriangle, Camera, Trophy, Mountain, Coffee, Utensils, Home, Star, CircleDot } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface RoadbookItemType {
  id: string;
  name: string;
  label: string;
  icon: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  race_type: 'trail' | 'mtb' | 'both';
  created_at: string;
  updated_at: string;
}

const raceTypeOptions = [
  { value: "trail", label: "Trail" },
  { value: "mtb", label: "MTB" },
  { value: "both", label: "Ambos" },
];

const availableIcons = [
  { value: "Flag", label: "Bandera", Icon: Flag },
  { value: "MapPin", label: "Marcador", Icon: MapPin },
  { value: "Droplet", label: "Gota", Icon: Droplet },
  { value: "GlassWater", label: "Vaso de Agua", Icon: GlassWater },
  { value: "AlertTriangle", label: "Alerta", Icon: AlertTriangle },
  { value: "Camera", label: "Cámara", Icon: Camera },
  { value: "Trophy", label: "Trofeo", Icon: Trophy },
  { value: "Mountain", label: "Montaña", Icon: Mountain },
  { value: "Coffee", label: "Café", Icon: Coffee },
  { value: "Utensils", label: "Comida", Icon: Utensils },
  { value: "Home", label: "Casa/Refugio", Icon: Home },
  { value: "Star", label: "Estrella", Icon: Star },
  { value: "CircleDot", label: "Punto", Icon: CircleDot },
];

const getIconComponent = (iconName: string) => {
  const iconDef = availableIcons.find(i => i.value === iconName);
  return iconDef?.Icon || MapPin;
};

export function RoadbookItemTypesManagement() {
  const { toast } = useToast();
  const [itemTypes, setItemTypes] = useState<RoadbookItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<RoadbookItemType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    label: "",
    icon: "MapPin",
    description: "",
    display_order: "0",
    is_active: true,
    race_type: "both" as 'trail' | 'mtb' | 'both',
  });

  useEffect(() => {
    fetchItemTypes();
  }, []);

  const fetchItemTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roadbook_item_types")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setItemTypes((data as RoadbookItemType[]) || []);
    } catch (error: any) {
      console.error("Error fetching item types:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los tipos de ítem",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (type?: RoadbookItemType) => {
    if (type) {
      setSelectedType(type);
      setFormData({
        name: type.name,
        label: type.label,
        icon: type.icon,
        description: type.description || "",
        display_order: String(type.display_order),
        is_active: type.is_active,
        race_type: type.race_type,
      });
    } else {
      setSelectedType(null);
      const maxOrder = itemTypes.length > 0 ? Math.max(...itemTypes.map(t => t.display_order)) + 1 : 0;
      setFormData({
        name: "",
        label: "",
        icon: "MapPin",
        description: "",
        display_order: String(maxOrder),
        is_active: true,
        race_type: "both",
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const itemData = {
        name: formData.name.toLowerCase().replace(/\s+/g, '_'),
        label: formData.label,
        icon: formData.icon,
        description: formData.description || null,
        display_order: parseInt(formData.display_order) || 0,
        is_active: formData.is_active,
        race_type: formData.race_type,
      };

      if (selectedType) {
        const { error } = await supabase
          .from("roadbook_item_types")
          .update(itemData)
          .eq("id", selectedType.id);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Tipo de ítem actualizado correctamente",
        });
      } else {
        const { error } = await supabase
          .from("roadbook_item_types")
          .insert(itemData);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Tipo de ítem creado correctamente",
        });
      }

      setDialogOpen(false);
      fetchItemTypes();
    } catch (error: any) {
      console.error("Error saving item type:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedType) return;

    try {
      const { error } = await supabase
        .from("roadbook_item_types")
        .delete()
        .eq("id", selectedType.id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Tipo de ítem eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      fetchItemTypes();
    } catch (error: any) {
      console.error("Error deleting item type:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Tipos de Ítem de Rutómetro</h2>
          <p className="text-muted-foreground">Gestiona los tipos de puntos de control disponibles</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Tipo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedType ? "Editar Tipo de Ítem" : "Crear Tipo de Ítem"}
              </DialogTitle>
              <DialogDescription>
                {selectedType
                  ? "Modifica los datos del tipo de ítem"
                  : "Crea un nuevo tipo de punto de control"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Código (interno) *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: aid_station"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="label">Nombre (visible) *</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="Ej: Avituallamiento"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="icon">Icono *</Label>
                  <Select
                    value={formData.icon}
                    onValueChange={(value) => setFormData({ ...formData, icon: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableIcons.map((icon) => {
                        const IconComp = icon.Icon;
                        return (
                          <SelectItem key={icon.value} value={icon.value}>
                            <div className="flex items-center gap-2">
                              <IconComp className="h-4 w-4" />
                              {icon.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">Orden</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del tipo de punto..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="race_type">Tipo de Carrera *</Label>
                <Select
                  value={formData.race_type}
                  onValueChange={(value: 'trail' | 'mtb' | 'both') => setFormData({ ...formData, race_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {raceTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Activo</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedType ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {itemTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No hay tipos de ítem definidos.
              <br />
              Crea uno para comenzar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {itemTypes.map((type) => {
            const IconComponent = getIconComponent(type.icon);
            return (
              <Card key={type.id} className={!type.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComponent className="h-5 w-5 text-primary" />
                      <span>{type.label}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(type)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedType(type);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription className="text-xs font-mono">
                    {type.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {type.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {type.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Orden: {type.display_order}</span>
                    <span className="px-2 py-0.5 rounded bg-muted">
                      {type.race_type === 'both' ? 'Ambos' : type.race_type.toUpperCase()}
                    </span>
                    <span className={type.is_active ? "text-green-600" : "text-red-500"}>
                      {type.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tipo de ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si hay ítems de roadbook usando este tipo,
              podrían quedar sin tipo asignado.
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
