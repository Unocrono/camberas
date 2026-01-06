import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { getGenderCode, getGenderIdFromText, fetchGenders, getGenderName } from "@/lib/genderUtils";

interface FormField {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_options: any;
  field_order: number;
  is_required: boolean;
  is_visible: boolean;
  is_system_field: boolean;
  help_text: string | null;
  placeholder: string | null;
  profile_field: string | null;
}

interface Registration {
  id: string;
  race_id: string;
  race_distance_id: string;
  status: string;
  payment_status: string;
  bib_number: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dni_passport: string | null;
  birth_date: string | null;
  gender: string | null;
  gender_id: number | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  club: string | null;
  team: string | null;
  tshirt_size: string | null;
  race_category_id: string | null;
  autonomous_community: string | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface DynamicEditRegistrationFormProps {
  registration: Registration;
  distances: RaceDistance[];
  categories: { id: string; name: string; race_distance_id: string | null }[];
  onFormDataChange: (data: Record<string, any>) => void;
  formData: Record<string, any>;
}

// System fields that are always shown at the top
const SYSTEM_FIELDS = [
  { name: 'bib_number', label: 'Dorsal', type: 'number' },
  { name: 'race_distance_id', label: 'Recorrido', type: 'distance_select' },
  { name: 'status', label: 'Estado', type: 'status_select' },
  { name: 'payment_status', label: 'Estado de Pago', type: 'payment_select' },
];

// Map profile_field to registration column for denormalized fields
const PROFILE_TO_REGISTRATION_MAP: Record<string, string> = {
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  phone: 'phone',
  dni_passport: 'dni_passport',
  birth_date: 'birth_date',
  gender: 'gender',
  gender_id: 'gender_id',
  address: 'address',
  city: 'city',
  province: 'province',
  country: 'country',
  club: 'club',
  team: 'team',
  autonomous_community: 'autonomous_community',
};

export function DynamicEditRegistrationForm({
  registration,
  distances,
  categories,
  onFormDataChange,
  formData,
}: DynamicEditRegistrationFormProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Map<string, string>>(new Map());
  const [genders, setGenders] = useState<any[]>([]);
  const [calculatedCategory, setCalculatedCategory] = useState<string | null>(null);

  // Load genders
  useEffect(() => {
    const loadGenders = async () => {
      const genderList = await fetchGenders();
      setGenders(genderList);
    };
    loadGenders();
  }, []);

  // Fetch form fields for the distance
  useEffect(() => {
    const fetchFields = async () => {
      if (!registration.race_distance_id) return;
      
      setLoading(true);
      try {
        // Fetch fields for this distance OR race-level fields
        const { data: distanceFields } = await supabase
          .from("registration_form_fields")
          .select("*")
          .eq("race_distance_id", registration.race_distance_id)
          .eq("is_visible", true)
          .order("field_order");

        let fieldsToUse = distanceFields || [];

        // If no distance-specific fields, try race-level fields
        if (fieldsToUse.length === 0) {
          const { data: raceFields } = await supabase
            .from("registration_form_fields")
            .select("*")
            .eq("race_id", registration.race_id)
            .is("race_distance_id", null)
            .eq("is_visible", true)
            .order("field_order");
          
          fieldsToUse = raceFields || [];
        }

        setFields(fieldsToUse);

        // Fetch existing responses for this registration
        const { data: responsesData } = await supabase
          .from("registration_responses")
          .select("field_id, field_value")
          .eq("registration_id", registration.id);

        const responsesMap = new Map<string, string>();
        responsesData?.forEach(r => {
          responsesMap.set(r.field_id, r.field_value);
        });
        setResponses(responsesMap);

        // Initialize form data from registration + responses
        const initialData: Record<string, any> = {
          bib_number: registration.bib_number?.toString() || '',
          race_distance_id: registration.race_distance_id,
          status: registration.status,
          payment_status: registration.payment_status,
        };

        // Add denormalized registration fields
        Object.entries(PROFILE_TO_REGISTRATION_MAP).forEach(([profileField, regField]) => {
          const value = (registration as any)[regField];
          if (value !== undefined && value !== null) {
            initialData[profileField] = value;
          }
        });

        // Add tshirt_size
        if (registration.tshirt_size) {
          initialData['tshirt_size'] = registration.tshirt_size;
        }

        // Add category
        if (registration.race_category_id) {
          initialData['race_category_id'] = registration.race_category_id;
        }

        // Add response values for custom fields
        fieldsToUse.forEach(field => {
          const responseValue = responsesMap.get(field.id);
          if (responseValue !== undefined) {
            // For profile-mapped fields, prefer registration column
            if (field.profile_field && PROFILE_TO_REGISTRATION_MAP[field.profile_field]) {
              const regValue = (registration as any)[PROFILE_TO_REGISTRATION_MAP[field.profile_field]];
              if (!regValue && responseValue) {
                initialData[field.field_name] = responseValue;
              }
            } else {
              initialData[field.field_name] = responseValue;
            }
          }
        });

        onFormDataChange(initialData);
      } catch (error) {
        console.error("Error fetching form fields:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFields();
  }, [registration.id, registration.race_distance_id]);

  // Calculate category when birth_date or gender_id changes
  useEffect(() => {
    const birthDate = formData.birth_date;
    const genderId = formData.gender_id;
    const genderText = formData.gender;

    if (birthDate && (genderId || genderText) && registration.race_id) {
      calculateCategory(birthDate, genderId, genderText);
    }
  }, [formData.birth_date, formData.gender_id, formData.gender, registration.race_id]);

  const calculateCategory = async (birthDate: string, genderId?: number, genderText?: string) => {
    try {
      let resolvedGenderId = genderId;
      if (!resolvedGenderId && genderText) {
        resolvedGenderId = getGenderIdFromText(genderText) ?? undefined;
      }
      
      const genderCode = resolvedGenderId ? getGenderCode(resolvedGenderId) : null;
      if (!genderCode) return;

      const { data, error } = await supabase.rpc('get_race_category', {
        p_race_id: registration.race_id,
        p_birth_date: birthDate,
        p_gender: genderCode
      });
      
      if (!error && data) {
        setCalculatedCategory(data);
      }
    } catch (error) {
      console.error("Error calculating category:", error);
    }
  };

  const handleChange = (fieldName: string, value: any) => {
    onFormDataChange({ ...formData, [fieldName]: value });
  };

  const getOptions = (field: FormField): string[] => {
    if (!field.field_options) return [];
    if (Array.isArray(field.field_options)) return field.field_options;
    if (typeof field.field_options === 'object' && field.field_options.options) {
      return field.field_options.options;
    }
    return [];
  };

  const renderSystemField = (field: { name: string; label: string; type: string }) => {
    const value = formData[field.name] || '';
    
    switch (field.type) {
      case 'number':
        return (
          <div key={field.name} className="space-y-2">
            <Label>{field.label}</Label>
            <Input
              type="number"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
            />
          </div>
        );
      
      case 'distance_select':
        return (
          <div key={field.name} className="space-y-2">
            <Label>{field.label}</Label>
            <Select value={value} onValueChange={(v) => handleChange(field.name, v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {distances.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.distance_km}km)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'status_select':
        return (
          <div key={field.name} className="space-y-2">
            <Label>{field.label}</Label>
            <Select value={value} onValueChange={(v) => handleChange(field.name, v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="confirmed">Confirmada</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'payment_select':
        return (
          <div key={field.name} className="space-y-2">
            <Label>{field.label}</Label>
            <Select value={value} onValueChange={(v) => handleChange(field.name, v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      
      default:
        return null;
    }
  };

  const renderFormField = (field: FormField) => {
    // Determine the field key - use profile_field if it maps to registration column
    let fieldKey = field.field_name;
    if (field.profile_field && PROFILE_TO_REGISTRATION_MAP[field.profile_field]) {
      fieldKey = field.profile_field;
    }

    const value = formData[fieldKey] ?? formData[field.field_name] ?? '';

    // Special handling for gender_id field
    if (field.profile_field === 'gender_id' || field.field_name === 'gender_id') {
      return (
        <div key={field.id} className="space-y-2">
          <Label>
            {field.field_label}
            {field.is_required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select 
            value={formData.gender_id?.toString() || ''} 
            onValueChange={(v) => handleChange('gender_id', parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {genders.map((g) => (
                <SelectItem key={g.gender_id} value={g.gender_id.toString()}>
                  {g.gender_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );
    }

    // Special handling for category field
    if (field.field_name === 'category' || field.profile_field === 'category') {
      const filteredCategories = categories.filter(
        c => !c.race_distance_id || c.race_distance_id === formData.race_distance_id
      );
      
      return (
        <div key={field.id} className="space-y-2">
          <Label>{field.field_label}</Label>
          <div className="flex items-center gap-2">
            {calculatedCategory ? (
              <Badge variant="secondary" className="text-sm">
                {calculatedCategory}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">
                Introduce fecha de nacimiento y sexo
              </span>
            )}
            {filteredCategories.length > 0 && (
              <Select 
                value={formData.race_category_id || ''} 
                onValueChange={(v) => handleChange('race_category_id', v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="O seleccionar manual..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );
    }

    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'tel':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              type={field.field_type === 'email' ? 'email' : field.field_type === 'tel' ? 'tel' : 'text'}
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              placeholder={field.placeholder || ''}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              type="number"
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              placeholder={field.placeholder || ''}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              type="date"
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              placeholder={field.placeholder || ''}
              rows={3}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'select':
        const selectOptions = getOptions(field);
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select value={value} onValueChange={(v) => handleChange(fieldKey, v)}>
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || 'Seleccionar...'} />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={value === 'true' || value === true}
              onCheckedChange={(checked) => handleChange(fieldKey, checked ? 'true' : 'false')}
            />
            <Label htmlFor={field.id}>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.help_text && (
              <p className="text-xs text-muted-foreground ml-2">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'radio':
        const radioOptions = getOptions(field);
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup value={value} onValueChange={(v) => handleChange(fieldKey, v)}>
              {radioOptions.map((opt) => (
                <div key={opt} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt} id={`${field.id}-${opt}`} />
                  <Label htmlFor={`${field.id}-${opt}`}>{opt}</Label>
                </div>
              ))}
            </RadioGroup>
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      case 'readonly':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.field_label}</Label>
            <div className="p-2 bg-muted rounded text-sm">{value || '-'}</div>
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
      
      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              placeholder={field.placeholder || ''}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando campos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* System fields section */}
      <div className="border-b pb-4">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Datos del Sistema</h4>
        <div className="grid grid-cols-2 gap-4">
          {SYSTEM_FIELDS.map(renderSystemField)}
        </div>
      </div>

      {/* Dynamic form fields */}
      {fields.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Datos del Participante</h4>
          {fields.map(renderFormField)}
        </div>
      ) : (
        <div className="text-muted-foreground text-sm py-4">
          No hay campos de formulario configurados para este recorrido.
          <br />
          <span className="text-xs">Puedes configurarlos en "Campos de Inscripción".</span>
        </div>
      )}
    </div>
  );
}
