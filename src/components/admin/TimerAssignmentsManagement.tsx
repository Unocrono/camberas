import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Timer, MapPin, User, Loader2 } from "lucide-react";

interface TimerAssignment {
  id: string;
  user_id: string;
  race_id: string;
  checkpoint_id: string | null;
  notes: string | null;
  assigned_at: string;
  user_email?: string;
  user_name?: string;
  timing_point_name?: string;
}

interface TimingPoint {
  id: string;
  name: string;
  point_order: number | null;
  notes: string | null;
}

interface TimerUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface TimerAssignmentsManagementProps {
  selectedRaceId: string;
}

export function TimerAssignmentsManagement({ selectedRaceId }: TimerAssignmentsManagementProps) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<TimerAssignment[]>([]);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [timerUsers, setTimerUsers] = useState<TimerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [newTimerEmail, setNewTimerEmail] = useState("");
  const [addingTimer, setAddingTimer] = useState(false);

  useEffect(() => {
    if (selectedRaceId) {
      fetchAssignments();
      fetchTimingPoints();
      fetchTimerUsers();
    }
  }, [selectedRaceId]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("timer_assignments")
        .select(`
          id,
          user_id,
          race_id,
          checkpoint_id,
          notes,
          assigned_at
        `)
        .eq("race_id", selectedRaceId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      // Fetch user profiles and checkpoint names
      const enrichedData = await Promise.all(
        (data || []).map(async (assignment) => {
          // Get user profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", assignment.user_id)
            .single();

          // Get timing point name if assigned
          let timingPointName = null;
          if (assignment.checkpoint_id) {
            const { data: timingPoint } = await supabase
              .from("timing_points")
              .select("name")
              .eq("id", assignment.checkpoint_id)
              .single();
            timingPointName = timingPoint?.name;
          }

          return {
            ...assignment,
            user_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "Sin nombre",
            timing_point_name: timingPointName || "Todos los puntos",
          };
        })
      );

      setAssignments(enrichedData);
    } catch (error: any) {
      toast({
        title: "Error al cargar asignaciones",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTimingPoints = async () => {
    try {
      const { data, error } = await supabase
        .from("timing_points")
        .select("id, name, point_order, notes")
        .eq("race_id", selectedRaceId)
        .order("point_order", { ascending: true });

      if (error) throw error;
      setTimingPoints(data || []);
    } catch (error: any) {
      console.error("Error fetching timing points:", error);
    }
  };

  const fetchTimerUsers = async () => {
    try {
      // Get users with timer role
      const { data: timerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "timer");

      if (rolesError) throw rolesError;

      if (!timerRoles || timerRoles.length === 0) {
        setTimerUsers([]);
        return;
      }

      const userIds = timerRoles.map((r) => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      setTimerUsers(
        (profiles || []).map((p) => ({
          id: p.id,
          email: "",
          first_name: p.first_name,
          last_name: p.last_name,
        }))
      );
    } catch (error: any) {
      console.error("Error fetching timer users:", error);
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Selecciona un cronometrador",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("timer_assignments").insert({
        user_id: selectedUserId,
        race_id: selectedRaceId,
        checkpoint_id: selectedCheckpointId ?? null,
        notes: notes || null,
        assigned_by: userData.user?.id,
      });

      if (error) throw error;

      toast({
        title: "Asignación creada",
        description: "El cronometrador ha sido asignado correctamente",
      });

      setDialogOpen(false);
      resetForm();
      fetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error al crear asignación",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta asignación?")) return;

    try {
      const { error } = await supabase
        .from("timer_assignments")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Asignación eliminada",
        description: "La asignación ha sido eliminada correctamente",
      });

      fetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAddTimerRole = async () => {
    if (!newTimerEmail) {
      toast({
        title: "Error",
        description: "Introduce el email del usuario",
        variant: "destructive",
      });
      return;
    }

    setAddingTimer(true);
    try {
      // Find user by email using the profiles table and auth
      // Since we can't query auth.users directly, we need a different approach
      // We'll use a workaround: check if a profile exists and add the role
      
      // First, get users with emails using the function (if admin)
      const { data: usersData, error: usersError } = await supabase.rpc("get_users_with_emails");
      
      if (usersError) {
        // If not admin, show error
        toast({
          title: "Error",
          description: "No tienes permisos para buscar usuarios por email. Contacta con el administrador.",
          variant: "destructive",
        });
        return;
      }

      const foundUser = usersData?.find((u: any) => u.email.toLowerCase() === newTimerEmail.toLowerCase());
      
      if (!foundUser) {
        toast({
          title: "Usuario no encontrado",
          description: "No existe ningún usuario con ese email",
          variant: "destructive",
        });
        return;
      }

      // Check if already has timer role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", foundUser.user_id)
        .eq("role", "timer")
        .single();

      if (existingRole) {
        toast({
          title: "Ya es cronometrador",
          description: "Este usuario ya tiene el rol de cronometrador",
        });
        setNewTimerEmail("");
        fetchTimerUsers();
        return;
      }

      // Add timer role
      const { error: insertError } = await supabase.from("user_roles").insert({
        user_id: foundUser.user_id,
        role: "timer",
        status: "approved",
      });

      if (insertError) throw insertError;

      toast({
        title: "Rol asignado",
        description: `Se ha asignado el rol de cronometrador a ${newTimerEmail}`,
      });

      setNewTimerEmail("");
      fetchTimerUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingTimer(false);
    }
  };

  const resetForm = () => {
    setSelectedUserId("");
    setSelectedCheckpointId(undefined);
    setNotes("");
  };

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar sus cronometradores</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Gestión de Cronometradores
          </CardTitle>
          <CardDescription>
            Asigna usuarios con rol "timer" a esta carrera y sus puntos de control
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add timer role section */}
          <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="timer-email" className="text-sm font-medium mb-1 block">
                Añadir nuevo cronometrador (por email)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="timer-email"
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newTimerEmail}
                  onChange={(e) => setNewTimerEmail(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddTimerRole} disabled={addingTimer}>
                  {addingTimer ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-2">Añadir rol Timer</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                El usuario debe existir en el sistema. Se le asignará el rol de cronometrador.
              </p>
            </div>
          </div>

          {/* Create assignment dialog */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Asignaciones a esta carrera</h3>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Asignación
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignar Cronometrador</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Cronometrador *</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un cronometrador" />
                      </SelectTrigger>
                      <SelectContent>
                        {timerUsers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No hay cronometradores disponibles
                          </SelectItem>
                        ) : (
                          timerUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.first_name} {user.last_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Punto de Cronometraje (opcional)</Label>
                    <Select value={selectedCheckpointId ?? "all"} onValueChange={(val) => setSelectedCheckpointId(val === "all" ? undefined : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos los puntos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los puntos</SelectItem>
                        {timingPoints.map((tp) => (
                          <SelectItem key={tp.id} value={tp.id}>
                            {tp.point_order !== null ? `${tp.point_order}. ` : ""}{tp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Si no seleccionas un punto, podrá cronometrar en todos
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas</Label>
                    <Textarea
                      placeholder="Observaciones sobre la asignación..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <Button onClick={handleCreateAssignment} className="w-full">
                    Crear Asignación
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Assignments table */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Timer className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No hay cronometradores asignados a esta carrera</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cronometrador</TableHead>
                  <TableHead>Punto</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Asignado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{assignment.user_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={assignment.checkpoint_id ? "default" : "secondary"}>
                        <MapPin className="h-3 w-3 mr-1" />
                        {assignment.timing_point_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {assignment.notes || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(assignment.assigned_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAssignment(assignment.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
