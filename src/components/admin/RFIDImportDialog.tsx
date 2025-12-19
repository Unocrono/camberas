import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface TimingPoint {
  id: string;
  name: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface BibChip {
  bib_number: number;
  chip_code: string;
  chip_code_2: string | null;
  chip_code_3: string | null;
  chip_code_4: string | null;
  chip_code_5: string | null;
  race_distance_id: string;
}

interface ParsedReading {
  reader_id: string;
  chip_code: string;
  bib_number: number | null;
  timestamp: Date;
  raw_line: string;
  resolved_bib: number | null;
  resolved_distance_id: string | null;
  has_error: boolean;
  error_message?: string;
}

interface DetectedFormat {
  type: string;
  description: string;
  hasDate: boolean;
  hasBibNumber: boolean;
  dateFormat: string;
}

type ImportMode = 'auto' | 'simple';

interface SimpleFormatConfig {
  separator: string;
  chipColumn: number;
  timeColumn: number;
  dateFormat: 'time_only' | 'date_time_eu' | 'date_time_us' | 'date_time_iso';
  timeFormat: 'hms' | 'hms_ms';
}

interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  noChipMatch: number;
}

interface RFIDImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raceId: string;
  timingPoints: TimingPoint[];
  distances: RaceDistance[];
  onImportComplete: () => void;
}

// Detects the format of the RFID file based on sample lines
function detectFormat(lines: string[]): DetectedFormat | null {
  // Get first valid line (skip empty lines)
  const sampleLine = lines.find(line => line.trim().length > 0);
  if (!sampleLine) return null;

  const parts = sampleLine.split(',');
  if (parts.length < 4) return null;

  const col2 = parts[1]?.trim();
  const col3 = parts[2]?.trim();
  const col4 = parts[3]?.replace(/"/g, '').trim();

  // Determine if col4 is date+time or just time
  const hasDate = col4.includes('/') || col4.includes('-') && col4.length > 12;
  
  // Determine if col3 has bib number (different from col2 and not 0)
  const col3IsZero = col3 === '0';
  const col3EqualsCol2 = col3 === col2;
  const col3IsNumericBib = /^\d+$/.test(col3) && !col3IsZero && !col3EqualsCol2;

  // Detect date format
  let dateFormat = '';
  if (hasDate) {
    if (col4.includes('/')) {
      dateFormat = 'DD/MM/YYYY HH:MM:SS.mmm';
    } else if (col4.match(/^\d{4}-/)) {
      dateFormat = 'YYYY-MM-DD HH:MM:SS.mmm';
    }
  } else {
    dateFormat = 'HH:MM:SS.mmm';
  }

  // Build format description
  let type = '';
  let description = '';
  
  if (col3IsZero) {
    type = 'chip_only';
    description = 'ID_Lector, Chip, (vacío), Hora';
  } else if (col3EqualsCol2) {
    type = 'chip_duplicated';
    description = 'ID_Lector, Chip, Chip (repetido), Hora';
  } else if (col3IsNumericBib) {
    type = 'with_bib';
    description = 'ID_Lector, Chip, Dorsal, Hora';
  } else {
    type = 'chip_only';
    description = 'ID_Lector, Chip, ?, Hora';
  }

  return {
    type,
    description: description + (hasDate ? ' (con fecha)' : ' (solo hora)'),
    hasDate,
    hasBibNumber: col3IsNumericBib,
    dateFormat
  };
}

// Parse a single line based on detected format
function parseLine(
  line: string, 
  format: DetectedFormat, 
  defaultDate: string
): { readerId: string; chipCode: string; bibNumber: number | null; timestamp: Date } | null {
  const parts = line.split(',');
  if (parts.length < 4) return null;

  const readerId = parts[0]?.trim();
  const chipCode = parts[1]?.trim();
  const col3 = parts[2]?.trim();
  const timeStr = parts[3]?.replace(/"/g, '').trim();

  if (!readerId || !chipCode || !timeStr) return null;

  // Determine bib number
  let bibNumber: number | null = null;
  if (format.hasBibNumber && col3 && col3 !== '0' && col3 !== chipCode) {
    // Try to extract number from formats like "UNO007" or plain "7"
    const numMatch = col3.match(/(\d+)$/);
    if (numMatch) {
      bibNumber = parseInt(numMatch[1], 10);
    }
  }

  // Parse timestamp
  let timestamp: Date;
  
  if (format.hasDate) {
    // Has date in the timestamp
    if (format.dateFormat.includes('DD/MM/YYYY')) {
      // Format: DD/MM/YYYY HH:MM:SS.mmm
      const match = timeStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\.?(\d*)/);
      if (!match) return null;
      const [, day, month, year, hours, minutes, seconds, ms] = match;
      timestamp = new Date(
        parseInt(year), parseInt(month) - 1, parseInt(day),
        parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0')
      );
    } else {
      // Format: YYYY-MM-DD HH:MM:SS.mmm
      const match = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.?(\d*)/);
      if (!match) return null;
      const [, year, month, day, hours, minutes, seconds, ms] = match;
      timestamp = new Date(
        parseInt(year), parseInt(month) - 1, parseInt(day),
        parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0')
      );
    }
  } else {
    // Only time - use default date
    const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})\.?(\d*)/);
    if (!match) return null;
    const [, hours, minutes, seconds, ms] = match;
    const dateObj = new Date(defaultDate);
    dateObj.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0'));
    timestamp = dateObj;
  }

  if (isNaN(timestamp.getTime())) return null;

  return { readerId, chipCode, bibNumber, timestamp };
}

export function RFIDImportDialog({
  open,
  onOpenChange,
  raceId,
  timingPoints,
  distances,
  onImportComplete,
}: RFIDImportDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [detectedFormat, setDetectedFormat] = useState<DetectedFormat | null>(null);
  const [parsedReadings, setParsedReadings] = useState<ParsedReading[]>([]);
  const [bibChips, setBibChips] = useState<BibChip[]>([]);
  
  // Import mode
  const [importMode, setImportMode] = useState<ImportMode>('auto');
  const [simpleConfig, setSimpleConfig] = useState<SimpleFormatConfig>({
    separator: ',',
    chipColumn: 1,
    timeColumn: 2,
    dateFormat: 'time_only',
    timeFormat: 'hms_ms',
  });
  
  // Form fields
  const [selectedTimingPointId, setSelectedTimingPointId] = useState<string>("");
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [defaultDate, setDefaultDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [readerDeviceId, setReaderDeviceId] = useState<string>("");
  
  // Import state
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');

  // Load bib_chips for the race
  const loadBibChips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('bib_chips')
        .select('bib_number, chip_code, chip_code_2, chip_code_3, chip_code_4, chip_code_5, race_distance_id')
        .eq('race_id', raceId);
      
      if (error) throw error;
      setBibChips(data || []);
    } catch (error) {
      console.error('Error loading bib_chips:', error);
    }
  }, [raceId]);


  // Parse simple format line
  const parseSimpleLine = useCallback((
    line: string,
    config: SimpleFormatConfig,
    defaultDateStr: string
  ): { chipCode: string; timestamp: Date } | null => {
    const parts = line.split(config.separator);
    if (parts.length < Math.max(config.chipColumn, config.timeColumn)) return null;

    const chipCode = parts[config.chipColumn - 1]?.trim();
    const timeStr = parts[config.timeColumn - 1]?.replace(/"/g, '').trim();

    if (!chipCode || !timeStr) return null;

    let timestamp: Date;

    try {
      if (config.dateFormat === 'time_only') {
        // Only time: HH:MM:SS or HH:MM:SS.mmm
        const match = config.timeFormat === 'hms_ms'
          ? timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)/)
          : timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (!match) return null;
        const [, hours, minutes, seconds, ms] = match;
        const dateObj = new Date(defaultDateStr);
        dateObj.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0'));
        timestamp = dateObj;
      } else if (config.dateFormat === 'date_time_eu') {
        // DD/MM/YYYY HH:MM:SS
        const match = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)/);
        if (!match) return null;
        const [, day, month, year, hours, minutes, seconds, ms] = match;
        timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
          parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0'));
      } else if (config.dateFormat === 'date_time_us') {
        // MM/DD/YYYY HH:MM:SS
        const match = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)/);
        if (!match) return null;
        const [, month, day, year, hours, minutes, seconds, ms] = match;
        timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
          parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0'));
      } else {
        // ISO: YYYY-MM-DD HH:MM:SS
        const match = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\.?(\d*)/);
        if (!match) return null;
        const [, year, month, day, hours, minutes, seconds, ms] = match;
        timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
          parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(ms || '0'));
      }
    } catch {
      return null;
    }

    if (isNaN(timestamp.getTime())) return null;

    return { chipCode, timestamp };
  }, []);

  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setFile(selectedFile);
    setImportResult(null);

    try {
      const content = await selectedFile.text();
      setFileContent(content);

      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      if (importMode === 'auto') {
        // Detect format automatically
        const format = detectFormat(lines);
        setDetectedFormat(format);

        if (!format) {
          toast({
            title: "Formato no reconocido automáticamente",
            description: "Prueba con el modo 'Formato Simple' para configurar manualmente",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      // Load bib_chips mapping
      await loadBibChips();

      setStep('preview');
    } catch (error) {
      console.error('Error reading file:', error);
      toast({
        title: "Error",
        description: "No se pudo leer el archivo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Parse and resolve readings when settings change
  const parseAndResolve = useCallback(() => {
    if (!fileContent) return;
    
    // For auto mode, require detected format
    if (importMode === 'auto' && !detectedFormat) return;

    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
    const readings: ParsedReading[] = [];

    for (const line of lines) {
      let parsed: { readerId?: string; chipCode: string; bibNumber?: number | null; timestamp: Date } | null = null;
      
      if (importMode === 'simple') {
        // Use simple format parser
        const simpleParsed = parseSimpleLine(line, simpleConfig, defaultDate);
        if (simpleParsed) {
          parsed = {
            readerId: '',
            chipCode: simpleParsed.chipCode,
            bibNumber: null,
            timestamp: simpleParsed.timestamp,
          };
        }
      } else {
        // Use auto format parser
        parsed = parseLine(line, detectedFormat!, defaultDate);
      }
      
      if (!parsed) {
        readings.push({
          reader_id: '',
          chip_code: '',
          bib_number: null,
          timestamp: new Date(),
          raw_line: line,
          resolved_bib: null,
          resolved_distance_id: null,
          has_error: true,
          error_message: 'Línea no válida',
        });
        continue;
      }

      // Try to resolve chip to bib number
      let resolvedBib = parsed.bibNumber || null;
      let resolvedDistanceId: string | null = selectedDistanceId || null;

      if (!resolvedBib) {
        // Look up in bib_chips
        const chipMatch = bibChips.find(bc => {
          const chipLower = parsed!.chipCode.toLowerCase();
          return (
            bc.chip_code?.toLowerCase() === chipLower ||
            bc.chip_code_2?.toLowerCase() === chipLower ||
            bc.chip_code_3?.toLowerCase() === chipLower ||
            bc.chip_code_4?.toLowerCase() === chipLower ||
            bc.chip_code_5?.toLowerCase() === chipLower
          );
        });

        if (chipMatch) {
          resolvedBib = chipMatch.bib_number;
          resolvedDistanceId = chipMatch.race_distance_id;
        }
      }

      readings.push({
        reader_id: parsed.readerId || '',
        chip_code: parsed.chipCode,
        bib_number: parsed.bibNumber || null,
        timestamp: parsed.timestamp,
        raw_line: line,
        resolved_bib: resolvedBib,
        resolved_distance_id: resolvedDistanceId,
        has_error: !resolvedBib,
        error_message: !resolvedBib ? 'Chip no resuelto a dorsal' : undefined,
      });
    }

    setParsedReadings(readings);
  }, [fileContent, detectedFormat, defaultDate, bibChips, selectedDistanceId, importMode, simpleConfig, parseSimpleLine]);

  // Re-parse when settings change
  const handleSettingsChange = useCallback(() => {
    parseAndResolve();
  }, [parseAndResolve]);

  // Initial parse when entering preview step
  useState(() => {
    if (step === 'preview' && fileContent && (detectedFormat || importMode === 'simple')) {
      parseAndResolve();
    }
  });

  // Handle import
  const handleImport = async () => {
    if (!raceId || parsedReadings.length === 0) return;

    // Filter only valid readings with resolved bib
    const validReadings = parsedReadings.filter(r => r.resolved_bib && !r.has_error);
    
    if (validReadings.length === 0) {
      toast({
        title: "Sin lecturas válidas",
        description: "No hay lecturas con dorsal resuelto para importar. Verifica la configuración de chips.",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    setImportProgress(0);

    const result: ImportResult = {
      total: parsedReadings.length,
      imported: 0,
      duplicates: 0,
      errors: 0,
      noChipMatch: parsedReadings.filter(r => !r.resolved_bib).length,
    };

    try {
      // Batch insert in chunks of 100
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < validReadings.length; i += chunkSize) {
        chunks.push(validReadings.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Prepare readings for insert - registration_id se resuelve dinámicamente via bib_number + race_id
        const insertData = chunk.map(reading => ({
          race_id: raceId,
          bib_number: reading.resolved_bib!,
          chip_code: reading.chip_code,
          timing_timestamp: reading.timestamp.toISOString(),
          timing_point_id: selectedTimingPointId || null,
          race_distance_id: reading.resolved_distance_id || selectedDistanceId || null,
          reader_device_id: readerDeviceId || reading.reader_id,
          reading_type: 'automatic',
          operator_user_id: user?.id || null,
          is_processed: false,
          lap_number: 1,
        }));

        const { data, error } = await supabase
          .from('timing_readings')
          .insert(insertData)
          .select('id');

        if (error) {
          // Check for duplicate error
          if (error.code === '23505') {
            result.duplicates += chunk.length;
          } else {
            console.error('Insert error:', error);
            result.errors += chunk.length;
          }
        } else {
          result.imported += data?.length || 0;
        }

        setImportProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      setImportResult(result);
      setStep('result');

      toast({
        title: "Importación completada",
        description: `${result.imported} lecturas importadas de ${result.total} procesadas`,
      });

      onImportComplete();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Error",
        description: error.message || "Error durante la importación",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  // Reset dialog
  const handleReset = () => {
    setFile(null);
    setFileContent("");
    setDetectedFormat(null);
    setParsedReadings([]);
    setImportResult(null);
    setStep('upload');
    // Don't reset importMode or simpleConfig to preserve user's preference
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Close and reset
  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  // Stats for preview
  const validCount = parsedReadings.filter(r => r.resolved_bib && !r.has_error).length;
  const unresolvedCount = parsedReadings.filter(r => !r.resolved_bib).length;
  const errorCount = parsedReadings.filter(r => r.has_error && r.resolved_bib).length;
  const uniqueChips = new Set(parsedReadings.map(r => r.chip_code)).size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Lecturas RFID</DialogTitle>
          <DialogDescription>
            Importa lecturas desde un archivo de texto del lector RFID Timing
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {step === 'upload' && (
            <div className="space-y-6 py-4">
              {/* Import Mode Selection */}
              <div className="space-y-2">
                <Label>Modo de importación</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Card 
                    className={`p-4 cursor-pointer transition-colors ${importMode === 'auto' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                    onClick={() => setImportMode('auto')}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-4 h-4 rounded-full border-2 ${importMode === 'auto' ? 'border-primary bg-primary' : 'border-muted-foreground/50'}`} />
                      <span className="font-medium">Automático</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Detecta formato RFID Timing estándar (4 columnas)
                    </p>
                  </Card>
                  <Card 
                    className={`p-4 cursor-pointer transition-colors ${importMode === 'simple' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                    onClick={() => setImportMode('simple')}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-4 h-4 rounded-full border-2 ${importMode === 'simple' ? 'border-primary bg-primary' : 'border-muted-foreground/50'}`} />
                      <span className="font-medium">Formato Simple</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Configura columnas manualmente (Chip, Hora)
                    </p>
                  </Card>
                </div>
              </div>

              {/* Simple format configuration */}
              {importMode === 'simple' && (
                <Card>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Separador</Label>
                        <Select 
                          value={simpleConfig.separator} 
                          onValueChange={(v) => setSimpleConfig(c => ({ ...c, separator: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value=",">Coma (,)</SelectItem>
                            <SelectItem value=";">Punto y coma (;)</SelectItem>
                            <SelectItem value="\t">Tabulador</SelectItem>
                            <SelectItem value=" ">Espacio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Columna Chip</Label>
                        <Select 
                          value={simpleConfig.chipColumn.toString()} 
                          onValueChange={(v) => setSimpleConfig(c => ({ ...c, chipColumn: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map(n => (
                              <SelectItem key={n} value={n.toString()}>Columna {n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Columna Hora</Label>
                        <Select 
                          value={simpleConfig.timeColumn.toString()} 
                          onValueChange={(v) => setSimpleConfig(c => ({ ...c, timeColumn: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map(n => (
                              <SelectItem key={n} value={n.toString()}>Columna {n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Formato de fecha</Label>
                        <Select 
                          value={simpleConfig.dateFormat} 
                          onValueChange={(v: any) => setSimpleConfig(c => ({ ...c, dateFormat: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="time_only">Solo hora (HH:MM:SS)</SelectItem>
                            <SelectItem value="date_time_eu">DD/MM/YYYY HH:MM:SS</SelectItem>
                            <SelectItem value="date_time_us">MM/DD/YYYY HH:MM:SS</SelectItem>
                            <SelectItem value="date_time_iso">YYYY-MM-DD HH:MM:SS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Formato de hora</Label>
                        <Select 
                          value={simpleConfig.timeFormat} 
                          onValueChange={(v: any) => setSimpleConfig(c => ({ ...c, timeFormat: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hms">HH:MM:SS</SelectItem>
                            <SelectItem value="hms_ms">HH:MM:SS.mmm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* File Upload */}
              <div 
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Analizando archivo...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Haz clic para seleccionar un archivo</p>
                    <p className="text-sm text-muted-foreground">
                      {importMode === 'auto' 
                        ? 'Formatos soportados: .txt del lector RFID Timing'
                        : 'Cualquier archivo .txt o .csv con Chip y Hora'
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* Format info - only for auto mode */}
              {importMode === 'auto' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Formatos detectados automáticamente</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1 text-sm">
                    <p>• ID_Lector, Chip, 0, "HH:MM:SS.mmm"</p>
                    <p>• ID_Lector, Chip, Chip, "HH:MM:SS.mmm"</p>
                    <p>• ID_Lector, Chip, Dorsal, "HH:MM:SS.mmm"</p>
                    <p>• Con fecha: "DD/MM/YYYY HH:MM:SS" o "YYYY-MM-DD HH:MM:SS"</p>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4 py-4">
              {/* File info */}
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{file?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {parsedReadings.length} líneas • {uniqueChips} chips únicos
                    {importMode === 'simple' && ' • Formato simple'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Cambiar archivo
                </Button>
              </div>

              {/* Detected format - only for auto mode */}
              {importMode === 'auto' && detectedFormat && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>Formato detectado</AlertTitle>
                  <AlertDescription>
                    {detectedFormat.description}
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Simple format info */}
              {importMode === 'simple' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Formato configurado</AlertTitle>
                  <AlertDescription>
                    Chip en columna {simpleConfig.chipColumn}, Hora en columna {simpleConfig.timeColumn} 
                    {simpleConfig.dateFormat === 'time_only' && ` (usando fecha: ${defaultDate})`}
                  </AlertDescription>
                </Alert>
              )}

              {/* Settings */}
              <Card>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {(importMode === 'simple' && simpleConfig.dateFormat === 'time_only') || (importMode === 'auto' && !detectedFormat?.hasDate) ? (
                      <div className="space-y-2">
                        <Label>Fecha de las lecturas *</Label>
                        <Input
                          type="date"
                          value={defaultDate}
                          onChange={(e) => {
                            setDefaultDate(e.target.value);
                            setTimeout(handleSettingsChange, 0);
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>ID del Lector</Label>
                      <Input
                        placeholder="Ej: Ultra-01, Meta..."
                        value={readerDeviceId}
                        onChange={(e) => setReaderDeviceId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Punto de Cronometraje *</Label>
                      <Select value={selectedTimingPointId} onValueChange={setSelectedTimingPointId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona punto" />
                        </SelectTrigger>
                        <SelectContent>
                          {timingPoints.map((tp) => (
                            <SelectItem key={tp.id} value={tp.id}>
                              {tp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Evento (si no viene del chip)</Label>
                      <Select 
                        value={selectedDistanceId || "auto"} 
                        onValueChange={(v) => {
                          setSelectedDistanceId(v === "auto" ? "" : v);
                          setTimeout(handleSettingsChange, 0);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Automático desde chips" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automático (de bib_chips)</SelectItem>
                          {distances.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name} ({d.distance_km}km)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={parseAndResolve}
                    className="w-full"
                  >
                    Resolver chips a dorsales
                  </Button>
                </CardContent>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Válidas</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{validCount}</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium">Sin dorsal</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{unresolvedCount}</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Errores</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{errorCount}</p>
                </Card>
              </div>

              {/* Preview table */}
              <div className="space-y-2">
                <Label>Vista previa (primeras 50 lecturas)</Label>
                <ScrollArea className="h-48 border rounded-md">
                  <div className="p-2 space-y-1 text-sm font-mono">
                    {parsedReadings.slice(0, 50).map((reading, idx) => (
                      <div 
                        key={idx} 
                        className={`flex gap-4 px-2 py-1 rounded ${
                          reading.has_error 
                            ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' 
                            : 'bg-muted'
                        }`}
                      >
                        <span className="w-16">#{reading.resolved_bib || '???'}</span>
                        <span className="w-24">{reading.chip_code}</span>
                        <span className="flex-1">
                          {reading.timestamp.toLocaleString('es-ES')}
                        </span>
                        {reading.has_error && (
                          <Badge variant="destructive" className="text-xs">
                            {reading.error_message}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {unresolvedCount > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Chips sin resolver</AlertTitle>
                  <AlertDescription>
                    {unresolvedCount} lecturas no tienen dorsal asignado. 
                    Verifica que los chips estén registrados en "Chips RFID" o que el archivo incluya dorsales.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'result' && importResult && (
            <div className="space-y-6 py-4">
              <div className="text-center py-8">
                <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold">Importación completada</h3>
                <p className="text-muted-foreground mt-2">
                  Se han procesado {importResult.total} lecturas del archivo
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="text-sm text-muted-foreground">Importadas</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{importResult.noChipMatch}</p>
                  <p className="text-sm text-muted-foreground">Sin dorsal</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{importResult.duplicates}</p>
                  <p className="text-sm text-muted-foreground">Duplicadas</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{importResult.errors}</p>
                  <p className="text-sm text-muted-foreground">Errores</p>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {importing && (
          <div className="py-2">
            <Progress value={importProgress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center mt-1">
              Importando... {importProgress}%
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Atrás
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importing || validCount === 0 || !selectedTimingPointId}
              >
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importar {validCount} lecturas
              </Button>
            </>
          )}
          
          {step === 'result' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Importar otro archivo
              </Button>
              <Button onClick={handleClose}>
                Cerrar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
