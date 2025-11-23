import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";
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

interface OrganizerFaq {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

interface OrganizerFaqsManagementProps {
  isAdmin: boolean;
}

function SortableFaqItem({
  faq,
  onUpdate,
  onDelete,
  isAdmin,
}: {
  faq: OrganizerFaq;
  onUpdate: (id: string, question: string, answer: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: faq.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (!isAdmin) {
    return (
      <div className="bg-card border rounded-lg p-4 mb-3">
        <h4 className="font-semibold mb-2">{faq.question}</h4>
        <p className="text-muted-foreground whitespace-pre-line">{faq.answer}</p>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-card border rounded-lg p-4 mb-3">
      <div className="flex items-start gap-3">
        <button
          className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="flex-1 space-y-3">
          <Input
            placeholder="Pregunta"
            value={faq.question}
            onChange={(e) => onUpdate(faq.id, e.target.value, faq.answer)}
            className="font-medium"
          />
          <Textarea
            placeholder="Respuesta"
            value={faq.answer}
            onChange={(e) => onUpdate(faq.id, faq.question, e.target.value)}
            rows={3}
          />
        </div>
        <Button
          variant="destructive"
          size="icon"
          onClick={() => onDelete(faq.id)}
          className="mt-2"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function OrganizerFaqsManagement({ isAdmin }: OrganizerFaqsManagementProps) {
  const [faqs, setFaqs] = useState<OrganizerFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    try {
      const { data, error } = await supabase
        .from("organizer_faqs")
        .select("*")
        .order("display_order");

      if (error) throw error;
      setFaqs(data || []);
    } catch (error: any) {
      toast.error("Error al cargar las FAQs: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFaqs((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addFaq = () => {
    const newFaq: OrganizerFaq = {
      id: `temp-${Date.now()}`,
      question: "",
      answer: "",
      display_order: faqs.length,
    };
    setFaqs([...faqs, newFaq]);
  };

  const updateFaq = (id: string, question: string, answer: string) => {
    setFaqs(faqs.map((faq) => (faq.id === id ? { ...faq, question, answer } : faq)));
  };

  const deleteFaq = (id: string) => {
    setFaqs(faqs.filter((faq) => faq.id !== id));
  };

  const saveFaqs = async () => {
    setSaving(true);
    try {
      // Delete all existing FAQs
      const { error: deleteError } = await supabase
        .from("organizer_faqs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (deleteError) throw deleteError;

      // Insert updated FAQs with correct order
      const faqsToInsert = faqs
        .filter((faq) => faq.question.trim() && faq.answer.trim())
        .map((faq, index) => ({
          question: faq.question,
          answer: faq.answer,
          display_order: index,
        }));

      if (faqsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("organizer_faqs")
          .insert(faqsToInsert);

        if (insertError) throw insertError;
      }

      toast.success("FAQs guardadas correctamente");
      await loadFaqs();
    } catch (error: any) {
      toast.error("Error al guardar las FAQs: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Cargando FAQs...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preguntas Frecuentes para Organizadores</CardTitle>
        <CardDescription>
          {isAdmin
            ? "Gestiona las preguntas frecuentes que verán todos los organizadores"
            : "Información y respuestas a preguntas comunes sobre la plataforma"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin ? (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={faqs.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                {faqs.map((faq) => (
                  <SortableFaqItem
                    key={faq.id}
                    faq={faq}
                    onUpdate={updateFaq}
                    onDelete={deleteFaq}
                    isAdmin={isAdmin}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <div className="flex gap-2">
              <Button onClick={addFaq} variant="outline" className="flex-1">
                <Plus className="mr-2 h-4 w-4" />
                Añadir Pregunta
              </Button>
              <Button onClick={saveFaqs} disabled={saving}>
                {saving ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq) => (
              <SortableFaqItem
                key={faq.id}
                faq={faq}
                onUpdate={updateFaq}
                onDelete={deleteFaq}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
