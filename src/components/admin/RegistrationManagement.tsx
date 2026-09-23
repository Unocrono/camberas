import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from "@/hooks/useDataRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, Filter, Hash, Plus, Pencil, Trash2, Upload, ChevronDown, CheckCircle, CreditCard, Route, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Users, Tag, RefreshCw, QrCode, Mail, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { qrConLogo } from "@/lib/qrConLogo";
import { calculateCategoryByAge, RaceCategory } from "@/lib/categoryUtils";
import { getGenderCode, resolveGenderId } from "@/lib/genderUtils";
import { camposVisibles } from "@/lib/fieldConditions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RegistrationResponsesView } from "./RegistrationResponsesView";
import { RegistrationImportDialog } from "./RegistrationImportDialog";
import { DynamicEditRegistrationForm } from "./DynamicEditRegistrationForm";

interface Registration {
  id: string;
  status: string;
  payment_status: string;
  bib_number: number | null;
  created_at: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
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
  race_id: string;
  race_distance_id: string;
  source: string | null;
  race: {
    id: string;
    name: string;
    date: string;
    organizer_id?: string | null;
  };
  race_distance: {
    id: string;
    name: string;
    distance_km: number;
  };
  profiles: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    dni_passport: string | null;
    gender: string | null;
    gender_id: number | null;
    birth_date: string | null;
    club: string | null;
    team: string | null;
    country: string | null;
  } | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
  race_id: string;
}

interface RegistrationManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

interface RegistrationFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dni_passport: string;
  race_id: string;
  race_distance_id: string;
  status: string;
  payment_status: string;
  bib_number: string;
  /** Lo cobrado FUERA de la pasarela en un alta manual (en mano, transferencia) */
  importe_manual: string;
}

const emptyFormData: RegistrationFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  dni_passport: "",
  race_id: "",
  race_distance_id: "",
  status: "pending",
  payment_status: "pending",
  importe_manual: "",
  bib_number: "",
};

type ColumnKey = "bib_number" | "participant" | "email" | "dni" | "phone" | "type" | "origen" | "distance" | "status" | "payment" | "gender" | "category" | "club" | "team" | "country" | "birth_date" | "created_at" | "actions";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "bib_number", label: "Dorsal" },
  { key: "participant", label: "Participante" },
  { key: "email", label: "Email" },
  { key: "dni", label: "DNI/Pasaporte" },
  { key: "phone", label: "Teléfono" },
  { key: "gender", label: "Género" },
  { key: "birth_date", label: "F. Nacimiento" },
  { key: "category", label: "Categoría" },
  { key: "club", label: "Club" },
  { key: "team", label: "Equipo" },
  { key: "country", label: "País" },
  { key: "created_at", label: "Fecha y hora" },
  { key: "type", label: "Tipo" },
  { key: "origen", label: "Origen" },
  { key: "distance", label: "Distancia" },
  { key: "status", label: "Estado" },
  { key: "payment", label: "Pago" },
  { key: "actions", label: "Acciones" },
];

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ["bib_number", "participant", "gender", "category", "club", "team", "distance", "created_at", "origen", "status", "payment", "actions"];

// De dónde viene cada inscripción: pasarela de Camberas, alta manual del
// organizador, gratuita, o sincronizada desde EventBooking (UNO.es).
const ORIGEN_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  gateway: { label: "Camberas", variant: "default" },
  manual: { label: "Manual", variant: "secondary" },
  free: { label: "Gratuita", variant: "secondary" },
  external: { label: "UNO", variant: "outline" },
};

// Respuesta de la función reenviar-comprobantes (sumada si hay varios lotes)
interface ResultadoReenvio {
  registrationId: string;
  resultado: "enviado" | "se_enviaria" | "omitido" | "fallido";
  plantilla?: "pagada" | "gratuita";
  motivo?: string;
  email?: string;
  error?: string;
}
interface ResumenReenvio {
  total: number;
  enviados: number;
  se_enviarian: number;
  omitidos: number;
  fallidos: number;
  resultados: ResultadoReenvio[];
}

// La función acepta 50 inscripciones por llamada. El ensayo no manda nada y
// va rápido; el envío real va de 10 en 10 (unos 7 s por lote) para que el
// contador avance y cada llamada quede lejos del tiempo máximo.
const REENVIO_LOTE_ENSAYO = 50;
const REENVIO_LOTE_ENVIO = 10;

// Por qué no se manda a alguien, en plural para el recuento del diálogo
const MOTIVOS_OMISION: Record<string, string> = {
  pendiente_de_pago: "pendientes de pago (todavía no tienen comprobante)",
  pendiente_de_confirmar: "gratuitas pendientes de confirmar",
  cancelada: "canceladas",
  reembolsada: "reembolsadas",
  importada_de_uno_es: "importadas de uno.es (ya recibieron el suyo)",
  sin_email: "sin email",
  estado_desconocido: "con un estado de pago desconocido",
};

export function RegistrationManagement({ isOrganizer = false, selectedRaceId }: RegistrationManagementProps) {
  // QR del dorsal GPS: reutiliza (o crea) el token del corredor y abre el QR
  const abrirQrDorsal = async (reg: any) => {
    try {
      if (!reg.bib_number) {
        toast({ title: "Asigna primero un dorsal", variant: "destructive" });
        return;
      }
      const raceId = selectedRaceId || selectedRace;
      const { data: lista } = await supabase.rpc("tokens_corredores_carrera" as never,
        { p_race_id: raceId } as never);
      let tok = ((lista as any[]) ?? []).find(
        (t) => t.distance_id === reg.race_distance_id && String(t.bib) === String(reg.bib_number) && t.activo
      )?.token;
      if (!tok) {
        const nombre = `${reg.first_name ?? ""} ${reg.last_name ?? ""}`.trim();
        const { data, error } = await supabase.rpc("generar_token_corredor" as never, {
          p_distance_id: reg.race_distance_id, p_bib: String(reg.bib_number), p_nombre: nombre || null,
        } as never);
        if (error) throw error;
        tok = (data as any).token;
      }
      const url = `https://camberas.com/activar.html?t=${tok}`;
      const png = await qrConLogo(url);
      navigator.clipboard.writeText(url).catch(() => {});
      const w = window.open("", "_blank", "width=420,height=520");
      if (w) {
        w.document.write(`<title>Dorsal ${reg.bib_number}</title><body style="font-family:sans-serif;text-align:center"><h3>Dorsal ${reg.bib_number} — QR de activación</h3><img src="${png}" style="width:360px"/><p style="font-size:12px;word-break:break-all">${url}</p></body>`);
      }
      toast({ title: `QR del dorsal ${reg.bib_number} — enlace copiado` });
    } catch (e: any) {
      toast({ title: "No se pudo generar el QR", description: e.message, variant: "destructive" });
    }
  };

  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedRace, setSelectedRace] = useState<string>("all");
  const [selectedDistance, setSelectedDistance] = useState<string>("");
  // El organizador arranca viendo solo confirmadas: los intentos de
  // inscripción abandonados le ensucian la lista. El admin sigue viendo
  // todo de entrada, que para eso da soporte. Ambos pueden cambiarlo.
  const [selectedStatus, setSelectedStatus] = useState<string>(
    isOrganizer ? "confirmed" : "all",
  );
  const [searchTerm, setSearchTerm] = useState("");
  
  // Column filters
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterClub, setFilterClub] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<string>("all");

  // CRUD
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null);
  const [formData, setFormData] = useState<RegistrationFormData>(emptyFormData);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [formDistances, setFormDistances] = useState<RaceDistance[]>([]);
  const [saving, setSaving] = useState(false);

  // Bib assignment
  const [assigningBib, setAssigningBib] = useState<string | null>(null);
  const [bibNumber, setBibNumber] = useState("");
  
  // Import dialog
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Sincronización EventBooking (uno.es): el botón solo aparece si la
  // carrera seleccionada tiene fila en eventbooking_sync.
  const [ebConfigurado, setEbConfigurado] = useState(false);
  const [ebSincronizando, setEbSincronizando] = useState(false);
  
  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  
  // Bulk actions
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkStatusDialog, setBulkStatusDialog] = useState(false);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  const [bulkDistanceDialog, setBulkDistanceDialog] = useState(false);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkGenderDialog, setBulkGenderDialog] = useState(false);
  const [bulkCategoryDialog, setBulkCategoryDialog] = useState(false);
  const [bulkClubDialog, setBulkClubDialog] = useState(false);
  const [bulkTeamDialog, setBulkTeamDialog] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState("confirmed");
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("paid");
  const [bulkDistanceId, setBulkDistanceId] = useState("");
  const [bulkGender, setBulkGender] = useState("male");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkClub, setBulkClub] = useState("");
  const [bulkTeam, setBulkTeam] = useState("");

  // Reenviar comprobante por email: primero un ensayo que cuenta a quién le
  // llegaría y a quién no (y por qué); después, el envío de verdad
  const [reenvioDialog, setReenvioDialog] = useState(false);
  // La selección se congela al abrir: la lista puede recargarse (y vaciar la
  // selección) con el diálogo abierto
  const [reenvioIds, setReenvioIds] = useState<string[]>([]);
  const [reenvioExternas, setReenvioExternas] = useState(false);
  const [reenvioEnsayo, setReenvioEnsayo] = useState<ResumenReenvio | null>(null);
  const [reenvioFinal, setReenvioFinal] = useState<ResumenReenvio | null>(null);
  const [reenvioFase, setReenvioFase] = useState<"calculando" | "listo" | "enviando" | "hecho">("calculando");
  const [reenvioProgreso, setReenvioProgreso] = useState(0);
  const reenvioPeticion = useRef(0);

  // Form fields and responses
  const [formFields, setFormFields] = useState<any[]>([]);
  const [registrationResponses, setRegistrationResponses] = useState<Map<string, Map<string, string>>>(new Map());
  const [categories, setCategories] = useState<any[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE_COLUMNS));

  // Helper to get registration response value - MUST be defined before useMemo hooks that use it
  const getResponseValue = (regId: string, fieldName: string): string => {
    return registrationResponses.get(regId)?.get(fieldName) || "";
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedRegistrations.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedRegistrations.map(r => r.id)));
    }
  };

  const paginatedRegistrations = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filteredRegistrations.length);
    return filteredRegistrations.slice(startIdx, endIdx);
  }, [filteredRegistrations, currentPage, pageSize]);

  const isAllSelected = paginatedRegistrations.length > 0 && selectedRows.size === paginatedRegistrations.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < paginatedRegistrations.length;

  // Helper to get category short_name from race_category_id
  const getCategoryShortName = (reg: Registration): string => {
    if (reg.race_category_id) {
      const cat = categories.find(c => c.id === reg.race_category_id);
      if (cat) {
        return cat.short_name || cat.name || "";
      }
    }
    // No fallback to registration_responses - use only race_category_id
    return "";
  };

  // Helper to get gender code (M/F/X) from gender_id
  const getGenderDisplay = (reg: Registration): string => {
    const genderId = reg.gender_id || reg.profiles?.gender_id;
    if (genderId) {
      return getGenderCode(genderId);
    }
    // Fallback to text if no gender_id
    const genderText = reg.gender || reg.profiles?.gender;
    if (genderText) {
      const resolvedId = resolveGenderId(null, genderText);
      return resolvedId ? getGenderCode(resolvedId) : genderText;
    }
    return "";
  };

  // Unique values for column filters
  const uniqueGenders = useMemo(() => {
    const genders = new Set<string>();
    registrations.forEach(reg => {
      const gender = getGenderDisplay(reg);
      if (gender) genders.add(gender);
    });
    return Array.from(genders).sort();
  }, [registrations]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    registrations.forEach(reg => {
      const category = getCategoryShortName(reg);
      if (category) cats.add(category);
    });
    return Array.from(cats).sort();
  }, [registrations, registrationResponses, categories]);

  const uniqueClubs = useMemo(() => {
    const clubs = new Set<string>();
    registrations.forEach(reg => {
      const club = reg.club || reg.profiles?.club || "";
      if (club) clubs.add(club);
    });
    return Array.from(clubs).sort();
  }, [registrations]);

  const uniqueTeams = useMemo(() => {
    const teams = new Set<string>();
    registrations.forEach(reg => {
      const team = reg.team || reg.profiles?.team || "";
      if (team) teams.add(team);
    });
    return Array.from(teams).sort();
  }, [registrations]);

  // Bulk action handlers
  const handleBulkDelete = async () => {
    console.log("handleBulkDelete called with ids:", Array.from(selectedRows));
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const { error, count } = await supabase
        .from("registrations")
        .delete()
        .in("id", ids)
        .select();
      
      console.log("Bulk delete result:", { error, count });
      
      if (error) {
        console.error("Bulk delete error:", error);
        throw error;
      }
      
      toast({ title: `${ids.length} inscripciones eliminadas` });
      setSelectedRows(new Set());
      setBulkDeleteDialog(false);
      fetchData();
      triggerRefresh("registrations");
    } catch (error: any) {
      console.error("Bulk delete catch error:", error);
      toast({ 
        title: "Error al eliminar", 
        description: error.message || "No se pudieron eliminar las inscripciones", 
        variant: "destructive" 
      });
      setBulkDeleteDialog(false);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkStatus = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const { error } = await supabase
        .from("registrations")
        .update({ status: bulkStatus })
        .in("id", ids);
      if (error) throw error;
      toast({ title: `Estado actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkStatusDialog(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkPaymentStatus = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const { error } = await supabase
        .from("registrations")
        .update({ payment_status: bulkPaymentStatus })
        .in("id", ids);
      if (error) throw error;
      toast({ title: `Estado de pago actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkPaymentDialog(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDistance = async () => {
    if (!bulkDistanceId) {
      toast({ title: "Selecciona un recorrido", variant: "destructive" });
      return;
    }
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const { error } = await supabase
        .from("registrations")
        .update({ race_distance_id: bulkDistanceId })
        .in("id", ids);
      if (error) throw error;
      toast({ title: `Recorrido actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkDistanceDialog(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkAssignBibs = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      // Get the registrations to assign bibs, ordered by creation date
      const selectedRegs = filteredRegistrations
        .filter(r => ids.includes(r.id))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      // Group by distance to assign bibs correctly per distance range
      const byDistance = new Map<string, Registration[]>();
      selectedRegs.forEach(reg => {
        const list = byDistance.get(reg.race_distance_id) || [];
        list.push(reg);
        byDistance.set(reg.race_distance_id, list);
      });

      let totalAssigned = 0;
      for (const [distanceId, regs] of byDistance) {
        // Get distance info for bib range
        const { data: distanceData } = await supabase
          .from("race_distances")
          .select("bib_start, bib_end, next_bib")
          .eq("id", distanceId)
          .single();
        
        if (!distanceData?.bib_start) {
          toast({ 
            title: "Advertencia", 
            description: `Recorrido sin rango de dorsales configurado`,
            variant: "destructive"
          });
          continue;
        }

        let nextBib = distanceData.next_bib || distanceData.bib_start;
        const maxBib = distanceData.bib_end || 99999;

        for (const reg of regs) {
          if (reg.bib_number) continue; // Skip if already has bib
          if (nextBib > maxBib) {
            toast({ title: "Advertencia", description: "Se agotaron los dorsales disponibles" });
            break;
          }

          const { error } = await supabase
            .from("registrations")
            .update({ bib_number: nextBib })
            .eq("id", reg.id);
          
          if (!error) {
            nextBib++;
            totalAssigned++;
          }
        }

        // Update next_bib for the distance
        await supabase
          .from("race_distances")
          .update({ next_bib: nextBib })
          .eq("id", distanceId);
      }

      toast({ title: `${totalAssigned} dorsales asignados automáticamente` });
      setSelectedRows(new Set());
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkGender = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const raceId = selectedRaceId || selectedRace;
      
      // Get gender field for each registration's distance
      for (const regId of ids) {
        const reg = filteredRegistrations.find(r => r.id === regId);
        if (!reg) continue;
        
        // Find gender field for this distance
        const genderField = formFields.find(
          f => f.race_distance_id === reg.race_distance_id && (f.profile_field === 'gender' || f.field_name === 'gender')
        );
        
        if (genderField) {
          // Upsert registration response
          await supabase
            .from("registration_responses")
            .upsert({
              registration_id: regId,
              field_id: genderField.id,
              field_value: bulkGender === 'male' ? 'Masculino' : 'Femenino'
            }, { onConflict: 'registration_id,field_id' });
        }
      }
      
      toast({ title: `Género actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkGenderDialog(false);
      if (raceId) fetchFormFieldsAndResponses(raceId);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkCategory = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const raceId = selectedRaceId || selectedRace;
      
      for (const regId of ids) {
        const reg = filteredRegistrations.find(r => r.id === regId);
        if (!reg) continue;
        
        const categoryField = formFields.find(
          f => f.race_distance_id === reg.race_distance_id && (f.profile_field === 'category' || f.field_name === 'category')
        );
        
        if (categoryField) {
          await supabase
            .from("registration_responses")
            .upsert({
              registration_id: regId,
              field_id: categoryField.id,
              field_value: bulkCategory
            }, { onConflict: 'registration_id,field_id' });
        }
      }
      
      toast({ title: `Categoría actualizada en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkCategoryDialog(false);
      if (raceId) fetchFormFieldsAndResponses(raceId);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkClub = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const raceId = selectedRaceId || selectedRace;
      
      for (const regId of ids) {
        const reg = filteredRegistrations.find(r => r.id === regId);
        if (!reg) continue;
        
        const clubField = formFields.find(
          f => f.race_distance_id === reg.race_distance_id && (f.profile_field === 'club' || f.field_name === 'club')
        );
        
        if (clubField) {
          await supabase
            .from("registration_responses")
            .upsert({
              registration_id: regId,
              field_id: clubField.id,
              field_value: bulkClub
            }, { onConflict: 'registration_id,field_id' });
        }
      }
      
      toast({ title: `Club actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkClubDialog(false);
      if (raceId) fetchFormFieldsAndResponses(raceId);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkTeam = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const raceId = selectedRaceId || selectedRace;
      
      for (const regId of ids) {
        const reg = filteredRegistrations.find(r => r.id === regId);
        if (!reg) continue;
        
        const teamField = formFields.find(
          f => f.race_distance_id === reg.race_distance_id && (f.profile_field === 'team' || f.field_name === 'team')
        );
        
        if (teamField) {
          await supabase
            .from("registration_responses")
            .upsert({
              registration_id: regId,
              field_id: teamField.id,
              field_value: bulkTeam
            }, { onConflict: 'registration_id,field_id' });
        }
      }
      
      toast({ title: `Equipo actualizado en ${ids.length} inscripciones` });
      setSelectedRows(new Set());
      setBulkTeamDialog(false);
      if (raceId) fetchFormFieldsAndResponses(raceId);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Llama a reenviar-comprobantes en lotes y suma las respuestas. En el
  // ensayo un error corta (no hay nada que enseñar); en el envío real un lote
  // fallido se apunta como fallido y se sigue con el siguiente, para no
  // perder la cuenta de lo que ya salió.
  const llamarReenvio = async (
    ids: string[],
    dryRun: boolean,
    incluirExternas: boolean,
    alAvanzar?: (hechas: number) => void,
  ): Promise<ResumenReenvio> => {
    const suma: ResumenReenvio = { total: 0, enviados: 0, se_enviarian: 0, omitidos: 0, fallidos: 0, resultados: [] };
    const tamLote = dryRun ? REENVIO_LOTE_ENSAYO : REENVIO_LOTE_ENVIO;
    for (let i = 0; i < ids.length; i += tamLote) {
      const lote = ids.slice(i, i + tamLote);
      // Código HTTP de la respuesta, si la hubo: un 4xx sale antes de mandar
      // nada; sin respuesta o con un 5xx no se sabe qué salió
      let estadoHttp: number | undefined;
      try {
        const { data, error } = await supabase.functions.invoke("reenviar-comprobantes", {
          body: { registrationIds: lote, dryRun, incluirExternas },
        });
        if (error) {
          estadoHttp = (error as any).context?.status;
          // El error genérico de invoke esconde el motivo; el cuerpo lo trae
          let detalle = error.message;
          try {
            const cuerpo = await (error as any).context?.json();
            if (cuerpo?.error) detalle = cuerpo.error;
          } catch { /* sin cuerpo legible */ }
          throw new Error(detalle);
        }
        if (data?.error) throw new Error(data.error);
        const r = data as ResumenReenvio;
        suma.total += r.total;
        suma.enviados += r.enviados;
        suma.se_enviarian += r.se_enviarian;
        suma.omitidos += r.omitidos;
        suma.fallidos += r.fallidos;
        suma.resultados.push(...r.resultados);
      } catch (e: any) {
        if (dryRun) throw e;
        const quizaSalio = estadoHttp === undefined || estadoHttp >= 500;
        suma.total += lote.length;
        suma.fallidos += lote.length;
        suma.resultados.push(
          ...lote.map((registrationId) => ({
            registrationId,
            resultado: "fallido" as const,
            error: quizaSalio ? `${e.message} (puede que alguno de este lote sí saliera)` : e.message,
          })),
        );
      }
      alAvanzar?.(Math.min(i + tamLote, ids.length));
    }
    return suma;
  };

  const calcularReenvio = async (ids: string[], incluirExternas: boolean) => {
    // Si se cierra y se reabre (o se marca la casilla) con un ensayo aún en
    // marcha, solo cuenta la respuesta del último
    const peticion = ++reenvioPeticion.current;
    setReenvioFase("calculando");
    setReenvioEnsayo(null);
    try {
      const ensayo = await llamarReenvio(ids, true, incluirExternas);
      if (peticion !== reenvioPeticion.current) return;
      setReenvioEnsayo(ensayo);
      setReenvioFase("listo");
    } catch (error: any) {
      if (peticion !== reenvioPeticion.current) return;
      toast({ title: "No se pudo preparar el reenvío", description: error.message, variant: "destructive" });
      setReenvioDialog(false);
    }
  };

  const abrirReenvio = () => {
    const ids = Array.from(selectedRows);
    setReenvioIds(ids);
    setReenvioExternas(false);
    setReenvioFinal(null);
    setReenvioProgreso(0);
    setReenvioDialog(true);
    calcularReenvio(ids, false);
  };

  const enviarReenvio = async () => {
    if (!reenvioEnsayo) return;
    // Solo las que el ensayo dio por buenas; el servidor las vuelve a mirar
    const ids = reenvioEnsayo.resultados
      .filter((r) => r.resultado === "se_enviaria")
      .map((r) => r.registrationId);
    if (ids.length === 0) return;
    setReenvioFase("enviando");
    setReenvioProgreso(0);
    const final = await llamarReenvio(ids, false, reenvioExternas, setReenvioProgreso);
    setReenvioFinal(final);
    setReenvioFase("hecho");
    toast({
      title: `${final.enviados} ${final.enviados === 1 ? "comprobante enviado" : "comprobantes enviados"}`,
      description: final.fallidos > 0 ? `${final.fallidos} no se pudieron enviar: mira el detalle` : undefined,
      variant: final.fallidos > 0 ? "destructive" : undefined,
    });
    // Si algo falló, se quedan seleccionadas SOLO las fallidas: reintentar
    // con la selección entera volvería a escribir a quien ya lo recibió
    setSelectedRows(
      new Set(final.resultados.filter((r) => r.resultado === "fallido").map((r) => r.registrationId)),
    );
  };

  /** Nombre visible de una inscripción de la lista cargada, para los avisos */
  const nombreInscripcion = (id: string) => {
    const reg = registrations.find((r) => r.id === id);
    if (!reg) return "inscripción";
    const nombre =
      [reg.first_name, reg.last_name].filter(Boolean).join(" ") ||
      [reg.profiles?.first_name, reg.profiles?.last_name].filter(Boolean).join(" ");
    return [reg.bib_number != null ? `#${reg.bib_number}` : "", nombre || reg.email || "sin nombre"].filter(Boolean).join(" ");
  };

  const handleRecalculateCategories = async () => {
    const raceId = selectedRaceId || selectedRace;
    if (!raceId || raceId === "all") {
      toast({
        title: "Error",
        description: "Selecciona una carrera primero",
        variant: "destructive",
      });
      return;
    }

    if (!selectedDistance) {
      toast({
        title: "Error",
        description: "Selecciona un recorrido primero",
        variant: "destructive",
      });
      return;
    }

    // Get all age-dependent categories for this distance (categories are per event)
    const { data: raceCategories } = await supabase
      .from("race_categories")
      .select("*")
      .eq("race_distance_id", selectedDistance)
      .eq("age_dependent", true);

    if (!raceCategories || raceCategories.length === 0) {
      toast({
        title: "Sin categorías automáticas",
        description: "No hay categorías dependientes de edad definidas",
        variant: "destructive",
      });
      return;
    }

    // Get race date for age calculation
    const { data: raceData } = await supabase
      .from("races")
      .select("date")
      .eq("id", raceId)
      .single();

    const raceDate = raceData?.date || new Date().toISOString().split('T')[0];

    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      let updated = 0;
      let skipped = 0;

      for (const regId of ids) {
        const reg = filteredRegistrations.find(r => r.id === regId);
        if (!reg) continue;

        // Get categories for this distance
        const distanceCategories = raceCategories.filter(
          c => c.race_distance_id === reg.race_distance_id
        );
        if (distanceCategories.length === 0) {
          skipped++;
          continue;
        }

        // Get birth date from responses or profile
        let birthDate = getResponseValue(regId, 'birth_date') || 
                        reg.birth_date || 
                        reg.profiles?.birth_date || null;
        
        // Get gender from responses or profile
        let gender = getResponseValue(regId, 'gender') || 
                     reg.profiles?.gender || null;

        if (!birthDate) {
          skipped++;
          continue;
        }

        // Convert categories to RaceCategory format
        const raceCategoriesForCalc: RaceCategory[] = distanceCategories.map(c => ({
          id: c.id,
          name: c.name,
          short_name: c.short_name,
          min_age: c.min_age,
          max_age: c.max_age,
          age_dependent: c.age_dependent,
          age_calculation_date: c.age_calculation_date,
          display_order: c.display_order,
          race_distance_id: c.race_distance_id,
        }));

        const matchedCategory = calculateCategoryByAge(birthDate, raceCategoriesForCalc, raceDate);
        
        if (matchedCategory) {
          // Update race_category_id directly on registrations table
          await supabase
            .from("registrations")
            .update({ race_category_id: matchedCategory.id })
            .eq("id", regId);
          updated++;
        } else {
          skipped++;
        }
      }

      toast({
        title: "Categorías recalculadas",
        description: `${updated} actualizadas, ${skipped} sin datos o sin categoría`,
      });
      
      setSelectedRows(new Set());
      if (raceId) fetchFormFieldsAndResponses(raceId);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (selectedRaceId) {
      fetchFormFieldsAndResponses(selectedRaceId);
      fetchCategories(selectedRaceId);
    }
  }, [selectedRaceId]);

  const fetchFormFieldsAndResponses = async (raceId: string) => {
    try {
      // Fetch all distances for this race
      const { data: distancesData } = await supabase
        .from("race_distances")
        .select("id")
        .eq("race_id", raceId);
      
      const distanceIds = distancesData?.map(d => d.id) || [];
      
      if (distanceIds.length === 0) return;

      // Fetch form fields for all distances
      const { data: fieldsData } = await supabase
        .from("registration_form_fields")
        .select("id, field_name, field_label, profile_field, race_distance_id")
        .in("race_distance_id", distanceIds);
      
      setFormFields(fieldsData || []);

      // Fetch all registrations for this race
      const { data: regsData } = await supabase
        .from("registrations")
        .select("id")
        .eq("race_id", raceId);
      
      const regIds = regsData?.map(r => r.id) || [];
      
      if (regIds.length === 0) return;

      // Batch fetch registration responses
      const batchSize = 100;
      const batches = [];
      for (let i = 0; i < regIds.length; i += batchSize) {
        batches.push(regIds.slice(i, i + batchSize));
      }

      const allResponses: any[] = [];
      for (const batch of batches) {
        const { data: respData } = await supabase
          .from("registration_responses")
          .select("registration_id, field_id, field_value")
          .in("registration_id", batch);
        if (respData) allResponses.push(...respData);
      }

      // Build a map: registration_id -> { field_name -> field_value }
      const fieldIdToName = new Map<string, string>();
      fieldsData?.forEach(f => fieldIdToName.set(f.id, f.profile_field || f.field_name));

      const responsesMap = new Map<string, Map<string, string>>();
      allResponses.forEach(resp => {
        if (!responsesMap.has(resp.registration_id)) {
          responsesMap.set(resp.registration_id, new Map());
        }
        const fieldName = fieldIdToName.get(resp.field_id);
        if (fieldName) {
          responsesMap.get(resp.registration_id)!.set(fieldName, resp.field_value);
        }
      });

      setRegistrationResponses(responsesMap);
    } catch (error) {
      console.error("Error fetching form fields and responses:", error);
    }
  };

  const fetchCategories = async (distanceId: string) => {
    // Fetch categories by race_distance_id (categories are per event, not per race)
    const { data } = await supabase
      .from("race_categories")
      .select("*")
      .eq("race_distance_id", distanceId)
      .order("display_order");
    setCategories(data || []);
  };


  useEffect(() => {
    // If selectedRaceId prop changes, update the internal filter
    if (selectedRaceId) {
      setSelectedRace(selectedRaceId);
    } else {
      setSelectedRace("all");
    }
  }, [selectedRaceId]);

  useEffect(() => {
    applyFilters();
    setSelectedRows(new Set()); // Clear selection when filters change
  }, [registrations, selectedRace, selectedDistance, selectedStatus, searchTerm, filterGender, filterCategory, filterClub, filterTeam, filterPayment, registrationResponses]);

  useEffect(() => {
    if (selectedRace && selectedRace !== "all") {
      fetchDistancesForRace(selectedRace);
      fetchFormFieldsAndResponses(selectedRace);
    } else {
      setDistances([]);
      setSelectedDistance("");
      setCategories([]);
    }
  }, [selectedRace]);

  // Load categories when distance changes
  useEffect(() => {
    if (selectedDistance) {
      fetchCategories(selectedDistance);
    } else {
      setCategories([]);
    }
  }, [selectedDistance]);

  useEffect(() => {
    if (formData.race_id) {
      fetchFormDistances(formData.race_id);
    } else {
      setFormDistances([]);
    }
  }, [formData.race_id]);

  const carreraActualId = selectedRaceId || (selectedRace !== "all" ? selectedRace : "");

  useEffect(() => {
    if (!carreraActualId) {
      setEbConfigurado(false);
      return;
    }
    supabase
      .from("eventbooking_sync" as never)
      .select("race_id")
      .eq("race_id", carreraActualId)
      .maybeSingle()
      .then(({ data }) => setEbConfigurado(!!data));
  }, [carreraActualId]);

  const sincronizarEventbooking = async () => {
    setEbSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("eventbooking-sync", {
        body: { race_id: carreraActualId },
      });
      if (error) {
        // El error genérico de invoke ("non-2xx status code") esconde el
        // motivo; el cuerpo de la respuesta sí lo trae.
        let detalle = error.message;
        try {
          const cuerpo = await (error as any).context?.json();
          if (cuerpo?.error) detalle = cuerpo.error;
        } catch { /* sin cuerpo legible */ }
        throw new Error(detalle);
      }
      if (data?.error) throw new Error(data.error);
      const partes = [`${data.nuevos} nuevos`, `${data.actualizados} actualizados`, `${data.sin_cambios} sin cambios`];
      if (data.omitidos_sin_pagar) partes.push(`${data.omitidos_sin_pagar} sin pagar omitidos`);
      if (data.dorsales_asignados) partes.push(`${data.dorsales_asignados} dorsales asignados`);
      if (data.avisos?.length) partes.push(`ATENCIÓN: ${data.avisos.slice(0, 3).join("; ")}`);
      toast({
        title: "Sincronizado con EventBooking",
        description:
          partes.join(", ") +
          (data.errores?.length ? `. ${data.errores.length} con error: ${data.errores.slice(0, 3).join("; ")}` : ""),
        variant: data.errores?.length ? "destructive" : "default",
      });
      fetchData();
    } catch (e: any) {
      toast({ title: "Error al sincronizar", description: e.message, variant: "destructive" });
    } finally {
      setEbSincronizando(false);
    }
  };

  const fetchDistancesForRace = async (raceId: string) => {
    const { data } = await supabase
      .from("race_distances")
      .select("id, name, distance_km, race_id")
      .eq("race_id", raceId)
      .order("display_order");
    setDistances(data || []);
    // Auto-select first distance
    if (data && data.length > 0) {
      setSelectedDistance(data[0].id);
    }
  };

  const fetchFormDistances = async (raceId: string) => {
    const { data } = await supabase
      .from("race_distances")
      .select("id, name, distance_km, race_id")
      .eq("race_id", raceId)
      .order("distance_km");
    setFormDistances(data || []);
  };

  const fetchData = async () => {
    try {
      // Fetch races
      let racesQuery = supabase
        .from("races")
        .select("id, name, date, organizer_id")
        .order("date", { ascending: false });
      
      // If organizer mode, filter by current user's races
      if (isOrganizer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          racesQuery = racesQuery.eq("organizer_id", user.id);
        }
      }

      const { data: racesData, error: racesError } = await racesQuery;

      if (racesError) throw racesError;
      setRaces(racesData || []);

      // Fetch registrations with related data
      let registrationsQuery = supabase
        .from("registrations")
        .select(`
          id,
          status,
          payment_status,
          bib_number,
          created_at,
          user_id,
          email,
          first_name,
          last_name,
          phone,
          dni_passport,
          birth_date,
          gender,
          gender_id,
          race_category_id,
          club,
          team,
          country,
          address,
          city,
          province,
          autonomous_community,
          tshirt_size,
          race_id,
          race_distance_id,
          source,
          race:races!registrations_race_id_fkey (
            id,
            name,
            date,
            organizer_id
          ),
          race_distance:race_distances!registrations_race_distance_id_fkey (
            id,
            name,
            distance_km
          ),
          profiles!registrations_user_id_profiles_fkey (
            first_name,
            last_name,
            phone,
            dni_passport,
            gender,
            gender_id,
            birth_date,
            club,
            team,
            country
          )
        `)
        .order("created_at", { ascending: false });

      const { data: registrationsData, error: registrationsError } = await registrationsQuery;

      if (registrationsError) throw registrationsError;
      
      // Filter registrations for organizer mode
      let filteredRegistrations = registrationsData as any;
      if (isOrganizer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          filteredRegistrations = (registrationsData as any)?.filter(
            (reg: any) => reg.race.organizer_id === user.id
          );
        }
      }
      
      setRegistrations(filteredRegistrations);
    } catch (error: any) {
      toast({
        title: "Error al cargar datos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...registrations];

    if (selectedRace !== "all") {
      filtered = filtered.filter((reg) => reg.race.id === selectedRace);
    }

    if (selectedDistance) {
      filtered = filtered.filter((reg) => reg.race_distance.id === selectedDistance);
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((reg) => reg.status === selectedStatus);
    }

    // Column filters
    if (filterGender !== "all") {
      filtered = filtered.filter((reg) => {
        const gender = getGenderDisplay(reg);
        return gender === filterGender;
      });
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter((reg) => {
        const category = getCategoryShortName(reg);
        return category === filterCategory;
      });
    }

    if (filterClub !== "all") {
      filtered = filtered.filter((reg) => {
        const club = reg.club || reg.profiles?.club || "";
        return club === filterClub;
      });
    }

    if (filterTeam !== "all") {
      filtered = filtered.filter((reg) => {
        const team = reg.team || reg.profiles?.team || "";
        return team === filterTeam;
      });
    }

    if (filterPayment !== "all") {
      filtered = filtered.filter((reg) => reg.payment_status === filterPayment);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (reg) => {
          const firstName = reg.profiles?.first_name || reg.first_name || "";
          const lastName = reg.profiles?.last_name || reg.last_name || "";
          const dniPassport = reg.profiles?.dni_passport || reg.dni_passport || "";
          const email = reg.email || "";
          return (
            firstName.toLowerCase().includes(term) ||
            lastName.toLowerCase().includes(term) ||
            dniPassport.toLowerCase().includes(term) ||
            email.toLowerCase().includes(term) ||
            reg.bib_number?.toString().includes(term)
          );
        }
      );
    }

    // Sort by bib_number (nulls last)
    filtered.sort((a, b) => {
      if (a.bib_number === null && b.bib_number === null) return 0;
      if (a.bib_number === null) return 1;
      if (b.bib_number === null) return -1;
      return a.bib_number - b.bib_number;
    });

    setFilteredRegistrations(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Pagination calculations
  const totalRecords = filteredRegistrations.length;
  const totalPages = Math.ceil(totalRecords / pageSize);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const toggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(column)) {
        newSet.delete(column);
      } else {
        newSet.add(column);
      }
      return newSet;
    });
  };

  const handleCreate = async () => {
    if (!formData.race_id || !formData.race_distance_id) {
      toast({ title: "Error", description: "Selecciona carrera y recorrido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const insertData: any = {
        race_id: formData.race_id,
        race_distance_id: formData.race_distance_id,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        dni_passport: formData.dni_passport || null,
        status: formData.status,
        payment_status: formData.payment_status,
        bib_number: formData.bib_number ? parseInt(formData.bib_number) : null,
        // Alta desde el panel: no pasa por la pasarela, no factura comisión
        source: "manual",
        // Lo cobrado a mano. NO suma a la recaudación de pasarela: se muestra
        // en su propia cifra, para que el organizador sepa lo que lleva
        // cobrado sin mezclarlo con lo que Camberas puede verificar.
        importe_manual: formData.importe_manual ? Number(formData.importe_manual) : null,
      };

      const { error } = await supabase.from("registrations").insert(insertData);
      if (error) throw error;

      toast({ title: "Inscripción creada" });
      setIsCreateOpen(false);
      setFormData(emptyFormData);
      fetchData();
      triggerRefresh("registrations");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingRegistration) return;
    setSaving(true);
    try {
      // Build update data for registrations table from editFormData
      const updateData: any = {
        first_name: editFormData.first_name || null,
        last_name: editFormData.last_name || null,
        email: editFormData.email || null,
        phone: editFormData.phone || null,
        dni_passport: editFormData.dni_passport || null,
        birth_date: editFormData.birth_date || null,
        gender: editFormData.gender || null,
        gender_id: editFormData.gender_id || null,
        address: editFormData.address || null,
        city: editFormData.city || null,
        province: editFormData.province || null,
        country: editFormData.country || null,
        club: editFormData.club || null,
        team: editFormData.team || null,
        tshirt_size: editFormData.tshirt_size || null,
        race_category_id: editFormData.race_category_id || null,
        autonomous_community: editFormData.autonomous_community || null,
        status: editFormData.status,
        payment_status: editFormData.payment_status,
        bib_number: editFormData.bib_number ? parseInt(editFormData.bib_number) : null,
        race_distance_id: editFormData.race_distance_id,
      };

      const { error } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", editingRegistration.id);
      if (error) throw error;

      // Now update registration_responses for custom fields
      // Fetch fields for this distance to know which fields go to responses
      const { data: fieldsData } = await supabase
        .from("registration_form_fields")
        .select("id, field_name, field_type, profile_field, race_distance_id, depends_on_field_id, depends_on_value")
        .or(`race_distance_id.eq.${editFormData.race_distance_id},race_distance_id.is.null`)
        .eq("is_visible", true);

      // Campos condicionales: los que han quedado ocultos no se guardan, y si
      // el controlador está aquí (se ha cambiado su respuesta, p. ej. militar
      // Sí → No) se borra la respuesta vieja para que no salga en listados
      const camposCargados = fieldsData || [];
      const valoresPorNombre: Record<string, unknown> = {};
      for (const f of camposCargados) {
        valoresPorNombre[f.field_name] = editFormData[f.profile_field || f.field_name] ?? editFormData[f.field_name];
      }
      const idsVisibles = new Set(camposVisibles(camposCargados, valoresPorNombre).map((f) => f.id));
      const idsCargados = new Set(camposCargados.map((f) => f.id));

      const denormalizedFields = [
        'first_name', 'last_name', 'email', 'phone', 'dni_passport', 
        'birth_date', 'gender', 'gender_id', 'address', 'city', 
        'province', 'country', 'club', 'team', 'autonomous_community',
        'tshirt_size', 'race_category_id'
      ];

      // Upsert responses for fields that are not denormalized
      for (const field of camposCargados) {
        if (!idsVisibles.has(field.id)) {
          if (field.depends_on_field_id && idsCargados.has(field.depends_on_field_id)) {
            await supabase
              .from("registration_responses")
              .delete()
              .eq("registration_id", editingRegistration.id)
              .eq("field_id", field.id);
          }
          continue;
        }
        const fieldKey = field.profile_field || field.field_name;
        // Skip denormalized fields and system fields
        if (denormalizedFields.includes(fieldKey) || 
            fieldKey === 'bib_number' || 
            fieldKey === 'status' || 
            fieldKey === 'payment_status' ||
            fieldKey === 'race_distance_id') {
          continue;
        }
        
        const value = editFormData[fieldKey] || editFormData[field.field_name];
        if (value !== undefined && value !== null && value !== '') {
          await supabase
            .from("registration_responses")
            .upsert({
              registration_id: editingRegistration.id,
              field_id: field.id,
              field_value: String(value)
            }, { onConflict: 'registration_id,field_id' });
        }
      }

      toast({ title: "Inscripción actualizada" });
      setIsEditOpen(false);
      setEditingRegistration(null);
      setEditFormData({});
      fetchData();
      triggerRefresh("registrations");
      // Refresh responses
      const raceId = selectedRaceId || selectedRace;
      if (raceId && raceId !== 'all') {
        fetchFormFieldsAndResponses(raceId);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    console.log("handleDelete called with id:", id);
    try {
      const { error, count } = await supabase
        .from("registrations")
        .delete()
        .eq("id", id)
        .select();
      
      console.log("Delete result:", { error, count });
      
      if (error) {
        console.error("Delete error:", error);
        throw error;
      }
      
      toast({ title: "Inscripción eliminada" });
      setDeleteDialogId(null);
      fetchData();
      triggerRefresh("registrations");
    } catch (error: any) {
      console.error("Delete catch error:", error);
      toast({ 
        title: "Error al eliminar", 
        description: error.message || "No se pudo eliminar la inscripción", 
        variant: "destructive" 
      });
      setDeleteDialogId(null);
    }
  };

  const openEditDialog = (reg: Registration) => {
    setEditingRegistration(reg);
    setEditFormData({}); // Will be populated by DynamicEditRegistrationForm
    setIsEditOpen(true);
  };

  const openCreateDialog = () => {
    setFormData({
      ...emptyFormData,
      race_id: selectedRaceId || (selectedRace !== "all" ? selectedRace : ""),
    });
    setIsCreateOpen(true);
  };

  const handleAssignBib = async (registrationId: string) => {
    try {
      const bibNum = parseInt(bibNumber);
      if (isNaN(bibNum) || bibNum <= 0) {
        toast({
          title: "Número inválido",
          description: "Ingresa un número de dorsal válido",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("registrations")
        .update({ bib_number: bibNum })
        .eq("id", registrationId);

      if (error) throw error;

      toast({
        title: "Dorsal asignado",
        description: `Se ha asignado el dorsal #${bibNum}`,
      });

      setAssigningBib(null);
      setBibNumber("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error al asignar dorsal",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // La exportación (CSV y Excel) es un espejo de la tabla: salen LAS
  // COLUMNAS MARCADAS en "Columnas", en su mismo orden y con los mismos
  // valores que se ven en pantalla. "Participante" se desdobla en Nombre y
  // Apellidos, que para eso es un fichero de datos. La carrera va siempre
  // delante: en la vista de todas las carreras es lo único que distingue
  // las filas.
  const datosParaExportar = () => {
    const ESTADO_CSV: Record<string, string> = {
      pending: "Pendiente",
      confirmed: "Confirmada",
      cancelled: "Cancelada",
    };
    const PAGO_CSV: Record<string, string> = {
      paid: "Pagado",
      refunded: "Reembolsado",
      not_required: "Gratis",
      pending: "Pendiente",
    };

    const valorDe = (reg: Registration, col: ColumnKey): string => {
      switch (col) {
        case "bib_number": return reg.bib_number?.toString() ?? "";
        case "email": return reg.email || "";
        case "dni": return reg.profiles?.dni_passport || reg.dni_passport || "";
        case "phone": return reg.profiles?.phone || reg.phone || "";
        case "gender": return getGenderDisplay(reg);
        case "birth_date": {
          const b = reg.birth_date || reg.profiles?.birth_date || "";
          return b ? new Date(b).toLocaleDateString("es-ES") : "";
        }
        case "category": return getCategoryShortName(reg);
        case "club": return reg.club || reg.profiles?.club || "";
        case "team": return reg.team || reg.profiles?.team || "";
        case "country": return reg.country || reg.profiles?.country || "";
        case "created_at":
          return reg.created_at
            ? new Date(reg.created_at).toLocaleString("es-ES", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })
            : "";
        case "type": return reg.user_id ? "Registrado" : "Invitado";
        case "origen": return ORIGEN_LABELS[reg.source ?? ""]?.label ?? "";
        case "distance": return `${reg.race_distance.name} (${reg.race_distance.distance_km}km)`;
        case "status": return ESTADO_CSV[reg.status] ?? reg.status;
        case "payment": return PAGO_CSV[reg.payment_status] ?? reg.payment_status;
        default: return "";
      }
    };

    const columnas = ALL_COLUMNS.filter(
      (c) => c.key !== "actions" && visibleColumns.has(c.key),
    );
    const headers = [
      "Carrera",
      ...columnas.flatMap((c) => (c.key === "participant" ? ["Nombre", "Apellidos"] : [c.label])),
    ];
    const rows = filteredRegistrations.map((reg) => [
      reg.race.name,
      ...columnas.flatMap((c) =>
        c.key === "participant"
          ? [
              reg.profiles?.first_name || reg.first_name || "",
              reg.profiles?.last_name || reg.last_name || "",
            ]
          : [valorDe(reg, c.key)],
      ),
    ]);

    return { headers, rows };
  };

  const exportToCSV = () => {
    const { headers, rows } = datosParaExportar();

    const csvContent = [
      headers.join(","),
      // Comillas interiores dobladas, que un club con comillas no rompa la fila
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    // El BOM es para Excel: sin él, las tildes y las eñes llegan rotas
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inscripciones_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportación exitosa",
      description: `Se han exportado ${filteredRegistrations.length} inscripciones`,
    });
  };

  const exportToExcel = () => {
    const { headers, rows } = datosParaExportar();

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Ancho de columna a la medida del contenido, con tope para los textos largos
    ws["!cols"] = headers.map((h, i) => ({
      wch: Math.min(
        40,
        Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
      ),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inscripciones");
    XLSX.writeFile(wb, `inscripciones_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "Exportación exitosa",
      description: `Se han exportado ${filteredRegistrations.length} inscripciones`,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive", label: string }> = {
      pending: { variant: "secondary", label: "Pendiente" },
      confirmed: { variant: "default", label: "Confirmada" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando inscripciones...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Inscripciones</h2>
          <p className="text-muted-foreground">
            {filteredRegistrations.length} inscripciones{" "}
            {filteredRegistrations.length !== registrations.length && `de ${registrations.length} totales`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Inscripción
          </Button>
          <Button 
            onClick={() => setIsImportOpen(true)} 
            variant="outline" 
            className="gap-2"
            disabled={!selectedRaceId && selectedRace === "all"}
          >
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          {ebConfigurado && (
            <Button
              onClick={sincronizarEventbooking}
              variant="outline"
              className="gap-2"
              disabled={ebSincronizando}
            >
              <RefreshCw className={`h-4 w-4 ${ebSincronizando ? "animate-spin" : ""}`} />
              {ebSincronizando ? "Sincronizando..." : "Sincronizar EventBooking"}
            </Button>
          )}
          <Button onClick={exportToCSV} variant="outline" className="gap-2" disabled={filteredRegistrations.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="gap-2" disabled={filteredRegistrations.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Import Dialog */}
      <RegistrationImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        raceId={selectedRaceId || (selectedRace !== "all" ? selectedRace : "")}
        distanceId={selectedDistance || undefined}
        onImportComplete={fetchData}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Recorrido</Label>
              <Select value={selectedDistance} onValueChange={setSelectedDistance} disabled={!selectedRace || selectedRace === "all"}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un recorrido" />
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

            {/* El mismo filtro que el caret de la columna Categoría (mismo
                estado): aquí porque es donde el organizador lo busca */}
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {uniqueCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Buscar</Label>
              <Input
                placeholder="Nombre, DNI, dorsal..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection indicator and bulk actions */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">
            {selectedRows.size} inscripción{selectedRows.size !== 1 ? "es" : ""} seleccionada{selectedRows.size !== 1 ? "s" : ""}
          </span>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" className="gap-2" disabled={bulkActionLoading}>
                {bulkActionLoading ? "Procesando..." : "Acciones masivas"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-popover">
              <DropdownMenuItem onClick={() => setBulkStatusDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Cambiar estado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkPaymentDialog(true)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Cambiar estado de pago
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkDistanceDialog(true)}>
                <Route className="h-4 w-4 mr-2" />
                Cambiar recorrido
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBulkAssignBibs}>
                <Hash className="h-4 w-4 mr-2" />
                Asignar dorsales automáticamente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={abrirReenvio}>
                <Mail className="h-4 w-4 mr-2" />
                Reenviar comprobante por email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Datos de inscripción</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setBulkGenderDialog(true)}>
                <Users className="h-4 w-4 mr-2" />
                Cambiar género
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkCategoryDialog(true)}>
                <Tag className="h-4 w-4 mr-2" />
                Cambiar categoría
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkClubDialog(true)}>
                <Users className="h-4 w-4 mr-2" />
                Cambiar club
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkTeamDialog(true)}>
                <Users className="h-4 w-4 mr-2" />
                Cambiar equipo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRecalculateCategories}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recalcular categorías por edad
              </DropdownMenuItem>
              {/* Borrado solo para admin: el organizador cambia estados, no elimina */}
              {!isOrganizer && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBulkDeleteDialog(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar seleccionadas
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>
            Deseleccionar
          </Button>
        </div>
      )}

      {/* Registrations Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Mostrando {totalRecords > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}-{Math.min(currentPage * pageSize, totalRecords)} de {totalRecords}
              </span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Columns3 className="h-4 w-4" />
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_COLUMNS.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={visibleColumns.has(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleAllRows}
                      aria-label="Seleccionar todas"
                      className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                    />
                  </TableHead>
                  {visibleColumns.has("bib_number") && <TableHead className="w-[80px]">Dorsal</TableHead>}
                  {visibleColumns.has("participant") && <TableHead>Participante</TableHead>}
                  {visibleColumns.has("email") && <TableHead>Email</TableHead>}
                  {visibleColumns.has("dni") && <TableHead>DNI/Pasaporte</TableHead>}
                  {visibleColumns.has("phone") && <TableHead>Teléfono</TableHead>}
                  {visibleColumns.has("gender") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Género
                            {filterGender !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">{filterGender}</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => setFilterGender("all")}>
                            Todos
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {uniqueGenders.map(g => (
                            <DropdownMenuItem key={g} onClick={() => setFilterGender(g)}>
                              {g}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("birth_date") && <TableHead>F. Nacimiento</TableHead>}
                  {visibleColumns.has("category") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Categoría
                            {filterCategory !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">{filterCategory}</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 overflow-auto">
                          <DropdownMenuItem onClick={() => setFilterCategory("all")}>
                            Todas
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {uniqueCategories.map(c => (
                            <DropdownMenuItem key={c} onClick={() => setFilterCategory(c)}>
                              {c}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("club") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Club
                            {filterClub !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">1</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 overflow-auto">
                          <DropdownMenuItem onClick={() => setFilterClub("all")}>
                            Todos
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {uniqueClubs.map(c => (
                            <DropdownMenuItem key={c} onClick={() => setFilterClub(c)}>
                              {c}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("team") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Equipo
                            {filterTeam !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">1</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 overflow-auto">
                          <DropdownMenuItem onClick={() => setFilterTeam("all")}>
                            Todos
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {uniqueTeams.map(t => (
                            <DropdownMenuItem key={t} onClick={() => setFilterTeam(t)}>
                              {t}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("country") && <TableHead>País</TableHead>}
                  {visibleColumns.has("created_at") && <TableHead>Fecha y hora</TableHead>}
                  {visibleColumns.has("type") && <TableHead>Tipo</TableHead>}
                  {visibleColumns.has("origen") && <TableHead>Origen</TableHead>}
                  {visibleColumns.has("distance") && <TableHead>Distancia</TableHead>}
                  {visibleColumns.has("status") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Estado
                            {selectedStatus !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">1</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => setSelectedStatus("all")}>
                            Todos
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSelectedStatus("pending")}>Pendiente</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSelectedStatus("confirmed")}>Confirmado</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSelectedStatus("cancelled")}>Cancelado</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("payment") && (
                    <TableHead>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 -ml-2">
                            Pago
                            {filterPayment !== "all" && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">1</Badge>}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => setFilterPayment("all")}>
                            Todos
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setFilterPayment("pending")}>Pendiente</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setFilterPayment("paid")}>Pagado</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setFilterPayment("refunded")}>Reembolsado</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  )}
                  {visibleColumns.has("actions") && <TableHead>Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRegistrations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.size + 1} className="text-center text-muted-foreground py-8">
                      No se encontraron inscripciones
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRegistrations.map((reg) => {
                    const isGuest = !reg.user_id;
                    const firstName = reg.profiles?.first_name || reg.first_name || "";
                    const lastName = reg.profiles?.last_name || reg.last_name || "";
                    const dniPassport = reg.profiles?.dni_passport || reg.dni_passport || "";
                    const email = reg.email || "";
                    const phone = reg.profiles?.phone || reg.phone || "";
                    
                    // Get display values
                    const gender = getGenderDisplay(reg);
                    const category = getCategoryShortName(reg);
                    const club = reg.club || reg.profiles?.club || "";
                    const team = reg.team || reg.profiles?.team || "";
                    const country = reg.country || reg.profiles?.country || "";
                    const birthDate = reg.birth_date || reg.profiles?.birth_date || "";
                    
                    return (
                      <TableRow key={reg.id} data-state={selectedRows.has(reg.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(reg.id)}
                            onCheckedChange={() => toggleRowSelection(reg.id)}
                            aria-label={`Seleccionar ${firstName} ${lastName}`}
                          />
                        </TableCell>
                        {visibleColumns.has("bib_number") && (
                          <TableCell className="font-mono font-bold">
                            {reg.bib_number ? (
                              <Badge variant="outline">#{reg.bib_number}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.has("participant") && (
                          <TableCell className="font-medium">
                            {firstName} {lastName}
                          </TableCell>
                        )}
                        {visibleColumns.has("email") && (
                          <TableCell className="text-sm text-muted-foreground">
                            {email || "-"}
                          </TableCell>
                        )}
                        {visibleColumns.has("dni") && (
                          <TableCell>{dniPassport || "-"}</TableCell>
                        )}
                        {visibleColumns.has("phone") && (
                          <TableCell>{phone || "-"}</TableCell>
                        )}
                        {visibleColumns.has("gender") && (
                          <TableCell>{gender || "-"}</TableCell>
                        )}
                        {visibleColumns.has("birth_date") && (
                          <TableCell>
                            {birthDate ? new Date(birthDate).toLocaleDateString("es-ES") : "-"}
                          </TableCell>
                        )}
                        {visibleColumns.has("category") && (
                          <TableCell>{category || "-"}</TableCell>
                        )}
                        {visibleColumns.has("club") && (
                          <TableCell>{club || "-"}</TableCell>
                        )}
                        {visibleColumns.has("team") && (
                          <TableCell>{team || "-"}</TableCell>
                        )}
                        {visibleColumns.has("country") && (
                          <TableCell>{country || "-"}</TableCell>
                        )}
                        {visibleColumns.has("created_at") && (
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {reg.created_at
                              ? new Date(reg.created_at).toLocaleString("es-ES", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </TableCell>
                        )}
                        {visibleColumns.has("type") && (
                          <TableCell>
                            <Badge variant={isGuest ? "outline" : "secondary"}>
                              {isGuest ? "Invitado" : "Registrado"}
                            </Badge>
                          </TableCell>
                        )}
                        {visibleColumns.has("origen") && (
                          <TableCell>
                            {(() => {
                              const o = ORIGEN_LABELS[reg.source ?? ""] ?? { label: "—", variant: "outline" as const };
                              return <Badge variant={o.variant}>{o.label}</Badge>;
                            })()}
                          </TableCell>
                        )}
                        {visibleColumns.has("distance") && (
                          <TableCell>
                            {reg.race_distance.name} ({reg.race_distance.distance_km}km)
                          </TableCell>
                        )}
                        {visibleColumns.has("status") && (
                          <TableCell>{getStatusBadge(reg.status)}</TableCell>
                        )}
                        {visibleColumns.has("payment") && (
                          <TableCell>
                            <Badge variant={reg.payment_status === "paid" ? "default" : reg.payment_status === "refunded" ? "outline" : "secondary"}>
                              {reg.payment_status === "paid" ? "Pagado" : reg.payment_status === "refunded" ? "Reembolsado" : "Pendiente"}
                            </Badge>
                          </TableCell>
                        )}
                        {visibleColumns.has("actions") && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Dialog
                                open={assigningBib === reg.id}
                                onOpenChange={(open) => {
                                  if (!open) {
                                    setAssigningBib(null);
                                    setBibNumber("");
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setAssigningBib(reg.id);
                                      setBibNumber(reg.bib_number?.toString() || "");
                                    }}
                                  >
                                    <Hash className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Asignar Dorsal</DialogTitle>
                                    <DialogDescription>
                                      Asignar número de dorsal a {firstName} {lastName}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 mt-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="bib">Número de Dorsal</Label>
                                      <Input
                                        id="bib"
                                        type="number"
                                        min="1"
                                        value={bibNumber}
                                        onChange={(e) => setBibNumber(e.target.value)}
                                        placeholder="Ej: 123"
                                      />
                                    </div>
                                    <Button onClick={() => handleAssignBib(reg.id)} className="w-full">
                                      Asignar
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>

                              <Button variant="outline" size="sm" onClick={() => abrirQrDorsal(reg)} title="QR del dorsal GPS">
                                <QrCode className="h-4 w-4" />
                              </Button>

                              <Button variant="outline" size="sm" onClick={() => openEditDialog(reg)}>
                                <Pencil className="h-4 w-4" />
                              </Button>

                              {/* Borrado solo para admin: el organizador cambia estados, no elimina */}
                              {!isOrganizer && (
                              <AlertDialog open={deleteDialogId === reg.id} onOpenChange={(open) => !open && setDeleteDialogId(null)}>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => setDeleteDialogId(reg.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar inscripción?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción eliminará la inscripción de {firstName} {lastName} y no se puede deshacer.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleDelete(reg.id);
                                      }}
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              )}

                              <RegistrationResponsesView registrationId={reg.id} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        className="w-8"
                        onClick={() => goToPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Inscripción</DialogTitle>
            <DialogDescription>Crear inscripción manualmente (invitado)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Apellidos *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>DNI/Pasaporte</Label>
                <Input
                  value={formData.dni_passport}
                  onChange={(e) => setFormData({ ...formData, dni_passport: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Carrera *</Label>
              <Select value={formData.race_id} onValueChange={(v) => setFormData({ ...formData, race_id: v, race_distance_id: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar carrera" />
                </SelectTrigger>
                <SelectContent>
                  {races.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recorrido *</Label>
              <Select value={formData.race_distance_id} onValueChange={(v) => setFormData({ ...formData, race_distance_id: v })} disabled={!formData.race_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar recorrido" />
                </SelectTrigger>
                <SelectContent>
                  {formDistances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.distance_km}km)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
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
              <div className="space-y-2">
                <Label>Pago</Label>
                <Select value={formData.payment_status} onValueChange={(v) => setFormData({ ...formData, payment_status: v })}>
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
              <div className="space-y-2">
                <Label>Dorsal</Label>
                <Input
                  type="number"
                  value={formData.bib_number}
                  onChange={(e) => setFormData({ ...formData, bib_number: e.target.value })}
                />
              </div>
            </div>

            {/* Sin esto, cobrar 30 € en la carpa y marcar "Pagado" dejaba la
                recaudación a cero: no había ningún sitio donde anotarlo. */}
            {formData.payment_status === "paid" && (
              <div className="space-y-2">
                <Label>Importe cobrado (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="lo que te ha pagado en mano"
                  value={formData.importe_manual}
                  onChange={(e) => setFormData({ ...formData, importe_manual: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  No entra en la recaudación de la pasarela: se muestra aparte, como cobrado a mano.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Guardando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Inscripción</DialogTitle>
            <DialogDescription>
              {editingRegistration && (
                <>
                  {editingRegistration.first_name} {editingRegistration.last_name} - {editingRegistration.race_distance?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-2">
            {editingRegistration && (
              <DynamicEditRegistrationForm
                registration={editingRegistration}
                distances={formDistances}
                categories={categories}
                formData={editFormData}
                onFormDataChange={setEditFormData}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <Dialog open={bulkStatusDialog} onOpenChange={setBulkStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado masivo</DialogTitle>
            <DialogDescription>
              Cambiar el estado de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo estado</Label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkStatus} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Payment Status Dialog */}
      <Dialog open={bulkPaymentDialog} onOpenChange={setBulkPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado de pago masivo</DialogTitle>
            <DialogDescription>
              Cambiar el estado de pago de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo estado de pago</Label>
              <Select value={bulkPaymentStatus} onValueChange={setBulkPaymentStatus}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkPaymentStatus} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Distance Dialog */}
      <Dialog open={bulkDistanceDialog} onOpenChange={setBulkDistanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar recorrido masivo</DialogTitle>
            <DialogDescription>
              Cambiar el recorrido de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo recorrido</Label>
              <Select value={bulkDistanceId} onValueChange={setBulkDistanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar recorrido" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDistanceDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkDistance} disabled={bulkActionLoading || !bulkDistanceId}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteDialog} onOpenChange={setBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedRows.size} inscripciones?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente las inscripciones seleccionadas y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionLoading}>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive"
              onClick={handleBulkDelete} 
              disabled={bulkActionLoading}
            >
              {bulkActionLoading ? "Eliminando..." : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reenviar comprobante por email */}
      <Dialog
        open={reenvioDialog}
        onOpenChange={(open) => {
          // Mientras se envía no se cierra: se perdería el resumen
          if (!open && reenvioFase === "enviando") return;
          setReenvioDialog(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reenviar comprobante por email</DialogTitle>
            <DialogDescription>
              {reenvioIds.length} {reenvioIds.length === 1 ? "inscripción seleccionada" : "inscripciones seleccionadas"}
            </DialogDescription>
          </DialogHeader>

          {reenvioFase === "calculando" && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Comprobando a quién se le puede enviar…
            </div>
          )}

          {reenvioFase === "listo" && reenvioEnsayo && (() => {
            const aEnviar = reenvioEnsayo.resultados.filter((r) => r.resultado === "se_enviaria");
            const pagadas = aEnviar.filter((r) => r.plantilla === "pagada").length;
            const gratuitas = aEnviar.length - pagadas;
            const omitidas = reenvioEnsayo.resultados.filter((r) => r.resultado === "omitido");
            const porMotivo = new Map<string, string[]>();
            for (const o of omitidas) {
              const lista = porMotivo.get(o.motivo ?? "estado_desconocido") ?? [];
              lista.push(o.registrationId);
              porMotivo.set(o.motivo ?? "estado_desconocido", lista);
            }
            const hayExternas = porMotivo.has("importada_de_uno_es") || reenvioExternas;
            return (
              <div className="space-y-4 text-sm">
                <div className="rounded-md border p-3 bg-muted/20">
                  <p className="font-medium">
                    {aEnviar.length === 0
                      ? "No hay a quién enviárselo"
                      : `Se enviará a ${aEnviar.length} ${aEnviar.length === 1 ? "persona" : "personas"}`}
                  </p>
                  {aEnviar.length > 0 && (
                    <p className="text-muted-foreground">
                      {[pagadas ? `${pagadas} pagadas` : "", gratuitas ? `${gratuitas} gratuitas` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>

                {omitidas.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">No se enviará a {omitidas.length}:</p>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                      {[...porMotivo.entries()].map(([motivo, ids]) => (
                        <li key={motivo}>
                          {ids.length} {MOTIVOS_OMISION[motivo] ?? motivo}
                          {motivo === "sin_email" && (
                            <span className="block text-xs">
                              {ids.slice(0, 5).map(nombreInscripcion).join(", ")}
                              {ids.length > 5 ? ` y ${ids.length - 5} más` : ""}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {hayExternas && (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="reenvio-externas"
                      checked={reenvioExternas}
                      onCheckedChange={(v) => {
                        const incluir = v === true;
                        setReenvioExternas(incluir);
                        calcularReenvio(reenvioIds, incluir);
                      }}
                    />
                    <Label htmlFor="reenvio-externas" className="font-normal leading-snug">
                      Incluir también las importadas de uno.es
                    </Label>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Cada persona recibe sus datos, su dorsal y el enlace «Ver mi dorsal». No se manda copia al organizador.
                  {aEnviar.length >= 10 &&
                    (aEnviar.length * 0.7 < 60
                      ? ` Tardará menos de un minuto.`
                      : ` Tardará unos ${Math.ceil((aEnviar.length * 0.7) / 60)} minutos.`)}
                </p>
              </div>
            );
          })()}

          {reenvioFase === "enviando" && reenvioEnsayo && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando… {reenvioProgreso} de {reenvioEnsayo.se_enviarian}. No cierres esta ventana.
            </div>
          )}

          {reenvioFase === "hecho" && reenvioFinal && (
            <div className="space-y-3 text-sm">
              <p className="font-medium">
                {reenvioFinal.enviados} {reenvioFinal.enviados === 1 ? "comprobante enviado" : "comprobantes enviados"}
                {reenvioFinal.omitidos > 0 && ` · ${reenvioFinal.omitidos} omitidos al enviar (cambiaron desde la comprobación)`}
              </p>
              {reenvioFinal.fallidos > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">{reenvioFinal.fallidos} no se pudieron enviar:</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1 max-h-48 overflow-y-auto">
                    {reenvioFinal.resultados
                      .filter((r) => r.resultado === "fallido")
                      .map((r) => (
                        <li key={r.registrationId}>
                          {nombreInscripcion(r.registrationId)}
                          {r.email ? ` (${r.email})` : ""}: {r.error}
                        </li>
                      ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Se han quedado seleccionadas solo estas, por si quieres reintentarlo.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {reenvioFase === "hecho" ? (
              <Button onClick={() => setReenvioDialog(false)}>Cerrar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setReenvioDialog(false)} disabled={reenvioFase === "enviando"}>
                  Cancelar
                </Button>
                <Button
                  onClick={enviarReenvio}
                  disabled={reenvioFase !== "listo" || !reenvioEnsayo || reenvioEnsayo.se_enviarian === 0}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {reenvioEnsayo && reenvioEnsayo.se_enviarian > 0
                    ? `Enviar ${reenvioEnsayo.se_enviarian} ${reenvioEnsayo.se_enviarian === 1 ? "email" : "emails"}`
                    : "Enviar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Gender Dialog */}
      <Dialog open={bulkGenderDialog} onOpenChange={setBulkGenderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar género masivo</DialogTitle>
            <DialogDescription>
              Cambiar el género de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={bulkGender} onValueChange={setBulkGender}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male">Masculino</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female">Femenino</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkGenderDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkGender} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Category Dialog */}
      <Dialog open={bulkCategoryDialog} onOpenChange={setBulkCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar categoría masivo</DialogTitle>
            <DialogDescription>
              Cambiar la categoría de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva categoría</Label>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCategoryDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkCategory} disabled={bulkActionLoading || !bulkCategory}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Club Dialog */}
      <Dialog open={bulkClubDialog} onOpenChange={setBulkClubDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar club masivo</DialogTitle>
            <DialogDescription>
              Cambiar el club de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo club</Label>
              <Input value={bulkClub} onChange={(e) => setBulkClub(e.target.value)} placeholder="Nombre del club" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkClubDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkClub} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Team Dialog */}
      <Dialog open={bulkTeamDialog} onOpenChange={setBulkTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar equipo masivo</DialogTitle>
            <DialogDescription>
              Cambiar el equipo de {selectedRows.size} inscripciones seleccionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo equipo</Label>
              <Input value={bulkTeam} onChange={(e) => setBulkTeam(e.target.value)} placeholder="Nombre del equipo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTeamDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkTeam} disabled={bulkActionLoading}>
              {bulkActionLoading ? "Procesando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
