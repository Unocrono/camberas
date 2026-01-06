import { useEffect, useState, useMemo } from "react";
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
import { Download, Filter, Hash, Plus, Pencil, Trash2, Upload, ChevronDown, CheckCircle, CreditCard, Route, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Users, Tag } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RegistrationResponsesView } from "./RegistrationResponsesView";
import { RegistrationImportDialog } from "./RegistrationImportDialog";

interface Registration {
  id: string;
  status: string;
  payment_status: string;
  bib_number: number | null;
  created_at: string;
  user_id: string | null;
  guest_email: string | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_phone: string | null;
  guest_dni_passport: string | null;
  guest_birth_date: string | null;
  race_id: string;
  race_distance_id: string;
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
  guest_first_name: string;
  guest_last_name: string;
  guest_email: string;
  guest_phone: string;
  guest_dni_passport: string;
  race_id: string;
  race_distance_id: string;
  status: string;
  payment_status: string;
  bib_number: string;
}

const emptyFormData: RegistrationFormData = {
  guest_first_name: "",
  guest_last_name: "",
  guest_email: "",
  guest_phone: "",
  guest_dni_passport: "",
  race_id: "",
  race_distance_id: "",
  status: "pending",
  payment_status: "pending",
  bib_number: "",
};

type ColumnKey = "bib_number" | "participant" | "email" | "dni" | "phone" | "type" | "distance" | "status" | "payment" | "gender" | "category" | "club" | "team" | "country" | "birth_date" | "actions";

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
  { key: "type", label: "Tipo" },
  { key: "distance", label: "Distancia" },
  { key: "status", label: "Estado" },
  { key: "payment", label: "Pago" },
  { key: "actions", label: "Acciones" },
];

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ["bib_number", "participant", "gender", "category", "club", "team", "distance", "status", "payment", "actions"];

export function RegistrationManagement({ isOrganizer = false, selectedRaceId }: RegistrationManagementProps) {
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedRace, setSelectedRace] = useState<string>("all");
  const [selectedDistance, setSelectedDistance] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // CRUD
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null);
  const [formData, setFormData] = useState<RegistrationFormData>(emptyFormData);
  const [formDistances, setFormDistances] = useState<RaceDistance[]>([]);
  const [saving, setSaving] = useState(false);

  // Bib assignment
  const [assigningBib, setAssigningBib] = useState<string | null>(null);
  const [bibNumber, setBibNumber] = useState("");
  
  // Import dialog
  const [isImportOpen, setIsImportOpen] = useState(false);
  
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
  
  // Form fields and responses
  const [formFields, setFormFields] = useState<any[]>([]);
  const [registrationResponses, setRegistrationResponses] = useState<Map<string, Map<string, string>>>(new Map());
  const [categories, setCategories] = useState<any[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE_COLUMNS));

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

  const fetchCategories = async (raceId: string) => {
    const { data } = await supabase
      .from("race_categories")
      .select("*")
      .eq("race_id", raceId)
      .order("display_order");
    setCategories(data || []);
  };

  // Helper to get registration response value
  const getResponseValue = (regId: string, fieldName: string): string => {
    return registrationResponses.get(regId)?.get(fieldName) || "";
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
  }, [registrations, selectedRace, selectedDistance, selectedStatus, searchTerm]);

  useEffect(() => {
    if (selectedRace && selectedRace !== "all") {
      fetchDistancesForRace(selectedRace);
    } else {
      setDistances([]);
      setSelectedDistance("all");
    }
  }, [selectedRace]);

  useEffect(() => {
    if (formData.race_id) {
      fetchFormDistances(formData.race_id);
    } else {
      setFormDistances([]);
    }
  }, [formData.race_id]);

  const fetchDistancesForRace = async (raceId: string) => {
    const { data } = await supabase
      .from("race_distances")
      .select("id, name, distance_km, race_id")
      .eq("race_id", raceId)
      .order("distance_km");
    setDistances(data || []);
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
          guest_email,
          guest_first_name,
          guest_last_name,
          guest_phone,
          guest_dni_passport,
          guest_birth_date,
          race_id,
          race_distance_id,
          race_distance_id,
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

    if (selectedDistance !== "all") {
      filtered = filtered.filter((reg) => reg.race_distance.id === selectedDistance);
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((reg) => reg.status === selectedStatus);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (reg) => {
          const firstName = reg.profiles?.first_name || reg.guest_first_name || "";
          const lastName = reg.profiles?.last_name || reg.guest_last_name || "";
          const dniPassport = reg.profiles?.dni_passport || reg.guest_dni_passport || "";
          const email = reg.guest_email || "";
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
        guest_first_name: formData.guest_first_name || null,
        guest_last_name: formData.guest_last_name || null,
        guest_email: formData.guest_email || null,
        guest_phone: formData.guest_phone || null,
        guest_dni_passport: formData.guest_dni_passport || null,
        status: formData.status,
        payment_status: formData.payment_status,
        bib_number: formData.bib_number ? parseInt(formData.bib_number) : null,
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
      const updateData: any = {
        guest_first_name: formData.guest_first_name || null,
        guest_last_name: formData.guest_last_name || null,
        guest_email: formData.guest_email || null,
        guest_phone: formData.guest_phone || null,
        guest_dni_passport: formData.guest_dni_passport || null,
        status: formData.status,
        payment_status: formData.payment_status,
        bib_number: formData.bib_number ? parseInt(formData.bib_number) : null,
        race_distance_id: formData.race_distance_id,
      };

      const { error } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", editingRegistration.id);
      if (error) throw error;

      toast({ title: "Inscripción actualizada" });
      setIsEditOpen(false);
      setEditingRegistration(null);
      setFormData(emptyFormData);
      fetchData();
      triggerRefresh("registrations");
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
    setFormData({
      guest_first_name: reg.guest_first_name || reg.profiles?.first_name || "",
      guest_last_name: reg.guest_last_name || reg.profiles?.last_name || "",
      guest_email: reg.guest_email || "",
      guest_phone: reg.guest_phone || reg.profiles?.phone || "",
      guest_dni_passport: reg.guest_dni_passport || reg.profiles?.dni_passport || "",
      race_id: reg.race_id,
      race_distance_id: reg.race_distance_id,
      status: reg.status,
      payment_status: reg.payment_status,
      bib_number: reg.bib_number?.toString() || "",
    });
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

  const exportToCSV = () => {
    const headers = [
      "Nombre",
      "Apellidos",
      "DNI/Pasaporte",
      "Teléfono",
      "Email",
      "Tipo",
      "Carrera",
      "Distancia",
      "Dorsal",
      "Estado",
      "Estado de Pago",
      "Fecha de Inscripción",
    ];

    const rows = filteredRegistrations.map((reg) => {
      const isGuest = !reg.user_id;
      return [
        reg.profiles?.first_name || reg.guest_first_name || "",
        reg.profiles?.last_name || reg.guest_last_name || "",
        reg.profiles?.dni_passport || reg.guest_dni_passport || "",
        reg.profiles?.phone || reg.guest_phone || "",
        reg.guest_email || "",
        isGuest ? "Invitado" : "Registrado",
        reg.race.name,
        `${reg.race_distance.name} (${reg.race_distance.distance_km}km)`,
        reg.bib_number || "",
        reg.status,
        reg.payment_status,
        new Date(reg.created_at).toLocaleDateString("es-ES"),
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
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
          <Button onClick={exportToCSV} variant="outline" className="gap-2" disabled={filteredRegistrations.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Import Dialog */}
      <RegistrationImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        raceId={selectedRaceId || (selectedRace !== "all" ? selectedRace : "")}
        distanceId={selectedDistance !== "all" ? selectedDistance : undefined}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Recorrido</Label>
              <Select value={selectedDistance} onValueChange={setSelectedDistance} disabled={!selectedRace || selectedRace === "all"}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los recorridos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los recorridos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.distance_km}km)
                    </SelectItem>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setBulkDeleteDialog(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar seleccionadas
              </DropdownMenuItem>
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
                  {visibleColumns.has("gender") && <TableHead>Género</TableHead>}
                  {visibleColumns.has("birth_date") && <TableHead>F. Nacimiento</TableHead>}
                  {visibleColumns.has("category") && <TableHead>Categoría</TableHead>}
                  {visibleColumns.has("club") && <TableHead>Club</TableHead>}
                  {visibleColumns.has("team") && <TableHead>Equipo</TableHead>}
                  {visibleColumns.has("country") && <TableHead>País</TableHead>}
                  {visibleColumns.has("type") && <TableHead>Tipo</TableHead>}
                  {visibleColumns.has("distance") && <TableHead>Distancia</TableHead>}
                  {visibleColumns.has("status") && <TableHead>Estado</TableHead>}
                  {visibleColumns.has("payment") && <TableHead>Pago</TableHead>}
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
                    const firstName = reg.profiles?.first_name || reg.guest_first_name || "";
                    const lastName = reg.profiles?.last_name || reg.guest_last_name || "";
                    const dniPassport = reg.profiles?.dni_passport || reg.guest_dni_passport || "";
                    const email = reg.guest_email || "";
                    const phone = reg.profiles?.phone || reg.guest_phone || "";
                    
                    // Get values from registration_responses
                    const gender = getResponseValue(reg.id, 'gender') || reg.profiles?.gender || "";
                    const category = getResponseValue(reg.id, 'category') || "";
                    const club = getResponseValue(reg.id, 'club') || reg.profiles?.club || "";
                    const team = getResponseValue(reg.id, 'team') || reg.profiles?.team || "";
                    const country = getResponseValue(reg.id, 'country') || reg.profiles?.country || "";
                    const birthDate = getResponseValue(reg.id, 'birth_date') || reg.profiles?.birth_date || reg.guest_birth_date || "";
                    
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
                        {visibleColumns.has("type") && (
                          <TableCell>
                            <Badge variant={isGuest ? "outline" : "secondary"}>
                              {isGuest ? "Invitado" : "Registrado"}
                            </Badge>
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

                              <Button variant="outline" size="sm" onClick={() => openEditDialog(reg)}>
                                <Pencil className="h-4 w-4" />
                              </Button>

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
                  value={formData.guest_first_name}
                  onChange={(e) => setFormData({ ...formData, guest_first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Apellidos *</Label>
                <Input
                  value={formData.guest_last_name}
                  onChange={(e) => setFormData({ ...formData, guest_last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.guest_email}
                onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.guest_phone}
                  onChange={(e) => setFormData({ ...formData, guest_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>DNI/Pasaporte</Label>
                <Input
                  value={formData.guest_dni_passport}
                  onChange={(e) => setFormData({ ...formData, guest_dni_passport: e.target.value })}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Guardando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Inscripción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={formData.guest_first_name}
                  onChange={(e) => setFormData({ ...formData, guest_first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Apellidos</Label>
                <Input
                  value={formData.guest_last_name}
                  onChange={(e) => setFormData({ ...formData, guest_last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.guest_email}
                onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.guest_phone}
                  onChange={(e) => setFormData({ ...formData, guest_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>DNI/Pasaporte</Label>
                <Input
                  value={formData.guest_dni_passport}
                  onChange={(e) => setFormData({ ...formData, guest_dni_passport: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recorrido</Label>
              <Select value={formData.race_distance_id} onValueChange={(v) => setFormData({ ...formData, race_distance_id: v })}>
                <SelectTrigger>
                  <SelectValue />
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
