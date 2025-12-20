import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, Loader2 } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface MenuItem {
  id: string;
  menu_type: string;
  title: string;
  icon: string;
  route: string | null;
  view_name: string | null;
  parent_id: string | null;
  group_label: string | null;
  display_order: number;
  is_visible: boolean;
  requires_auth: boolean;
  created_at: string;
  updated_at: string;
}

const AVAILABLE_ICONS = [
  "Calendar", "Users", "Home", "Trophy", "Timer", "Route", "FolderOpen", "HelpCircle",
  "UserCircle", "Map", "Scale", "FileText", "Shirt", "MapPin", "UserCog", "Radio",
  "Clock", "Flag", "Satellite", "Cpu", "Settings", "Zap", "Mail", "Bell", "Menu",
  "ShoppingBag", "Circle", "Square", "Triangle", "Star", "Heart", "Check", "X",
  "ChevronRight", "ArrowRight", "LayoutDashboard", "Layers", "Tag", "MessageSquare",
  "Image", "Video", "Music", "Download", "Upload", "Search", "Filter", "ListChecks"
];

const MENU_TYPES = [
  { value: "navbar", label: "Navbar (Usuario)" },
  { value: "organizer", label: "Organizador" },
  { value: "admin", label: "Administrador" },
];

const emptyMenuItem = {
  menu_type: "admin",
  title: "",
  icon: "Circle",
  route: "",
  view_name: "",
  group_label: "",
  display_order: 0,
  is_visible: true,
  requires_auth: false,
};

export function MenuManagement() {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMenuType, setSelectedMenuType] = useState<string>("admin");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState(emptyMenuItem);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);

  useEffect(() => {
    fetchMenuItems();
  }, [selectedMenuType]);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("menu_type", selectedMenuType)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setMenuItems((data as MenuItem[]) || []);
    } catch (error: any) {
      console.error("Error fetching menu items:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los elementos del menú",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        menu_type: item.menu_type,
        title: item.title,
        icon: item.icon,
        route: item.route || "",
        view_name: item.view_name || "",
        group_label: item.group_label || "",
        display_order: item.display_order,
        is_visible: item.is_visible,
        requires_auth: item.requires_auth,
      });
    } else {
      setEditingItem(null);
      setFormData({
        ...emptyMenuItem,
        menu_type: selectedMenuType,
        display_order: menuItems.length > 0 ? Math.max(...menuItems.map(m => m.display_order)) + 1 : 1,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "El título es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        menu_type: formData.menu_type,
        title: formData.title.trim(),
        icon: formData.icon,
        route: formData.route?.trim() || null,
        view_name: formData.view_name?.trim() || null,
        group_label: formData.group_label?.trim() || null,
        display_order: formData.display_order,
        is_visible: formData.is_visible,
        requires_auth: formData.requires_auth,
      };

      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
        toast({ title: "Éxito", description: "Elemento actualizado correctamente" });
      } else {
        const { error } = await supabase
          .from("menu_items")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Éxito", description: "Elemento creado correctamente" });
      }

      setDialogOpen(false);
      fetchMenuItems();
    } catch (error: any) {
      console.error("Error saving menu item:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el elemento",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", itemToDelete.id);

      if (error) throw error;

      toast({ title: "Éxito", description: "Elemento eliminado correctamente" });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchMenuItems();
    } catch (error: any) {
      console.error("Error deleting menu item:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el elemento",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_visible: !item.is_visible })
        .eq("id", item.id);

      if (error) throw error;
      fetchMenuItems();
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast({
        title: "Error",
        description: "No se pudo cambiar la visibilidad",
        variant: "destructive",
      });
    }
  };

  const handleMoveItem = async (item: MenuItem, direction: "up" | "down") => {
    const currentIndex = menuItems.findIndex(m => m.id === item.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= menuItems.length) return;
    
    const targetItem = menuItems[targetIndex];

    try {
      // Swap display orders
      await supabase
        .from("menu_items")
        .update({ display_order: targetItem.display_order })
        .eq("id", item.id);

      await supabase
        .from("menu_items")
        .update({ display_order: item.display_order })
        .eq("id", targetItem.id);

      fetchMenuItems();
    } catch (error: any) {
      console.error("Error moving item:", error);
      toast({
        title: "Error",
        description: "No se pudo reordenar el elemento",
        variant: "destructive",
      });
    }
  };

  const getIconComponent = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : <LucideIcons.Circle className="h-4 w-4" />;
  };

  // Group items by group_label for display
  const groupedItems = menuItems.reduce((acc, item) => {
    const label = item.group_label || "Sin grupo";
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Gestión de Menús</CardTitle>
              <CardDescription>
                Administra los elementos de los menús de navegación
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Añadir elemento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedMenuType} onValueChange={setSelectedMenuType}>
            <TabsList className="mb-4">
              {MENU_TYPES.map((type) => (
                <TabsTrigger key={type.value} value={type.value}>
                  {type.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {MENU_TYPES.map((type) => (
              <TabsContent key={type.value} value={type.value}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : menuItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay elementos en este menú
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedItems).map(([groupLabel, items]) => (
                      <div key={groupLabel} className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground px-2">
                          {groupLabel}
                        </h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10"></TableHead>
                                <TableHead className="w-10">Icono</TableHead>
                                <TableHead>Título</TableHead>
                                <TableHead className="hidden md:table-cell">Ruta/Vista</TableHead>
                                <TableHead className="hidden sm:table-cell">Orden</TableHead>
                                <TableHead className="w-24">Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((item, index) => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleMoveItem(item, "up")}
                                        disabled={index === 0}
                                      >
                                        <LucideIcons.ChevronUp className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleMoveItem(item, "down")}
                                        disabled={index === items.length - 1}
                                      >
                                        <LucideIcons.ChevronDown className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell>{getIconComponent(item.icon)}</TableCell>
                                  <TableCell className="font-medium">{item.title}</TableCell>
                                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                    {item.route || item.view_name || "-"}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell">{item.display_order}</TableCell>
                                  <TableCell>
                                    <Badge variant={item.is_visible ? "default" : "secondary"}>
                                      {item.is_visible ? "Visible" : "Oculto"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleToggleVisibility(item)}
                                        title={item.is_visible ? "Ocultar" : "Mostrar"}
                                      >
                                        {item.is_visible ? (
                                          <Eye className="h-4 w-4" />
                                        ) : (
                                          <EyeOff className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleOpenDialog(item)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          setItemToDelete(item);
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar elemento" : "Nuevo elemento de menú"}
            </DialogTitle>
            <DialogDescription>
              Configura las propiedades del elemento del menú
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="menu_type">Tipo de menú</Label>
                <Select
                  value={formData.menu_type}
                  onValueChange={(value) => setFormData({ ...formData, menu_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="icon">Icono</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) => setFormData({ ...formData, icon: value })}
                >
                  <SelectTrigger>
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        {getIconComponent(formData.icon)}
                        <span>{formData.icon}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {AVAILABLE_ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        <div className="flex items-center gap-2">
                          {getIconComponent(icon)}
                          <span>{icon}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Nombre del elemento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="group_label">Grupo (etiqueta)</Label>
              <Input
                id="group_label"
                value={formData.group_label}
                onChange={(e) => setFormData({ ...formData, group_label: e.target.value })}
                placeholder="ej: 🏃 Carreras"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="route">Ruta URL</Label>
                <Input
                  id="route"
                  value={formData.route}
                  onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                  placeholder="/ruta/externa"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="view_name">Vista interna</Label>
                <Input
                  id="view_name"
                  value={formData.view_name}
                  onChange={(e) => setFormData({ ...formData, view_name: e.target.value })}
                  placeholder="nombre-vista"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_order">Orden de visualización</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Visible</Label>
                <p className="text-sm text-muted-foreground">
                  El elemento se mostrará en el menú
                </p>
              </div>
              <Switch
                checked={formData.is_visible}
                onCheckedChange={(checked) => setFormData({ ...formData, is_visible: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Requiere autenticación</Label>
                <p className="text-sm text-muted-foreground">
                  Solo visible para usuarios autenticados
                </p>
              </div>
              <Switch
                checked={formData.requires_auth}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_auth: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingItem ? "Guardar cambios" : "Crear elemento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar elemento</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar "{itemToDelete?.title}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
