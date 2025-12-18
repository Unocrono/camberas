import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, Filter, Hash, Plus, Pencil, Trash2, Upload, ChevronDown, CheckCircle, CreditCard, Route } from "lucide-react";
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
  const [bulkStatus, setBulkStatus] = useState("confirmed");
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("paid");
  const [bulkDistanceId, setBulkDistanceId] = useState("");

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
    if (selectedRows.size === filteredRegistrations.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRegistrations.map(r => r.id)));
    }
  };

  const isAllSelected = filteredRegistrations.length > 0 && selectedRows.size === filteredRegistrations.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < filteredRegistrations.length;

  // Bulk action handlers
  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedRows);
      const { error } = await supabase
        .from("registrations")
        .delete()
        .in("id", ids);
      if (error) throw error;
      toast({ title: `${ids.length} inscripciones eliminadas` });
      setSelectedRows(new Set());
      setBulkDeleteDialog(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  useEffect(() => {
    fetchData();
  }, [selectedRaceId]);

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
          race_id,
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
            dni_passport
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

    setFilteredRegistrations(filtered);
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
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("registrations").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Inscripción eliminada" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
                  <TableHead>Participante</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Carrera</TableHead>
                  <TableHead>Distancia</TableHead>
                  <TableHead>Dorsal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRegistrations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No se encontraron inscripciones
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRegistrations.map((reg) => {
                    const isGuest = !reg.user_id;
                    const firstName = reg.profiles?.first_name || reg.guest_first_name || "";
                    const lastName = reg.profiles?.last_name || reg.guest_last_name || "";
                    const dniPassport = reg.profiles?.dni_passport || reg.guest_dni_passport || "";
                    
                    return (
                      <TableRow key={reg.id} data-state={selectedRows.has(reg.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(reg.id)}
                            onCheckedChange={() => toggleRowSelection(reg.id)}
                            aria-label={`Seleccionar ${firstName} ${lastName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            {firstName} {lastName}
                            {isGuest && reg.guest_email && (
                              <div className="text-xs text-muted-foreground">{reg.guest_email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{dniPassport || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={isGuest ? "outline" : "secondary"}>
                            {isGuest ? "Invitado" : "Registrado"}
                          </Badge>
                        </TableCell>
                        <TableCell>{reg.race.name}</TableCell>
                        <TableCell>
                          {reg.race_distance.name} ({reg.race_distance.distance_km}km)
                        </TableCell>
                        <TableCell>
                          {reg.bib_number ? (
                            <Badge variant="outline">#{reg.bib_number}</Badge>
                          ) : (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(reg.status)}</TableCell>
                        <TableCell>
                          <Badge variant={reg.payment_status === "paid" ? "default" : reg.payment_status === "refunded" ? "outline" : "secondary"}>
                            {reg.payment_status === "paid" ? "Pagado" : reg.payment_status === "refunded" ? "Reembolsado" : "Pendiente"}
                          </Badge>
                        </TableCell>
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

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
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
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
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
    </div>
  );
}
