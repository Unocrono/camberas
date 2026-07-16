import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  UserPlus, MapPin, Trophy, MessageCircle, HelpCircle, CreditCard, Settings, Users, LifeBuoy,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Iconos disponibles para las secciones (nombre lucide → componente)
export const HELP_ICONS: Record<string, any> = {
  UserPlus, MapPin, Trophy, MessageCircle, HelpCircle, CreditCard, Settings, Users, LifeBuoy,
};

interface HelpFaq {
  id: string;
  section_id: string;
  question: string;
  answer: string;
  display_order: number;
  is_visible: boolean;
}

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  display_order: number;
  is_visible: boolean;
  faqs: HelpFaq[];
}

// Tablas nuevas aún no presentes en los types generados
const db = supabase as any;

function SortableFaq({ faq, onUpdate, onDelete }: {
  faq: HelpFaq;
  onUpdate: (id: string, patch: Partial<HelpFaq>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: faq.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="bg-muted/30 border rounded-lg p-3 mb-2">
      <div className="flex items-start gap-2">
        <button className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-2">
          <Input
            placeholder="Pregunta"
            value={faq.question}
            onChange={(e) => onUpdate(faq.id, { question: e.target.value })}
            className="font-medium"
          />
          <Textarea
            placeholder="Respuesta"
            value={faq.answer}
            onChange={(e) => onUpdate(faq.id, { answer: e.target.value })}
            rows={3}
          />
        </div>
        <div className="flex flex-col items-center gap-2 mt-1">
          <Switch
            checked={faq.is_visible}
            onCheckedChange={(v) => onUpdate(faq.id, { is_visible: v })}
            title="Visible"
          />
          <Button variant="destructive" size="icon" onClick={() => onDelete(faq.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableSection({ section, expanded, onToggle, onUpdate, onDelete, onFaqUpdate, onFaqDelete, onFaqAdd, onFaqsReorder }: {
  section: HelpSection;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<HelpSection>) => void;
  onDelete: (id: string) => void;
  onFaqUpdate: (id: string, patch: Partial<HelpFaq>) => void;
  onFaqDelete: (id: string) => void;
  onFaqAdd: (sectionId: string) => void;
  onFaqsReorder: (sectionId: string, event: DragEndEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const sensors = useSensors(useSensor(PointerSensor));
  const Icon = HELP_ICONS[section.icon] ?? HelpCircle;

  return (
    <div ref={setNodeRef} style={style} className="bg-card border rounded-lg mb-3">
      <div className="flex items-center gap-2 p-3">
        <button className="cursor-grab active:cursor-grabbing text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-5 w-5" />
        </button>
        <button onClick={onToggle} className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
        <Icon className="h-5 w-5 text-primary shrink-0" />
        <Input
          value={section.title}
          onChange={(e) => onUpdate(section.id, { title: e.target.value })}
          className="font-semibold max-w-xs"
          placeholder="Título de la sección"
        />
        <Select value={section.icon} onValueChange={(v) => onUpdate(section.id, { icon: v })}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Icono" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(HELP_ICONS).map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{section.faqs.length} preguntas</span>
        <Switch
          checked={section.is_visible}
          onCheckedChange={(v) => onUpdate(section.id, { is_visible: v })}
          title="Sección visible"
        />
        <Button variant="destructive" size="icon" onClick={() => onDelete(section.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-12">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onFaqsReorder(section.id, e)}>
            <SortableContext items={section.faqs.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {section.faqs.map((faq) => (
                <SortableFaq key={faq.id} faq={faq} onUpdate={onFaqUpdate} onDelete={onFaqDelete} />
              ))}
            </SortableContext>
          </DndContext>
          <Button onClick={() => onFaqAdd(section.id)} variant="outline" size="sm" className="mt-1">
            <Plus className="mr-2 h-4 w-4" /> Añadir pregunta
          </Button>
        </div>
      )}
    </div>
  );
}

export default function HelpContentManagement() {
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [deletedSectionIds, setDeletedSectionIds] = useState<string[]>([]);
  const [deletedFaqIds, setDeletedFaqIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: secs, error: e1 }, { data: faqs, error: e2 }] = await Promise.all([
        db.from("help_sections").select("*").order("display_order"),
        db.from("help_faqs").select("*").order("display_order"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setSections((secs ?? []).map((s: any) => ({
        ...s,
        faqs: (faqs ?? []).filter((f: any) => f.section_id === s.id),
      })));
      setDeletedSectionIds([]);
      setDeletedFaqIds([]);
    } catch (err: any) {
      toast.error("Error al cargar el contenido de ayuda: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSection = (id: string, patch: Partial<HelpSection>) =>
    setSections(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const deleteSection = (id: string) => {
    if (!id.startsWith("temp-")) setDeletedSectionIds([...deletedSectionIds, id]);
    setSections(sections.filter((s) => s.id !== id));
  };

  const addSection = () => {
    const id = `temp-${crypto.randomUUID()}`;
    setSections([...sections, { id, title: "", icon: "HelpCircle", display_order: sections.length, is_visible: true, faqs: [] }]);
    setExpanded(new Set([...expanded, id]));
  };

  const updateFaq = (id: string, patch: Partial<HelpFaq>) =>
    setSections(sections.map((s) => ({ ...s, faqs: s.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) })));

  const deleteFaq = (id: string) => {
    if (!id.startsWith("temp-")) setDeletedFaqIds([...deletedFaqIds, id]);
    setSections(sections.map((s) => ({ ...s, faqs: s.faqs.filter((f) => f.id !== id) })));
  };

  const addFaq = (sectionId: string) =>
    setSections(sections.map((s) => s.id === sectionId
      ? { ...s, faqs: [...s.faqs, { id: `temp-${crypto.randomUUID()}`, section_id: sectionId, question: "", answer: "", display_order: s.faqs.length, is_visible: true }] }
      : s));

  const reorderSections = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const reorderFaqs = (sectionId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections(sections.map((s) => {
      if (s.id !== sectionId) return s;
      const oldIndex = s.faqs.findIndex((f) => f.id === active.id);
      const newIndex = s.faqs.findIndex((f) => f.id === over.id);
      return { ...s, faqs: arrayMove(s.faqs, oldIndex, newIndex) };
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Bajas primero (las FAQs de secciones borradas caen por cascade)
      if (deletedFaqIds.length > 0) {
        const { error } = await db.from("help_faqs").delete().in("id", deletedFaqIds);
        if (error) throw error;
      }
      if (deletedSectionIds.length > 0) {
        const { error } = await db.from("help_sections").delete().in("id", deletedSectionIds);
        if (error) throw error;
      }

      // Upsert de secciones con orden según posición actual
      const idMap = new Map<string, string>();
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        if (!s.title.trim()) continue;
        const realId = s.id.startsWith("temp-") ? crypto.randomUUID() : s.id;
        idMap.set(s.id, realId);
        const { error } = await db.from("help_sections").upsert({
          id: realId,
          title: s.title.trim(),
          icon: s.icon,
          display_order: i,
          is_visible: s.is_visible,
        });
        if (error) throw error;
      }

      // Upsert de FAQs
      for (const s of sections) {
        const sectionId = idMap.get(s.id);
        if (!sectionId) continue;
        const rows = s.faqs
          .filter((f) => f.question.trim() && f.answer.trim())
          .map((f, i) => ({
            id: f.id.startsWith("temp-") ? crypto.randomUUID() : f.id,
            section_id: sectionId,
            question: f.question.trim(),
            answer: f.answer,
            display_order: i,
            is_visible: f.is_visible,
          }));
        if (rows.length > 0) {
          const { error } = await db.from("help_faqs").upsert(rows);
          if (error) throw error;
        }
      }

      toast.success("Centro de Ayuda guardado correctamente");
      await load();
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Cargando Centro de Ayuda...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Centro de Ayuda</CardTitle>
        <CardDescription>
          Gestiona las secciones y preguntas que ven los corredores en /ayuda.
          Arrastra para reordenar; el interruptor oculta sin borrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSections}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                expanded={expanded.has(section.id)}
                onToggle={() => {
                  const next = new Set(expanded);
                  next.has(section.id) ? next.delete(section.id) : next.add(section.id);
                  setExpanded(next);
                }}
                onUpdate={updateSection}
                onDelete={deleteSection}
                onFaqUpdate={updateFaq}
                onFaqDelete={deleteFaq}
                onFaqAdd={addFaq}
                onFaqsReorder={reorderFaqs}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <Button onClick={addSection} variant="outline" className="flex-1">
            <Plus className="mr-2 h-4 w-4" /> Añadir sección
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
