import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Trash2, RefreshCw, Plus, Pencil, History } from "lucide-react";
import {
  type AccesoUsuario,
  type UltimoAcceso,
  DIAS_SESION_EN_USO,
  describirDispositivo,
  fechaHoraMadrid,
  haceCuanto,
  sesionEnUso,
  textoIp,
} from "@/lib/accesos";

// Las funciones del registro de accesos aún no están en los tipos generados
type RpcSinTipos = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpcAccesos = supabase.rpc.bind(supabase) as unknown as RpcSinTipos;

interface UserWithProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  roles: string[];
  // Registro de accesos (null si no ha entrado nunca o no se pudo consultar)
  ultimo_acceso: string | null;
  accesos: number;
}

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  roles: string[];
}

const initialFormData: UserFormData = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  phone: "",
  roles: ["user"],
};

// FunctionsHttpError oculta el cuerpo de la respuesta ("non-2xx status code"):
// extraer el mensaje real que devuelve la edge function
const extractFunctionError = async (error: any): Promise<Error> => {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return new Error(body.error);
  } catch { /* cuerpo no JSON */ }
  return error instanceof Error ? error : new Error(String(error?.message ?? error));
};

export function UsersManagement() {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserWithProfile | null>(null);
  // Impacto del borrado (carreras que organiza, inscripciones vinculadas)
  const [deleteImpact, setDeleteImpact] = useState<{ races: string[]; registrations: number } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [userToEdit, setUserToEdit] = useState<UserWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  // Registro de accesos
  const [accesosOk, setAccesosOk] = useState(true);
  const [orden, setOrden] = useState<"registro" | "acceso">("registro");
  const [usuarioAccesos, setUsuarioAccesos] = useState<UserWithProfile | null>(null);
  const [historial, setHistorial] = useState<AccesoUsuario[] | null>(null);
  const [historialError, setHistorialError] = useState<string | null>(null);
  // Turno de la última petición de historial: descarta respuestas tardías,
  // también las de una petición anterior del mismo usuario
  const historialTurno = useRef(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(`
          id,
          first_name,
          last_name,
          phone,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, status");

      if (rolesError) throw rolesError;

      let emailMap: Record<string, string> = {};
      try {
        const { data: usersWithEmails, error: emailsError } = await supabase
          .rpc("get_users_with_emails" as any);

        if (!emailsError && usersWithEmails) {
          (usersWithEmails as Array<{ user_id: string; email: string }>).forEach((u) => {
            emailMap[u.user_id] = u.email;
          });
        }
      } catch {
        console.log("Could not fetch user emails");
      }

      // Último acceso de cada usuario. Si falla, la lista sale igual sin él.
      const accesoMap: Record<string, UltimoAcceso> = {};
      try {
        const { data: ultimos, error: accesosError } = await rpcAccesos("ultimos_accesos");
        if (accesosError) throw accesosError;
        (ultimos as UltimoAcceso[] | null)?.forEach((u) => {
          accesoMap[u.user_id] = u;
        });
        setAccesosOk(true);
      } catch (e) {
        console.error("No se pudo leer el registro de accesos:", e);
        setAccesosOk(false);
      }

      const userList: UserWithProfile[] = (profiles || []).map(profile => {
        const userRoles = roles
          ?.filter(r => r.user_id === profile.id)
          .map(r => {
            if (r.role === "organizer" && r.status !== "approved") {
              return `${r.role} (${r.status})`;
            }
            return r.role;
          }) || [];

        return {
          id: profile.id,
          email: emailMap[profile.id] || "—",
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          created_at: profile.created_at,
          roles: userRoles,
          ultimo_acceso: accesoMap[profile.id]?.ultimo_acceso ?? null,
          accesos: accesoMap[profile.id]?.accesos ?? 0,
        };
      });

      setUsers(userList);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Error",
        description: "Email y contraseña son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          roles: formData.roles,
        },
      });

      if (error) throw await extractFunctionError(error);
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Usuario creado",
        description: `El usuario ${formData.email} ha sido creado correctamente`,
      });

      setShowCreateDialog(false);
      setFormData(initialFormData);
      fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el usuario",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async () => {
    if (!userToEdit) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-user", {
        body: {
          userId: userToEdit.id,
          email: formData.email !== userToEdit.email ? formData.email : undefined,
          password: formData.password || undefined,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          roles: formData.roles,
        },
      });

      if (error) throw await extractFunctionError(error);
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Usuario actualizado",
        description: `El usuario ${formData.email} ha sido actualizado correctamente`,
      });

      setShowEditDialog(false);
      setUserToEdit(null);
      setFormData(initialFormData);
      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el usuario",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Abrir el diálogo de borrado consultando antes qué arrastra el usuario
  const openDeleteDialog = async (user: UserWithProfile) => {
    setDeleteConfirmText("");
    setDeleteImpact(null);
    setUserToDelete(user);
    try {
      const [{ data: races }, { count }] = await Promise.all([
        supabase.from("races").select("name").eq("organizer_id", user.id),
        supabase.from("registrations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setDeleteImpact({
        races: (races ?? []).map((r) => r.name),
        registrations: count ?? 0,
      });
    } catch {
      setDeleteImpact({ races: [], registrations: 0 });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { userId: userToDelete.id, confirm: true },
      });

      if (error) throw await extractFunctionError(error);
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Usuario eliminado",
        description: `El usuario ${userToDelete.email || userToDelete.first_name} ha sido eliminado correctamente`,
      });

      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el usuario",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setUserToDelete(null);
    }
  };

  const openEditDialog = (user: UserWithProfile) => {
    setUserToEdit(user);
    // Extract roles without status
    const userRoles = user.roles.map(r => r.split(" ")[0]);
    setFormData({
      email: user.email !== "—" ? user.email : "",
      password: "",
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      phone: user.phone || "",
      roles: userRoles.length > 0 ? userRoles : ["user"],
    });
    setShowEditDialog(true);
  };

  const openCreateDialog = () => {
    setFormData(initialFormData);
    setShowCreateDialog(true);
  };

  const abrirHistorial = async (user: UserWithProfile) => {
    const turno = ++historialTurno.current;
    setUsuarioAccesos(user);
    setHistorial(null);
    setHistorialError(null);
    try {
      const { data, error } = await rpcAccesos("accesos_usuario", { p_user_id: user.id, p_limite: 100 });
      if (historialTurno.current !== turno) return;
      if (error) throw error;
      setHistorial((data as AccesoUsuario[] | null) ?? []);
    } catch (e) {
      if (historialTurno.current !== turno) return;
      console.error("No se pudo leer el historial de accesos:", e);
      setHistorialError("No se pudo leer el historial de accesos. Prueba otra vez en un momento.");
    }
  };

  const cerrarHistorial = () => {
    historialTurno.current++;
    setUsuarioAccesos(null);
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(searchLower) ||
      user.first_name?.toLowerCase().includes(searchLower) ||
      user.last_name?.toLowerCase().includes(searchLower)
    );
  });

  // Por fecha de alta (como viene) o por último acceso, los que nunca han
  // entrado al final
  const instanteAcceso = (u: UserWithProfile) => (u.ultimo_acceso ? Date.parse(u.ultimo_acceso) : 0);
  const usuariosVisibles =
    orden === "acceso"
      ? [...filteredUsers].sort((a, b) => instanteAcceso(b) - instanteAcceso(a))
      : filteredUsers;

  const nombreDe = (user: UserWithProfile) =>
    user.first_name || user.last_name
      ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
      : null;

  const getRoleBadgeVariant = (role: string) => {
    if (role === "admin") return "destructive";
    if (role.startsWith("organizer")) return "default";
    return "secondary";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestión de Usuarios</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={orden} onValueChange={(v) => setOrden(v as "registro" | "acceso")}>
          <SelectTrigger className="sm:w-[220px]" aria-label="Ordenar usuarios">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="registro">Últimos registrados</SelectItem>
            <SelectItem value="acceso">Último acceso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!accesosOk && (
        <p className="text-sm text-muted-foreground">
          No se pudo leer el registro de accesos: la columna «Último acceso» sale vacía. Pulsa Actualizar para reintentar.
        </p>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Fecha registro</TableHead>
              <TableHead title="Puede ir hasta una hora por detrás: se apunta cuando el navegador renueva la sesión">
                Último acceso
              </TableHead>
              <TableHead className="w-[140px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuariosVisibles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No se encontraron usuarios
                </TableCell>
              </TableRow>
            ) : (
              usuariosVisibles.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{nombreDe(user) ?? "—"}</TableCell>
                  <TableCell>{user.phone || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length > 0 ? (
                        user.roles.map((role, idx) => (
                          <Badge key={idx} variant={getRoleBadgeVariant(role)}>
                            {role}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">sin rol</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString("es-ES")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {!accesosOk ? (
                      "—"
                    ) : user.ultimo_acceso ? (
                      <button
                        type="button"
                        onClick={() => abrirHistorial(user)}
                        title={fechaHoraMadrid(user.ultimo_acceso)}
                        className="text-left hover:underline"
                      >
                        {haceCuanto(user.ultimo_acceso)}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => abrirHistorial(user)}
                        title="Ver accesos"
                        aria-label="Ver accesos"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(user)}
                        title="Editar usuario"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(user)}
                        disabled={user.roles.includes("admin")}
                        title={user.roles.includes("admin") ? "No se puede eliminar un admin" : "Eliminar usuario"}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Total: {usuariosVisibles.length} usuarios
      </p>

      {/* Historial de accesos */}
      <Dialog open={!!usuarioAccesos} onOpenChange={(open) => { if (!open) cerrarHistorial(); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Accesos</DialogTitle>
            <DialogDescription>
              {usuarioAccesos && (
                <>
                  {nombreDe(usuarioAccesos) ? `${nombreDe(usuarioAccesos)} · ` : ""}
                  {usuarioAccesos.email}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {historialError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{historialError}</p>
              <Button variant="outline" size="sm" onClick={() => usuarioAccesos && abrirHistorial(usuarioAccesos)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
            </div>
          ) : historial === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : historial.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {usuarioAccesos?.ultimo_acceso
                ? `No hay inicios de sesión guardados. Último acceso conocido: ${fechaHoraMadrid(usuarioAccesos.ultimo_acceso)}.`
                : "No ha iniciado sesión nunca."}
            </p>
          ) : (
            <ul className="divide-y">
              {historial.map((a, i) => {
                const siguioActivo =
                  Date.parse(a.ultima_actividad) - Date.parse(a.inicio) > 2 * 60_000;
                const ip = textoIp(a);
                return (
                  <li key={`${a.inicio}-${i}`} className="py-3 text-sm space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{fechaHoraMadrid(a.inicio)}</span>
                      {sesionEnUso(a) ? (
                        <Badge variant="secondary">Sesión abierta</Badge>
                      ) : a.abierta ? (
                        <Badge variant="outline" className="text-muted-foreground">Sin cerrar</Badge>
                      ) : null}
                    </div>
                    {a.origen === "historico" ? (
                      <p className="text-muted-foreground">
                        Último inicio de sesión anterior al registro, sin dispositivo ni IP.
                      </p>
                    ) : (
                      <p className="text-muted-foreground" title={a.user_agent ?? undefined}>
                        {describirDispositivo(a.user_agent)}
                        {ip ? ` · ${ip}` : ""}
                      </p>
                    )}
                    {siguioActivo && (
                      <p className="text-muted-foreground">
                        Última actividad: {haceCuanto(a.ultima_actividad)} ({fechaHoraMadrid(a.ultima_actividad)})
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {historial && usuarioAccesos && usuarioAccesos.accesos > historial.length && (
            <p className="text-xs text-muted-foreground">
              Se ven los {historial.length} más recientes de {usuarioAccesos.accesos}.
            </p>
          )}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Se guarda cada inicio de sesión desde el 28 de octubre de 2026.</p>
            <p>
              La actividad se apunta cuando el navegador renueva la sesión, más o menos cada hora
              con Camberas abierto, así que puede ir hasta una hora por detrás.
            </p>
            <p>
              «Sesión abierta»: no se ha cerrado y se ha usado en los últimos {DIAS_SESION_EN_USO} días.
              «Sin cerrar»: no se cerró, pero lleva más tiempo sin usarse; el dispositivo puede haberla
              perdido.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Usuario</DialogTitle>
            <DialogDescription>
              Introduce los datos del nuevo usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="usuario@ejemplo.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña *</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Apellidos</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "user", label: "Usuario" },
                  { value: "organizer", label: "Organizador" },
                  { value: "timer", label: "Cronometrador" },
                  { value: "moto", label: "Motero" },
                  { value: "comisario", label: "Comisario" },
                  { value: "admin", label: "Administrador" },
                ].map((role) => (
                  <label key={role.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.roles.includes(role.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, roles: [...formData.roles, role.value] });
                        } else {
                          setFormData({ ...formData, roles: formData.roles.filter(r => r !== role.value) });
                        }
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm">{role.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Usuario"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica los datos del usuario. Deja la contraseña vacía para no cambiarla.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                autoComplete="off"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-password">Nueva Contraseña</Label>
              <Input
                id="edit-password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Dejar vacío para no cambiar"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-firstName">Nombre</Label>
                <Input
                  id="edit-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-lastName">Apellidos</Label>
                <Input
                  id="edit-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Teléfono</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "user", label: "Usuario" },
                  { value: "organizer", label: "Organizador" },
                  { value: "timer", label: "Cronometrador" },
                  { value: "moto", label: "Motero" },
                  { value: "comisario", label: "Comisario" },
                  { value: "admin", label: "Administrador" },
                ].map((role) => (
                  <label key={role.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.roles.includes(role.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, roles: [...formData.roles, role.value] });
                        } else {
                          setFormData({ ...formData, roles: formData.roles.filter(r => r !== role.value) });
                        }
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm">{role.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleEditUser} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Vas a eliminar permanentemente a{" "}
                  <strong>{userToDelete?.email !== "—" ? userToDelete?.email : `${userToDelete?.first_name} ${userToDelete?.last_name}`}</strong>{" "}
                  y sus datos asociados (perfil, roles, conversaciones, planes de entrenamiento).
                </p>

                {deleteImpact === null ? (
                  <p className="text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Comprobando qué datos dependen de este usuario...
                  </p>
                ) : (
                  <>
                    {deleteImpact.races.length > 0 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                        <p className="font-semibold">⚠️ Organiza {deleteImpact.races.length} carrera{deleteImpact.races.length > 1 ? "s" : ""}:</p>
                        <ul className="list-disc pl-5 mt-1">
                          {deleteImpact.races.map((name) => <li key={name}>{name}</li>)}
                        </ul>
                        <p className="mt-2 text-sm">
                          Las carreras <strong>no se borrarán</strong>: quedarán sin organizador y podrás reasignarlas.
                        </p>
                      </div>
                    )}
                    {deleteImpact.registrations > 0 && (
                      <p className="text-sm">
                        Tiene <strong>{deleteImpact.registrations}</strong> inscripción(es) vinculadas a su cuenta.
                      </p>
                    )}
                  </>
                )}

                <div className="space-y-1 pt-1">
                  <Label htmlFor="delete-confirm">
                    Escribe <strong>ELIMINAR</strong> para confirmar
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting || deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
