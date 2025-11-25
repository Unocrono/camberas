import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Eye, EyeOff, GripVertical, Save, Info } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface RaceRegulationManagementProps {
  raceId: string;
}

interface Race {
  name: string;
  date: string;
  location: string;
}

interface Distance {
  name: string;
  distance_km: number;
}

interface RegulationSection {
  id: string;
  section_type: string;
  title: string;
  content: string;
  section_order: number;
  is_required: boolean;
}

interface Regulation {
  id: string;
  published: boolean;
  version: number;
}

const PREDEFINED_SECTIONS = [
  { type: "general_info", title: "Información General", is_required: true },
  { type: "course", title: "Recorrido y Perfil", is_required: true },
  { type: "registration", title: "Inscripción", is_required: true },
  { type: "mandatory_gear", title: "Material Obligatorio", is_required: true },
  { type: "aid_stations", title: "Avituallamientos y Asistencias", is_required: false },
  { type: "cutoff_times", title: "Horarios y Tiempos de Corte", is_required: true },
  { type: "bib_collection", title: "Recogida de Dorsales", is_required: false },
  { type: "medical", title: "Aspectos Médicos y Seguros", is_required: true },
  { type: "disqualifications", title: "Descalificaciones", is_required: true },
  { type: "classifications", title: "Clasificaciones y Premios", is_required: false },
  { type: "refund_policy", title: "Política de Devoluciones", is_required: true },
  { type: "data_protection", title: "Protección de Datos", is_required: true },
  { type: "image_rights", title: "Derechos de Imagen", is_required: true },
  { type: "responsibility", title: "Responsabilidad y Riesgos", is_required: true },
  { type: "environment", title: "Medio Ambiente", is_required: false },
  { type: "custom", title: "Sección Personalizada", is_required: false }
];

function SortableSection({ section, onUpdate, onDelete, raceData, distances }: {
  section: RegulationSection;
  onUpdate: (id: string, field: string, value: any) => void;
  onDelete: (id: string) => void;
  raceData: Race | null;
  distances: Distance[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById(`content-${section.id}`) as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = section.content;
      const newText = text.substring(0, start) + variable + text.substring(end);
      onUpdate(section.id, 'content', newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <Input
                value={section.title}
                onChange={(e) => onUpdate(section.id, 'title', e.target.value)}
                className="font-semibold"
                placeholder="Título de la sección"
              />
            </div>
            {section.is_required && (
              <Badge variant="secondary">Obligatoria</Badge>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar sección?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminará permanentemente esta sección del reglamento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(section.id)}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`content-${section.id}`}>Contenido</Label>
              <Textarea
                id={`content-${section.id}`}
                value={section.content}
                onChange={(e) => onUpdate(section.id, 'content', e.target.value)}
                placeholder="Escribe el contenido de esta sección..."
                className="min-h-[150px] mt-1"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Variables disponibles:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable('{{race_name}}')}
              >
                {'{{race_name}}'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable('{{race_date}}')}
              >
                {'{{race_date}}'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable('{{race_location}}')}
              >
                {'{{race_location}}'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable('{{distances}}')}
              >
                {'{{distances}}'}
              </Button>
            </div>
            {section.content && (
              <div className="mt-3 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground mb-2">Vista previa:</p>
                <p className="text-sm whitespace-pre-wrap">
                  {section.content
                    .replace(/\{\{race_name\}\}/g, raceData?.name || '[Nombre de la carrera]')
                    .replace(/\{\{race_date\}\}/g, raceData?.date ? new Date(raceData.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '[Fecha]')
                    .replace(/\{\{race_location\}\}/g, raceData?.location || '[Ubicación]')
                    .replace(/\{\{distances\}\}/g, distances.map(d => `${d.name} (${d.distance_km}km)`).join(', ') || '[Distancias]')
                  }
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RaceRegulationManagement({ raceId }: RaceRegulationManagementProps) {
  const [regulation, setRegulation] = useState<Regulation | null>(null);
  const [sections, setSections] = useState<RegulationSection[]>([]);
  const [raceData, setRaceData] = useState<Race | null>(null);
  const [distances, setDistances] = useState<Distance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (raceId) {
      fetchRegulation();
      fetchRaceData();
      fetchDistances();
    }
  }, [raceId]);

  const fetchRaceData = async () => {
    try {
      const { data, error } = await supabase
        .from('races')
        .select('name, date, location')
        .eq('id', raceId)
        .single();

      if (error) throw error;
      setRaceData(data);
    } catch (error: any) {
      console.error('Error fetching race data:', error);
    }
  };

  const fetchDistances = async () => {
    try {
      const { data, error } = await supabase
        .from('race_distances')
        .select('name, distance_km')
        .eq('race_id', raceId)
        .order('distance_km', { ascending: false });

      if (error) throw error;
      setDistances(data || []);
    } catch (error: any) {
      console.error('Error fetching distances:', error);
    }
  };

  const fetchRegulation = async () => {
    try {
      setLoading(true);
      
      let { data: regulationData, error: regError } = await supabase
        .from('race_regulations')
        .select('*')
        .eq('race_id', raceId)
        .maybeSingle();

      if (regError) throw regError;

      if (!regulationData) {
        const { data: newReg, error: createError } = await supabase
          .from('race_regulations')
          .insert({ race_id: raceId })
          .select()
          .single();

        if (createError) throw createError;
        regulationData = newReg;
      }

      setRegulation(regulationData);

      const { data: sectionsData, error: sectionsError } = await supabase
        .from('race_regulation_sections')
        .select('*')
        .eq('regulation_id', regulationData.id)
        .order('section_order');

      if (sectionsError) throw sectionsError;
      setSections(sectionsData || []);
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

  const handleAddSection = async (sectionType: string) => {
    if (!regulation) return;

    const predefinedSection = PREDEFINED_SECTIONS.find(s => s.type === sectionType);
    if (!predefinedSection) return;

    try {
      const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.section_order)) : 0;

      const { data, error } = await supabase
        .from('race_regulation_sections')
        .insert({
          regulation_id: regulation.id,
          section_type: sectionType,
          title: predefinedSection.title,
          content: '',
          section_order: maxOrder + 1,
          is_required: predefinedSection.is_required,
        })
        .select()
        .single();

      if (error) throw error;

      setSections([...sections, data]);
      toast({
        title: "Sección añadida",
        description: `Se ha añadido la sección "${predefinedSection.title}"`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateSection = (id: string, field: string, value: any) => {
    setSections(sections.map(section => 
      section.id === id ? { ...section, [field]: value } : section
    ));
  };

  const handleDeleteSection = async (id: string) => {
    try {
      const { error } = await supabase
        .from('race_regulation_sections')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSections(sections.filter(s => s.id !== id));
      toast({
        title: "Sección eliminada",
        description: "La sección se ha eliminado correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        return newItems.map((item, index) => ({
          ...item,
          section_order: index
        }));
      });
    }
  };

  const handleSave = async () => {
    if (!regulation) return;

    try {
      setSaving(true);

      for (const section of sections) {
        const { error } = await supabase
          .from('race_regulation_sections')
          .update({
            title: section.title,
            content: section.content,
            section_order: section.section_order,
          })
          .eq('id', section.id);

        if (error) throw error;
      }

      toast({
        title: "Cambios guardados",
        description: "El reglamento se ha actualizado correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!regulation) return;

    try {
      const { error } = await supabase
        .from('race_regulations')
        .update({ published: !regulation.published })
        .eq('id', regulation.id);

      if (error) throw error;

      setRegulation({ ...regulation, published: !regulation.published });
      toast({
        title: regulation.published ? "Reglamento despublicado" : "Reglamento publicado",
        description: regulation.published 
          ? "El reglamento ya no es visible públicamente"
          : "El reglamento ahora es visible para todos",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="p-6">Cargando reglamento...</div>;
  }

  const availableSections = PREDEFINED_SECTIONS.filter(
    predefined => !sections.some(section => section.section_type === predefined.type)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reglamento de la Carrera</h2>
          <p className="text-muted-foreground">
            Gestiona las secciones del reglamento de tu carrera
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="publish-toggle">
              {regulation?.published ? 'Publicado' : 'Borrador'}
            </Label>
            <Switch
              id="publish-toggle"
              checked={regulation?.published || false}
              onCheckedChange={handleTogglePublish}
            />
            {regulation?.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      <Separator />

      {raceData && (
        <Card>
          <CardHeader>
            <CardTitle>Información de la Carrera</CardTitle>
            <CardDescription>
              Estos datos se insertarán automáticamente en el reglamento usando variables
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-semibold">Nombre:</span> {raceData.name}
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {new Date(raceData.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div>
              <span className="font-semibold">Ubicación:</span> {raceData.location}
            </div>
            <div>
              <span className="font-semibold">Distancias:</span> {distances.map(d => `${d.name} (${d.distance_km}km)`).join(', ')}
            </div>
          </CardContent>
        </Card>
      )}

      {availableSections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Añadir Sección</CardTitle>
            <CardDescription>
              Selecciona una sección predefinida para añadir al reglamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableSections.map((section) => (
                <Button
                  key={section.type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddSection(section.type)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {section.title}
                  {section.is_required && <span className="ml-1 text-destructive">*</span>}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sections.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold mb-4">Secciones del Reglamento</h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  onUpdate={handleUpdateSection}
                  onDelete={handleDeleteSection}
                  raceData={raceData}
                  distances={distances}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay secciones en el reglamento. Añade una sección para comenzar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}