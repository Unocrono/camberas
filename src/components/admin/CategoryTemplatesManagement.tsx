import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Layers, 
  ChevronRight, 
  ChevronDown,
  Star,
  Copy
} from "lucide-react";

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
  min_age: number | null;
  max_age: number | null;
  age_dependent: boolean;
  display_order: number;
}

export function CategoryTemplatesManagement() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CategoryTemplate | null>(null);
  const [templateItems, setTemplateItems] = useState<CategoryTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  // Template dialogs
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [deleteTemplateDialogOpen, setDeleteTemplateDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<CategoryTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CategoryTemplate | null>(null);

  // Item dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CategoryTemplateItem | null>(null);
  const [editingItem, setEditingItem] = useState<CategoryTemplateItem | null>(null);

  const [templateFormData, setTemplateFormData] = useState({
    name: "",
    description: "",
    is_default: false,
  });

  const [itemFormData, setItemFormData] = useState({
    name: "",
    short_name: "",
    min_age: "",
    max_age: "",
    age_dependent: true,
    display_order: "0",
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (expandedTemplateId) {
      fetchTemplateItems(expandedTemplateId);
    } else {
      setTemplateItems([]);
    }
  }, [expandedTemplateId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("category_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
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

  const fetchTemplateItems = async (templateId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from("category_template_items")
        .select("*")
        .eq("template_id", templateId)
        .order("display_order");

      if (error) throw error;
      setTemplateItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  // Template CRUD
  const openCreateTemplateDialog = () => {
    setEditingTemplate(null);
    setTemplateFormData({
      name: "",
      description: "",
      is_default: false,
    });
    setTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (template: CategoryTemplate) => {
    setEditingTemplate(template);
    setTemplateFormData({
      name: template.name,
      description: template.description || "",
      is_default: template.is_default,
    });
    setTemplateDialogOpen(true);
  };

  const handleSubmitTemplate = async () => {
    if (!templateFormData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      const templateData = {
        name: templateFormData.name.trim(),
        description: templateFormData.description.trim() || null,
        is_default: templateFormData.is_default,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("category_templates")
          .update(templateData)
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast({ title: "Plantilla actualizada" });
      } else {
        const { error } = await supabase
          .from("category_templates")
          .insert(templateData);

        if (error) throw error;
        toast({ title: "Plantilla creada" });
      }

      setTemplateDialogOpen(false);
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      // First delete all items
      await supabase
        .from("category_template_items")
        .delete()
        .eq("template_id", templateToDelete.id);

      // Then delete template
      const { error } = await supabase
        .from("category_templates")
        .delete()
        .eq("id", templateToDelete.id);

      if (error) throw error;

      toast({ title: "Plantilla eliminada" });
      setDeleteTemplateDialogOpen(false);
      setTemplateToDelete(null);
      if (expandedTemplateId === templateToDelete.id) {
        setExpandedTemplateId(null);
      }
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const duplicateTemplate = async (template: CategoryTemplate) => {
    try {
      // Create new template
      const { data: newTemplate, error: templateError } = await supabase
        .from("category_templates")
        .insert({
          name: `${template.name} (copia)`,
          description: template.description,
          is_default: false,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Get items from original template
      const { data: items, error: itemsError } = await supabase
        .from("category_template_items")
        .select("*")
        .eq("template_id", template.id);

      if (itemsError) throw itemsError;

      // Copy items to new template
      if (items && items.length > 0) {
        const newItems = items.map((item) => ({
          template_id: newTemplate.id,
          name: item.name,
          short_name: item.short_name,
          gender: item.gender,
          min_age: item.min_age,
          max_age: item.max_age,
          display_order: item.display_order,
        }));

        const { error: insertError } = await supabase
          .from("category_template_items")
          .insert(newItems);

        if (insertError) throw insertError;
      }

      toast({ title: "Plantilla duplicada" });
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Item CRUD
  const openCreateItemDialog = () => {
    if (!expandedTemplateId) return;
    setEditingItem(null);
    setItemFormData({
      name: "",
      short_name: "",
      min_age: "",
      max_age: "",
      age_dependent: true,
      display_order: String(templateItems.length + 1),
    });
    setItemDialogOpen(true);
  };

  const openEditItemDialog = (item: CategoryTemplateItem) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      short_name: item.short_name || "",
      min_age: item.min_age?.toString() || "",
      max_age: item.max_age?.toString() || "",
      age_dependent: item.age_dependent ?? true,
      display_order: item.display_order.toString(),
    });
    setItemDialogOpen(true);
  };

  const handleSubmitItem = async () => {
    if (!expandedTemplateId || !itemFormData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      const itemData = {
        template_id: expandedTemplateId,
        name: itemFormData.name.trim(),
        short_name: itemFormData.short_name.trim() || itemFormData.name.trim().substring(0, 6).toUpperCase(),
        min_age: itemFormData.min_age ? parseInt(itemFormData.min_age) : null,
        max_age: itemFormData.max_age ? parseInt(itemFormData.max_age) : null,
        age_dependent: itemFormData.age_dependent,
        display_order: parseInt(itemFormData.display_order) || 0,
      };

      if (editingItem) {
        const { error } = await supabase
          .from("category_template_items")
          .update(itemData)
          .eq("id", editingItem.id);

        if (error) throw error;
        toast({ title: "Categoría actualizada" });
      } else {
        const { error } = await supabase
          .from("category_template_items")
          .insert(itemData);

        if (error) throw error;
        toast({ title: "Categoría creada" });
      }

      setItemDialogOpen(false);
      fetchTemplateItems(expandedTemplateId);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from("category_template_items")
        .delete()
        .eq("id", itemToDelete.id);

      if (error) throw error;

      toast({ title: "Categoría eliminada" });
      setDeleteItemDialogOpen(false);
      setItemToDelete(null);
      if (expandedTemplateId) {
        fetchTemplateItems(expandedTemplateId);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getAgeDependentLabel = (ageDependent: boolean) => {
    return ageDependent ? "Automática" : "Manual";
  };

  const getAgeRange = (min: number | null, max: number | null) => {
    if (min === null && max === null) return "Sin límite";
    if (min === null) return `≤ ${max} años`;
    if (max === null || max >= 999) return `≥ ${min} años`;
    return `${min} - ${max} años`;
  };

  const toggleExpanded = (templateId: string) => {
    setExpandedTemplateId(expandedTemplateId === templateId ? null : templateId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Plantillas de Categorías
              </CardTitle>
              <CardDescription>
                Gestiona plantillas reutilizables de categorías para carreras
              </CardDescription>
            </div>
            <Button onClick={openCreateTemplateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Plantilla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay plantillas creadas</p>
              <p className="text-sm mb-4">Crea una plantilla para reutilizar categorías</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="border rounded-lg">
                  {/* Template Header */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpanded(template.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedTemplateId === template.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{template.name}</span>
                          {template.is_default && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3" />
                              Por defecto
                            </Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => duplicateTemplate(template)}
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditTemplateDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setTemplateToDelete(template);
                          setDeleteTemplateDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Template Items */}
                  {expandedTemplateId === template.id && (
                    <div className="border-t bg-muted/20 p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium">Categorías de la plantilla</h4>
                        <Button size="sm" onClick={openCreateItemDialog}>
                          <Plus className="h-4 w-4 mr-2" />
                          Añadir Categoría
                        </Button>
                      </div>

                      {loadingItems ? (
                        <Skeleton className="h-32 w-full" />
                      ) : templateItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay categorías en esta plantilla
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Orden</TableHead>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Abrev.</TableHead>
                              <TableHead>Cálculo Edad</TableHead>
                              <TableHead>Rango Edad</TableHead>
                              <TableHead className="w-24">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {templateItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.display_order}</TableCell>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{item.short_name || "-"}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={item.age_dependent ? "default" : "outline"}>
                                    {getAgeDependentLabel(item.age_dependent)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{getAgeRange(item.min_age, item.max_age)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditItemDialog(item)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setItemToDelete(item);
                                        setDeleteItemDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Modifica los datos de la plantilla"
                : "Crea una nueva plantilla de categorías"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Nombre *</Label>
              <Input
                id="template-name"
                value={templateFormData.name}
                onChange={(e) =>
                  setTemplateFormData({ ...templateFormData, name: e.target.value })
                }
                placeholder="Ej: RFEA Oficial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Descripción</Label>
              <Textarea
                id="template-description"
                value={templateFormData.description}
                onChange={(e) =>
                  setTemplateFormData({ ...templateFormData, description: e.target.value })
                }
                placeholder="Descripción opcional de la plantilla"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="template-default"
                checked={templateFormData.is_default}
                onCheckedChange={(checked) =>
                  setTemplateFormData({ ...templateFormData, is_default: checked as boolean })
                }
              />
              <Label htmlFor="template-default" className="cursor-pointer">
                Plantilla por defecto
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitTemplate}>
              {editingTemplate ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <AlertDialog open={deleteTemplateDialogOpen} onOpenChange={setDeleteTemplateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la plantilla "{templateToDelete?.name}" y todas sus categorías.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar Categoría" : "Nueva Categoría"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Modifica los datos de la categoría"
                : "Añade una nueva categoría a la plantilla"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Nombre *</Label>
                <Input
                  id="item-name"
                  value={itemFormData.name}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, name: e.target.value })
                  }
                  placeholder="Ej: Senior Masculino"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-short-name">Abreviatura</Label>
                <Input
                  id="item-short-name"
                  value={itemFormData.short_name}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, short_name: e.target.value })
                  }
                  placeholder="Ej: SM"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 py-2">
              <Checkbox
                id="item-age-dependent"
                checked={itemFormData.age_dependent}
                onCheckedChange={(checked) =>
                  setItemFormData({ ...itemFormData, age_dependent: checked as boolean })
                }
              />
              <Label htmlFor="item-age-dependent" className="cursor-pointer">
                Dependiente de la edad
              </Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Si está activado, la categoría se asignará según la edad del corredor
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-min-age">Edad mínima</Label>
                <Input
                  id="item-min-age"
                  type="number"
                  value={itemFormData.min_age}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, min_age: e.target.value })
                  }
                  placeholder="Ej: 20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-max-age">Edad máxima</Label>
                <Input
                  id="item-max-age"
                  type="number"
                  value={itemFormData.max_age}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, max_age: e.target.value })
                  }
                  placeholder="Ej: 34"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-order">Orden</Label>
              <Input
                id="item-order"
                type="number"
                value={itemFormData.display_order}
                onChange={(e) =>
                  setItemFormData({ ...itemFormData, display_order: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitItem}>
              {editingItem ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la categoría "{itemToDelete?.name}" de la plantilla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
