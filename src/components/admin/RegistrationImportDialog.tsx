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
}

// Base registration fields (always available)
const BASE_FIELDS: FormField[] = [
  { value: "ignore", label: "-- Ignorar --" },
  { value: "guest_first_name", label: "Nombre" },
  { value: "guest_last_name", label: "Apellidos" },
  { value: "guest_email", label: "Email" },
  { value: "guest_phone", label: "Teléfono" },
  { value: "guest_dni_passport", label: "DNI/Pasaporte" },
  { value: "guest_birth_date", label: "Fecha de Nacimiento" },
  { value: "bib_number", label: "Dorsal" },
  { value: "status", label: "Estado" },
  { value: "payment_status", label: "Estado de Pago" },
  { value: "guest_emergency_contact", label: "Contacto de Emergencia" },
  { value: "guest_emergency_phone", label: "Teléfono de Emergencia" },
];

// Auto-detection mapping
const AUTO_DETECT_PATTERNS: Record<string, RegExp[]> = {
  guest_first_name: [/^nombre$/i, /^first.?name$/i, /^primer.?nombre$/i],
  guest_last_name: [/^apellido/i, /^last.?name$/i, /^surname$/i],
  guest_email: [/^email$/i, /^correo$/i, /^e-?mail$/i],
  guest_phone: [/^tel/i, /^phone$/i, /^móvil$/i, /^movil$/i, /^celular$/i],
  guest_dni_passport: [/^dni$/i, /^pasaporte$/i, /^documento$/i, /^id$/i, /^nif$/i, /^nie$/i],
  guest_birth_date: [/^fecha.?nac/i, /^birth/i, /^nacimiento$/i, /^f\.?\s?nac/i],
  bib_number: [/^dorsal$/i, /^bib$/i, /^número$/i, /^numero$/i],
  status: [/^estado$/i, /^status$/i],
  payment_status: [/^pago$/i, /^payment$/i, /^estado.?pago$/i],
  guest_emergency_contact: [/^emergencia$/i, /^contacto.?emergencia$/i],
  guest_emergency_phone: [/^tel.?emergencia$/i, /^phone.?emergency$/i],
};

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
    
    // First check against base patterns
    for (const [field, patterns] of Object.entries(AUTO_DETECT_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
        return { csvColumn: header, field };
      }
    }
    
    // Then check against custom form field labels
    for (const field of availableFields) {
      if (field.isCustom && field.label.toLowerCase() === normalizedHeader) {
        return { csvColumn: header, field: field.value };
      }
    }
    
    return { csvColumn: header, field: "ignore" };
  });
}

// Detect if text has encoding issues (replacement characters)
function hasEncodingIssues(text: string): boolean {
  return text.includes("�") || text.includes("\ufffd");
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
  const [availableFields, setAvailableFields] = useState<FormField[]>(BASE_FIELDS);
  const [encoding, setEncoding] = useState<Encoding>("utf-8");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [showNewFieldInput, setShowNewFieldInput] = useState<string | null>(null);

  // Load form fields when race/distance changes
  useEffect(() => {
    if (!raceId || !open) return;

    const loadFormFields = async () => {
      const { data: formFields } = await supabase
        .from("registration_form_fields")
        .select("id, field_name, field_label")
        .or(`race_id.eq.${raceId},race_distance_id.eq.${selectedDistanceId || distanceId}`)
        .eq("is_visible", true);

      if (formFields) {
        const customFields: FormField[] = formFields
          .filter(f => !BASE_FIELDS.some(bf => bf.value === f.field_name))
          .map(f => ({
            value: `custom_${f.id}`,
            label: f.field_label,
            isCustom: true,
            fieldId: f.id,
          }));
        
        setAvailableFields([...BASE_FIELDS, ...customFields]);
      }
    };

    loadFormFields();
  }, [raceId, selectedDistanceId, distanceId, open]);

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
        value: `custom_${newField.id}`,
        label: newField.field_label,
        isCustom: true,
        fieldId: newField.id,
      };

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

  const validateRow = (row: CSVRow): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const mappedData = getMappedData(row);

    // At least name or email required
    if (!mappedData.guest_first_name && !mappedData.guest_email) {
      errors.push("Se requiere nombre o email");
    }

    // Validate email format if provided
    if (mappedData.guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedData.guest_email)) {
      errors.push("Email inválido");
    }

    // Validate bib_number if provided
    if (mappedData.bib_number) {
      const bibNum = parseInt(mappedData.bib_number);
      if (isNaN(bibNum) || bibNum <= 0) {
        errors.push("Dorsal inválido");
      }
    }

    return { valid: errors.length === 0, errors };
  };

  const getMappedData = (row: CSVRow): Record<string, string> => {
    const data: Record<string, string> = {};
    columnMappings.forEach((mapping) => {
      if (mapping.field !== "ignore") {
        data[mapping.field] = row[mapping.csvColumn] || "";
      }
    });
    return data;
  };

  const handleImport = async () => {
    if (!csvData || !selectedDistanceId) return;

    setStep("importing");
    setImportProgress({ current: 0, total: csvData.rows.length, errors: 0 });
    setImportErrors([]);

    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      const validation = validateRow(row);

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

      try {
        // Separate base fields from custom fields
        const customFieldMappings: { fieldId: string; value: string }[] = [];
        
        const insertData: any = {
          race_id: raceId,
          race_distance_id: selectedDistanceId,
          guest_first_name: mappedData.guest_first_name || null,
          guest_last_name: mappedData.guest_last_name || null,
          guest_email: mappedData.guest_email || null,
          guest_phone: mappedData.guest_phone || null,
          guest_dni_passport: mappedData.guest_dni_passport || null,
          guest_birth_date: mappedData.guest_birth_date || null,
          guest_emergency_contact: mappedData.guest_emergency_contact || null,
          guest_emergency_phone: mappedData.guest_emergency_phone || null,
          status: mappedData.status || "confirmed",
          payment_status: mappedData.payment_status || "paid",
          bib_number: mappedData.bib_number ? parseInt(mappedData.bib_number) : null,
        };

        // Collect custom field values
        for (const [key, value] of Object.entries(mappedData)) {
          if (key.startsWith("custom_") && value) {
            const field = availableFields.find(f => f.value === key);
            if (field?.fieldId) {
              customFieldMappings.push({ fieldId: field.fieldId, value });
            }
          }
        }

        const { data: registration, error } = await supabase
          .from("registrations")
          .insert(insertData)
          .select("id")
          .single();

        if (error) {
          errors.push(`Fila ${i + 2}: ${error.message}`);
          setImportProgress((prev) => ({
            ...prev,
            current: i + 1,
            errors: prev.errors + 1,
          }));
        } else {
          // Insert custom field responses
          if (registration && customFieldMappings.length > 0) {
            const responses = customFieldMappings.map(cf => ({
              registration_id: registration.id,
              field_id: cf.fieldId,
              field_value: cf.value,
            }));
            
            await supabase.from("registration_responses").insert(responses);
          }
          
          successCount++;
          setImportProgress((prev) => ({
            ...prev,
            current: i + 1,
          }));
        }
      } catch (err: any) {
        errors.push(`Fila ${i + 2}: Error inesperado`);
        setImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          errors: prev.errors + 1,
        }));
      }
    }

    setImportErrors(errors);

    if (successCount > 0) {
      toast({
        title: "Importación completada",
        description: `Se importaron ${successCount} inscripciones${errors.length > 0 ? ` (${errors.length} errores)` : ""}`,
      });
      onImportComplete();
    } else {
      toast({
        title: "Error en importación",
        description: "No se pudo importar ninguna inscripción",
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
                  <Label>Recorrido de destino *</Label>
                  <Select value={selectedDistanceId} onValueChange={setSelectedDistanceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un recorrido" />
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

              <div className="text-sm text-muted-foreground">
                {csvData.rows.length} filas encontradas en el archivo
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
                disabled={!selectedDistanceId || getMappedFieldsCount() === 0}
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
