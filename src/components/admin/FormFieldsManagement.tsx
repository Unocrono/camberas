import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, FileText, Eye, EyeOff, Sparkles, Lock } from "lucide-react";
import { z } from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const fieldSchema = z.object({
  field_name: z.string()
    .trim()
    .min(1, "El nombre del campo es requerido")
    .max(100, "Máximo 100 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y guiones bajos"),
  field_label: z.string()
    .trim()
    .min(1, "La etiqueta es requerida")
    .max(200, "Máximo 200 caracteres"),
  field_type: z.enum(["text", "email", "tel", "url", "number", "date", "textarea", "select", "checkbox", "radio"]),
  placeholder: z.string().max(200, "Máximo 200 caracteres").optional(),
  help_text: z.string().max(500, "Máximo 500 caracteres").optional(),
  is_required: z.boolean(),
});

interface FormField {
  id: string;
  race_id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_order: number;
  is_required: boolean;
  placeholder?: string | null;
  help_text?: string | null;
  field_options?: any;
  is_system_field?: boolean;
  is_visible?: boolean;
}

interface FormFieldsManagementProps {
  isOrganizer?: boolean;
}

interface SortableFieldItemProps {
  field: FormField;
  fieldTypeLabels: Record<string, string>;
  onEdit: (field: FormField) => void;
  onDelete: (fieldId: string) => void;
  onToggleVisibility: (field: FormField) => void;
}

function SortableFieldItem({ field, fieldTypeLabels, onEdit, onDelete, onToggleVisibility }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  const isSystemField = field.is_system_field === true;
  const isVisible = field.is_visible !== false;

  // Get options from field_options - handle both formats (array or {options: []})
  const options = Array.isArray(field.field_options) 
    ? field.field_options 
    : field.field_options?.options || [];

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={`cursor-default hover:shadow-md transition-shadow ${!isVisible ? 'opacity-60 bg-muted/30' : ''} ${isSystemField ? 'border-primary/30' : ''}`}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3 flex-1">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing mt-1 touch-none p-1 rounded hover:bg-muted/50 transition-colors"
              aria-label="Arrastrar para reordenar"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{field.field_label}</CardTitle>
                {isSystemField && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    <Lock className="h-3 w-3" />
                    Sistema
                  </span>
                )}
                {!isVisible && (
                  <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    <EyeOff className="h-3 w-3" />
                    Oculto
                  </span>
                )}
              </div>
              <CardDescription className="mt-1">
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {field.field_name}
                </span>
                <span className="mx-2">•</span>
                <span>{fieldTypeLabels[field.field_type]}</span>
                {field.is_required && (
                  <>
                    <span className="mx-2">•</span>
                    <span className="text-destructive">Obligatorio</span>
                  </>
                )}
              </CardDescription>
              {field.help_text && (
                <p className="text-sm text-muted-foreground mt-2">{field.help_text}</p>
              )}
              {options.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Opciones:</p>
                  <div className="flex flex-wrap gap-1">
                    {options.map((opt: string, i: number) => (
                      <span key={i} className="text-xs bg-muted px-2 py-1 rounded">
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle visibility */}
            <div className="flex items-center gap-2">
              <Switch
                checked={isVisible}
                onCheckedChange={() => onToggleVisibility(field)}
                aria-label={isVisible ? "Ocultar campo" : "Mostrar campo"}
              />
              {isVisible ? (
                <Eye className="h-4 w-4 text-muted-foreground" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => onEdit(field)}>
                <Pencil className="h-4 w-4" />
              </Button>
              {!isSystemField && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar campo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. El campo será eliminado permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(field.id)}>
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function FormFieldsManagement({ isOrganizer = false }: FormFieldsManagementProps) {
  const { toast } = useToast();
  const [races, setRaces] = useState<any[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [seedingFields, setSeedingFields] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const [formData, setFormData] = useState({
    field_name: "",
    field_label: "",
    field_type: "text",
    placeholder: "",
    help_text: "",
    is_required: false,
    options: [] as string[],
  });

  const [optionInput, setOptionInput] = useState("");

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    if (selectedRaceId) {
      fetchFields();
    }
  }, [selectedRaceId]);

  const fetchRaces = async () => {
    try {
      let query = supabase
        .from("races")
        .select("id, name, date")
        .order("date", { ascending: false });
      
      if (isOrganizer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.eq("organizer_id", user.id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setRaces(data || []);
      
      if (data && data.length > 0) {
        setSelectedRaceId(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar carreras",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFields = async () => {
    if (!selectedRaceId) return;

    try {
      const { data, error } = await supabase
        .from("registration_form_fields")
        .select("*")
        .eq("race_id", selectedRaceId)
        .order("field_order", { ascending: true });

      if (error) throw error;
      setFields(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar campos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSeedDefaultFields = async () => {
    if (!selectedRaceId) return;

    setSeedingFields(true);
    try {
      const { error } = await supabase.rpc("seed_default_registration_fields", {
        p_race_id: selectedRaceId,
      });

      if (error) throw error;

      toast({
        title: "Campos creados",
        description: "Los campos predeterminados se han creado exitosamente",
      });

      fetchFields();
    } catch (error: any) {
      toast({
        title: "Error al crear campos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSeedingFields(false);
    }
  };

  const handleOpenDialog = (field?: FormField) => {
    if (field) {
      setEditingField(field);
      // Get options from field_options - handle both formats
      const options = Array.isArray(field.field_options) 
        ? field.field_options 
        : field.field_options?.options || [];
      
      setFormData({
        field_name: field.field_name,
        field_label: field.field_label,
        field_type: field.field_type,
        placeholder: field.placeholder || "",
        help_text: field.help_text || "",
        is_required: field.is_required,
        options: options,
      });
    } else {
      setEditingField(null);
      setFormData({
        field_name: "",
        field_label: "",
        field_type: "text",
        placeholder: "",
        help_text: "",
        is_required: false,
        options: [],
      });
    }
    setOptionInput("");
    setIsDialogOpen(true);
  };

  const handleAddOption = () => {
    if (optionInput.trim()) {
      setFormData({
        ...formData,
        options: [...formData.options, optionInput.trim()],
      });
      setOptionInput("");
    }
  };

  const handleRemoveOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  const handleToggleVisibility = async (field: FormField) => {
    const newVisibility = field.is_visible === false ? true : false;

    try {
      const { error } = await supabase
        .from("registration_form_fields")
        .update({ is_visible: newVisibility })
        .eq("id", field.id);

      if (error) throw error;

      toast({
        title: newVisibility ? "Campo visible" : "Campo oculto",
        description: `El campo "${field.field_label}" ahora está ${newVisibility ? 'visible' : 'oculto'}`,
      });

      fetchFields();
    } catch (error: any) {
      toast({
        title: "Error al actualizar visibilidad",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const isSystemField = editingField?.is_system_field === true;

    try {
      // For system fields, only validate label
      if (isSystemField) {
        if (!formData.field_label.trim()) {
          throw new Error("La etiqueta es requerida");
        }

        const fieldOptions = ["select", "radio"].includes(formData.field_type)
          ? formData.options
          : null;

        const { error } = await supabase
          .from("registration_form_fields")
          .update({
            field_label: formData.field_label.trim(),
            field_options: fieldOptions,
            is_required: formData.is_required,
          })
          .eq("id", editingField!.id);

        if (error) throw error;

        toast({
          title: "Campo actualizado",
          description: "El campo se ha actualizado exitosamente",
        });
      } else {
        const validatedData = fieldSchema.parse({
          field_name: formData.field_name,
          field_label: formData.field_label,
          field_type: formData.field_type,
          placeholder: formData.placeholder || undefined,
          help_text: formData.help_text || undefined,
          is_required: formData.is_required,
        });

        const fieldOptions = ["select", "radio"].includes(formData.field_type)
          ? { options: formData.options }
          : null;

        if (editingField) {
          const { error } = await supabase
            .from("registration_form_fields")
            .update({
              field_name: validatedData.field_name,
              field_label: validatedData.field_label,
              field_type: validatedData.field_type,
              placeholder: validatedData.placeholder || null,
              help_text: validatedData.help_text || null,
              is_required: validatedData.is_required,
              field_options: fieldOptions,
            })
            .eq("id", editingField.id);

          if (error) throw error;

          toast({
            title: "Campo actualizado",
            description: "El campo se ha actualizado exitosamente",
          });
        } else {
          const maxOrder = fields.length > 0 
            ? Math.max(...fields.map(f => f.field_order)) 
            : 0;

          const { error } = await supabase
            .from("registration_form_fields")
            .insert([{
              race_id: selectedRaceId,
              field_name: validatedData.field_name,
              field_label: validatedData.field_label,
              field_type: validatedData.field_type,
              field_order: maxOrder + 1,
              placeholder: validatedData.placeholder || null,
              help_text: validatedData.help_text || null,
              is_required: validatedData.is_required,
              field_options: fieldOptions,
              is_system_field: false,
              is_visible: true,
            }]);

          if (error) throw error;

          toast({
            title: "Campo creado",
            description: "El campo se ha creado exitosamente",
          });
        }
      }

      setIsDialogOpen(false);
      fetchFields();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from("registration_form_fields")
        .delete()
        .eq("id", fieldId);

      if (error) throw error;

      toast({
        title: "Campo eliminado",
        description: "El campo se ha eliminado exitosamente",
      });

      fetchFields();
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);

    const newFields = arrayMove(fields, oldIndex, newIndex);
    setFields(newFields);

    // Update field_order in database
    try {
      const updates = newFields.map((field, index) => ({
        id: field.id,
        field_order: index + 1,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("registration_form_fields")
          .update({ field_order: update.field_order })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({
        title: "Orden actualizado",
        description: "El orden de los campos se ha actualizado exitosamente",
      });
    } catch (error: any) {
      toast({
        title: "Error al actualizar orden",
        description: error.message,
        variant: "destructive",
      });
      // Revert on error
      fetchFields();
    }
  };

  const fieldTypeLabels: Record<string, string> = {
    text: "Texto",
    email: "Email",
    tel: "Teléfono",
    url: "URL",
    number: "Número",
    date: "Fecha",
    textarea: "Área de texto",
    select: "Lista desplegable",
    checkbox: "Casilla de verificación",
    radio: "Opción múltiple",
  };

  const hasSystemFields = fields.some(f => f.is_system_field === true);

  if (loading) {
    return <div className="text-muted-foreground">Cargando...</div>;
  }

  if (races.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No hay carreras</h3>
          <p className="text-muted-foreground">Crea una carrera primero para añadir campos personalizados</p>
        </CardContent>
      </Card>
    );
  }

  const isSystemFieldEditing = editingField?.is_system_field === true;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <h2 className="text-3xl font-bold">Campos de Inscripción</h2>
          <p className="text-muted-foreground">
            Personaliza el formulario de inscripción. Arrastra los campos para reordenarlos.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedRaceId} onValueChange={setSelectedRaceId}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Selecciona una carrera" />
            </SelectTrigger>
            <SelectContent>
              {races.map((race) => (
                <SelectItem key={race.id} value={race.id}>
                  {race.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!hasSystemFields && (
            <Button 
              variant="outline" 
              onClick={handleSeedDefaultFields}
              disabled={seedingFields}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {seedingFields ? "Creando..." : "Cargar Campos Predeterminados"}
            </Button>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Campo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingField ? "Editar Campo" : "Nuevo Campo"}
                  {isSystemFieldEditing && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      <Lock className="h-3 w-3" />
                      Campo del Sistema
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {isSystemFieldEditing 
                    ? "Modifica la etiqueta y opciones del campo. El nombre y tipo no se pueden cambiar."
                    : editingField 
                      ? "Modifica el campo del formulario" 
                      : "Añade un nuevo campo al formulario de inscripción"
                  }
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="field_name">Nombre del Campo (ID) *</Label>
                    <Input
                      id="field_name"
                      value={formData.field_name}
                      onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                      placeholder="ej: talla_camiseta"
                      required={!isSystemFieldEditing}
                      disabled={!!editingField || isSystemFieldEditing}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isSystemFieldEditing 
                        ? "No se puede cambiar en campos del sistema."
                        : "Solo letras, números y guiones bajos. No se puede cambiar después."
                      }
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="field_label">Etiqueta Visible *</Label>
                    <Input
                      id="field_label"
                      value={formData.field_label}
                      onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                      placeholder="ej: Talla de Camiseta"
                      required
                    />
                  </div>
                </div>

                {!isSystemFieldEditing && (
                  <div className="space-y-2">
                    <Label htmlFor="field_type">Tipo de Campo *</Label>
                    <Select
                      value={formData.field_type}
                      onValueChange={(value) => setFormData({ ...formData, field_type: value, options: [] })}
                      disabled={isSystemFieldEditing}
                    >
                      <SelectTrigger id="field_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(fieldTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!isSystemFieldEditing && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="placeholder">Placeholder (texto de ayuda)</Label>
                      <Input
                        id="placeholder"
                        value={formData.placeholder}
                        onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                        placeholder="ej: Selecciona tu talla"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="help_text">Texto de Ayuda</Label>
                      <Textarea
                        id="help_text"
                        value={formData.help_text}
                        onChange={(e) => setFormData({ ...formData, help_text: e.target.value })}
                        placeholder="Información adicional para el usuario"
                        rows={2}
                      />
                    </div>
                  </>
                )}

                {["select", "radio"].includes(formData.field_type) && (
                  <div className="space-y-2">
                    <Label>Opciones</Label>
                    <div className="flex gap-2">
                      <Input
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                        placeholder="Añadir opción"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddOption();
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddOption}>
                        Añadir
                      </Button>
                    </div>
                    <div className="space-y-2 mt-2">
                      {formData.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{option}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOption(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_required"
                    checked={formData.is_required}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked as boolean })}
                  />
                  <Label htmlFor="is_required" className="cursor-pointer">
                    Campo obligatorio
                  </Label>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : editingField ? "Actualizar Campo" : "Crear Campo"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {fields.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No hay campos configurados</h3>
              <p className="text-muted-foreground mb-4">
                Haz clic en "Cargar Campos Predeterminados" para añadir los campos estándar del formulario de inscripción.
              </p>
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {fields.map((field) => (
                  <SortableFieldItem
                    key={field.id}
                    field={field}
                    fieldTypeLabels={fieldTypeLabels}
                    onEdit={handleOpenDialog}
                    onDelete={handleDelete}
                    onToggleVisibility={handleToggleVisibility}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
