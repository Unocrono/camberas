import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  is_visible?: boolean;
  is_system_field?: boolean;
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
        .eq("is_visible", true)
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

  // Get options from field_options - handle both formats (array or {options: []})
  const getOptions = (field: FormField): string[] => {
    if (Array.isArray(field.field_options)) {
      return field.field_options;
    }
    return field.field_options?.options || [];
  };

  const renderField = (field: FormField) => {
    const value = formData[field.field_name] || "";
    const options = getOptions(field);

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
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={value}
              onValueChange={(val) => onChange(field.field_name, val)}
              className="flex gap-4"
            >
              {options.map((option: string, index: number) => (
                <div key={index} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option}
                    id={`${field.field_name}-${index}`}
                  />
                  <Label
                    htmlFor={`${field.field_name}-${index}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
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
    return null;
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => renderField(field))}
    </div>
  );
};
