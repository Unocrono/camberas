import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Users, Search } from "lucide-react";

// Equipos y clubes registrados en la plataforma — visibilidad comercial:
// cuántos clubes hay, de qué tamaño y cuáles llegan a inscribir.
//
// "Capitán" NO es un rol: se es capitán por tener un equipo. Esta vista
// lee el hecho (teams.captain_user_id), no una etiqueta puesta en el alta
// —que mentiría, porque el capitán suele ser un corredor con cuenta vieja.

// Tablas nuevas aún sin tipos generados en algunos entornos
const db = supabase as any;

interface TeamRow {
  id: string;
  name: string;
  captain_user_id: string;
  created_at: string;
  captainName: string;
  captainEmail: string;
  members: number;
  linkedMembers: number;
  registrations: number;
}

export function TeamsManagement() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data: teamsData, error } = await db
        .from("teams")
        .select("id, name, captain_user_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (teamsData ?? []) as any[];
      if (rows.length === 0) {
        setTeams([]);
        return;
      }

      // Los capitanes, los componentes y las inscripciones en tres
      // consultas, no una por equipo (el recuento se hace aquí)
      const captainIds = [...new Set(rows.map((t) => t.captain_user_id))];
      const teamIds = rows.map((t) => t.id);

      const [{ data: profiles }, { data: members }, { data: regs }] = await Promise.all([
        db.from("profiles").select("id, first_name, last_name, email").in("id", captainIds),
        db.from("team_members").select("team_id, user_id").in("team_id", teamIds),
        db.from("registrations").select("team_id, status").in("team_id", teamIds),
      ]);

      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      setTeams(
        rows.map((t) => {
          const p: any = profileById.get(t.captain_user_id);
          const propios = (members ?? []).filter((m: any) => m.team_id === t.id);
          return {
            ...t,
            captainName: p
              ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"
              : "(cuenta borrada)",
            captainEmail: p?.email ?? "—",
            members: propios.length,
            linkedMembers: propios.filter((m: any) => m.user_id).length,
            registrations: (regs ?? []).filter(
              (r: any) => r.team_id === t.id && r.status !== "cancelled",
            ).length,
          };
        }),
      );
    } catch (error: any) {
      toast({
        title: "Error al cargar los equipos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.captainName.toLowerCase().includes(q) ||
        t.captainEmail.toLowerCase().includes(q),
    );
  }, [teams, search]);

  const totales = useMemo(
    () => ({
      equipos: teams.length,
      componentes: teams.reduce((s, t) => s + t.members, 0),
      activos: teams.filter((t) => t.registrations > 0).length,
    }),
    [teams],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Equipos y clubes</h2>
        <p className="text-muted-foreground">
          Equipos creados por los capitanes. Se crean solos desde /equipo: basta con
          tener cuenta, no hay aprobación.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Equipos</CardDescription>
            <CardTitle className="text-3xl">{totales.equipos}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Componentes en total</CardDescription>
            <CardTitle className="text-3xl">{totales.componentes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Con alguna inscripción</CardDescription>
            <CardTitle className="text-3xl">{totales.activos}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Listado
          </CardTitle>
          <CardDescription>
            "Vinculados" son los componentes que tienen cuenta de Camberas; del resto
            responde su capitán.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por equipo, capitán o email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              {teams.length === 0
                ? "Todavía no hay ningún equipo creado."
                : "Ningún equipo coincide con la búsqueda."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Capitán</TableHead>
                    <TableHead className="text-right">Componentes</TableHead>
                    <TableHead className="text-right">Vinculados</TableHead>
                    <TableHead className="text-right">Inscripciones</TableHead>
                    <TableHead>Creado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <div>{t.captainName}</div>
                          <div className="text-xs text-muted-foreground">{t.captainEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{t.members}</TableCell>
                      <TableCell className="text-right">{t.linkedMembers}</TableCell>
                      <TableCell className="text-right">
                        {t.registrations > 0 ? (
                          <Badge>{t.registrations}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("es-ES")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
