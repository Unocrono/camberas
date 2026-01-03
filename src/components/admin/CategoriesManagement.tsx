import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Users, Download, ArrowUpDown, FileDown } from "lucide-react";
import { format } from "date-fns";

interface EventCategory {
  id: string;
  race_id: string;
  race_distance_id: string | null;
  name: string;
  short_name: string | null;
  gender: string | null;
  min_age: number | null;
  max_age: number | null;
  age_calculation_date: string | null;
  display_order: number;
}

interface CategoryTemplate {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

interface CategoryTemplateItem {
  id: string;
  template_id: string;
  name: string;
  short_name: string | null;
  gender: string | null;
  min_age: number | null;
  max_age: number | null;
  display_order: number;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface CategoriesManagementProps {
  selectedRaceId: string | null;
}

export function CategoriesManagement({ selectedRaceId }: CategoriesManagementProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingDistances, setLoadingDistances] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<EventCategory | null>(null);
  const [editingCategory, setEditingCategory] = useState<EventCategory | null>(null);
  const [raceDate, setRaceDate] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    short_name: "",
    gender: "",
    min_age: "",
    max_age: "",
    age_calculation_date: "",
    display_order: "0",
  });

  // Cargar distancias cuando cambia la carrera
  useEffect(() => {
    if (selectedRaceId) {
      fetchDistances();
      fetchRaceDate();
      fetchTemplates();
    } else {
      setDistances([]);
      setSelectedDistanceId("");
      setCategories([]);
    }
  }, [selectedRaceId]);

  // Cargar categorías cuando cambia el evento seleccionado
  useEffect(() => {
    if (selectedDistanceId) {
      fetchCategories();
    } else {
      setCategories([]);
      setLoading(false);
    }
  }, [selectedDistanceId]);

  const fetchDistances = async () => {
    if (!selectedRaceId) return;
    
    setLoadingDistances(true);
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRaceId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      
      setDistances(data || []);
      // Auto-seleccionar el primer evento si hay alguno
      if (data && data.length > 0 && !selectedDistanceId) {
        setSelectedDistanceId(data[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching distances:", error);
    } finally {
      setLoadingDistances(false);
    }
  };

  const fetchCategories = async () => {
    if (!selectedDistanceId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("race_categories")
        .select("*")
        .eq("race_distance_id", selectedDistanceId)
        .order("display_order");

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("category_templates")
        .select("*")
        .order("is_default", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
    }
  };

  const fetchRaceDate = async () => {
    if (!selectedRaceId) return;
    
    try {
      const { data, error } = await supabase
        .from("races")
        .select("date")
        .eq("id", selectedRaceId)
        .single();

      if (error) throw error;
      setRaceDate(data?.date || null);
    } catch (error: any) {
      console.error("Error fetching race date:", error);
    }
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      short_name: "",
      gender: "",
      min_age: "",
      max_age: "",
      age_calculation_date: raceDate || "",
      display_order: String(categories.length + 1),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (category: EventCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      short_name: category.short_name || "",
      gender: category.gender || "",
      min_age: category.min_age?.toString() || "",
      max_age: category.max_age?.toString() || "",
      age_calculation_date: category.age_calculation_date || raceDate || "",
      display_order: category.display_order.toString(),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedRaceId || !formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      const categoryData = {
        race_id: selectedRaceId,
        race_distance_id: selectedDistanceId || null,
        name: formData.name.trim(),
        short_name: formData.short_name.trim() || formData.name.trim().substring(0, 6).toUpperCase(),
        gender: formData.gender === "all" ? null : formData.gender || null,
        min_age: formData.min_age ? parseInt(formData.min_age) : null,
        max_age: formData.max_age ? parseInt(formData.max_age) : null,
        age_calculation_date: formData.age_calculation_date || null,
        display_order: parseInt(formData.display_order) || 0,
      };

      if (editingCategory) {
        const { error } = await supabase
          .from("race_categories")
          .update(categoryData)
          .eq("id", editingCategory.id);

        if (error) throw error;
        toast({ title: "Categoría actualizada" });
      } else {
        const { error } = await supabase
          .from("race_categories")
          .insert(categoryData);

        if (error) throw error;
        toast({ title: "Categoría creada" });
      }

      setDialogOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      const { error } = await supabase
        .from("race_categories")
        .delete()
        .eq("id", categoryToDelete.id);

      if (error) throw error;
      
      toast({ title: "Categoría eliminada" });
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadFromTemplate = async () => {
    if (!selectedRaceId || !selectedTemplateId) return;

    setLoadingTemplate(true);
    try {
      // Obtener items de la plantilla
      const { data: templateItems, error: itemsError } = await supabase
        .from("category_template_items")
        .select("*")
        .eq("template_id", selectedTemplateId)
        .order("display_order");

      if (itemsError) throw itemsError;

      if (!templateItems || templateItems.length === 0) {
        toast({
          title: "Plantilla vacía",
          description: "La plantilla seleccionada no tiene categorías",
          variant: "destructive",
        });
        return;
      }

      // Crear categorías basadas en la plantilla
      const categoriesToInsert = templateItems.map((item: CategoryTemplateItem) => ({
        race_id: selectedRaceId,
        race_distance_id: selectedDistanceId || null,
        name: item.name,
        short_name: item.short_name,
        gender: item.gender,
        min_age: item.min_age,
        max_age: item.max_age,
        age_calculation_date: raceDate,
        display_order: item.display_order,
      }));

      const { error: insertError } = await supabase
        .from("race_categories")
        .insert(categoriesToInsert);

      if (insertError) throw insertError;

      toast({ 
        title: "Plantilla cargada",
        description: `Se han creado ${categoriesToInsert.length} categorías`,
      });
      
      setTemplateDialogOpen(false);
      setSelectedTemplateId("");
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingTemplate(false);
    }
  };

  const deleteAllCategories = async () => {
    if (!selectedRaceId) return;

    try {
      let query = supabase.from("race_categories").delete();
      
      if (selectedDistanceId) {
        query = query.eq("race_distance_id", selectedDistanceId);
      } else {
        query = query.eq("race_id", selectedRaceId).is("race_distance_id", null);
      }

      const { error } = await query;

      if (error) throw error;
      
      toast({ title: "Todas las categorías eliminadas" });
      setCategories([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getGenderLabel = (gender: string | null) => {
    if (!gender) return "Mixto";
    return gender === "M" ? "Masculino" : "Femenino";
  };

  const getGenderBadgeVariant = (gender: string | null) => {
    if (!gender) return "outline";
    return gender === "M" ? "default" : "secondary";
  };

  const getAgeRange = (min: number | null, max: number | null) => {
    if (min === null && max === null) return "Sin límite";
    if (min === null) return `≤ ${max} años`;
    if (max === null || max >= 999) return `≥ ${min} años`;
    return `${min} - ${max} años`;
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestión de Categorías
          </CardTitle>
          <CardDescription>
            Selecciona una carrera para gestionar sus categorías
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector de Evento */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <Label htmlFor="distance-select">Evento (Distancia)</Label>
            {loadingDistances ? (
              <Skeleton className="h-10 w-full" />
            ) : distances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay eventos definidos para esta carrera
              </p>
            ) : (
              <Select
                value={selectedDistanceId}
                onValueChange={setSelectedDistanceId}
              >
                <SelectTrigger id="distance-select">
                  <SelectValue placeholder="Selecciona un evento" />
                </SelectTrigger>
                <SelectContent>
                  {distances.map((distance) => (
                    <SelectItem key={distance.id} value={distance.id}>
                      {distance.name} ({distance.distance_km} km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info si no hay evento seleccionado */}
      {!selectedDistanceId && distances.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>Nota:</strong> Selecciona un evento para gestionar sus categorías.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de categorías */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {selectedDistanceId ? "Categorías del Evento" : "Categorías de la Carrera"}
              </CardTitle>
              <CardDescription>
                Define las categorías de edad y género para clasificaciones
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {categories.length === 0 && templates.length > 0 && selectedDistanceId && (
                <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Cargar plantilla
                </Button>
              )}
              <Button onClick={openCreateDialog} disabled={!selectedDistanceId}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Categoría
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay categorías definidas</p>
              <p className="text-sm mb-4">
                Carga una plantilla o crea categorías manualmente
              </p>
              {templates.length > 0 && (
                <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Cargar desde plantilla
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">
                      <ArrowUpDown className="h-4 w-4" />
                    </TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Corto</TableHead>
                    <TableHead>Género</TableHead>
                    <TableHead>Rango de Edad</TableHead>
                    <TableHead>Fecha Cálculo</TableHead>
                    <TableHead className="w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="text-muted-foreground">
                        {category.display_order}
                      </TableCell>
                      <TableCell className="font-medium">
                        {category.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {category.short_name || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getGenderBadgeVariant(category.gender)}>
                          {getGenderLabel(category.gender)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAgeRange(category.min_age, category.max_age)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {category.age_calculation_date 
                          ? format(new Date(category.age_calculation_date), "dd/MM/yyyy")
                          : "Fecha carrera"
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setCategoryToDelete(category);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {categories.length} categorías definidas
                </p>
                <div className="flex gap-2">
                  {templates.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setTemplateDialogOpen(true)}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Reemplazar con plantilla
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
            </DialogTitle>
            <DialogDescription>
              Define los criterios de edad y género para esta categoría
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej: M-Senior"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="short_name">Nombre corto</Label>
                <Input
                  id="short_name"
                  value={formData.short_name}
                  onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                  placeholder="ej: M-SEN"
                  maxLength={10}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gender">Género</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mixto (todos)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mixto (todos)</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="min_age">Edad mínima</Label>
                <Input
                  id="min_age"
                  type="number"
                  value={formData.min_age}
                  onChange={(e) => setFormData({ ...formData, min_age: e.target.value })}
                  placeholder="Sin mínimo"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max_age">Edad máxima</Label>
                <Input
                  id="max_age"
                  type="number"
                  value={formData.max_age}
                  onChange={(e) => setFormData({ ...formData, max_age: e.target.value })}
                  placeholder="Sin máximo"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="age_calculation_date">Fecha de cálculo de edad</Label>
              <Input
                id="age_calculation_date"
                type="date"
                value={formData.age_calculation_date}
                onChange={(e) => setFormData({ ...formData, age_calculation_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Fecha para calcular la edad del participante (ej: 31/12 del año, día de la carrera)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="display_order">Orden de visualización</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingCategory ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cargar plantilla */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar categorías desde plantilla</DialogTitle>
            <DialogDescription>
              Selecciona una plantilla para crear las categorías automáticamente.
              {categories.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 block mt-2">
                  ⚠️ Las categorías existentes serán eliminadas antes de cargar la plantilla.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Plantilla</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Selecciona una plantilla" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                    {template.is_default && " (por defecto)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.find(t => t.id === selectedTemplateId)?.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {templates.find(t => t.id === selectedTemplateId)?.description}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setTemplateDialogOpen(false);
              setSelectedTemplateId("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (categories.length > 0) {
                  await deleteAllCategories();
                }
                await loadFromTemplate();
              }}
              disabled={!selectedTemplateId || loadingTemplate}
            >
              {loadingTemplate ? "Cargando..." : "Cargar plantilla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la categoría "{categoryToDelete?.name}". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
