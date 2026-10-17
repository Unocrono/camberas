import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Plus, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  getOrCreateCategoryId,
  normalizeGender as normalizeCategoryGender,
  type RaceCategory 
} from "@/lib/categoryUtils";
import { getGenderIdFromText } from "@/lib/genderUtils";

interface RegistrationImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raceId: string;
  distanceId?: string;
  onImportComplete: () => void;
}

interface CSVRow {
  [key: string]: string;
}

interface ColumnMapping {
  csvColumn: string;
  field: string;
}

interface FormField {
  value: string;
  label: string;
  isCustom?: boolean;
  fieldId?: string;
  profileField?: string | null; // Campo de profiles vinculado
  registrationField?: string; // Campo equivalente en registrations
}

// Mapeo de profile_field a campo de registrations (ahora campos directos, no guest_*)
const PROFILE_TO_REGISTRATION: Record<string, string> = {
  'first_name': 'first_name',
  'last_name': 'last_name',
  'email': 'email',
  'phone': 'phone',
  'dni_passport': 'dni_passport',
  'birth_date': 'birth_date',
  'gender': 'gender',
  'club': 'club',
  'team': 'team',
  'address': 'address',
  'city': 'city',
  'province': 'province',
  'autonomous_community': 'autonomous_community',
  'country': 'country',
  'emergency_contact': 'emergency_contact',
  'emergency_phone': 'emergency_phone',
};

// Campos especiales que siempre están disponibles (no dependen de registration_form_fields)
//  · «Recorrido»: una columna del fichero decide el recorrido de cada fila
//    (carrera / marcha / infantil) y un solo fichero vale para toda la carrera.
//  · «Equipo» y «Club»: siempre mapeables aunque el formulario no los tenga
//    (los equipos del Group Billing de EventBooking, los clubes del export).
//  · «ID externo»: el id del inscrito en la plataforma de origen (EventBooking);
//    es la clave para repetir la importación sin duplicar.
const SPECIAL_FIELDS: FormField[] = [
  { value: "ignore", label: "-- Ignorar --" },
  { value: "distance", label: "Recorrido (carrera / marcha / infantil)" },
  { value: "bib_number", label: "Dorsal" },
  { value: "chip_code", label: "Código de Chip" },
  { value: "team", label: "Equipo", registrationField: "team" },
  { value: "club", label: "Club", registrationField: "club" },
  { value: "external_id", label: "ID externo (EventBooking)" },
  { value: "status", label: "Estado de Inscripción" },
  { value: "payment_status", label: "Estado de Pago" },
];

// Patrones de auto-detección por profile_field
const PROFILE_FIELD_PATTERNS: Record<string, RegExp[]> = {
  first_name: [/^nombre$/i, /^first.?name$/i, /^primer.?nombre$/i],
  last_name: [/^apellido/i, /^last.?name$/i, /^surname$/i],
  email: [/^email$/i, /^correo$/i, /^e-?mail$/i],
  phone: [/^tel/i, /^phone$/i, /^móvil$/i, /^movil$/i, /^celular$/i],
  dni_passport: [/^dni$/i, /^pasaporte$/i, /^documento$/i, /^id$/i, /^nif$/i, /^nie$/i],
  birth_date: [/^fecha.?nac/i, /^birth/i, /^nacimiento$/i, /^f\.?\s?nac/i],
  gender: [/^g[eé]nero$/i, /^sexo$/i, /^gender$/i],
  emergency_contact: [/^emergencia$/i, /^contacto.?emergencia$/i],
  emergency_phone: [/^tel.?emergencia$/i, /^phone.?emergency$/i],
};

// Patrones para campos especiales
const SPECIAL_FIELD_PATTERNS: Record<string, RegExp[]> = {
  distance: [/^recorrido$/i, /^modalidad$/i, /^distancia$/i, /^prueba$/i, /^carrera$/i],
  bib_number: [/^dorsal$/i, /^bib$/i, /^número$/i, /^numero$/i],
  chip_code: [/^chip$/i, /^código.?chip$/i, /^chip.?code$/i],
  team: [/^equipo$/i, /^team$/i, /^grupo$/i, /^nombre.?(del.?)?equipo$/i, /^group.?name$/i],
  club: [/^club$/i],
  external_id: [/^id$/i, /^registrant.?id$/i, /^id.?(eb|eventbooking|externo)$/i, /^eventbooking.?id$/i],
  status: [/^estado$/i, /^status$/i],
  payment_status: [/^pago$/i, /^payment$/i, /^estado.?pago$/i],
};

const normalizarTexto = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Qué recorrido es el valor de la columna «Recorrido» de una fila: el de
 * nombre igual, el que contiene el valor (o al revés) y, si no, por la palabra
 * clave (marcha/andar → la marcha; infantil → la infantil; carrera/correr → la
 * carrera que no sea infantil). null si no cuadra con ninguno.
 */
function resolverRecorrido(valor: string, recorridos: { id: string; name: string }[]): string | null {
  const v = normalizarTexto(valor);
  if (!v) return null;
  const exacto = recorridos.find((d) => normalizarTexto(d.name) === v);
  if (exacto) return exacto.id;
  const contiene = recorridos.find((d) => normalizarTexto(d.name).includes(v) || v.includes(normalizarTexto(d.name)));
  if (contiene) return contiene.id;
  const porNombre = (re: RegExp, salvo?: RegExp) =>
    recorridos.find((d) => re.test(normalizarTexto(d.name)) && !(salvo && salvo.test(normalizarTexto(d.name))));
  if (/marcha|andar|andarin|caminar|senderis/.test(v)) return porNombre(/marcha|andar|senderis/)?.id ?? null;
  if (/infantil|menor|nin|txiki|kid/.test(v)) return porNombre(/infantil|menor|nin|txiki|kid/)?.id ?? null;
  if (/carrera|correr|corre|run|trail/.test(v)) return porNombre(/carrera|trail|run/, /infantil|marcha/)?.id ?? null;
  return null;
}

type Encoding = "utf-8" | "iso-8859-1";

function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse headers
  const headers = parseCSVLine(lines[0]);

  // Parse rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.some((v) => v.trim() !== "")) {
      const row: CSVRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "," || char === ";") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());

  return result;
}

function autoDetectMapping(headers: string[], availableFields: FormField[]): ColumnMapping[] {
  return headers.map((header) => {
    const normalizedHeader = header.trim().toLowerCase();
    
    // 1. Check special field patterns (bib_number, status, etc.)
    for (const [field, patterns] of Object.entries(SPECIAL_FIELD_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
        return { csvColumn: header, field };
      }
    }
    
    // 2. Check available fields by profile_field patterns
    for (const field of availableFields) {
      if (field.profileField && PROFILE_FIELD_PATTERNS[field.profileField]) {
        const patterns = PROFILE_FIELD_PATTERNS[field.profileField];
        if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
          return { csvColumn: header, field: field.value };
        }
      }
    }
    
    // 3. Check by exact label match
    for (const field of availableFields) {
      if (field.label.toLowerCase() === normalizedHeader) {
        return { csvColumn: header, field: field.value };
      }
    }
    
    // 4. Check by partial label match
    for (const field of availableFields) {
      if (normalizedHeader.includes(field.label.toLowerCase()) || 
          field.label.toLowerCase().includes(normalizedHeader)) {
        return { csvColumn: header, field: field.value };
      }
    }
    
    return { csvColumn: header, field: "ignore" };
  });
}

// Detect if text has encoding issues (replacement characters or common malformed patterns)
function hasEncodingIssues(text: string): boolean {
  // Check for replacement character
  if (text.includes("�") || text.includes("\ufffd")) return true;
  
  // Check for common malformed Spanish characters (UTF-8 bytes interpreted as Latin-1)
  const malformedPatterns = [
    /Ã¡/, /Ã©/, /Ã­/, /Ã³/, /Ãº/, // á, é, í, ó, ú
    /Ã±/, /Ã'/, // ñ, Ñ
    /Ãœ/, /Ã¼/, // Ü, ü
    /Âº/, /Âª/, // º, ª
  ];
  
  return malformedPatterns.some(pattern => pattern.test(text));
}

// Normalize gender value to standard format (male/female)
function normalizeGender(value: string): string {
  if (!value) return value;
  
  const normalized = value.trim().toLowerCase();
  
  // Map common variations to standard values
  if (normalized === 'm' || normalized === 'masculino' || normalized === 'male' || normalized === 'hombre' || normalized === 'h') {
    return 'male';
  }
  if (normalized === 'f' || normalized === 'femenino' || normalized === 'female' || normalized === 'mujer') {
    return 'female';
  }
  
  // Return original if not recognized
  return value;
}

// Check if a row has minimum required data (name or email)
function rowHasRequiredData(row: CSVRow, mappings: ColumnMapping[]): boolean {
  // Find which CSV columns are mapped to name/email fields
  const nameMapping = mappings.find(m => 
    m.field === 'first_name' || 
    m.field.includes('first_name')
  );
  const emailMapping = mappings.find(m => 
    m.field === 'email' || 
    m.field.includes('email')
  );
  
  const hasName = nameMapping && row[nameMapping.csvColumn]?.trim();
  const hasEmail = emailMapping && row[emailMapping.csvColumn]?.trim();
  
  return !!(hasName || hasEmail);
}

// Read file with specific encoding
async function readFileWithEncoding(file: File, encoding: Encoding): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, encoding);
  });
}

export function RegistrationImportDialog({
  open,
  onOpenChange,
  raceId,
  distanceId,
  onImportComplete,
}: RegistrationImportDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: CSVRow[] } | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [distances, setDistances] = useState<{ id: string; name: string }[]>([]);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>(distanceId || "");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [availableFields, setAvailableFields] = useState<FormField[]>(SPECIAL_FIELDS);
  const [encoding, setEncoding] = useState<Encoding>("utf-8");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [showNewFieldInput, setShowNewFieldInput] = useState<string | null>(null);
  // Dorsal automático a las filas que no traen dorsal, con el rango del
  // recorrido (bib_start / next_bib), igual que la acción en bloque del panel
  const [asignarDorsales, setAsignarDorsales] = useState(true);
  // Campos personalizados por nombre de campo y recorrido: el mismo campo
  // («local_cenicero») tiene un id distinto en cada recorrido, y la respuesta
  // tiene que colgar del id del recorrido de la fila.
  //   field_name → (race_distance_id | "*" para los de carrera) → field_id
  const [camposPorRecorrido, setCamposPorRecorrido] = useState<Record<string, Record<string, string>>>({});

  // Load form fields when race/distance changes. Se cargan los de TODOS los
  // recorridos de la carrera: con la columna «Recorrido» un mismo fichero
  // reparte filas entre varios.
  useEffect(() => {
    if (!raceId || !open) return;

    const loadFormFields = async () => {
      const { data: dists } = await supabase
        .from("race_distances")
        .select("id")
        .eq("race_id", raceId);
      const distIds = (dists ?? []).map((d) => d.id);
      const filtro = [`race_id.eq.${raceId}`, ...(distIds.length ? [`race_distance_id.in.(${distIds.join(",")})`] : [])].join(",");

      const { data: formFields } = await supabase
        .from("registration_form_fields")
        .select("id, field_name, field_label, profile_field, is_system_field, race_distance_id")
        .or(filtro)
        .eq("is_visible", true)
        .order("field_order");

      if (formFields) {
        const porRecorrido: Record<string, Record<string, string>> = {};
        const configuredFields: FormField[] = [];
        for (const f of formFields) {
          const profileField = f.profile_field as string | null;
          const registrationField = profileField ? PROFILE_TO_REGISTRATION[profileField] : undefined;
          const value = registrationField || `custom_${f.field_name}`;
          porRecorrido[f.field_name] = { ...(porRecorrido[f.field_name] ?? {}), [f.race_distance_id ?? "*"]: f.id };
          if (configuredFields.some((c) => c.value === value)) continue;
          configuredFields.push({
            value,
            label: f.field_label,
            isCustom: !f.is_system_field && !registrationField,
            fieldId: f.id,
            profileField: profileField,
            registrationField: registrationField,
          });
        }

        // Merge special fields with configured fields, avoiding duplicates
        const mergedFields = [...SPECIAL_FIELDS];
        for (const field of configuredFields) {
          if (!mergedFields.some(mf => mf.value === field.value)) {
            mergedFields.push(field);
          }
        }

        setCamposPorRecorrido(porRecorrido);
        setAvailableFields(mergedFields);
      }
    };

    loadFormFields();
  }, [raceId, open]);

  const resetState = useCallback(() => {
    setStep("upload");
    setCsvData(null);
    setColumnMappings([]);
    setImportProgress({ current: 0, total: 0, errors: 0 });
    setImportErrors([]);
    setCurrentFile(null);
    setEncoding("utf-8");
    setNewFieldName("");
    setShowNewFieldInput(null);
  }, []);

  const processFile = useCallback(
    async (file: File, selectedEncoding: Encoding) => {
      try {
        const text = await readFileWithEncoding(file, selectedEncoding);
        
        // Check for encoding issues
        if (hasEncodingIssues(text) && selectedEncoding === "utf-8") {
          // Try ISO-8859-1 automatically
          const textLatin = await readFileWithEncoding(file, "iso-8859-1");
          if (!hasEncodingIssues(textLatin)) {
            setEncoding("iso-8859-1");
            const parsed = parseCSV(textLatin);
            setCsvData(parsed);
            setColumnMappings(autoDetectMapping(parsed.headers, availableFields));
            return;
          }
        }

        const parsed = parseCSV(text);

        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          toast({
            title: "Archivo vacío",
            description: "El archivo CSV no contiene datos",
            variant: "destructive",
          });
          return;
        }

        setCsvData(parsed);
        setColumnMappings(autoDetectMapping(parsed.headers, availableFields));
      } catch (error) {
        toast({
          title: "Error al leer archivo",
          description: "No se pudo procesar el archivo CSV",
          variant: "destructive",
        });
      }
    },
    [availableFields, toast]
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".csv")) {
        toast({
          title: "Formato no válido",
          description: "Por favor, selecciona un archivo CSV",
          variant: "destructive",
        });
        return;
      }

      setCurrentFile(file);

      // Fetch distances for the race
      const { data } = await supabase
        .from("race_distances")
        .select("id, name")
        .eq("race_id", raceId)
        .order("distance_km");

      setDistances(data || []);
      if (data && data.length === 1) {
        setSelectedDistanceId(data[0].id);
      } else if (distanceId) {
        setSelectedDistanceId(distanceId);
      }

      await processFile(file, "utf-8");
      setStep("mapping");

      // Reset input
      event.target.value = "";
    },
    [raceId, distanceId, toast, processFile]
  );

  const handleEncodingChange = useCallback(
    async (newEncoding: Encoding) => {
      setEncoding(newEncoding);
      if (currentFile) {
        await processFile(currentFile, newEncoding);
      }
    },
    [currentFile, processFile]
  );

  const handleCreateNewField = async (csvColumn: string) => {
    if (!newFieldName.trim() || !selectedDistanceId) {
      toast({
        title: "Error",
        description: "Introduce un nombre para el campo y selecciona un recorrido",
        variant: "destructive",
      });
      return;
    }

    try {
      const fieldName = `custom_${newFieldName.toLowerCase().replace(/\s+/g, "_")}`;
      
      const { data: newField, error } = await supabase
        .from("registration_form_fields")
        .insert({
          race_id: raceId,
          race_distance_id: selectedDistanceId,
          field_name: fieldName,
          field_label: newFieldName.trim(),
          field_type: "text",
          is_required: false,
          is_visible: true,
          is_system_field: false,
          field_order: availableFields.length,
        })
        .select()
        .single();

      if (error) throw error;

      const newFormField: FormField = {
        value: `custom_${newField.field_name}`,
        label: newField.field_label,
        isCustom: true,
        fieldId: newField.id,
      };

      setCamposPorRecorrido((prev) => ({
        ...prev,
        [newField.field_name]: { ...(prev[newField.field_name] ?? {}), [selectedDistanceId]: newField.id },
      }));
      setAvailableFields(prev => [...prev, newFormField]);
      updateMapping(csvColumn, newFormField.value);
      setNewFieldName("");
      setShowNewFieldInput(null);

      toast({
        title: "Campo creado",
        description: `El campo "${newFieldName}" ha sido creado`,
      });
    } catch (error: any) {
      toast({
        title: "Error al crear campo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = useCallback(async () => {
    // Fetch form fields for this race/distance
    const { data: formFields } = await supabase
      .from("registration_form_fields")
      .select("field_label, is_required")
      .or(`race_id.eq.${raceId}${selectedDistanceId ? `,race_distance_id.eq.${selectedDistanceId}` : ""}`)
      .eq("is_visible", true)
      .order("field_order");

    // Base columns for template
    const baseColumns = [
      "Nombre",
      "Apellidos",
      "Email",
      "Teléfono",
      "DNI/Pasaporte",
      "Fecha de Nacimiento (DD/MM/YYYY)",
      "Dorsal",
      "Contacto de Emergencia",
      "Teléfono de Emergencia",
    ];

    // Add custom form field columns
    const customColumns = formFields
      ?.filter(f => !baseColumns.some(bc => bc.toLowerCase().includes(f.field_label.toLowerCase())))
      .map(f => f.field_label) || [];

    const allColumns = [...baseColumns, ...customColumns];
    
    // Create CSV content with BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csvContent = BOM + allColumns.join(";") + "\n";
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla_inscripciones.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Plantilla descargada",
      description: "Completa los datos y vuelve a subir el archivo",
    });
  }, [raceId, selectedDistanceId, toast]);

  const updateMapping = (csvColumn: string, field: string) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, field } : m))
    );
  };

  const getMappedFieldsCount = () => {
    return columnMappings.filter((m) => m.field !== "ignore").length;
  };

  const validateRow = (row: CSVRow, rowIndex: number): { valid: boolean; errors: string[]; skipped: boolean } => {
    const errors: string[] = [];
    const mappedData = getMappedData(row);

    // Check if row has any data at all
    const hasAnyData = Object.values(row).some(v => v?.trim());
    if (!hasAnyData) {
      return { valid: false, errors: [], skipped: true }; // Silent skip for empty rows
    }

    // At least name or email required
    if (!mappedData.first_name && !mappedData.email) {
      // Check if row only has bib number (incomplete data)
      const onlyHasBib = mappedData.bib_number && !mappedData.first_name && !mappedData.last_name && !mappedData.email;
      if (onlyHasBib) {
        errors.push("Solo contiene dorsal, falta nombre o email");
      } else {
        errors.push("Se requiere nombre o email");
      }
    }

    // Validate email format if provided
    if (mappedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedData.email)) {
      errors.push("Email inválido");
    }

    // Validate bib_number if provided
    if (mappedData.bib_number) {
      const bibNum = parseInt(mappedData.bib_number);
      if (isNaN(bibNum) || bibNum <= 0) {
        errors.push("Dorsal inválido");
      }
    }

    // Recorrido de la fila: la columna «Recorrido» si está mapeada; si no,
    // el elegido arriba. Sin ninguno de los dos, la fila no puede entrar.
    if (!recorridoDeFila(mappedData)) {
      errors.push(
        mappedData.distance
          ? `Recorrido «${mappedData.distance}» no coincide con ninguno de la carrera`
          : "Sin recorrido: elige uno arriba o mapea una columna a «Recorrido»",
      );
    }

    return { valid: errors.length === 0, errors, skipped: false };
  };

  // Recorrido al que va una fila ya mapeada (ver validateRow)
  const recorridoDeFila = (mappedData: Record<string, string>): string | null => {
    if (mappedData.distance?.trim()) return resolverRecorrido(mappedData.distance, distances);
    return selectedDistanceId || null;
  };

  // id del campo personalizado «custom_<field_name>» en el recorrido de la fila
  // (o el de carrera, común a todos)
  const campoEnRecorrido = (key: string, distId: string): string | null => {
    const porRec = camposPorRecorrido[key.slice("custom_".length)];
    return porRec?.[distId] ?? porRec?.["*"] ?? null;
  };

  // Convert date from DD/MM/YYYY or D/M/YYYY to YYYY-MM-DD (ISO format for PostgreSQL)
  const convertDateFormat = (dateStr: string): string | null => {
    if (!dateStr || !dateStr.trim()) return null;
    
    const trimmed = dateStr.trim();
    
    // Already in ISO format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Try DD/MM/YYYY or D/M/YYYY format
    const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const paddedDay = day.padStart(2, '0');
      const paddedMonth = month.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    // Try MM/DD/YYYY format (less common but possible)
    const matchUS = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (matchUS) {
      // Already handled above, this is just a fallback
      return null;
    }
    
    return null; // Invalid format
  };

  const getMappedData = (row: CSVRow): Record<string, string> => {
    const data: Record<string, string> = {};
    columnMappings.forEach((mapping) => {
      if (mapping.field !== "ignore") {
        let value = row[mapping.csvColumn] || "";
        
        // Normalize gender field automatically
        // Check if this mapping corresponds to a gender field by looking at availableFields
        const fieldConfig = availableFields.find(f => f.value === mapping.field);
        if (fieldConfig?.profileField === 'gender' || mapping.field.includes('gender')) {
          value = normalizeGender(value);
        }
        
        data[mapping.field] = value;
      }
    });
    return data;
  };

  const hayColumnaRecorrido = columnMappings.some((m) => m.field === "distance");

  const handleImport = async () => {
    if (!csvData || (!selectedDistanceId && !hayColumnaRecorrido)) return;

    setStep("importing");
    setImportProgress({ current: 0, total: csvData.rows.length, errors: 0 });
    setImportErrors([]);

    const errors: string[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    // Altas sin dorsal, por recorrido, para numerarlas al final en el orden del fichero
    const sinDorsal = new Map<string, string[]>();

    // Fetch race date once, used for category calculation
    const { data: raceData } = await supabase
      .from("races")
      .select("date, category_age_reference")
      .eq("id", raceId)
      .single();

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      const validation = validateRow(row, i);

      // Skip empty rows silently
      if (validation.skipped) {
        skippedCount++;
        setImportProgress((prev) => ({ ...prev, current: i + 1 }));
        continue;
      }

      if (!validation.valid) {
        errors.push(`Fila ${i + 2}: ${validation.errors.join(", ")}`);
        setImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          errors: prev.errors + 1,
        }));
        continue;
      }

      const mappedData = getMappedData(row);
      // Validada arriba: aquí siempre hay recorrido
      const distanciaFila = recorridoDeFila(mappedData) ?? selectedDistanceId;

      try {
        // Separate registration fields from custom fields
        const customFieldMappings: { fieldId: string; value: string }[] = [];

        const insertData: any = {
          race_id: raceId,
          race_distance_id: distanciaFila,
          status: "confirmed",
          payment_status: "paid",
        };

        // Process mapped data based on field configuration
        for (const [key, value] of Object.entries(mappedData)) {
          if (!value) continue;

          if (key === "distance") {
            continue; // ya resuelto en distanciaFila
          } else if (key === "external_id") {
            // Importado de otra plataforma: misma huella que el sync de EventBooking
            insertData.external_id = value.trim();
            insertData.source = "external";
          } else if (key === "bib_number") {
            insertData.bib_number = parseInt(value) || null;
          } else if (key === "chip_code") {
            insertData.chip_code = value;
          } else if (key === "status") {
            insertData.status = value;
          } else if (key === "payment_status") {
            insertData.payment_status = value;
          } else if (PROFILE_TO_REGISTRATION[key as keyof typeof PROFILE_TO_REGISTRATION]) {
            const regField = PROFILE_TO_REGISTRATION[key as keyof typeof PROFILE_TO_REGISTRATION];
            if (regField === 'birth_date') {
              insertData[regField] = convertDateFormat(value);
            } else if (regField === 'gender') {
              insertData[regField] = value;
              insertData.gender_id = getGenderIdFromText(value);
            } else {
              insertData[regField] = value;
            }
          } else if (key.startsWith("custom_")) {
            // El id del campo en el recorrido de ESTA fila (cada recorrido
            // tiene su copia del campo); si no existe ahí, el de carrera
            const fieldId = campoEnRecorrido(key, distanciaFila)
              ?? availableFields.find(f => f.value === key)?.fieldId
              ?? null;
            if (fieldId) {
              customFieldMappings.push({ fieldId, value });
            }
          }
        }

        // -----------------------------------------------------------------
        // UPSERT: primero por ID externo (misma plataforma de origen, en toda
        // la carrera) y, si no, POR DNI en el recorrido de la fila. Si ya
        // existe, solo actualizamos los campos operativos (dorsal, chip,
        // estado, equipo). El snapshot (nombre, apellidos…) no se toca.
        // -----------------------------------------------------------------
        let registrationId: string | null = null;
        let operationError: string | null = null;
        let isUpdate = false;

        const dniValue = insertData.dni_passport as string | undefined;
        const externalId = insertData.external_id as string | undefined;

        let existing: { id: string } | null = null;
        if (externalId) {
          const { data } = await supabase
            .from("registrations")
            .select("id")
            .eq("race_id", raceId)
            .eq("external_id", externalId)
            .maybeSingle();
          existing = data ?? null;
        }
        if (!existing && dniValue) {
          const { data } = await supabase
            .from("registrations")
            .select("id")
            .eq("race_distance_id", distanciaFila)
            .eq("dni_passport", dniValue)
            .maybeSingle();
          existing = data ?? null;
        }

        if (existing) {
          // Registro existente: actualizar solo campos operativos
          const updateData: any = {};
          if (insertData.bib_number != null) updateData.bib_number = insertData.bib_number;
          if (insertData.chip_code)          updateData.chip_code = insertData.chip_code;
          if (insertData.status)             updateData.status = insertData.status;
          if (insertData.payment_status)     updateData.payment_status = insertData.payment_status;
          if (insertData.team)               updateData.team = insertData.team;
          if (insertData.club)               updateData.club = insertData.club;
          if (insertData.external_id)        updateData.external_id = insertData.external_id;

          if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
              .from("registrations")
              .update(updateData)
              .eq("id", existing.id);
            if (updateError) operationError = updateError.message;
          }

          registrationId = existing.id;
          isUpdate = true;
        }

        if (!isUpdate) {
          // Nuevo registro
          const { data: newReg, error: insertError } = await supabase
            .from("registrations")
            .insert(insertData)
            .select("id")
            .single();

          if (insertError) {
            operationError = insertError.message;
          } else {
            registrationId = newReg?.id ?? null;
            if (registrationId && insertData.bib_number == null) {
              sinDorsal.set(distanciaFila, [...(sinDorsal.get(distanciaFila) ?? []), registrationId]);
            }
          }
        }

        if (operationError) {
          errors.push(`Fila ${i + 2}: ${operationError}`);
          setImportProgress((prev) => ({
            ...prev,
            current: i + 1,
            errors: prev.errors + 1,
          }));
          continue;
        }

        // Insert / update custom field responses
        if (registrationId && customFieldMappings.length > 0) {
          if (isUpdate) {
            // For updates, upsert responses individually to avoid duplicates
            for (const cf of customFieldMappings) {
              await supabase
                .from("registration_responses")
                .upsert(
                  { registration_id: registrationId, field_id: cf.fieldId, field_value: cf.value },
                  { onConflict: "registration_id,field_id" }
                );
            }
          } else {
            await supabase.from("registration_responses").insert(
              customFieldMappings.map(cf => ({
                registration_id: registrationId,
                field_id: cf.fieldId,
                field_value: cf.value,
              }))
            );
          }
        }

        // Category assignment (only for new registrations or if explicitly updating)
        if (registrationId && !isUpdate && raceData?.date) {
          const birthDate = insertData.birth_date;

          const categoryField = availableFields.find(f => f.label === 'Categoría' && f.fieldId);
          const importedCategory = customFieldMappings.find(cf => cf.fieldId === categoryField?.fieldId);
          const importedCategoryName = importedCategory?.value || null;

          let gender: string | null = insertData.gender || null;
          if (!gender) {
            const genderField = customFieldMappings.find(cf => {
              const field = availableFields.find(f => f.fieldId === cf.fieldId);
              return field?.profileField === 'gender';
            });
            gender = genderField?.value ? normalizeCategoryGender(genderField.value) : null;
          }

          const categoryResult = await getOrCreateCategoryId(
            raceId,
            distanciaFila,
            importedCategoryName,
            birthDate,
            gender,
            raceData.date,
            raceData.category_age_reference
          );

          if (categoryResult.id) {
            await supabase
              .from("registrations")
              .update({ race_category_id: categoryResult.id })
              .eq("id", registrationId);
          }
        }

        if (isUpdate) {
          updatedCount++;
        } else {
          insertedCount++;
        }
        setImportProgress((prev) => ({ ...prev, current: i + 1 }));

      } catch (err: any) {
        errors.push(`Fila ${i + 2}: Error inesperado`);
        setImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          errors: prev.errors + 1,
        }));
      }
    }

    // Dorsales automáticos a las altas que no traían dorsal, por recorrido y
    // en el orden del fichero, con el mismo criterio que la acción en bloque
    // del panel: desde next_bib (o bib_start) hasta bib_end, y se deja
    // apuntado el siguiente. Un recorrido sin rango se queda sin numerar.
    let dorsalesAsignados = 0;
    if (asignarDorsales) {
      for (const [distId, ids] of sinDorsal) {
        const { data: d } = await supabase
          .from("race_distances")
          .select("name, bib_start, bib_end, next_bib")
          .eq("id", distId)
          .single();
        if (!d?.bib_start) {
          errors.push(`${d?.name ?? "Recorrido"}: sin rango de dorsales; ${ids.length} inscripciones quedan sin dorsal`);
          continue;
        }
        let siguiente = d.next_bib || d.bib_start;
        const tope = d.bib_end || 99999;
        for (const id of ids) {
          if (siguiente > tope) {
            errors.push(`${d.name}: dorsales agotados (tope ${tope})`);
            break;
          }
          const { error } = await supabase.from("registrations").update({ bib_number: siguiente }).eq("id", id);
          if (!error) {
            siguiente++;
            dorsalesAsignados++;
          }
        }
        await supabase.from("race_distances").update({ next_bib: siguiente }).eq("id", distId);
      }
    }

    setImportErrors(errors);

    const totalSuccess = insertedCount + updatedCount;
    if (totalSuccess > 0) {
      const parts: string[] = [];
      if (insertedCount > 0) parts.push(`${insertedCount} nuevas`);
      if (updatedCount > 0) parts.push(`${updatedCount} actualizadas`);
      if (dorsalesAsignados > 0) parts.push(`${dorsalesAsignados} dorsales asignados`);
      if (errors.length > 0) parts.push(`${errors.length} errores`);
      if (skippedCount > 0) parts.push(`${skippedCount} filas vacías omitidas`);
      toast({
        title: "Importación completada",
        description: `Inscripciones: ${parts.join(", ")}`,
      });
      onImportComplete();
    } else {
      const skippedMsg = skippedCount > 0 ? ` (${skippedCount} filas vacías omitidas)` : "";
      toast({
        title: "Error en importación",
        description: `No se pudo importar ninguna inscripción${skippedMsg}`,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Inscripciones desde CSV
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Sube un archivo CSV con los datos de los participantes"}
            {step === "mapping" && "Mapea las columnas del CSV a los campos de inscripción"}
            {step === "preview" && "Revisa los datos antes de importar"}
            {step === "importing" && "Importando inscripciones..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 text-center">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Arrastra un archivo CSV o haz clic para seleccionar
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload">
                  <Button asChild>
                    <span>Seleccionar archivo CSV</span>
                  </Button>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm text-muted-foreground">o</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Descargar plantilla CSV
              </Button>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Descarga la plantilla con los campos configurados para esta carrera. 
                  El archivo usa <strong>punto y coma (;)</strong> como separador.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && csvData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{hayColumnaRecorrido ? "Recorrido de destino (lo decide la columna «Recorrido»)" : "Recorrido de destino *"}</Label>
                  <Select value={selectedDistanceId} onValueChange={setSelectedDistanceId}>
                    <SelectTrigger>
                      <SelectValue placeholder={hayColumnaRecorrido ? "Por columna, fila a fila" : "Selecciona un recorrido"} />
                    </SelectTrigger>
                    <SelectContent>
                      {distances.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Codificación del archivo</Label>
                  <Select value={encoding} onValueChange={(v) => handleEncodingChange(v as Encoding)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utf-8">UTF-8</SelectItem>
                      <SelectItem value="iso-8859-1">ISO-8859-1 (Latin-1 / Excel)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Badge variant="secondary" className="h-10 px-4 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {getMappedFieldsCount()} campos mapeados
                  </Badge>
                </div>
              </div>

              <ScrollArea className="h-[320px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Columna CSV</TableHead>
                      <TableHead className="w-1/3">Campo de Inscripción</TableHead>
                      <TableHead className="w-1/3">Ejemplo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {columnMappings.map((mapping) => (
                      <TableRow key={mapping.csvColumn}>
                        <TableCell className="font-medium">{mapping.csvColumn}</TableCell>
                        <TableCell>
                          {showNewFieldInput === mapping.csvColumn ? (
                            <div className="flex gap-2">
                              <Input
                                placeholder="Nombre del nuevo campo"
                                value={newFieldName}
                                onChange={(e) => setNewFieldName(e.target.value)}
                                className="flex-1"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleCreateNewField(mapping.csvColumn)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setShowNewFieldInput(null);
                                  setNewFieldName("");
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Select
                              value={mapping.field}
                              onValueChange={(value) => {
                                if (value === "create_new") {
                                  setShowNewFieldInput(mapping.csvColumn);
                                  setNewFieldName(mapping.csvColumn);
                                } else {
                                  updateMapping(mapping.csvColumn, value);
                                }
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableFields.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>
                                    {f.label}
                                    {f.isCustom && " (personalizado)"}
                                  </SelectItem>
                                ))}
                                <SelectItem value="create_new" className="text-primary font-medium">
                                  <span className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Crear nuevo campo...
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {csvData.rows[0]?.[mapping.csvColumn] || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{csvData.rows.length} filas encontradas en el archivo</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={asignarDorsales}
                    onChange={(e) => setAsignarDorsales(e.target.checked)}
                  />
                  Dorsal automático a las filas sin dorsal (rango de cada recorrido)
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="py-8 space-y-6">
              <div className="text-center">
                <div className="text-4xl font-bold mb-2">
                  {importProgress.current} / {importProgress.total}
                </div>
                <p className="text-muted-foreground">Inscripciones procesadas</p>
              </div>

              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                  }}
                />
              </div>

              {importProgress.errors > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {importProgress.errors} errores encontrados
                  </AlertDescription>
                </Alert>
              )}

              {importErrors.length > 0 && importProgress.current === importProgress.total && (
                <ScrollArea className="h-[200px] border rounded-lg p-4">
                  <div className="space-y-1 text-sm">
                    {importErrors.map((error, i) => (
                      <div key={i} className="text-destructive">
                        {error}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={resetState}>
                Volver
              </Button>
              <Button
                onClick={handleImport}
                disabled={(!selectedDistanceId && !hayColumnaRecorrido) || getMappedFieldsCount() === 0}
              >
                Importar {csvData?.rows.length} inscripciones
              </Button>
            </>
          )}

          {step === "importing" && importProgress.current === importProgress.total && (
            <Button onClick={handleClose}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
