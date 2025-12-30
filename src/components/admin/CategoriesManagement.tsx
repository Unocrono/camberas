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
import { Plus, Pencil, Trash2, Users, Copy, ArrowUpDown } from "lucide-react";

interface RaceCategory {
  id: string;
  race_id: string;
  name: string;
  gender: string | null;
  min_age: number | null;
  max_age: number | null;
  display_order: number;
}

interface CategoriesManagementProps {
  selectedRaceId: string | null;
}

const DEFAULT_CATEGORIES = [
  { name: "M-Junior", gender: "M", min_age: 0, max_age: 19, display_order: 1 },
  { name: "M-Senior", gender: "M", min_age: 20, max_age: 34, display_order: 2 },
  { name: "M-VetA", gender: "M", min_age: 35, max_age: 44, display_order: 3 },
  { name: "M-VetB", gender: "M", min_age: 45, max_age: 54, display_order: 4 },
  { name: "M-VetC", gender: "M", min_age: 55, max_age: 64, display_order: 5 },
  { name: "M-VetD", gender: "M", min_age: 65, max_age: null, display_order: 6 },
  { name: "F-Junior", gender: "F", min_age: 0, max_age: 19, display_order: 7 },
  { name: "F-Senior", gender: "F", min_age: 20, max_age: 34, display_order: 8 },
  { name: "F-VetA", gender: "F", min_age: 35, max_age: 44, display_order: 9 },
  { name: "F-VetB", gender: "F", min_age: 45, max_age: 54, display_order: 10 },
  { name: "F-VetC", gender: "F", min_age: 55, max_age: 64, display_order: 11 },
  { name: "F-VetD", gender: "F", min_age: 65, max_age: null, display_order: 12 },
];

export function CategoriesManagement({ selectedRaceId }: CategoriesManagementProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<RaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<RaceCategory | null>(null);
  const [editingCategory, setEditingCategory] = useState<RaceCategory | null>(null);
  const [ageReference, setAgeReference] = useState<string>("race_date");
  const [savingReference, setSavingReference] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    gender: "",
    min_age: "",
    max_age: "",
    display_order: "0",
  });

  useEffect(() => {
    if (selectedRaceId) {
      fetchCategories();
      fetchAgeReference();
    }
  }, [selectedRaceId]);

  const fetchCategories = async () => {
    if (!selectedRaceId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("race_categories")
        .select("*")
        .eq("race_id", selectedRaceId)
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

  const fetchAgeReference = async () => {
    if (!selectedRaceId) return;
    
    try {
      const { data, error } = await supabase
        .from("races")
        .select("category_age_reference")
        .eq("id", selectedRaceId)
        .single();

      if (error) throw error;
      setAgeReference(data?.category_age_reference || "race_date");
    } catch (error: any) {
      console.error("Error fetching age reference:", error);
    }
  };

  const handleAgeReferenceChange = async (value: string) => {
    if (!selectedRaceId) return;
    
    setSavingReference(true);
    try {
      const { error } = await supabase
        .from("races")
        .update({ category_age_reference: value })
        .eq("id", selectedRaceId);

      if (error) throw error;
      
      setAgeReference(value);
      toast({
        title: "Guardado",
        description: "Referencia de edad actualizada",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingReference(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      gender: "",
      min_age: "",
      max_age: "",
      display_order: String(categories.length + 1),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (category: RaceCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      gender: category.gender || "",
      min_age: category.min_age?.toString() || "",
      max_age: category.max_age?.toString() || "",
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
        name: formData.name.trim(),
        gender: formData.gender || null,
        min_age: formData.min_age ? parseInt(formData.min_age) : null,
        max_age: formData.max_age ? parseInt(formData.max_age) : null,
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

  const loadDefaultCategories = async () => {
    if (!selectedRaceId) return;

    try {
      const categoriesToInsert = DEFAULT_CATEGORIES.map(cat => ({
        ...cat,
        race_id: selectedRaceId,
      }));

      const { error } = await supabase
        .from("race_categories")
        .insert(categoriesToInsert);

      if (error) throw error;
      
      toast({ title: "Categorías predefinidas cargadas" });
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getGenderLabel = (gender: string | null) => {
    if (!gender) return "Todos";
    return gender === "M" ? "Masculino" : "Femenino";
  };

  const getAgeRange = (min: number | null, max: number | null) => {
    if (min === null && max === null) return "Sin límite";
    if (min === null) return `≤ ${max} años`;
    if (max === null) return `≥ ${min} años`;
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
      {/* Configuración de referencia de edad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cálculo de Edad</CardTitle>
          <CardDescription>
            Define cómo se calcula la edad para asignar categorías
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="age-reference" className="whitespace-nowrap">
              Referencia de edad:
            </Label>
            <Select
              value={ageReference}
              onValueChange={handleAgeReferenceChange}
              disabled={savingReference}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="race_date">
                  Edad el día de la carrera
                </SelectItem>
                <SelectItem value="year_end">
                  Edad a 31/12 del año de la carrera
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de categorías */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Categorías de la Carrera
              </CardTitle>
              <CardDescription>
                Define las categorías de edad y género para clasificaciones
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {categories.length === 0 && (
                <Button variant="outline" onClick={loadDefaultCategories}>
                  <Copy className="h-4 w-4 mr-2" />
                  Cargar predefinidas
                </Button>
              )}
              <Button onClick={openCreateDialog}>
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
              <p className="text-sm">
                Carga las categorías predefinidas o crea las tuyas propias
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">
                    <ArrowUpDown className="h-4 w-4" />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Género</TableHead>
                  <TableHead>Rango de Edad</TableHead>
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
                    <TableCell>
                      <Badge variant={category.gender === "M" ? "default" : category.gender === "F" ? "secondary" : "outline"}>
                        {getGenderLabel(category.gender)}
                      </Badge>
                    </TableCell>
                    <TableCell>{getAgeRange(category.min_age, category.max_age)}</TableCell>
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
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ej: M-Senior, F-VetA"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gender">Género</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los géneros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
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
