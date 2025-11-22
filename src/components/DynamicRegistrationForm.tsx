import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FormField {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  placeholder?: string | null;
  help_text?: string | null;
  field_options?: any;
  field_order: number;
}

interface DynamicRegistrationFormProps {
  raceId: string;
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
}

export const DynamicRegistrationForm = ({ raceId, formData, onChange }: DynamicRegistrationFormProps) => {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchFormFields();
  }, [raceId]);

  const fetchFormFields = async () => {
    try {
      const { data, error } = await supabase
        .from("registration_form_fields")
        .select("*")
        .eq("race_id", raceId)
        .order("field_order", { ascending: true });

      if (error) throw error;

      setFields(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar el formulario",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = formData[field.field_name] || "";

    switch (field.field_type) {
      case "text":
      case "email":
      case "tel":
      case "url":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.field_name}
              name={field.field_name}
              type={field.field_type}
              placeholder={field.placeholder || ""}
              required={field.is_required}
              value={value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case "number":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.field_name}
              name={field.field_name}
              type="number"
              placeholder={field.placeholder || ""}
              required={field.is_required}
              value={value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case "date":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.field_name}
              name={field.field_name}
              type="date"
              required={field.is_required}
              value={value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case "textarea":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.field_name}
              name={field.field_name}
              placeholder={field.placeholder || ""}
              required={field.is_required}
              value={value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
              rows={4}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case "select":
        const options = field.field_options?.options || [];
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={value}
              onValueChange={(val) => onChange(field.field_name, val)}
              required={field.is_required}
            >
              <SelectTrigger id={field.field_name}>
                <SelectValue placeholder={field.placeholder || "Seleccionar..."} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option: string, index: number) => (
                  <SelectItem key={index} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case "checkbox":
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-start space-x-2">
              <Checkbox
                id={field.field_name}
                checked={value === true || value === "true"}
                onCheckedChange={(checked) => onChange(field.field_name, checked)}
                required={field.is_required}
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor={field.field_name}
                  className="text-sm font-normal cursor-pointer"
                >
                  {field.field_label}
                  {field.is_required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.help_text && (
                  <p className="text-sm text-muted-foreground">{field.help_text}</p>
                )}
              </div>
            </div>
          </div>
        );

      case "radio":
        const radioOptions = field.field_options?.options || [];
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="space-y-2">
              {radioOptions.map((option: string, index: number) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id={`${field.field_name}-${index}`}
                    name={field.field_name}
                    value={option}
                    checked={value === option}
                    onChange={(e) => onChange(field.field_name, e.target.value)}
                    required={field.is_required}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <Label
                    htmlFor={`${field.field_name}-${index}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Cargando formulario...</p>;
  }

  if (fields.length === 0) {
    return (
      <p className="text-muted-foreground">
        No hay campos personalizados configurados para esta carrera.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => renderField(field))}
    </div>
  );
};
