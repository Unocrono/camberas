import { useState, useCallback } from "react";
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
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
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

const IMPORTABLE_FIELDS = [
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
};

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

function autoDetectMapping(headers: string[]): ColumnMapping[] {
  return headers.map((header) => {
    const normalizedHeader = header.trim();
    for (const [field, patterns] of Object.entries(AUTO_DETECT_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
        return { csvColumn: header, field };
      }
    }
    return { csvColumn: header, field: "ignore" };
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

  const resetState = useCallback(() => {
    setStep("upload");
    setCsvData(null);
    setColumnMappings([]);
    setImportProgress({ current: 0, total: 0, errors: 0 });
    setImportErrors([]);
  }, []);

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

      try {
        const text = await file.text();
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
        setColumnMappings(autoDetectMapping(parsed.headers));

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

        setStep("mapping");
      } catch (error) {
        toast({
          title: "Error al leer archivo",
          description: "No se pudo procesar el archivo CSV",
          variant: "destructive",
        });
      }

      // Reset input
      event.target.value = "";
    },
    [raceId, distanceId, toast]
  );

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
        const insertData: any = {
          race_id: raceId,
          race_distance_id: selectedDistanceId,
          guest_first_name: mappedData.guest_first_name || null,
          guest_last_name: mappedData.guest_last_name || null,
          guest_email: mappedData.guest_email || null,
          guest_phone: mappedData.guest_phone || null,
          guest_dni_passport: mappedData.guest_dni_passport || null,
          guest_birth_date: mappedData.guest_birth_date || null,
          status: mappedData.status || "confirmed",
          payment_status: mappedData.payment_status || "paid",
          bib_number: mappedData.bib_number ? parseInt(mappedData.bib_number) : null,
        };

        const { error } = await supabase.from("registrations").insert(insertData);

        if (error) {
          errors.push(`Fila ${i + 2}: ${error.message}`);
          setImportProgress((prev) => ({
            ...prev,
            current: i + 1,
            errors: prev.errors + 1,
          }));
        } else {
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
            <div className="flex flex-col items-center justify-center py-12 gap-6">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
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

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  El archivo debe tener encabezados en la primera fila. Se detectarán automáticamente
                  campos como nombre, email, teléfono, DNI, etc.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && csvData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex items-end">
                  <Badge variant="secondary" className="h-10 px-4 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {getMappedFieldsCount()} campos mapeados
                  </Badge>
                </div>
              </div>

              <ScrollArea className="h-[350px] border rounded-lg">
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
                          <Select
                            value={mapping.field}
                            onValueChange={(value) => updateMapping(mapping.csvColumn, value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IMPORTABLE_FIELDS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
