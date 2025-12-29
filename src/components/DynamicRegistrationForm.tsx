import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

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
  profile_field?: string | null;
}

interface DynamicRegistrationFormProps {
  raceId?: string;
  distanceId?: string;
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
}

export const DynamicRegistrationForm = ({ raceId, distanceId, formData, onChange }: DynamicRegistrationFormProps) => {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchFormFields();
  }, [raceId, distanceId]);

  // Pre-fill form with profile data when user is logged in and fields are loaded
  useEffect(() => {
    if (user && fields.length > 0 && !profileLoaded) {
      prefillFromProfile();
    }
  }, [user, fields, profileLoaded]);

  const prefillFromProfile = async () => {
    if (!user) return;

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (profile) {
        // For each field that has a profile_field mapping, set the value
        fields.forEach(field => {
          if (field.profile_field && profile[field.profile_field as keyof typeof profile]) {
            const profileValue = profile[field.profile_field as keyof typeof profile];
            // Only set if formData doesn't already have a value
            if (!formData[field.field_name]) {
              onChange(field.field_name, profileValue);
            }
          }
        });

        // Also get email from auth user
        if (user.email) {
          const emailField = fields.find(f => f.field_name === 'email');
          if (emailField && !formData['email']) {
            onChange('email', user.email);
          }
        }
      }

      setProfileLoaded(true);
    } catch (error: any) {
      console.error("Error loading profile for prefill:", error);
    }
  };

  const fetchFormFields = async () => {
    try {
      let query = supabase
        .from("registration_form_fields")
        .select("*")
        .eq("is_visible", true)
        .order("field_order", { ascending: true });

      // Prefer distance-based fields, fallback to race-based
      if (distanceId) {
        query = query.eq("race_distance_id", distanceId);
      } else if (raceId) {
        query = query.eq("race_id", raceId);
      } else {
        setFields([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;

      if (error) throw error;

      setFields(data || []);
      setProfileLoaded(false); // Reset to allow prefill when fields change
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
