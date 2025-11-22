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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Filter, Hash } from "lucide-react";
import { RegistrationResponsesView } from "./RegistrationResponsesView";

interface Registration {
  id: string;
  status: string;
  payment_status: string;
  bib_number: number | null;
  created_at: string;
  user_id: string;
  race: {
    id: string;
    name: string;
    date: string;
    organizer_id?: string | null;
  };
  race_distance: {
    name: string;
    distance_km: number;
  };
  profile: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    dni_passport: string | null;
  };
}

interface RegistrationManagementProps {
  isOrganizer?: boolean;
}

export function RegistrationManagement({ isOrganizer = false }: RegistrationManagementProps) {
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedRace, setSelectedRace] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Bib assignment
  const [assigningBib, setAssigningBib] = useState<string | null>(null);
  const [bibNumber, setBibNumber] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [registrations, selectedRace, selectedStatus, searchTerm]);

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
          race:races (
            id,
            name,
            date,
            organizer_id
          ),
          race_distance:race_distances (
            name,
            distance_km
          ),
          profile:profiles (
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

    if (selectedStatus !== "all") {
      filtered = filtered.filter((reg) => reg.status === selectedStatus);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (reg) =>
          reg.profile.first_name?.toLowerCase().includes(term) ||
          reg.profile.last_name?.toLowerCase().includes(term) ||
          reg.profile.dni_passport?.toLowerCase().includes(term) ||
          reg.bib_number?.toString().includes(term)
      );
    }

    setFilteredRegistrations(filtered);
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
      "Carrera",
      "Distancia",
      "Dorsal",
      "Estado",
      "Estado de Pago",
      "Fecha de Inscripción",
    ];

    const rows = filteredRegistrations.map((reg) => [
      reg.profile.first_name || "",
      reg.profile.last_name || "",
      reg.profile.dni_passport || "",
      reg.profile.phone || "",
      reg.race.name,
      `${reg.race_distance.name} (${reg.race_distance.distance_km}km)`,
      reg.bib_number || "",
      reg.status,
      reg.payment_status,
      new Date(reg.created_at).toLocaleDateString("es-ES"),
    ]);

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
        <Button onClick={exportToCSV} className="gap-2" disabled={filteredRegistrations.length === 0}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

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
              <Label>Carrera</Label>
              <Select value={selectedRace} onValueChange={setSelectedRace}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las carreras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las carreras</SelectItem>
                  {races.map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
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

      {/* Registrations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participante</TableHead>
                  <TableHead>DNI</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No se encontraron inscripciones
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRegistrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">
                        {reg.profile.first_name} {reg.profile.last_name}
                      </TableCell>
                      <TableCell>{reg.profile.dni_passport || "N/A"}</TableCell>
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
                        <Badge variant={reg.payment_status === "completed" ? "default" : "secondary"}>
                          {reg.payment_status === "completed" ? "Pagado" : "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
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
                                <Hash className="h-4 w-4 mr-1" />
                                Dorsal
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Asignar Dorsal</DialogTitle>
                                <DialogDescription>
                                  Asignar número de dorsal a {reg.profile.first_name} {reg.profile.last_name}
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
                          
                          <RegistrationResponsesView registrationId={reg.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
