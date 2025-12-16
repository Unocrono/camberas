import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RegistrationResponse {
  id: string;
  field_value: string;
  registration_form_fields: {
    field_label: string;
    field_type: string;
  };
}

interface RegistrationResponsesViewProps {
  registrationId: string;
}

export function RegistrationResponsesView({ registrationId }: RegistrationResponsesViewProps) {
  const { toast } = useToast();
  const [responses, setResponses] = useState<RegistrationResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, [registrationId]);

  const fetchResponses = async () => {
    try {
      const { data, error } = await supabase
        .from("registration_responses")
        .select(`
          id,
          field_value,
          registration_form_fields (
            field_label,
            field_type
          )
        `)
        .eq("registration_id", registrationId);

      if (error) throw error;
      setResponses(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar respuestas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: string, fieldType: string) => {
    if (fieldType === "checkbox") {
      return value === "true" ? "Sí" : "No";
    }
    if (fieldType === "date") {
      return new Date(value).toLocaleDateString("es-ES");
    }
    return value;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Cargando...</div>;
  }

  if (responses.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No hay respuestas personalizadas
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          Ver Respuestas ({responses.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respuestas del Formulario</DialogTitle>
          <DialogDescription>
            Información personalizada proporcionada por el participante
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {responses.map((response) => (
              <Card key={response.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {response.registration_form_fields.field_label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {formatValue(
                      response.field_value,
                      response.registration_form_fields.field_type
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
