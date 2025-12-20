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
import { Plus, Trash2, Bike, User, Loader2, Pencil } from "lucide-react";

interface MotoAssignment {
  id: string;
  user_id: string;
  race_id: string;
  moto_id: string | null;
  notes: string | null;
  assigned_at: string;
  user_name?: string;
  moto_name?: string;
}

interface Moto {
  id: string;
  name: string;
  color: string;
}

interface MotoUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface MotoAssignmentsManagementProps {
  selectedRaceId: string;
}

export function MotoAssignmentsManagement({ selectedRaceId }: MotoAssignmentsManagementProps) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<MotoAssignment[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  const [motoUsers, setMotoUsers] = useState<MotoUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<MotoAssignment | null>(null);
  
  // Form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMotoId, setSelectedMotoId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [newMotoEmail, setNewMotoEmail] = useState("");
  const [addingMoto, setAddingMoto] = useState(false);

  useEffect(() => {
    if (selectedRaceId) {
      fetchAssignments();
      fetchMotos();
      fetchMotoUsers();
    }
  }, [selectedRaceId]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("moto_assignments")
        .select(`
          id,
          user_id,
          race_id,
          moto_id,
          notes,
          assigned_at
        `)
        .eq("race_id", selectedRaceId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      // Fetch user profiles and moto names
      const enrichedData = await Promise.all(
        (data || []).map(async (assignment) => {
          // Get user profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", assignment.user_id)
            .single();

          // Get moto name if assigned
          let motoName = null;
          if (assignment.moto_id) {
            const { data: moto } = await supabase
              .from("race_motos")
              .select("name")
              .eq("id", assignment.moto_id)
              .single();
            motoName = moto?.name;
          }

          return {
            ...assignment,
            user_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "Sin nombre",
            moto_name: motoName || "Todas las motos",
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

  const fetchMotos = async () => {
    try {
      const { data, error } = await supabase
        .from("race_motos")
        .select("id, name, color")
        .eq("race_id", selectedRaceId)
        .order("moto_order", { ascending: true });

      if (error) throw error;
      setMotos(data || []);
    } catch (error: any) {
      console.error("Error fetching motos:", error);
    }
  };

  const fetchMotoUsers = async () => {
    try {
      // Get users with moto role
      const { data: motoRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "moto");

      if (rolesError) throw rolesError;

      if (!motoRoles || motoRoles.length === 0) {
        setMotoUsers([]);
        return;
      }

      const userIds = motoRoles.map((r) => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      setMotoUsers(
        (profiles || []).map((p) => ({
          id: p.id,
          email: "",
          first_name: p.first_name,
          last_name: p.last_name,
        }))
      );
    } catch (error: any) {
      console.error("Error fetching moto users:", error);
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Selecciona un motero",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("moto_assignments").insert({
        user_id: selectedUserId,
        race_id: selectedRaceId,
        moto_id: selectedMotoId ?? null,
        notes: notes || null,
        assigned_by: userData.user?.id,
      });

      if (error) throw error;

      toast({
        title: "Asignación creada",
        description: "El motero ha sido asignado correctamente",
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

  const handleUpdateAssignment = async () => {
    if (!editingAssignment) return;

    try {
      const { error } = await supabase
        .from("moto_assignments")
        .update({
          user_id: selectedUserId,
          moto_id: selectedMotoId ?? null,
          notes: notes || null,
        })
        .eq("id", editingAssignment.id);

      if (error) throw error;

      toast({
        title: "Asignación actualizada",
        description: "La asignación ha sido modificada correctamente",
      });

      setDialogOpen(false);
      resetForm();
      fetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error al actualizar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditAssignment = (assignment: MotoAssignment) => {
    setEditingAssignment(assignment);
    setSelectedUserId(assignment.user_id);
    setSelectedMotoId(assignment.moto_id ?? undefined);
    setNotes(assignment.notes || "");
    setDialogOpen(true);
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta asignación?")) return;

    try {
      const { error } = await supabase
        .from("moto_assignments")
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

  const handleAddMotoRole = async () => {
    if (!newMotoEmail) {
      toast({
        title: "Error",
        description: "Introduce el email del usuario",
        variant: "destructive",
      });
      return;
    }

    setAddingMoto(true);
    try {
      // Get users with emails using the function (if admin)
      const { data: usersData, error: usersError } = await supabase.rpc("get_users_with_emails");
      
      if (usersError) {
        toast({
          title: "Error",
          description: "No tienes permisos para buscar usuarios por email. Contacta con el administrador.",
          variant: "destructive",
        });
        return;
      }

      const foundUser = usersData?.find((u: any) => u.email.toLowerCase() === newMotoEmail.toLowerCase());
      
      if (!foundUser) {
        toast({
          title: "Usuario no encontrado",
          description: "No existe ningún usuario con ese email",
          variant: "destructive",
        });
        return;
      }

      // Check if already has moto role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", foundUser.user_id)
        .eq("role", "moto")
        .single();

      if (existingRole) {
        toast({
          title: "Ya es motero",
          description: "Este usuario ya tiene el rol de motero",
        });
        setNewMotoEmail("");
        fetchMotoUsers();
        return;
      }

      // Add moto role
      const { error: insertError } = await supabase.from("user_roles").insert({
        user_id: foundUser.user_id,
        role: "moto",
        status: "approved",
      });

      if (insertError) throw insertError;

      toast({
        title: "Rol asignado",
        description: `Se ha asignado el rol de motero a ${newMotoEmail}`,
      });

      setNewMotoEmail("");
      fetchMotoUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingMoto(false);
    }
  };

  const resetForm = () => {
    setSelectedUserId("");
    setSelectedMotoId(undefined);
    setNotes("");
    setEditingAssignment(null);
  };

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar sus moteros</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bike className="h-5 w-5" />
            Gestión de Moteros
          </CardTitle>
          <CardDescription>
            Asigna usuarios con rol "moto" a esta carrera y sus motos GPS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add moto role section */}
          <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="moto-email" className="text-sm font-medium mb-1 block">
                Añadir nuevo Motero (por email)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="moto-email"
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newMotoEmail}
                  onChange={(e) => setNewMotoEmail(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddMotoRole} disabled={addingMoto}>
                  {addingMoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-2">Añadir rol Moto</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                El usuario debe existir en el sistema. Se le asignará el rol de motero.
              </p>
            </div>
          </div>

          {/* Create/Edit assignment dialog */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Asignaciones a esta carrera</h3>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => resetForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Asignación
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingAssignment ? "Modificar Asignación" : "Asignar Motero"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Motero *</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un motero" />
                      </SelectTrigger>
                      <SelectContent>
                        {motoUsers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No hay moteros disponibles
                          </SelectItem>
                        ) : (
                          motoUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.first_name} {user.last_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Moto (opcional)</Label>
                    <Select value={selectedMotoId ?? "all"} onValueChange={(val) => setSelectedMotoId(val === "all" ? undefined : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas las motos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las motos</SelectItem>
                        {motos.map((moto) => (
                          <SelectItem key={moto.id} value={moto.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: moto.color }}
                              />
                              {moto.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas (opcional)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones sobre esta asignación..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={editingAssignment ? handleUpdateAssignment : handleCreateAssignment}>
                      {editingAssignment ? "Guardar cambios" : "Crear asignación"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Assignments table */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bike className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay operadores asignados a esta carrera</p>
              <p className="text-sm">Añade el rol de moto a un usuario y asígnalo a esta carrera</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Moto</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Asignado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {assignment.user_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={assignment.moto_id ? "default" : "secondary"}>
                        {assignment.moto_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {assignment.notes || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(assignment.assigned_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditAssignment(assignment)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAssignment(assignment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
